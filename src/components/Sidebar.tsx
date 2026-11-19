import React, { useEffect } from 'react';
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
  ChevronLeft,
  ChevronRight,
  X,
  HelpCircle,
  MessageSquare,
  ShieldAlert,
  LogOut,
  Handshake,
} from 'lucide-react';
import { CompanyProfile } from '../types/erp';
import { useAuth } from '../api/authContext';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  activeOrdersCount: number;
  activePiecesCount: number;
  blockedOrdersCount: number;
  lowStockCount: number;
  openCustodyCount?: number;
  newLeadsCount?: number;
  pendingQuotesCount: number;
  pendingDownpaymentsCount: number;
  overdueFinanceCount: number;
  profile: CompanyProfile;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenNewOrderModal: () => void;
  onOpenNewQuoteModal: () => void;
  onOpenHelpManual: () => void;
}

interface SidebarNavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge: string | null;
  badgeStyle: string;
  isAlertDot?: boolean;
  dotColor?: string;
}

interface SidebarNavGroup {
  groupTitle: string;
  items: SidebarNavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  activeOrdersCount,
  activePiecesCount,
  blockedOrdersCount,
  lowStockCount,
  openCustodyCount = 0,
  newLeadsCount = 0,
  pendingQuotesCount,
  pendingDownpaymentsCount,
  overdueFinanceCount,
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

  // Permissões alinhadas estritamente com server/auth/rbac.ts
  const canCreateOrder = ['admin', 'gerente_comercial', 'pcp_producao'].includes(role);
  const canCreateQuote = ['admin', 'gerente_comercial', 'vendedor'].includes(role);
  const canViewPartners = ['admin', 'gerente_comercial', 'pcp_producao', 'expedicao_qualidade', 'financeiro'].includes(role);
  const canViewFinance = ['admin', 'financeiro', 'gerente_comercial'].includes(role);
  const canViewWhatsApp = ['admin', 'gerente_comercial', 'vendedor', 'financeiro'].includes(role);
  const canViewSettings = role === 'admin';

  // Fechar drawer mobile com tecla Escape e travar scroll do body quando aberto
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

  const financeBadge =
    overdueFinanceCount > 0
      ? `${overdueFinanceCount} venc.`
      : pendingDownpaymentsCount > 0
        ? `${pendingDownpaymentsCount} ${pendingDownpaymentsCount === 1 ? 'sinal' : 'sinais'}`
        : null;

  const financeBadgeStyle =
    overdueFinanceCount > 0
      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold'
      : 'bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold';

  const rawGroups: SidebarNavGroup[] = [
    {
      groupTitle: 'Vitrine Digital & B2B',
      items: [
        {
          id: 'portal',
          label: 'Site & Catálogo Online',
          icon: Shirt,
          badge: null,
          badgeStyle: '',
        },
      ],
    },
    {
      groupTitle: 'PCP & Chão de Fábrica',
      items: [
        {
          id: 'dashboard',
          label: 'Painel Geral',
          icon: LayoutDashboard,
          badge: null,
          badgeStyle: '',
        },
        {
          id: 'orders',
          label: 'Ordens de Produção',
          icon: Factory,
          badge: activeOrdersCount > 0 ? `${activeOrdersCount} OPs` : null,
          badgeStyle:
            blockedOrdersCount > 0
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold'
              : 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
          isAlertDot: blockedOrdersCount > 0,
          dotColor: 'bg-rose-400',
        },
        {
          id: 'inventory',
          label: 'Estoque & Tecidos',
          icon: Boxes,
          badge: lowStockCount > 0 ? `${lowStockCount} críticos` : null,
          badgeStyle: 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold',
          isAlertDot: lowStockCount > 0,
          dotColor: 'bg-amber-400',
        },
        ...(canViewPartners
          ? [
              {
                id: 'partners',
                label: 'Parceiros & Facções',
                icon: Handshake,
                badge: openCustodyCount > 0 ? `${openCustodyCount} custódia` : null,
                badgeStyle: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold',
              },
            ]
          : []),
      ],
    },
    {
      groupTitle: 'Gestão Comercial',
      items: [
        {
          id: 'quotes',
          label: 'Orçamentos & Preços',
          icon: FileText,
          badge: pendingQuotesCount > 0 ? `${pendingQuotesCount}` : null,
          badgeStyle: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
        },
        {
          id: 'clients',
          label: 'Carteira de Clientes',
          icon: Users,
          badge: newLeadsCount > 0 ? `${newLeadsCount} ${newLeadsCount === 1 ? 'lead' : 'leads'}` : null,
          badgeStyle: 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold',
        },
        ...(canViewWhatsApp
          ? [
              {
                id: 'whatsapp',
                label: 'Central WhatsApp',
                icon: MessageSquare,
                badge: null,
                badgeStyle: '',
              },
            ]
          : []),
      ],
    },
    {
      groupTitle: 'Controladoria & Sistema',
      items: [
        ...(canViewFinance
          ? [
              {
                id: 'finance',
                label: 'Fluxo Financeiro',
                icon: Wallet,
                badge: financeBadge,
                badgeStyle: financeBadgeStyle,
                isAlertDot: overdueFinanceCount > 0 || pendingDownpaymentsCount > 0,
                dotColor: overdueFinanceCount > 0 ? 'bg-rose-400' : 'bg-blue-400',
              },
            ]
          : []),
        ...(canViewSettings
          ? [
              {
                id: 'settings',
                label: 'Configurações & Backup',
                icon: Settings,
                badge: null,
                badgeStyle: '',
              },
            ]
          : []),
        {
          id: 'help_manual',
          label: 'Manual Operacional PRD',
          icon: HelpCircle,
          badge: 'v1.6',
          badgeStyle: 'bg-blue-500/15 text-blue-300 border border-blue-500/25',
          isAlertDot: false,
        },
      ],
    },
  ];

  const menuGroups = rawGroups.filter((g) => g.items.length > 0);

  // Cálculo real de ocupação fabril baseado nas peças efetivas em produção (zero estimativa fictícia)
  const capacityTotal = profile.productionCapacityPiecesMonth || 5000;
  const rawCapacityPercent = capacityTotal > 0 ? Math.round((activePiecesCount / capacityTotal) * 100) : 0;
  const capacityBarPercent = Math.min(100, rawCapacityPercent);
  const isOverCapacity = activePiecesCount > capacityTotal;

  const sidebarContent = (
    <div className="flex flex-col h-full justify-between select-none bg-slate-900 text-slate-300">
      {/* Top Header & Navigation */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Brand Lockup */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800/90 bg-slate-950/40">
          <button
            type="button"
            onClick={() => {
              onSelectTab('dashboard');
              onCloseMobile();
            }}
            className="flex items-center gap-3 text-left group min-w-0 cursor-pointer"
            title="Ir para o Painel Geral"
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-md transition-transform group-hover:scale-105 overflow-hidden ${
                profile.logoUrl
                  ? 'bg-white p-1 shadow-slate-950/50 border border-slate-700/60'
                  : 'bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white shadow-blue-900/40'
              }`}
            >
              {profile.logoUrl ? (
                <img
                  src={profile.logoUrl}
                  alt={`Logomarca ${profile.tradeName}`}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <Shirt className="w-5 h-5 text-white" />
              )}
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-extrabold tracking-tight text-white block truncate leading-none">
                    {profile.tradeName || 'DE FARDAS'}
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    ERP
                  </span>
                </div>
                <span className="text-[10px] font-medium text-slate-400 block truncate mt-1">
                  {profile.city} — {profile.state}
                </span>
              </div>
            )}
          </button>

          {/* Mobile close button */}
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer hover:bg-slate-800"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role-Aligned Primary Quick Action */}
        {(canCreateOrder || canCreateQuote) && (
          <div className="p-3 border-b border-slate-800/70">
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
              className={`w-full inline-flex items-center justify-center gap-2 py-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 rounded-lg shadow-sm shadow-blue-900/30 hover:shadow-md transition-all cursor-pointer whitespace-nowrap active:scale-[0.98] ${
                isCollapsed ? 'px-0' : 'px-3'
              }`}
              title={canCreateOrder ? 'Emitir Nova Ordem de Produção' : 'Criar Nova Proposta Comercial'}
            >
              <Plus className="w-4 h-4 shrink-0" />
              {!isCollapsed && <span>{canCreateOrder ? 'Nova Ordem de Produção' : 'Nova Proposta Comercial'}</span>}
            </button>
          </div>
        )}

        {/* Navigation Menus with Scroll */}
        <nav aria-label="Navegação principal" className="p-3 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
          {menuGroups.map((group) => (
            <div key={group.groupTitle} className="space-y-1">
              {!isCollapsed && (
                <div className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center justify-between">
                  <span>{group.groupTitle}</span>
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => {
                      if (item.id === 'help_manual') {
                        onOpenHelpManual();
                      } else {
                        onSelectTab(item.id);
                      }
                      onCloseMobile();
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer text-left relative group ${
                      isActive
                        ? 'bg-blue-600 text-white font-semibold shadow-xs'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    }`}
                    title={isCollapsed ? `${item.label}${item.badge ? ` (${item.badge})` : ''}` : undefined}
                  >
                    {/* Active left indicator bar */}
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-white rounded-r-full" />
                    )}

                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                          isActive ? 'text-white' : 'text-slate-400'
                        }`}
                      />
                      {!isCollapsed && <span className="truncate">{item.label}</span>}
                    </div>

                    {!isCollapsed && item.badge && (
                      <span className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded shrink-0 ${item.badgeStyle}`}>
                        {item.badge}
                      </span>
                    )}

                    {/* Collapsed alert dot ONLY for genuine operational alerts */}
                    {isCollapsed && item.isAlertDot && (
                      <span
                        className={`absolute top-2 right-2 w-2 h-2 rounded-full ring-2 ring-slate-900 ${
                          item.dotColor || 'bg-amber-400'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom Footer Section: Real Capacity, Gate Alerts & Identity */}
      <div className="p-3 border-t border-slate-800/90 bg-slate-950/60 space-y-2.5 shrink-0">
        {/* Real Factory Capacity Utilization Meter (Expanded only) */}
        {!isCollapsed && (
          <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Factory className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>Ocupação Fabril</span>
              </span>
              <span
                className={`font-mono text-[10px] font-bold ${
                  isOverCapacity ? 'text-rose-400' : rawCapacityPercent > 85 ? 'text-amber-300' : 'text-blue-300'
                }`}
              >
                {rawCapacityPercent}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isOverCapacity || rawCapacityPercent > 90
                    ? 'bg-rose-500'
                    : rawCapacityPercent > 70
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                }`}
                style={{ width: `${capacityBarPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono">
              <span>{activePiecesCount.toLocaleString('pt-BR')} pçs reais</span>
              <span>{capacityTotal.toLocaleString('pt-BR')} pçs/mês</span>
            </div>
          </div>
        )}

        {/* Gate A.3.2 Blocked Orders Callout (Expanded only) */}
        {!isCollapsed && blockedOrdersCount > 0 && (
          <button
            type="button"
            onClick={() => {
              onSelectTab('orders');
              onCloseMobile();
            }}
            className="w-full p-2 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs cursor-pointer hover:bg-rose-900/40 transition-colors text-left"
          >
            <div className="flex items-center justify-between font-bold text-rose-300 text-[11px]">
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>
                  {blockedOrdersCount} {blockedOrdersCount === 1 ? 'OP no Gate A.3.2' : 'OPs no Gate A.3.2'}
                </span>
              </div>
              <span className="text-[10px] text-rose-400">&rarr;</span>
            </div>
          </button>
        )}

        {/* Low Stock Callout (Expanded only) */}
        {!isCollapsed && lowStockCount > 0 && (
          <button
            type="button"
            onClick={() => {
              onSelectTab('inventory');
              onCloseMobile();
            }}
            className="w-full p-2 bg-amber-950/40 border border-amber-800/60 rounded-lg text-xs cursor-pointer hover:bg-amber-900/40 transition-colors text-left"
          >
            <div className="flex items-center justify-between font-bold text-amber-300 text-[11px]">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{lowStockCount} tecidos críticos</span>
              </div>
              <span className="text-[10px] text-amber-400">&rarr;</span>
            </div>
          </button>
        )}

        {/* Mobile Session Identity & Logout (visible on screens < xl where Header hides user info) */}
        {!isCollapsed && user && (
          <div className="xl:hidden pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-white truncate">{user.fullName}</div>
              <div className="text-[9px] font-mono uppercase text-blue-400 font-bold truncate">{user.role}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                onCloseMobile();
                logout();
              }}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Encerrar sessão"
              aria-label="Encerrar sessão"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Company Identity & Collapse Toggle */}
        <div className="flex items-center justify-between pt-1">
          {!isCollapsed && (
            <div className="text-[10px] text-slate-400 min-w-0 pr-2">
              <div className="font-medium text-slate-300 truncate">{profile.tradeName}</div>
              <div className="text-[9px] font-mono text-slate-500 truncate">CNPJ {profile.cnpj}</div>
            </div>
          )}

          {/* Collapse toggle (Desktop only) */}
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
            className="hidden lg:flex p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0 ml-auto"
            title={isCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <aside
        className={`hidden lg:flex flex-col h-screen sticky top-0 transition-all duration-200 z-30 shrink-0 no-print border-r border-slate-800/90 ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer (Overlay backdrop + slide-over) */}
      {isMobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu principal"
          className="fixed inset-0 z-50 lg:hidden flex"
        >
          {/* Backdrop */}
          <div
            onClick={onCloseMobile}
            className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
            aria-hidden="true"
          />

          {/* Drawer Content */}
          <aside className="relative w-72 max-w-[85vw] h-full shadow-2xl flex flex-col z-10 border-r border-slate-800">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};
