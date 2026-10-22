import React from 'react';
import { Menu, Plus, AlertTriangle, Calendar, Building2, HelpCircle } from 'lucide-react';
import { formatDateBR } from '../utils/formatters';

interface HeaderProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onOpenNewOrderModal: () => void;
  onToggleMobileSidebar: () => void;
  lowStockCount: number;
  onOpenHelpManual?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  onOpenNewOrderModal,
  onToggleMobileSidebar,
  lowStockCount,
  onOpenHelpManual,
}) => {
  const getTabTitle = (tab: string): string => {
    switch (tab) {
      case 'portal': return 'Portal Público & Portfólio Digital';
      case 'dashboard': return 'Painel Geral da Fábrica';
      case 'orders': return 'Ordens de Produção (PCP)';
      case 'quotes': return 'Orçamentos & Propostas Comerciais';
      case 'inventory': return 'Estoque & Tecidoteca';
      case 'clients': return 'Carteira de Clientes B2B';
      case 'finance': return 'Fluxo de Caixa & Finanças';
      case 'settings': return 'Configurações & Backup';
      default: return 'Sistema de Gestão';
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-slate-200 text-slate-900 shadow-2xs no-print">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-8 h-16">
          
          {/* Zone 1: Mobile Toggle + Breadcrumb Title */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Mobile menu hamburger */}
            <button
              onClick={onToggleMobileSidebar}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg focus:outline-none cursor-pointer"
              aria-label="Abrir menu lateral"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 whitespace-nowrap">
              <span className="font-bold text-slate-900 hidden sm:inline">DE FARDAS</span>
              <span aria-hidden="true" className="hidden sm:inline">/</span>
              <span className="text-slate-700 font-semibold">{getTabTitle(currentTab)}</span>
            </div>
          </div>

          {/* Zone 2: Informational / Status Indicator (Single-line) */}
          <div className="hidden md:flex items-center gap-4 text-xs text-slate-500 whitespace-nowrap shrink-0">
            <div className="flex items-center gap-1.5 font-mono text-slate-600">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{formatDateBR(todayStr)}</span>
            </div>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <div className="flex items-center gap-1.5 text-slate-600">
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Chão de Fábrica Ativo</span>
            </div>
          </div>

          {/* Zone 3: 1 Primary Action + Stock Alert Icon */}
          <div className="flex items-center gap-3 shrink-0">
            {lowStockCount > 0 && (
              <button
                onClick={() => onSelectTab('inventory')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                title={`${lowStockCount} tecidos/insumos abaixo do estoque mínimo`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="hidden sm:inline font-mono">{lowStockCount} alertas</span>
              </button>
            )}

            {onOpenHelpManual && (
              <button
                onClick={onOpenHelpManual}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                title="Manual Operacional e Regras de Negócio PRD v1.6"
              >
                <HelpCircle className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="hidden sm:inline">Ajuda & Manual</span>
              </button>
            )}

            <button
              onClick={onOpenNewOrderModal}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
            >
              <Plus className="w-4 h-4" />
              <span>+ Nova OP</span>
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
