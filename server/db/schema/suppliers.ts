import { pgSchema, uuid, varchar, text, numeric, integer, boolean, date, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { estoqueSchema } from './inventory';
import { productionOrders } from './orders';

export const suppliers = estoqueSchema.table('suppliers', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 30 }).unique().notNull(), // Ex: FOR-2026-0001
  companyName: varchar('company_name', { length: 180 }).notNull(),
  tradeName: varchar('trade_name', { length: 150 }).notNull(),
  cnpj: varchar('cnpj', { length: 24 }),
  stateRegistration: varchar('state_registration', { length: 30 }),
  contactName: varchar('contact_name', { length: 120 }).notNull(),
  phone: varchar('phone', { length: 30 }).notNull(),
  email: varchar('email', { length: 150 }),
  address: text('address'),
  city: varchar('city', { length: 80 }).default('São Luís'),
  state: varchar('state', { length: 2 }).default('MA'),
  cep: varchar('cep', { length: 12 }),
  category: varchar('category', { length: 40 }).notNull().$type<
    'tecidos_malhas' | 'aviamentos' | 'bordado_estamparia' | 'embalagens' | 'servicos_manutencao' | 'outros'
  >(),
  paymentTerms: varchar('payment_terms', { length: 100 }).default('30 dias'),
  paymentTermsDays: integer('payment_terms_days').notNull().default(30),
  defaultPaymentMethod: varchar('default_payment_method', { length: 30 }).notNull().default('boleto').$type<
    'pix' | 'boleto' | 'transferencia' | 'cartao'
  >(),
  pixKey: varchar('pix_key', { length: 150 }),
  bankDetails: text('bank_details'),
  leadTimeDays: integer('lead_time_days').notNull().default(7),
  minOrderValue: numeric('min_order_value', { precision: 12, scale: 2 }).default('0.00'),
  rating: numeric('rating', { precision: 3, scale: 2 }).default('5.00'),
  notes: text('notes'),
  active: boolean('active').notNull().default(true),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_suppliers_category').on(table.category),
  index('idx_suppliers_active').on(table.active),
]);

export const purchaseOrders = estoqueSchema.table('purchase_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  poNumber: varchar('po_number', { length: 30 }).unique().notNull(), // Ex: PC-2026-0001
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'restrict' }),
  supplierName: varchar('supplier_name', { length: 150 }).notNull(),
  relatedOrderId: uuid('related_order_id').references(() => productionOrders.id, { onDelete: 'set null' }),
  relatedOrderNumber: varchar('related_order_number', { length: 30 }),
  status: varchar('status', { length: 30 }).notNull().default('rascunho').$type<
    'rascunho' | 'enviado' | 'confirmado' | 'recebido_parcial' | 'recebido_total' | 'cancelado'
  >(),
  orderDate: date('order_date').notNull(),
  expectedDeliveryDate: date('expected_delivery_date').notNull(),
  receivedDate: date('received_date'),
  items: jsonb('items').notNull().default([]),
  subtotalAmount: numeric('subtotal_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
  freightCost: numeric('freight_cost', { precision: 12, scale: 2 }).notNull().default('0.00'),
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
  paymentTerms: varchar('payment_terms', { length: 100 }).default('30 dias'),
  paymentMethod: varchar('payment_method', { length: 30 }).notNull().default('boleto').$type<
    'pix' | 'boleto' | 'transferencia' | 'cartao'
  >(),
  dueDate: date('due_date').notNull(),
  invoiceNumber: varchar('invoice_number', { length: 80 }),
  notes: text('notes'),
  createdByName: varchar('created_by_name', { length: 120 }),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_po_supplier').on(table.supplierId),
  index('idx_po_status').on(table.status),
  index('idx_po_expected_delivery').on(table.expectedDeliveryDate),
]);

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type NewPurchaseOrder = typeof purchaseOrders.$inferInsert;
