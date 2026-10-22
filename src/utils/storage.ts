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
  try {
    const rawProfile = localStorage.getItem(STORAGE_KEYS.PROFILE);
    const rawClients = localStorage.getItem(STORAGE_KEYS.CLIENTS);
    const rawInventory = localStorage.getItem(STORAGE_KEYS.INVENTORY);
    const rawOrders = localStorage.getItem(STORAGE_KEYS.ORDERS);
    const rawQuotes = localStorage.getItem(STORAGE_KEYS.QUOTES);
    const rawFinance = localStorage.getItem(STORAGE_KEYS.FINANCE);
    const rawCatalog = localStorage.getItem(STORAGE_KEYS.CATALOG);

    return {
      profile: rawProfile ? JSON.parse(rawProfile) : initialCompanyProfile,
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

export function resetERPState(): ERPState {
  try {
    localStorage.removeItem(STORAGE_KEYS.PROFILE);
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
    profile: initialCompanyProfile,
    clients: initialClients,
    inventory: initialInventory,
    orders: initialProductionOrders,
    quotes: initialQuotes,
    finance: initialFinancialTransactions,
    catalog: initialPublicCatalog,
  };
}

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
