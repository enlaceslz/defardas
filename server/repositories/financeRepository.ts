/**
 * DE FARDAS ERP — Finance Repository (Drizzle ORM + Resilient Memory Store)
 * Gerencia lançamentos financeiros (contas a pagar e receber) e quitações com comprovação real.
 */
import { eq, desc } from 'drizzle-orm';
import { db as drizzleDb } from '../db/index';
import { db as fallbackDb } from '../db/connection';
import { transactions, FinancialTransaction, NewFinancialTransaction } from '../db/schema/finance';
import { FinancialTransactionEntity } from '../types/db';

export class FinanceRepository {
  public async findAll(): Promise<FinancialTransactionEntity[]> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(transactions).orderBy(desc(transactions.createdAt));
        return rows.map((r) => this.mapToEntity(r));
      } catch (err) {
        if (process.env.NODE_ENV === 'production') throw err;
        console.warn('⚠️ [FinanceRepository] Erro ao listar lançamentos via Drizzle. Recorrendo à memória.', err);
      }
    }
    return Array.from(fallbackDb.finance.values());
  }

  public async findById(id: string): Promise<FinancialTransactionEntity | null> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(transactions).where(eq(transactions.id, id)).limit(1);
        if (rows.length > 0) {
          return this.mapToEntity(rows[0]);
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'production') throw err;
        console.warn(`⚠️ [FinanceRepository] Falha ao buscar transação ${id} via Drizzle.`, err);
      }
    }
    return fallbackDb.finance.get(id) || null;
  }

  public async save(tx: FinancialTransactionEntity): Promise<FinancialTransactionEntity> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (process.env.NODE_ENV !== 'production') fallbackDb.finance.set(tx.id, tx);

    if (fallbackDb.isConnected()) {
      try {
        const newRecord: NewFinancialTransaction = {
          id: tx.id,
          transactionNumber: tx.transactionNumber,
          productionOrderId: tx.productionOrderId,
          quoteId: tx.quoteId,
          type: tx.type,
          subType: tx.subType,
          description: tx.description,
          category: tx.category,
          amount: tx.amount.toString(),
          dueDate: tx.dueDate,
          paidDate: tx.paidDate,
          status: tx.status,
          paymentMethod: tx.paymentMethod,
          referenceId: tx.referenceId,
          receiptEvidenceUrl: tx.receiptEvidenceUrl,
          receiptVoucherNumber: tx.receiptVoucherNumber,
          confirmedByName: tx.confirmedByName,
          confirmationNotes: tx.confirmationNotes,
          isDemo: tx.isDemo ?? false,
        };

        await drizzleDb
          .insert(transactions)
          .values(newRecord)
          .onConflictDoUpdate({
            target: transactions.id,
            set: {
              status: newRecord.status,
              paidDate: newRecord.paidDate,
              receiptEvidenceUrl: newRecord.receiptEvidenceUrl,
              receiptVoucherNumber: newRecord.receiptVoucherNumber,
              confirmedByName: newRecord.confirmedByName,
              confirmationNotes: newRecord.confirmationNotes,
              updatedAt: new Date(),
            },
          });
      } catch (err) {
        if (process.env.NODE_ENV === 'production') throw err;
        console.error(`❌ [FinanceRepository] Falha ao persistir transação ${tx.id} via Drizzle:`, err);
      }
    }

    return tx;
  }

  public async delete(id: string): Promise<boolean> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (process.env.NODE_ENV !== 'production') fallbackDb.finance.delete(id);
    if (fallbackDb.isConnected()) {
      try {
        await drizzleDb.delete(transactions).where(eq(transactions.id, id));
        return true;
      } catch (err) {
        if (process.env.NODE_ENV === 'production') throw err;
        console.error(`❌ [FinanceRepository] Falha ao deletar transação ${id} via Drizzle:`, err);
      }
    }
    return true;
  }

  private mapToEntity(row: FinancialTransaction): FinancialTransactionEntity {
    return {
      id: row.id,
      transactionNumber: row.transactionNumber,
      productionOrderId: row.productionOrderId || undefined,
      quoteId: row.quoteId || undefined,
      type: row.type,
      subType: row.subType,
      description: row.description,
      category: row.category,
      amount: parseFloat(row.amount),
      dueDate: row.dueDate,
      paidDate: row.paidDate || undefined,
      status: row.status,
      paymentMethod: row.paymentMethod,
      referenceId: row.referenceId || undefined,
      receiptEvidenceUrl: row.receiptEvidenceUrl || undefined,
      receiptVoucherNumber: row.receiptVoucherNumber || undefined,
      confirmedByName: row.confirmedByName || undefined,
      confirmationNotes: row.confirmationNotes || undefined,
      isDemo: row.isDemo,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export const financeRepository = new FinanceRepository();
