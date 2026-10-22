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
  X
} from 'lucide-react';
import { CompanyProfile } from '../types/erp';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  activeOrdersCount: number;
  lowStockCount: number;
  pendingQuotesCount: number;
  profile: CompanyProfile;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenNewOrderModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  activeOrdersCount,
  lowStockCount,
  pendingQuotesCount,
  profile,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  onOpenNewOrderModal,
}) => {
  const menuGroups = [
    {
      groupTitle: 'Portal Público & Portfólio',
      items: [
        {
          id: 'portal',
          label: 'Site & Catálogo Online',
          icon: Shirt,
          badge: 'Público',
          badgeColor: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
        },
      ],
    },
    {
      groupTitle: 'Chão de Fábrica & PCP',
      items: [
        {
          id: 'dashboard',
          label: 'Painel Geral',
          icon: LayoutDashboard,
          badge: null,
          badgeColor: '',
        },
        {
          id: 'orders',
          label: 'Produção (PCP)',
          icon: Factory,
          badge: activeOrdersCount > 0 ? `${activeOrdersCount}` : null,
          badgeColor: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
        },
        {
          id: 'inventory',
          label: 'Estoque & Tecidos',
          icon: Boxes,
          badge: lowStockCount > 0 ? `${lowStockCount}!` : null,
          badgeColor: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
        },
      ],
    },
    {
      groupTitle: 'Comercial & CRM',
      items: [
        {
          id: 'quotes',
          label: 'Orçamentos',
          icon: FileText,
          badge: pendingQuotesCount > 0 ? `${pendingQuotesCount}` : null,
          badgeColor: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
        },
        {
          id: 'clients',
          label: 'Clientes B2B',
          icon: Users,
          badge: null,
          badgeColor: '',
        },
      ],
    },
    {
      groupTitle: 'Controladoria & Sistema',
      items: [
        {
          id: 'finance',
          label: 'Financeiro',
          icon: Wallet,
          badge: null,
          badgeColor: '',
        },
        {
          id: 'settings',
          label: 'Configurações',
          icon: Settings,
          badge: null,
          badgeColor: '',
        },
      ],
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full justify-between select-none">
      
      {/* Top Brand Section */}
      <div>
        <div className="flex items-center justify-between px-4 py-5 border-b border-slate-800">
          <button
            onClick={() => onSelectTab('dashboard')}
            className="flex items-center gap-3 text-left group min-w-0"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-md group-hover:bg-blue-500 transition-colors">
              <Shirt className="w-5 h-5" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <span className="text-base font-black tracking-tight text-white block truncate leading-none">
                  DE FARDAS
                </span>
                <span className="text-[11px] font-medium text-slate-400 block truncate mt-1">
                  Confecção & Uniformes
                </span>
              </div>
            )}
          </button>

          {/* Mobile close button */}
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick New OP Button */}
        <div className="p-3 border-b border-slate-800/80">
          <button
            onClick={() => {
              onOpenNewOrderModal();
              onCloseMobile();
            }}
            className={`w-full inline-flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm transition-all cursor-pointer whitespace-nowrap ${
              isCollapsed ? 'px-0' : ''
            }`}
            title="Emitir Nova Ordem de Produção"
          >
            <Plus className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>Nova Ordem de Produção</span>}
          </button>
        </div>

        {/* Navigation Menus */}
        <nav className="p-3 space-y-5 overflow-y-auto max-h-[calc(100vh-250px)]">
          {menuGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="space-y-1">
              {!isCollapsed && (
                <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  {group.groupTitle}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelectTab(item.id);
                      onCloseMobile();
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer text-left relative ${
                      isActive
                        ? 'bg-blue-600 text-white font-semibold shadow-xs'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                    }`}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      {!isCollapsed && <span className="truncate">{item.label}</span>}
                    </div>

                    {!isCollapsed && item.badge && (
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${item.badgeColor || 'bg-slate-800 text-slate-300'}`}>
                        {item.badge}
                      </span>
                    )}

                    {/* Notification dot if collapsed */}
                    {isCollapsed && item.badge && (
                      <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom Footer Section */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40 space-y-3">
        {/* Low Stock Callout (Expanded only) */}
        {!isCollapsed && lowStockCount > 0 && (
          <div 
            onClick={() => {
              onSelectTab('inventory');
              onCloseMobile();
            }}
            className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded-lg text-xs cursor-pointer hover:bg-amber-900/40 transition-colors"
          >
            <div className="flex items-center gap-1.5 font-bold text-amber-300 text-[11px]">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Estoque Crítico ({lowStockCount})</span>
            </div>
            <div className="text-[10px] text-amber-200/80 mt-0.5">
              Tecidos abaixo do mínimo &rarr;
            </div>
          </div>
        )}

        {/* Company Identity */}
        {!isCollapsed && (
          <div className="text-[11px] text-slate-400 space-y-0.5 px-1">
            <div className="font-semibold text-slate-200 truncate flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="truncate">{profile.tradeName}</span>
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              CNPJ: {profile.cnpj}
            </div>
            <div className="text-[10px] text-slate-400">
              Capacidade: <span className="font-mono text-slate-200">{profile.productionCapacityPiecesMonth.toLocaleString('pt-BR')}</span> pçs/mês
            </div>
          </div>
        )}

        {/* Collapse toggle (Desktop only) */}
        <div className="hidden lg:flex items-center justify-end pt-1">
          <button
            onClick={onToggleCollapse}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
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
        className={`hidden lg:flex flex-col bg-slate-900 text-slate-300 border-r border-slate-800 h-screen sticky top-0 transition-all duration-200 z-30 shrink-0 no-print ${
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
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
          />

          {/* Drawer Content */}
          <aside className="relative w-72 max-w-[85vw] bg-slate-900 text-slate-300 h-full shadow-2xl flex flex-col z-10 border-r border-slate-800">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};
