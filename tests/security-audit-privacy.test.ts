import 'express-async-errors';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import crypto from 'node:crypto';
import { requireAuth, requireRole } from '../server/auth/rbac';
import { auditService } from '../server/services/auditService';
import { InMemoryRateLimiter } from '../server/middleware/rateLimiter';
import { securityRequestContext } from '../server/observability/requestContext';

test('auditoria 401/403 usa template sem registrar parâmetro, query, body ou credenciais', async () => {
  const secret = 'private-token-password-personal-data'; const events: any[] = []; const original = auditService.log;
  auditService.log = async (event) => { events.push(event); return event as any; };
  const app = express(); app.use(express.json());
  app.post('/unauth/:id', requireAuth, (_req, res) => res.json({ ok: true }));
  app.post('/role/:id', (req: any, _res, next) => { req.user = { id: crypto.randomUUID(), fullName: 'Test', role: 'vendedor' }; next(); },
    requireRole(['admin']), (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.on('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    for (const [route, expected] of [['unauth', 401], ['role', 403]] as const) {
      const response = await fetch(`${base}/${route}/${secret}?token=${secret}`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}`, Cookie: `private=${secret}` }, body: JSON.stringify({ password: secret }) });
      assert.equal(response.status, expected); assert.equal((await response.text()).includes(secret), false);
    }
    assert.equal(events.length, 2); assert.equal(JSON.stringify(events).includes(secret), false);
    assert.equal(events[0].entityId, '/unauth/:id'); assert.equal(events[1].entityId, '/role/:id');
    assert.match(events[0].notes, /POST \/unauth\/:id/);
    assert.equal(securityRequestContext({ method: 'CUSTOM', originalUrl: secret, path: secret } as any).route, 'protected-resource');
    assert.equal(securityRequestContext({ method: secret } as any).method, 'OTHER');
  } finally { server.closeAllConnections(); server.close(); auditService.log = original; }
});

test('rate limit não é contornado por caixa, parâmetro ou query e não grava caminho recebido', async () => {
  const secret = 'private-rate-limit-secret'; const events: any[] = []; const original = auditService.log;
  auditService.log = async (event) => { events.push(event); return event as any; };
  const app = express(); const limiter = new InMemoryRateLimiter({ windowMs: 60000, maxRequests: 1, message: 'Limited' });
  app.post('/login/:id', limiter.middleware(), (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.on('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    assert.equal((await fetch(base + '/login/first', { method: 'POST' })).status, 200);
    const blocked = await fetch(`${base}/LoGiN/${secret}?token=${secret}`, { method: 'POST' });
    assert.equal(blocked.status, 429); assert.ok(Number(blocked.headers.get('Retry-After')) > 0);
    assert.equal((await fetch(base + '/LOGIN/another', { method: 'POST' })).status, 429);
    assert.equal(events.length, 2); assert.equal(JSON.stringify(events).includes(secret), false);
    assert.match(events[0].notes, /POST \/login\/:id/);
  } finally { server.closeAllConnections(); server.close(); auditService.log = original; }
});
