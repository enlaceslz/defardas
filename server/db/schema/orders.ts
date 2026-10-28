import { pgSchema, uuid, varchar, text, integer, numeric, boolean, date, timestamp, jsonb, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { quotes, quoteItems } from './quotes';
import { clients } from './clients';
import { users } from './users';

export const producaoSchema = pgSchema('producao');

export const productionOrders = producaoSchema.table('production_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderNumber: varchar('order_number', { length: 30 }).unique().notNull(), // Ex: OP-2026-0101
  quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'restrict' }),
  quoteItemId: uuid('quote_item_id').references(() => quoteItems.id, { onDelete: 'restrict' }),
  quoteVersion: integer('quote_version').notNull().default(1),
  idempotencyKey: varchar('idempotency_key', { length: 120 }).unique().notNull(), // Previne duplicação de OPs
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'restrict' }),
  clientName: varchar('client_name', { length: 150 }).notNull(),
  itemTitle: varchar('item_title', { length: 150 }).notNull(),
  category: varchar('category', { length: 40 }).notNull(),
  fabricName: varchar('fabric_name', { length: 100 }).notNull(),
  fabricColor: varchar('fabric_color', { length: 60 }).notNull(),
  sizes: jsonb('sizes').notNull(),
  totalPieces: integer('total_pieces').notNull(),
  customizations: jsonb('customizations').default([]),
  
  // Tríade de Estados Desacoplados (Regra B.2.2 do PRD)
  commercialStatus: varchar('commercial_status', { length: 30 }).notNull().default('aprovado').$type<
    'rascunho' | 'enviado' | 'em_negociacao' | 'aprovado' | 'recusado' | 'cancelado' | 'convertido_em_pedido'
  >(),
  financialStatus: varchar('financial_status', { length: 30 }).notNull().default('entrada_pendente').$type<
    'entrada_pendente' | 'entrada_confirmada' | 'saldo_em_aberto' | 'quitado'
  >(),
  stage: varchar('stage', { length: 30 }).notNull().default('aguardando_liberacao').$type<
    | 'aguardando_liberacao'
    | 'corte'
    | 'bordado_silk'
    | 'costura'
    | 'conferencia_qualidade'
    | 'retrabalho'
    | 'expedicao'
    | 'entregue'
  >(),
  
  // Portão Rígido de Liberação Fabril (Gate A.3.2)
  artApproved: boolean('art_approved').notNull().default(false),
  artApprovalDate: timestamp('art_approval_date', { withTimezone: true }),
  artApprovedBy: varchar('art_approved_by', { length: 100 }),
  
  entryPaymentConfirmed: boolean('entry_payment_confirmed').notNull().default(false),
  entryReceiptUrl: text('entry_receipt_url'),
  entryReceiptReference: varchar('entry_receipt_reference', { length: 80 }),
  entryVerifiedById: uuid('entry_verified_by_id').references(() => users.id, { onDelete: 'set null' }),
  entryVerificationDate: timestamp('entry_verification_date', { withTimezone: true }),
  
  priority: varchar('priority', { length: 20 }).notNull().default('normal').$type<'normal' | 'alta' | 'urgente'>(),
  creationDate: date('creation_date').notNull(),
  targetDeliveryDate: date('target_delivery_date').notNull(),
  completionDate: date('completion_date'),
  
  outsourcedPartner: varchar('outsourced_partner', { length: 100 }),
  partnerCostPerPiece: numeric('partner_cost_per_piece', { precision: 10, scale: 2 }).default('0.00'),
  technicalNotes: text('technical_notes'),
  assignedTeam: varchar('assigned_team', { length: 100 }).default('Mesa de Corte & Facção Terceirizada'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_order_quote_item_version').on(table.quoteId, table.quoteItemId, table.quoteVersion),
  check('orders_gate', sql`${table.stage} = 'aguardando_liberacao' OR (${table.artApproved} AND ${table.entryPaymentConfirmed} AND ${table.entryReceiptUrl} IS NOT NULL)`),
  check('orders_positive_pieces', sql`${table.totalPieces} > 0`),
  index('idx_orders_client').on(table.clientId),
  index('idx_orders_stage').on(table.stage),
  index('idx_orders_idempotency').on(table.idempotencyKey),
]);

export type ProductionOrder = typeof productionOrders.$inferSelect;
export type NewProductionOrder = typeof productionOrders.$inferInsert;
