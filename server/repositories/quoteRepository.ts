/**
 * DE FARDAS ERP — Quote Repository (Drizzle ORM + Resilient Memory Store)
 * Gerencia persistência de propostas comerciais e decomposição de custos no PostgreSQL.
 */
import { eq, desc, asc } from 'drizzle-orm';
import { query, db as drizzleDb } from '../db/index';
import { db as fallbackDb } from '../db/connection';
import { quotes, quoteItems, Quote, QuoteItem, NewQuote, NewQuoteItem } from '../db/schema/quotes';
import { QuoteEntity, QuoteItemEntity } from '../types/db';

export class QuoteRepository {
  public async hasHistory(quoteId: string): Promise<boolean> {
    await fallbackDb.ready;
    if (fallbackDb.isConnected()) {
      const result = await query(`SELECT EXISTS(SELECT 1 FROM producao.production_orders WHERE quote_id=$1)
        OR EXISTS(SELECT 1 FROM financeiro.transactions WHERE quote_id=$1)
        OR EXISTS(SELECT 1 FROM crm.leads WHERE converted_quote_id=$1) AS found`, [quoteId]);
      return result.rows[0].found;
    }
    if (process.env.DATABASE_URL || process.env.NODE_ENV === 'production') throw new Error('PostgreSQL indisponível.');
    return [...fallbackDb.orders.values()].some((row) => row.quoteId === quoteId) ||
      [...fallbackDb.finance.values()].some((row) => row.quoteId === quoteId) ||
      [...fallbackDb.leads.values()].some((row) => row.convertedQuoteId === quoteId);
  }

  public async findAll(): Promise<QuoteEntity[]> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (fallbackDb.isConnected()) {
      try {
        // Um único snapshot SQL para propostas e itens; evita N+1 e leituras partidas.
        const rows = await drizzleDb.select({ quote: quotes, item: quoteItems }).from(quotes)
          .leftJoin(quoteItems, eq(quoteItems.quoteId, quotes.id))
          .orderBy(desc(quotes.createdAt), asc(quotes.id), asc(quoteItems.id));
        const grouped = new Map<string, { quote: Quote; items: QuoteItem[] }>();
        for (const row of rows) {
          let entry = grouped.get(row.quote.id);
          if (!entry) {
            entry = { quote: row.quote, items: [] };
            grouped.set(row.quote.id, entry);
          }
          if (row.item) entry.items.push(row.item);
        }
        return Array.from(grouped.values(), ({ quote, items }) => this.mapToEntity(quote, items));
      } catch (err) {
        throw err;
        console.warn('⚠️ [QuoteRepository] Erro ao listar propostas via Drizzle. Recorrendo à memória.', err);
      }
    }
    return Array.from(fallbackDb.quotes.values());
  }

  public async findById(id: string): Promise<QuoteEntity | null> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(quotes).where(eq(quotes.id, id)).limit(1);
        if (rows.length > 0) {
          const items = await drizzleDb.select().from(quoteItems).where(eq(quoteItems.quoteId, id));
          return this.mapToEntity(rows[0], items);
        }
      } catch (err) {
        throw err;
        console.warn(`⚠️ [QuoteRepository] Falha ao buscar proposta ${id} via Drizzle.`, err);
      }
    }
    if (fallbackDb.isConnected()) return null;
    return fallbackDb.quotes.get(id) || null;
  }

  public async save(quote: QuoteEntity): Promise<QuoteEntity> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (!fallbackDb.isConnected()) fallbackDb.quotes.set(quote.id, quote);

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
          artApproved: quote.artApproved,
          artApprovedBy: quote.artApprovedBy,
          artApprovalDate: quote.artApprovalDate ? new Date(quote.artApprovalDate) : null,
          artFileUrl: quote.artFileUrl,
          artNotes: quote.artNotes,
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
              commercialStatus: newRecord.commercialStatus,
              artApproved: newRecord.artApproved,
              artApprovedBy: newRecord.artApprovedBy,
              artApprovalDate: newRecord.artApprovalDate,
              convertedOrderId: newRecord.convertedOrderId,
              isLocked: newRecord.isLocked,
              updatedAt: new Date(),
            },
          });

        // Gravar ou atualizar itens
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

            await drizzleDb
              .insert(quoteItems)
              .values(itemRecord)
              .onConflictDoNothing();
          }
        }
      } catch (err) {
        throw err;
        console.error(`❌ [QuoteRepository] Falha ao persistir proposta ${quote.id} via Drizzle:`, err);
      }
    }

    return quote;
  }

  public async delete(id: string): Promise<boolean> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (!fallbackDb.isConnected()) fallbackDb.quotes.delete(id);
    if (fallbackDb.isConnected()) {
      try {
        await drizzleDb.delete(quotes).where(eq(quotes.id, id));
        return true;
      } catch (err) {
        throw err;
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
      artApproved: row.artApproved,
      artApprovedBy: row.artApprovedBy || undefined,
      artApprovalDate: row.artApprovalDate ? row.artApprovalDate.toISOString() : undefined,
      artFileUrl: row.artFileUrl || undefined,
      artNotes: row.artNotes || undefined,
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
