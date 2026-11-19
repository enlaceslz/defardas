/**
 * DE FARDAS ERP — Audit Service
 * Registra eventos auditáveis de mutações críticas, autorizações e tentativas de bypass
 * com persistência em core.audit_logs (PostgreSQL via Drizzle ORM) e cache resiliente.
 */
import crypto from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db as drizzleDb } from '../db/index';
import { auditLogs } from '../db/schema/audit';
import { AuditLogEntity } from '../types/db';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class AuditService {
  private inMemoryLogs: AuditLogEntity[] = [];

  public log(event: {
    actorId?: string;
    actorName: string;
    actorRole: string;
    entityName: string;
    entityId: string;
    action: string;
    oldData?: any;
    newData?: any;
    notes?: string;
    ipAddress?: string;
  }): AuditLogEntity {
    const entry: AuditLogEntity = {
      id: crypto.randomUUID(),
      actorId: event.actorId,
      actorName: event.actorName,
      actorRole: event.actorRole,
      entityName: event.entityName,
      entityId: event.entityId,
      action: event.action,
      oldData: event.oldData,
      newData: event.newData,
      notes: event.notes,
      ipAddress: event.ipAddress || '127.0.0.1',
      createdAt: new Date().toISOString(),
    };

    this.inMemoryLogs.unshift(entry);
    if (this.inMemoryLogs.length > 500) {
      this.inMemoryLogs.pop();
    }

    // Persistência assíncrona no PostgreSQL (core.audit_logs)
    const validActorUuid = entry.actorId && UUID_REGEX.test(entry.actorId) ? entry.actorId : null;
    drizzleDb
      .insert(auditLogs)
      .values({
        id: entry.id,
        actorId: validActorUuid,
        actorName: entry.actorName.slice(0, 120),
        actorRole: entry.actorRole.slice(0, 40),
        entityName: entry.entityName.slice(0, 60),
        entityId: String(entry.entityId).slice(0, 60),
        action: entry.action.slice(0, 40),
        oldData: entry.oldData ?? null,
        newData: entry.newData ?? null,
        notes: entry.notes ?? null,
        ipAddress: (entry.ipAddress || '127.0.0.1').slice(0, 45),
      })
      .catch(() => {
        // Quando operando em modo resiliente sem PostgreSQL ativo, mantém no buffer local
      });

    console.log(`[AUDIT] [${entry.action}] [${entry.entityName}:${entry.entityId}] por ${entry.actorName} (${entry.actorRole})`);
    return entry;
  }

  public getRecentLogs(limit: number = 50): AuditLogEntity[] {
    return this.inMemoryLogs.slice(0, limit);
  }

  public getLogsForEntity(entityName: string, entityId: string): AuditLogEntity[] {
    return this.inMemoryLogs.filter(
      (l) => l.entityName === entityName && l.entityId === entityId
    );
  }

  public async getRecentLogsAsync(limit: number = 50): Promise<AuditLogEntity[]> {
    const safeLimit = Math.min(Math.max(1, limit), 500);
    try {
      const rows = await drizzleDb
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(safeLimit);

      if (rows.length > 0) {
        return rows.map((r) => ({
          id: r.id,
          actorId: r.actorId || undefined,
          actorName: r.actorName,
          actorRole: r.actorRole,
          entityName: r.entityName,
          entityId: r.entityId,
          action: r.action,
          oldData: r.oldData ?? undefined,
          newData: r.newData ?? undefined,
          notes: r.notes || undefined,
          ipAddress: r.ipAddress || undefined,
          createdAt: r.createdAt.toISOString(),
        }));
      }
    } catch {
      // Fallback para buffer em memória quando PostgreSQL não está conectado
    }
    return this.getRecentLogs(safeLimit);
  }

  public async getLogsForEntityAsync(entityName: string, entityId: string): Promise<AuditLogEntity[]> {
    try {
      const rows = await drizzleDb
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityName, entityName), eq(auditLogs.entityId, entityId)))
        .orderBy(desc(auditLogs.createdAt))
        .limit(200);

      if (rows.length > 0) {
        return rows.map((r) => ({
          id: r.id,
          actorId: r.actorId || undefined,
          actorName: r.actorName,
          actorRole: r.actorRole,
          entityName: r.entityName,
          entityId: r.entityId,
          action: r.action,
          oldData: r.oldData ?? undefined,
          newData: r.newData ?? undefined,
          notes: r.notes || undefined,
          ipAddress: r.ipAddress || undefined,
          createdAt: r.createdAt.toISOString(),
        }));
      }
    } catch {
      // Fallback em memória
    }
    return this.getLogsForEntity(entityName, entityId);
  }
}

export const auditService = new AuditService();
