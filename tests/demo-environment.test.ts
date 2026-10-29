import { InputError } from '../server/validation/input';
import { CommunicationError } from '../server/services/whatsappService';
import 'express-async-errors';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import express from 'express';
import crypto from 'node:crypto';
import { communicationRouter } from '../server/routes/communicationRoutes';
import { communicationRepository } from '../server/repositories/communicationRepository';
import { whatsAppService } from '../server/services/whatsappService';
import { authRouter } from '../server/routes/authRoutes';
import { migrationRouter } from '../server/routes/migrationRoutes';
import { userRepository } from '../server/db/userRepository';
import { sessionStore } from '../server/auth/sessionStore';
import { db } from '../server/db/connection';
import { isLocalDemoEnvironment } from '../server/auth/demoEnvironment';

await db.ready;
const app = express();
app.use(express.json({ verify: (req: any, _res, buffer) => { req.rawBody = Buffer.from(buffer); } }));
// Fixture authenticated at the router boundary; no database is contacted.
app.use((req: any, _res, next) => {
  req.user = { id: crypto.randomUUID(), fullName: 'Admin Test', email: 'admin@example.invalid', role: 'admin' };
  next();
});
app.use('/auth', authRouter);
app.use('/migration', migrationRouter);
app.use('/communication', communicationRouter);
app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: err.message }));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.on('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
after(() => { server.closeAllConnections(); server.close(); });

async function inEnvironment(environment: string | undefined, database: string | undefined, run: () => Promise<void>) {
  const previous = { environment: process.env.NODE_ENV, database: process.env.DATABASE_URL };
  if (environment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = environment;
  if (database === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = database;
  try { await run(); }
  finally {
    if (previous.environment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.environment;
    if (previous.database === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.database;
  }
}

for (const environment of [undefined, 'development', 'test', 'staging', 'production']) {
  test(`banco configurado bloqueia credenciais, tokens, simulador e importação (${environment ?? 'unset'})`, async () => {
    const originalLookup = userRepository.findByEmail;
    const originalIssue = sessionStore.createSession;
    let lookups = 0; let sessions = 0;
    userRepository.findByEmail = async () => { lookups++; throw new Error('Unexpected user lookup'); };
    sessionStore.createSession = async () => { sessions++; throw new Error('Unexpected session creation'); };
    const id = crypto.randomUUID();
    try {
      await inEnvironment(environment, 'postgresql://invalid.example.invalid/never_connected', async () => {
        const credentials = await fetch(base + '/auth/dev-credentials');
        assert.equal(credentials.status, 404);
        assert.equal('defaultPassword' in await credentials.json(), false);
        for (const [path, body, status] of [
          ['/auth/recover-password', { email: 'user@example.invalid' }, 503],
          ['/auth/switch-role', { targetEmail: 'user@example.invalid' }, 403],
          ['/migration/import-local-storage', { clients: [{ id, companyName: 'Blocked' }] }, 501],
        ] as const) {
          const response = await fetch(base + path, { method: 'POST',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          assert.equal(response.status, status);
          const result = await response.json();
          assert.equal('devResetToken' in result, false);
          assert.equal('token' in result, false);
          assert.notEqual(result.success, true);
        }
        assert.equal(db.clients.has(id), false);
        assert.equal(lookups, 0);
        assert.equal(sessions, 0);
      });
    } finally { userRepository.findByEmail = originalLookup; sessionStore.createSession = originalIssue; }
  });
}

test('demonstração sem banco preserva credenciais locais; ambiente desconhecido fecha acesso', async () => {
  for (const environment of [undefined, 'development', 'test']) {
    await inEnvironment(environment, undefined, async () => {
      assert.equal(isLocalDemoEnvironment(), true);
      const response = await fetch(base + '/auth/dev-credentials');
      assert.equal(response.status, 200);
      assert.equal(typeof (await response.json()).defaultPassword, 'string');
    });
  }
  for (const environment of ['staging', 'production', '']) {
    await inEnvironment(environment, undefined, async () => {
      assert.equal(isLocalDemoEnvironment(), false);
      assert.equal((await fetch(base + '/auth/dev-credentials')).status, 404);
    });
  }
});


test('comunicação não simula conexão, QR ou confirmação financeira fora da demonstração local', async () => {
  const originalFind = communicationRepository.findChannelById;
  const originalSave = communicationRepository.saveChannel;
  const originalTemplate = whatsAppService.sendDownpaymentConfirmedTemplate;
  let writes = 0; let sends = 0;
  const channel = { id: 'test-channel', status: 'disconnected', phoneNumber: '000' } as any;
  communicationRepository.findChannelById = async () => ({ ...channel });
  communicationRepository.saveChannel = async (value) => { writes++; return value; };
  whatsAppService.sendDownpaymentConfirmedTemplate = async () => { sends++; throw new Error('Unexpected send'); };
  try {
    for (const environment of [undefined, 'development', 'test', 'staging', 'production']) {
      for (const database of ['postgresql://invalid.example.invalid/never_connected', undefined]) {
        if (!database && [undefined, 'development', 'test'].includes(environment)) continue;
        await inEnvironment(environment, database, async () => {
          const qr = await fetch(base + '/communication/channels/test-channel/qr');
          assert.equal(qr.status, 503);
          assert.equal('qrCode' in await qr.json(), false);
          assert.equal((await fetch(base + '/communication/channels/test-channel/reconnect', { method: 'POST' })).status, 501);
          const template = await fetch(base + '/communication/send-template', { method: 'POST',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
              templateType: 'downpayment_confirmed', clientPhone: '000', clientName: 'Test', voucherNumber: 'inventado',
            }) });
          assert.equal(template.status, 501);
          assert.notEqual((await template.json()).success, true);
        });
      }
    }
    assert.equal(writes, 0);
    assert.equal(sends, 0);
    await inEnvironment('development', undefined, async () => {
      const qr = await fetch(base + '/communication/channels/test-channel/qr');
      assert.equal(qr.status, 200);
      assert.match((await qr.json()).qrCode, /^data:image/);
    });
  } finally {
    communicationRepository.findChannelById = originalFind;
    communicationRepository.saveChannel = originalSave;
    whatsAppService.sendDownpaymentConfirmedTemplate = originalTemplate;
  }
});

test('listagem de canais não expõe configuração interna ou QR de pareamento', async () => {
  const original = communicationRepository.findAllChannels;
  communicationRepository.findAllChannels = async () => [{ id: 'channel-test', provider: 'wa_akg', channelName: 'Canal',
    phoneNumber: '000', status: 'disconnected', isActive: true, createdAt: '', updatedAt: '',
    config: { apiKey: 'private-fixture', nested: { token: 'private-fixture' } }, qrCode: 'private-pairing-fixture' }];
  try {
    const response = await fetch(base + '/communication/channels');
    assert.equal(response.status, 200);
    const channels = await response.json();
    assert.equal(channels[0].id, 'channel-test');
    assert.equal('config' in channels[0], false);
    assert.equal('qrCode' in channels[0], false);
    assert.equal(JSON.stringify(channels).includes('private-'), false);
  } finally { communicationRepository.findAllChannels = original; }
});

test('rota de envio oculta falha interna e preserva status de validação', async () => {
  const original = whatsAppService.sendMessage;
  const request = () => fetch(base + '/communication/conversations/conversation/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: 'texto' }),
  });
  try {
    whatsAppService.sendMessage = async () => { throw new Error('private-database-credential'); };
    const response = await request();
    assert.equal(response.status, 500);
    assert.equal((await response.text()).includes('private-database-credential'), false);
    for (const error of [new InputError('Texto inválido.'), new CommunicationError('Canal indisponível.', 503), new CommunicationError('Conversa ausente.', 404)]) {
      whatsAppService.sendMessage = async () => { throw error; };
      assert.equal((await request()).status, error.status);
    }
  } finally { whatsAppService.sendMessage = original; }
});


test('webhooks operacionais exigem canal explícito e conferem provedor/telefone Meta', async () => {
  const variables = ['WA_AKG_CHANNEL_ID', 'META_WA_CHANNEL_ID', 'META_WA_PHONE_NUMBER_ID', 'WA_AKG_WEBHOOK_SECRET', 'META_WA_APP_SECRET'];
  const previous = Object.fromEntries(variables.map((key) => [key, process.env[key]]));
  const originalFind = communicationRepository.findChannelById;
  const originalHandle = whatsAppService.handleInboundMessage;
  const received: any[] = [];
  let provider = 'wa_akg';
  communicationRepository.findChannelById = async (id) => ({ id, provider, isActive: true } as any);
  whatsAppService.handleInboundMessage = async (input) => { received.push(input); return { id: 'saved' } as any; };
  process.env.WA_AKG_WEBHOOK_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.META_WA_APP_SECRET = crypto.randomBytes(32).toString('hex');
  const requestWa = (payload: any) => fetch(base + '/communication/webhooks/wa-akg', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': process.env.WA_AKG_WEBHOOK_SECRET! }, body: JSON.stringify(payload) });
  try {
    await inEnvironment('production', 'postgresql://invalid.example.invalid/never_connected', async () => {
      delete process.env.WA_AKG_CHANNEL_ID;
      const payload = { from: '000', text: 'Mensagem', id: 'external-test' };
      assert.equal((await requestWa(payload)).status, 503);
      assert.equal(received.length, 0);
      process.env.WA_AKG_CHANNEL_ID = crypto.randomUUID();
      assert.equal((await requestWa({ from: '000', text: 'Mensagem' })).status, 400);
      assert.equal((await requestWa(payload)).status, 200);
      assert.equal(received[0].channelId, process.env.WA_AKG_CHANNEL_ID);
      provider = 'meta_cloud';
      assert.equal((await requestWa(payload)).status, 503);
      process.env.META_WA_CHANNEL_ID = crypto.randomUUID();
      process.env.META_WA_PHONE_NUMBER_ID = 'phone-id-test';
      const requestMeta = async (phone: string) => {
        const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: {
          metadata: { phone_number_id: phone }, messages: [{ id: 'meta-external', from: '000', text: { body: 'Meta' } }],
        } }] }] });
        const signature = crypto.createHmac('sha256', process.env.META_WA_APP_SECRET!).update(body).digest('hex');
        return fetch(base + '/communication/webhooks/meta', { method: 'POST', body,
          headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': `sha256=${signature}` } });
      };
      assert.equal((await requestMeta('another-phone')).status, 400);
      assert.equal(received.length, 1);
      assert.equal((await requestMeta('phone-id-test')).status, 200);
      assert.equal(received[1].channelId, process.env.META_WA_CHANNEL_ID);
    });
  } finally {
    communicationRepository.findChannelById = originalFind;
    whatsAppService.handleInboundMessage = originalHandle;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('envio operacional exige chave e usa identidade autenticada para deduplicação', async () => {
  const original = whatsAppService.sendMessage;
  const received: any[] = [];
  whatsAppService.sendMessage = async (options) => { received.push(options); return { id: 'pending', status: 'pending' } as any; };
  try {
    await inEnvironment('production', 'postgresql://invalid.example.invalid/never_connected', async () => {
      const request = (key?: string) => fetch(base + '/communication/conversations/test/messages', { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
        body: JSON.stringify({ body: 'Texto', actorId: 'forged', actorRole: 'forged' }) });
      assert.equal((await request()).status, 400); assert.equal(received.length, 0);
      const key = crypto.randomUUID(); assert.equal((await request(key)).status, 201);
      assert.equal(received[0].idempotencyKey, key);
      assert.notEqual(received[0].actorId, 'forged'); assert.equal(received[0].actorRole, 'admin');
    });
  } finally { whatsAppService.sendMessage = original; }
});
