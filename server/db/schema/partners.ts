import { uuid, varchar, text, numeric, boolean, date, timestamp } from 'drizzle-orm/pg-core';
import { producaoSchema, productionOrders } from './orders';
import { estoqueSchema, items, movements } from './inventory';

export const partners = producaoSchema.table('partners', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 30 }).unique().notNull(), // Ex: FAC-2026-001
  name: varchar('name', { length: 150 }).notNull(),
  tradeName: varchar('trade_name', { length: 150 }).notNull(),
  cnpjCpf: varchar('cnpj_cpf', { length: 20 }),
  phone: varchar('phone', { length: 30 }).notNull(),
  email: varchar('email', { length: 150 }),
  address: text('address'),
  city: varchar('city', { length: 80 }).default('São Luís'),
  partnerType: varchar('partner_type', { length: 40 }).notNull().$type<
    'costura' | 'bordado' | 'silk_screen' | 'acabamento' | 'corte_externo'
  >(),
  capacityPiecesPerMonth: varchar('capacity_pieces_per_month', { length: 20 }),
  rating: numeric('rating', { precision: 3, scale: 2 }).default('5.00'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const partnerCustody = estoqueSchema.table('partner_custody', {
  id: uuid('id').primaryKey().defaultRandom(),
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'restrict' }),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'restrict' }),
  productionOrderId: uuid('production_order_id').references(() => productionOrders.id, { onDelete: 'set null' }),
  remittanceMovementId: uuid('remittance_movement_id').references(() => movements.id, { onDelete: 'set null' }),
  sentQuantity: numeric('sent_quantity', { precision: 10, scale: 2 }).notNull(),
  returnedQuantity: numeric('returned_quantity', { precision: 10, scale: 2 }).notNull().default('0.00'),
  lostQuantity: numeric('lost_quantity', { precision: 10, scale: 2 }).notNull().default('0.00'),
  unit: varchar('unit', { length: 20 }).notNull(),
  sentDate: date('sent_date').notNull(),
  status: varchar('status', { length: 30 }).notNull().default('em_custodia').$type<
    'em_custodia' | 'devolvido_total' | 'devolvido_parcial' | 'avaria_registrada'
  >(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Partner = typeof partners.$inferSelect;
export type NewPartner = typeof partners.$inferInsert;
export type PartnerCustody = typeof partnerCustody.$inferSelect;
export type NewPartnerCustody = typeof partnerCustody.$inferInsert;
