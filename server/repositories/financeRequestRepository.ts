import { query } from '../db/index';
import { db } from '../db/connection';
export interface FinanceRequestReceipt { fingerprint: string; entityId: string }
const eventType = 'FINANCE_MANUAL_CREATED';
// Completed command receipt, not a pending outbox task; survives deletion of its title.
export const financeRequestRepository = {
  async find(id: string): Promise<FinanceRequestReceipt | undefined> {
    await db.ready;
    if (db.isConnected()) {
      const result = await query('SELECT payload FROM core.event_log WHERE id=$1 AND event_type=$2', [id, eventType]);
      if (!result.rows[0]) return undefined;
      const receipt = result.rows[0].payload;
      if (typeof receipt?.fingerprint !== 'string' || typeof receipt?.entityId !== 'string') throw new Error('Registro de repetição inválido.');
      return receipt;
    }
    if (process.env.DATABASE_URL || process.env.NODE_ENV === 'production') throw new Error('PostgreSQL indisponível.');
    return db.financeRequests.get(id);
  },
  async save(id: string, receipt: FinanceRequestReceipt): Promise<void> {
    await db.ready;
    if (db.isConnected()) {
      await query(`INSERT INTO core.event_log(id,event_type,payload,status,processed_at)
        VALUES($1,$2,$3::jsonb,'completed',NOW())`, [id, eventType, JSON.stringify(receipt)]);
    } else {
      if (process.env.DATABASE_URL || process.env.NODE_ENV === 'production') throw new Error('PostgreSQL indisponível.');
      if (db.financeRequests.has(id)) throw new Error('Registro de repetição já existente.');
      db.financeRequests.set(id, receipt);
    }
  },
};
