/**
 * DE FARDAS ERP — Report Filter & Snapshot Engine
 * Centraliza a filtragem multidimensional, totalização auditável, geração de snapshots
 * para impressão PDF, exportação CSV e compartilhamento via link WhatsApp.
 */
import {
  Client,
  CompanyProfile,
  FinancialTransaction,
  InventoryItem,
  InventoryMovement,
  LeadItem,
  Partner,
  PartnerCustody,
  PartnerFinancialForecastResponse,
  ProductionOrder,
  PurchaseOrder,
  Quote,
  ReportDomain,
  ReportSnapshot,
  Supplier,
} from '../types/erp';
import { formatCurrencyBRL, formatDateBR, getStageLabel } from './formatters';
import { DEFAULT_BRAND_LOGO_URL } from '../data/initialData';

export type DatePreset =
  | 'all'
  | 'today'
  | '7d'
  | '30d'
  | 'this_month'
  | 'last_month'
  | '90d'
  | 'custom';

export interface ReportFilterState {
  domain: ReportDomain;
  datePreset: DatePreset;
  startDate: string;
  endDate: string;
  dateField: 'auto' | 'creation' | 'delivery_or_due';
  search: string;
  clientId: string;
  partnerId: string;
  supplierId: string;
  category: string;
  stage: string;
  priority: string;
  gateStatus: 'all' | 'liberado' | 'bloqueado' | 'sem_sinal' | 'sem_arte';
  slaStatus: 'all' | 'atrasado' | 'alerta' | 'no_prazo';
  artStatus: string;
  commercialStatus: string;
  financeType: 'all' | 'receber' | 'pagar';
  financeSubType: string;
  financeStatus: string;
  paymentMethod: string;
  stockHealth: 'all' | 'critico' | 'em_terceiros' | 'alocado' | 'normal';
  movementType: string;
  custodyStatus: string;
  poStatus: string;
  leadStatus: string;
  includeDemo: 'all' | 'only_real' | 'only_demo';
  sortBy: 'date_desc' | 'date_asc' | 'value_desc' | 'value_asc' | 'name_asc';
}

export interface ReportDataBundle {
  profile: CompanyProfile;
  orders: ProductionOrder[];
  quotes: Quote[];
  inventory: InventoryItem[];
  movements: InventoryMovement[];
  transactions: FinancialTransaction[];
  clients: Client[];
  leads: LeadItem[];
  partners: Partner[];
  partnerCustody: PartnerCustody[];
  partnerForecast: PartnerFinancialForecastResponse | null;
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
}

export interface ReportPermissions {
  canViewFinance: boolean;
  canViewQuotes: boolean;
  canViewLeads: boolean;
  canViewPartners: boolean;
  canViewSuppliers: boolean;
  canViewWhatsApp: boolean;
}

export function createDefaultReportFilters(domain: ReportDomain = 'executivo'): ReportFilterState {
  return {
    domain,
    datePreset: 'all',
    startDate: '',
    endDate: '',
    dateField: 'auto',
    search: '',
    clientId: 'all',
    partnerId: 'all',
    supplierId: 'all',
    category: 'all',
    stage: 'all',
    priority: 'all',
    gateStatus: 'all',
    slaStatus: 'all',
    artStatus: 'all',
    commercialStatus: 'all',
    financeType: 'all',
    financeSubType: 'all',
    financeStatus: 'all',
    paymentMethod: 'all',
    stockHealth: 'all',
    movementType: 'all',
    custodyStatus: 'all',
    poStatus: 'all',
    leadStatus: 'all',
    includeDemo: 'all',
    sortBy: 'date_desc',
  };
}

export function resolveDateRangeFromPreset(
  preset: DatePreset,
  customStart: string,
  customEnd: string
): { startDate: string; endDate: string } {
  const now = new Date();
  const toISO = (d: Date) => d.toISOString().split('T')[0];
  const todayISO = toISO(now);

  if (preset === 'all') return { startDate: '', endDate: '' };
  if (preset === 'custom') return { startDate: customStart || '', endDate: customEnd || '' };
  if (preset === 'today') return { startDate: todayISO, endDate: todayISO };

  if (preset === '7d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { startDate: toISO(start), endDate: todayISO };
  }

  if (preset === '30d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { startDate: toISO(start), endDate: todayISO };
  }

  if (preset === '90d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 89);
    return { startDate: toISO(start), endDate: todayISO };
  }

  if (preset === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { startDate: toISO(start), endDate: toISO(end) };
  }

  if (preset === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { startDate: toISO(start), endDate: toISO(end) };
  }

  return { startDate: '', endDate: '' };
}

function isDateWithinRange(dateValue: string | undefined, startDate: string, endDate: string): boolean {
  if (!startDate && !endDate) return true;
  if (!dateValue) return false;
  const iso = dateValue.slice(0, 10);
  if (startDate && iso < startDate) return false;
  if (endDate && iso > endDate) return false;
  return true;
}

function matchesDemoFilter(isDemo: boolean | undefined, filter: ReportFilterState['includeDemo']): boolean {
  if (filter === 'all') return true;
  if (filter === 'only_demo') return Boolean(isDemo);
  return !isDemo;
}

const DOMAIN_META: Record<ReportDomain, { title: string; codePrefix: string; subtitle: string }> = {
  executivo: {
    title: 'Relatório Executivo Consolidado (Visão 360°)',
    codePrefix: 'REL-EXE',
    subtitle: 'Síntese gerencial de PCP, carteira comercial, estoque crítico e controladoria',
  },
  producao: {
    title: 'Relatório de Ordens de Produção, Prazos (SLA) & Gate A.3.2',
    codePrefix: 'REL-PCP',
    subtitle: 'Acompanhamento de OPs, cumprimento de etapas fabris, peças e bloqueios',
  },
  comercial: {
    title: 'Relatório Comercial: Propostas, Markup, Artes & Leads CRM',
    codePrefix: 'REL-COM',
    subtitle: 'Análise de orçamentos, margem estimada sobre receita, conversão e carteira',
  },
  financeiro: {
    title: 'Relatório Financeiro & Fluxo de Caixa Auditável',
    codePrefix: 'REL-FIN',
    subtitle: 'Contas a receber/pagar, sinais de 50%, provisões e comprovantes bancários',
  },
  estoque: {
    title: 'Relatório de Estoque, Tecidoteca, Terceiros & Kardex',
    codePrefix: 'REL-EST',
    subtitle: 'Posição física, alocações, custódia em facções, CMP e movimentações',
  },
  parceiros: {
    title: 'Relatório de Parceiros, Facções & Custódia de Materiais',
    codePrefix: 'REL-FAC',
    subtitle: 'Capacidade terceirizada, tecidos sob custódia e previsão financeira por OP',
  },
  fornecedores: {
    title: 'Relatório de Fornecedores & Pedidos de Compra (PC)',
    codePrefix: 'REL-FOR',
    subtitle: 'Compras de matéria-prima, atrasos de entrega, recebimentos e cobertura CP',
  },
};

const COMMERCIAL_STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  em_negociacao: 'Em Negociação',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
  convertido_em_pedido: 'Convertido em OP',
};

const FINANCE_SUBTYPE_LABELS: Record<string, string> = {
  entrada_pedido: 'Sinal Entrada (50%)',
  saldo_entrega: 'Saldo Entrega',
  compra_tecido: 'Compra Tecido/Insumo',
  servico_terceirizado: 'Serviço Facção',
  despesa_geral: 'Despesa Geral',
};

const PO_STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  confirmado: 'Confirmado',
  recebido_parcial: 'Recebido Parcial',
  recebido_total: 'Recebido Total',
  cancelado: 'Cancelado',
};

export function countActiveFilters(filters: ReportFilterState): number {
  let count = 0;
  if (filters.datePreset !== 'all') count++;
  if (filters.dateField !== 'auto') count++;
  if (filters.search.trim()) count++;
  if (filters.clientId !== 'all') count++;
  if (filters.partnerId !== 'all') count++;
  if (filters.supplierId !== 'all') count++;
  if (filters.category !== 'all') count++;
  if (filters.stage !== 'all') count++;
  if (filters.priority !== 'all') count++;
  if (filters.gateStatus !== 'all') count++;
  if (filters.slaStatus !== 'all') count++;
  if (filters.artStatus !== 'all') count++;
  if (filters.commercialStatus !== 'all') count++;
  if (filters.financeType !== 'all') count++;
  if (filters.financeSubType !== 'all') count++;
  if (filters.financeStatus !== 'all') count++;
  if (filters.paymentMethod !== 'all') count++;
  if (filters.stockHealth !== 'all') count++;
  if (filters.movementType !== 'all') count++;
  if (filters.custodyStatus !== 'all') count++;
  if (filters.poStatus !== 'all') count++;
  if (filters.leadStatus !== 'all') count++;
  if (filters.includeDemo !== 'all') count++;
  return count;
}

export function buildFilterSummaryText(
  filters: ReportFilterState,
  data: ReportDataBundle
): string {
  const parts: string[] = [];
  const { startDate, endDate } = resolveDateRangeFromPreset(
    filters.datePreset,
    filters.startDate,
    filters.endDate
  );

  if (startDate || endDate) {
    const fieldLabel =
      filters.dateField === 'creation'
        ? 'Emissão'
        : filters.dateField === 'delivery_or_due'
          ? 'Entrega/Vencimento'
          : 'Data Ref.';
    parts.push(`${fieldLabel}: ${startDate ? formatDateBR(startDate) : '...'} a ${endDate ? formatDateBR(endDate) : '...'}`);
  } else {
    parts.push('Período: Todo o histórico');
  }

  if (filters.clientId !== 'all') {
    const cli = data.clients.find((c) => c.id === filters.clientId);
    if (cli) parts.push(`Cliente: ${cli.tradeName}`);
  }
  if (filters.partnerId !== 'all') {
    const ptr = data.partners.find((p) => p.id === filters.partnerId);
    if (ptr) parts.push(`Parceiro: ${ptr.tradeName}`);
  }
  if (filters.supplierId !== 'all') {
    const sup = data.suppliers.find((s) => s.id === filters.supplierId);
    if (sup) parts.push(`Fornecedor: ${sup.tradeName}`);
  }
  if (filters.category !== 'all') parts.push(`Categoria: ${filters.category}`);
  if (filters.stage !== 'all') {
    parts.push(
      `Etapa: ${
        filters.stage === 'ativas'
          ? 'Apenas Ativas'
          : filters.stage === 'entregues'
            ? 'Apenas Entregues'
            : getStageLabel(filters.stage as any)
      }`
    );
  }
  if (filters.priority !== 'all') parts.push(`Prioridade: ${filters.priority.toUpperCase()}`);
  if (filters.gateStatus !== 'all') parts.push(`Gate A.3.2: ${filters.gateStatus}`);
  if (filters.slaStatus !== 'all') parts.push(`SLA/Prazo: ${filters.slaStatus}`);
  if (filters.artStatus !== 'all') parts.push(`Arte: ${filters.artStatus}`);
  if (filters.commercialStatus !== 'all') {
    parts.push(`Status Comercial: ${COMMERCIAL_STATUS_LABELS[filters.commercialStatus] || filters.commercialStatus}`);
  }
  if (filters.financeType !== 'all') {
    parts.push(`Tipo Fin.: ${filters.financeType === 'receber' ? 'A Receber' : 'A Pagar'}`);
  }
  if (filters.financeSubType !== 'all') {
    parts.push(`Natureza: ${FINANCE_SUBTYPE_LABELS[filters.financeSubType] || filters.financeSubType}`);
  }
  if (filters.financeStatus !== 'all') parts.push(`Status Fin.: ${filters.financeStatus}`);
  if (filters.paymentMethod !== 'all') parts.push(`Pagamento: ${filters.paymentMethod.toUpperCase()}`);
  if (filters.stockHealth !== 'all') parts.push(`Situação Estoque: ${filters.stockHealth}`);
  if (filters.movementType !== 'all') parts.push(`Kardex: ${filters.movementType}`);
  if (filters.custodyStatus !== 'all') parts.push(`Custódia: ${filters.custodyStatus}`);
  if (filters.poStatus !== 'all') parts.push(`Status PC: ${PO_STATUS_LABELS[filters.poStatus] || filters.poStatus}`);
  if (filters.leadStatus !== 'all') parts.push(`Lead: ${filters.leadStatus}`);
  if (filters.includeDemo !== 'all') {
    parts.push(`Base: ${filters.includeDemo === 'only_real' ? 'Somente Reais' : 'Somente Demo'}`);
  }
  if (filters.search.trim()) parts.push(`Busca: "${filters.search.trim()}"`);

  return parts.join(' · ');
}

export function buildReportSnapshot(
  filters: ReportFilterState,
  data: ReportDataBundle,
  perms: ReportPermissions,
  generatedByName: string
): ReportSnapshot {
  const now = new Date();
  const todayISO = now.toISOString().split('T')[0];
  const meta = DOMAIN_META[filters.domain];
  const reportCode = `${meta.codePrefix}-${todayISO.replace(/-/g, '')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const { startDate, endDate } = resolveDateRangeFromPreset(
    filters.datePreset,
    filters.startDate,
    filters.endDate
  );
  const q = filters.search.trim().toLowerCase();

  // Normalizar transações atrasadas
  const normalizedFinance = (perms.canViewFinance ? data.transactions : []).map((t) =>
    t.status === 'pendente' && t.dueDate && t.dueDate < todayISO
      ? { ...t, status: 'atrasado' as const }
      : t
  );

  // Filtragem de Ordens de Produção (usada em 'producao' e 'executivo')
  const selectedPartnerObj =
    filters.partnerId !== 'all' ? data.partners.find((p) => p.id === filters.partnerId) : undefined;

  const filteredOrders = data.orders
    .filter((o) => {
      if (!matchesDemoFilter(o.isDemo, filters.includeDemo)) return false;
      const refDate =
        filters.dateField === 'creation'
          ? o.creationDate
          : filters.dateField === 'delivery_or_due'
            ? o.targetDeliveryDate
            : o.creationDate || o.targetDeliveryDate;
      if (!isDateWithinRange(refDate, startDate, endDate)) return false;
      if (filters.clientId !== 'all' && o.clientId !== filters.clientId) return false;
      if (selectedPartnerObj) {
        const ptrName = (selectedPartnerObj.tradeName || '').toLowerCase();
        const orderPtr = (o.outsourcedPartner || '').toLowerCase();
        const customMatch = (o.customizations || []).some(
          (c) => (c.partnerName || '').toLowerCase() === ptrName
        );
        if (orderPtr !== ptrName && !customMatch) return false;
      }
      if (filters.category !== 'all' && o.category !== filters.category) return false;
      if (filters.stage === 'ativas' && o.stage === 'entregue') return false;
      else if (filters.stage === 'entregues' && o.stage !== 'entregue') return false;
      else if (
        filters.stage !== 'all' &&
        filters.stage !== 'ativas' &&
        filters.stage !== 'entregues' &&
        o.stage !== filters.stage
      ) {
        return false;
      }
      if (filters.priority !== 'all' && o.priority !== filters.priority) return false;
      if (filters.gateStatus === 'liberado' && !o.canStartProduction) return false;
      if (filters.gateStatus === 'bloqueado' && o.canStartProduction) return false;
      if (filters.gateStatus === 'sem_sinal' && o.entryPaymentConfirmed) return false;
      if (filters.gateStatus === 'sem_arte' && o.artApproved) return false;
      if (filters.artStatus !== 'all' && (o.artStatus || (o.artApproved ? 'aprovada' : 'pendente')) !== filters.artStatus) {
        return false;
      }
      if (filters.slaStatus !== 'all') {
        const ds = o.deadlineSummary?.deliveryStatus;
        const stageOverdue = o.deadlineSummary?.isCurrentStageOverdue || (o.deadlineSummary?.delayedStagesCount ?? 0) > 0;
        const stageSoon = o.deadlineSummary?.isCurrentStageDueSoon;
        if (filters.slaStatus === 'atrasado' && ds !== 'atrasada' && !stageOverdue) return false;
        if (filters.slaStatus === 'alerta' && ds !== 'critica_hoje' && ds !== 'atencao' && !stageSoon) return false;
        if (filters.slaStatus === 'no_prazo' && (ds === 'atrasada' || ds === 'critica_hoje' || ds === 'atencao' || stageOverdue)) {
          return false;
        }
      }
      if (q) {
        const hay = `${o.orderNumber || ''} ${o.id} ${o.clientName} ${o.itemTitle} ${o.fabricName} ${o.outsourcedPartner || ''} ${o.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (filters.sortBy === 'date_asc') return (a.targetDeliveryDate || '').localeCompare(b.targetDeliveryDate || '');
      if (filters.sortBy === 'value_desc') return (b.totalPieces || 0) - (a.totalPieces || 0);
      if (filters.sortBy === 'value_asc') return (a.totalPieces || 0) - (b.totalPieces || 0);
      if (filters.sortBy === 'name_asc') return (a.clientName || '').localeCompare(b.clientName || '');
      return (b.creationDate || '').localeCompare(a.creationDate || '');
    });

  // Filtragem de Orçamentos (usada em 'comercial' e 'executivo')
  const filteredQuotes = (perms.canViewQuotes ? data.quotes : [])
    .filter((qt) => {
      if (!matchesDemoFilter(qt.isDemo, filters.includeDemo)) return false;
      const refDate = filters.dateField === 'delivery_or_due' ? qt.validUntil : qt.date;
      if (!isDateWithinRange(refDate, startDate, endDate)) return false;
      if (filters.clientId !== 'all' && qt.clientId !== filters.clientId) return false;
      if (filters.commercialStatus !== 'all' && qt.status !== filters.commercialStatus) return false;
      if (filters.artStatus !== 'all' && (qt.artStatus || (qt.artApproved ? 'aprovada' : 'pendente')) !== filters.artStatus) {
        return false;
      }
      if (filters.category !== 'all' && !(qt.items || []).some((it) => it.category === filters.category)) {
        return false;
      }
      if (q) {
        const itemsText = (qt.items || []).map((i) => `${i.modelName} ${i.fabricName}`).join(' ');
        const hay = `${qt.quoteNumber || ''} ${qt.id} ${qt.clientName} ${qt.sellerName} ${itemsText}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (filters.sortBy === 'date_asc') return (a.date || '').localeCompare(b.date || '');
      if (filters.sortBy === 'value_desc') return (b.totalAmount || 0) - (a.totalAmount || 0);
      if (filters.sortBy === 'value_asc') return (a.totalAmount || 0) - (b.totalAmount || 0);
      if (filters.sortBy === 'name_asc') return (a.clientName || '').localeCompare(b.clientName || '');
      return (b.date || '').localeCompare(a.date || '');
    });

  // Filtragem Financeira
  const filteredFinance = normalizedFinance
    .filter((f) => {
      if (!matchesDemoFilter(f.isDemo, filters.includeDemo)) return false;
      const refDate =
        filters.dateField === 'creation'
          ? f.paidDate || f.dueDate
          : f.dueDate;
      if (!isDateWithinRange(refDate, startDate, endDate)) return false;
      if (filters.clientId !== 'all' && f.clientId !== filters.clientId) return false;
      if (filters.partnerId !== 'all' && f.partnerId !== filters.partnerId) return false;
      if (filters.supplierId !== 'all' && f.supplierId !== filters.supplierId) return false;
      if (filters.financeType !== 'all' && f.type !== filters.financeType) return false;
      if (filters.financeSubType !== 'all' && f.subType !== filters.financeSubType) return false;
      if (filters.financeStatus !== 'all' && f.status !== filters.financeStatus) return false;
      if (filters.paymentMethod !== 'all' && f.paymentMethod !== filters.paymentMethod) return false;
      if (q) {
        const hay = `${f.transactionNumber || ''} ${f.id} ${f.description} ${f.category} ${f.clientName || ''} ${f.partnerName || ''} ${f.supplierName || ''} ${f.orderNumber || ''} ${f.purchaseOrderNumber || ''} ${f.referenceId || ''} ${f.receiptVoucherNumber || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (filters.sortBy === 'date_asc') return (a.dueDate || '').localeCompare(b.dueDate || '');
      if (filters.sortBy === 'value_desc') return (b.amount || 0) - (a.amount || 0);
      if (filters.sortBy === 'value_asc') return (a.amount || 0) - (b.amount || 0);
      if (filters.sortBy === 'name_asc') return (a.description || '').localeCompare(b.description || '');
      return (b.dueDate || '').localeCompare(a.dueDate || '');
    });

  // Filtragem Estoque
  const filteredInventory = data.inventory
    .filter((item) => {
      if (filters.supplierId !== 'all' && item.supplierId !== filters.supplierId) return false;
      if (filters.category !== 'all' && item.category !== filters.category) return false;
      if (filters.stockHealth === 'critico' && item.currentStock > item.minStock) return false;
      if (filters.stockHealth === 'em_terceiros' && (item.inPartnersCustodyStock || 0) <= 0) return false;
      if (filters.stockHealth === 'alocado' && (item.allocatedStock || 0) <= 0) return false;
      if (filters.stockHealth === 'normal' && item.currentStock <= item.minStock) return false;
      if (!isDateWithinRange(item.lastRestocked, startDate, endDate)) return false;
      if (q) {
        const hay = `${item.code} ${item.name} ${item.supplier} ${item.location} ${item.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (filters.sortBy === 'value_desc') return b.currentStock * b.costPrice - a.currentStock * a.costPrice;
      if (filters.sortBy === 'value_asc') return a.currentStock * a.costPrice - b.currentStock * b.costPrice;
      if (filters.sortBy === 'date_asc') return (a.lastRestocked || '').localeCompare(b.lastRestocked || '');
      if (filters.sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '');
      return (b.lastRestocked || '').localeCompare(a.lastRestocked || '');
    });

  // Filtragem Kardex
  const filteredMovements = data.movements
    .filter((m) => {
      if (!isDateWithinRange(m.date, startDate, endDate)) return false;
      if (filters.movementType !== 'all' && m.type !== filters.movementType) return false;
      if (q) {
        const hay = `${m.movementNumber || ''} ${m.itemCode || ''} ${m.itemName || ''} ${m.orderNumber || ''} ${m.reason} ${m.referenceDoc || ''} ${m.operatorName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (filters.sortBy === 'date_asc') return (a.date || '').localeCompare(b.date || '');
      return (b.date || '').localeCompare(a.date || '');
    });

  const baseSnapshot: ReportSnapshot = {
    reportCode,
    reportType: filters.domain,
    title: meta.title,
    subtitle: meta.subtitle,
    filterSummary: buildFilterSummaryText(filters, data),
    filtersMeta: {
      domain: filters.domain,
      datePreset: filters.datePreset,
      startDate,
      endDate,
      includeDemo: filters.includeDemo,
    },
    generatedAt: now.toISOString(),
    generatedBy: generatedByName || 'Usuário ERP',
    company: {
      tradeName: data.profile.tradeName,
      name: data.profile.name,
      cnpj: data.profile.cnpj,
      ie: data.profile.ie,
      phone: data.profile.phone,
      whatsapp: data.profile.whatsapp,
      email: data.profile.email,
      address: data.profile.address,
      neighborhood: data.profile.neighborhood,
      city: data.profile.city,
      state: data.profile.state,
      cep: data.profile.cep,
      logoUrl: data.profile.logoUrl || DEFAULT_BRAND_LOGO_URL,
    },
    kpis: [],
    sections: [],
  };

  // =========================================================================
  // 1. DOMÍNIO: FINANCEIRO
  // =========================================================================
  if (filters.domain === 'financeiro') {
    const activeFin = filteredFinance.filter((t) => t.status !== 'estornado');
    const receberOpen = activeFin
      .filter((t) => t.type === 'receber' && (t.status === 'pendente' || t.status === 'atrasado'))
      .reduce((s, t) => s + t.amount, 0);
    const pagarOpen = activeFin
      .filter((t) => t.type === 'pagar' && (t.status === 'pendente' || t.status === 'atrasado'))
      .reduce((s, t) => s + t.amount, 0);
    const received = activeFin
      .filter((t) => t.type === 'receber' && t.status === 'pago')
      .reduce((s, t) => s + t.amount, 0);
    const paid = activeFin
      .filter((t) => t.type === 'pagar' && t.status === 'pago')
      .reduce((s, t) => s + t.amount, 0);
    const overdueCount = activeFin.filter((t) => t.status === 'atrasado').length;
    const realized = received - paid;
    const projected = realized + receberOpen - pagarOpen;

    baseSnapshot.kpis = [
      {
        label: 'A Receber (Em Aberto)',
        value: formatCurrencyBRL(receberOpen),
        sublabel: `Recebido: ${formatCurrencyBRL(received)}`,
        tone: 'emerald',
      },
      {
        label: 'A Pagar (Em Aberto)',
        value: formatCurrencyBRL(pagarOpen),
        sublabel: `Pago: ${formatCurrencyBRL(paid)}`,
        tone: 'rose',
      },
      {
        label: 'Caixa Realizado Líquido',
        value: formatCurrencyBRL(realized),
        sublabel: `${filteredFinance.length} lançamento(s) no escopo`,
        tone: realized >= 0 ? 'neutral' : 'rose',
      },
      {
        label: 'Saldo Projetado Final',
        value: formatCurrencyBRL(projected),
        sublabel: overdueCount > 0 ? `${overdueCount} título(s) vencido(s)` : 'Sem títulos em atraso',
        tone: overdueCount > 0 ? 'amber' : 'crimson',
      },
    ];

    baseSnapshot.sections = [
      {
        id: 'finance-ledger',
        title: `Detalhamento Financeiro (${filteredFinance.length} títulos)`,
        summaryRight: `Entradas Liq.: ${formatCurrencyBRL(received)} · Saídas Liq.: ${formatCurrencyBRL(paid)}`,
        emptyMessage: 'Nenhum lançamento financeiro corresponde aos filtros aplicados.',
        columns: [
          { key: 'code', label: 'Nº Título', mono: true },
          { key: 'type', label: 'Tipo' },
          { key: 'description', label: 'Descrição / Vínculo' },
          { key: 'subType', label: 'Natureza' },
          { key: 'dueDate', label: 'Vencimento', mono: true },
          { key: 'method', label: 'Forma', mono: true },
          { key: 'status', label: 'Status' },
          { key: 'amount', label: 'Valor (R$)', align: 'right', mono: true },
        ],
        rows: filteredFinance.map((t) => ({
          code: t.transactionNumber || t.id.slice(0, 8),
          type: t.type === 'receber' ? 'Receber' : 'Pagar',
          description: [
            t.description,
            t.clientName ? `Cliente: ${t.clientName}` : '',
            t.partnerName ? `Parceiro: ${t.partnerName}` : '',
            t.supplierName ? `Fornecedor: ${t.supplierName}` : '',
            t.receiptVoucherNumber ? `Aut: ${t.receiptVoucherNumber}` : '',
          ]
            .filter(Boolean)
            .join(' · '),
          subType: FINANCE_SUBTYPE_LABELS[t.subType] || t.subType,
          dueDate: formatDateBR(t.dueDate),
          method: (t.paymentMethod || '').toUpperCase(),
          status:
            t.status === 'pago'
              ? 'Liquidado'
              : t.status === 'atrasado'
                ? 'Atrasado'
                : t.status === 'estornado'
                  ? 'Estornado'
                  : 'Pendente',
          amount: formatCurrencyBRL(t.amount),
        })),
        totalsRow: {
          code: 'TOTAIS',
          description: `${activeFin.length} título(s) válidos`,
          amount: formatCurrencyBRL(
            activeFin.reduce((sum, t) => sum + (t.type === 'receber' ? t.amount : -t.amount), 0)
          ),
        },
      },
    ];
    return baseSnapshot;
  }

  // =========================================================================
  // 2. DOMÍNIO: PRODUÇÃO (PCP)
  // =========================================================================
  if (filters.domain === 'producao') {
    const totalPieces = filteredOrders.reduce((s, o) => s + (o.totalPieces || 0), 0);
    const activeInList = filteredOrders.filter((o) => o.stage !== 'entregue');
    const blockedCount = activeInList.filter((o) => !o.canStartProduction).length;
    const overdueCount = activeInList.filter(
      (o) =>
        o.deadlineSummary?.deliveryStatus === 'atrasada' ||
        o.deadlineSummary?.isCurrentStageOverdue ||
        (o.deadlineSummary?.delayedStagesCount ?? 0) > 0
    ).length;

    const totalRevenueEst = filteredOrders.reduce((s, o) => {
      const unit = o.costBreakdown?.negotiatedUnitPrice || o.costBreakdown?.suggestedUnitPrice || 0;
      return s + unit * (o.totalPieces || 0);
    }, 0);

    baseSnapshot.kpis = [
      {
        label: 'Ordens no Escopo',
        value: `${filteredOrders.length} OPs`,
        sublabel: `${activeInList.length} em produção · ${filteredOrders.length - activeInList.length} entregues`,
        tone: 'neutral',
      },
      {
        label: 'Volume Total de Peças',
        value: `${totalPieces.toLocaleString('pt-BR')} pçs`,
        sublabel: totalRevenueEst > 0 ? `Faturamento est.: ${formatCurrencyBRL(totalRevenueEst)}` : 'Escala industrial',
        tone: 'crimson',
      },
      {
        label: 'Bloqueadas (Gate A.3.2)',
        value: `${blockedCount} OPs`,
        sublabel: blockedCount > 0 ? 'Aguardam sinal 50% ou arte' : 'Todas liberadas para corte',
        tone: blockedCount > 0 ? 'amber' : 'emerald',
      },
      {
        label: 'Alertas de Prazo (SLA)',
        value: `${overdueCount} OPs`,
        sublabel: overdueCount > 0 ? 'Entrega ou etapa em atraso' : 'Cronograma dentro do SLA',
        tone: overdueCount > 0 ? 'rose' : 'emerald',
      },
    ];

    baseSnapshot.sections = [
      {
        id: 'orders-table',
        title: `Ordens de Produção Filtradas (${filteredOrders.length})`,
        summaryRight: `Total: ${totalPieces.toLocaleString('pt-BR')} peças`,
        emptyMessage: 'Nenhuma Ordem de Produção encontrada para os filtros aplicados.',
        columns: [
          { key: 'code', label: 'Código OP', mono: true },
          { key: 'client', label: 'Cliente' },
          { key: 'model', label: 'Modelo / Tecido / Facção' },
          { key: 'pieces', label: 'Peças', align: 'right', mono: true },
          { key: 'stage', label: 'Etapa Atual' },
          { key: 'gate', label: 'Gate A.3.2' },
          { key: 'sla', label: 'Prazo / Entrega', mono: true },
        ],
        rows: filteredOrders.map((o) => ({
          code: o.orderNumber || o.id,
          client: o.clientName,
          model: `${o.itemTitle} · ${o.fabricName}${o.outsourcedPartner ? ` · Facção: ${o.outsourcedPartner}` : ''}`,
          pieces: `${o.totalPieces}`,
          stage: getStageLabel(o.stage),
          gate: o.canStartProduction
            ? 'Liberado'
            : `Bloqueado (${!o.entryPaymentConfirmed ? 'Sinal' : ''}${!o.entryPaymentConfirmed && !o.artApproved ? '+' : ''}${!o.artApproved ? 'Arte' : ''})`,
          sla: `${formatDateBR(o.targetDeliveryDate)}${o.deadlineSummary?.deliveryStatus === 'atrasada' ? ' (ATRASADA)' : ''}`,
        })),
        totalsRow: {
          code: 'TOTAL',
          client: `${filteredOrders.length} OPs`,
          pieces: `${totalPieces.toLocaleString('pt-BR')} pçs`,
        },
      },
    ];
    return baseSnapshot;
  }

  // =========================================================================
  // 3. DOMÍNIO: COMERCIAL & LEADS CRM
  // =========================================================================
  if (filters.domain === 'comercial') {
    const totalQuoted = filteredQuotes.reduce((s, qt) => s + (qt.totalAmount || 0), 0);
    const approvedOrConverted = filteredQuotes.filter((qt) =>
      ['aprovado', 'convertido_em_pedido'].includes(qt.status)
    );
    const conversionPct =
      filteredQuotes.length > 0
        ? Math.round((approvedOrConverted.length / filteredQuotes.length) * 100)
        : 0;

    let sumMargins = 0;
    let marginItemsCount = 0;
    filteredQuotes.forEach((qt) => {
      (qt.items || []).forEach((it) => {
        if (it.costBreakdown?.estimatedMarginPercentage !== undefined) {
          sumMargins += it.costBreakdown.estimatedMarginPercentage;
          marginItemsCount++;
        }
      });
    });
    const avgMargin = marginItemsCount > 0 ? (sumMargins / marginItemsCount).toFixed(1) : '0.0';

    const filteredLeads = (perms.canViewLeads ? data.leads : []).filter((l) => {
      if (!matchesDemoFilter(l.isDemo, filters.includeDemo)) return false;
      if (!isDateWithinRange(l.createdAt, startDate, endDate)) return false;
      if (filters.leadStatus !== 'all' && l.status !== filters.leadStatus) return false;
      if (filters.category !== 'all' && l.category !== filters.category) return false;
      if (q) {
        const hay = `${l.leadNumber} ${l.clientName} ${l.companyName} ${l.phone} ${l.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    baseSnapshot.kpis = [
      {
        label: 'Valor Total em Propostas',
        value: formatCurrencyBRL(totalQuoted),
        sublabel: `${filteredQuotes.length} orçamento(s) no filtro`,
        tone: 'crimson',
      },
      {
        label: 'Taxa de Aprovação / Conversão',
        value: `${conversionPct}%`,
        sublabel: `${approvedOrConverted.length} aprovada(s) / convertida(s)`,
        tone: 'emerald',
      },
      {
        label: 'Margem Estimada Média',
        value: `${avgMargin}%`,
        sublabel: 'Calculada sobre receita líquida negociada',
        tone: 'neutral',
      },
      {
        label: 'Leads CRM no Período',
        value: `${filteredLeads.length} leads`,
        sublabel: `${filteredLeads.filter((l) => l.status === 'novo').length} novo(s) aguardando atendimento`,
        tone: 'amber',
      },
    ];

    baseSnapshot.sections = [
      {
        id: 'quotes-table',
        title: `Orçamentos & Propostas (${filteredQuotes.length})`,
        summaryRight: `Carteira: ${formatCurrencyBRL(totalQuoted)}`,
        emptyMessage: 'Nenhuma proposta comercial encontrada para os filtros selecionados.',
        columns: [
          { key: 'code', label: 'Código / Ver.', mono: true },
          { key: 'client', label: 'Cliente' },
          { key: 'seller', label: 'Vendedor' },
          { key: 'date', label: 'Emissão / Validade', mono: true },
          { key: 'art', label: 'Arte' },
          { key: 'status', label: 'Status Comercial' },
          { key: 'total', label: 'Total Negociado', align: 'right', mono: true },
        ],
        rows: filteredQuotes.map((qt) => ({
          code: `${qt.quoteNumber || qt.id} (v${qt.version})`,
          client: qt.clientName,
          seller: qt.sellerName,
          date: `${formatDateBR(qt.date)} → ${formatDateBR(qt.validUntil)}`,
          art: qt.artApproved ? 'Aprovada' : qt.artStatus === 'revisao_solicitada' ? 'Em Revisão' : 'Pendente',
          status: COMMERCIAL_STATUS_LABELS[qt.status] || qt.status,
          total: formatCurrencyBRL(qt.totalAmount),
        })),
        totalsRow: {
          code: 'TOTAL',
          client: `${filteredQuotes.length} propostas`,
          total: formatCurrencyBRL(totalQuoted),
        },
      },
    ];

    if (perms.canViewLeads) {
      baseSnapshot.sections.push({
        id: 'leads-table',
        title: `Leads Captados & Funil CRM (${filteredLeads.length})`,
        emptyMessage: 'Nenhum lead encontrado para os filtros aplicados.',
        columns: [
          { key: 'code', label: 'Lead', mono: true },
          { key: 'company', label: 'Empresa / Contato' },
          { key: 'category', label: 'Linha' },
          { key: 'qty', label: 'Qtd Est.', align: 'right', mono: true },
          { key: 'origin', label: 'Origem' },
          { key: 'status', label: 'Status' },
          { key: 'date', label: 'Entrada', mono: true },
        ],
        rows: filteredLeads.map((l) => ({
          code: l.leadNumber,
          company: `${l.companyName} (${l.clientName})`,
          category: l.category,
          qty: `${l.estimatedQuantity} pçs`,
          origin: l.origin,
          status: l.status,
          date: formatDateBR(l.createdAt.slice(0, 10)),
        })),
      });
    }
    return baseSnapshot;
  }

  // =========================================================================
  // 4. DOMÍNIO: ESTOQUE & KARDEX
  // =========================================================================
  if (filters.domain === 'estoque') {
    const totalStockValue = filteredInventory.reduce(
      (s, i) => s + (i.currentStock || 0) * (i.costPrice || 0),
      0
    );
    const criticalCount = filteredInventory.filter((i) => i.currentStock <= i.minStock).length;
    const totalThirdPartyQty = filteredInventory.reduce(
      (s, i) => s + (i.inPartnersCustodyStock || 0),
      0
    );

    baseSnapshot.kpis = [
      {
        label: 'Itens no Escopo',
        value: `${filteredInventory.length} insumos`,
        sublabel: `${criticalCount} abaixo do ponto de pedido`,
        tone: criticalCount > 0 ? 'rose' : 'emerald',
      },
      {
        label: 'Valor em Estoque Próprio (CMP)',
        value: formatCurrencyBRL(totalStockValue),
        sublabel: 'Calculado pelo Custo Médio Ponderado',
        tone: 'neutral',
      },
      {
        label: 'Em Poder de Terceiros',
        value: `${totalThirdPartyQty.toLocaleString('pt-BR')} un/m/kg`,
        sublabel: 'Tecidos sob custódia de facções',
        tone: totalThirdPartyQty > 0 ? 'amber' : 'neutral',
      },
      {
        label: 'Movimentos Kardex',
        value: `${filteredMovements.length} registros`,
        sublabel: 'Rastreabilidade compensatória auditada',
        tone: 'crimson',
      },
    ];

    baseSnapshot.sections = [
      {
        id: 'inventory-table',
        title: `Posição de Estoque & Tecidoteca (${filteredInventory.length} itens)`,
        summaryRight: `Valoração CMP: ${formatCurrencyBRL(totalStockValue)}`,
        emptyMessage: 'Nenhum item de estoque encontrado para os filtros aplicados.',
        columns: [
          { key: 'code', label: 'Código', mono: true },
          { key: 'name', label: 'Material / Fornecedor' },
          { key: 'physical', label: 'Físico', align: 'right', mono: true },
          { key: 'allocated', label: 'Alocado', align: 'right', mono: true },
          { key: 'custody', label: 'Terceiros', align: 'right', mono: true },
          { key: 'min', label: 'Mínimo', align: 'right', mono: true },
          { key: 'cmp', label: 'CMP Unit.', align: 'right', mono: true },
          { key: 'totalVal', label: 'Valor Total', align: 'right', mono: true },
        ],
        rows: filteredInventory.map((i) => ({
          code: i.code,
          name: `${i.name} · ${i.supplier}`,
          physical: `${i.currentStock} ${i.unit}`,
          allocated: `${i.allocatedStock} ${i.unit}`,
          custody: `${i.inPartnersCustodyStock ?? 0} ${i.unit}`,
          min: `${i.minStock} ${i.unit}`,
          cmp: formatCurrencyBRL(i.costPrice),
          totalVal: formatCurrencyBRL(i.currentStock * i.costPrice),
        })),
        totalsRow: {
          code: 'TOTAL',
          name: `${filteredInventory.length} insumos`,
          totalVal: formatCurrencyBRL(totalStockValue),
        },
      },
      {
        id: 'kardex-table',
        title: `Extrato Kardex de Movimentações (${filteredMovements.length})`,
        emptyMessage: 'Nenhuma movimentação Kardex no período/filtro selecionado.',
        columns: [
          { key: 'date', label: 'Data', mono: true },
          { key: 'type', label: 'Operação' },
          { key: 'item', label: 'Insumo' },
          { key: 'qty', label: 'Qtd', align: 'right', mono: true },
          { key: 'ref', label: 'Documento / OP', mono: true },
          { key: 'reason', label: 'Motivo / Operador' },
        ],
        rows: filteredMovements.slice(0, 120).map((m) => ({
          date: formatDateBR(m.date),
          type: m.type,
          item: `${m.itemCode || ''} ${m.itemName || m.itemId}`.trim(),
          qty: `${m.quantity} ${m.unit}`,
          ref: m.orderNumber || m.referenceDoc || '-',
          reason: `${m.reason} (${m.operatorName})`,
        })),
      },
    ];
    return baseSnapshot;
  }

  // =========================================================================
  // 5. DOMÍNIO: PARCEIROS & FACÇÕES
  // =========================================================================
  if (filters.domain === 'parceiros') {
    const filteredPartners = (perms.canViewPartners ? data.partners : []).filter((p) => {
      if (!matchesDemoFilter(p.isDemo, filters.includeDemo)) return false;
      if (filters.partnerId !== 'all' && p.id !== filters.partnerId) return false;
      if (filters.category !== 'all' && p.partnerType !== filters.category) return false;
      if (q) {
        const hay = `${p.code} ${p.tradeName} ${p.name} ${p.partnerType} ${p.city}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const filteredCustody = (perms.canViewPartners ? data.partnerCustody : []).filter((c) => {
      if (filters.partnerId !== 'all' && c.partnerId !== filters.partnerId) return false;
      if (filters.custodyStatus !== 'all' && c.status !== filters.custodyStatus) return false;
      if (!isDateWithinRange(c.sentDate, startDate, endDate)) return false;
      if (q) {
        const hay = `${c.partnerName || ''} ${c.partnerCode || ''} ${c.itemName || ''} ${c.orderNumber || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const forecastRows = (perms.canViewPartners ? data.partnerForecast?.rows || [] : []).filter((r) => {
      if (filters.partnerId !== 'all' && r.partnerId !== filters.partnerId) return false;
      if (!isDateWithinRange(r.forecastDueDate, startDate, endDate)) return false;
      if (q) {
        const hay = `${r.partnerName} ${r.partnerCode} ${r.orderNumber || ''} ${r.clientName} ${r.serviceReference}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const openCustodyQty = filteredCustody.reduce((s, c) => s + (c.pendingQuantity || 0), 0);
    const totalContracted = forecastRows.reduce((s, r) => s + (r.contractedAmount || 0), 0);
    const totalPaidPartners = forecastRows.reduce((s, r) => s + (r.paidAmount || 0), 0);
    const totalRemaining = forecastRows.reduce((s, r) => s + (r.remainingTotalAmount || 0), 0);

    baseSnapshot.kpis = [
      {
        label: 'Facções / Parceiros Ativos',
        value: `${filteredPartners.filter((p) => p.active).length} de ${filteredPartners.length}`,
        sublabel: 'Rede terceirizada homologada',
        tone: 'neutral',
      },
      {
        label: 'Materiais em Custódia Aberta',
        value: `${openCustodyQty.toLocaleString('pt-BR')} un/m/kg`,
        sublabel: `${filteredCustody.filter((c) => c.pendingQuantity > 0).length} remessa(s) pendente(s)`,
        tone: openCustodyQty > 0 ? 'amber' : 'emerald',
      },
      {
        label: 'Serviços Contratados (OPs)',
        value: formatCurrencyBRL(totalContracted),
        sublabel: `Já pago: ${formatCurrencyBRL(totalPaidPartners)}`,
        tone: 'crimson',
      },
      {
        label: 'Saldo / Previsão a Pagar',
        value: formatCurrencyBRL(totalRemaining),
        sublabel: `${forecastRows.length} vínculo(s) de serviço`,
        tone: totalRemaining > 0 ? 'rose' : 'emerald',
      },
    ];

    baseSnapshot.sections = [
      {
        id: 'partners-forecast',
        title: `Previsão & Execução Financeira por Parceiro/OP (${forecastRows.length})`,
        summaryRight: `Saldo Restante: ${formatCurrencyBRL(totalRemaining)}`,
        emptyMessage: 'Nenhuma provisão ou ordem vinculada a parceiros para estes filtros.',
        columns: [
          { key: 'partner', label: 'Parceiro / Serviço' },
          { key: 'op', label: 'OP / Cliente', mono: true },
          { key: 'pieces', label: 'Peças', align: 'right', mono: true },
          { key: 'contracted', label: 'Contratado', align: 'right', mono: true },
          { key: 'paid', label: 'Pago', align: 'right', mono: true },
          { key: 'remaining', label: 'Saldo Aberto', align: 'right', mono: true },
          { key: 'due', label: 'Previsão Pgto', mono: true },
        ],
        rows: forecastRows.map((r) => ({
          partner: `${r.partnerName} (${r.serviceReference})`,
          op: `${r.orderNumber || '-'} · ${r.clientName}`,
          pieces: `${r.totalPieces}`,
          contracted: formatCurrencyBRL(r.contractedAmount),
          paid: formatCurrencyBRL(r.paidAmount),
          remaining: formatCurrencyBRL(r.remainingTotalAmount),
          due: formatDateBR(r.nextDueDate || r.forecastDueDate),
        })),
        totalsRow: {
          partner: 'TOTAIS',
          contracted: formatCurrencyBRL(totalContracted),
          paid: formatCurrencyBRL(totalPaidPartners),
          remaining: formatCurrencyBRL(totalRemaining),
        },
      },
      {
        id: 'partners-custody',
        title: `Custódia de Tecidos & Materiais em Terceiros (${filteredCustody.length})`,
        emptyMessage: 'Nenhuma remessa de custódia encontrada.',
        columns: [
          { key: 'partner', label: 'Parceiro' },
          { key: 'item', label: 'Insumo' },
          { key: 'op', label: 'OP', mono: true },
          { key: 'sentDate', label: 'Remessa', mono: true },
          { key: 'sent', label: 'Enviado', align: 'right', mono: true },
          { key: 'pending', label: 'Em Poder', align: 'right', mono: true },
          { key: 'status', label: 'Status' },
        ],
        rows: filteredCustody.map((c) => ({
          partner: c.partnerName || c.partnerId,
          item: `${c.itemCode || ''} ${c.itemName || c.itemId}`.trim(),
          op: c.orderNumber || '-',
          sentDate: formatDateBR(c.sentDate),
          sent: `${c.sentQuantity} ${c.unit}`,
          pending: `${c.pendingQuantity} ${c.unit}`,
          status: c.status,
        })),
      },
    ];
    return baseSnapshot;
  }

  // =========================================================================
  // 6. DOMÍNIO: FORNECEDORES & PEDIDOS DE COMPRA
  // =========================================================================
  if (filters.domain === 'fornecedores') {
    const filteredSuppliers = (perms.canViewSuppliers ? data.suppliers : []).filter((s) => {
      if (!matchesDemoFilter(s.isDemo, filters.includeDemo)) return false;
      if (filters.supplierId !== 'all' && s.id !== filters.supplierId) return false;
      if (filters.category !== 'all' && s.category !== filters.category) return false;
      if (q) {
        const hay = `${s.code} ${s.tradeName} ${s.companyName} ${s.cnpj || ''} ${s.city}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const filteredPOs = (perms.canViewSuppliers ? data.purchaseOrders : []).filter((po) => {
      if (!matchesDemoFilter(po.isDemo, filters.includeDemo)) return false;
      const refDate = filters.dateField === 'delivery_or_due' ? po.expectedDeliveryDate : po.orderDate;
      if (!isDateWithinRange(refDate, startDate, endDate)) return false;
      if (filters.supplierId !== 'all' && po.supplierId !== filters.supplierId) return false;
      if (filters.poStatus !== 'all' && po.status !== filters.poStatus) return false;
      if (q) {
        const itemsText = (po.items || []).map((i) => `${i.itemCode} ${i.itemName}`).join(' ');
        const hay = `${po.poNumber} ${po.supplierName} ${po.relatedOrderNumber || ''} ${itemsText}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const totalPOAmount = filteredPOs
      .filter((po) => po.status !== 'cancelado')
      .reduce((s, po) => s + (po.totalAmount || 0), 0);
    const openPOs = filteredPOs.filter(
      (po) => po.status !== 'recebido_total' && po.status !== 'cancelado'
    );
    const delayedPOs = openPOs.filter(
      (po) => po.expectedDeliveryDate && po.expectedDeliveryDate < todayISO
    );

    baseSnapshot.kpis = [
      {
        label: 'Fornecedores Homologados',
        value: `${filteredSuppliers.filter((s) => s.active).length} ativos`,
        sublabel: `De ${filteredSuppliers.length} no filtro`,
        tone: 'neutral',
      },
      {
        label: 'Volume em Pedidos de Compra',
        value: formatCurrencyBRL(totalPOAmount),
        sublabel: `${filteredPOs.length} PC(s) emitido(s)`,
        tone: 'crimson',
      },
      {
        label: 'Pedidos em Aberto',
        value: `${openPOs.length} PCs`,
        sublabel: `Valor aberto: ${formatCurrencyBRL(openPOs.reduce((s, p) => s + p.totalAmount, 0))}`,
        tone: 'amber',
      },
      {
        label: 'Entregas em Atraso',
        value: `${delayedPOs.length} PCs`,
        sublabel: delayedPOs.length > 0 ? 'Cobrar previsão com fornecedor' : 'Sem atrasos de suprimentos',
        tone: delayedPOs.length > 0 ? 'rose' : 'emerald',
      },
    ];

    baseSnapshot.sections = [
      {
        id: 'purchase-orders-table',
        title: `Pedidos de Compra (${filteredPOs.length})`,
        summaryRight: `Total Válido: ${formatCurrencyBRL(totalPOAmount)}`,
        emptyMessage: 'Nenhum Pedido de Compra encontrado para os filtros aplicados.',
        columns: [
          { key: 'code', label: 'Código PC', mono: true },
          { key: 'supplier', label: 'Fornecedor' },
          { key: 'items', label: 'Itens / OP Vinculada' },
          { key: 'orderDate', label: 'Emissão', mono: true },
          { key: 'expected', label: 'Prev. Entrega', mono: true },
          { key: 'status', label: 'Status' },
          { key: 'total', label: 'Total (R$)', align: 'right', mono: true },
        ],
        rows: filteredPOs.map((po) => ({
          code: po.poNumber,
          supplier: po.supplierName,
          items: `${(po.items || []).map((it) => `${it.quantity} ${it.unit} ${it.itemName}`).join(', ')}${po.relatedOrderNumber ? ` · Ref ${po.relatedOrderNumber}` : ''}`,
          orderDate: formatDateBR(po.orderDate),
          expected: `${formatDateBR(po.expectedDeliveryDate)}${po.expectedDeliveryDate < todayISO && po.status !== 'recebido_total' && po.status !== 'cancelado' ? ' (ATRASADO)' : ''}`,
          status: PO_STATUS_LABELS[po.status] || po.status,
          total: formatCurrencyBRL(po.totalAmount),
        })),
        totalsRow: {
          code: 'TOTAL',
          supplier: `${filteredPOs.length} pedidos`,
          total: formatCurrencyBRL(totalPOAmount),
        },
      },
      {
        id: 'suppliers-directory',
        title: `Resumo por Fornecedor (${filteredSuppliers.length})`,
        emptyMessage: 'Nenhum fornecedor encontrado.',
        columns: [
          { key: 'code', label: 'Código', mono: true },
          { key: 'name', label: 'Nome / Cidade' },
          { key: 'category', label: 'Categoria' },
          { key: 'terms', label: 'Condição / Lead Time' },
          { key: 'purchased', label: 'Comprado', align: 'right', mono: true },
        ],
        rows: filteredSuppliers.map((s) => ({
          code: s.code,
          name: `${s.tradeName} · ${s.city}/${s.state}`,
          category: s.category,
          terms: `${s.paymentTerms} (${s.leadTimeDays}d)`,
          purchased: formatCurrencyBRL(s.metrics?.totalPurchasedAmount || 0),
        })),
      },
    ];
    return baseSnapshot;
  }

  // =========================================================================
  // 7. DOMÍNIO: EXECUTIVO CONSOLIDADO (360°)
  // =========================================================================
  const activeOrders = filteredOrders.filter((o) => o.stage !== 'entregue');
  const blockedOrders = activeOrders.filter((o) => !o.canStartProduction);
  const totalPiecesActive = activeOrders.reduce((s, o) => s + (o.totalPieces || 0), 0);
  const monthlyCapacity = Math.max(1, data.profile.productionCapacityPiecesMonth || 5000);
  const capacityPct = Math.min(100, Math.round((totalPiecesActive / monthlyCapacity) * 100));
  const lowStockItems = filteredInventory.filter((i) => i.currentStock <= i.minStock);
  const openQuotes = filteredQuotes.filter((qt) =>
    ['enviado', 'em_negociacao', 'aprovado'].includes(qt.status)
  );
  const openQuotesVal = openQuotes.reduce((s, qt) => s + (qt.totalAmount || 0), 0);

  baseSnapshot.kpis = [
    {
      label: 'OPs Ativas no Chão de Fábrica',
      value: `${activeOrders.length} OPs (${totalPiecesActive.toLocaleString('pt-BR')} pçs)`,
      sublabel: `${blockedOrders.length} bloqueada(s) no Gate A.3.2`,
      tone: blockedOrders.length > 0 ? 'amber' : 'neutral',
    },
    {
      label: 'Ocupação da Capacidade Fabril',
      value: `${capacityPct}%`,
      sublabel: `Meta: ${monthlyCapacity.toLocaleString('pt-BR')} pçs/mês`,
      tone: capacityPct > 90 ? 'rose' : 'crimson',
    },
    ...(perms.canViewQuotes
      ? [
          {
            label: 'Propostas Comerciais Abertas',
            value: formatCurrencyBRL(openQuotesVal),
            sublabel: `${openQuotes.length} proposta(s) em negociação`,
            tone: 'emerald' as const,
          },
        ]
      : []),
    {
      label: 'Alertas de Estoque Crítico',
      value: `${lowStockItems.length} item(ns)`,
      sublabel: `De ${filteredInventory.length} insumos filtrados`,
      tone: lowStockItems.length > 0 ? 'rose' : 'emerald',
    },
  ];

  baseSnapshot.sections = [
    {
      id: 'exec-orders',
      title: `1. Ordens de Produção no Escopo (${filteredOrders.length})`,
      summaryRight: `${totalPiecesActive.toLocaleString('pt-BR')} pçs ativas`,
      emptyMessage: 'Nenhuma ordem de produção no escopo selecionado.',
      columns: [
        { key: 'code', label: 'OP', mono: true },
        { key: 'client', label: 'Cliente' },
        { key: 'model', label: 'Modelo / Tecido' },
        { key: 'pieces', label: 'Qtd', align: 'right', mono: true },
        { key: 'stage', label: 'Estágio' },
        { key: 'gate', label: 'Gate A.3.2' },
        { key: 'delivery', label: 'Entrega', mono: true },
      ],
      rows: filteredOrders.map((o) => ({
        code: o.orderNumber || o.id,
        client: o.clientName,
        model: `${o.itemTitle} (${o.fabricName} · ${o.fabricColor})`,
        pieces: `${o.totalPieces}`,
        stage: getStageLabel(o.stage),
        gate: o.canStartProduction ? 'Liberado' : 'Bloqueado',
        delivery: formatDateBR(o.targetDeliveryDate),
      })),
    },
  ];

  if (lowStockItems.length > 0) {
    baseSnapshot.sections.push({
      id: 'exec-low-stock',
      title: `2. Insumos Abaixo do Estoque Mínimo (${lowStockItems.length})`,
      emptyMessage: 'Nenhum insumo crítico.',
      columns: [
        { key: 'code', label: 'Código', mono: true },
        { key: 'name', label: 'Material' },
        { key: 'supplier', label: 'Fornecedor' },
        { key: 'stock', label: 'Saldo Próprio', align: 'right', mono: true },
        { key: 'custody', label: 'Em Terceiros', align: 'right', mono: true },
        { key: 'min', label: 'Mínimo', align: 'right', mono: true },
      ],
      rows: lowStockItems.map((i) => ({
        code: i.code,
        name: i.name,
        supplier: i.supplier,
        stock: `${i.currentStock} ${i.unit}`,
        custody: `${i.inPartnersCustodyStock ?? 0} ${i.unit}`,
        min: `${i.minStock} ${i.unit}`,
      })),
    });
  }

  if (perms.canViewFinance && filteredFinance.length > 0) {
    const activeFin = filteredFinance.filter((t) => t.status !== 'estornado');
    const receberOpen = activeFin
      .filter((t) => t.type === 'receber' && (t.status === 'pendente' || t.status === 'atrasado'))
      .reduce((s, t) => s + t.amount, 0);
    const pagarOpen = activeFin
      .filter((t) => t.type === 'pagar' && (t.status === 'pendente' || t.status === 'atrasado'))
      .reduce((s, t) => s + t.amount, 0);
    const received = activeFin
      .filter((t) => t.type === 'receber' && t.status === 'pago')
      .reduce((s, t) => s + t.amount, 0);
    const paid = activeFin
      .filter((t) => t.type === 'pagar' && t.status === 'pago')
      .reduce((s, t) => s + t.amount, 0);
    const realizedCash = received - paid;
    const projectedBalance = realizedCash + receberOpen - pagarOpen;

    baseSnapshot.sections.push({
      id: 'finance-exec-summary',
      title: '3. Síntese Financeira Consolidada (Controladoria)',
      columns: [
        { key: 'metric', label: 'Indicador Financeiro' },
        { key: 'detail', label: 'Composição' },
        { key: 'value', label: 'Valor (R$)', align: 'right', mono: true },
      ],
      rows: [
        {
          metric: 'Caixa Realizado Líquido',
          detail: `Recebido ${formatCurrencyBRL(received)} − Pago ${formatCurrencyBRL(paid)}`,
          value: formatCurrencyBRL(realizedCash),
        },
        {
          metric: 'Contas a Receber em Aberto',
          detail: 'Sinais pendentes e saldos de entrega',
          value: formatCurrencyBRL(receberOpen),
        },
        {
          metric: 'Contas a Pagar em Aberto',
          detail: 'Fornecedores de tecidos, facções e despesas',
          value: formatCurrencyBRL(pagarOpen),
        },
        {
          metric: 'Saldo Projetado Final',
          detail: 'Caixa realizado + receber − pagar',
          value: formatCurrencyBRL(projectedBalance),
        },
      ],
    });
  }

  return baseSnapshot;
}

export function buildWhatsAppSummaryMessage(
  snapshot: ReportSnapshot,
  shareUrl: string,
  expiresAt?: string
): string {
  const lines: string[] = [
    `*${snapshot.company.tradeName} — ${snapshot.title}*`,
    `Código: ${snapshot.reportCode}`,
    `Filtros: ${snapshot.filterSummary}`,
    '',
    '*Principais Indicadores:*',
    ...snapshot.kpis.slice(0, 5).map((k) => `• ${k.label}: *${k.value}*`),
    '',
    `Acesse o relatório completo (visualização e impressão PDF):`,
    shareUrl,
  ];
  if (expiresAt) {
    lines.push(`_Link auditável válido até ${new Date(expiresAt).toLocaleString('pt-BR')}._`);
  }
  return lines.join('\n');
}

export function normalizeWhatsAppDigitsBR(rawPhone: string): string {
  let digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0') && digits.length >= 11) {
    digits = digits.replace(/^0+/, '');
  }
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function downloadSnapshotAsCsv(snapshot: ReportSnapshot) {
  const primarySection = snapshot.sections[0];
  if (!primarySection) return;

  const escapeCell = (val: string) => {
    const s = String(val ?? '').replace(/"/g, '""');
    return `"${s}"`;
  };

  const lines: string[] = [];
  lines.push([escapeCell(snapshot.title), escapeCell(snapshot.reportCode)].join(';'));
  lines.push([escapeCell(`Filtros: ${snapshot.filterSummary}`)].join(';'));
  lines.push('');

  for (const sec of snapshot.sections) {
    lines.push(escapeCell(sec.title));
    lines.push(sec.columns.map((c) => escapeCell(c.label)).join(';'));
    for (const row of sec.rows) {
      lines.push(sec.columns.map((c) => escapeCell(row[c.key] || '')).join(';'));
    }
    if (sec.totalsRow) {
      lines.push(sec.columns.map((c) => escapeCell(sec.totalsRow?.[c.key] || '')).join(';'));
    }
    lines.push('');
  }

  const bom = '\uFEFF';
  const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${snapshot.reportCode.toLowerCase()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
