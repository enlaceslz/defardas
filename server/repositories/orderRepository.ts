/**
 * DE FARDAS ERP — Production Order Repository (Drizzle ORM + Resilient Memory Store)
 * Gerencia o ciclo fabril (PCP), portões de liberação (Gate A.3.2) e idempotência.
 */
import { eq, desc } from 'drizzle-orm';
import { query, db as drizzleDb } from '../db/index';
import { db as fallbackDb } from '../db/connection';
import { productionOrders, ProductionOrder, NewProductionOrder } from '../db/schema/orders';
import { ProductionOrderEntity } from '../types/db';

export class OrderRepository {
  public async hasHistory(orderId: string): Promise<boolean> {
    await fallbackDb.ready;
    if (fallbackDb.isConnected()) {
      const result = await query(`SELECT EXISTS(SELECT 1 FROM financeiro.transactions WHERE production_order_id=$1)
        OR EXISTS(SELECT 1 FROM estoque.movements WHERE production_order_id=$1)
        OR EXISTS(SELECT 1 FROM estoque.partner_custody WHERE production_order_id=$1)
        OR EXISTS(SELECT 1 FROM crm.quotes WHERE converted_order_id=$1) AS found`, [orderId]);
      return result.rows[0].found;
    }
    if (process.env.DATABASE_URL || process.env.NODE_ENV === 'production') throw new Error('PostgreSQL indisponível.');
    // Custódias em facções ainda não têm repositório em memória; sua consulta é exclusiva do PostgreSQL.
    return [...fallbackDb.finance.values()].some((row) => row.productionOrderId === orderId) ||
      [...fallbackDb.movements.values()].some((row) => row.productionOrderId === orderId) ||
      [...fallbackDb.quotes.values()].some((row) => row.convertedOrderId === orderId);
  }

  public async findAll(): Promise<ProductionOrderEntity[]> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(productionOrders).orderBy(desc(productionOrders.createdAt));
        return rows.map((r) => this.mapToEntity(r));
      } catch (err) {
        throw err;
        console.warn('⚠️ [OrderRepository] Erro ao listar OPs via Drizzle. Recorrendo à memória.', err);
      }
    }
    return Array.from(fallbackDb.orders.values());
  }

  // Usar dentro de unitOfWork: o lock da linha dura até commit/rollback.
  public async findByIdForUpdate(id: string): Promise<ProductionOrderEntity | null> {
    await fallbackDb.ready;
    if (fallbackDb.isConnected()) await query('SELECT id FROM producao.production_orders WHERE id=$1 FOR UPDATE', [id]);
    return this.findById(id);
  }

  public async findById(id: string): Promise<ProductionOrderEntity | null> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(productionOrders).where(eq(productionOrders.id, id)).limit(1);
        if (rows.length > 0) {
          return this.mapToEntity(rows[0]);
        }
      } catch (err) {
        throw err;
        console.warn(`⚠️ [OrderRepository] Falha ao buscar OP ${id} via Drizzle.`, err);
      }
    }
    if (fallbackDb.isConnected()) return null;
    return fallbackDb.orders.get(id) || null;
  }

  public async findByIdempotencyKey(key: string): Promise<ProductionOrderEntity | null> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(productionOrders).where(eq(productionOrders.idempotencyKey, key)).limit(1);
        if (rows.length > 0) {
          return this.mapToEntity(rows[0]);
        }
      } catch (err) {
        throw err;
        console.warn(`⚠️ [OrderRepository] Falha ao buscar chave de idempotência ${key}.`, err);
      }
    }
    for (const o of fallbackDb.orders.values()) {
      if (o.idempotencyKey === key) return o;
    }
    return null;
  }

  public async save(order: ProductionOrderEntity): Promise<ProductionOrderEntity> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (!fallbackDb.isConnected()) {
      const existing = fallbackDb.orders.get(order.id);
      order.revision = existing ? (existing.revision ?? 1) + 1 : 1;
      fallbackDb.orders.set(order.id, order);
    }

    if (fallbackDb.isConnected()) {
      try {
        const newRecord: NewProductionOrder = {
          id: order.id,
          orderNumber: order.orderNumber,
          quoteId: order.quoteId || null,
          quoteItemId: order.quoteItemId,
          quoteVersion: order.quoteVersion || 1,
          idempotencyKey: order.idempotencyKey,
          clientId: order.clientId,
          clientName: order.clientName,
          itemTitle: order.itemTitle,
          category: order.category,
          fabricName: order.fabricName,
          fabricColor: order.fabricColor,
          sizes: order.sizes as any,
          totalPieces: order.totalPieces,
          customizations: order.customizations as any,
          commercialStatus: (order.commercialStatus as any) || 'aprovado',
          financialStatus: order.financialStatus,
          stage: order.stage,
          artApproved: order.artApproved,
          artApprovalDate: order.artApprovalDate ? new Date(order.artApprovalDate) : null,
          artApprovedBy: order.artApprovedBy,
          entryPaymentConfirmed: order.entryPaymentConfirmed,
          entryReceiptUrl: order.entryReceiptUrl,
          entryReceiptReference: order.entryReceiptReference,
          entryVerifiedById: order.entryVerifiedById,
          entryVerificationDate: order.entryVerificationDate ? new Date(order.entryVerificationDate) : null,
          priority: order.priority,
          creationDate: order.creationDate,
          targetDeliveryDate: order.targetDeliveryDate,
          completionDate: order.completionDate,
          outsourcedPartner: order.outsourcedPartner,
          partnerCostPerPiece: order.partnerCostPerPiece ? order.partnerCostPerPiece.toString() : '0.00',
          technicalNotes: order.technicalNotes,
          assignedTeam: order.assignedTeam ?? '',
          isDemo: order.isDemo ?? false,
        };

        const [saved] = await drizzleDb
          .insert(productionOrders)
          .values(newRecord)
          .onConflictDoUpdate({
            target: productionOrders.id,
            set: {
              stage: newRecord.stage,
              commercialStatus: newRecord.commercialStatus,
              financialStatus: newRecord.financialStatus,
              artApproved: newRecord.artApproved,
              artApprovalDate: newRecord.artApprovalDate,
              artApprovedBy: newRecord.artApprovedBy,
              entryPaymentConfirmed: newRecord.entryPaymentConfirmed,
              entryReceiptUrl: newRecord.entryReceiptUrl,
              entryReceiptReference: newRecord.entryReceiptReference,
              entryVerificationDate: newRecord.entryVerificationDate,
              completionDate: newRecord.completionDate,
              itemTitle: newRecord.itemTitle, category: newRecord.category,
              fabricName: newRecord.fabricName, fabricColor: newRecord.fabricColor,
              sizes: newRecord.sizes, totalPieces: newRecord.totalPieces,
              customizations: newRecord.customizations, priority: newRecord.priority,
              targetDeliveryDate: newRecord.targetDeliveryDate,
              partnerCostPerPiece: newRecord.partnerCostPerPiece,
              entryVerifiedById: newRecord.entryVerifiedById,
              outsourcedPartner: newRecord.outsourcedPartner,
              technicalNotes: newRecord.technicalNotes,
              assignedTeam: newRecord.assignedTeam,
              updatedAt: new Date(),
            },
          }).returning({ revision: productionOrders.revision, updatedAt: productionOrders.updatedAt });
        order.revision = saved.revision;
        order.updatedAt = saved.updatedAt.toISOString();
      } catch (err) {
        throw err;
        console.error(`❌ [OrderRepository] Falha ao persistir OP ${order.id} via Drizzle:`, err);
      }
    }

    return order;
  }

  public async delete(id: string): Promise<boolean> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (!fallbackDb.isConnected()) fallbackDb.orders.delete(id);
    if (fallbackDb.isConnected()) {
      try {
        await drizzleDb.delete(productionOrders).where(eq(productionOrders.id, id));
        return true;
      } catch (err) {
        throw err;
        console.error(`❌ [OrderRepository] Falha ao deletar OP ${id} via Drizzle:`, err);
      }
    }
    return true;
  }

  public async findByQuoteId(quoteId: string): Promise<ProductionOrderEntity[]> {
    await fallbackDb.ready;
    if (fallbackDb.isConnected()) {
      return (await drizzleDb.select().from(productionOrders).where(eq(productionOrders.quoteId, quoteId))).map((row) => this.mapToEntity(row));
    }
    return [...fallbackDb.orders.values()].filter((order) => order.quoteId === quoteId);
  }

  private mapToEntity(row: ProductionOrder): ProductionOrderEntity {
    return {
      id: row.id,
      revision: row.revision,
      orderNumber: row.orderNumber,
      quoteId: row.quoteId || undefined,
      quoteItemId: row.quoteItemId || undefined,
      quoteVersion: row.quoteVersion,
      idempotencyKey: row.idempotencyKey,
      clientId: row.clientId,
      clientName: row.clientName,
      itemTitle: row.itemTitle,
      category: row.category,
      fabricName: row.fabricName,
      fabricColor: row.fabricColor,
      sizes: row.sizes as any,
      totalPieces: row.totalPieces,
      customizations: (row.customizations as any) || [],
      commercialStatus: row.commercialStatus as any,
      financialStatus: row.financialStatus as any,
      stage: row.stage as any,
      artApproved: row.artApproved,
      artApprovalDate: row.artApprovalDate ? row.artApprovalDate.toISOString() : undefined,
      artApprovedBy: row.artApprovedBy || undefined,
      entryPaymentConfirmed: row.entryPaymentConfirmed,
      entryReceiptUrl: row.entryReceiptUrl || undefined,
      entryReceiptReference: row.entryReceiptReference || undefined,
      entryVerifiedById: row.entryVerifiedById || undefined,
      entryVerificationDate: row.entryVerificationDate ? row.entryVerificationDate.toISOString() : undefined,
      priority: row.priority as any,
      creationDate: row.creationDate,
      targetDeliveryDate: row.targetDeliveryDate,
      completionDate: row.completionDate || undefined,
      outsourcedPartner: row.outsourcedPartner || undefined,
      partnerCostPerPiece: row.partnerCostPerPiece ? parseFloat(row.partnerCostPerPiece) : 0,
      technicalNotes: row.technicalNotes || undefined,
      assignedTeam: row.assignedTeam ?? '',
      isDemo: row.isDemo,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export const orderRepository = new OrderRepository();
