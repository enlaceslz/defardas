import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Menu,
  Plus,
  AlertTriangle,
  Calendar,
  Building2,
  HelpCircle,
  ShieldCheck,
  LogOut,
  Bell,
  CalendarClock,
  ShieldAlert,
  RotateCcw,
  Boxes,
  Wallet,
  FileText,
  CheckCircle2,
  ChevronRight,
  CheckCheck,
  X,
} from 'lucide-react';
import { formatDateBR } from '../utils/formatters';
import { useAuth } from '../api/authContext';
import { NotificationsPayload, SystemNotificationItem } from '../types/erp';
import { DEFAULT_BRAND_LOGO_URL } from '../data/initialData';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onOpenNewOrderModal: () => void;
  onToggleMobileSidebar: () => void;
  lowStockCount: number;
  logoUrl?: string;
  notificationsPayload?: NotificationsPayload | null;
  onNotificationAction?: (notification: SystemNotificationItem) => void;
  onOpenHelpManual?: () => void;
  onOpenAuditModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  onOpenNewOrderModal,
  onToggleMobileSidebar,
  lowStockCount,
  logoUrl,
  notificationsPayload,
  onNotificationAction,
  onOpenHelpManual,
  onOpenAuditModal,
}) => {
  const { user, logout } = useAuth();
  const role = user?.role || '';
  const canCreateOrder = ['admin', 'gerente_comercial', 'pcp_producao'].includes(role);
  const canViewAudit = role === 'admin';

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'prazos' | 'gate' | 'outros'>('all');
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isNotifOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsNotifOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isNotifOpen]);

  const notifications = notificationsPayload?.notifications || [];
  const summary = notificationsPayload?.summary;

  const unreadCount = useMemo(
    () => notifications.filter((n) => !readIds.has(n.id)).length,
    [notifications, readIds]
  );

  const criticalUnreadCount = useMemo(
    () => notifications.filter((n) => n.severity === 'critical' && !readIds.has(n.id)).length,
    [notifications, readIds]
  );

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (notifFilter === 'prazos') {
        return n.category === 'prazo_entrega' || n.category === 'prazo_etapa';
      }
      if (notifFilter === 'gate') {
        return n.category === 'portao_gate' || n.category === 'retrabalho';
      }
      if (notifFilter === 'outros') {
        return n.category === 'estoque' || n.category === 'financeiro' || n.category === 'comercial';
      }
      return true;
    });
  }, [notifications, notifFilter]);

  const handleClickNotification = (item: SystemNotificationItem) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
    setIsNotifOpen(false);
    if (onNotificationAction) {
      onNotificationAction(item);
    } else {
      onSelectTab(item.targetTab);
    }
  };

  const handleMarkAllRead = () => {
    setReadIds(new Set(notifications.map((n) => n.id)));
  };

  const getCategoryIcon = (category: SystemNotificationItem['category']) => {
    switch (category) {
      case 'prazo_entrega':
      case 'prazo_etapa':
        return CalendarClock;
      case 'portao_gate':
        return ShieldAlert;
      case 'retrabalho':
        return RotateCcw;
      case 'estoque':
        return Boxes;
      case 'financeiro':
        return Wallet;
      case 'comercial':
        return FileText;
      default:
        return AlertTriangle;
    }
  };

  const getTabTitle = (tab: string): string => {
    switch (tab) {
      case 'portal':
        return 'Vitrine & Catálogo B2B';
      case 'dashboard':
        return 'Painel Geral';
      case 'orders':
        return 'Ordens de Produção (PCP)';
      case 'quotes':
        return 'Orçamentos & Propostas';
      case 'inventory':
        return 'Estoque & Tecidoteca';
      case 'suppliers':
        return 'Fornecedores & Compras';
      case 'partners':
        return 'Parceiros & Facções';
      case 'clients':
        return 'Clientes & Leads CRM';
      case 'whatsapp':
        return 'Central WhatsApp';
      case 'finance':
        return 'Fluxo Financeiro';
      case 'reports':
        return 'Central de Relatórios & Exportação';
      case 'settings':
        return 'Configurações & Backup';
      default:
        return 'Gestão Industrial';
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const totalBadgeCount = notifications.length > 0 ? unreadCount : lowStockCount;
  const hasCritical = criticalUnreadCount > 0 || (summary?.critical ?? 0) > 0;
  const resolvedLogo = logoUrl || DEFAULT_BRAND_LOGO_URL;

  const userInitials = (user?.fullName || 'DF')
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-zinc-200/85 text-zinc-900 no-print pt-safe">
      <div className="px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 sm:gap-6 h-14 lg:h-16">
          {/* Zone 1: Mobile Brand/Menu + Contextual Breadcrumb */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onToggleMobileSidebar}
              className="lg:hidden min-w-[40px] min-h-[40px] flex items-center justify-center text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer shrink-0"
              aria-label="Abrir menu lateral"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Mobile brand emblem */}
            <button
              type="button"
              onClick={() => onSelectTab('dashboard')}
              className="lg:hidden w-10 h-10 rounded-lg bg-white border border-zinc-200/90 p-0.5 flex items-center justify-center shrink-0 shadow-2xs cursor-pointer overflow-hidden"
              aria-label="Ir para o painel inicial"
            >
              <img
                src={resolvedLogo}
                alt="DE FARDAS"
                className="w-full h-full object-contain"
              />
            </button>

            <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 min-w-0">
              <span className="font-extrabold tracking-tight text-zinc-900 hidden sm:inline">
                DE FARDAS
              </span>
              <span aria-hidden="true" className="hidden sm:inline text-zinc-300">
                /
              </span>
              <span className="text-zinc-800 font-semibold truncate text-[13px] sm:text-xs">
                {getTabTitle(currentTab)}
              </span>
            </div>
          </div>

          {/* Zone 2: Informational Strip (Desktop XL) */}
          <div className="hidden xl:flex items-center gap-3.5 text-xs text-zinc-500 whitespace-nowrap shrink-0">
            <div className="flex items-center gap-1.5 font-mono tabular-nums text-zinc-600">
              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
              <span>{formatDateBR(todayStr)}</span>
            </div>
            <span aria-hidden="true" className="text-zinc-300">
              ·
            </span>
            <div className="flex items-center gap-1.5 text-zinc-600">
              <Building2 className="w-3.5 h-3.5 text-[#C8102E]" />
              <span>Unidade São Luís — MA</span>
            </div>
          </div>

          {/* Zone 3: Alerts, PWA Install, Utilities, Primary Action & User */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Central de Notificações & Prazos */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsNotifOpen((prev) => !prev)}
                aria-expanded={isNotifOpen}
                aria-label="Abrir Central de Notificações e Prazos"
                className={`relative min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                  hasCritical
                    ? 'text-rose-800 bg-rose-50 hover:bg-rose-100 border-rose-200'
                    : totalBadgeCount > 0
                      ? 'text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-200'
                      : 'text-zinc-700 bg-zinc-100/90 hover:bg-zinc-200/80 border-zinc-200/90'
                }`}
                title="Central de Notificações: prazos de entrega, etapas fabris, Gate A.3.2 e alertas"
              >
                <Bell
                  className={`w-3.5 h-3.5 shrink-0 ${
                    hasCritical
                      ? 'text-[#C8102E]'
                      : totalBadgeCount > 0
                        ? 'text-amber-600'
                        : 'text-zinc-500'
                  }`}
                />
                <span className="hidden sm:inline">
                  {totalBadgeCount > 0 ? (
                    <span className="font-mono tabular-nums">
                      {totalBadgeCount} {totalBadgeCount === 1 ? 'alerta' : 'alertas'}
                    </span>
                  ) : (
                    <span>Prazos OK</span>
                  )}
                </span>
                {totalBadgeCount > 0 && (
                  <span
                    className={`sm:hidden font-mono tabular-nums text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                      hasCritical ? 'bg-[#C8102E] text-white' : 'bg-amber-500 text-white'
                    }`}
                  >
                    {totalBadgeCount}
                  </span>
                )}
              </button>

              {isNotifOpen && (
                <div
                  role="dialog"
                  aria-label="Central de Notificações e Prazos"
                  className="absolute right-0 mt-2 w-[92vw] sm:w-[440px] max-w-[440px] bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden z-50"
                >
                  {/* Panel Header */}
                  <div className="px-4 py-3.5 bg-[#111113] text-white flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Bell className="w-4 h-4 text-[#E3263E] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">
                          Central de Notificações & Prazos (SLA)
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono tabular-nums">
                          {summary
                            ? `${summary.critical} críticos · ${summary.warning} atenção · ${
                                summary.overdueOrdersCount + summary.overdueStagesCount
                              } atrasos PCP`
                            : 'Monitoramento operacional'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {notifications.length > 0 && unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkAllRead}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 rounded cursor-pointer"
                          title="Marcar alertas atuais como visualizados nesta sessão"
                        >
                          <CheckCheck className="w-3 h-3" />
                          <span>Lidas</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsNotifOpen(false)}
                        className="p-1 text-zinc-400 hover:text-white rounded cursor-pointer"
                        aria-label="Fechar central de notificações"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Quick Category Filter Tabs */}
                  <div className="px-3 py-2 bg-zinc-50 border-b border-zinc-200 flex items-center gap-1.5 overflow-x-auto text-[11px]">
                    {[
                      { id: 'all', label: `Todos (${notifications.length})` },
                      {
                        id: 'prazos',
                        label: `Prazos/Etapas (${
                          notifications.filter(
                            (n) => n.category === 'prazo_entrega' || n.category === 'prazo_etapa'
                          ).length
                        })`,
                      },
                      {
                        id: 'gate',
                        label: `Gate/Retrabalho (${
                          notifications.filter(
                            (n) => n.category === 'portao_gate' || n.category === 'retrabalho'
                          ).length
                        })`,
                      },
                      {
                        id: 'outros',
                        label: `Estoque/Fin. (${
                          notifications.filter(
                            (n) =>
                              n.category === 'estoque' ||
                              n.category === 'financeiro' ||
                              n.category === 'comercial'
                          ).length
                        })`,
                      },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setNotifFilter(tab.id as 'all' | 'prazos' | 'gate' | 'outros')}
                        className={`px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                          notifFilter === tab.id
                            ? 'bg-[#111113] text-white'
                            : 'text-zinc-600 hover:bg-zinc-200/70'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Notifications List */}
                  <div className="max-h-[380px] overflow-y-auto divide-y divide-zinc-100">
                    {filteredNotifications.length === 0 ? (
                      <div className="py-10 px-6 text-center text-xs text-zinc-500 space-y-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                        <div className="font-semibold text-zinc-800">
                          Tudo dentro do prazo neste filtro
                        </div>
                        <p className="text-[11px] text-zinc-500">
                          Nenhuma etapa ou entrega com pendência crítica no momento.
                        </p>
                      </div>
                    ) : (
                      filteredNotifications.map((item) => {
                        const Icon = getCategoryIcon(item.category);
                        const isRead = readIds.has(item.id);
                        return (
                          <div
                            key={item.id}
                            className={`p-3.5 transition-colors hover:bg-zinc-50 ${
                              isRead
                                ? 'opacity-70 bg-white'
                                : item.severity === 'critical'
                                  ? 'bg-rose-50/30'
                                  : 'bg-white'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                  item.severity === 'critical'
                                    ? 'bg-rose-100 text-[#C8102E]'
                                    : item.severity === 'warning'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-zinc-100 text-zinc-700'
                                }`}
                              >
                                <Icon className="w-4 h-4" />
                              </div>

                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="text-xs font-bold text-zinc-900 leading-snug">
                                    {item.title}
                                  </div>
                                  {item.dueDate && (
                                    <span className="font-mono tabular-nums text-[10px] font-semibold text-zinc-500 shrink-0">
                                      {formatDateBR(item.dueDate)}
                                    </span>
                                  )}
                                </div>

                                <p className="text-[11px] text-zinc-600 leading-relaxed">
                                  {item.message}
                                </p>

                                <div className="pt-1 flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {item.stageLabel && (
                                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                                        {item.stageLabel}
                                      </span>
                                    )}
                                    <span
                                      className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                        item.severity === 'critical'
                                          ? 'bg-rose-100 text-rose-800'
                                          : item.severity === 'warning'
                                            ? 'bg-amber-100 text-amber-800'
                                            : 'bg-zinc-100 text-zinc-700'
                                      }`}
                                    >
                                      {item.severity === 'critical'
                                        ? 'Crítico'
                                        : item.severity === 'warning'
                                          ? 'Atenção'
                                          : 'Aviso'}
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleClickNotification(item)}
                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#C8102E] hover:text-[#9A0B22] cursor-pointer shrink-0"
                                  >
                                    <span>{item.actionLabel}</span>
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Panel Footer */}
                  <div className="px-4 py-2.5 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500 font-mono tabular-nums">
                      Base: {formatDateBR(notificationsPayload?.asOfDate || todayStr)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNotifOpen(false);
                        onSelectTab('orders');
                      }}
                      className="font-bold text-[#C8102E] hover:text-[#9A0B22] cursor-pointer"
                    >
                      Abrir Cronograma PCP &rarr;
                    </button>
                  </div>
                </div>
              )}
            </div>

            <PWAInstallButton variant="header" />

            {onOpenAuditModal && canViewAudit && (
              <button
                type="button"
                onClick={onOpenAuditModal}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/90 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                title="Auditoria da Fundação P0, Schemas PostgreSQL, Invariantes e RBAC"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="hidden md:inline">Auditoria P0</span>
              </button>
            )}

            {onOpenHelpManual && (
              <button
                type="button"
                onClick={onOpenHelpManual}
                className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-zinc-700 bg-zinc-100/90 hover:bg-zinc-200/80 border border-zinc-200/90 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                title="Manual Operacional e Regras de Negócio PRD v1.6"
              >
                <HelpCircle className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="hidden lg:inline">Manual</span>
              </button>
            )}

            {canCreateOrder && (
              <button
                type="button"
                onClick={onOpenNewOrderModal}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#C8102E] hover:bg-[#A60D26] rounded-lg shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer active:scale-[0.98]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden xs:inline sm:inline">Nova OP</span>
              </button>
            )}

            {user && (
              <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-zinc-200">
                <div className="w-8 h-8 rounded-full bg-[#111113] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  {userInitials}
                </div>
                <div className="hidden xl:flex flex-col text-left">
                  <span className="text-xs font-semibold text-zinc-900 leading-tight truncate max-w-[128px]">
                    {user.fullName}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase font-medium">
                    {user.role.replace(/_/g, ' ')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="p-1.5 text-zinc-400 hover:text-[#C8102E] hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  title={`Encerrar Sessão (${user.email})`}
                  aria-label="Encerrar sessão"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
