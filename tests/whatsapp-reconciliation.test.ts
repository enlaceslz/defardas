import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import { validateReconciliation, reconcileWhatsAppMessage } from '../server/services/whatsappReconciliationService';
const input = () => ({ messageId: crypto.randomUUID(), status: 'sent', externalId: 'provider-id',
  operator: 'Operador Teste', reason: 'Consulta ao provedor', evidence: 'Chamado interno de teste' });

test('reconciliação exige identidade, motivo, evidência e ID real para aceitação', () => {
  for (const update of [{ operator: '' }, { reason: '' }, { evidence: '' }, { externalId: undefined },
    { status: 'delivered' }, { status: 'read' }, { status: 'pending' }, { messageId: 'invalid' }]) {
    assert.throws(() => validateReconciliation({ ...input(), ...update }));
  }
  assert.throws(() => validateReconciliation({ ...input(), status: 'failed' }), /Falha não deve/);
  assert.equal(validateReconciliation({ ...input(), status: 'failed', externalId: undefined }).status, 'failed');
  const value = input(); assert.deepEqual(validateReconciliation(value), value);
});

test('reconciliação nunca confirma alteração em memória sem PostgreSQL', async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try { await assert.rejects(reconcileWhatsAppMessage(input()), /DATABASE_URL obrigatória/); }
  finally { if (previous !== undefined) process.env.DATABASE_URL = previous; }
});
