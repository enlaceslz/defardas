import { 
  CompanyProfile, 
  Client, 
  InventoryItem, 
  ProductionOrder, 
  Quote, 
  FinancialTransaction,
  PublicCatalogItem
} from '../types/erp';
import { 
  initialCompanyProfile, 
  initialClients, 
  initialInventory, 
  initialProductionOrders, 
  initialQuotes, 
  initialFinancialTransactions,
  initialPublicCatalog
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

export function loadERPState(): ERPState {
  // Dados privados são sempre carregados da sessão/API, nunca de cache compartilhado.
  for (const key of [STORAGE_KEYS.CLIENTS, STORAGE_KEYS.INVENTORY, STORAGE_KEYS.ORDERS, STORAGE_KEYS.QUOTES, STORAGE_KEYS.FINANCE]) {
    try { localStorage.removeItem(key); } catch { /* armazenamento indisponível */ }
  }
  return { profile: initialCompanyProfile, catalog: initialPublicCatalog, clients: [], inventory: [], orders: [], quotes: [], finance: [] };
}
export function saveERPState(_state: ERPState): void {
  // Exportação de backup é explícita; persistência de operação pertence ao servidor.
}
export function resetERPState(): ERPState { return loadERPState(); }

export function exportERPStateAsJSON(state: ERPState): void {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  const now = new Date().toISOString().split('T')[0];
  downloadAnchor.setAttribute("download", `backup_defardas_erp_prd_v1.6_${now}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
