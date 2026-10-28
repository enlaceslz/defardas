import 'express-async-errors';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import { csrfProtection } from '../server/middleware/csrf';
import { verifyMetaWebhook, verifyWaAkgWebhook, type RawBodyRequest } from '../server/middleware/webhookAuth';
import { InMemoryRateLimiter } from '../server/middleware/rateLimiter';
import { authMiddleware, requireAuth, requirePermission } from '../server/auth/rbac';
import { sessionStore } from '../server/auth/sessionStore';
import { quotesRouter } from '../server/routes/quotesRoutes';
import { ordersRouter } from '../server/routes/ordersRoutes';
import { spawnSync } from 'node:child_process';

const app = express();
app.use(express.json({ verify: (req: RawBodyRequest, _res, buffer) => { req.rawBody = Buffer.from(buffer); } }));
app.use(cookieParser());
app.use('/api', csrfProtection, authMiddleware);
app.post('/api/auth/login', (_req, res) => res.sendStatus(204));
app.post('/api/auth/login-extra', (_req, res) => res.sendStatus(204));
app.post('/api/leads', (_req, res) => res.sendStatus(204));
app.post('/api/communication/webhooks/meta', verifyMetaWebhook, (_req, res) => res.sendStatus(204));
app.post('/api/communication/webhooks/wa-akg', verifyWaAkgWebhook, (_req, res) => res.sendStatus(204));
app.get('/api/private', requireAuth, (_req, res) => res.sendStatus(204));
app.get('/api/unknown-permission', requirePermission('missing:permission'), (_req, res) => res.sendStatus(204));
app.use('/api/quotes', quotesRouter);
app.use('/api/orders', ordersRouter);
app.get('/limited', new InMemoryRateLimiter({ maxRequests: 1, windowMs: 60000, message: 'Limited' }).middleware(), (_req, res) => res.sendStatus(204));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.on('listening', resolve));
const address = server.address() as { port: number };
const base = `http://127.0.0.1:${address.port}`;
after(() => { server.closeAllConnections(); server.close(); });
const csrf = 'a'.repeat(64);
const actor = (role: any) => ({ id: crypto.randomUUID(), fullName: 'Test', email: 'test@example.invalid', role });
async function authHeaders(role: any) {
  const session = await sessionStore.createSession(actor(role));
  return { Authorization: `Bearer ${session.token}`, Cookie: `defardas_csrf_token=${csrf}`, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' };
}

test('login e captura pública funcionam com CSRF montado em /api', async () => {
  for (const path of ['/api/auth/login', '/api/leads']) {
    assert.equal((await fetch(base + path, { method: 'POST' })).status, 204);
  }
});
test('prefixo semelhante não herda isenção CSRF', async () => {
  assert.equal((await fetch(base + '/api/auth/login-extra', { method: 'POST' })).status, 403);
});
test('mutação privada exige correspondência de cookie e cabeçalho CSRF', async () => {
  const headers = await authHeaders('admin');
  headers['X-CSRF-Token'] = 'b'.repeat(64);
  assert.equal((await fetch(base + '/api/quotes', { method: 'POST', headers, body: '{}' })).status, 403);
});
test('cabeçalhos de perfil não autenticam usuário', async () => {
  assert.equal((await fetch(base + '/api/private', { headers: { 'x-user-role': 'admin' } })).status, 401);
});
test('permissão desconhecida é negada inclusive a administrador', async () => {
  assert.equal((await fetch(base + '/api/unknown-permission', { headers: await authHeaders('admin') })).status, 403);
});
test('financeiro não cria, altera ou converte propostas nem aprova arte', async () => {
  const headers = await authHeaders('financeiro');
  for (const [path, method] of [['/api/quotes', 'POST'], ['/api/quotes/x/status', 'PATCH'], ['/api/quotes/x/convert-to-order', 'POST'], ['/api/orders/x/approve-art', 'POST']]) {
    assert.equal((await fetch(base + path, { method, headers, body: '{}' })).status, 403);
  }
});
test('gate fabril rejeita corte antes de sinal confirmado', async () => {
  const response = await fetch(base + '/api/orders/op1111111-1111-1111-1111-111111111111/advance-stage', {
    method: 'POST', headers: await authHeaders('pcp_producao'), body: JSON.stringify({ targetStage: 'corte' }),
  });
  assert.equal(response.status, 422);
});
test('etapas arbitrárias são rejeitadas', async () => {
  assert.equal((await fetch(base + '/api/orders/op1111111-1111-1111-1111-111111111111/advance-stage', {
    method: 'POST', headers: await authHeaders('pcp_producao'), body: JSON.stringify({ targetStage: 'invalida' }),
  })).status, 400);
});
test('logout invalida a sessão', async () => {
  const session = await sessionStore.createSession(actor('admin'));
  assert.ok(await sessionStore.getSession(session.token));
  await sessionStore.destroySession(session.token);
  assert.equal(await sessionStore.getSession(session.token), null);
});
test('assinatura Meta é conferida sobre bytes originais', async () => {
  process.env.META_WA_APP_SECRET = 'test-secret';
  const body = '{ "object": "whatsapp_business_account" }';
  const request = (signature: string) => fetch(base + '/api/communication/webhooks/meta', { method: 'POST', body,
    headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature } });
  assert.equal((await request('sha256=invalid')).status, 401);
  const signature = crypto.createHmac('sha256', 'test-secret').update(body).digest('hex');
  assert.equal((await request(`sha256=${signature}`)).status, 204);
});
test('WA-AKG não aceita webhook sem segredo configurado ou com segredo errado', async () => {
  delete process.env.WA_AKG_WEBHOOK_SECRET;
  assert.equal((await fetch(base + '/api/communication/webhooks/wa-akg', { method: 'POST' })).status, 503);
  process.env.WA_AKG_WEBHOOK_SECRET = 'test-secret';
  assert.equal((await fetch(base + '/api/communication/webhooks/wa-akg', { method: 'POST' })).status, 401);
});
test('X-Forwarded-For forjado não contorna limite por IP', async () => {
  assert.equal((await fetch(base + '/limited', { headers: { 'X-Forwarded-For': '1.1.1.1' } })).status, 204);
  assert.equal((await fetch(base + '/limited', { headers: { 'X-Forwarded-For': '2.2.2.2' } })).status, 429);
});
test('produção falha ao iniciar sem DATABASE_URL', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'server.ts'], {
    env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: '' }, encoding: 'utf8', timeout: 15000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_URL obrigatória/);
});

test('produção não confirma escrita em memória quando PostgreSQL falha', async () => {
  const { db: manager } = await import('../server/db/connection');
  const { db: drizzle } = await import('../server/db/index');
  const { orderRepository } = await import('../server/repositories/orderRepository');
  const originalConnected = manager.isConnected;
  const originalInsert = drizzle.insert;
  const originalEnv = process.env.NODE_ENV;
  await manager.ready;
  const order = structuredClone(manager.orders.values().next().value!);
  const newId = crypto.randomUUID();
  order.id = newId;
  try {
    process.env.NODE_ENV = 'production';
    manager.isConnected = () => true;
    drizzle.insert = (() => { throw new Error('simulated database outage'); }) as any;
    await assert.rejects(orderRepository.save(order), /simulated database outage/);
    assert.equal(manager.orders.has(newId), false);
  } finally {
    process.env.NODE_ENV = originalEnv;
    manager.isConnected = originalConnected;
    drizzle.insert = originalInsert;
  }
});

test('sessão persistente só é emitida se INSERT no PostgreSQL concluir', async () => {
  const { pool } = await import('../server/db/index');
  const originalQuery = pool.query;
  const originalEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    pool.query = (async () => { throw new Error('session storage unavailable'); }) as any;
    await assert.rejects(sessionStore.createSession(actor('admin')), /session storage unavailable/);
  } finally {
    process.env.NODE_ENV = originalEnv;
    pool.query = originalQuery;
  }
});
