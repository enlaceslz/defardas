import { uuid, varchar, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { coreSchema, users } from './users';

export const auditLogs = coreSchema.table('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  actorName: varchar('actor_name', { length: 120 }).notNull(),
  actorRole: varchar('actor_role', { length: 40 }).notNull(),
  entityName: varchar('entity_name', { length: 60 }).notNull(),
  entityId: varchar('entity_id', { length: 60 }).notNull(),
  action: varchar('action', { length: 40 }).notNull(),
  oldData: jsonb('old_data'),
  newData: jsonb('new_data'),
  notes: text('notes'),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_audit_logs_entity').on(table.entityName, table.entityId),
  index('idx_audit_logs_created_at').on(table.createdAt),
]);

export const eventLog = coreSchema.table('event_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventType: varchar('event_type', { length: 60 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending', 'processing', 'completed', 'failed'
  retryCount: varchar('retry_count', { length: 10 }).notNull().default('0'),
  errorMessage: text('error_message'),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_event_log_status').on(table.status),
  index('idx_event_log_created_at').on(table.createdAt),
]);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type EventLog = typeof eventLog.$inferSelect;
export type NewEventLog = typeof eventLog.$inferInsert;
