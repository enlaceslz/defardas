import { query } from '../db/index';
import { unitOfWork } from '../db/unitOfWork';
import { auditService } from './auditService';
import { InputError, oneOf, text } from '../validation/input';

export interface ReconciliationInput {
  messageId: unknown;
  status: unknown;
  externalId?: unknown;
  operator: unknown;
  reason: unknown;
  evidence: unknown;
}
export function validateReconciliation(input: ReconciliationInput) {
  const messageId = text(input.messageId, 'Mensagem', 36).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(messageId)) throw new InputError('Identificador de mensagem inválido.');
  const status = oneOf(input.status, ['sent', 'failed'] as const, 'Resultado');
  const externalId = text(input.externalId, 'Identificador do provedor', 100, status === 'sent') || undefined;
  if (status === 'failed' && externalId) throw new InputError('Falha não deve informar identificador de aceitação do provedor.');
  return { messageId, status, externalId, operator: text(input.operator, 'Operador', 120),
    reason: text(input.reason, 'Motivo', 500), evidence: text(input.evidence, 'Referência da evidência', 500) };
}

/** Privileged host procedure. Records verified results; never calls a provider or retransmits. */
export async function reconcileWhatsAppMessage(input: ReconciliationInput) {
  const command = validateReconciliation(input);
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatória. Reconciliação exige PostgreSQL.');
  return unitOfWork(async () => {
    const result = await query(`SELECT id,conversation_id,direction,status,external_id,body,created_at
      FROM communication.messages WHERE id=$1 FOR UPDATE`, [command.messageId]);
    const previous = result.rows[0];
    if (!previous || previous.direction !== 'outbound') throw new InputError('Envio não encontrado.');
    if (previous.status === command.status && (previous.external_id || undefined) === command.externalId) {
      return { id: previous.id, status: previous.status, changed: false };
    }
    if (previous.status !== 'pending') throw new InputError('Somente envio pendente pode ser reconciliado.');
    await query(`UPDATE communication.messages SET status=$1,external_id=$2,error_message=$3 WHERE id=$4`,
      [command.status, command.externalId || null, command.status === 'failed' ? 'Falha confirmada por reconciliação operacional.' : null, command.messageId]);
    if (command.status === 'sent') {
      // Não substituir prévia de uma mensagem mais recente, inclusive recebida durante a investigação.
      await query(`UPDATE communication.conversations SET last_message_text=$1,last_message_at=$2,updated_at=NOW()
        WHERE id=$3 AND (last_message_at IS NULL OR last_message_at <= $2)`, [previous.body, previous.created_at, previous.conversation_id]);
    }
    await auditService.log({ actorName: command.operator, actorRole: 'system', entityName: 'communication.messages',
      entityId: command.messageId, action: 'WHATSAPP_RECONCILED',
      oldData: { status: previous.status, externalId: previous.external_id },
      newData: { status: command.status, externalId: command.externalId || null },
      notes: `Motivo: ${command.reason}\nEvidência: ${command.evidence}` });
    return { id: command.messageId, status: command.status, changed: true };
  });
}
