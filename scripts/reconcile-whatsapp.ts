import 'dotenv/config';
import { pool } from '../server/db/index';
import { reconcileWhatsAppMessage } from '../server/services/whatsappReconciliationService';
import { InputError } from '../server/validation/input';
try {
  await reconcileWhatsAppMessage({ messageId: process.env.ERP_WA_MESSAGE_ID, status: process.env.ERP_WA_STATUS,
    externalId: process.env.ERP_WA_EXTERNAL_ID, operator: process.env.ERP_WA_OPERATOR,
    reason: process.env.ERP_WA_REASON, evidence: process.env.ERP_WA_EVIDENCE });
  console.log('Reconciliação concluída. Nenhuma mensagem foi transmitida.');
} catch (error) {
  const known = error instanceof InputError || (error instanceof Error && error.message.startsWith('DATABASE_URL obrigatória.'));
  console.error(known ? (error as Error).message : 'Falha na reconciliação. A operação não foi confirmada.');
  process.exitCode = 1;
} finally { await pool.end(); }
