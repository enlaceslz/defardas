import { uuid, varchar, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { crmSchema } from './clients';
import { users } from './users';

export const leads = crmSchema.table('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadNumber: varchar('lead_number', { length: 30 }).unique().notNull(), // Ex: LEAD-2026-0101
  clientName: varchar('client_name', { length: 120 }).notNull(),
  companyName: varchar('company_name', { length: 150 }).notNull(),
  phone: varchar('phone', { length: 30 }).notNull(),
  email: varchar('email', { length: 150 }).notNull(),
  category: varchar('category', { length: 40 }).notNull(),
  estimatedQuantity: integer('estimated_quantity').notNull(),
  notes: text('notes'),
  origin: varchar('origin', { length: 40 }).notNull().default('portal_publico'),
  status: varchar('status', { length: 30 }).notNull().default('novo').$type<
    'novo' | 'em_contato' | 'convertido_em_proposta' | 'desqualificado'
  >(),
  convertedQuoteId: uuid('converted_quote_id'),
  assignedSellerId: uuid('assigned_seller_id').references(() => users.id, { onDelete: 'set null' }),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
