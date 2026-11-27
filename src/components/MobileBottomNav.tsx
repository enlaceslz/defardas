import React from 'react';
import {
  LayoutDashboard,
  Factory,
  MessageSquare,
  FileText,
  Wallet,
  Boxes,
  Menu,
} from 'lucide-react';
import { useAuth } from '../api/authContext';

interface MobileBottomNavProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onOpenDrawer: () => void;
  overdueOrdersCount?: number;
  blockedOrdersCount?: number;
  whatsappUnreadCount?: number;
  overdueFinanceCount?: number;
  lowStockCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentTab,
  onSelectTab,
  onOpenDrawer,
  overdueOrdersCount = 0,
  blockedOrdersCount = 0,
  whatsappUnreadCount = 0,
  overdueFinanceCount = 0,
  lowStockCount = 0,
}) => {
  const { user } = useAuth();
  const role = user?.role || '';
  const canViewWhatsApp = ['admin', 'gerente_comercial', 'vendedor', 'financeiro'].includes(role);
  const canViewFinance = ['admin', 'financeiro', 'gerente_comercial'].includes(role);

  const primaryDestinations = [
    {
      id: 'dashboard',
      label: 'Painel',
      icon: LayoutDashboard,
      badge: 0,
      alertDot: false,
    },
    {
      id: 'orders',
      label: 'OPs',
      icon: Factory,
      badge: overdueOrdersCount > 0 ? overdueOrdersCount : 0,
      alertDot: blockedOrdersCount > 0 && overdueOrdersCount === 0,
    },
    canViewWhatsApp
      ? {
          id: 'whatsapp',
          label: 'WhatsApp',
          icon: MessageSquare,
          badge: whatsappUnreadCount,
          alertDot: false,
        }
      : {
          id: 'quotes',
          label: 'Orçamentos',
          icon: FileText,
          badge: 0,
          alertDot: false,
        },
    canViewFinance
      ? {
          id: 'finance',
          label: 'Financeiro',
          icon: Wallet,
          badge: overdueFinanceCount,
          alertDot: false,
        }
      : {
          id: 'inventory',
          label: 'Estoque',
          icon: Boxes,
          badge: lowStockCount,
          alertDot: false,
        },
  ];

  const isDrawerRouteActive = !primaryDestinations.some((d) => d.id === currentTab);

  return (
    <nav
      aria-label="Navegação rápida mobile"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-zinc-200/90 no-print pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.04)]"
    >
      <div className="grid grid-cols-5 items-center h-14 px-1">
        {primaryDestinations.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`min-h-[44px] flex flex-col items-center justify-center relative rounded-xl transition-colors cursor-pointer ${
                isActive ? 'text-[#C8102E]' : 'text-zinc-500 active:text-zinc-900'
              }`}
            >
              <span className="relative">
                <Icon className="w-[20px] h-[20px]" strokeWidth={isActive ? 2.4 : 1.9} />
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[#C8102E] text-white text-[9px] font-mono font-bold flex items-center justify-center tabular-nums">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
                {item.badge === 0 && item.alertDot && (
                  <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white" />
                )}
              </span>
              <span
                className={`text-[10px] mt-0.5 tracking-tight leading-none ${
                  isActive ? 'font-bold' : 'font-medium'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="Abrir todos os módulos"
          className={`min-h-[44px] flex flex-col items-center justify-center relative rounded-xl transition-colors cursor-pointer ${
            isDrawerRouteActive ? 'text-[#C8102E]' : 'text-zinc-500 active:text-zinc-900'
          }`}
        >
          <Menu className="w-[20px] h-[20px]" strokeWidth={isDrawerRouteActive ? 2.4 : 1.9} />
          <span
            className={`text-[10px] mt-0.5 tracking-tight leading-none ${
              isDrawerRouteActive ? 'font-bold' : 'font-medium'
            }`}
          >
            Mais
          </span>
        </button>
      </div>
    </nav>
  );
};
