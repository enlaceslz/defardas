import { pgSchema, uuid, varchar, text, integer, numeric, boolean, timestamp } from 'drizzle-orm/pg-core';

export const crmSchema = pgSchema('crm');

export const clients = crmSchema.table('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 20 }).unique().notNull(), // Ex: CLI-2026-0201
  companyName: varchar('company_name', { length: 150 }).notNull(),
  tradeName: varchar('trade_name', { length: 150 }).notNull(),
  cnpj: varchar('cnpj', { length: 20 }).unique().notNull(),
  stateRegistration: varchar('state_registration', { length: 30 }),
  contactName: varchar('contact_name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 30 }).notNull(),
  email: varchar('email', { length: 150 }).notNull(),
  address: text('address').notNull(),
  city: varchar('city', { length: 80 }).notNull().default('São Luís'),
  state: varchar('state', { length: 2 }).notNull().default('MA'),
  segment: varchar('segment', { length: 60 }).notNull(),
  standardUniformNotes: text('standard_uniform_notes'),
  totalOrdersCount: integer('total_orders_count').notNull().default(0),
  totalSpent: numeric('total_spent', { precision: 12, scale: 2 }).notNull().default('0.00'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
