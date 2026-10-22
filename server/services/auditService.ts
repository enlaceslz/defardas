/**
 * DE FARDAS ERP — Audit Service
 * Registra eventos auditáveis de mutações críticas, autorizações e tentativas de bypass.
 */
import { AuditLogEntity } from '../types/db';

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
      id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
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
}

export const auditService = new AuditService();
