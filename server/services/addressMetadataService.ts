/**
 * DE FARDAS ERP — Address & Geo Metadata Persistence Service
 * Armazena e hidrata campos estruturados de endereço (CEP, logradouro, número,
 * complemento, bairro) e coordenadas geográficas (latitude, longitude, precisão)
 * para Clientes, Parceiros/Facções e Fornecedores usando core.event_log + cache ativo,
 * sem quebrar o schema relacional existente no PostgreSQL.
 */
import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db as drizzleDb } from '../db/index';
import { db as connDb } from '../db/connection';
import { eventLog } from '../db/schema/audit';

export type GeoPrecision = 'numero' | 'logradouro' | 'cep' | 'cidade' | 'manual';
export type AddressEntityType = 'client' | 'partner' | 'supplier';

export interface AddressGeoMetadata {
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  latitude?: number;
  longitude?: number;
  geoPrecision?: GeoPrecision;
  geoSource?: string;
}

const EVENT_TYPE_GEO = 'ENTITY_ADDRESS_GEO';
const VALID_GEO_PRECISIONS = new Set<GeoPrecision>([
  'numero',
  'logradouro',
  'cep',
  'cidade',
  'manual',
]);

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) < 0.00001 && Math.abs(lng) < 0.00001) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function normalizeCepString(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length === 8) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  const trimmed = raw.trim().slice(0, 12);
  return trimmed || undefined;
}

export function composeServerAddressLine(parts: {
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
}): string {
  const street = (parts.street || '').trim();
  const num = (parts.number || '').trim();
  const comp = (parts.complement || '').trim();
  const neigh = (parts.neighborhood || '').trim();

  if (!street && !neigh) return '';

  let head = street;
  if (num) {
    head = head ? `${head}, ${num}` : num;
  }
  if (comp) {
    head = head ? `${head} (${comp})` : comp;
  }
  if (neigh) {
    head = head ? `${head} - ${neigh}` : neigh;
  }
  return head.slice(0, 240);
}

export function sanitizeAddressGeoInput(
  body: any,
  existing?: AddressGeoMetadata
): AddressGeoMetadata {
  const safeBody = body && typeof body === 'object' ? body : {};

  const cep =
    safeBody.cep !== undefined
      ? normalizeCepString(safeBody.cep)
      : existing?.cep;

  const street =
    safeBody.street !== undefined
      ? typeof safeBody.street === 'string'
        ? safeBody.street.trim().slice(0, 180) || undefined
        : undefined
      : existing?.street;

  const number =
    safeBody.number !== undefined
      ? typeof safeBody.number === 'string' || typeof safeBody.number === 'number'
        ? String(safeBody.number).trim().slice(0, 30) || undefined
        : undefined
      : existing?.number;

  const complement =
    safeBody.complement !== undefined
      ? typeof safeBody.complement === 'string'
        ? safeBody.complement.trim().slice(0, 120) || undefined
        : undefined
      : existing?.complement;

  const neighborhood =
    safeBody.neighborhood !== undefined
      ? typeof safeBody.neighborhood === 'string'
        ? safeBody.neighborhood.trim().slice(0, 120) || undefined
        : undefined
      : existing?.neighborhood;

  let latitude = existing?.latitude;
  let longitude = existing?.longitude;

  const hasLatField = safeBody.latitude !== undefined;
  const hasLngField = safeBody.longitude !== undefined;

  if (hasLatField || hasLngField) {
    if (
      safeBody.latitude === null ||
      safeBody.longitude === null ||
      safeBody.latitude === '' ||
      safeBody.longitude === ''
    ) {
      latitude = undefined;
      longitude = undefined;
    } else {
      const parsedLat = Number(safeBody.latitude);
      const parsedLng = Number(safeBody.longitude);
      if (isValidLatLng(parsedLat, parsedLng)) {
        latitude = Math.round(parsedLat * 1_000_000) / 1_000_000;
        longitude = Math.round(parsedLng * 1_000_000) / 1_000_000;
      }
    }
  }

  let geoPrecision: GeoPrecision | undefined = existing?.geoPrecision;
  if (safeBody.geoPrecision !== undefined) {
    const candidate = String(safeBody.geoPrecision || '').trim() as GeoPrecision;
    geoPrecision = VALID_GEO_PRECISIONS.has(candidate) ? candidate : undefined;
  }
  if (latitude === undefined || longitude === undefined) {
    geoPrecision = undefined;
  }

  const geoSource =
    latitude !== undefined && longitude !== undefined
      ? safeBody.geoSource !== undefined
        ? typeof safeBody.geoSource === 'string'
          ? safeBody.geoSource.trim().slice(0, 80) || undefined
          : undefined
        : existing?.geoSource
      : undefined;

  return {
    cep,
    street,
    number,
    complement,
    neighborhood,
    latitude,
    longitude,
    geoPrecision,
    geoSource,
  };
}

export function extractAddressGeoMetadata(entity: AddressGeoMetadata): AddressGeoMetadata {
  const out: AddressGeoMetadata = {};
  if (entity.cep) out.cep = entity.cep;
  if (entity.street) out.street = entity.street;
  if (entity.number) out.number = entity.number;
  if (entity.complement) out.complement = entity.complement;
  if (entity.neighborhood) out.neighborhood = entity.neighborhood;
  if (isValidLatLng(entity.latitude, entity.longitude)) {
    out.latitude = entity.latitude;
    out.longitude = entity.longitude;
    if (entity.geoPrecision) out.geoPrecision = entity.geoPrecision;
    if (entity.geoSource) out.geoSource = entity.geoSource;
  }
  return out;
}

class AddressMetadataService {
  private cache: Map<string, AddressGeoMetadata> = new Map();
  private hydrated = false;
  private hydratePromise: Promise<void> | null = null;

  private makeKey(type: AddressEntityType, id: string): string {
    return `${type}:${id}`;
  }

  public async ensureHydrated(): Promise<void> {
    if (this.hydrated) return;
    if (!connDb.isConnected()) {
      this.hydrated = true;
      return;
    }
    if (this.hydratePromise) return this.hydratePromise;

    this.hydratePromise = (async () => {
      try {
        const rows = await drizzleDb
          .select()
          .from(eventLog)
          .where(eq(eventLog.eventType, EVENT_TYPE_GEO));
        for (const row of rows) {
          if (row.errorMessage && row.payload && typeof row.payload === 'object') {
            this.cache.set(row.errorMessage, row.payload as AddressGeoMetadata);
          }
        }
        this.hydrated = true;
      } catch (err) {
        console.warn('⚠️ [AddressMetadataService] Falha ao hidratar metadados geo do PostgreSQL:', err);
      } finally {
        this.hydratePromise = null;
      }
    })();

    return this.hydratePromise;
  }

  public async get(type: AddressEntityType, id: string): Promise<AddressGeoMetadata | undefined> {
    await this.ensureHydrated();
    return this.cache.get(this.makeKey(type, id));
  }

  public async enrich<T extends AddressGeoMetadata & { id: string }>(
    type: AddressEntityType,
    entity: T
  ): Promise<T> {
    const meta = await this.get(type, entity.id);
    if (!meta) return entity;
    return {
      ...entity,
      cep: entity.cep || meta.cep,
      street: entity.street || meta.street,
      number: entity.number || meta.number,
      complement: entity.complement || meta.complement,
      neighborhood: entity.neighborhood || meta.neighborhood,
      latitude: isValidLatLng(entity.latitude, entity.longitude) ? entity.latitude : meta.latitude,
      longitude: isValidLatLng(entity.latitude, entity.longitude) ? entity.longitude : meta.longitude,
      geoPrecision: entity.geoPrecision || meta.geoPrecision,
      geoSource: entity.geoSource || meta.geoSource,
    };
  }

  public async enrichMany<T extends AddressGeoMetadata & { id: string }>(
    type: AddressEntityType,
    entities: T[]
  ): Promise<T[]> {
    await this.ensureHydrated();
    return entities.map((entity) => {
      const meta = this.cache.get(this.makeKey(type, entity.id));
      if (!meta) return entity;
      return {
        ...entity,
        cep: entity.cep || meta.cep,
        street: entity.street || meta.street,
        number: entity.number || meta.number,
        complement: entity.complement || meta.complement,
        neighborhood: entity.neighborhood || meta.neighborhood,
        latitude: isValidLatLng(entity.latitude, entity.longitude) ? entity.latitude : meta.latitude,
        longitude: isValidLatLng(entity.latitude, entity.longitude) ? entity.longitude : meta.longitude,
        geoPrecision: entity.geoPrecision || meta.geoPrecision,
        geoSource: entity.geoSource || meta.geoSource,
      };
    });
  }

  public async set(type: AddressEntityType, id: string, meta: AddressGeoMetadata): Promise<void> {
    const key = this.makeKey(type, id);
    const clean = extractAddressGeoMetadata(meta);
    const hasData = Object.keys(clean).length > 0;

    if (!hasData) {
      await this.delete(type, id);
      return;
    }

    this.cache.set(key, clean);

    if (connDb.isConnected()) {
      try {
        const existing = await drizzleDb
          .select({ id: eventLog.id })
          .from(eventLog)
          .where(and(eq(eventLog.eventType, EVENT_TYPE_GEO), eq(eventLog.errorMessage, key)))
          .limit(1);

        const now = new Date();
        if (existing.length > 0) {
          await drizzleDb
            .update(eventLog)
            .set({ payload: clean as any, processedAt: now })
            .where(eq(eventLog.id, existing[0].id));
        } else {
          await drizzleDb.insert(eventLog).values({
            id: crypto.randomUUID(),
            eventType: EVENT_TYPE_GEO,
            status: 'completed',
            retryCount: '0',
            errorMessage: key,
            payload: clean as any,
            processedAt: now,
            createdAt: now,
          });
        }
      } catch (err) {
        console.warn(`⚠️ [AddressMetadataService] Falha ao persistir metadados geo para ${key}:`, err);
      }
    }
  }

  public async delete(type: AddressEntityType, id: string): Promise<void> {
    const key = this.makeKey(type, id);
    this.cache.delete(key);

    if (connDb.isConnected()) {
      try {
        await drizzleDb
          .delete(eventLog)
          .where(and(eq(eventLog.eventType, EVENT_TYPE_GEO), eq(eventLog.errorMessage, key)));
      } catch {
        // Ignora erro de limpeza
      }
    }
  }
}

export const addressMetadataService = new AddressMetadataService();
