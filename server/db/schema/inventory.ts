import { pgSchema, uuid, varchar, text, numeric, boolean, date, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { productionOrders } from './orders';

export const estoqueSchema = pgSchema('estoque');

export const items = estoqueSchema.table('items', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 30 }).unique().notNull(), // Ex: MAT-2026-0301
  name: varchar('name', { length: 150 }).notNull(),
  category: varchar('category', { length: 40 }).notNull().$type<
    'tecido' | 'aviamento' | 'insumo_personalizacao' | 'pronta_entrega'
  >(),
  unit: varchar('unit', { length: 20 }).notNull().$type<
    'metros' | 'kg' | 'rolos' | 'unidades' | 'cones' | 'pecas'
  >(),
  physicalStock: numeric('physical_stock', { precision: 10, scale: 2 }).notNull().default('0.00'),
  allocatedStock: numeric('allocated_stock', { precision: 10, scale: 2 }).notNull().default('0.00'),
  inPartnersCustodyStock: numeric('in_partners_custody_stock', { precision: 10, scale: 2 }).notNull().default('0.00'),
  minStock: numeric('min_stock', { precision: 10, scale: 2 }).notNull().default('0.00'),
  unitCostPrice: numeric('unit_cost_price', { precision: 10, scale: 2 }).notNull().default('0.00'),
  supplier: varchar('supplier', { length: 120 }),
  location: varchar('location', { length: 80 }).default('Almoxarifado Central - Galpão 01'),
  lastRestocked: date('last_restocked'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const movements = estoqueSchema.table('movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  movementNumber: varchar('movement_number', { length: 30 }).unique().notNull(), // Ex: MOV-2026-0101
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'restrict' }),
  productionOrderId: uuid('production_order_id').references(() => productionOrders.id, { onDelete: 'set null' }),
  type: varchar('type', { length: 40 }).notNull().$type<
    | 'entrada_compra'
    | 'saida_corte'
    | 'remessa_parceiro'
    | 'retorno_parceiro'
    | 'perda_tecnica'
    | 'ajuste_inventario'
  >(),
  quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull(),
  unit: varchar('unit', { length: 20 }).notNull(),
  date: date('date').notNull(),
  reason: text('reason').notNull(),
  referenceDoc: varchar('reference_doc', { length: 80 }),
  operatorId: uuid('operator_id').references(() => users.id, { onDelete: 'set null' }),
  operatorName: varchar('operator_name', { length: 120 }).notNull(),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_stock_movements_item').on(table.itemId),
  index('idx_stock_movements_order').on(table.productionOrderId),
]);

export type InventoryItem = typeof items.$inferSelect;
export type NewInventoryItem = typeof items.$inferInsert;
export type StockMovement = typeof movements.$inferSelect;
export type NewStockMovement = typeof movements.$inferInsert;
