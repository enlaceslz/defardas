/**
 * DE FARDAS ERP — Inventory Repository (Drizzle ORM + Resilient Memory Store)
 * Gerencia o controle de tecidoteca, saldo próprio, alocado e em poder de facções parceiras.
 */
import { eq, desc } from 'drizzle-orm';
import { db as drizzleDb, query } from '../db/index';
import { db as fallbackDb } from '../db/connection';
import { items, movements, InventoryItem, StockMovement, NewInventoryItem, NewStockMovement } from '../db/schema/inventory';
import { InventoryItemEntity, StockMovementEntity } from '../types/db';

export class InventoryRepository {
  public async hasHistory(itemId: string): Promise<boolean> {
    await fallbackDb.ready;
    if (fallbackDb.isConnected()) {
      const result = await query(`SELECT EXISTS(SELECT 1 FROM estoque.movements WHERE item_id=$1)
        OR EXISTS(SELECT 1 FROM estoque.partner_custody WHERE item_id=$1) AS found`, [itemId]);
      return result.rows[0].found;
    }
    if (process.env.DATABASE_URL || process.env.NODE_ENV === 'production') throw new Error('PostgreSQL indisponível.');
    // Custódias ainda não têm repositório local; existem apenas no PostgreSQL.
    for (const movement of fallbackDb.movements.values()) if (movement.itemId === itemId) return true;
    return false;
  }

  public async findAllItems(): Promise<InventoryItemEntity[]> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(items).orderBy(desc(items.createdAt));
        return rows.map((r) => this.mapToItemEntity(r));
      } catch (err) {
        throw err;
        console.warn('⚠️ [InventoryRepository] Erro ao listar itens via Drizzle. Recorrendo à memória.', err);
      }
    }
    return Array.from(fallbackDb.inventory.values());
  }

  public async findItemById(id: string): Promise<InventoryItemEntity | null> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(items).where(eq(items.id, id)).limit(1);
        if (rows.length > 0) {
          return this.mapToItemEntity(rows[0]);
        }
      } catch (err) {
        throw err;
        console.warn(`⚠️ [InventoryRepository] Falha ao buscar item ${id} via Drizzle.`, err);
      }
    }
    if (fallbackDb.isConnected()) return null;
    return fallbackDb.inventory.get(id) || null;
  }

  public async saveItem(item: InventoryItemEntity): Promise<InventoryItemEntity> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (!fallbackDb.isConnected()) fallbackDb.inventory.set(item.id, item);

    if (fallbackDb.isConnected()) {
      try {
        const newRecord: NewInventoryItem = {
          id: item.id,
          code: item.code,
          name: item.name,
          category: item.category,
          unit: item.unit,
          physicalStock: item.physicalStock.toString(),
          allocatedStock: item.allocatedStock.toString(),
          inPartnersCustodyStock: item.inPartnersCustodyStock.toString(),
          minStock: item.minStock.toString(),
          unitCostPrice: item.unitCostPrice.toString(),
          supplier: item.supplier,
          location: item.location,
          lastRestocked: item.lastRestocked,
          isDemo: item.isDemo ?? false,
        };

        await drizzleDb
          .insert(items)
          .values(newRecord)
          .onConflictDoUpdate({
            target: items.id,
            set: {
              name: newRecord.name, category: newRecord.category, unit: newRecord.unit,
              minStock: newRecord.minStock, supplier: newRecord.supplier, location: newRecord.location,
              physicalStock: newRecord.physicalStock,
              allocatedStock: newRecord.allocatedStock,
              inPartnersCustodyStock: newRecord.inPartnersCustodyStock,
              unitCostPrice: newRecord.unitCostPrice,
              lastRestocked: newRecord.lastRestocked,
              updatedAt: new Date(),
            },
          });
      } catch (err) {
        throw err;
        console.error(`❌ [InventoryRepository] Falha ao persistir item ${item.id} via Drizzle:`, err);
      }
    }

    return item;
  }

  public async findAllMovements(): Promise<StockMovementEntity[]> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(movements).orderBy(desc(movements.createdAt));
        return rows.map((r) => this.mapToMovementEntity(r));
      } catch (err) {
        throw err;
        console.warn('⚠️ [InventoryRepository] Erro ao listar movimentações via Drizzle. Recorrendo à memória.', err);
      }
    }
    return Array.from(fallbackDb.movements.values());
  }

  public async findMovementById(id: string): Promise<StockMovementEntity | null> {
    await fallbackDb.ready;
    if ((process.env.DATABASE_URL || process.env.NODE_ENV === 'production') && !fallbackDb.isConnected()) throw new Error('PostgreSQL indisponível.');
    if (fallbackDb.isConnected()) {
      const rows = await drizzleDb.select().from(movements).where(eq(movements.id, id)).limit(1);
      return rows[0] ? this.mapToMovementEntity(rows[0]) : null;
    }
    return fallbackDb.movements.get(id) || null;
  }

  public async saveMovement(mov: StockMovementEntity): Promise<StockMovementEntity> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (!fallbackDb.isConnected()) {
      if (fallbackDb.movements.has(mov.id) || [...fallbackDb.movements.values()].some((existing) => existing.movementNumber === mov.movementNumber)) {
        throw Object.assign(new Error('Movimentação já registrada.'), { code: '23505' });
      }
      fallbackDb.movements.set(mov.id, mov);
    }

    if (fallbackDb.isConnected()) {
      try {
        const newRecord: NewStockMovement = {
          id: mov.id,
          movementNumber: mov.movementNumber,
          itemId: mov.itemId,
          productionOrderId: mov.productionOrderId,
          type: mov.type,
          quantity: mov.quantity.toString(),
          unit: mov.unit,
          date: mov.date,
          reason: mov.reason,
          referenceDoc: mov.referenceDoc,
          operatorId: mov.operatorId,
          operatorName: mov.operatorName,
          isDemo: mov.isDemo ?? false,
        };

        await drizzleDb
          .insert(movements)
          .values(newRecord);
      } catch (err) {
        throw err;
        console.error(`❌ [InventoryRepository] Falha ao persistir movimentação ${mov.id} via Drizzle:`, err);
      }
    }

    return mov;
  }

  public async deleteItem(id: string): Promise<void> {
    await fallbackDb.ready;
    if (fallbackDb.isConnected()) await drizzleDb.delete(items).where(eq(items.id, id));
    else fallbackDb.inventory.delete(id);
  }

  private mapToItemEntity(row: InventoryItem): InventoryItemEntity {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category,
      unit: row.unit,
      physicalStock: parseFloat(row.physicalStock),
      allocatedStock: parseFloat(row.allocatedStock),
      inPartnersCustodyStock: parseFloat(row.inPartnersCustodyStock),
      minStock: parseFloat(row.minStock),
      unitCostPrice: parseFloat(row.unitCostPrice),
      supplier: row.supplier || '',
      location: row.location || '',
      lastRestocked: row.lastRestocked || new Date().toISOString().split('T')[0],
      isDemo: row.isDemo,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapToMovementEntity(row: StockMovement): StockMovementEntity {
    return {
      id: row.id,
      movementNumber: row.movementNumber,
      itemId: row.itemId,
      productionOrderId: row.productionOrderId || undefined,
      type: row.type,
      quantity: parseFloat(row.quantity),
      unit: row.unit,
      date: row.date,
      reason: row.reason,
      referenceDoc: row.referenceDoc || undefined,
      operatorId: row.operatorId || undefined,
      operatorName: row.operatorName,
      isDemo: row.isDemo,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

export const inventoryRepository = new InventoryRepository();
