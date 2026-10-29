/**
 * DE FARDAS ERP — Client Repository (Drizzle ORM + Resilient Memory Store)
 * Gerencia persistência de clientes garantindo conformidade com PostgreSQL e Drizzle.
 */
import { eq, desc } from 'drizzle-orm';
import { query, db as drizzleDb } from '../db/index';
import { db as fallbackDb } from '../db/connection';
import { clients, Client, NewClient } from '../db/schema/clients';
import { ClientEntity } from '../types/db';

export class ClientRepository {
  public async hasHistory(clientId: string): Promise<boolean> {
    await fallbackDb.ready;
    if (fallbackDb.isConnected()) {
      const result = await query(`SELECT EXISTS(SELECT 1 FROM crm.quotes WHERE client_id=$1)
        OR EXISTS(SELECT 1 FROM producao.production_orders WHERE client_id=$1)
        OR EXISTS(SELECT 1 FROM communication.conversations WHERE client_id=$1) AS found`, [clientId]);
      return result.rows[0].found;
    }
    if (process.env.DATABASE_URL || process.env.NODE_ENV === 'production') throw new Error('PostgreSQL indisponível.');
    return [...fallbackDb.quotes.values()].some((row) => row.clientId === clientId) ||
      [...fallbackDb.orders.values()].some((row) => row.clientId === clientId) ||
      [...fallbackDb.conversations.values()].some((row) => row.clientId === clientId);
  }

  public async findAll(): Promise<ClientEntity[]> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(clients).orderBy(desc(clients.createdAt));
        return rows.map((r) => this.mapToEntity(r));
      } catch (err) {
        throw err;
        console.warn('⚠️ [ClientRepository] Erro na consulta Drizzle ao PostgreSQL. Recorrendo à memória.', err);
      }
    }
    return Array.from(fallbackDb.clients.values());
  }

  public async findById(id: string): Promise<ClientEntity | null> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(clients).where(eq(clients.id, id)).limit(1);
        if (rows.length > 0) {
          return this.mapToEntity(rows[0]);
        }
      } catch (err) {
        throw err;
        console.warn(`⚠️ [ClientRepository] Falha ao buscar cliente ${id} no PostgreSQL.`, err);
      }
    }
    if (fallbackDb.isConnected()) return null;
    return fallbackDb.clients.get(id) || null;
  }

  public async findByCnpj(cnpj: string): Promise<ClientEntity | null> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(clients).where(eq(clients.cnpj, cnpj)).limit(1);
        if (rows.length > 0) {
          return this.mapToEntity(rows[0]);
        }
      } catch (err) {
        throw err;
        console.warn(`⚠️ [ClientRepository] Falha ao buscar CNPJ ${cnpj}.`, err);
      }
    }
    for (const c of fallbackDb.clients.values()) {
      if (c.cnpj === cnpj) return c;
    }
    return null;
  }

  public async save(client: ClientEntity): Promise<ClientEntity> {
    await fallbackDb.ready;
    if (process.env.NODE_ENV === 'production' && !fallbackDb.isConnected()) {
      throw new Error('PostgreSQL indisponível.');
    }
    // Sincroniza sempre o cache em memória
    if (!fallbackDb.isConnected()) fallbackDb.clients.set(client.id, client);

    if (fallbackDb.isConnected()) {
      try {
        const newRecord: NewClient = {
          id: client.id,
          code: client.code,
          companyName: client.companyName,
          tradeName: client.tradeName,
          cnpj: client.cnpj,
          stateRegistration: client.stateRegistration,
          contactName: client.contactName,
          phone: client.phone,
          email: client.email,
          address: client.address,
          city: client.city,
          state: client.state,
          segment: client.segment,
          standardUniformNotes: client.standardUniformNotes,
          totalOrdersCount: client.totalOrdersCount,
          totalSpent: client.totalSpent.toString(),
          isDemo: client.isDemo ?? false,
        };

        await drizzleDb
          .insert(clients)
          .values(newRecord)
          .onConflictDoUpdate({
            target: clients.id,
            set: {
              code: newRecord.code, cnpj: newRecord.cnpj,
              stateRegistration: newRecord.stateRegistration, contactName: newRecord.contactName,
              city: newRecord.city, state: newRecord.state, segment: newRecord.segment,
              companyName: newRecord.companyName,
              tradeName: newRecord.tradeName,
              phone: newRecord.phone,
              email: newRecord.email,
              address: newRecord.address,
              standardUniformNotes: newRecord.standardUniformNotes,
              totalOrdersCount: newRecord.totalOrdersCount,
              totalSpent: newRecord.totalSpent,
              updatedAt: new Date(),
            },
          });
      } catch (err) {
        throw err;
        console.error(`❌ [ClientRepository] Falha ao persistir cliente ${client.id} via Drizzle:`, err);
      }
    }

    return client;
  }

  public async delete(id: string): Promise<void> {
    await fallbackDb.ready;
    if (fallbackDb.isConnected()) await drizzleDb.delete(clients).where(eq(clients.id, id));
    else fallbackDb.clients.delete(id);
  }

  private mapToEntity(row: Client): ClientEntity {
    return {
      id: row.id,
      code: row.code,
      companyName: row.companyName,
      tradeName: row.tradeName,
      cnpj: row.cnpj,
      stateRegistration: row.stateRegistration || undefined,
      contactName: row.contactName,
      phone: row.phone,
      email: row.email,
      address: row.address,
      city: row.city,
      state: row.state,
      segment: row.segment,
      standardUniformNotes: row.standardUniformNotes || undefined,
      totalOrdersCount: row.totalOrdersCount,
      totalSpent: parseFloat(row.totalSpent || '0'),
      isDemo: row.isDemo,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export const clientRepository = new ClientRepository();
