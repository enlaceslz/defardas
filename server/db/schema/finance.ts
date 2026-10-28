import { sql } from 'drizzle-orm';
import { pgSchema, uuid, varchar, text, numeric, boolean, date, timestamp, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { users } from './users';
import { quotes } from './quotes';
import { productionOrders } from './orders';

export const financeiroSchema = pgSchema('financeiro');

export const transactions = financeiroSchema.table('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  transactionNumber: varchar('transaction_number', { length: 30 }).unique().notNull(), // Ex: FIN-2026-5001
  productionOrderId: uuid('production_order_id').references(() => productionOrders.id, { onDelete: 'set null' }),
  quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
  type: varchar('type', { length: 20 }).notNull().$type<'receber' | 'pagar'>(),
  subType: varchar('sub_type', { length: 40 }).notNull().$type<
    'entrada_pedido' | 'saldo_entrega' | 'compra_tecido' | 'servico_terceirizado' | 'despesa_geral'
  >(),
  description: text('description').notNull(),
  category: varchar('category', { length: 60 }).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  dueDate: date('due_date').notNull(),
  paidDate: date('paid_date'),
  status: varchar('status', { length: 20 }).notNull().default('pendente').$type<
    'pendente' | 'pago' | 'atrasado' | 'estornado'
  >(),
  paymentMethod: varchar('payment_method', { length: 30 }).notNull().$type<
    'pix' | 'boleto' | 'transferencia' | 'cartao'
  >(),
  referenceId: varchar('reference_id', { length: 60 }),
  
  // Auditoria e Comprovação Real
  receiptEvidenceUrl: text('receipt_evidence_url'),
  receiptVoucherNumber: varchar('receipt_voucher_number', { length: 80 }),
  confirmedById: uuid('confirmed_by_id').references(() => users.id, { onDelete: 'set null' }),
  confirmedByName: varchar('confirmed_by_name', { length: 120 }),
  confirmationNotes: text('confirmation_notes'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_quote_receivable_kind').on(table.quoteId, table.subType).where(sql`${table.type} = 'receber' AND ${table.subType} IN ('entrada_pedido', 'saldo_entrega')`),
  check('transactions_positive_amount', sql`${table.amount} > 0`),
  index('idx_finance_status').on(table.status),
  index('idx_finance_due_date').on(table.dueDate),
  index('idx_finance_order').on(table.productionOrderId),
]);

export type FinancialTransaction = typeof transactions.$inferSelect;
export type NewFinancialTransaction = typeof transactions.$inferInsert;
