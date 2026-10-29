import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WhatsAppService, CommunicationError } from '../server/services/whatsappService';
import { communicationRepository as repository } from '../server/repositories/communicationRepository';
import { auditService } from '../server/services/auditService';
import { InputError } from '../server/validation/input';

async function fixture(run: (context: any) => Promise<void>) {
  const originals = { findConversationById: repository.findConversationById, findChannelById: repository.findChannelById,
    saveMessage: repository.saveMessage, saveConversation: repository.saveConversation, log: auditService.log, fetch: globalThis.fetch };
  const previousKey = process.env.WA_AKG_API_KEY;
  process.env.WA_AKG_API_KEY = 'test-only-runtime-key';
  const context = { requests: [] as any[], messages: [] as any[], conversations: [] as any[], audits: [] as any[],
    channel: { id: 'channel', provider: 'wa_akg', isActive: true, status: 'connected' } as any };
  repository.findConversationById = async () => ({ id: 'conversation', channelId: 'channel', customerPhone: '000', customerName: 'Teste' } as any);
  repository.findChannelById = async () => context.channel;
  repository.saveMessage = async (message) => { context.messages.push(message); return message; };
  repository.saveConversation = async (conversation) => { context.conversations.push(conversation); return conversation; };
  auditService.log = async (event) => { context.audits.push(event); return event as any; };
  globalThis.fetch = async (url, options) => { context.requests.push({ url, options }); return new Response('{}', { status: 200 }); };
  try { await run(context); }
  finally {
    repository.findConversationById = originals.findConversationById;
    repository.findChannelById = originals.findChannelById;
    repository.saveMessage = originals.saveMessage;
    repository.saveConversation = originals.saveConversation;
    auditService.log = originals.log;
    globalThis.fetch = originals.fetch;
    if (previousKey === undefined) delete process.env.WA_AKG_API_KEY; else process.env.WA_AKG_API_KEY = previousKey;
  }
}

test('envio rejeita corpo inválido e mídia sem transmitir ou gravar', async () => {
  await fixture(async (context) => {
    const service = new WhatsAppService();
    for (const options of [
      { body: {} }, { body: '   ' }, { body: 'x'.repeat(4001) },
      { body: 'texto', mediaUrl: 'https://example.invalid/file' },
      { body: 'texto', mediaMimeType: 'image/png' }, { body: 'texto', messageType: 'image' },
    ]) await assert.rejects(service.sendMessage({ conversationId: 'conversation', ...options } as any), InputError);
    assert.equal(context.requests.length, 0);
    assert.equal(context.messages.length, 0);
    assert.equal(context.conversations.length, 0);
    assert.equal(context.audits.length, 0);
  });
});

test('canal inativo, desconectado ou sem credencial não dispara requisição', async () => {
  await fixture(async (context) => {
    for (const state of [{ isActive: false, status: 'connected' }, { isActive: true, status: 'disconnected' }]) {
      Object.assign(context.channel, state);
      await assert.rejects(new WhatsAppService().sendMessage({ conversationId: 'conversation', body: 'texto' }),
        (error: any) => error instanceof CommunicationError && error.status === 503);
    }
    Object.assign(context.channel, { isActive: true, status: 'connected' });
    delete process.env.WA_AKG_API_KEY;
    await assert.rejects(new WhatsAppService().sendMessage({ conversationId: 'conversation', body: 'texto' }), CommunicationError);
    assert.equal(context.requests.length, 0);
    assert.equal(context.messages.length, 0);
  });
});

test('erro do transporte não vaza segredo no registro nem na auditoria', async () => {
  await fixture(async (context) => {
    globalThis.fetch = async () => { throw new Error('private-credential-and-internal-url'); };
    const message = await new WhatsAppService().sendMessage({ conversationId: 'conversation', body: 'texto' });
    assert.equal(message.status, 'failed');
    assert.match(message.errorMessage!, /Envio não confirmado/);
    assert.equal(JSON.stringify([context.messages, context.audits]).includes('private-credential'), false);
    assert.equal(context.audits.at(-1).action, 'WHATSAPP_MESSAGE_FAILED');
    assert.doesNotMatch(context.audits.at(-1).notes, /Mensagem enviada/);
  });
});

test('texto normalizado é o mesmo no provedor e no histórico; rejeição HTTP não vira sucesso', async () => {
  await fixture(async (context) => {
    const service = new WhatsAppService();
    const message = await service.sendMessage({ conversationId: 'conversation', body: '  texto  ' });
    assert.equal(message.body, 'texto');
    assert.equal(message.messageType, 'text');
    assert.equal(message.status, 'sent');
    assert.equal(JSON.parse(context.requests[0].options.body).text, 'texto');
    assert.equal(context.conversations[0].lastMessageText, 'texto');
    globalThis.fetch = async () => new Response('private-provider-error', { status: 401 });
    const rejected = await service.sendMessage({ conversationId: 'conversation', body: 'segundo' });
    assert.equal(rejected.status, 'failed');
    assert.equal(JSON.stringify(rejected).includes('private-provider-error'), false);
  });
});
