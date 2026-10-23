import { uuid, varchar, text, integer, numeric, boolean, date, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { crmSchema, clients } from './clients';
import { users } from './users';

export const quotes = crmSchema.table('quotes', {
  id: uuid('id').primaryKey().defaultRandom(),
  quoteNumber: varchar('quote_number', { length: 30 }).unique().notNull(), // Ex: ORC-2026-1001
  version: integer('version').notNull().default(1),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'restrict' }),
  clientName: varchar('client_name', { length: 150 }).notNull(),
  clientCnpj: varchar('client_cnpj', { length: 20 }),
  sellerId: uuid('seller_id').references(() => users.id, { onDelete: 'set null' }),
  sellerName: varchar('seller_name', { length: 100 }).notNull(),
  
  // Status Comercial Desacoplado (Regra B.2.2)
  commercialStatus: varchar('commercial_status', { length: 30 }).notNull().default('rascunho').$type<
    'rascunho' | 'enviado' | 'em_negociacao' | 'aprovado' | 'recusado' | 'cancelado' | 'convertido_em_pedido'
  >(),
  
  date: date('date').notNull(),
  validUntil: date('valid_until').notNull(),
  
  // Totais e Motor de Precificação (Markup sobre o Custo - Adendo B.2.1)
  totalBaseCost: numeric('total_base_cost', { precision: 12, scale: 2 }).notNull(),
  markupPercentage: numeric('markup_percentage', { precision: 6, scale: 2 }).notNull(),
  suggestedTotalAmount: numeric('suggested_total_amount', { precision: 12, scale: 2 }).notNull(),
  negotiatedTotalAmount: numeric('negotiated_total_amount', { precision: 12, scale: 2 }).notNull(),
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
  estimatedMarginPercentage: numeric('estimated_margin_percentage', { precision: 6, scale: 2 }).notNull(),
  
  // Autorização de Desconto Auditável (Preço Negociado < Sugerido - Adendo B.2.5)
  belowSuggestedAuthorized: boolean('below_suggested_authorized').notNull().default(false),
  authorizedById: uuid('authorized_by_id').references(() => users.id, { onDelete: 'set null' }),
  authorizedByName: varchar('authorized_by_name', { length: 120 }),
  authorizationDate: timestamp('authorization_date', { withTimezone: true }),
  authorizationNotes: text('authorization_notes'),
  
  // Portão Comercial: Sinal de 50% Fixado (Regra A.3.2)
  entryPercentage: numeric('entry_percentage', { precision: 5, scale: 2 }).notNull().default('50.00'),
  entryAmount: numeric('entry_amount', { precision: 12, scale: 2 }).notNull(),
  balanceAmount: numeric('balance_amount', { precision: 12, scale: 2 }).notNull(),
  paymentTerms: text('payment_terms').notNull().default('50% Sinal (Liberação de Corte) + 50% na Entrega'),
  productionLeadDays: integer('production_lead_days').notNull().default(16),
  
  // Aceite Formal de Arte
  artApproved: boolean('art_approved').notNull().default(false),
  artApprovedBy: varchar('art_approved_by', { length: 100 }),
  artApprovalDate: timestamp('art_approval_date', { withTimezone: true }),
  artFileUrl: text('art_file_url'),
  artNotes: text('art_notes'),
  
  // Rastreabilidade de Aceite por WhatsApp / Formal
  acceptanceChannel: varchar('acceptance_channel', { length: 30 }).default('whatsapp').$type<
    'whatsapp' | 'email' | 'presencial'
  >(),
  acceptanceNotes: text('acceptance_notes'),
  acceptanceTimestamp: timestamp('acceptance_timestamp', { withTimezone: true }),
  
  notes: text('notes'),
  convertedOrderId: uuid('converted_order_id'),
  isLocked: boolean('is_locked').notNull().default(false), // Imutável após aprovação/conversão
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_quotes_client').on(table.clientId),
  index('idx_quotes_status').on(table.commercialStatus),
]);

export const quoteItems = crmSchema.table('quote_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  quoteId: uuid('quote_id').notNull().references(() => quotes.id, { onDelete: 'cascade' }),
  category: varchar('category', { length: 40 }).notNull(),
  modelName: varchar('model_name', { length: 150 }).notNull(),
  fabricName: varchar('fabric_name', { length: 100 }).notNull(),
  fabricColor: varchar('fabric_color', { length: 60 }).notNull(),
  sizes: jsonb('sizes').notNull(), // { pp: 0, p: 20, m: 50, g: 40, gg: 15, xg: 5, exg: 0, sobMedida: 0 }
  totalQuantity: integer('total_quantity').notNull(),
  
  // Decomposição Transparente de Custo-Base Unitário (Adendo B.2.1)
  materialUnitCost: numeric('material_unit_cost', { precision: 10, scale: 2 }).notNull().default('0.00'),
  outsourcedSewingUnitCost: numeric('outsourced_sewing_unit_cost', { precision: 10, scale: 2 }).notNull().default('0.00'),
  customizationUnitCost: numeric('customization_unit_cost', { precision: 10, scale: 2 }).notNull().default('0.00'),
  freightUnitCost: numeric('freight_unit_cost', { precision: 10, scale: 2 }).notNull().default('0.00'),
  technicalLossPercentage: numeric('technical_loss_percentage', { precision: 5, scale: 2 }).notNull().default('2.00'),
  calculatedBaseUnitCost: numeric('calculated_base_unit_cost', { precision: 10, scale: 2 }).notNull(),
  markupPercentage: numeric('markup_percentage', { precision: 6, scale: 2 }).notNull(),
  suggestedUnitPrice: numeric('suggested_unit_price', { precision: 10, scale: 2 }).notNull(),
  negotiatedUnitPrice: numeric('negotiated_unit_price', { precision: 10, scale: 2 }).notNull(),
  totalItemPrice: numeric('total_item_price', { precision: 12, scale: 2 }).notNull(),
  customizations: jsonb('customizations').default([]),
});

export type Quote = typeof quotes.$inferSelect;
export type NewQuote = typeof quotes.$inferInsert;
export type QuoteItem = typeof quoteItems.$inferSelect;
export type NewQuoteItem = typeof quoteItems.$inferInsert;
