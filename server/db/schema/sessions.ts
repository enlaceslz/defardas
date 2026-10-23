import { varchar, timestamp, uuid } from 'drizzle-orm/pg-core';
import { coreSchema, users } from './users';

export const sessions = coreSchema.table('sessions', {
  token: varchar('token', { length: 64 }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  userRole: varchar('user_role', { length: 30 }).notNull(),
  userFullName: varchar('user_full_name', { length: 120 }).notNull(),
  userEmail: varchar('user_email', { length: 150 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: varchar('user_agent', { length: 255 }),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
