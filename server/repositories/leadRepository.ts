/**
 * DE FARDAS ERP — Lead Repository (Drizzle ORM + Resilient Memory Store)
 */
import { eq, desc } from 'drizzle-orm';
import { db as drizzleDb } from '../db/index';
import { db as fallbackDb } from '../db/connection';
import { leads, Lead, NewLead } from '../db/schema/leads';
import { LeadEntity } from '../types/db';

export class LeadRepository {
  public async findAll(): Promise<LeadEntity[]> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(leads).orderBy(desc(leads.createdAt));
        return rows.map((r) => this.mapToEntity(r));
      } catch (err) {
        if (process.env.NODE_ENV === 'production') throw err;
        console.warn('⚠️ [LeadRepository] Erro na consulta Drizzle ao PostgreSQL. Recorrendo à memória.', err);
      }
    }
    return Array.from(fallbackDb.leads.values());
  }

  public async findById(id: string): Promise<LeadEntity | null> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(leads).where(eq(leads.id, id)).limit(1);
        if (rows.length > 0) {
          return this.mapToEntity(rows[0]);
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'production') throw err;
        console.warn(`⚠️ [LeadRepository] Falha ao buscar lead ${id}.`, err);
      }
    }
    return fallbackDb.leads.get(id) || null;
  }

  public async save(lead: LeadEntity): Promise<LeadEntity> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (process.env.NODE_ENV !== 'production') fallbackDb.leads.set(lead.id, lead);

    if (fallbackDb.isConnected()) {
      try {
        const newRecord: NewLead = {
          id: lead.id,
          leadNumber: lead.leadNumber,
          clientName: lead.clientName,
          companyName: lead.companyName,
          phone: lead.phone,
          email: lead.email,
          category: lead.category,
          estimatedQuantity: lead.estimatedQuantity,
          notes: lead.notes,
          origin: lead.origin || 'portal_publico',
          status: lead.status as any,
          convertedQuoteId: lead.convertedQuoteId,
          isDemo: lead.isDemo ?? false,
        };

        await drizzleDb
          .insert(leads)
          .values(newRecord)
          .onConflictDoUpdate({
            target: leads.id,
            set: {
              status: newRecord.status,
              notes: newRecord.notes,
              convertedQuoteId: newRecord.convertedQuoteId,
            },
          });
      } catch (err) {
        if (process.env.NODE_ENV === 'production') throw err;
        console.error(`❌ [LeadRepository] Falha ao persistir lead ${lead.id} via Drizzle:`, err);
      }
    }

    return lead;
  }

  private mapToEntity(row: Lead): LeadEntity {
    return {
      id: row.id,
      leadNumber: row.leadNumber,
      clientName: row.clientName,
      companyName: row.companyName,
      phone: row.phone,
      email: row.email,
      category: row.category,
      estimatedQuantity: row.estimatedQuantity,
      notes: row.notes || undefined,
      origin: row.origin,
      status: row.status as any,
      convertedQuoteId: row.convertedQuoteId || undefined,
      isDemo: row.isDemo,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

export const leadRepository = new LeadRepository();
