import crypto from 'node:crypto';
import { query } from '../db/index';
import type { AuditLogEntity } from '../types/db';

type AuditEvent = Omit<AuditLogEntity, 'id' | 'createdAt'>;
class AuditService {
  private memory: AuditLogEntity[] = [];
  private get persistent() { return Boolean(process.env.DATABASE_URL) || process.env.NODE_ENV === 'production'; }
  public async log(event: AuditEvent): Promise<AuditLogEntity> {
    const entry = { ...event, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    if (this.persistent) {
      // Participa do mesmo cliente transacional dos repositórios quando há UoW.
      await query(`INSERT INTO core.audit_logs
        (id, actor_id, actor_name, actor_role, entity_name, entity_id, action, old_data, new_data, notes, ip_address, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [entry.id, entry.actorId || null,
        entry.actorName.slice(0, 120), entry.actorRole.slice(0, 40), entry.entityName.slice(0, 60), entry.entityId.slice(0, 60),
        entry.action.slice(0, 40), JSON.stringify(entry.oldData ?? null), JSON.stringify(entry.newData ?? null), entry.notes || null,
        entry.ipAddress || null, entry.createdAt]);
    } else {
      this.memory.unshift(entry);
      this.memory = this.memory.slice(0, 500);
    }
    return entry;
  }
  public async getRecentLogs(limit = 50, entityName?: string, entityId?: string): Promise<AuditLogEntity[]> {
    limit = Number.isInteger(limit) ? Math.min(500, Math.max(1, limit)) : 50;
    if (!this.persistent) return this.memory.filter((e) => !entityName || (e.entityName === entityName && e.entityId === entityId)).slice(0, limit);
    const result = await query(`SELECT id, actor_id AS "actorId", actor_name AS "actorName", actor_role AS "actorRole",
      entity_name AS "entityName", entity_id AS "entityId", action, old_data AS "oldData", new_data AS "newData",
      notes, ip_address AS "ipAddress", created_at AS "createdAt" FROM core.audit_logs
      WHERE ($2::text IS NULL OR (entity_name = $2 AND entity_id = $3)) ORDER BY created_at DESC LIMIT $1`, [limit, entityName || null, entityId || null]);
    return result.rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt).toISOString() }));
  }
}
export const auditService = new AuditService();
