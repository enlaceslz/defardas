import React, { useEffect, useMemo, useState } from 'react';
import {
  FileBarChart2,
  Filter,
  Printer,
  Share2,
  FileSpreadsheet,
  Search,
  RotateCcw,
  Calendar,
  SlidersHorizontal,
  Link2,
  Trash2,
  ShieldAlert,
  Factory,
  FileText,
  Wallet,
  Boxes,
  Handshake,
  Truck,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
  Clock,
  Sparkles,
} from 'lucide-react';
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
  SharedReportListItem,
  Supplier,
} from '../types/erp';
import { api } from '../api/client';
import { useAuth } from '../api/authContext';
import {
  buildReportSnapshot,
  countActiveFilters,
  createDefaultReportFilters,
  DatePreset,
  downloadSnapshotAsCsv,
  ReportFilterState,
  ReportPermissions,
  resolveDateRangeFromPreset,
} from '../utils/reportBuilder';
import { PrintReportModal } from './PrintReportModal';
import { WhatsAppReportShareModal } from './WhatsAppReportShareModal';

interface ReportsViewProps {
  profile: CompanyProfile;
  orders: ProductionOrder[];
  quotes: Quote[];
  inventory: InventoryItem[];
  transactions: FinancialTransaction[];
  clients: Client[];
  leads: LeadItem[];
  partners: Partner[];
  partnerCustody: PartnerCustody[];
  partnerForecast: PartnerFinancialForecastResponse | null;
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  onSendViaCentralWhatsApp?: (
    phone: string,
    recipientName: string,
    message: string
  ) => Promise<void> | void;
}

const KPI_TONE_STYLES: Record<string, string> = {
  neutral: 'text-zinc-950',
  crimson: 'text-[#C8102E]',
  emerald: 'text-emerald-700',
  amber: 'text-amber-700',
  rose: 'text-rose-700',
};

export const ReportsView: React.FC<ReportsViewProps> = ({
  profile,
  orders,
  quotes,
  inventory,
  transactions,
  clients,
  leads,
  partners,
  partnerCustody,
  partnerForecast,
  suppliers,
  purchaseOrders,
  onSendViaCentralWhatsApp,
}) => {
  const { user } = useAuth();
  const role = user?.role || '';

  const perms: ReportPermissions = useMemo(
    () => ({
      canViewFinance: ['admin', 'financeiro', 'gerente_comercial'].includes(role),
      canViewQuotes: ['admin', 'gerente_comercial', 'vendedor', 'financeiro'].includes(role),
      canViewLeads: ['admin', 'gerente_comercial', 'vendedor'].includes(role),
      canViewPartners: [
        'admin',
        'gerente_comercial',
        'pcp_producao',
        'expedicao_qualidade',
        'financeiro',
      ].includes(role),
      canViewSuppliers: ['admin', 'pcp_producao', 'financeiro', 'gerente_comercial'].includes(role),
      canViewWhatsApp: ['admin', 'gerente_comercial', 'vendedor', 'financeiro'].includes(role),
    }),
    [role]
  );

  const [filters, setFilters] = useState<ReportFilterState>(() =>
    createDefaultReportFilters('executivo')
  );
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(true);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [sharedLinks, setSharedLinks] = useState<SharedReportListItem[]>([]);
  const [showSharedLinksDrawer, setShowSharedLinksDrawer] = useState(false);

  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);

  // Carregar extrato Kardex e links compartilhados ativos
  useEffect(() => {
    let mounted = true;
    const loadExtra = async () => {
      const [movRes, sharesRes] = await Promise.all([
        api.getInventoryMovements(),
        api.listSharedReportLinks(),
      ]);
      if (!mounted) return;
      if (movRes.status === 200 && Array.isArray(movRes.data)) {
        setMovements(movRes.data);
      }
      if (sharesRes.status === 200 && Array.isArray(sharesRes.data)) {
        setSharedLinks(sharesRes.data);
      }
    };
    loadExtra();
    return () => {
      mounted = false;
    };
  }, []);

  const refreshSharedLinks = async () => {
    const res = await api.listSharedReportLinks();
    if (res.status === 200 && Array.isArray(res.data)) {
      setSharedLinks(res.data);
    }
  };

  const handleRevokeShare = async (id: string) => {
    const res = await api.revokeSharedReportLink(id);
    if (res.status === 200) {
      refreshSharedLinks();
    }
  };

  const domainTabs = useMemo(
    () =>
      [
        { id: 'executivo' as ReportDomain, label: 'Executivo 360°', icon: LayoutGrid, allowed: true },
        { id: 'producao' as ReportDomain, label: 'Produção & SLA', icon: Factory, allowed: true },
        {
          id: 'comercial' as ReportDomain,
          label: 'Comercial & CRM',
          icon: FileText,
          allowed: perms.canViewQuotes,
        },
        {
          id: 'financeiro' as ReportDomain,
          label: 'Financeiro',
          icon: Wallet,
          allowed: perms.canViewFinance,
        },
        { id: 'estoque' as ReportDomain, label: 'Estoque & Kardex', icon: Boxes, allowed: true },
        {
          id: 'parceiros' as ReportDomain,
          label: 'Parceiros & Facções',
          icon: Handshake,
          allowed: perms.canViewPartners,
        },
        {
          id: 'fornecedores' as ReportDomain,
          label: 'Fornecedores & PCs',
          icon: Truck,
          allowed: perms.canViewSuppliers,
        },
      ].filter((d) => d.allowed),
    [perms]
  );

  // Garantir que o domínio ativo seja permitido pelo RBAC
  useEffect(() => {
    if (!domainTabs.some((d) => d.id === filters.domain)) {
      setFilters((prev) => ({ ...prev, domain: 'executivo' }));
    }
  }, [domainTabs, filters.domain]);

  const updateFilter = <K extends keyof ReportFilterState>(
    key: K,
    value: ReportFilterState[K]
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleResetFilters = () => {
    setFilters((prev) => createDefaultReportFilters(prev.domain));
  };

  const applyQuickPreset = (presetId: string) => {
    const base = createDefaultReportFilters(filters.domain);
    switch (presetId) {
      case 'gate_blocked':
        setFilters({ ...base, domain: 'producao', stage: 'ativas', gateStatus: 'bloqueado' });
        break;
      case 'sla_overdue':
        setFilters({ ...base, domain: 'producao', stage: 'ativas', slaStatus: 'atrasado' });
        break;
      case 'pending_downpayment':
        setFilters({
          ...base,
          domain: 'financeiro',
          financeType: 'receber',
          financeSubType: 'entrada_pedido',
          financeStatus: 'pendente',
        });
        break;
      case 'overdue_finance':
        setFilters({ ...base, domain: 'financeiro', financeStatus: 'atrasado' });
        break;
      case 'critical_stock':
        setFilters({ ...base, domain: 'estoque', stockHealth: 'critico' });
        break;
      case 'open_quotes':
        setFilters({ ...base, domain: 'comercial', commercialStatus: 'enviado' });
        break;
      case 'partner_custody':
        setFilters({ ...base, domain: 'parceiros', custodyStatus: 'em_custodia' });
        break;
      case 'delayed_pos':
        setFilters({ ...base, domain: 'fornecedores', poStatus: 'confirmado' });
        break;
      default:
        break;
    }
  };

  const snapshot = useMemo(
    () =>
      buildReportSnapshot(
        filters,
        {
          profile,
          orders,
          quotes,
          inventory,
          movements,
          transactions,
          clients,
          leads,
          partners,
          partnerCustody,
          partnerForecast,
          suppliers,
          purchaseOrders,
        },
        perms,
        user ? `${user.fullName} (${user.role})` : 'Usuário ERP'
      ),
    [
      filters,
      profile,
      orders,
      quotes,
      inventory,
      movements,
      transactions,
      clients,
      leads,
      partners,
      partnerCustody,
      partnerForecast,
      suppliers,
      purchaseOrders,
      perms,
      user,
    ]
  );

  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);
  const resolvedDates = useMemo(
    () => resolveDateRangeFromPreset(filters.datePreset, filters.startDate, filters.endDate),
    [filters.datePreset, filters.startDate, filters.endDate]
  );
  const activeSharedLinksCount = sharedLinks.filter((s) => !s.revokedAt && !s.isExpired).length;

  return (
    <div className="space-y-6">
      {/* Top Header & Export Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-zinc-200/90">
        <div>
          <div className="text-xs font-medium text-zinc-500 flex items-center gap-2">
            <span className="font-bold text-zinc-800">DE FARDAS</span>
            <span aria-hidden="true" className="text-zinc-300">
              /
            </span>
            <span>Controladoria &amp; BI</span>
            <span aria-hidden="true" className="text-zinc-300">
              /
            </span>
            <span className="text-zinc-900 font-semibold">Central de Relatórios</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-950 mt-1 flex items-center gap-2.5">
            <FileBarChart2 className="w-6 h-6 text-[#C8102E] shrink-0" />
            <span>Relatórios Gerenciais, Filtros &amp; Exportação</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Audite indicadores por período, cliente, parceiro, fornecedor ou status e exporte em{' '}
            <strong className="text-zinc-700">PDF Impresso</strong>,{' '}
            <strong className="text-zinc-700">Link WhatsApp</strong> ou{' '}
            <strong className="text-zinc-700">CSV</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setShowSharedLinksDrawer((prev) => !prev);
              refreshSharedLinks();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-700 bg-white border border-zinc-300/90 hover:bg-zinc-50 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
          >
            <Link2 className="w-3.5 h-3.5 text-[#C8102E]" />
            <span>Links Ativos ({activeSharedLinksCount})</span>
          </button>

          <button
            type="button"
            onClick={() => downloadSnapshotAsCsv(snapshot)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-700 bg-white border border-zinc-300/90 hover:bg-zinc-50 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            <span>Exportar CSV</span>
          </button>

          <button
            type="button"
            onClick={() => setIsWhatsAppModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-xs transition-colors cursor-pointer whitespace-nowrap"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Exportar Link WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={() => setIsPrintModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#C8102E] hover:bg-[#A60D26] rounded-xl shadow-xs transition-colors cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir / Salvar PDF</span>
          </button>
        </div>
      </div>

      {/* Collapsible Shared Links Governance Panel */}
      {showSharedLinksDrawer && (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-xs overflow-hidden">
          <div className="px-5 py-3 bg-[#111113] text-white flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold">
              <Link2 className="w-4 h-4 text-[#E3263E]" />
              <span>Links Compartilhados via WhatsApp (Auditoria &amp; Revogação)</span>
            </div>
            <button
              type="button"
              onClick={() => setShowSharedLinksDrawer(false)}
              className="text-xs text-zinc-400 hover:text-white cursor-pointer"
            >
              Fechar
            </button>
          </div>
          <div className="divide-y divide-zinc-100 max-h-64 overflow-y-auto text-xs">
            {sharedLinks.length === 0 ? (
              <div className="p-6 text-center text-zinc-400">
                Nenhum link compartilhável foi gerado ainda. Clique em &ldquo;Exportar Link WhatsApp&rdquo; para criar um.
              </div>
            ) : (
              sharedLinks.map((item) => (
                <div
                  key={item.id}
                  className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-50"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-bold text-zinc-900 flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[#C8102E]">{item.reportCode}</span>
                      <span className="truncate">{item.title}</span>
                      {item.revokedAt ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700 font-semibold">
                          REVOGADO
                        </span>
                      ) : item.isExpired ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                          EXPIRADO
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                          ATIVO
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500 truncate">
                      {item.filterSummary}
                      {item.recipientLabel ? ` · Destinatário: ${item.recipientLabel}` : ''}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-400">
                      Criado por {item.createdByName} em{' '}
                      {new Date(item.createdAt).toLocaleString('pt-BR')} · Acessos: {item.accessCount}{' '}
                      · Expira em {new Date(item.expiresAt).toLocaleString('pt-BR')}
                    </div>
                  </div>

                  {!item.revokedAt && !item.isExpired && (
                    <button
                      type="button"
                      onClick={() => handleRevokeShare(item.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg cursor-pointer shrink-0 self-start sm:self-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Revogar</span>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Domain Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {domainTabs.map((tab) => {
          const Icon = tab.icon;
          const active = filters.domain === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, domain: tab.id }))}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-[#111113] text-white border-[#111113] shadow-sm'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? 'text-[#E3263E]' : 'text-zinc-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Quick Presets Strip */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="inline-flex items-center gap-1 font-bold text-zinc-600 text-[11px] uppercase tracking-wider mr-1">
          <Sparkles className="w-3.5 h-3.5 text-[#C8102E]" />
          <span>Atalhos de Auditoria:</span>
        </span>
        <button
          type="button"
          onClick={() => applyQuickPreset('gate_blocked')}
          className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-[11px] font-semibold cursor-pointer"
        >
          OPs Bloqueadas (Gate A.3.2)
        </button>
        <button
          type="button"
          onClick={() => applyQuickPreset('sla_overdue')}
          className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-semibold cursor-pointer"
        >
          Entregas/Etapas em Atraso
        </button>
        {perms.canViewFinance && (
          <>
            <button
              type="button"
              onClick={() => applyQuickPreset('pending_downpayment')}
              className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-300 text-[11px] font-semibold cursor-pointer"
            >
              Sinais 50% Pendentes
            </button>
            <button
              type="button"
              onClick={() => applyQuickPreset('overdue_finance')}
              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-[11px] font-semibold cursor-pointer"
            >
              Títulos Vencidos (CP/CR)
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => applyQuickPreset('critical_stock')}
          className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-semibold cursor-pointer"
        >
          Estoque Crítico
        </button>
        {perms.canViewQuotes && (
          <button
            type="button"
            onClick={() => applyQuickPreset('open_quotes')}
            className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-300 text-[11px] font-semibold cursor-pointer"
          >
            Orçamentos Enviados
          </button>
        )}
        {perms.canViewPartners && (
          <button
            type="button"
            onClick={() => applyQuickPreset('partner_custody')}
            className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-300 text-[11px] font-semibold cursor-pointer"
          >
            Custódia em Facções
          </button>
        )}
      </div>

      {/* Multi-Dimensional Filter Card */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 bg-zinc-50/90 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-900">
            <SlidersHorizontal className="w-4 h-4 text-[#C8102E]" />
            <span>Filtros Multidimensionais do Relatório</span>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#C8102E] text-white font-mono text-[10px]">
                {activeFilterCount} ativo(s)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:text-[#C8102E] bg-white border border-zinc-300 rounded-lg cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Limpar Filtros</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 bg-white border border-zinc-300 rounded-lg cursor-pointer"
            >
              <Filter className="w-3 h-3" />
              <span>{showAdvancedFilters ? 'Recolher Filtros' : 'Expandir Filtros'}</span>
              {showAdvancedFilters ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {showAdvancedFilters && (
          <div className="p-5 space-y-4 text-xs">
            {/* Row 1: Search, Date Presets, Custom Dates, Base & Sort */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-4 relative">
                <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                  Busca Textual Livre
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={filters.search}
                    onChange={(e) => updateFilter('search', e.target.value)}
                    placeholder="Código OP/ORC/FIN/PC, cliente, tecido, comprovante..."
                    className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-xl text-zinc-900 bg-white"
                  />
                </div>
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                  Período Predefinido
                </label>
                <select
                  value={filters.datePreset}
                  onChange={(e) => updateFilter('datePreset', e.target.value as DatePreset)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                >
                  <option value="all">Todo o histórico</option>
                  <option value="today">Hoje</option>
                  <option value="7d">Últimos 7 dias</option>
                  <option value="30d">Últimos 30 dias</option>
                  <option value="this_month">Mês atual</option>
                  <option value="last_month">Mês anterior</option>
                  <option value="90d">Últimos 90 dias</option>
                  <option value="custom">Intervalo personalizado</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                  Referência de Data
                </label>
                <select
                  value={filters.dateField}
                  onChange={(e) => updateFilter('dateField', e.target.value as any)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                >
                  <option value="auto">Automática</option>
                  <option value="creation">Emissão / Baixa</option>
                  <option value="delivery_or_due">Entrega / Vencimento</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                  Ordenação &amp; Origem dos Dados
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={filters.sortBy}
                    onChange={(e) => updateFilter('sortBy', e.target.value as any)}
                    className="px-2.5 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                  >
                    <option value="date_desc">Data (Mais recente)</option>
                    <option value="date_asc">Data (Mais antiga)</option>
                    <option value="value_desc">Maior Valor/Qtd</option>
                    <option value="value_asc">Menor Valor/Qtd</option>
                    <option value="name_asc">Nome (A–Z)</option>
                  </select>
                  <select
                    value={filters.includeDemo}
                    onChange={(e) => updateFilter('includeDemo', e.target.value as any)}
                    className="px-2.5 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                    title="Segregar registros de demonstração vs. operação real"
                  >
                    <option value="all">Base Completa</option>
                    <option value="only_real">Somente Reais</option>
                    <option value="only_demo">Somente Demo</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Custom Date Inputs if custom or active preset */}
            {(filters.datePreset === 'custom' || resolvedDates.startDate || resolvedDates.endDate) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-xl bg-zinc-50 border border-zinc-200">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>Data Inicial</span>
                  </label>
                  <input
                    type="date"
                    value={
                      filters.datePreset === 'custom' ? filters.startDate : resolvedDates.startDate
                    }
                    onChange={(e) => {
                      updateFilter('datePreset', 'custom');
                      updateFilter('startDate', e.target.value);
                    }}
                    className="w-full px-3 py-1.5 border border-zinc-300 rounded-lg bg-white text-zinc-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>Data Final</span>
                  </label>
                  <input
                    type="date"
                    value={filters.datePreset === 'custom' ? filters.endDate : resolvedDates.endDate}
                    onChange={(e) => {
                      updateFilter('datePreset', 'custom');
                      updateFilter('endDate', e.target.value);
                    }}
                    className="w-full px-3 py-1.5 border border-zinc-300 rounded-lg bg-white text-zinc-900 font-mono"
                  />
                </div>
              </div>
            )}

            {/* Row 2: Contextual Entity & Domain Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 border-t border-zinc-100">
              {/* Client Filter */}
              {['executivo', 'producao', 'comercial', 'financeiro'].includes(filters.domain) && (
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                    Cliente
                  </label>
                  <select
                    value={filters.clientId}
                    onChange={(e) => updateFilter('clientId', e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                  >
                    <option value="all">Todos os Clientes ({clients.length})</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.tradeName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Partner Filter */}
              {perms.canViewPartners &&
                ['executivo', 'producao', 'financeiro', 'parceiros'].includes(filters.domain) && (
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                      Parceiro / Facção
                    </label>
                    <select
                      value={filters.partnerId}
                      onChange={(e) => updateFilter('partnerId', e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                    >
                      <option value="all">Todos os Parceiros ({partners.length})</option>
                      {partners.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.tradeName} ({p.code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

              {/* Supplier Filter */}
              {perms.canViewSuppliers &&
                ['estoque', 'financeiro', 'fornecedores'].includes(filters.domain) && (
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                      Fornecedor de Insumos
                    </label>
                    <select
                      value={filters.supplierId}
                      onChange={(e) => updateFilter('supplierId', e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                    >
                      <option value="all">Todos os Fornecedores ({suppliers.length})</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.tradeName} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

              {/* Production Specific Filters */}
              {['executivo', 'producao'].includes(filters.domain) && (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                      Etapa Kanban
                    </label>
                    <select
                      value={filters.stage}
                      onChange={(e) => updateFilter('stage', e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                    >
                      <option value="all">Todas as Etapas</option>
                      <option value="ativas">Somente Em Andamento</option>
                      <option value="entregues">Somente Entregues</option>
                      <option value="aguardando_liberacao">Aguardando Liberação</option>
                      <option value="corte">1. Corte &amp; Enfesto</option>
                      <option value="bordado_silk">2. Bordado &amp; Silk</option>
                      <option value="costura">3. Costura &amp; Montagem</option>
                      <option value="conferencia_qualidade">4. Conferência Qualidade</option>
                      <option value="retrabalho">4b. Retrabalho</option>
                      <option value="expedicao">5. Expedição</option>
                      <option value="entregue">Entregue</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                      Portão Gate A.3.2
                    </label>
                    <select
                      value={filters.gateStatus}
                      onChange={(e) => updateFilter('gateStatus', e.target.value as any)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                    >
                      <option value="all">Todos (Liberados e Bloqueados)</option>
                      <option value="liberado">Liberados para Corte</option>
                      <option value="bloqueado">Bloqueados no Gate A.3.2</option>
                      <option value="sem_sinal">Sem Sinal 50% Confirmado</option>
                      <option value="sem_arte">Sem Arte Aprovada</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                      Cumprimento de Prazo (SLA)
                    </label>
                    <select
                      value={filters.slaStatus}
                      onChange={(e) => updateFilter('slaStatus', e.target.value as any)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                    >
                      <option value="all">Todos os Prazos</option>
                      <option value="atrasado">Em Atraso (Entrega/Etapa)</option>
                      <option value="alerta">Em Alerta (Vence Hoje / ≤ 2d)</option>
                      <option value="no_prazo">No Prazo</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                      Prioridade &amp; Linha
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={filters.priority}
                        onChange={(e) => updateFilter('priority', e.target.value)}
                        className="px-2.5 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                      >
                        <option value="all">Prioridade: Todas</option>
                        <option value="urgente">Urgente</option>
                        <option value="alta">Alta</option>
                        <option value="normal">Normal</option>
                      </select>
                      <select
                        value={filters.category}
                        onChange={(e) => updateFilter('category', e.target.value)}
                        className="px-2.5 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                      >
                        <option value="all">Linha: Todas</option>
                        <option value="polos">Polos</option>
                        <option value="camisetas">Camisetas</option>
                        <option value="jalecos">Jalecos</option>
                        <option value="calcas">Calças</option>
                        <option value="coletes">Coletes</option>
                        <option value="linha_social">Linha Social</option>
                        <option value="linha_hospitalar">Hospitalar</option>
                        <option value="aventais_batas">Aventais/Batas</option>
                        <option value="macacoes">Macacões</option>
                        <option value="operacional">Operacional</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* Commercial Filters */}
              {filters.domain === 'comercial' && (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                      Status Comercial
                    </label>
                    <select
                      value={filters.commercialStatus}
                      onChange={(e) => updateFilter('commercialStatus', e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                    >
                      <option value="all">Todos os Status</option>
                      <option value="rascunho">Rascunho</option>
                      <option value="enviado">Enviado</option>
                      <option value="em_negociacao">Em Negociação</option>
                      <option value="aprovado">Aprovado</option>
                      <option value="convertido_em_pedido">Convertido em OP</option>
                      <option value="recusado">Recusado</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                      Aprovação de Arte
                    </label>
                    <select
                      value={filters.artStatus}
                      onChange={(e) => updateFilter('artStatus', e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                    >
                      <option value="all">Todas</option>
                      <option value="aprovada">Arte Aprovada</option>
                      <option value="enviada_para_cliente">Enviada ao Cliente</option>
                      <option value="revisao_solicitada">Revisão Solicitada</option>
                      <option value="pendente">Pendente</option>
                    </select>
                  </div>

                  {perms.canViewLeads && (
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                        Funil de Leads CRM
                      </label>
                      <select
                        value={filters.leadStatus}
                        onChange={(e) => updateFilter('leadStatus', e.target.value)}
                        className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                      >
                        <option value="all">Todos os Leads</option>
                        <option value="novo">Novo</option>
                        <option value="em_atendimento">Em Atendimento</option>
                        <option value="orcamento_enviado">Orçamento Enviado</option>
                        <option value="convertido">Convertido</option>
                        <option value="perdido">Perdido</option>
                      </select>
                    </div>
                  )}
                </>
              )}

              {/* Financial Filters */}
              {filters.domain === 'financeiro' && (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                      Tipo de Lançamento
                    </label>
                    <select
                      value={filters.financeType}
                      onChange={(e) => updateFilter('financeType', e.target.value as any)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                    >
                      <option value="all">Entradas e Saídas (Todos)</option>
                      <option value="receber">A Receber (Entradas)</option>
                      <option value="pagar">A Pagar (Saídas)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                      Natureza / Subtipo
                    </label>
                    <select
                      value={filters.financeSubType}
                      onChange={(e) => updateFilter('financeSubType', e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                    >
                      <option value="all">Todas as Naturezas</option>
                      <option value="entrada_pedido">Sinal de Entrada (50%)</option>
                      <option value="saldo_entrega">Saldo na Entrega (50%)</option>
                      <option value="compra_tecido">Compra Tecido / Fornecedor</option>
                      <option value="servico_terceirizado">Serviço Facção / Terceiro</option>
                      <option value="despesa_geral">Despesa Operacional Geral</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                      Status &amp; Forma de Pgto
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={filters.financeStatus}
                        onChange={(e) => updateFilter('financeStatus', e.target.value)}
                        className="px-2.5 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                      >
                        <option value="all">Status: Todos</option>
                        <option value="pendente">Pendente</option>
                        <option value="atrasado">Atrasado</option>
                        <option value="pago">Liquidado</option>
                        <option value="estornado">Estornado</option>
                      </select>
                      <select
                        value={filters.paymentMethod}
                        onChange={(e) => updateFilter('paymentMethod', e.target.value)}
                        className="px-2.5 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                      >
                        <option value="all">Forma: Todas</option>
                        <option value="pix">PIX</option>
                        <option value="boleto">Boleto</option>
                        <option value="transferencia">Transferência</option>
                        <option value="cartao">Cartão</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* Inventory Filters */}
              {filters.domain === 'estoque' && (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                      Situação do Saldo
                    </label>
                    <select
                      value={filters.stockHealth}
                      onChange={(e) => updateFilter('stockHealth', e.target.value as any)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                    >
                      <option value="all">Todos os Itens</option>
                      <option value="critico">Abaixo do Mínimo (Crítico)</option>
                      <option value="em_terceiros">Com Saldo em Terceiros</option>
                      <option value="alocado">Com Reserva para OPs</option>
                      <option value="normal">Saldo Regular</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                      Categoria de Insumo
                    </label>
                    <select
                      value={filters.category}
                      onChange={(e) => updateFilter('category', e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                    >
                      <option value="all">Todas as Categorias</option>
                      <option value="tecido">Tecidos &amp; Malhas</option>
                      <option value="aviamento">Aviamentos</option>
                      <option value="insumo_personalizacao">Insumo Personalização</option>
                      <option value="pronta_entrega">Pronta Entrega</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                      Operação Kardex
                    </label>
                    <select
                      value={filters.movementType}
                      onChange={(e) => updateFilter('movementType', e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                    >
                      <option value="all">Todas as Movimentações</option>
                      <option value="entrada_compra">Entrada de Compra</option>
                      <option value="saida_corte">Saída para Corte</option>
                      <option value="remessa_parceiro">Remessa para Facção</option>
                      <option value="retorno_parceiro">Retorno de Facção</option>
                      <option value="perda_tecnica">Perda Técnica</option>
                      <option value="ajuste_inventario">Ajuste Inventário</option>
                    </select>
                  </div>
                </>
              )}

              {/* Partners Filters */}
              {filters.domain === 'parceiros' && (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                      Especialidade da Facção
                    </label>
                    <select
                      value={filters.category}
                      onChange={(e) => updateFilter('category', e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                    >
                      <option value="all">Todas as Especialidades</option>
                      <option value="costura">Costura &amp; Montagem</option>
                      <option value="bordado">Bordado</option>
                      <option value="silk_screen">Silk-Screen</option>
                      <option value="acabamento">Acabamento</option>
                      <option value="corte_externo">Corte Externo</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                      Status da Custódia
                    </label>
                    <select
                      value={filters.custodyStatus}
                      onChange={(e) => updateFilter('custodyStatus', e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                    >
                      <option value="all">Todos os Status</option>
                      <option value="em_custodia">Em Custódia (Aberto)</option>
                      <option value="devolvido_parcial">Devolvido Parcial</option>
                      <option value="devolvido_total">Devolvido Total</option>
                      <option value="avaria_registrada">Avaria / Perda Registrada</option>
                    </select>
                  </div>
                </>
              )}

              {/* Suppliers & POs Filters */}
              {filters.domain === 'fornecedores' && (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                      Categoria do Fornecedor
                    </label>
                    <select
                      value={filters.category}
                      onChange={(e) => updateFilter('category', e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                    >
                      <option value="all">Todas</option>
                      <option value="tecidos_malhas">Tecidos &amp; Malhas</option>
                      <option value="aviamentos">Aviamentos</option>
                      <option value="bordado_estamparia">Bordado &amp; Estamparia</option>
                      <option value="embalagens">Embalagens</option>
                      <option value="servicos_manutencao">Serviços / Manutenção</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                      Status do Pedido de Compra (PC)
                    </label>
                    <select
                      value={filters.poStatus}
                      onChange={(e) => updateFilter('poStatus', e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900"
                    >
                      <option value="all">Todos os PCs</option>
                      <option value="rascunho">Rascunho</option>
                      <option value="enviado">Enviado</option>
                      <option value="confirmado">Confirmado</option>
                      <option value="recebido_parcial">Recebido Parcial</option>
                      <option value="recebido_total">Recebido Total</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Live Snapshot Preview Container */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-xs p-5 sm:p-6 space-y-5">
        {/* Snapshot Meta Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-200">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#111113] text-white">
                {snapshot.reportCode}
              </span>
              <h2 className="text-base font-extrabold text-zinc-950">{snapshot.title}</h2>
            </div>
            <p className="text-xs text-zinc-500 mt-1">{snapshot.filterSummary}</p>
          </div>

          <div className="text-[11px] text-zinc-500 font-mono flex items-center gap-1.5 shrink-0">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>Atualizado em tempo real</span>
          </div>
        </div>

        {/* KPI Cards */}
        {snapshot.kpis.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {snapshot.kpis.map((kpi, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-zinc-50/90 border border-zinc-200/90 space-y-1"
              >
                <div className="text-[11px] font-semibold text-zinc-500">{kpi.label}</div>
                <div
                  className={`text-lg font-extrabold font-mono tabular-nums ${
                    KPI_TONE_STYLES[kpi.tone || 'neutral'] || 'text-zinc-950'
                  }`}
                >
                  {kpi.value}
                </div>
                {kpi.sublabel && (
                  <div className="text-[11px] text-zinc-500 leading-snug">{kpi.sublabel}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Domain Audit Notice if Executive and restricted */}
        {filters.domain === 'executivo' && !perms.canViewFinance && (
          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Conforme RBAC (<span className="font-mono">finance:view</span>), indicadores financeiros
              consolidados estão ocultos para o perfil <strong>{role}</strong>.
            </span>
          </div>
        )}

        {/* Sections Tables */}
        <div className="space-y-5">
          {snapshot.sections.map((section) => (
            <div key={section.id} className="border border-zinc-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-zinc-100/90 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                  {section.title}
                </span>
                {section.summaryRight && (
                  <span className="text-xs font-mono font-semibold text-zinc-700">
                    {section.summaryRight}
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-bold">
                      {section.columns.map((col) => (
                        <th
                          key={col.key}
                          className={`py-2.5 px-3.5 ${
                            col.align === 'right'
                              ? 'text-right'
                              : col.align === 'center'
                                ? 'text-center'
                                : 'text-left'
                          }`}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {section.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={section.columns.length}
                          className="py-8 text-center text-zinc-400"
                        >
                          {section.emptyMessage || 'Nenhum registro encontrado para os filtros aplicados.'}
                        </td>
                      </tr>
                    ) : (
                      section.rows.map((row, rowIdx) => (
                        <tr key={rowIdx} className="hover:bg-zinc-50/80 transition-colors">
                          {section.columns.map((col) => (
                            <td
                              key={col.key}
                              className={`py-2.5 px-3.5 align-top ${
                                col.align === 'right'
                                  ? 'text-right'
                                  : col.align === 'center'
                                    ? 'text-center'
                                    : 'text-left'
                              } ${col.mono ? 'font-mono tabular-nums text-[11px]' : 'text-zinc-800'}`}
                            >
                              {row[col.key] ?? '-'}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                    {section.totalsRow && section.rows.length > 0 && (
                      <tr className="bg-zinc-100/90 border-t-2 border-zinc-300 font-bold text-zinc-950">
                        {section.columns.map((col) => (
                          <td
                            key={col.key}
                            className={`py-2.5 px-3.5 ${
                              col.align === 'right'
                                ? 'text-right'
                                : col.align === 'center'
                                  ? 'text-center'
                                  : 'text-left'
                            } ${col.mono ? 'font-mono tabular-nums' : ''}`}
                          >
                            {section.totalsRow?.[col.key] ?? ''}
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Print / PDF Modal */}
      {isPrintModalOpen && (
        <PrintReportModal
          snapshot={snapshot}
          profile={profile}
          clients={clients}
          partners={partners}
          suppliers={suppliers}
          onSendViaCentralWhatsApp={onSendViaCentralWhatsApp}
          onClose={() => setIsPrintModalOpen(false)}
        />
      )}

      {/* WhatsApp Share Modal */}
      {isWhatsAppModalOpen && (
        <WhatsAppReportShareModal
          snapshot={snapshot}
          clients={clients}
          partners={partners}
          suppliers={suppliers}
          canSendViaCentral={perms.canViewWhatsApp}
          onSendViaCentralWhatsApp={onSendViaCentralWhatsApp}
          onClose={() => {
            setIsWhatsAppModalOpen(false);
            refreshSharedLinks();
          }}
        />
      )}
    </div>
  );
};
