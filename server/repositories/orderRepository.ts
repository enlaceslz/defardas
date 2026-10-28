/**
 * DE FARDAS ERP — Production Order Repository (Drizzle ORM + Resilient Memory Store)
 * Gerencia o ciclo fabril (PCP), portões de liberação (Gate A.3.2) e idempotência.
 */
import { eq, desc } from 'drizzle-orm';
import { db as drizzleDb } from '../db/index';
import { db as fallbackDb } from '../db/connection';
import { productionOrders, ProductionOrder, NewProductionOrder } from '../db/schema/orders';
import { ProductionOrderEntity } from '../types/db';

export class OrderRepository {
  public async findAll(): Promise<ProductionOrderEntity[]> {
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(productionOrders).orderBy(desc(productionOrders.createdAt));
        return rows.map((r) => this.mapToEntity(r));
      } catch (err) {
        console.warn('⚠️ [OrderRepository] Erro ao listar OPs via Drizzle. Recorrendo à memória.', err);
      }
    }
    return Array.from(fallbackDb.orders.values());
  }

  public async findById(id: string): Promise<ProductionOrderEntity | null> {
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(productionOrders).where(eq(productionOrders.id, id)).limit(1);
        if (rows.length > 0) {
          return this.mapToEntity(rows[0]);
        }
      } catch (err) {
        console.warn(`⚠️ [OrderRepository] Falha ao buscar OP ${id} via Drizzle.`, err);
      }
    }
    return fallbackDb.orders.get(id) || null;
  }

  public async findByIdempotencyKey(key: string): Promise<ProductionOrderEntity | null> {
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(productionOrders).where(eq(productionOrders.idempotencyKey, key)).limit(1);
        if (rows.length > 0) {
          return this.mapToEntity(rows[0]);
        }
      } catch (err) {
        console.warn(`⚠️ [OrderRepository] Falha ao buscar chave de idempotência ${key}.`, err);
      }
    }
    for (const o of fallbackDb.orders.values()) {
      if (o.idempotencyKey === key) return o;
    }
    return null;
  }

  public async save(order: ProductionOrderEntity): Promise<ProductionOrderEntity> {
    fallbackDb.orders.set(order.id, order);

    if (fallbackDb.isConnected()) {
      try {
        const newRecord: NewProductionOrder = {
          id: order.id,
          orderNumber: order.orderNumber,
          quoteId: order.quoteId,
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
          entryVerificationDate: order.entryVerificationDate ? new Date(order.entryVerificationDate) : null,
          priority: order.priority,
          creationDate: order.creationDate,
          targetDeliveryDate: order.targetDeliveryDate,
          completionDate: order.completionDate,
          outsourcedPartner: order.outsourcedPartner,
          partnerCostPerPiece: order.partnerCostPerPiece ? order.partnerCostPerPiece.toString() : '0.00',
          technicalNotes: order.technicalNotes,
          assignedTeam: order.assignedTeam || 'Mesa de Corte & Facção Terceirizada',
          isDemo: order.isDemo ?? false,
        };

        await drizzleDb
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
              outsourcedPartner: newRecord.outsourcedPartner,
              technicalNotes: newRecord.technicalNotes,
              assignedTeam: newRecord.assignedTeam,
              updatedAt: new Date(),
            },
          });
      } catch (err) {
        console.error(`❌ [OrderRepository] Falha ao persistir OP ${order.id} via Drizzle:`, err);
      }
    }

    return order;
  }

  public async delete(id: string): Promise<boolean> {
    fallbackDb.orders.delete(id);
    if (fallbackDb.isConnected()) {
      try {
        await drizzleDb.delete(productionOrders).where(eq(productionOrders.id, id));
        return true;
      } catch (err) {
        console.error(`❌ [OrderRepository] Falha ao deletar OP ${id} via Drizzle:`, err);
      }
    }
    return true;
  }

  private mapToEntity(row: ProductionOrder): ProductionOrderEntity {
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      quoteId: row.quoteId || '',
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
      entryVerificationDate: row.entryVerificationDate ? row.entryVerificationDate.toISOString() : undefined,
      priority: row.priority as any,
      creationDate: row.creationDate,
      targetDeliveryDate: row.targetDeliveryDate,
      completionDate: row.completionDate || undefined,
      outsourcedPartner: row.outsourcedPartner || undefined,
      partnerCostPerPiece: row.partnerCostPerPiece ? parseFloat(row.partnerCostPerPiece) : 0,
      technicalNotes: row.technicalNotes || undefined,
      assignedTeam: row.assignedTeam || 'Mesa de Corte & Facção Terceirizada',
      isDemo: row.isDemo,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export const orderRepository = new OrderRepository();
