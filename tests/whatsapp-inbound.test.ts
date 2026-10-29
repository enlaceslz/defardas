import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import { WhatsAppService } from '../server/services/whatsappService';
import { db } from '../server/db/connection';
import { auditService } from '../server/services/auditService';
import { communicationRepository } from '../server/repositories/communicationRepository';

await db.ready;
async function channel() {
  const id = crypto.randomUUID();
  await communicationRepository.saveChannel({ id, provider: 'wa_akg', channelName: 'Test', phoneNumber: '000',
    status: 'connected', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  return id;
}
const payload = (channelId: string) => ({ channelId, fromPhone: '000123456', fromName: 'Contato Teste',
  body: 'Mensagem recebida', externalId: crypto.randomUUID() });

test('webhooks concorrentes repetidos gravam uma mensagem e incrementam não lidas uma vez', async () => {
  const input = payload(await channel());
  const responses = await Promise.all(Array.from({ length: 8 }, () => new WhatsAppService().handleInboundMessage(input)));
  assert.equal(new Set(responses.map((response) => response.id)).size, 1);
  const conversation = await communicationRepository.findConversationById(responses[0].conversationId);
  assert.equal(conversation?.unreadCount, 1);
  assert.equal((await communicationRepository.findMessagesByConversation(conversation!.id)).length, 1);
  assert.equal((await auditService.getRecentLogs(500, 'communication.messages', responses[0].id)).length, 1);
});

test('mesmo telefone e identificador externo são segregados entre canais', async () => {
  const input = payload(await channel());
  const first = await new WhatsAppService().handleInboundMessage(input);
  const second = await new WhatsAppService().handleInboundMessage({ ...input, channelId: await channel() });
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.conversationId, second.conversationId);
});

test('falha de auditoria reverte conversa, mensagem e contador; reentrega consegue concluir', async () => {
  const input = payload(await channel());
  const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Injected audit failure'); };
    await assert.rejects(new WhatsAppService().handleInboundMessage(input), /Injected/);
  } finally { auditService.log = original; }
  assert.equal(await communicationRepository.findConversationByRemoteJid('000123456@s.whatsapp.net', input.channelId), null);
  assert.equal(await communicationRepository.findInboundByExternalId(input.channelId, input.externalId), null);
  const saved = await new WhatsAppService().handleInboundMessage(input);
  const originalSave = communicationRepository.saveMessage;
  try {
    communicationRepository.saveMessage = async () => { throw new Error('Injected message failure'); };
    await assert.rejects(new WhatsAppService().handleInboundMessage({ ...input, externalId: crypto.randomUUID() }), /Injected/);
  } finally { communicationRepository.saveMessage = originalSave; }
  assert.equal((await communicationRepository.findConversationById(saved.conversationId))?.unreadCount, 1);
});

test('recepção rejeita mensagem sem identificador externo antes de alterar memória', async () => {
  const input = payload(await channel());
  await assert.rejects(new WhatsAppService().handleInboundMessage({ ...input, externalId: undefined }), /Identificador externo/);
  assert.equal(await communicationRepository.findConversationByRemoteJid('000123456@s.whatsapp.net', input.channelId), null);
});
