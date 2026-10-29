import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import { WhatsAppService } from '../server/services/whatsappService';
import { communicationRepository as repository } from '../server/repositories/communicationRepository';
import { auditService } from '../server/services/auditService';
import { db } from '../server/db/connection';
await db.ready;
async function fixture(run: (context: any) => Promise<void>) {
  const previousKey = process.env.WA_AKG_API_KEY;
  const originalFetch = globalThis.fetch;
  const originalAudit = auditService.log;
  const channelId = crypto.randomUUID(); const conversationId = crypto.randomUUID();
  const now = new Date().toISOString();
  await repository.saveChannel({ id: channelId, provider: 'wa_akg', channelName: 'Test', phoneNumber: '000',
    status: 'connected', isActive: true, createdAt: now, updatedAt: now });
  await repository.saveConversation({ id: conversationId, channelId, remoteJid: `${conversationId}@test`,
    customerName: 'Test', customerPhone: '000123', status: 'open', unreadCount: 2, createdAt: now, updatedAt: now });
  process.env.WA_AKG_API_KEY = crypto.randomBytes(24).toString('hex');
  const context = { calls: 0, service: new WhatsAppService(), options: { conversationId, body: 'Texto',
    actorId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() } };
  globalThis.fetch = async () => { context.calls++; return new Response('{}', { status: 200 }); };
  try { await run(context); }
  finally {
    globalThis.fetch = originalFetch; auditService.log = originalAudit;
    if (previousKey === undefined) delete process.env.WA_AKG_API_KEY; else process.env.WA_AKG_API_KEY = previousKey;
  }
}

test('envio repetido usa registro existente e chave conflitante retorna 409', async () => {
  await fixture(async (context) => {
    const first = await context.service.sendMessage(context.options);
    const second = await context.service.sendMessage(context.options);
    assert.equal(first.id, second.id); assert.equal(context.calls, 1);
    await assert.rejects(context.service.sendMessage({ ...context.options, body: 'Outro texto' }), (error: any) => error.status === 409);
    assert.equal(context.calls, 1);
    assert.equal((await repository.findMessagesByConversation(first.conversationId)).length, 1);
    assert.equal((await repository.findConversationById(first.conversationId))?.unreadCount, 2);
    const logs = await auditService.getRecentLogs(500, 'communication.messages', first.id);
    assert.equal(logs.length, 2);
  });
});

test('registro pendente confirma antes da rede e não mantém lock durante transporte', async () => {
  await fixture(async (context) => {
    let finish!: () => void; let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    globalThis.fetch = async () => { context.calls++; started(); return new Promise<Response>((resolve) => { finish = () => resolve(new Response('{}')); }); };
    const first = context.service.sendMessage(context.options);
    await startedPromise;
    const repeated = await context.service.sendMessage(context.options);
    assert.equal(repeated.status, 'pending'); assert.equal(context.calls, 1);
    assert.equal((await repository.findMessageById(repeated.id))?.status, 'pending');
    finish(); assert.equal((await first).status, 'sent');
  });
});

test('falha na gravação inicial não transmite; falha final preserva pendente sem retransmitir', async () => {
  await fixture(async (context) => {
    const original = auditService.log;
    auditService.log = async () => { throw new Error('Injected request audit failure'); };
    await assert.rejects(context.service.sendMessage(context.options), /Injected request/);
    assert.equal(context.calls, 0);
    assert.equal((await repository.findMessagesByConversation(context.options.conversationId)).length, 0);
    auditService.log = async (event) => {
      if (event.action === 'SEND_WHATSAPP_MESSAGE') throw new Error('Injected result audit failure');
      return original.call(auditService, event);
    };
    await assert.rejects(context.service.sendMessage(context.options), /Injected result/);
    assert.equal(context.calls, 1);
    auditService.log = original;
    const repeated = await context.service.sendMessage(context.options);
    assert.equal(repeated.status, 'pending'); assert.equal(context.calls, 1);
    assert.equal((await repository.findConversationById(context.options.conversationId))?.lastMessageText, undefined);
  });
});
