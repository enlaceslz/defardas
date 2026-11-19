import {
  CompanyProfile,
  Client,
  InventoryItem,
  ProductionOrder,
  Quote,
  FinancialTransaction,
  PublicCatalogItem,
} from '../types/erp';
import {
  initialCompanyProfile,
  initialClients,
  initialInventory,
  initialProductionOrders,
  initialQuotes,
  initialFinancialTransactions,
  initialPublicCatalog,
} from '../data/initialData';

const STORAGE_KEYS = {
  PROFILE: 'defardas_profile_v2',
  CLIENTS: 'defardas_clients_v2',
  INVENTORY: 'defardas_inventory_v2',
  ORDERS: 'defardas_orders_v2',
  QUOTES: 'defardas_quotes_v2',
  FINANCE: 'defardas_finance_v2',
  CATALOG: 'defardas_catalog_v2',
};

export interface ERPState {
  profile: CompanyProfile;
  clients: Client[];
  inventory: InventoryItem[];
  orders: ProductionOrder[];
  quotes: Quote[];
  finance: FinancialTransaction[];
  catalog: PublicCatalogItem[];
}

export interface ERPBackupEnvelope {
  meta: {
    app: 'DE FARDAS ERP';
    schemaVersion: string;
    exportedAt: string;
    counts: {
      clients: number;
      inventory: number;
      orders: number;
      quotes: number;
      finance: number;
      hasLogo: boolean;
    };
  };
  data: ERPState;
}

export function loadERPState(): ERPState {
  try {
    const rawProfile = localStorage.getItem(STORAGE_KEYS.PROFILE);
    const rawClients = localStorage.getItem(STORAGE_KEYS.CLIENTS);
    const rawInventory = localStorage.getItem(STORAGE_KEYS.INVENTORY);
    const rawOrders = localStorage.getItem(STORAGE_KEYS.ORDERS);
    const rawQuotes = localStorage.getItem(STORAGE_KEYS.QUOTES);
    const rawFinance = localStorage.getItem(STORAGE_KEYS.FINANCE);
    const rawCatalog = localStorage.getItem(STORAGE_KEYS.CATALOG);

    const parsedProfile = rawProfile ? JSON.parse(rawProfile) : null;

    return {
      profile: parsedProfile
        ? { ...initialCompanyProfile, ...parsedProfile }
        : initialCompanyProfile,
      clients: rawClients ? JSON.parse(rawClients) : initialClients,
      inventory: rawInventory ? JSON.parse(rawInventory) : initialInventory,
      orders: rawOrders ? JSON.parse(rawOrders) : initialProductionOrders,
      quotes: rawQuotes ? JSON.parse(rawQuotes) : initialQuotes,
      finance: rawFinance ? JSON.parse(rawFinance) : initialFinancialTransactions,
      catalog: rawCatalog ? JSON.parse(rawCatalog) : initialPublicCatalog,
    };
  } catch (err) {
    console.error('Error reading localStorage, using defaults', err);
    return {
      profile: initialCompanyProfile,
      clients: initialClients,
      inventory: initialInventory,
      orders: initialProductionOrders,
      quotes: initialQuotes,
      finance: initialFinancialTransactions,
      catalog: initialPublicCatalog,
    };
  }
}

export function saveERPState(state: ERPState): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(state.profile));
    localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(state.clients));
    localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(state.inventory));
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(state.orders));
    localStorage.setItem(STORAGE_KEYS.QUOTES, JSON.stringify(state.quotes));
    localStorage.setItem(STORAGE_KEYS.FINANCE, JSON.stringify(state.finance));
    localStorage.setItem(STORAGE_KEYS.CATALOG, JSON.stringify(state.catalog));
  } catch (err) {
    console.error('Error saving state to localStorage', err);
  }
}

export function resetERPState(preserveProfile?: CompanyProfile): ERPState {
  try {
    if (!preserveProfile) {
      localStorage.removeItem(STORAGE_KEYS.PROFILE);
    }
    localStorage.removeItem(STORAGE_KEYS.CLIENTS);
    localStorage.removeItem(STORAGE_KEYS.INVENTORY);
    localStorage.removeItem(STORAGE_KEYS.ORDERS);
    localStorage.removeItem(STORAGE_KEYS.QUOTES);
    localStorage.removeItem(STORAGE_KEYS.FINANCE);
    localStorage.removeItem(STORAGE_KEYS.CATALOG);
  } catch (err) {
    console.error('Error resetting state', err);
  }
  return {
    profile: preserveProfile || initialCompanyProfile,
    clients: initialClients,
    inventory: initialInventory,
    orders: initialProductionOrders,
    quotes: initialQuotes,
    finance: initialFinancialTransactions,
    catalog: initialPublicCatalog,
  };
}

/**
 * Exporta o backup completo do ERP via Blob + ObjectURL (suporta logomarcas em Data URL
 * sem truncamento de URI em navegadores modernos) com envelope de metadados auditáveis.
 */
export function exportERPStateAsJSON(state: ERPState): { fileName: string; sizeKB: number } {
  const exportedAt = new Date().toISOString();
  const envelope: ERPBackupEnvelope = {
    meta: {
      app: 'DE FARDAS ERP',
      schemaVersion: '1.6',
      exportedAt,
      counts: {
        clients: state.clients.length,
        inventory: state.inventory.length,
        orders: state.orders.length,
        quotes: state.quotes.length,
        finance: state.finance.length,
        hasLogo: Boolean(state.profile.logoUrl),
      },
    },
    data: state,
  };

  const jsonContent = JSON.stringify(envelope, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);

  const dateSlug = exportedAt.split('T')[0];
  const fileName = `backup_defardas_erp_v1.6_${dateSlug}.json`;

  const downloadAnchor = document.createElement('a');
  downloadAnchor.href = objectUrl;
  downloadAnchor.download = fileName;
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();

  // Revoga o objeto após disparo do download para evitar vazamento de memória
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);

  return {
    fileName,
    sizeKB: Math.max(1, Math.round(blob.size / 1024)),
  };
}

export interface BackupValidationResult {
  ok: boolean;
  state?: ERPState;
  exportedAt?: string;
  error?: string;
}

/**
 * Valida arquivos de backup JSON (compatível tanto com o novo envelope { meta, data }
 * quanto com backups legados planos { profile, orders, inventory, quotes, ... }).
 */
export function parseAndValidateBackupJSON(rawText: string, fallbackState?: ERPState): BackupValidationResult {
  try {
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'O arquivo JSON não contém um objeto válido.' };
    }

    const isEnvelope = parsed.data && typeof parsed.data === 'object' && parsed.meta;
    const payload = isEnvelope ? parsed.data : parsed;
    const exportedAt = isEnvelope && typeof parsed.meta?.exportedAt === 'string' ? parsed.meta.exportedAt : undefined;

    if (!Array.isArray(payload.orders) || !Array.isArray(payload.inventory) || !Array.isArray(payload.quotes)) {
      return {
        ok: false,
        error: 'Estrutura de backup inválida: listas obrigatórias (orders, inventory, quotes) ausentes ou corrompidas.',
      };
    }

    const clients = Array.isArray(payload.clients) ? payload.clients : fallbackState?.clients || initialClients;
    const finance = Array.isArray(payload.finance) ? payload.finance : fallbackState?.finance || initialFinancialTransactions;
    const catalog = Array.isArray(payload.catalog) ? payload.catalog : fallbackState?.catalog || initialPublicCatalog;

    const rawProfile = payload.profile && typeof payload.profile === 'object' ? payload.profile : {};

    // Sanitização básica de logoUrl: aceita apenas data:image/ seguro (sem scripts em SVG) ou URL https/http
    let sanitizedLogoUrl: string | undefined = undefined;
    if (typeof rawProfile.logoUrl === 'string' && rawProfile.logoUrl.trim().length > 0) {
      const candidate = rawProfile.logoUrl.trim();
      const isSafeDataImage =
        /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/i.test(candidate) &&
        !candidate.toLowerCase().includes('<script');
      const isHttpUrl = /^https?:\/\//i.test(candidate);
      if (isSafeDataImage || isHttpUrl) {
        sanitizedLogoUrl = candidate;
      }
    }

    const mergedProfile: CompanyProfile = {
      ...initialCompanyProfile,
      ...(fallbackState?.profile || {}),
      ...rawProfile,
      logoUrl: sanitizedLogoUrl,
      productionCapacityPiecesMonth: Math.max(
        1,
        Number(rawProfile.productionCapacityPiecesMonth) || initialCompanyProfile.productionCapacityPiecesMonth
      ),
      foundedYear: Number(rawProfile.foundedYear) || initialCompanyProfile.foundedYear,
    };

    return {
      ok: true,
      exportedAt,
      state: {
        profile: mergedProfile,
        clients,
        inventory: payload.inventory,
        orders: payload.orders,
        quotes: payload.quotes,
        finance,
        catalog,
      },
    };
  } catch {
    return {
      ok: false,
      error: 'Não foi possível ler o JSON. Verifique se o arquivo está íntegro e no formato UTF-8.',
    };
  }
}
