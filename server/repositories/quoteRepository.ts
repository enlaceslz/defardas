/**
 * DE FARDAS ERP — Quote Repository (Drizzle ORM + Resilient Memory Store)
 * Gerencia persistência de propostas comerciais e decomposição de custos no PostgreSQL.
 */
import { eq, desc } from 'drizzle-orm';
import { db as drizzleDb } from '../db/index';
import { db as fallbackDb } from '../db/connection';
import { quotes, quoteItems, Quote, QuoteItem, NewQuote, NewQuoteItem } from '../db/schema/quotes';
import { QuoteEntity, QuoteItemEntity } from '../types/db';

export class QuoteRepository {
  public async findAll(): Promise<QuoteEntity[]> {
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(quotes).orderBy(desc(quotes.createdAt));
        const results: QuoteEntity[] = [];
        for (const row of rows) {
          const items = await drizzleDb.select().from(quoteItems).where(eq(quoteItems.quoteId, row.id));
          results.push(this.mapToEntity(row, items));
        }
        return results;
      } catch (err) {
        console.warn('⚠️ [QuoteRepository] Erro ao listar propostas via Drizzle. Recorrendo à memória.', err);
      }
    }
    return Array.from(fallbackDb.quotes.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public async findById(id: string): Promise<QuoteEntity | null> {
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(quotes).where(eq(quotes.id, id)).limit(1);
        if (rows.length > 0) {
          const items = await drizzleDb.select().from(quoteItems).where(eq(quoteItems.quoteId, id));
          return this.mapToEntity(rows[0], items);
        }
      } catch (err) {
        console.warn(`⚠️ [QuoteRepository] Falha ao buscar proposta ${id} via Drizzle.`, err);
      }
    }
    return fallbackDb.quotes.get(id) || null;
  }

  public async save(quote: QuoteEntity): Promise<QuoteEntity> {
    fallbackDb.quotes.set(quote.id, quote);

    if (fallbackDb.isConnected()) {
      try {
        const newRecord: NewQuote = {
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          version: quote.version,
          clientId: quote.clientId,
          clientName: quote.clientName,
          clientCnpj: quote.clientCnpj,
          sellerId: quote.sellerId,
          sellerName: quote.sellerName,
          commercialStatus: quote.commercialStatus,
          date: quote.date,
          validUntil: quote.validUntil,
          totalBaseCost: quote.totalBaseCost.toString(),
          markupPercentage: quote.markupPercentage.toString(),
          suggestedTotalAmount: quote.suggestedTotalAmount.toString(),
          negotiatedTotalAmount: quote.negotiatedTotalAmount.toString(),
          discountAmount: quote.discountAmount.toString(),
          estimatedMarginPercentage: quote.estimatedMarginPercentage.toString(),
          belowSuggestedAuthorized: quote.belowSuggestedAuthorized,
          authorizedById: quote.authorizedById,
          authorizedByName: quote.authorizedByName,
          authorizationDate: quote.authorizationDate ? new Date(quote.authorizationDate) : null,
          authorizationNotes: quote.authorizationNotes,
          entryPercentage: quote.entryPercentage.toString(),
          entryAmount: quote.entryAmount.toString(),
          balanceAmount: quote.balanceAmount.toString(),
          paymentTerms: quote.paymentTerms,
          productionLeadDays: quote.productionLeadDays,
          artStatus: quote.artStatus || (quote.artApproved ? 'aprovada' : 'pendente'),
          artApproved: quote.artApproved,
          artApprovedBy: quote.artApprovedBy,
          artApprovalDate: quote.artApprovalDate ? new Date(quote.artApprovalDate) : null,
          artFileUrl: quote.artFileUrl,
          artNotes: quote.artNotes,
          artVersions: (quote.artVersions || []) as any,
          versionHistory: (quote.versionHistory || []) as any,
          approvedByName: quote.approvedByName,
          approvedAt: quote.approvedAt ? new Date(quote.approvedAt) : null,
          acceptanceChannel: quote.acceptanceChannel as any,
          acceptanceNotes: quote.acceptanceNotes,
          acceptanceTimestamp: quote.acceptanceTimestamp ? new Date(quote.acceptanceTimestamp) : null,
          notes: quote.notes,
          convertedOrderId: quote.convertedOrderId,
          isLocked: quote.isLocked ?? false,
          isDemo: quote.isDemo ?? false,
        };

        await drizzleDb
          .insert(quotes)
          .values(newRecord)
          .onConflictDoUpdate({
            target: quotes.id,
            set: {
              version: newRecord.version,
              clientId: newRecord.clientId,
              clientName: newRecord.clientName,
              clientCnpj: newRecord.clientCnpj,
              commercialStatus: newRecord.commercialStatus,
              validUntil: newRecord.validUntil,
              totalBaseCost: newRecord.totalBaseCost,
              markupPercentage: newRecord.markupPercentage,
              suggestedTotalAmount: newRecord.suggestedTotalAmount,
              negotiatedTotalAmount: newRecord.negotiatedTotalAmount,
              discountAmount: newRecord.discountAmount,
              estimatedMarginPercentage: newRecord.estimatedMarginPercentage,
              belowSuggestedAuthorized: newRecord.belowSuggestedAuthorized,
              authorizedById: newRecord.authorizedById,
              authorizedByName: newRecord.authorizedByName,
              authorizationDate: newRecord.authorizationDate,
              authorizationNotes: newRecord.authorizationNotes,
              entryAmount: newRecord.entryAmount,
              balanceAmount: newRecord.balanceAmount,
              paymentTerms: newRecord.paymentTerms,
              productionLeadDays: newRecord.productionLeadDays,
              artStatus: newRecord.artStatus,
              artApproved: newRecord.artApproved,
              artApprovedBy: newRecord.artApprovedBy,
              artApprovalDate: newRecord.artApprovalDate,
              artFileUrl: newRecord.artFileUrl,
              artNotes: newRecord.artNotes,
              artVersions: newRecord.artVersions,
              versionHistory: newRecord.versionHistory,
              approvedByName: newRecord.approvedByName,
              approvedAt: newRecord.approvedAt,
              acceptanceChannel: newRecord.acceptanceChannel,
              acceptanceNotes: newRecord.acceptanceNotes,
              acceptanceTimestamp: newRecord.acceptanceTimestamp,
              notes: newRecord.notes,
              convertedOrderId: newRecord.convertedOrderId,
              isLocked: newRecord.isLocked,
              updatedAt: new Date(),
            },
          });

        // Substituir itens de forma consistente em criações e revisões
        await drizzleDb.delete(quoteItems).where(eq(quoteItems.quoteId, quote.id));
        if (quote.items && quote.items.length > 0) {
          for (const it of quote.items) {
            const itemRecord: NewQuoteItem = {
              id: it.id,
              quoteId: quote.id,
              category: it.category,
              modelName: it.modelName,
              fabricName: it.fabricName,
              fabricColor: it.fabricColor,
              sizes: it.sizes,
              totalQuantity: it.totalQuantity,
              materialUnitCost: it.materialUnitCost.toString(),
              outsourcedSewingUnitCost: it.outsourcedSewingUnitCost.toString(),
              customizationUnitCost: it.customizationUnitCost.toString(),
              freightUnitCost: it.freightUnitCost.toString(),
              technicalLossPercentage: it.technicalLossPercentage.toString(),
              calculatedBaseUnitCost: it.calculatedBaseUnitCost.toString(),
              markupPercentage: it.markupPercentage.toString(),
              suggestedUnitPrice: it.suggestedUnitPrice.toString(),
              negotiatedUnitPrice: it.negotiatedUnitPrice.toString(),
              totalItemPrice: it.totalItemPrice.toString(),
              customizations: it.customizations as any,
            };

            await drizzleDb.insert(quoteItems).values(itemRecord);
          }
        }
      } catch (err) {
        console.error(`❌ [QuoteRepository] Falha ao persistir proposta ${quote.id} via Drizzle:`, err);
      }
    }

    return quote;
  }

  public async delete(id: string): Promise<boolean> {
    fallbackDb.quotes.delete(id);
    if (fallbackDb.isConnected()) {
      try {
        await drizzleDb.delete(quotes).where(eq(quotes.id, id));
        return true;
      } catch (err) {
        console.error(`❌ [QuoteRepository] Falha ao deletar proposta ${id} via Drizzle:`, err);
      }
    }
    return true;
  }

  private mapToEntity(row: Quote, items: QuoteItem[]): QuoteEntity {
    return {
      id: row.id,
      quoteNumber: row.quoteNumber,
      version: row.version,
      clientId: row.clientId,
      clientName: row.clientName,
      clientCnpj: row.clientCnpj || '00.000.000/0001-00',
      sellerName: row.sellerName,
      commercialStatus: row.commercialStatus as any,
      date: row.date,
      validUntil: row.validUntil,
      totalBaseCost: parseFloat(row.totalBaseCost),
      markupPercentage: parseFloat(row.markupPercentage),
      suggestedTotalAmount: parseFloat(row.suggestedTotalAmount),
      negotiatedTotalAmount: parseFloat(row.negotiatedTotalAmount),
      discountAmount: parseFloat(row.discountAmount),
      estimatedMarginPercentage: parseFloat(row.estimatedMarginPercentage),
      belowSuggestedAuthorized: row.belowSuggestedAuthorized,
      authorizedByName: row.authorizedByName || undefined,
      authorizationDate: row.authorizationDate ? row.authorizationDate.toISOString() : undefined,
      authorizationNotes: row.authorizationNotes || undefined,
      entryPercentage: 50.00 as const,
      entryAmount: parseFloat(row.entryAmount),
      balanceAmount: parseFloat(row.balanceAmount),
      paymentTerms: row.paymentTerms,
      productionLeadDays: row.productionLeadDays,
      artStatus: (row.artStatus as any) || (row.artApproved ? 'aprovada' : 'pendente'),
      artApproved: row.artApproved,
      artApprovedBy: row.artApprovedBy || undefined,
      artApprovalDate: row.artApprovalDate ? row.artApprovalDate.toISOString() : undefined,
      artFileUrl: row.artFileUrl || undefined,
      artNotes: row.artNotes || undefined,
      artVersions: Array.isArray(row.artVersions) ? (row.artVersions as any) : [],
      versionHistory: Array.isArray(row.versionHistory) ? (row.versionHistory as any) : [],
      approvedByName: row.approvedByName || undefined,
      approvedAt: row.approvedAt ? row.approvedAt.toISOString() : undefined,
      acceptanceChannel: row.acceptanceChannel as any,
      acceptanceNotes: row.acceptanceNotes || undefined,
      acceptanceTimestamp: row.acceptanceTimestamp ? row.acceptanceTimestamp.toISOString() : undefined,
      notes: row.notes || undefined,
      convertedOrderId: row.convertedOrderId || undefined,
      isLocked: row.isLocked,
      isDemo: row.isDemo,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      items: items.map((it) => ({
        id: it.id,
        quoteId: it.quoteId,
        category: it.category,
        modelName: it.modelName,
        fabricName: it.fabricName,
        fabricColor: it.fabricColor,
        sizes: (it.sizes as any) || { pp: 0, p: 0, m: 0, g: 0, gg: 0, xg: 0, exg: 0, sobMedida: 0 },
        totalQuantity: it.totalQuantity,
        materialUnitCost: parseFloat(it.materialUnitCost),
        outsourcedSewingUnitCost: parseFloat(it.outsourcedSewingUnitCost),
        customizationUnitCost: parseFloat(it.customizationUnitCost),
        freightUnitCost: parseFloat(it.freightUnitCost),
        technicalLossPercentage: parseFloat(it.technicalLossPercentage),
        calculatedBaseUnitCost: parseFloat(it.calculatedBaseUnitCost),
        markupPercentage: parseFloat(it.markupPercentage),
        suggestedUnitPrice: parseFloat(it.suggestedUnitPrice),
        negotiatedUnitPrice: parseFloat(it.negotiatedUnitPrice),
        totalItemPrice: parseFloat(it.totalItemPrice),
        customizations: (it.customizations as any) || [],
      })),
    };
  }
}

export const quoteRepository = new QuoteRepository();
