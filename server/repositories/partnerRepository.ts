/**
 * DE FARDAS ERP — Partner & Custody Repository (Drizzle ORM + Resilient Memory Store)
 * Gerencia parceiros terceirizados (facções, bordado, silk-screen, acabamento, corte externo)
 * e rastreabilidade de materiais sob custódia de terceiros (estoque.partner_custody).
 */
import { eq, desc } from 'drizzle-orm';
import { db as drizzleDb } from '../db/index';
import { db as fallbackDb } from '../db/connection';
import {
  partners,
  partnerCustody,
  Partner,
  NewPartner,
  PartnerCustody,
  NewPartnerCustody,
} from '../db/schema/partners';
import { PartnerEntity, PartnerCustodyEntity } from '../types/db';
import { addressMetadataService, extractAddressGeoMetadata } from '../services/addressMetadataService';

export class PartnerRepository {
  // =========================================================================
  // PARCEIROS & TERCEIRIZADOS
  // =========================================================================

  public async findAll(): Promise<PartnerEntity[]> {
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(partners).orderBy(desc(partners.createdAt));
        return addressMetadataService.enrichMany(
          'partner',
          rows.map((row) => this.mapPartnerToEntity(row))
        );
      } catch (err) {
        console.warn('⚠️ [PartnerRepository] Erro ao listar parceiros via Drizzle. Recorrendo à memória.', err);
      }
    }
    const list = Array.from(fallbackDb.partners.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return addressMetadataService.enrichMany('partner', list);
  }

  public async findById(id: string): Promise<PartnerEntity | null> {
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(partners).where(eq(partners.id, id)).limit(1);
        if (rows.length > 0) {
          return addressMetadataService.enrich('partner', this.mapPartnerToEntity(rows[0]));
        }
      } catch (err) {
        console.warn(`⚠️ [PartnerRepository] Erro ao buscar parceiro ${id} via Drizzle.`, err);
      }
    }
    const mem = fallbackDb.partners.get(id);
    return mem ? addressMetadataService.enrich('partner', mem) : null;
  }

  public async save(partner: PartnerEntity): Promise<PartnerEntity> {
    fallbackDb.partners.set(partner.id, partner);

    if (fallbackDb.isConnected()) {
      try {
        const record: NewPartner = {
          id: partner.id,
          code: partner.code,
          name: partner.name,
          tradeName: partner.tradeName,
          cnpjCpf: partner.cnpjCpf,
          phone: partner.phone,
          email: partner.email,
          address: partner.address,
          city: partner.city || 'São Luís',
          state: partner.state || 'MA',
          cep: partner.cep,
          partnerType: partner.partnerType,
          capacityPiecesPerMonth: partner.capacityPiecesPerMonth,
          defaultCostPerPiece: (partner.defaultCostPerPiece ?? 0).toFixed(2),
          leadTimeDays: partner.leadTimeDays ?? 5,
          pixKey: partner.pixKey,
          rating: partner.rating.toFixed(2),
          notes: partner.notes,
          active: partner.active,
          isDemo: partner.isDemo ?? false,
        };

        await drizzleDb
          .insert(partners)
          .values(record)
          .onConflictDoUpdate({
            target: partners.id,
            set: {
              name: record.name,
              tradeName: record.tradeName,
              cnpjCpf: record.cnpjCpf,
              phone: record.phone,
              email: record.email,
              address: record.address,
              city: record.city,
              state: record.state,
              cep: record.cep,
              partnerType: record.partnerType,
              capacityPiecesPerMonth: record.capacityPiecesPerMonth,
              defaultCostPerPiece: record.defaultCostPerPiece,
              leadTimeDays: record.leadTimeDays,
              pixKey: record.pixKey,
              rating: record.rating,
              notes: record.notes,
              active: record.active,
              updatedAt: new Date(),
            },
          });
      } catch (err) {
        console.error(`❌ [PartnerRepository] Falha ao persistir parceiro ${partner.id} via Drizzle:`, err);
      }
    }

    await addressMetadataService.set('partner', partner.id, extractAddressGeoMetadata(partner));
    return partner;
  }

  public async delete(id: string): Promise<boolean> {
    fallbackDb.partners.delete(id);
    await addressMetadataService.delete('partner', id);
    if (fallbackDb.isConnected()) {
      try {
        await drizzleDb.delete(partners).where(eq(partners.id, id));
      } catch (err) {
        console.error(`❌ [PartnerRepository] Falha ao excluir parceiro ${id} via Drizzle:`, err);
      }
    }
    return true;
  }

  // =========================================================================
  // CUSTÓDIA DE MATERIAIS EM PODER DE TERCEIROS (estoque.partner_custody)
  // =========================================================================

  public async findAllCustody(): Promise<PartnerCustodyEntity[]> {
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb
          .select()
          .from(partnerCustody)
          .orderBy(desc(partnerCustody.createdAt));
        return rows.map((row) => this.mapCustodyToEntity(row));
      } catch (err) {
        console.warn('⚠️ [PartnerRepository] Erro ao listar custódia via Drizzle. Recorrendo à memória.', err);
      }
    }
    return Array.from(fallbackDb.partnerCustodies.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public async findCustodyByPartner(partnerId: string): Promise<PartnerCustodyEntity[]> {
    const all = await this.findAllCustody();
    return all.filter((c) => c.partnerId === partnerId);
  }

  public async findCustodyById(id: string): Promise<PartnerCustodyEntity | null> {
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb
          .select()
          .from(partnerCustody)
          .where(eq(partnerCustody.id, id))
          .limit(1);
        if (rows.length > 0) return this.mapCustodyToEntity(rows[0]);
      } catch (err) {
        console.warn(`⚠️ [PartnerRepository] Erro ao buscar custódia ${id} via Drizzle.`, err);
      }
    }
    return fallbackDb.partnerCustodies.get(id) || null;
  }

  public async saveCustody(custody: PartnerCustodyEntity): Promise<PartnerCustodyEntity> {
    fallbackDb.partnerCustodies.set(custody.id, custody);

    if (fallbackDb.isConnected()) {
      try {
        const record: NewPartnerCustody = {
          id: custody.id,
          partnerId: custody.partnerId,
          itemId: custody.itemId,
          productionOrderId: custody.productionOrderId || null,
          remittanceMovementId: custody.remittanceMovementId || null,
          sentQuantity: custody.sentQuantity.toFixed(2),
          returnedQuantity: custody.returnedQuantity.toFixed(2),
          lostQuantity: custody.lostQuantity.toFixed(2),
          unit: custody.unit,
          sentDate: custody.sentDate,
          status: custody.status,
          notes: custody.notes,
        };

        await drizzleDb
          .insert(partnerCustody)
          .values(record)
          .onConflictDoUpdate({
            target: partnerCustody.id,
            set: {
              returnedQuantity: record.returnedQuantity,
              lostQuantity: record.lostQuantity,
              status: record.status,
              notes: record.notes,
              updatedAt: new Date(),
            },
          });
      } catch (err) {
        console.error(`❌ [PartnerRepository] Falha ao persistir custódia ${custody.id} via Drizzle:`, err);
      }
    }

    return custody;
  }

  // =========================================================================
  // MAPPERS
  // =========================================================================

  private mapPartnerToEntity(row: Partner): PartnerEntity {
    const cached = fallbackDb.partners.get(row.id);
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      tradeName: row.tradeName,
      cnpjCpf: row.cnpjCpf || undefined,
      phone: row.phone,
      email: row.email || undefined,
      address: row.address || undefined,
      city: row.city || 'São Luís',
      state: row.state || cached?.state || 'MA',
      cep: row.cep || cached?.cep,
      partnerType: row.partnerType,
      capacityPiecesPerMonth: row.capacityPiecesPerMonth || undefined,
      defaultCostPerPiece:
        row.defaultCostPerPiece !== null && row.defaultCostPerPiece !== undefined
          ? parseFloat(row.defaultCostPerPiece)
          : cached?.defaultCostPerPiece ?? 0,
      leadTimeDays: row.leadTimeDays ?? cached?.leadTimeDays ?? 5,
      pixKey: row.pixKey || cached?.pixKey,
      rating: row.rating ? parseFloat(row.rating) : 5.0,
      notes: row.notes || cached?.notes,
      active: row.active,
      isDemo: row.isDemo ?? cached?.isDemo ?? false,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapCustodyToEntity(row: PartnerCustody): PartnerCustodyEntity {
    return {
      id: row.id,
      partnerId: row.partnerId,
      itemId: row.itemId,
      productionOrderId: row.productionOrderId || undefined,
      remittanceMovementId: row.remittanceMovementId || undefined,
      sentQuantity: parseFloat(row.sentQuantity),
      returnedQuantity: parseFloat(row.returnedQuantity),
      lostQuantity: parseFloat(row.lostQuantity),
      unit: row.unit,
      sentDate: row.sentDate,
      status: row.status,
      notes: row.notes || undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export const partnerRepository = new PartnerRepository();
