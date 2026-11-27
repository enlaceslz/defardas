import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Factory,
  FileText,
  Boxes,
  Users,
  Wallet,
  Settings,
  AlertTriangle,
  Shirt,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  ChevronDown,
  X,
  HelpCircle,
  MessageSquare,
  ShieldAlert,
  LogOut,
  Handshake,
  CalendarClock,
  Truck,
  Search,
  FileBarChart2,
} from 'lucide-react';
import { CompanyProfile } from '../types/erp';
import { useAuth } from '../api/authContext';
import { DEFAULT_BRAND_LOGO_URL } from '../data/initialData';
import { PWAInstallButton } from './PWAInstallButton';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  activeOrdersCount: number;
  activePiecesCount: number;
  blockedOrdersCount: number;
  overdueOrdersCount?: number;
  lowStockCount: number;
  openPurchaseOrdersCount?: number;
  delayedPurchaseOrdersCount?: number;
  openCustodyCount?: number;
  newLeadsCount?: number;
  pendingQuotesCount: number;
  pendingDownpaymentsCount: number;
  overdueFinanceCount: number;
  whatsappUnreadCount?: number;
  profile: CompanyProfile;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenNewOrderModal: () => void;
  onOpenNewQuoteModal: () => void;
  onOpenHelpManual: () => void;
}

type IndicatorTone = 'neutral' | 'danger' | 'warning' | 'success';

interface SidebarNavItem {
  id: string;
  label: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
  indicatorText: string | null;
  indicatorTone: IndicatorTone;
  detailTooltip?: string;
  urgentDot?: boolean;
  dotClass?: string;
}

interface SidebarNavGroup {
  id: string;
  groupTitle: string;
  items: SidebarNavItem[];
}

interface FloatingTooltipState {
  label: string;
  detail?: string | null;
  top: number;
  left: number;
}

const ROLE_LABELS_PT: Record<string, string> = {
  admin: 'Administrador',
  gerente_comercial: 'Gerente Comercial',
  vendedor: 'Vendedor',
  pcp_producao: 'PCP & Produção',
  expedicao_qualidade: 'Expedição & Qualidade',
  financeiro: 'Financeiro',
};

const GROUPS_STORAGE_KEY = 'defardas_sidebar_groups_v2';

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  activeOrdersCount,
  activePiecesCount,
  blockedOrdersCount,
  overdueOrdersCount = 0,
  lowStockCount,
  openPurchaseOrdersCount = 0,
  delayedPurchaseOrdersCount = 0,
  openCustodyCount = 0,
  newLeadsCount = 0,
  pendingQuotesCount,
  pendingDownpaymentsCount,
  overdueFinanceCount,
  whatsappUnreadCount = 0,
  profile,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  onOpenNewOrderModal,
  onOpenNewQuoteModal,
  onOpenHelpManual,
}) => {
  const { user, logout } = useAuth();
  const role = user?.role || '';
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [floatingTooltip, setFloatingTooltip] = useState<FloatingTooltipState | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(GROUPS_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const node = tooltipRef.current;
    if (!node || !floatingTooltip) return;
    node.style.top = `${floatingTooltip.top}px`;
    node.style.left = `${floatingTooltip.left}px`;
  }, [floatingTooltip]);

  // Permissões alinhadas estritamente com server/auth/rbac.ts
  const canCreateOrder = ['admin', 'gerente_comercial', 'pcp_producao'].includes(role);
  const canCreateQuote = ['admin', 'gerente_comercial', 'vendedor'].includes(role);
  const canViewSuppliers = ['admin', 'pcp_producao', 'financeiro', 'gerente_comercial'].includes(role);
  const canViewPartners = [
    'admin',
    'gerente_comercial',
    'pcp_producao',
    'expedicao_qualidade',
    'financeiro',
  ].includes(role);
  const canViewFinance = ['admin', 'financeiro', 'gerente_comercial'].includes(role);
  const canViewWhatsApp = ['admin', 'gerente_comercial', 'vendedor', 'financeiro'].includes(role);
  const canViewSettings = role === 'admin';

  const focusDesktopSearch = useCallback(() => {
    if (isCollapsed) {
      onToggleCollapse();
      window.setTimeout(() => searchInputRef.current?.focus(), 140);
    } else {
      searchInputRef.current?.focus();
    }
  }, [isCollapsed, onToggleCollapse]);

  // Atalho Ctrl+K / Cmd+K para focar busca rápida de módulos
  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        focusDesktopSearch();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [focusDesktopSearch]);

  // Fechar drawer mobile com Escape e travar scroll do body
  useEffect(() => {
    if (!isMobileOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseMobile();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileOpen, onCloseMobile]);

  // Limpar tooltip flutuante ao expandir/recolher ou trocar de aba
  useEffect(() => {
    setFloatingTooltip(null);
  }, [isCollapsed, currentTab]);

  const rawGroups: SidebarNavGroup[] = useMemo(() => {
    const financeIndicator =
      overdueFinanceCount > 0
        ? `${overdueFinanceCount} venc.`
        : pendingDownpaymentsCount > 0
          ? `${pendingDownpaymentsCount} ${pendingDownpaymentsCount === 1 ? 'sinal' : 'sinais'}`
          : null;

    const financeTone: IndicatorTone =
      overdueFinanceCount > 0 ? 'danger' : pendingDownpaymentsCount > 0 ? 'warning' : 'neutral';

    return [
      {
        id: 'pcp',
        groupTitle: 'Operação e fábrica',
        items: [
          {
            id: 'dashboard',
            label: 'Painel Geral',
            keywords: 'dashboard resumo kpi indicadores inicio home painel',
            icon: LayoutDashboard,
            indicatorText: null,
            indicatorTone: 'neutral',
          },
          {
            id: 'orders',
            label: 'Ordens de Produção',
            keywords: 'op pcp producao kanban corte costura cronograma prazo gate entrega',
            icon: Factory,
            indicatorText:
              overdueOrdersCount > 0
                ? `${overdueOrdersCount} atras.`
                : activeOrdersCount > 0
                  ? `${activeOrdersCount}`
                  : null,
            indicatorTone:
              overdueOrdersCount > 0
                ? 'danger'
                : blockedOrdersCount > 0
                  ? 'warning'
                  : 'neutral',
            detailTooltip:
              overdueOrdersCount > 0
                ? `${overdueOrdersCount} em atraso · ${activeOrdersCount} ativas`
                : blockedOrdersCount > 0
                  ? `${blockedOrdersCount} no Gate A.3.2 · ${activeOrdersCount} ativas`
                  : activeOrdersCount > 0
                    ? `${activeOrdersCount} ativas`
                    : undefined,
            urgentDot: overdueOrdersCount > 0 || blockedOrdersCount > 0,
            dotClass: overdueOrdersCount > 0 ? 'bg-rose-500' : 'bg-amber-400',
          },
          {
            id: 'inventory',
            label: 'Estoque & Tecidos',
            keywords: 'tecidoteca insumo kardex cmp aviamento malha brim estoque',
            icon: Boxes,
            indicatorText: lowStockCount > 0 ? `${lowStockCount} crít.` : null,
            indicatorTone: lowStockCount > 0 ? 'warning' : 'neutral',
            detailTooltip:
              lowStockCount > 0
                ? `${lowStockCount} ${lowStockCount === 1 ? 'item abaixo do mínimo' : 'itens abaixo do mínimo'}`
                : undefined,
            urgentDot: lowStockCount > 0,
            dotClass: 'bg-amber-400',
          },
          ...(canViewSuppliers
            ? [
                {
                  id: 'suppliers',
                  label: 'Fornecedores & Compras',
                  keywords: 'fornecedor compra pedido pc materia prima tecido suprimentos',
                  icon: Truck,
                  indicatorText:
                    delayedPurchaseOrdersCount > 0
                      ? `${delayedPurchaseOrdersCount} atras.`
                      : openPurchaseOrdersCount > 0
                        ? `${openPurchaseOrdersCount} ${openPurchaseOrdersCount === 1 ? 'PC' : 'PCs'}`
                        : null,
                  indicatorTone: delayedPurchaseOrdersCount > 0 ? 'danger' : 'neutral',
                  detailTooltip:
                    delayedPurchaseOrdersCount > 0
                      ? `${delayedPurchaseOrdersCount} PC em atraso`
                      : openPurchaseOrdersCount > 0
                        ? `${openPurchaseOrdersCount} pedidos em aberto`
                        : undefined,
                  urgentDot: delayedPurchaseOrdersCount > 0,
                  dotClass: 'bg-rose-500',
                } as SidebarNavItem,
              ]
            : []),
          ...(canViewPartners
            ? [
                {
                  id: 'partners',
                  label: 'Parceiros & Facções',
                  keywords: 'faccao terceirizado oficina costura bordado silk custodia parceiro',
                  icon: Handshake,
                  indicatorText: openCustodyCount > 0 ? `${openCustodyCount} cust.` : null,
                  indicatorTone: 'neutral',
                  detailTooltip:
                    openCustodyCount > 0
                      ? `${openCustodyCount} remessas em custódia`
                      : undefined,
                } as SidebarNavItem,
              ]
            : []),
        ],
      },
      {
        id: 'comercial',
        groupTitle: 'Comercial e atendimento',
        items: [
          {
            id: 'quotes',
            label: 'Orçamentos & Preços',
            keywords: 'orcamento proposta markup preco arte aprovacao venda comercial',
            icon: FileText,
            indicatorText: pendingQuotesCount > 0 ? `${pendingQuotesCount}` : null,
            indicatorTone: 'neutral',
            detailTooltip:
              pendingQuotesCount > 0 ? `${pendingQuotesCount} propostas em aberto` : undefined,
          },
          {
            id: 'clients',
            label: 'Clientes & Leads CRM',
            keywords: 'cliente crm empresa cnpj lead funil carteira contato',
            icon: Users,
            indicatorText:
              newLeadsCount > 0
                ? `${newLeadsCount} ${newLeadsCount === 1 ? 'lead' : 'leads'}`
                : null,
            indicatorTone: newLeadsCount > 0 ? 'warning' : 'neutral',
            detailTooltip:
              newLeadsCount > 0 ? `${newLeadsCount} novos leads` : undefined,
          },
          ...(canViewWhatsApp
            ? [
                {
                  id: 'whatsapp',
                  label: 'Central WhatsApp',
                  keywords: 'whatsapp chat atendimento mensagem omnichannel zap conversa',
                  icon: MessageSquare,
                  indicatorText:
                    whatsappUnreadCount > 0
                      ? `${whatsappUnreadCount} ${whatsappUnreadCount === 1 ? 'nova' : 'novas'}`
                      : null,
                  indicatorTone: whatsappUnreadCount > 0 ? 'success' : 'neutral',
                  detailTooltip:
                    whatsappUnreadCount > 0
                      ? `${whatsappUnreadCount} mensagens não lidas`
                      : undefined,
                  urgentDot: whatsappUnreadCount > 0,
                  dotClass: 'bg-emerald-400',
                } as SidebarNavItem,
              ]
            : []),
        ],
      },
      {
        id: 'gestao',
        groupTitle: 'Gestão e sistema',
        items: [
          ...(canViewFinance
            ? [
                {
                  id: 'finance',
                  label: 'Fluxo Financeiro',
                  keywords: 'financeiro caixa pagar receber sinal 50 comprovante titulo',
                  icon: Wallet,
                  indicatorText: financeIndicator,
                  indicatorTone: financeTone,
                  detailTooltip:
                    overdueFinanceCount > 0
                      ? `${overdueFinanceCount} títulos vencidos`
                      : pendingDownpaymentsCount > 0
                        ? `${pendingDownpaymentsCount} sinais pendentes`
                        : undefined,
                  urgentDot: overdueFinanceCount > 0 || pendingDownpaymentsCount > 0,
                  dotClass: overdueFinanceCount > 0 ? 'bg-rose-500' : 'bg-amber-400',
                } as SidebarNavItem,
              ]
            : []),
          {
            id: 'reports',
            label: 'Relatórios & Exportação',
            keywords: 'relatorio pdf whatsapp exportacao filtro kpi estoque financeiro pcp',
            icon: FileBarChart2,
            indicatorText: null,
            indicatorTone: 'neutral',
          },
          {
            id: 'portal',
            label: 'Vitrine & Catálogo B2B',
            keywords: 'portal site publico catalogo vitrine portfolio landing',
            icon: Shirt,
            indicatorText: null,
            indicatorTone: 'neutral',
          },
          ...(canViewSettings
            ? [
                {
                  id: 'settings',
                  label: 'Configurações & Backup',
                  keywords: 'configuracao empresa perfil logo backup restauracao sistema',
                  icon: Settings,
                  indicatorText: null,
                  indicatorTone: 'neutral',
                } as SidebarNavItem,
              ]
            : []),
          {
            id: 'help_manual',
            label: 'Manual Operacional',
            keywords: 'ajuda manual prd regras negocio documentacao suporte',
            icon: HelpCircle,
            indicatorText: null,
            indicatorTone: 'neutral',
          },
        ],
      },
    ];
  }, [
    activeOrdersCount,
    blockedOrdersCount,
    canViewFinance,
    canViewPartners,
    canViewSettings,
    canViewSuppliers,
    canViewWhatsApp,
    delayedPurchaseOrdersCount,
    lowStockCount,
    newLeadsCount,
    openCustodyCount,
    openPurchaseOrdersCount,
    overdueFinanceCount,
    overdueOrdersCount,
    pendingDownpaymentsCount,
    pendingQuotesCount,
    whatsappUnreadCount,
  ]);

  // Garante automaticamente que o grupo da aba ativa esteja expandido
  useEffect(() => {
    const ownerGroup = rawGroups.find((g) => g.items.some((item) => item.id === currentTab));
    if (!ownerGroup) return;
    setCollapsedGroups((prev) => {
      if (!prev[ownerGroup.id]) return prev;
      const next = { ...prev, [ownerGroup.id]: false };
      try {
        localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignorar indisponibilidade de storage
      }
      return next;
    });
  }, [currentTab, rawGroups]);

  const normalizedQuery = normalizeText(searchQuery);

  const menuGroups = useMemo(() => {
    if (!normalizedQuery) return rawGroups;
    return rawGroups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            normalizeText(item.label).includes(normalizedQuery) ||
            normalizeText(item.keywords).includes(normalizedQuery)
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [rawGroups, normalizedQuery]);

  const flattenedResults = useMemo(
    () => menuGroups.flatMap((group) => group.items),
    [menuGroups]
  );

  useEffect(() => {
    setHighlightedIndex(0);
  }, [normalizedQuery]);

  const navigateToItem = useCallback(
    (itemId: string) => {
      if (itemId === 'help_manual') {
        onOpenHelpManual();
      } else {
        onSelectTab(itemId);
      }
      setSearchQuery('');
      setFloatingTooltip(null);
      onCloseMobile();
    },
    [onCloseMobile, onOpenHelpManual, onSelectTab]
  );

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      try {
        localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignorar indisponibilidade de storage
      }
      return next;
    });
  };

  // Cálculo real de ocupação fabril baseado nas peças efetivas em produção
  const capacityTotal = profile.productionCapacityPiecesMonth || 5000;
  const rawCapacityPercent =
    capacityTotal > 0 ? Math.round((activePiecesCount / capacityTotal) * 100) : 0;
  const capacityBarPercent = Math.min(100, Math.max(0, rawCapacityPercent));
  const isOverCapacity = activePiecesCount > capacityTotal;
  const logoSrc = profile.logoUrl || DEFAULT_BRAND_LOGO_URL;

  // Alerta operacional consolidado (máximo 1 linha compacta para preservar área de navegação)
  const primaryAlert = useMemo(() => {
    const categories = [
      overdueOrdersCount > 0 ? 'overdue' : null,
      blockedOrdersCount > 0 ? 'blocked' : null,
      lowStockCount > 0 ? 'stock' : null,
    ].filter(Boolean);

    if (categories.length === 0) return null;
    const extraCount = categories.length - 1;

    if (overdueOrdersCount > 0) {
      return {
        tab: 'orders',
        icon: CalendarClock,
        text: `${overdueOrdersCount} ${overdueOrdersCount === 1 ? 'OP em atraso' : 'OPs em atraso'}`,
        extraCount,
        toneClass:
          'bg-rose-500/[0.11] hover:bg-rose-500/[0.17] border-rose-500/25 text-rose-200',
        iconClass: 'text-rose-400',
      };
    }

    if (blockedOrdersCount > 0) {
      return {
        tab: 'orders',
        icon: ShieldAlert,
        text: `${blockedOrdersCount} ${blockedOrdersCount === 1 ? 'OP no Gate A.3.2' : 'OPs no Gate A.3.2'}`,
        extraCount,
        toneClass:
          'bg-white/[0.05] hover:bg-white/[0.09] border-white/[0.09] text-zinc-200',
        iconClass: 'text-[#E3263E]',
      };
    }

    return {
      tab: 'inventory',
      icon: AlertTriangle,
      text: `${lowStockCount} ${lowStockCount === 1 ? 'insumo crítico' : 'insumos críticos'}`,
      extraCount,
      toneClass:
        'bg-amber-500/[0.10] hover:bg-amber-500/[0.16] border-amber-500/25 text-amber-200',
      iconClass: 'text-amber-400',
    };
  }, [blockedOrdersCount, lowStockCount, overdueOrdersCount]);

  const indicatorToneClass = (tone: IndicatorTone, isActive: boolean): string => {
    if (isActive) {
      if (tone === 'danger') return 'text-rose-300 font-semibold';
      if (tone === 'warning') return 'text-amber-300 font-medium';
      if (tone === 'success') return 'text-emerald-300 font-semibold';
      return 'text-zinc-200 font-medium';
    }
    if (tone === 'danger') return 'text-rose-400 font-semibold';
    if (tone === 'warning') return 'text-amber-300 font-medium';
    if (tone === 'success') return 'text-emerald-400 font-semibold';
    return 'text-zinc-500 group-hover:text-zinc-300 font-medium';
  };

  const showTooltipForElement = (
    el: HTMLElement,
    label: string,
    detail?: string | null
  ) => {
    const rect = el.getBoundingClientRect();
    setFloatingTooltip({
      label,
      detail,
      top: rect.top + rect.height / 2,
      left: rect.right + 10,
    });
  };

  const renderSidebarBody = (mobileMode: boolean) => {
    const collapsed = !mobileMode && isCollapsed;
    const hasBothCreateActions = canCreateOrder && canCreateQuote;
    const roleLabel = ROLE_LABELS_PT[role] || role.replace(/_/g, ' ');

    return (
      <div className="flex flex-col h-full justify-between select-none bg-[#101012] text-zinc-300">
        {/* Seção Superior: Marca, Ações Rápidas, Busca e Navegação */}
        <div className="flex flex-col flex-1 min-h-0">
          {/* Cabeçalho da Marca + Controle de Recolher/Fechar */}
          <div
            className={`flex items-center border-b border-white/[0.07] bg-[#0B0B0D] ${
              collapsed ? 'flex-col gap-2 px-2 py-3' : 'justify-between px-3.5 h-16'
            }`}
          >
            <button
              type="button"
              onClick={() => navigateToItem('dashboard')}
              className={`flex items-center gap-2.5 text-left group min-w-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E] rounded-lg ${
                collapsed ? 'justify-center' : ''
              }`}
              title="Ir para o Painel Geral — DE FARDAS"
            >
              <div className="w-11 h-11 rounded-xl bg-white p-0.5 flex items-center justify-center shrink-0 shadow-sm ring-1 ring-white/20 transition-transform duration-150 group-hover:scale-[1.03] overflow-hidden">
                <img
                  src={logoSrc}
                  alt={`Logomarca ${profile.tradeName || 'DE FARDAS'}`}
                  className="w-full h-full object-contain"
                />
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <div className="text-[14px] font-extrabold tracking-tight text-white leading-none truncate">
                    DE FARDAS
                  </div>
                  <div className="text-[11px] font-medium text-zinc-500 truncate mt-1">
                    Gestão Fabril · {profile.state || 'MA'}
                  </div>
                </div>
              )}
            </button>

            {mobileMode ? (
              <button
                type="button"
                onClick={onCloseMobile}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-white rounded-lg cursor-pointer hover:bg-white/[0.07] transition-colors"
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-expanded={!collapsed}
                aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
                title={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
                className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.07] rounded-lg transition-colors cursor-pointer shrink-0"
              >
                {collapsed ? (
                  <PanelLeftOpen className="w-4 h-4" />
                ) : (
                  <PanelLeftClose className="w-4 h-4" />
                )}
              </button>
            )}
          </div>

          {/* Ações Rápidas + Busca de Módulos (⌘K) */}
          <div className="px-3 pt-3 pb-2.5 space-y-2 border-b border-white/[0.06]">
            {(canCreateOrder || canCreateQuote) && (
              <>
                {!collapsed && hasBothCreateActions ? (
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onOpenNewOrderModal();
                        onCloseMobile();
                      }}
                      className="min-h-[40px] px-2.5 inline-flex items-center justify-center gap-1.5 text-[12px] font-semibold text-white bg-[#C8102E] hover:bg-[#AE0D27] rounded-lg shadow-xs shadow-[#C8102E]/25 transition-colors cursor-pointer whitespace-nowrap active:scale-[0.98]"
                      title="Emitir Nova Ordem de Produção"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>Nova OP</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenNewQuoteModal();
                        onCloseMobile();
                      }}
                      className="min-h-[40px] px-2.5 inline-flex items-center justify-center gap-1.5 text-[12px] font-medium text-zinc-200 hover:text-white bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.08] rounded-lg transition-colors cursor-pointer whitespace-nowrap active:scale-[0.98]"
                      title="Criar Nova Proposta Comercial"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                      <span>Orçamento</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (canCreateOrder) {
                        onOpenNewOrderModal();
                      } else {
                        onOpenNewQuoteModal();
                      }
                      onCloseMobile();
                    }}
                    onMouseEnter={(e) => {
                      if (!collapsed) return;
                      showTooltipForElement(
                        e.currentTarget,
                        canCreateOrder ? 'Nova Ordem de Produção' : 'Nova Proposta Comercial'
                      );
                    }}
                    onMouseLeave={() => collapsed && setFloatingTooltip(null)}
                    className={`w-full min-h-[40px] inline-flex items-center justify-center gap-2 text-[12px] font-semibold text-white bg-[#C8102E] hover:bg-[#AE0D27] rounded-lg shadow-xs shadow-[#C8102E]/25 transition-colors cursor-pointer whitespace-nowrap active:scale-[0.98] ${
                      collapsed ? 'px-0' : 'px-3'
                    }`}
                    aria-label={
                      canCreateOrder ? 'Emitir Nova Ordem de Produção' : 'Criar Nova Proposta Comercial'
                    }
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    {!collapsed && (
                      <span>
                        {canCreateOrder ? 'Nova Ordem de Produção' : 'Nova Proposta Comercial'}
                      </span>
                    )}
                  </button>
                )}
              </>
            )}

            {collapsed ? (
              <button
                type="button"
                onClick={focusDesktopSearch}
                onMouseEnter={(e) =>
                  showTooltipForElement(e.currentTarget, 'Buscar módulo', 'Atalho ⌘K')
                }
                onMouseLeave={() => setFloatingTooltip(null)}
                aria-label="Buscar módulo (Ctrl+K)"
                className="w-full h-9 flex items-center justify-center rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.07] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
              >
                <Search className="w-4 h-4" />
              </button>
            ) : (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={mobileMode ? undefined : searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setSearchQuery('');
                      (e.currentTarget as HTMLInputElement).blur();
                      return;
                    }
                    if (e.key === 'ArrowDown' && flattenedResults.length > 0) {
                      e.preventDefault();
                      setHighlightedIndex((prev) => (prev + 1) % flattenedResults.length);
                      return;
                    }
                    if (e.key === 'ArrowUp' && flattenedResults.length > 0) {
                      e.preventDefault();
                      setHighlightedIndex(
                        (prev) => (prev - 1 + flattenedResults.length) % flattenedResults.length
                      );
                      return;
                    }
                    if (e.key === 'Enter' && flattenedResults.length > 0) {
                      e.preventDefault();
                      const chosen =
                        flattenedResults[highlightedIndex] || flattenedResults[0];
                      if (chosen) {
                        navigateToItem(chosen.id);
                      }
                    }
                  }}
                  placeholder="Ir para módulo..."
                  aria-label="Filtrar módulos do menu"
                  className="w-full h-8.5 pl-8 pr-11 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-white/25 focus:bg-white/[0.06] transition-colors"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-white cursor-pointer"
                    aria-label="Limpar busca"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] text-[10px] font-mono text-zinc-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                    ⌘K
                  </kbd>
                )}
              </div>
            )}
          </div>

          {/* Lista de Navegação Agrupada */}
          <nav
            aria-label="Navegação principal"
            onScroll={() => collapsed && setFloatingTooltip(null)}
            className={`py-2.5 overflow-y-auto flex-1 custom-scrollbar ${
              collapsed ? 'px-2 space-y-2' : 'px-2.5 space-y-3.5'
            }`}
          >
            {menuGroups.length === 0 ? (
              <div className="px-3 py-6 text-center space-y-1">
                <p className="text-xs text-zinc-400">
                  Nenhum módulo para &ldquo;{searchQuery}&rdquo;.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-[11px] font-medium text-[#E3263E] hover:underline cursor-pointer"
                >
                  Limpar filtro
                </button>
              </div>
            ) : (
              menuGroups.map((group, groupIdx) => {
                const isGroupCollapsed =
                  !normalizedQuery && !collapsed && Boolean(collapsedGroups[group.id]);

                return (
                  <div key={group.id} className="space-y-0.5">
                    {collapsed ? (
                      groupIdx > 0 && (
                        <div className="h-px bg-white/[0.07] mx-2 mb-2" aria-hidden="true" />
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.id)}
                        className="w-full px-2.5 py-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-300 flex items-center justify-between transition-colors cursor-pointer rounded-md"
                        aria-expanded={!isGroupCollapsed}
                      >
                        <span>{group.groupTitle}</span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-zinc-600 transition-transform duration-150 ${
                            isGroupCollapsed ? '-rotate-90' : ''
                          }`}
                        />
                      </button>
                    )}

                    {!isGroupCollapsed && (
                      <div className="space-y-0.5">
                        {group.items.map((item) => {
                          const Icon = item.icon;
                          const isActive = currentTab === item.id;
                          const flatIdx = normalizedQuery
                            ? flattenedResults.findIndex((r) => r.id === item.id)
                            : -1;
                          const isSearchHighlighted =
                            Boolean(normalizedQuery) && flatIdx === highlightedIndex;

                          return (
                            <button
                              key={item.id}
                              type="button"
                              aria-current={isActive ? 'page' : undefined}
                              onClick={() => navigateToItem(item.id)}
                              onMouseEnter={(e) => {
                                if (!collapsed) return;
                                showTooltipForElement(
                                  e.currentTarget,
                                  item.label,
                                  item.detailTooltip || item.indicatorText
                                );
                              }}
                              onMouseLeave={() => collapsed && setFloatingTooltip(null)}
                              onFocus={(e) => {
                                if (!collapsed) return;
                                showTooltipForElement(
                                  e.currentTarget,
                                  item.label,
                                  item.detailTooltip || item.indicatorText
                                );
                              }}
                              onBlur={() => collapsed && setFloatingTooltip(null)}
                              title={!collapsed ? item.detailTooltip : undefined}
                              className={`w-full ${
                                mobileMode ? 'min-h-[44px]' : 'min-h-[40px]'
                              } flex items-center ${
                                collapsed ? 'justify-center px-0' : 'justify-between px-2.5'
                              } py-2 rounded-lg text-[13px] transition-colors duration-150 cursor-pointer text-left relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E]/80 ${
                                isActive
                                  ? 'bg-white/[0.11] text-white font-semibold ring-1 ring-white/[0.09]'
                                  : isSearchHighlighted
                                    ? 'bg-white/[0.07] text-white font-medium ring-1 ring-white/15'
                                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05] font-medium'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Icon
                                  className={`w-[17px] h-[17px] shrink-0 transition-colors ${
                                    isActive
                                      ? 'text-[#E3263E]'
                                      : 'text-zinc-500 group-hover:text-zinc-200'
                                  }`}
                                />
                                {!collapsed && (
                                  <span className="truncate leading-snug">{item.label}</span>
                                )}
                              </div>

                              {!collapsed && item.indicatorText && (
                                <span
                                  className={`text-[11px] font-mono tabular-nums shrink-0 ml-2 whitespace-nowrap ${indicatorToneClass(
                                    item.indicatorTone,
                                    isActive
                                  )}`}
                                >
                                  {item.indicatorText}
                                </span>
                              )}

                              {collapsed && item.urgentDot && (
                                <span
                                  className={`absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full ${
                                    item.dotClass || 'bg-amber-400'
                                  }`}
                                  aria-hidden="true"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </nav>
        </div>

        {/* Rodapé Operacional Compacto */}
        <div className="px-3 py-2.5 border-t border-white/[0.07] bg-[#0B0B0D] space-y-2 shrink-0 pb-safe">
          {/* Linha Única de Alerta Prioritário (evita empilhar cards e esmagar o menu) */}
          {!collapsed && primaryAlert && (
            <button
              type="button"
              onClick={() => navigateToItem(primaryAlert.tab)}
              className={`w-full px-2.5 py-1.5 border rounded-lg text-[11px] font-medium flex items-center justify-between gap-2 cursor-pointer transition-colors ${primaryAlert.toneClass}`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <primaryAlert.icon className={`w-3.5 h-3.5 shrink-0 ${primaryAlert.iconClass}`} />
                <span className="truncate">{primaryAlert.text}</span>
              </span>
              <span className="inline-flex items-center gap-1 shrink-0 font-mono tabular-nums text-[10px] opacity-85">
                {primaryAlert.extraCount > 0 && <span>+{primaryAlert.extraCount}</span>}
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </button>
          )}

          {/* Medidor Interativo de Ocupação Fabril */}
          {!collapsed && (
            <button
              type="button"
              onClick={() => navigateToItem('orders')}
              className="w-full text-left px-2.5 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] space-y-1.5 transition-colors cursor-pointer group"
              title="Abrir Ordens de Produção para ver a carga fabril"
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors">
                  Ocupação fabril
                </span>
                <span
                  className={`font-mono tabular-nums text-[11px] font-semibold ${
                    isOverCapacity
                      ? 'text-rose-400'
                      : rawCapacityPercent > 85
                        ? 'text-amber-300'
                        : 'text-zinc-100'
                  }`}
                >
                  {rawCapacityPercent}%
                </span>
              </div>

              <svg
                className="w-full h-1.5 block rounded-full overflow-hidden"
                viewBox="0 0 100 4"
                preserveAspectRatio="none"
                role="progressbar"
                aria-label="Ocupação da capacidade fabril mensal"
                aria-valuenow={rawCapacityPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <rect x="0" y="0" width="100" height="4" rx="2" className="fill-zinc-800/90" />
                <rect
                  x="0"
                  y="0"
                  width={capacityBarPercent}
                  height="4"
                  rx="2"
                  className={
                    isOverCapacity || rawCapacityPercent > 90
                      ? 'fill-[#C8102E]'
                      : rawCapacityPercent > 70
                        ? 'fill-amber-500'
                        : 'fill-emerald-500'
                  }
                />
              </svg>

              <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono tabular-nums">
                <span>{activePiecesCount.toLocaleString('pt-BR')} peças</span>
                <span>{capacityTotal.toLocaleString('pt-BR')}/mês</span>
              </div>
            </button>
          )}

          {/* Gatilho Discreto de Instalação PWA */}
          <PWAInstallButton variant={collapsed ? 'sidebar-collapsed' : 'sidebar'} />

          {/* Sessão do Usuário em Telas Menores (< xl) */}
          {!collapsed && user && (
            <div className="xl:hidden pt-2 border-t border-white/[0.07] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-white/[0.09] border border-white/[0.12] text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
                  {(user.fullName || 'DF')
                    .split(' ')
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">{user.fullName}</div>
                  <div className="text-[11px] text-zinc-400 truncate">{roleLabel}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onCloseMobile();
                  logout();
                }}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-zinc-400 hover:text-rose-400 hover:bg-white/[0.06] rounded-lg transition-colors cursor-pointer shrink-0"
                title="Encerrar sessão"
                aria-label="Encerrar sessão"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Assinatura Institucional Discreta (Desktop Expandido) */}
          {!collapsed && (
            <div className="hidden lg:flex items-center justify-between pt-1 text-[10px] text-zinc-500">
              <span className="truncate">
                {profile.city} · {profile.state}
              </span>
              <span className="font-mono tabular-nums shrink-0 pl-2 text-zinc-600">
                {profile.cnpj}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Sticky Rail */}
      <aside
        className={`hidden lg:flex flex-col h-screen sticky top-0 transition-[width] duration-200 ease-out z-30 shrink-0 no-print border-r border-white/[0.07] ${
          isCollapsed ? 'w-[72px]' : 'w-[260px]'
        }`}
      >
        {renderSidebarBody(false)}
      </aside>

      {/* Tooltip Flutuante (Desktop Recolhido — nunca cortado pelo overflow do nav) */}
      {isCollapsed && floatingTooltip && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className="hidden lg:block fixed z-50 pointer-events-none -translate-y-1/2"
        >
          <div className="px-2.5 py-1.5 rounded-lg bg-[#18181B] border border-white/[0.12] shadow-xl text-white whitespace-nowrap">
            <div className="text-xs font-semibold leading-tight">{floatingTooltip.label}</div>
            {floatingTooltip.detail && (
              <div className="text-[11px] font-mono tabular-nums text-zinc-400 mt-0.5 leading-tight">
                {floatingTooltip.detail}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile Slide-Over Drawer */}
      {isMobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu principal DE FARDAS"
          className="fixed inset-0 z-50 lg:hidden flex"
        >
          <div
            onClick={onCloseMobile}
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
            aria-hidden="true"
          />

          <aside className="relative w-[292px] max-w-[85vw] h-full shadow-2xl flex flex-col z-10 border-r border-white/[0.08]">
            {renderSidebarBody(true)}
          </aside>
        </div>
      )}
    </>
  );
};
