/**
 * DE FARDAS ERP — Shared Location & Route Service
 * Gera, persiste, valida e revoga links compartilháveis de endereço e coordenadas
 * para abertura em mapa interativo com traçado de rota via WhatsApp (?mapa=<token>).
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { and, desc, eq } from 'drizzle-orm';
import { db as drizzleDb } from '../db/index';
import { db as connDb } from '../db/connection';
import { eventLog } from '../db/schema/audit';
import { auditService } from './auditService';
import { AuthenticatedUser } from '../auth/rbac';
import {
  GeoPrecision,
  composeServerAddressLine,
  isValidLatLng,
  normalizeCepString,
} from './addressMetadataService';

export type LocationEntityType = 'client' | 'partner' | 'supplier' | 'company';

export interface LocationSharePayload {
  locationCode: string;
  entityType: LocationEntityType;
  entityId?: string;
  title: string;
  subtitle?: string;
  contactName?: string;
  phone?: string;
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city: string;
  state: string;
  fullAddressLine: string;
  latitude: number;
  longitude: number;
  geoPrecision?: GeoPrecision;
  notes?: string;
  company: {
    tradeName: string;
    name: string;
    phone: string;
    whatsapp?: string;
    email: string;
    city: string;
    state: string;
    logoUrl?: string;
  };
}

export interface StoredSharedLocationRecord {
  id: string;
  tokenHash: string;
  locationCode: string;
  entityType: LocationEntityType;
  title: string;
  fullAddressLine: string;
  createdById: string;
  createdByName: string;
  createdByRole: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  revokedByName?: string | null;
  accessCount: number;
  lastAccessedAt?: string | null;
  recipientLabel?: string | null;
  location: LocationSharePayload;
}

const EVENT_TYPE_LOCATION_SHARE = 'LOCATION_SHARE';
const TOKEN_REGEX = /^[A-Za-z0-9_-]{20,96}$/;
const DEV_STORE_PATH = path.join(os.tmpdir(), 'defardas-dev-location-shares.json');
const ALLOWED_ENTITY_TYPES = new Set<LocationEntityType>([
  'client',
  'partner',
  'supplier',
  'company',
]);
const ALLOWED_PRECISIONS = new Set<GeoPrecision>([
  'numero',
  'logradouro',
  'cep',
  'cidade',
  'manual',
]);

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function clampString(value: unknown, maxLen: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, maxLen);
}

function sanitizeLogoUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed.slice(0, 500);
  }
  if (/^https:\/\//i.test(trimmed)) {
    return trimmed.slice(0, 1000);
  }
  if (/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(trimmed) && trimmed.length <= 250_000) {
    return trimmed;
  }
  return undefined;
}

export function sanitizeLocationSharePayload(
  raw: any
): LocationSharePayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Dados da localização inválidos.');
  }

  const entityType = String(raw.entityType || 'client').trim() as LocationEntityType;
  if (!ALLOWED_ENTITY_TYPES.has(entityType)) {
    throw new Error('Tipo de entidade inválido para compartilhamento de mapa.');
  }

  const title = clampString(raw.title, 180);
  if (title.length < 2) {
    throw new Error('Nome/título do ponto de destino é obrigatório.');
  }

  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  if (!isValidLatLng(latitude, longitude)) {
    throw new Error('Coordenadas geográficas válidas (latitude e longitude) são obrigatórias para traçar rota.');
  }

  const cep = normalizeCepString(raw.cep);
  const street = clampString(raw.street, 180) || undefined;
  const number = clampString(raw.number !== undefined ? String(raw.number) : '', 30) || undefined;
  const complement = clampString(raw.complement, 120) || undefined;
  const neighborhood = clampString(raw.neighborhood, 120) || undefined;
  const city = clampString(raw.city, 80, 'São Luís');
  const state = clampString(raw.state, 10, 'MA').toUpperCase().slice(0, 2) || 'MA';

  const composed = composeServerAddressLine({ street, number, complement, neighborhood });
  const rawFullLine = clampString(raw.fullAddressLine, 320);
  const fallbackFullLine = [composed, `${city}/${state}`, cep ? `CEP ${cep}` : '']
    .filter(Boolean)
    .join(' · ');
  const fullAddressLine = rawFullLine || fallbackFullLine;
  if (!fullAddressLine) {
    throw new Error('Informe o endereço completo do destino.');
  }

  const rawPrecision = String(raw.geoPrecision || '').trim() as GeoPrecision;
  const geoPrecision = ALLOWED_PRECISIONS.has(rawPrecision) ? rawPrecision : undefined;

  const rawCompany = raw.company && typeof raw.company === 'object' ? raw.company : {};
  const company = {
    tradeName: clampString(rawCompany.tradeName, 120, 'DE FARDAS'),
    name: clampString(rawCompany.name, 160, 'DE FARDAS CONFECÇÕES & UNIFORMES LTDA'),
    phone: clampString(rawCompany.phone, 40),
    whatsapp: clampString(rawCompany.whatsapp, 40) || undefined,
    email: clampString(rawCompany.email, 120),
    city: clampString(rawCompany.city, 80, 'São Luís'),
    state: clampString(rawCompany.state, 10, 'MA').toUpperCase().slice(0, 2) || 'MA',
    logoUrl: sanitizeLogoUrl(rawCompany.logoUrl),
  };

  return {
    locationCode: clampString(raw.locationCode, 60, `MAP-${Date.now().toString().slice(-6)}`),
    entityType,
    entityId: clampString(raw.entityId, 80) || undefined,
    title,
    subtitle: clampString(raw.subtitle, 160) || undefined,
    contactName: clampString(raw.contactName, 120) || undefined,
    phone: clampString(raw.phone, 40) || undefined,
    cep,
    street,
    number,
    complement,
    neighborhood,
    city,
    state,
    fullAddressLine,
    latitude: Math.round(latitude * 1_000_000) / 1_000_000,
    longitude: Math.round(longitude * 1_000_000) / 1_000_000,
    geoPrecision,
    notes: clampString(raw.notes, 400) || undefined,
    company,
  };
}

class LocationShareService {
  private byTokenHash: Map<string, StoredSharedLocationRecord> = new Map();
  private byId: Map<string, StoredSharedLocationRecord> = new Map();
  private devStoreLoaded = false;

  private ensureDevStoreLoaded(): void {
    if (this.devStoreLoaded || process.env.NODE_ENV === 'production') return;
    this.devStoreLoaded = true;
    try {
      if (!fs.existsSync(DEV_STORE_PATH)) return;
      const raw = fs.readFileSync(DEV_STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const rec of parsed) {
          if (rec && typeof rec === 'object' && rec.id && rec.tokenHash) {
            this.byId.set(rec.id, rec);
            this.byTokenHash.set(rec.tokenHash, rec);
          }
        }
      }
    } catch {
      // Ignora arquivo corrompido ou indisponível em dev
    }
  }

  private persistDevStore(): void {
    if (process.env.NODE_ENV === 'production') return;
    try {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const records = Array.from(this.byId.values())
        .filter((rec) => {
          const exp = new Date(rec.expiresAt).getTime();
          return Number.isNaN(exp) || exp >= cutoff;
        })
        .slice(-250);
      fs.writeFileSync(DEV_STORE_PATH, JSON.stringify(records), 'utf8');
    } catch {
      // Ignora erro de escrita temporária
    }
  }

  public async createShare(params: {
    location: LocationSharePayload;
    actor: AuthenticatedUser;
    expiresInHours?: number;
    recipientLabel?: string;
    ipAddress?: string;
  }): Promise<{
    id: string;
    token: string;
    locationCode: string;
    expiresAt: string;
    createdAt: string;
  }> {
    this.ensureDevStoreLoaded();
    const hours = Math.min(720, Math.max(1, Math.round(Number(params.expiresInHours || 168))));
    const now = new Date();
    const expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
    const createdAt = now.toISOString();
    const id = crypto.randomUUID();
    const token = crypto.randomBytes(24).toString('base64url');
    const tokenHash = hashToken(token);

    const record: StoredSharedLocationRecord = {
      id,
      tokenHash,
      locationCode: params.location.locationCode,
      entityType: params.location.entityType,
      title: params.location.title,
      fullAddressLine: params.location.fullAddressLine,
      createdById: params.actor.id,
      createdByName: params.actor.fullName,
      createdByRole: params.actor.role,
      createdAt,
      expiresAt,
      revokedAt: null,
      revokedByName: null,
      accessCount: 0,
      lastAccessedAt: null,
      recipientLabel: params.recipientLabel ? params.recipientLabel.trim().slice(0, 120) : null,
      location: params.location,
    };

    this.byTokenHash.set(tokenHash, record);
    this.byId.set(id, record);

    if (connDb.isConnected()) {
      try {
        await drizzleDb.insert(eventLog).values({
          id,
          eventType: EVENT_TYPE_LOCATION_SHARE,
          status: 'completed',
          retryCount: '0',
          errorMessage: tokenHash,
          payload: record as any,
          processedAt: now,
          createdAt: now,
        });
      } catch (err) {
        console.warn('⚠️ [LocationShareService] Falha ao persistir link no PostgreSQL; mantido em cache ativo:', err);
        this.persistDevStore();
      }
    } else {
      this.persistDevStore();
    }

    auditService.log({
      actorId: params.actor.id,
      actorName: params.actor.fullName,
      actorRole: params.actor.role,
      entityName: 'location_share',
      entityId: id,
      action: 'LOCATION_SHARE_CREATED',
      newData: {
        locationCode: record.locationCode,
        entityType: record.entityType,
        title: record.title,
        latitude: params.location.latitude,
        longitude: params.location.longitude,
        expiresAt,
      },
      notes: `Link de mapa e rota gerado para ${record.title} (${record.locationCode}) válido até ${expiresAt}.`,
      ipAddress: params.ipAddress,
    });

    return {
      id,
      token,
      locationCode: record.locationCode,
      expiresAt,
      createdAt,
    };
  }

  public async getShareByToken(rawToken: string): Promise<
    | { status: 'ok'; record: StoredSharedLocationRecord }
    | { status: 'not_found' }
    | { status: 'revoked'; revokedAt: string }
    | { status: 'expired'; expiresAt: string }
  > {
    if (!rawToken || !TOKEN_REGEX.test(rawToken)) {
      return { status: 'not_found' };
    }

    this.ensureDevStoreLoaded();
    const tokenHash = hashToken(rawToken);
    let record = this.byTokenHash.get(tokenHash);

    if (!record && connDb.isConnected()) {
      try {
        const rows = await drizzleDb
          .select()
          .from(eventLog)
          .where(
            and(
              eq(eventLog.eventType, EVENT_TYPE_LOCATION_SHARE),
              eq(eventLog.errorMessage, tokenHash)
            )
          )
          .limit(1);

        const row = rows[0];
        if (row && row.payload && typeof row.payload === 'object') {
          record = row.payload as StoredSharedLocationRecord;
          this.byTokenHash.set(tokenHash, record);
          this.byId.set(record.id, record);
        }
      } catch {
        // segue com cache
      }
    }

    if (!record) {
      return { status: 'not_found' };
    }

    if (record.revokedAt) {
      return { status: 'revoked', revokedAt: record.revokedAt };
    }

    if (new Date(record.expiresAt).getTime() < Date.now()) {
      return { status: 'expired', expiresAt: record.expiresAt };
    }

    record.accessCount = (record.accessCount || 0) + 1;
    record.lastAccessedAt = new Date().toISOString();
    if (connDb.isConnected()) {
      drizzleDb
        .update(eventLog)
        .set({ payload: record as any })
        .where(eq(eventLog.id, record.id))
        .catch(() => this.persistDevStore());
    } else {
      this.persistDevStore();
    }

    return { status: 'ok', record };
  }

  public async listSharesForActor(actor: AuthenticatedUser): Promise<
    Array<{
      id: string;
      locationCode: string;
      entityType: LocationEntityType;
      title: string;
      fullAddressLine: string;
      createdByName: string;
      createdAt: string;
      expiresAt: string;
      revokedAt: string | null;
      accessCount: number;
      recipientLabel: string | null;
      isExpired: boolean;
    }>
  > {
    this.ensureDevStoreLoaded();
    const recordsMap = new Map<string, StoredSharedLocationRecord>();

    if (connDb.isConnected()) {
      try {
        const rows = await drizzleDb
          .select()
          .from(eventLog)
          .where(eq(eventLog.eventType, EVENT_TYPE_LOCATION_SHARE))
          .orderBy(desc(eventLog.createdAt))
          .limit(100);
        for (const row of rows) {
          if (row.payload && typeof row.payload === 'object') {
            const rec = row.payload as StoredSharedLocationRecord;
            recordsMap.set(rec.id, rec);
            this.byId.set(rec.id, rec);
            if (rec.tokenHash) this.byTokenHash.set(rec.tokenHash, rec);
          }
        }
      } catch {
        // Fallback cache local
      }
    }

    for (const rec of this.byId.values()) {
      if (!recordsMap.has(rec.id)) {
        recordsMap.set(rec.id, rec);
      }
    }

    const nowMs = Date.now();
    return Array.from(recordsMap.values())
      .filter((rec) => actor.role === 'admin' || rec.createdById === actor.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50)
      .map((rec) => ({
        id: rec.id,
        locationCode: rec.locationCode,
        entityType: rec.entityType,
        title: rec.title,
        fullAddressLine: rec.fullAddressLine,
        createdByName: rec.createdByName,
        createdAt: rec.createdAt,
        expiresAt: rec.expiresAt,
        revokedAt: rec.revokedAt || null,
        accessCount: rec.accessCount || 0,
        recipientLabel: rec.recipientLabel || null,
        isExpired: new Date(rec.expiresAt).getTime() < nowMs,
      }));
  }

  public async revokeShare(
    id: string,
    actor: AuthenticatedUser,
    ipAddress?: string
  ): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
    this.ensureDevStoreLoaded();
    let record = this.byId.get(id);

    if (!record && connDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(eventLog).where(eq(eventLog.id, id)).limit(1);
        const row = rows[0];
        if (row && row.eventType === EVENT_TYPE_LOCATION_SHARE && row.payload) {
          record = row.payload as StoredSharedLocationRecord;
          this.byId.set(record.id, record);
          this.byTokenHash.set(record.tokenHash, record);
        }
      } catch {
        // Ignora erro
      }
    }

    if (!record) {
      return { ok: false, status: 404, error: 'Link de localização não encontrado.' };
    }

    if (actor.role !== 'admin' && record.createdById !== actor.id) {
      return { ok: false, status: 403, error: 'Apenas o criador ou um Administrador pode revogar este link.' };
    }

    if (record.revokedAt) {
      return { ok: true };
    }

    record.revokedAt = new Date().toISOString();
    record.revokedByName = actor.fullName;

    if (connDb.isConnected()) {
      try {
        await drizzleDb.update(eventLog).set({ payload: record as any }).where(eq(eventLog.id, record.id));
      } catch {
        this.persistDevStore();
      }
    } else {
      this.persistDevStore();
    }

    auditService.log({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      entityName: 'location_share',
      entityId: record.id,
      action: 'LOCATION_SHARE_REVOKED',
      notes: `Link compartilhável de localização ${record.locationCode} revogado manualmente.`,
      ipAddress,
    });

    return { ok: true };
  }
}

export const locationShareService = new LocationShareService();
