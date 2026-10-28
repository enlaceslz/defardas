import React from 'react';
import { 
  LayoutDashboard, 
  Factory, 
  FileText, 
  Boxes, 
  Users, 
  Wallet, 
  Settings, 
  AlertTriangle, 
  Building2, 
  Shirt, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  HelpCircle,
  ExternalLink,
  Layers,
  Sparkles,
  Scissors,
  MessageSquare
} from 'lucide-react';
import { CompanyProfile } from '../types/erp';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  activeOrdersCount: number;
  activePieces: number;
  lowStockCount: number;
  pendingQuotesCount: number;
  profile: CompanyProfile;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenNewOrderModal: () => void;
  onOpenHelpManual: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  activeOrdersCount,
  activePieces,
  lowStockCount,
  pendingQuotesCount,
  profile,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  onOpenNewOrderModal,
  onOpenHelpManual,
}) => {
  // Navigation structure with domain grouping
  const menuGroups = [
    {
      groupTitle: 'Vitrine Digital & B2B',
      items: [
        {
          id: 'portal',
          label: 'Site & Catálogo Online',
          icon: Shirt,
          badge: 'Online',
          badgeStyle: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30',
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
          badgeStyle: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
        },
        {
          id: 'inventory',
          label: 'Estoque & Tecidos',
          icon: Boxes,
          badge: lowStockCount > 0 ? `${lowStockCount} críticos` : null,
          badgeStyle: 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold',
        },
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
          badge: null,
          badgeStyle: '',
        },
        {
          id: 'whatsapp',
          label: 'Central WhatsApp',
          icon: MessageSquare,
          badge: 'Online',
          badgeStyle: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
        },
      ],
    },
    {
      groupTitle: 'Controladoria & Sistema',
      items: [
        {
          id: 'finance',
          label: 'Fluxo Financeiro',
          icon: Wallet,
          badge: null,
          badgeStyle: '',
        },
        {
          id: 'settings',
          label: 'Configurações & Backup',
          icon: Settings,
          badge: null,
          badgeStyle: '',
        },
        {
          id: 'help_manual',
          label: 'Manual Operacional PRD',
          icon: HelpCircle,
          badge: 'v1.6',
          badgeStyle: 'bg-blue-500/15 text-blue-300 border border-blue-500/25',
        },
      ],
    },
  ];

  // Capacity calculation based on company profile (e.g., 5000 pcs)
  const capacityTotal = profile.productionCapacityPiecesMonth;
  // Estimated active pieces in production (approx 350 pcs per active order if not directly summed here)
  const estimatedActivePieces = activePieces;
  const capacityPercent = capacityTotal > 0 ? Math.min(100, Math.round((activePieces / capacityTotal) * 100)) : 0;

  const sidebarContent = (
    <div className="flex flex-col h-full justify-between select-none bg-slate-900 text-slate-300">
      
      {/* Top Header & Navigation */}
      <div className="flex flex-col flex-1 min-h-0">
        
        {/* Brand Lockup */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800/90 bg-slate-950/40">
          <button
            onClick={() => onSelectTab('dashboard')}
            className="flex items-center gap-3 text-left group min-w-0 cursor-pointer"
            title="Ir para o Painel Geral"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center text-white shrink-0 shadow-md shadow-blue-900/40 group-hover:scale-105 transition-transform">
              <Shirt className="w-5 h-5 text-white" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-extrabold tracking-tight text-white block truncate leading-none">
                    DE FARDAS
                  </span>
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    ERP
                  </span>
                </div>
                <span className="text-[10px] font-medium text-slate-400 block truncate mt-1">
                  São Luís — Maranhão
                </span>
              </div>
            )}
          </button>

          {/* Mobile close button */}
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer hover:bg-slate-800"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick New OP Button */}
        <div className="p-3 border-b border-slate-800/70">
          <button
            onClick={() => {
              onOpenNewOrderModal();
              onCloseMobile();
            }}
            className={`w-full inline-flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 rounded-lg shadow-sm shadow-blue-900/30 hover:shadow-md transition-all cursor-pointer whitespace-nowrap active:scale-[0.98] ${
              isCollapsed ? 'px-0' : ''
            }`}
            title="Emitir Nova Ordem de Produção"
          >
            <Plus className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>Nova Ordem de Produção</span>}
          </button>
        </div>

        {/* Navigation Menus with Scroll */}
        <nav className="p-3 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
          {menuGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="space-y-1">
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
                    title={isCollapsed ? item.label : undefined}
                  >
                    {/* Active left indicator bar */}
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-white rounded-r-full" />
                    )}

                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      {!isCollapsed && <span className="truncate">{item.label}</span>}
                    </div>

                    {!isCollapsed && item.badge && (
                      <span className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded ${item.badgeStyle}`}>
                        {item.badge}
                      </span>
                    )}

                    {/* Notification dot if collapsed */}
                    {isCollapsed && item.badge && (
                      <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-slate-900" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

      </div>

      {/* Bottom Footer Section: Capacity & System Health */}
      <div className="p-3 border-t border-slate-800/90 bg-slate-950/60 space-y-3 shrink-0">
        
        {/* Factory Capacity Utilization Meter (Expanded only) */}
        {!isCollapsed && (
          <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Factory className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>Ocupação Fabril</span>
              </span>
              <span className="font-mono text-[10px] font-bold text-blue-300">
                {capacityPercent}%
              </span>
            </div>
            {/* Progress Bar */}
            <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
              <progress aria-label="Ocupação da capacidade" max={100} value={capacityPercent} className="h-full w-full accent-blue-500" />
            </div>
            <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono">
              <span>{estimatedActivePieces.toLocaleString('pt-BR')} em confecção</span>
              <span>{capacityTotal.toLocaleString('pt-BR')} pçs/mês</span>
            </div>
          </div>
        )}

        {/* Low Stock Callout (Expanded only) */}
        {!isCollapsed && lowStockCount > 0 && (
          <div 
            onClick={() => {
              onSelectTab('inventory');
              onCloseMobile();
            }}
            className="p-2 bg-amber-950/40 border border-amber-800/60 rounded-lg text-xs cursor-pointer hover:bg-amber-900/40 transition-colors"
          >
            <div className="flex items-center justify-between font-bold text-amber-300 text-[11px]">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{lowStockCount} tecidos críticos</span>
              </div>
              <span className="text-[10px] text-amber-400">&rarr;</span>
            </div>
          </div>
        )}

        {/* Company Identity & Collapse Toggle */}
        <div className="flex items-center justify-between pt-1">
          {!isCollapsed && (
            <div className="text-[10px] text-slate-400 min-w-0 pr-2">
              <div className="font-medium text-slate-300 truncate">
                {profile.tradeName}
              </div>
              <div className="text-[9px] font-mono text-slate-500 truncate">
                CNPJ {profile.cnpj}
              </div>
            </div>
          )}

          {/* Collapse toggle (Desktop only) */}
          <button
            onClick={onToggleCollapse}
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
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            onClick={onCloseMobile}
            className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
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
