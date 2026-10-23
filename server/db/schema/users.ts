import { pgSchema, uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';

export const coreSchema = pgSchema('core');

export const users = coreSchema.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: varchar('full_name', { length: 120 }).notNull(),
  email: varchar('email', { length: 150 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 30 }).notNull().$type<
    | 'admin'
    | 'gerente_comercial'
    | 'vendedor'
    | 'pcp_producao'
    | 'financeiro'
    | 'expedicao_qualidade'
  >(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
