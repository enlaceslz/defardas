/**
 * DE FARDAS ERP — Shared Report Snapshot Service
 * Gera, persiste, valida e revoga links compartilháveis de relatórios auditáveis
 * (para envio via WhatsApp ou abertura externa somente leitura com impressão em PDF).
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { desc, eq } from 'drizzle-orm';
import { db as drizzleDb } from '../db/index';
import { db as connDb } from '../db/connection';
import { eventLog } from '../db/schema/audit';
import { auditService } from './auditService';
import { AuthenticatedUser } from '../auth/rbac';

export type ReportDomain =
  | 'executivo'
  | 'producao'
  | 'comercial'
  | 'financeiro'
  | 'estoque'
  | 'parceiros'
  | 'fornecedores';

export interface ReportKpiItem {
  label: string;
  value: string;
  sublabel?: string;
  tone?: 'neutral' | 'crimson' | 'emerald' | 'amber' | 'rose';
}

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  mono?: boolean;
}

export interface ReportSection {
  id: string;
  title: string;
  subtitle?: string;
  summaryRight?: string;
  columns: ReportColumn[];
  rows: Array<Record<string, string>>;
  emptyMessage?: string;
  totalsRow?: Record<string, string>;
}

export interface ReportSnapshotPayload {
  reportCode: string;
  reportType: ReportDomain;
  title: string;
  subtitle?: string;
  filterSummary: string;
  filtersMeta?: Record<string, string | number | boolean>;
  generatedAt: string;
  generatedBy: string;
  company: {
    tradeName: string;
    name: string;
    cnpj: string;
    ie?: string;
    phone: string;
    whatsapp?: string;
    email: string;
    address: string;
    neighborhood?: string;
    city: string;
    state: string;
    cep: string;
    logoUrl?: string;
  };
  kpis: ReportKpiItem[];
  sections: ReportSection[];
  notes?: string;
}

export interface StoredSharedReportRecord {
  id: string;
  tokenHash: string;
  reportCode: string;
  reportType: ReportDomain;
  title: string;
  filterSummary: string;
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
  snapshot: ReportSnapshotPayload;
}

const EVENT_TYPE_REPORT_SHARE = 'REPORT_SHARE';
const TOKEN_REGEX = /^[A-Za-z0-9_-]{20,96}$/;
const DEV_STORE_PATH = path.join(os.tmpdir(), 'defardas-dev-report-shares.json');
const ALLOWED_DOMAINS = new Set<ReportDomain>([
  'executivo',
  'producao',
  'comercial',
  'financeiro',
  'estoque',
  'parceiros',
  'fornecedores',
]);
const ALLOWED_TONES = new Set(['neutral', 'crimson', 'emerald', 'amber', 'rose']);

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

export function sanitizeSnapshotPayload(raw: any, actor: AuthenticatedUser): ReportSnapshotPayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Estrutura do relatório inválida.');
  }

  const reportType = String(raw.reportType || '').trim() as ReportDomain;
  if (!ALLOWED_DOMAINS.has(reportType)) {
    throw new Error('Tipo de relatório inválido.');
  }

  const title = clampString(raw.title, 180);
  if (title.length < 3) {
    throw new Error('Título do relatório obrigatório.');
  }

  const reportCode = clampString(raw.reportCode, 60, `REL-${Date.now()}`);
  const filterSummary = clampString(raw.filterSummary, 600, 'Sem filtros específicos');
  const subtitle = clampString(raw.subtitle, 240) || undefined;
  const notes = clampString(raw.notes, 1000) || undefined;

  const rawCompany = raw.company && typeof raw.company === 'object' ? raw.company : {};
  const company = {
    tradeName: clampString(rawCompany.tradeName, 120, 'DE FARDAS'),
    name: clampString(rawCompany.name, 160, 'DE FARDAS INDÚSTRIA E COMÉRCIO DE CONFECÇÕES LTDA'),
    cnpj: clampString(rawCompany.cnpj, 32),
    ie: clampString(rawCompany.ie, 32) || undefined,
    phone: clampString(rawCompany.phone, 40),
    whatsapp: clampString(rawCompany.whatsapp, 40) || undefined,
    email: clampString(rawCompany.email, 120),
    address: clampString(rawCompany.address, 200),
    neighborhood: clampString(rawCompany.neighborhood, 100) || undefined,
    city: clampString(rawCompany.city, 80, 'São Luís'),
    state: clampString(rawCompany.state, 10, 'MA'),
    cep: clampString(rawCompany.cep, 20),
    logoUrl: sanitizeLogoUrl(rawCompany.logoUrl),
  };

  const rawKpis = Array.isArray(raw.kpis) ? raw.kpis.slice(0, 12) : [];
  const kpis: ReportKpiItem[] = rawKpis.map((k: any) => ({
    label: clampString(k?.label, 90, 'Indicador'),
    value: clampString(k?.value, 80, '0'),
    sublabel: clampString(k?.sublabel, 140) || undefined,
    tone: ALLOWED_TONES.has(k?.tone) ? k.tone : 'neutral',
  }));

  const rawSections = Array.isArray(raw.sections) ? raw.sections.slice(0, 10) : [];
  const sections: ReportSection[] = rawSections.map((sec: any, idx: number) => {
    const rawCols = Array.isArray(sec?.columns) ? sec.columns.slice(0, 16) : [];
    const columns: ReportColumn[] = rawCols.map((c: any) => ({
      key: clampString(c?.key, 48, 'col'),
      label: clampString(c?.label, 64, 'Coluna'),
      align: c?.align === 'right' || c?.align === 'center' ? c.align : 'left',
      mono: Boolean(c?.mono),
    }));

    const colKeys = columns.map((c) => c.key);
    const rawRows = Array.isArray(sec?.rows) ? sec.rows.slice(0, 500) : [];
    const rows = rawRows.map((row: any) => {
      const sanitizedRow: Record<string, string> = {};
      for (const key of colKeys) {
        sanitizedRow[key] = clampString(row?.[key] !== undefined ? String(row[key]) : '', 320);
      }
      return sanitizedRow;
    });

    let totalsRow: Record<string, string> | undefined;
    if (sec?.totalsRow && typeof sec.totalsRow === 'object') {
      totalsRow = {};
      for (const key of colKeys) {
        if (sec.totalsRow[key] !== undefined) {
          totalsRow[key] = clampString(String(sec.totalsRow[key]), 120);
        }
      }
    }

    return {
      id: clampString(sec?.id, 60, `sec-${idx + 1}`),
      title: clampString(sec?.title, 180, `Seção ${idx + 1}`),
      subtitle: clampString(sec?.subtitle, 220) || undefined,
      summaryRight: clampString(sec?.summaryRight, 140) || undefined,
      columns,
      rows,
      emptyMessage: clampString(sec?.emptyMessage, 180) || undefined,
      totalsRow,
    };
  });

  const filtersMeta: Record<string, string | number | boolean> = {};
  if (raw.filtersMeta && typeof raw.filtersMeta === 'object') {
    for (const [k, v] of Object.entries(raw.filtersMeta).slice(0, 30)) {
      const cleanKey = clampString(k, 40);
      if (!cleanKey) continue;
      if (typeof v === 'string') filtersMeta[cleanKey] = clampString(v, 120);
      else if (typeof v === 'number' && Number.isFinite(v)) filtersMeta[cleanKey] = v;
      else if (typeof v === 'boolean') filtersMeta[cleanKey] = v;
    }
  }

  return {
    reportCode,
    reportType,
    title,
    subtitle,
    filterSummary,
    filtersMeta,
    generatedAt: new Date().toISOString(),
    generatedBy: `${actor.fullName} (${actor.role})`,
    company,
    kpis,
    sections,
    notes,
  };
}

class ReportShareService {
  private byTokenHash: Map<string, StoredSharedReportRecord> = new Map();
  private byId: Map<string, StoredSharedReportRecord> = new Map();
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
      // Ignora arquivo temporário indisponível em dev
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
        .slice(-150);
      fs.writeFileSync(DEV_STORE_PATH, JSON.stringify(records), 'utf8');
    } catch {
      // Ignora erro de escrita temporária
    }
  }

  public async createShare(params: {
    snapshot: ReportSnapshotPayload;
    actor: AuthenticatedUser;
    expiresInHours?: number;
    recipientLabel?: string;
    ipAddress?: string;
  }): Promise<{
    id: string;
    token: string;
    reportCode: string;
    expiresAt: string;
    createdAt: string;
  }> {
    this.ensureDevStoreLoaded();
    const hours = Math.min(720, Math.max(1, Math.round(Number(params.expiresInHours || 72))));
    const now = new Date();
    const expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
    const createdAt = now.toISOString();
    const id = crypto.randomUUID();
    const token = crypto.randomBytes(24).toString('base64url');
    const tokenHash = hashToken(token);

    const record: StoredSharedReportRecord = {
      id,
      tokenHash,
      reportCode: params.snapshot.reportCode,
      reportType: params.snapshot.reportType,
      title: params.snapshot.title,
      filterSummary: params.snapshot.filterSummary,
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
      snapshot: params.snapshot,
    };

    const payloadBytes = Buffer.byteLength(JSON.stringify(record), 'utf-8');
    if (payloadBytes > 2_000_000) {
      throw new Error('O relatório selecionado excede o tamanho máximo de 2 MB para link compartilhável. Aplique filtros mais específicos.');
    }

    this.byTokenHash.set(tokenHash, record);
    this.byId.set(id, record);

    if (connDb.isConnected()) {
      try {
        await drizzleDb.insert(eventLog).values({
          id,
          eventType: EVENT_TYPE_REPORT_SHARE,
          status: 'completed',
          retryCount: '0',
          errorMessage: tokenHash, // Armazena tokenHash indexado para consulta direta
          payload: record as any,
          processedAt: now,
          createdAt: now,
        });
      } catch (err) {
        console.warn('⚠️ [ReportShareService] Falha ao persistir link no PostgreSQL; mantido em cache ativo:', err);
        this.persistDevStore();
      }
    } else {
      this.persistDevStore();
    }

    auditService.log({
      actorId: params.actor.id,
      actorName: params.actor.fullName,
      actorRole: params.actor.role,
      entityName: 'report_share',
      entityId: id,
      action: 'REPORT_SHARE_CREATED',
      newData: {
        reportCode: record.reportCode,
        reportType: record.reportType,
        expiresAt,
        recipientLabel: record.recipientLabel,
      },
      notes: `Link compartilhável gerado para relatório ${record.reportCode} (${record.reportType}) válido até ${expiresAt}.`,
      ipAddress: params.ipAddress,
    });

    return {
      id,
      token,
      reportCode: record.reportCode,
      expiresAt,
      createdAt,
    };
  }

  public async getShareByToken(rawToken: string): Promise<
    | { status: 'ok'; record: StoredSharedReportRecord }
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
          .where(eq(eventLog.errorMessage, tokenHash))
          .limit(1);

        const row = rows.find((r) => r.eventType === EVENT_TYPE_REPORT_SHARE);
        if (row && row.payload && typeof row.payload === 'object') {
          record = row.payload as StoredSharedReportRecord;
          this.byTokenHash.set(tokenHash, record);
          this.byId.set(record.id, record);
        }
      } catch {
        // Segue com resultado em cache
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

    // Atualizar contagem de acessos de forma resiliente
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
      reportCode: string;
      reportType: ReportDomain;
      title: string;
      filterSummary: string;
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
    const recordsMap = new Map<string, StoredSharedReportRecord>();

    if (connDb.isConnected()) {
      try {
        const rows = await drizzleDb
          .select()
          .from(eventLog)
          .where(eq(eventLog.eventType, EVENT_TYPE_REPORT_SHARE))
          .orderBy(desc(eventLog.createdAt))
          .limit(100);
        for (const row of rows) {
          if (row.payload && typeof row.payload === 'object') {
            const rec = row.payload as StoredSharedReportRecord;
            recordsMap.set(rec.id, rec);
            this.byId.set(rec.id, rec);
            if (rec.tokenHash) this.byTokenHash.set(rec.tokenHash, rec);
          }
        }
      } catch {
        // Fallback para cache local
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
        reportCode: rec.reportCode,
        reportType: rec.reportType,
        title: rec.title,
        filterSummary: rec.filterSummary,
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
        if (row && row.eventType === EVENT_TYPE_REPORT_SHARE && row.payload) {
          record = row.payload as StoredSharedReportRecord;
          this.byId.set(record.id, record);
          this.byTokenHash.set(record.tokenHash, record);
        }
      } catch {
        // Ignora erro de leitura
      }
    }

    if (!record) {
      return { ok: false, status: 404, error: 'Link de relatório não encontrado.' };
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
      entityName: 'report_share',
      entityId: record.id,
      action: 'REPORT_SHARE_REVOKED',
      notes: `Link compartilhável do relatório ${record.reportCode} revogado manualmente.`,
      ipAddress,
    });

    return { ok: true };
  }
}

export const reportShareService = new ReportShareService();
