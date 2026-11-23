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

interface HeaderProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onOpenNewOrderModal: () => void;
  onToggleMobileSidebar: () => void;
  lowStockCount: number;
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
      case 'portal': return 'Portal Público & Portfólio Digital';
      case 'dashboard': return 'Painel Geral da Fábrica';
      case 'orders': return 'Ordens de Produção (PCP)';
      case 'quotes': return 'Orçamentos & Propostas Comerciais';
      case 'inventory': return 'Estoque & Tecidoteca';
      case 'suppliers': return 'Fornecedores & Pedidos de Compra';
      case 'partners': return 'Parceiros & Terceirizados (Facções)';
      case 'clients': return 'Carteira de Clientes B2B';
      case 'whatsapp': return 'Central WhatsApp Omnichannel';
      case 'finance': return 'Fluxo de Caixa & Finanças';
      case 'settings': return 'Configurações & Backup';
      default: return 'Sistema de Gestão';
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  const totalBadgeCount = notifications.length > 0 ? unreadCount : lowStockCount;
  const hasCritical = criticalUnreadCount > 0 || (summary?.critical ?? 0) > 0;

  return (
    <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200/90 text-slate-900 shadow-2xs no-print">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 sm:gap-8 h-16">
          
          {/* Zone 1: Mobile Toggle + Breadcrumb Title */}
          <div className="flex items-center gap-3 shrink-0 min-w-0">
            <button
              onClick={onToggleMobileSidebar}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg focus:outline-none cursor-pointer"
              aria-label="Abrir menu lateral"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 whitespace-nowrap truncate">
              <span className="font-bold text-slate-900 hidden sm:inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
                DE FARDAS
              </span>
              <span aria-hidden="true" className="hidden sm:inline text-slate-300">/</span>
              <span className="text-slate-700 font-semibold truncate">{getTabTitle(currentTab)}</span>
            </div>
          </div>

          {/* Zone 2: Informational / Status Indicator (Single-line) */}
          <div className="hidden xl:flex items-center gap-4 text-xs text-slate-500 whitespace-nowrap shrink-0">
            <div className="flex items-center gap-1.5 font-mono text-slate-600">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{formatDateBR(todayStr)}</span>
            </div>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <div className="flex items-center gap-1.5 text-slate-600">
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Chão de Fábrica São Luís</span>
            </div>
          </div>

          {/* Zone 3: Notification Center + Audit + Help + Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Central de Notificações & Prazos */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsNotifOpen((prev) => !prev)}
                aria-expanded={isNotifOpen}
                aria-label="Abrir Central de Notificações e Prazos"
                className={`relative inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                  hasCritical
                    ? 'text-rose-800 bg-rose-50 hover:bg-rose-100 border-rose-200/90'
                    : totalBadgeCount > 0
                      ? 'text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-200/90'
                      : 'text-slate-700 bg-slate-100 hover:bg-slate-200 border-slate-200'
                }`}
                title="Central de Notificações: prazos de entrega, etapas fabris, Gate A.3.2 e alertas"
              >
                <Bell className={`w-3.5 h-3.5 shrink-0 ${hasCritical ? 'text-rose-600' : totalBadgeCount > 0 ? 'text-amber-600' : 'text-slate-500'}`} />
                <span className="hidden sm:inline">
                  {totalBadgeCount > 0 ? (
                    <span className="font-mono">
                      {totalBadgeCount} {totalBadgeCount === 1 ? 'alerta' : 'alertas'}
                    </span>
                  ) : (
                    <span>Prazos OK</span>
                  )}
                </span>
                {totalBadgeCount > 0 && (
                  <span
                    className={`sm:hidden font-mono text-[10px] font-bold px-1 rounded ${
                      hasCritical ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'
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
                  className="absolute right-0 mt-2 w-[92vw] sm:w-[440px] max-w-[440px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50"
                >
                  {/* Panel Header */}
                  <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Bell className="w-4 h-4 text-blue-300 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">
                          Central de Notificações & Prazos (SLA)
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {summary
                            ? `${summary.critical} críticos · ${summary.warning} atenção · ${summary.overdueOrdersCount + summary.overdueStagesCount} atrasos PCP`
                            : 'Monitoramento em tempo real'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {notifications.length > 0 && unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkAllRead}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded cursor-pointer"
                          title="Marcar alertas atuais como visualizados nesta sessão"
                        >
                          <CheckCheck className="w-3 h-3" />
                          <span>Lidas</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsNotifOpen(false)}
                        className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
                        aria-label="Fechar central de notificações"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Quick Category Filter Tabs */}
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto text-[11px]">
                    {[
                      { id: 'all', label: `Todos (${notifications.length})` },
                      {
                        id: 'prazos',
                        label: `Prazos/Etapas (${notifications.filter((n) => n.category === 'prazo_entrega' || n.category === 'prazo_etapa').length})`,
                      },
                      {
                        id: 'gate',
                        label: `Gate/Retrabalho (${notifications.filter((n) => n.category === 'portao_gate' || n.category === 'retrabalho').length})`,
                      },
                      {
                        id: 'outros',
                        label: `Estoque/Fin. (${notifications.filter((n) => n.category === 'estoque' || n.category === 'financeiro' || n.category === 'comercial').length})`,
                      },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setNotifFilter(tab.id as any)}
                        className={`px-2.5 py-1 rounded-md font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                          notifFilter === tab.id
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:bg-slate-200/70'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Notifications List */}
                  <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
                    {filteredNotifications.length === 0 ? (
                      <div className="py-10 px-6 text-center text-xs text-slate-500 space-y-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                        <div className="font-semibold text-slate-800">
                          Tudo dentro do prazo neste filtro!
                        </div>
                        <p className="text-[11px] text-slate-500">
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
                            className={`p-3.5 transition-colors hover:bg-slate-50 ${
                              isRead ? 'opacity-70 bg-white' : item.severity === 'critical' ? 'bg-rose-50/30' : 'bg-white'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                  item.severity === 'critical'
                                    ? 'bg-rose-100 text-rose-700'
                                    : item.severity === 'warning'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-blue-100 text-blue-700'
                                }`}
                              >
                                <Icon className="w-4 h-4" />
                              </div>

                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="text-xs font-bold text-slate-900 leading-snug">
                                    {item.title}
                                  </div>
                                  {item.dueDate && (
                                    <span className="font-mono text-[10px] font-semibold text-slate-500 shrink-0">
                                      {formatDateBR(item.dueDate)}
                                    </span>
                                  )}
                                </div>

                                <p className="text-[11px] text-slate-600 leading-relaxed">
                                  {item.message}
                                </p>

                                <div className="pt-1 flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {item.stageLabel && (
                                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                        {item.stageLabel}
                                      </span>
                                    )}
                                    <span
                                      className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                        item.severity === 'critical'
                                          ? 'bg-rose-100 text-rose-800'
                                          : item.severity === 'warning'
                                            ? 'bg-amber-100 text-amber-800'
                                            : 'bg-blue-50 text-blue-700'
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
                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900 cursor-pointer shrink-0"
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
                  <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">
                      Atualizado em {formatDateBR(notificationsPayload?.asOfDate || todayStr)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNotifOpen(false);
                        onSelectTab('orders');
                      }}
                      className="font-bold text-blue-700 hover:text-blue-900 cursor-pointer"
                    >
                      Ir para Cronograma PCP &rarr;
                    </button>
                  </div>
                </div>
              )}
            </div>

            {onOpenAuditModal && canViewAudit && (
              <button
                onClick={onOpenAuditModal}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
                title="Auditoria da Fundação P0, Schemas PostgreSQL, Invariantes e RBAC"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="hidden md:inline">Fundação P0</span>
              </button>
            )}

            {onOpenHelpManual && (
              <button
                onClick={onOpenHelpManual}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                title="Manual Operacional e Regras de Negócio PRD v1.6"
              >
                <HelpCircle className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="hidden lg:inline">Ajuda & Manual</span>
              </button>
            )}

            {canCreateOrder && (
              <button
                onClick={onOpenNewOrderModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
              >
                <Plus className="w-4 h-4" />
                <span>Nova OP</span>
              </button>
            )}

            {user && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
                <div className="hidden xl:flex flex-col text-right">
                  <span className="text-xs font-semibold text-slate-900 leading-tight truncate max-w-[120px]">
                    {user.fullName}
                  </span>
                  <span className="text-[10px] font-mono text-blue-600 uppercase font-bold">
                    {user.role}
                  </span>
                </div>
                <button
                  onClick={() => logout()}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  title={`Encerrar Sessão (${user.email})`}
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
