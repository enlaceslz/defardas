/**
 * DE FARDAS ERP — Supplier & Purchase Order Repository (Drizzle ORM + Resilient Memory Store)
 * Gerencia cadastro de fornecedores de matéria-prima (tecidos, aviamentos, embalagens)
 * e pedidos de compra integrados ao Estoque (Kardex) e Financeiro (Contas a Pagar).
 */
import { eq, desc } from 'drizzle-orm';
import { db as drizzleDb } from '../db/index';
import { db as fallbackDb } from '../db/connection';
import {
  suppliers,
  purchaseOrders,
  Supplier,
  NewSupplier,
  PurchaseOrder,
  NewPurchaseOrder,
} from '../db/schema/suppliers';
import {
  SupplierEntity,
  PurchaseOrderEntity,
  PurchaseOrderItemEntity,
} from '../types/db';
import { addressMetadataService, extractAddressGeoMetadata } from '../services/addressMetadataService';

export class SupplierRepository {
  // =========================================================================
  // FORNECEDORES (estoque.suppliers)
  // =========================================================================

  public async findAll(): Promise<SupplierEntity[]> {
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb
          .select()
          .from(suppliers)
          .orderBy(desc(suppliers.createdAt));
        return addressMetadataService.enrichMany(
          'supplier',
          rows.map((row) => this.mapSupplierToEntity(row))
        );
      } catch (err) {
        console.warn('⚠️ [SupplierRepository] Erro ao listar fornecedores via Drizzle. Recorrendo à memória.', err);
      }
    }
    const list = Array.from(fallbackDb.suppliers.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return addressMetadataService.enrichMany('supplier', list);
  }

  public async findById(id: string): Promise<SupplierEntity | null> {
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb
          .select()
          .from(suppliers)
          .where(eq(suppliers.id, id))
          .limit(1);
        if (rows.length > 0) {
          return addressMetadataService.enrich('supplier', this.mapSupplierToEntity(rows[0]));
        }
      } catch (err) {
        console.warn(`⚠️ [SupplierRepository] Erro ao buscar fornecedor ${id} via Drizzle.`, err);
      }
    }
    const mem = fallbackDb.suppliers.get(id);
    return mem ? addressMetadataService.enrich('supplier', mem) : null;
  }

  public async save(supplier: SupplierEntity): Promise<SupplierEntity> {
    fallbackDb.suppliers.set(supplier.id, supplier);

    if (fallbackDb.isConnected()) {
      try {
        const record: NewSupplier = {
          id: supplier.id,
          code: supplier.code,
          companyName: supplier.companyName,
          tradeName: supplier.tradeName,
          cnpj: supplier.cnpj,
          stateRegistration: supplier.stateRegistration,
          contactName: supplier.contactName,
          phone: supplier.phone,
          email: supplier.email,
          address: supplier.address,
          city: supplier.city || 'São Luís',
          state: supplier.state || 'MA',
          cep: supplier.cep,
          category: supplier.category,
          paymentTerms: supplier.paymentTerms,
          paymentTermsDays: supplier.paymentTermsDays,
          defaultPaymentMethod: supplier.defaultPaymentMethod,
          pixKey: supplier.pixKey,
          bankDetails: supplier.bankDetails,
          leadTimeDays: supplier.leadTimeDays,
          minOrderValue: supplier.minOrderValue.toFixed(2),
          rating: supplier.rating.toFixed(2),
          notes: supplier.notes,
          active: supplier.active,
          isDemo: supplier.isDemo ?? false,
        };

        await drizzleDb
          .insert(suppliers)
          .values(record)
          .onConflictDoUpdate({
            target: suppliers.id,
            set: {
              companyName: record.companyName,
              tradeName: record.tradeName,
              cnpj: record.cnpj,
              stateRegistration: record.stateRegistration,
              contactName: record.contactName,
              phone: record.phone,
              email: record.email,
              address: record.address,
              city: record.city,
              state: record.state,
              cep: record.cep,
              category: record.category,
              paymentTerms: record.paymentTerms,
              paymentTermsDays: record.paymentTermsDays,
              defaultPaymentMethod: record.defaultPaymentMethod,
              pixKey: record.pixKey,
              bankDetails: record.bankDetails,
              leadTimeDays: record.leadTimeDays,
              minOrderValue: record.minOrderValue,
              rating: record.rating,
              notes: record.notes,
              active: record.active,
              updatedAt: new Date(),
            },
          });
      } catch (err) {
        console.error(`❌ [SupplierRepository] Falha ao persistir fornecedor ${supplier.id} via Drizzle:`, err);
      }
    }

    await addressMetadataService.set('supplier', supplier.id, extractAddressGeoMetadata(supplier));
    return supplier;
  }

  public async delete(id: string): Promise<boolean> {
    fallbackDb.suppliers.delete(id);
    await addressMetadataService.delete('supplier', id);
    if (fallbackDb.isConnected()) {
      try {
        await drizzleDb.delete(suppliers).where(eq(suppliers.id, id));
      } catch (err) {
        console.error(`❌ [SupplierRepository] Falha ao excluir fornecedor ${id} via Drizzle:`, err);
      }
    }
    return true;
  }

  // =========================================================================
  // PEDIDOS DE COMPRA (estoque.purchase_orders)
  // =========================================================================

  public async findAllPurchaseOrders(): Promise<PurchaseOrderEntity[]> {
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb
          .select()
          .from(purchaseOrders)
          .orderBy(desc(purchaseOrders.createdAt));
        return rows.map((row) => this.mapPurchaseOrderToEntity(row));
      } catch (err) {
        console.warn('⚠️ [SupplierRepository] Erro ao listar pedidos de compra via Drizzle. Recorrendo à memória.', err);
      }
    }
    return Array.from(fallbackDb.purchaseOrders.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public async findPurchaseOrderById(id: string): Promise<PurchaseOrderEntity | null> {
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb
          .select()
          .from(purchaseOrders)
          .where(eq(purchaseOrders.id, id))
          .limit(1);
        if (rows.length > 0) return this.mapPurchaseOrderToEntity(rows[0]);
      } catch (err) {
        console.warn(`⚠️ [SupplierRepository] Erro ao buscar pedido de compra ${id} via Drizzle.`, err);
      }
    }
    return fallbackDb.purchaseOrders.get(id) || null;
  }

  public async savePurchaseOrder(po: PurchaseOrderEntity): Promise<PurchaseOrderEntity> {
    fallbackDb.purchaseOrders.set(po.id, po);

    if (fallbackDb.isConnected()) {
      try {
        const record: NewPurchaseOrder = {
          id: po.id,
          poNumber: po.poNumber,
          supplierId: po.supplierId,
          supplierName: po.supplierName,
          relatedOrderId: po.relatedOrderId || null,
          relatedOrderNumber: po.relatedOrderNumber || null,
          status: po.status,
          orderDate: po.orderDate,
          expectedDeliveryDate: po.expectedDeliveryDate,
          receivedDate: po.receivedDate || null,
          items: po.items,
          subtotalAmount: po.subtotalAmount.toFixed(2),
          freightCost: po.freightCost.toFixed(2),
          discountAmount: po.discountAmount.toFixed(2),
          totalAmount: po.totalAmount.toFixed(2),
          paymentTerms: po.paymentTerms,
          paymentMethod: po.paymentMethod,
          dueDate: po.dueDate,
          invoiceNumber: po.invoiceNumber || null,
          notes: po.notes || null,
          createdByName: po.createdByName || null,
          isDemo: po.isDemo ?? false,
        };

        await drizzleDb
          .insert(purchaseOrders)
          .values(record)
          .onConflictDoUpdate({
            target: purchaseOrders.id,
            set: {
              supplierName: record.supplierName,
              relatedOrderId: record.relatedOrderId,
              relatedOrderNumber: record.relatedOrderNumber,
              status: record.status,
              expectedDeliveryDate: record.expectedDeliveryDate,
              receivedDate: record.receivedDate,
              items: record.items,
              subtotalAmount: record.subtotalAmount,
              freightCost: record.freightCost,
              discountAmount: record.discountAmount,
              totalAmount: record.totalAmount,
              paymentTerms: record.paymentTerms,
              paymentMethod: record.paymentMethod,
              dueDate: record.dueDate,
              invoiceNumber: record.invoiceNumber,
              notes: record.notes,
              updatedAt: new Date(),
            },
          });
      } catch (err) {
        console.error(`❌ [SupplierRepository] Falha ao persistir pedido de compra ${po.id} via Drizzle:`, err);
      }
    }

    return po;
  }

  // =========================================================================
  // MAPPERS
  // =========================================================================

  private mapSupplierToEntity(row: Supplier): SupplierEntity {
    return {
      id: row.id,
      code: row.code,
      companyName: row.companyName,
      tradeName: row.tradeName,
      cnpj: row.cnpj || undefined,
      stateRegistration: row.stateRegistration || undefined,
      contactName: row.contactName,
      phone: row.phone,
      email: row.email || undefined,
      address: row.address || undefined,
      city: row.city || 'São Luís',
      state: row.state || 'MA',
      cep: row.cep || undefined,
      category: row.category,
      paymentTerms: row.paymentTerms || '30 dias',
      paymentTermsDays: row.paymentTermsDays ?? 30,
      defaultPaymentMethod: row.defaultPaymentMethod || 'boleto',
      pixKey: row.pixKey || undefined,
      bankDetails: row.bankDetails || undefined,
      leadTimeDays: row.leadTimeDays ?? 7,
      minOrderValue: row.minOrderValue ? parseFloat(row.minOrderValue) : 0,
      rating: row.rating ? parseFloat(row.rating) : 5.0,
      notes: row.notes || undefined,
      active: row.active,
      isDemo: row.isDemo ?? false,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapPurchaseOrderToEntity(row: PurchaseOrder): PurchaseOrderEntity {
    return {
      id: row.id,
      poNumber: row.poNumber,
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      relatedOrderId: row.relatedOrderId || undefined,
      relatedOrderNumber: row.relatedOrderNumber || undefined,
      status: row.status,
      orderDate: row.orderDate,
      expectedDeliveryDate: row.expectedDeliveryDate,
      receivedDate: row.receivedDate || undefined,
      items: Array.isArray(row.items) ? (row.items as PurchaseOrderItemEntity[]) : [],
      subtotalAmount: parseFloat(row.subtotalAmount),
      freightCost: parseFloat(row.freightCost),
      discountAmount: parseFloat(row.discountAmount),
      totalAmount: parseFloat(row.totalAmount),
      paymentTerms: row.paymentTerms || '30 dias',
      paymentMethod: row.paymentMethod || 'boleto',
      dueDate: row.dueDate,
      invoiceNumber: row.invoiceNumber || undefined,
      notes: row.notes || undefined,
      createdByName: row.createdByName || undefined,
      isDemo: row.isDemo ?? false,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export const supplierRepository = new SupplierRepository();
