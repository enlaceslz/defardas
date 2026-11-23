import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Columns3,
  Table as TableIcon,
  ChevronRight,
  ChevronLeft,
  Printer,
  Edit3,
  Trash2,
  Clock,
  CheckCircle2,
  Scissors,
  Sparkles,
  Shirt,
  Truck,
  AlertTriangle,
  ShieldAlert,
  FileCheck,
  RotateCcw,
  X,
  Factory,
  CalendarClock,
  GanttChart,
  MessageSquare,
} from 'lucide-react';
import { ProductionOrder, OperationalStage } from '../types/erp';
import {
  formatDateBR,
  getStageLabel,
  getPriorityBadge,
  getFinancialStatusBadge,
} from '../utils/formatters';
import { useAuth } from '../api/authContext';
import {
  OrderScheduleModal,
  getDeliveryStatusBadge,
  getStageDeadlineBadge,
} from './OrderScheduleModal';

interface ProductionOrdersViewProps {
  orders: ProductionOrder[];
  onOpenNewOrderModal: () => void;
  onEditOrder: (order: ProductionOrder) => void;
  onDeleteOrder: (orderId: string) => void;
  onUpdateOrderStage: (
    orderId: string,
    nextStage: OperationalStage,
    reason?: string
  ) => void | Promise<void>;
  onUpdateOrderSchedule?: (
    orderId: string,
    payload: {
      targetDeliveryDate?: string;
      syncTargetDelivery?: boolean;
      recalculateProportional?: boolean;
      stages?: Array<{
        stage: string;
        plannedStartDate: string;
        plannedEndDate: string;
        responsible?: string;
        notes?: string;
        skipped?: boolean;
      }>;
    }
  ) => Promise<boolean>;
  onOpenPrintTicket: (order: ProductionOrder) => void;
  onGoToFinanceForPayment?: () => void;
  onApproveArt?: (
    orderId: string,
    approverName: string,
    notes?: string
  ) => void | Promise<void>;
  onRequestArtRevision?: (
    orderId: string,
    revisionNotes: string,
    requestedBy?: string
  ) => void | Promise<void>;
  focusedScheduleOrderId?: string | null;
  onClearFocusedScheduleOrder?: () => void;
  onNotifyOrderWhatsApp?: (order: ProductionOrder) => Promise<void> | void;
}

export const ProductionOrdersView: React.FC<ProductionOrdersViewProps> = ({
  orders,
  onOpenNewOrderModal,
  onEditOrder,
  onDeleteOrder,
  onUpdateOrderStage,
  onUpdateOrderSchedule,
  onOpenPrintTicket,
  onGoToFinanceForPayment,
  onApproveArt,
  onRequestArtRevision,
  focusedScheduleOrderId,
  onClearFocusedScheduleOrder,
  onNotifyOrderWhatsApp,
}) => {
  const { user } = useAuth();
  const role = user?.role || '';

  // RBAC estritamente espelhado em server/auth/rbac.ts
  const isAdmin = role === 'admin';
  const canCreateOrEdit = ['admin', 'gerente_comercial', 'pcp_producao'].includes(role);
  const canAdvanceStage = ['admin', 'pcp_producao', 'expedicao_qualidade'].includes(role);
  const canApproveArt = ['admin', 'gerente_comercial', 'vendedor', 'pcp_producao'].includes(role);
  const canManageSchedule = ['admin', 'pcp_producao', 'gerente_comercial'].includes(role);
  const canUseWhatsApp = ['admin', 'gerente_comercial', 'vendedor', 'financeiro'].includes(role);
  const canDelete = role === 'admin';
  const canGoToFinance = ['admin', 'financeiro', 'gerente_comercial'].includes(role);

  const [viewMode, setViewMode] = useState<'kanban' | 'timeline' | 'table'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [quickFilter, setQuickFilter] = useState<'all' | 'overdue' | 'stage_alert' | 'blocked' | 'rework'>('all');

  // Modais operacionais in-app (zero window.prompt/alert)
  const [gateModalOrder, setGateModalOrder] = useState<ProductionOrder | null>(null);
  const [artApprovalModalOrder, setArtApprovalModalOrder] = useState<ProductionOrder | null>(null);
  const [artApproverName, setArtApproverName] = useState('');
  const [artApprovalNotes, setArtApprovalNotes] = useState('');
  const [reworkModalOrder, setReworkModalOrder] = useState<ProductionOrder | null>(null);
  const [reworkReason, setReworkReason] = useState('');
  const [artRevisionModalOrder, setArtRevisionModalOrder] = useState<ProductionOrder | null>(null);
  const [artRevisionReason, setArtRevisionReason] = useState('');
  const [scheduleModalOrderId, setScheduleModalOrderId] = useState<string | null>(null);
  const [isProcessingModal, setIsProcessingModal] = useState(false);

  // Abrir automaticamente o cronograma da OP quando acionado pela Central de Notificações ou Painel
  useEffect(() => {
    if (!focusedScheduleOrderId) return;
    if (orders.some((o) => o.id === focusedScheduleOrderId)) {
      setViewMode('timeline');
      setScheduleModalOrderId(focusedScheduleOrderId);
    }
    onClearFocusedScheduleOrder?.();
  }, [focusedScheduleOrderId, orders, onClearFocusedScheduleOrder]);

  const scheduleModalOrder = useMemo(
    () => (scheduleModalOrderId ? orders.find((o) => o.id === scheduleModalOrderId) || null : null),
    [scheduleModalOrderId, orders]
  );

  const todayISO = useMemo(() => new Date().toISOString().split('T')[0], []);

  const isOrderOverdue = (order: ProductionOrder) =>
    order.stage !== 'entregue' &&
    (order.deadlineSummary
      ? order.deadlineSummary.deliveryStatus === 'atrasada'
      : Boolean(order.targetDeliveryDate) && order.targetDeliveryDate < todayISO);

  const hasStageOrDeliveryAlert = (order: ProductionOrder) => {
    if (order.stage === 'entregue') return false;
    if (order.deadlineSummary) {
      return (
        order.deadlineSummary.isCurrentStageOverdue ||
        order.deadlineSummary.isCurrentStageDueSoon ||
        order.deadlineSummary.deliveryStatus === 'critica_hoje' ||
        order.deadlineSummary.deliveryStatus === 'atencao'
      );
    }
    return false;
  };

  const stagesList: { id: OperationalStage; label: string; icon: any; color: string }[] = [
    { id: 'aguardando_liberacao', label: '0. Bloqueado (Entrada/Arte)', icon: ShieldAlert, color: 'border-t-rose-500' },
    { id: 'corte', label: '1. Corte & Enfesto', icon: Scissors, color: 'border-t-amber-500' },
    { id: 'bordado_silk', label: '2. Bordado & Silk (Parceiro)', icon: Sparkles, color: 'border-t-indigo-500' },
    { id: 'costura', label: '3. Costura & Montagem', icon: Shirt, color: 'border-t-blue-500' },
    { id: 'conferencia_qualidade', label: '4. Inspeção de Qualidade', icon: CheckCircle2, color: 'border-t-purple-500' },
    { id: 'retrabalho', label: '4b. Retrabalho / Ajustes', icon: RotateCcw, color: 'border-t-orange-500' },
    { id: 'expedicao', label: '5. Embalagem & Envio', icon: Truck, color: 'border-t-emerald-500' },
    { id: 'entregue', label: 'Concluído / Entregue', icon: CheckCircle2, color: 'border-t-slate-400' },
  ];

  const getNextStage = (current: OperationalStage): OperationalStage | null => {
    switch (current) {
      case 'aguardando_liberacao': return 'corte';
      case 'corte': return 'bordado_silk';
      case 'bordado_silk': return 'costura';
      case 'costura': return 'conferencia_qualidade';
      case 'conferencia_qualidade': return 'expedicao';
      case 'retrabalho': return 'costura';
      case 'expedicao': return 'entregue';
      default: return null;
    }
  };

  const getPrevStage = (current: OperationalStage): OperationalStage | null => {
    switch (current) {
      case 'corte': return 'aguardando_liberacao';
      case 'bordado_silk': return 'corte';
      case 'costura': return 'bordado_silk';
      case 'conferencia_qualidade': return 'costura';
      case 'retrabalho': return 'conferencia_qualidade';
      case 'expedicao': return 'conferencia_qualidade';
      case 'entregue': return isAdmin ? 'expedicao' : null;
      default: return null;
    }
  };

  // KPIs globais do chão de fábrica
  const kpis = useMemo(() => {
    const active = orders.filter((o) => o.stage !== 'entregue');
    const activePieces = active.reduce((sum, o) => sum + (o.totalPieces || 0), 0);
    const blocked = active.filter((o) => !o.canStartProduction).length;
    const overdue = active.filter((o) => isOrderOverdue(o)).length;
    const stageAlert = active.filter((o) => hasStageOrDeliveryAlert(o)).length;
    const rework = active.filter((o) => o.stage === 'retrabalho').length;
    return {
      activeCount: active.length,
      activePieces,
      blocked,
      overdue,
      stageAlert,
      rework,
    };
  }, [orders, todayISO]);

  // Filtragem unificada
  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesSearch =
        !q ||
        order.id.toLowerCase().includes(q) ||
        (order.orderNumber || '').toLowerCase().includes(q) ||
        order.clientName.toLowerCase().includes(q) ||
        order.itemTitle.toLowerCase().includes(q) ||
        order.fabricName.toLowerCase().includes(q) ||
        (order.outsourcedPartner || '').toLowerCase().includes(q);

      const matchesPriority = priorityFilter === 'all' || order.priority === priorityFilter;
      const matchesStage = stageFilter === 'all' || order.stage === stageFilter;

      const matchesQuick =
        quickFilter === 'all' ||
        (quickFilter === 'overdue' && isOrderOverdue(order)) ||
        (quickFilter === 'stage_alert' && hasStageOrDeliveryAlert(order)) ||
        (quickFilter === 'blocked' && order.stage !== 'entregue' && !order.canStartProduction) ||
        (quickFilter === 'rework' && order.stage === 'retrabalho');

      return matchesSearch && matchesPriority && matchesStage && matchesQuick;
    });
  }, [orders, searchQuery, priorityFilter, stageFilter, quickFilter, todayISO]);

  const totalFilteredActivePieces = useMemo(
    () =>
      filteredOrders
        .filter((o) => o.stage !== 'entregue')
        .reduce((sum, o) => sum + (o.totalPieces || 0), 0),
    [filteredOrders]
  );

  const visibleKanbanStages = useMemo(
    () => (stageFilter === 'all' ? stagesList : stagesList.filter((s) => s.id === stageFilter)),
    [stageFilter]
  );

  const openArtApprovalModal = (order: ProductionOrder) => {
    setArtApprovalModalOrder(order);
    setArtApproverName(order.clientName ? `Aprovado por ${order.clientName}` : '');
    setArtApprovalNotes('');
  };

  const handleSubmitArtApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!artApprovalModalOrder || !onApproveArt || isProcessingModal) return;
    setIsProcessingModal(true);
    try {
      await onApproveArt(
        artApprovalModalOrder.id,
        artApproverName.trim() || user?.fullName || 'Cliente',
        artApprovalNotes.trim() || undefined
      );
      setArtApprovalModalOrder(null);
      setArtApproverName('');
      setArtApprovalNotes('');
    } finally {
      setIsProcessingModal(false);
    }
  };

  const openReworkModal = (order: ProductionOrder) => {
    setReworkModalOrder(order);
    setReworkReason('');
  };

  const handleSubmitRework = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reworkModalOrder || isProcessingModal) return;
    setIsProcessingModal(true);
    try {
      await onUpdateOrderStage(
        reworkModalOrder.id,
        'retrabalho',
        reworkReason.trim() || 'Ajuste de qualidade solicitado na inspeção final'
      );
      setReworkModalOrder(null);
      setReworkReason('');
    } finally {
      setIsProcessingModal(false);
    }
  };

  const handleSubmitOrderArtRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!artRevisionModalOrder || !onRequestArtRevision || isProcessingModal) return;
    if (artRevisionReason.trim().length < 5) return;
    setIsProcessingModal(true);
    try {
      await onRequestArtRevision(
        artRevisionModalOrder.id,
        artRevisionReason.trim(),
        artRevisionModalOrder.clientName
      );
      setArtRevisionModalOrder(null);
      setArtRevisionReason('');
    } finally {
      setIsProcessingModal(false);
    }
  };

  const toggleQuickFilter = (target: 'overdue' | 'stage_alert' | 'blocked' | 'rework') => {
    setQuickFilter((prev) => (prev === target ? 'all' : target));
  };

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    priorityFilter !== 'all' ||
    stageFilter !== 'all' ||
    quickFilter !== 'all';

  return (
    <div className="space-y-6">

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="text-xs font-medium text-slate-500 flex items-center gap-2">
            <span>DE FARDAS</span>
            <span aria-hidden="true">/</span>
            <span>Chão de Fábrica & PCP</span>
            <span aria-hidden="true">/</span>
            <span className="text-slate-800 font-semibold">Ordens de Produção (PRD v1.6)</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Planejamento & Controle da Produção (PCP)
          </h1>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex items-center p-1 bg-slate-200 rounded-lg">
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>Quadro Kanban</span>
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                viewMode === 'timeline'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GanttChart className="w-3.5 h-3.5" />
              <span>Cronograma & Prazos</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Tabela</span>
            </button>
          </div>

          {canCreateOrEdit && (
            <button
              onClick={onOpenNewOrderModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nova OP</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => setQuickFilter('all')}
          className={`text-left bg-white p-4 rounded-xl border transition-all cursor-pointer ${
            quickFilter === 'all'
              ? 'border-blue-400 ring-1 ring-blue-100 shadow-xs'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>OPs Ativas em Fábrica</span>
            <Factory className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900">{kpis.activeCount}</span>
            <span className="text-xs font-mono text-blue-700 font-semibold">
              {kpis.activePieces.toLocaleString('pt-BR')} peças
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => toggleQuickFilter('overdue')}
          className={`text-left bg-white p-4 rounded-xl border transition-all cursor-pointer ${
            quickFilter === 'overdue'
              ? 'border-rose-500 ring-1 ring-rose-100 shadow-xs'
              : 'border-slate-200 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Entregas Atrasadas</span>
            <CalendarClock className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono ${kpis.overdue > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              {kpis.overdue}
            </span>
            <span className="text-[11px] text-slate-500">
              {kpis.overdue > 0 ? 'Prazo final vencido' : 'Tudo no prazo'}
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => toggleQuickFilter('stage_alert')}
          className={`text-left bg-white p-4 rounded-xl border transition-all cursor-pointer ${
            quickFilter === 'stage_alert'
              ? 'border-amber-500 ring-1 ring-amber-100 shadow-xs'
              : 'border-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Etapas em Alerta / SLA</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono ${kpis.stageAlert > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
              {kpis.stageAlert}
            </span>
            <span className="text-[11px] text-slate-500">
              Etapa vencida ou próx. 3d
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => toggleQuickFilter('blocked')}
          className={`text-left bg-white p-4 rounded-xl border transition-all cursor-pointer ${
            quickFilter === 'blocked'
              ? 'border-rose-400 ring-1 ring-rose-100 shadow-xs'
              : 'border-slate-200 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Bloqueadas (Gate A.3.2)</span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-rose-700">{kpis.blocked}</span>
            <span className="text-[11px] text-slate-500">Aguardando sinal ou arte</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => toggleQuickFilter('rework')}
          className={`text-left bg-white p-4 rounded-xl border transition-all cursor-pointer ${
            quickFilter === 'rework'
              ? 'border-orange-400 ring-1 ring-orange-100 shadow-xs'
              : 'border-slate-200 hover:border-orange-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Em Retrabalho</span>
            <RotateCcw className="w-4 h-4 text-orange-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono ${kpis.rework > 0 ? 'text-orange-700' : 'text-slate-900'}`}>
              {kpis.rework}
            </span>
            <span className="text-[11px] text-slate-500">Ajustes pós-inspeção</span>
          </div>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
        <div className="flex-1 flex flex-col sm:flex-row gap-2.5 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por cliente, código OP, modelo, tecido ou facção..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            aria-label="Filtrar por etapa operacional"
            className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700"
          >
            <option value="all">Todas as Etapas</option>
            {stagesList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            aria-label="Filtrar por prioridade"
            className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700"
          >
            <option value="all">Todas as Prioridades</option>
            <option value="urgente">Urgente</option>
            <option value="alta">Alta</option>
            <option value="normal">Normal</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setPriorityFilter('all');
                setStageFilter('all');
                setQuickFilter('all');
              }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 font-medium cursor-pointer"
            >
              Limpar filtros
            </button>
          )}
        </div>

        <div className="text-slate-500 text-xs shrink-0 self-end lg:self-auto font-medium">
          Mostrando <span className="font-mono font-bold text-slate-800">{filteredOrders.length}</span> ordens ·{' '}
          <span className="font-mono font-bold text-blue-700">
            {totalFilteredActivePieces.toLocaleString('pt-BR')}
          </span>{' '}
          peças ativas
        </div>
      </div>

      {/* Kanban Board View */}
      {viewMode === 'kanban' ? (
        <div className="overflow-x-auto pb-4">
          <div
            className={`grid gap-3 ${
              visibleKanbanStages.length === 1
                ? 'grid-cols-1 max-w-xl'
                : 'grid-cols-1 md:grid-cols-3 lg:grid-cols-8 min-w-[1640px]'
            }`}
          >
            {visibleKanbanStages.map((stg) => {
              const stageOrders = filteredOrders.filter((o) => o.stage === stg.id);
              const stagePieces = stageOrders.reduce((sum, o) => sum + o.totalPieces, 0);
              const StageIcon = stg.icon;

              return (
                <div
                  key={stg.id}
                  className={`bg-slate-100/60 border border-slate-200/90 border-t-2 ${stg.color} rounded-xl flex flex-col shadow-2xs overflow-hidden`}
                >
                  {/* Column Header */}
                  <div className="p-3 border-b border-slate-200 bg-white/90 flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-xs text-slate-800">
                      <StageIcon className="w-4 h-4 text-slate-600 shrink-0" />
                      <span className="truncate">{stg.label}</span>
                    </div>
                    <div className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
                      {stageOrders.length}
                    </div>
                  </div>

                  <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200/60 text-[11px] text-slate-500 font-mono flex items-center justify-between">
                    <span>Volume Total:</span>
                    <span className="font-bold text-slate-800">{stagePieces.toLocaleString('pt-BR')} pçs</span>
                  </div>

                  {/* Orders Cards Container */}
                  <div className="p-2 space-y-3 flex-1 min-h-[350px]">
                    {stageOrders.length === 0 ? (
                      <div className="h-28 flex items-center justify-center text-slate-400 text-xs border border-dashed border-slate-300/80 rounded-lg text-center p-2">
                        Sem ordens nesta etapa
                      </div>
                    ) : (
                      stageOrders.map((order) => {
                        const nextStage = getNextStage(order.stage);
                        const prevStage = getPrevStage(order.stage);
                        const priorityInfo = getPriorityBadge(order.priority);
                        const isBlocked = !order.canStartProduction;
                        const overdue = isOrderOverdue(order);
                        const canEditThisOrder =
                          canCreateOrEdit && (order.stage !== 'entregue' || isAdmin);

                        return (
                          <div
                            key={order.id}
                            className={`bg-white p-3.5 rounded-lg border shadow-xs hover:border-blue-400 hover:shadow-sm transition-all space-y-2.5 text-xs ${
                              isBlocked
                                ? 'border-rose-300/90 bg-rose-50/20'
                                : overdue
                                  ? 'border-amber-400/90 bg-amber-50/15'
                                  : 'border-slate-200/90'
                            }`}
                          >
                            {/* Card Top: Code + Priority */}
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono font-bold text-slate-900 text-[11px]">
                                {order.orderNumber || order.id}
                              </span>
                              <div className="flex items-center gap-1">
                                {overdue && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                                    Atrasada
                                  </span>
                                )}
                                <span
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${priorityInfo.bg} ${priorityInfo.text}`}
                                >
                                  {priorityInfo.label}
                                </span>
                              </div>
                            </div>

                            {/* Client & Title */}
                            <div>
                              <div className="font-bold text-slate-900 leading-tight">
                                {order.clientName}
                              </div>
                              <div className="text-[11px] text-slate-600 font-medium mt-0.5">
                                {order.itemTitle}
                              </div>
                            </div>

                            {/* Gate Alerts (PRD Rules) */}
                            {isBlocked && (
                              <div className="p-2 bg-rose-50 border border-rose-200 rounded text-[10px] text-rose-900 space-y-1">
                                <div className="font-bold flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                                  <span>Produção Bloqueada:</span>
                                </div>
                                {!order.entryPaymentConfirmed && (
                                  <div className="text-rose-700 flex justify-between items-center gap-1">
                                    <span>• Aguarda sinal (50%)</span>
                                    {canGoToFinance && onGoToFinanceForPayment && (
                                      <button
                                        onClick={() => onGoToFinanceForPayment()}
                                        className="text-[9px] font-bold underline cursor-pointer text-rose-900 shrink-0"
                                      >
                                        Ir ao Financeiro
                                      </button>
                                    )}
                                  </div>
                                )}
                                {!order.artApproved && (
                                  <div className="text-rose-700 flex justify-between items-center gap-1">
                                    <span>• Aguarda aprovação da arte</span>
                                    {canApproveArt && onApproveArt && (
                                      <button
                                        onClick={() => openArtApprovalModal(order)}
                                        className="text-[9px] font-bold underline cursor-pointer text-rose-900 shrink-0"
                                      >
                                        Aprovar Arte
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Outsourced Partner Tag */}
                            {order.outsourcedPartner && (
                              <div className="text-[10px] bg-slate-50 border border-slate-200 p-1 rounded text-slate-600 truncate">
                                <strong>Parceiro:</strong> {order.outsourcedPartner}
                              </div>
                            )}

                            {/* Sizes & Total */}
                            <div className="bg-slate-50 p-1.5 rounded text-[10px] font-mono text-slate-600 flex justify-between">
                              <span>
                                Total: <strong className="text-blue-700 text-xs">{order.totalPieces} pçs</strong>
                              </span>
                              <span className="text-slate-500 truncate max-w-[95px]">
                                {order.fabricName.split(' ')[0]}
                              </span>
                            </div>

                            {/* Current Stage Deadline + Mini Progress Strip */}
                            {order.deadlineSummary && (
                              <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1.5">
                                {order.deadlineSummary.currentStageItem && (
                                  <div className="flex items-center justify-between gap-1 text-[10px]">
                                    <span className="text-slate-500 truncate">
                                      Prazo etapa:{' '}
                                      <strong className="font-mono text-slate-800">
                                        {formatDateBR(order.deadlineSummary.currentStageItem.plannedEndDate)}
                                      </strong>
                                    </span>
                                    {(() => {
                                      const sb = getStageDeadlineBadge(
                                        order.deadlineSummary.currentStageItem.status,
                                        order.deadlineSummary.currentStageItem.daysRemaining
                                      );
                                      return (
                                        <span className={`px-1.5 py-0.5 rounded border text-[9px] shrink-0 ${sb.badgeClass}`}>
                                          {sb.label}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                )}
                                {/* Mini 6-stage progress pills */}
                                <div className="flex items-center gap-1" title={`Progresso: ${order.deadlineSummary.completedStagesCount}/${order.deadlineSummary.totalApplicableStagesCount} etapas concluídas`}>
                                  {order.deadlineSummary.stages.map((st) => {
                                    const barColor =
                                      st.status === 'nao_aplicavel'
                                        ? 'bg-slate-200/60'
                                        : st.status === 'concluida_no_prazo'
                                          ? 'bg-emerald-500'
                                          : st.status === 'concluida_atrasada'
                                            ? 'bg-amber-500'
                                            : st.status === 'em_andamento_atrasada'
                                              ? 'bg-rose-500'
                                              : st.status === 'em_andamento_alerta'
                                                ? 'bg-amber-400'
                                                : st.status === 'em_andamento_no_prazo'
                                                  ? 'bg-blue-500'
                                                  : st.status === 'retrabalho'
                                                    ? 'bg-orange-500'
                                                    : 'bg-slate-200';
                                    return (
                                      <span
                                        key={st.stage}
                                        className={`h-1.5 flex-1 rounded-full ${barColor}`}
                                        title={`${st.label}: até ${formatDateBR(st.plannedEndDate)}`}
                                      />
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Delivery Date + Cronograma + Print */}
                            <div className="flex items-center justify-between text-[11px] pt-1 text-slate-500">
                              <span
                                className={`flex items-center gap-1 font-mono ${
                                  overdue ? 'text-rose-700 font-bold' : ''
                                }`}
                                title="Prazo prometido de entrega final"
                              >
                                <Clock className={`w-3 h-3 ${overdue ? 'text-rose-600' : 'text-slate-400'}`} />
                                {formatDateBR(order.targetDeliveryDate)}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setScheduleModalOrderId(order.id)}
                                  className="inline-flex items-center gap-1 px-1.5 py-1 text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition-colors cursor-pointer"
                                  title="Abrir Cronograma e Prazos por Etapa"
                                >
                                  <CalendarClock className="w-3 h-3" />
                                  <span>Prazos</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onOpenPrintTicket(order)}
                                  className="text-slate-500 hover:text-blue-600 p-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                                  title="Imprimir Ficha de Produção Fabril"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                                {canUseWhatsApp && onNotifyOrderWhatsApp && (
                                  <button
                                    type="button"
                                    onClick={() => onNotifyOrderWhatsApp(order)}
                                    className="text-emerald-600 hover:text-emerald-700 p-1 rounded hover:bg-emerald-50 transition-colors cursor-pointer"
                                    title={
                                      !order.artApproved
                                        ? 'Cobrar aprovação de arte via WhatsApp'
                                        : 'Notificar cliente sobre etapa atual via WhatsApp'
                                    }
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Action Buttons: Stage Advance & Edit */}
                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1">
                                {canAdvanceStage && prevStage && (
                                  <button
                                    onClick={() => onUpdateOrderStage(order.id, prevStage)}
                                    className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded cursor-pointer"
                                    title={
                                      order.stage === 'entregue'
                                        ? 'Reabrir OP entregue (Admin)'
                                        : 'Voltar etapa anterior'
                                    }
                                  >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {canEditThisOrder && (
                                  <button
                                    onClick={() => onEditOrder(order)}
                                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer"
                                    title="Editar Ordem"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    onClick={() => onDeleteOrder(order.id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer"
                                    title="Excluir Ordem (Admin)"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>

                              <div className="flex items-center gap-1">
                                {canAdvanceStage && order.stage === 'conferencia_qualidade' && (
                                  <button
                                    onClick={() => openReworkModal(order)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors cursor-pointer"
                                    title="Reprovar lote na inspeção e enviar para Retrabalho"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Retrabalho</span>
                                  </button>
                                )}
                                {canAdvanceStage && nextStage && (
                                  <button
                                    onClick={() => {
                                      if (order.stage === 'aguardando_liberacao' && isBlocked) {
                                        setGateModalOrder(order);
                                        return;
                                      }
                                      onUpdateOrderStage(order.id, nextStage);
                                    }}
                                    className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
                                      order.stage === 'aguardando_liberacao' && isBlocked
                                        ? 'bg-rose-100 text-rose-800 hover:bg-rose-200 cursor-pointer'
                                        : 'text-white bg-blue-600 hover:bg-blue-500 cursor-pointer'
                                    }`}
                                    title={
                                      order.stage === 'aguardando_liberacao' && isBlocked
                                        ? 'Clique para ver os requisitos do Gate A.3.2'
                                        : undefined
                                    }
                                  >
                                    <span>Avançar</span>
                                    <ChevronRight className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>

                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : viewMode === 'timeline' ? (
        /* Cronograma & Prazos por Etapa View */
        <div className="space-y-4">
          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-xs text-slate-400">
              Nenhuma Ordem de Produção encontrada com os filtros selecionados.
            </div>
          ) : (
            filteredOrders.map((order) => {
              const summary = order.deadlineSummary;
              const deliveryBadge = getDeliveryStatusBadge(
                summary?.deliveryStatus,
                summary?.daysToDelivery
              );
              const nextStage = getNextStage(order.stage);
              const isBlocked = !order.canStartProduction;

              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-xl border shadow-xs overflow-hidden ${
                    summary?.deliveryStatus === 'atrasada' || summary?.isCurrentStageOverdue
                      ? 'border-rose-300'
                      : summary?.isCurrentStageDueSoon || summary?.deliveryStatus === 'atencao'
                        ? 'border-amber-300'
                        : 'border-slate-200'
                  }`}
                >
                  {/* Card Top Bar */}
                  <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="flex items-start sm:items-center gap-3 flex-wrap min-w-0">
                      <span className="font-mono font-bold text-slate-900 text-xs px-2.5 py-1 rounded bg-white border border-slate-200">
                        {order.orderNumber || order.id}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-900 truncate">
                          {order.clientName}
                        </div>
                        <div className="text-xs text-slate-600 truncate">
                          {order.itemTitle} · <strong className="font-mono text-blue-700">{order.totalPieces} pçs</strong>
                          {order.outsourcedPartner ? ` · Facção: ${order.outsourcedPartner}` : ''}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap">
                      <div className="text-right">
                        <div className="text-[10px] text-slate-500 uppercase font-semibold">
                          Entrega Prometida
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-xs text-slate-900">
                            {formatDateBR(order.targetDeliveryDate)}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded border ${deliveryBadge.className}`}>
                            {deliveryBadge.label}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
                        <button
                          type="button"
                          onClick={() => setScheduleModalOrderId(order.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
                        >
                          <CalendarClock className="w-3.5 h-3.5" />
                          <span>{canManageSchedule ? 'Ajustar Prazos' : 'Ver Cronograma'}</span>
                        </button>
                        {canAdvanceStage && nextStage && (
                          <button
                            type="button"
                            onClick={() => {
                              if (order.stage === 'aguardando_liberacao' && isBlocked) {
                                setGateModalOrder(order);
                                return;
                              }
                              onUpdateOrderStage(order.id, nextStage);
                            }}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                              order.stage === 'aguardando_liberacao' && isBlocked
                                ? 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                                : 'bg-blue-600 text-white hover:bg-blue-500'
                            }`}
                          >
                            <span>Avançar</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenPrintTicket(order)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                          title="Imprimir Ficha Técnica com Prazos"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        {canUseWhatsApp && onNotifyOrderWhatsApp && (
                          <button
                            type="button"
                            onClick={() => onNotifyOrderWhatsApp(order)}
                            className="p-1.5 text-emerald-600 hover:text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg cursor-pointer"
                            title={
                              !order.artApproved
                                ? 'Cobrar aprovação de arte via WhatsApp'
                                : 'Notificar cliente sobre etapa atual via WhatsApp'
                            }
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 6-Stage Horizontal Timeline Grid */}
                  <div className="p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
                      {(summary?.stages || []).map((st) => {
                        const badge = getStageDeadlineBadge(st.status, st.daysRemaining);
                        return (
                          <div
                            key={st.stage}
                            className={`p-3 rounded-xl border text-xs flex flex-col justify-between gap-2 ${badge.cardBorder}`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-1">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${badge.dotClass}`} />
                                <span className={`text-[9px] px-1.5 py-0.5 rounded border leading-tight ${badge.badgeClass}`}>
                                  {badge.label}
                                </span>
                              </div>
                              <div className="font-bold text-slate-900 leading-snug pt-0.5">
                                {st.label}
                              </div>
                              <div className="text-[10px] text-slate-500 truncate" title={st.responsible || ''}>
                                {st.responsible || 'Equipe interna'}
                              </div>
                            </div>

                            {!st.skipped ? (
                              <div className="pt-2 border-t border-slate-200/70 space-y-0.5 text-[10px] font-mono">
                                <div className="flex items-center justify-between text-slate-600">
                                  <span>Previsto:</span>
                                  <strong className={st.status === 'em_andamento_atrasada' ? 'text-rose-700' : 'text-slate-900'}>
                                    {formatDateBR(st.plannedEndDate)}
                                  </strong>
                                </div>
                                <div className="flex items-center justify-between text-slate-500">
                                  <span>{st.actualEndDate ? 'Concluído:' : st.actualStartDate ? 'Início:' : 'Janela:'}</span>
                                  <span className={st.actualEndDate ? 'text-emerald-700 font-semibold' : ''}>
                                    {st.actualEndDate
                                      ? formatDateBR(st.actualEndDate)
                                      : st.actualStartDate
                                        ? formatDateBR(st.actualStartDate)
                                        : `${st.plannedDays}d`}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="pt-2 border-t border-slate-200/60 text-[10px] text-slate-400 italic">
                                Etapa pulada
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-3 px-4">Código OP</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Modelo</th>
                  <th className="py-3 px-4 text-center">Grade (Total)</th>
                  <th className="py-3 px-4">Etapa Operacional</th>
                  <th className="py-3 px-4">Financeiro</th>
                  <th className="py-3 px-4">Parceiro Terceirizado</th>
                  <th className="py-3 px-4">Entrega</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-400">
                      Nenhuma Ordem de Produção encontrada com os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => {
                    const nextStage = getNextStage(order.stage);
                    const isBlocked = !order.canStartProduction;
                    const overdue = isOrderOverdue(order);
                    const canEditThisOrder =
                      canCreateOrEdit && (order.stage !== 'entregue' || isAdmin);

                    return (
                      <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          {order.orderNumber || order.id}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{order.clientName}</div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          {order.itemTitle}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-blue-700">
                          {order.totalPieces} pçs
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-block px-2.5 py-1 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                            {getStageLabel(order.stage)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {(() => {
                            const finBadge = getFinancialStatusBadge(order.financialStatus);
                            return (
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${finBadge.bg}`}>
                                {finBadge.label}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {order.outsourcedPartner || 'Produção Interna'}
                        </td>
                        <td className="py-3 px-4 font-mono">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className={overdue ? 'text-rose-700 font-bold' : 'text-slate-700'}>
                                {formatDateBR(order.targetDeliveryDate)}
                              </span>
                              {(() => {
                                const db = getDeliveryStatusBadge(
                                  order.deadlineSummary?.deliveryStatus,
                                  order.deadlineSummary?.daysToDelivery
                                );
                                return (
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded border ${db.className}`}>
                                    {db.label}
                                  </span>
                                );
                              })()}
                            </div>
                            {order.deadlineSummary?.currentStageItem && (
                              <div className="text-[10px] text-slate-500">
                                Etapa até {formatDateBR(order.deadlineSummary.currentStageItem.plannedEndDate)}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setScheduleModalOrderId(order.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition-colors cursor-pointer"
                              title="Ver / Editar Cronograma e Prazos por Etapa"
                            >
                              <CalendarClock className="w-3 h-3" />
                              <span>Prazos</span>
                            </button>
                            <button
                              onClick={() => onOpenPrintTicket(order)}
                              className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors cursor-pointer"
                            >
                              Ficha
                            </button>
                            {canUseWhatsApp && onNotifyOrderWhatsApp && (
                              <button
                                type="button"
                                onClick={() => onNotifyOrderWhatsApp(order)}
                                className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors cursor-pointer"
                                title={
                                  !order.artApproved
                                    ? 'Cobrar aprovação de arte via WhatsApp'
                                    : 'Notificar cliente sobre etapa atual via WhatsApp'
                                }
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canApproveArt && !order.artApproved && onApproveArt && (
                              <button
                                onClick={() => openArtApprovalModal(order)}
                                className="px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition-colors cursor-pointer"
                              >
                                Aprovar Arte
                              </button>
                            )}
                            {canAdvanceStage && order.stage === 'conferencia_qualidade' && (
                              <button
                                onClick={() => openReworkModal(order)}
                                className="px-2 py-1 text-[11px] font-semibold rounded bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors cursor-pointer"
                              >
                                Retrabalho
                              </button>
                            )}
                            {canAdvanceStage && nextStage && (
                              <button
                                onClick={() => {
                                  if (order.stage === 'aguardando_liberacao' && isBlocked) {
                                    setGateModalOrder(order);
                                    return;
                                  }
                                  onUpdateOrderStage(order.id, nextStage);
                                }}
                                className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer ${
                                  order.stage === 'aguardando_liberacao' && isBlocked
                                    ? 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                                    : 'text-white bg-blue-600 hover:bg-blue-500'
                                }`}
                                title={
                                  order.stage === 'aguardando_liberacao' && isBlocked
                                    ? 'Ver pendências do Gate A.3.2'
                                    : undefined
                                }
                              >
                                Avançar
                              </button>
                            )}
                            {canEditThisOrder && (
                              <button
                                onClick={() => onEditOrder(order)}
                                className="p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                                title="Editar Ordem"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => onDeleteOrder(order.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                                title="Excluir Ordem (Admin)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Bloqueio do Portão Fabril (Gate A.3.2 do PRD) */}
      {gateModalOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                <div>
                  <h3 className="text-base font-bold">Portão Fabril Bloqueado (Gate A.3.2)</h3>
                  <p className="text-[11px] text-slate-400">
                    {gateModalOrder.orderNumber || gateModalOrder.id} · {gateModalOrder.clientName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setGateModalOrder(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 leading-relaxed">
                <strong>Regra Inegociável do PRD v1.6:</strong> Uma Ordem de Produção{' '}
                <strong>não pode avançar para a mesa de corte</strong> enquanto os dois requisitos abaixo não forem
                formalmente cumpridos:
              </div>

              {/* Checklist dos 2 Gates */}
              <div className="space-y-3">
                {/* Gate 1: Sinal 50% */}
                <div
                  className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 ${
                    gateModalOrder.entryPaymentConfirmed
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-bold">
                      {gateModalOrder.entryPaymentConfirmed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                      )}
                      <span>1. Confirmação do Sinal de 50%</span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      {gateModalOrder.entryPaymentConfirmed
                        ? 'Sinal liquidado com comprovante autenticado.'
                        : 'Aguardando quitação do sinal no Financeiro com registro de comprovante bancário e evidência auditável.'}
                    </p>
                  </div>
                  {!gateModalOrder.entryPaymentConfirmed && canGoToFinance && onGoToFinanceForPayment && (
                    <button
                      onClick={() => {
                        setGateModalOrder(null);
                        onGoToFinanceForPayment();
                      }}
                      className="px-2.5 py-1 bg-amber-600 text-white font-semibold rounded text-[11px] hover:bg-amber-500 transition-colors shrink-0 cursor-pointer"
                    >
                      Ir ao Financeiro
                    </button>
                  )}
                </div>

                {/* Gate 2: Arte Aprovada */}
                <div
                  className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 ${
                    gateModalOrder.artApproved
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-bold">
                      {gateModalOrder.artApproved ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                      )}
                      <span>
                        2. Aprovação Formal da Arte / Layout
                        {gateModalOrder.artVersionNumber ? ` (Arte v${gateModalOrder.artVersionNumber})` : ''}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      {gateModalOrder.artApproved
                        ? `Aprovada por ${gateModalOrder.artApprovedBy || 'Cliente'}.`
                        : gateModalOrder.artStatus === 'revisao_solicitada'
                        ? `Revisão de arte solicitada: ${gateModalOrder.artRevisionNotes || 'aguardando nova versão do layout.'}`
                        : 'A arte final precisa ser formalmente aprovada pelo cliente antes do corte.'}
                    </p>
                    {gateModalOrder.artFileUrl && gateModalOrder.artFileUrl.startsWith('data:image/') && (
                      <div className="mt-2">
                        <img
                          src={gateModalOrder.artFileUrl}
                          alt="Layout da arte vinculada"
                          className="max-h-24 rounded border border-slate-200 bg-white p-1 object-contain"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {!gateModalOrder.artApproved && canApproveArt && onApproveArt && (
                      <button
                        onClick={() => {
                          const target = gateModalOrder;
                          setGateModalOrder(null);
                          openArtApprovalModal(target);
                        }}
                        className="px-2.5 py-1 bg-blue-600 text-white font-semibold rounded text-[11px] hover:bg-blue-500 transition-colors cursor-pointer"
                      >
                        Aprovar Arte
                      </button>
                    )}
                    {gateModalOrder.stage === 'aguardando_liberacao' &&
                      canApproveArt &&
                      onRequestArtRevision && (
                        <button
                          onClick={() => {
                            const target = gateModalOrder;
                            setGateModalOrder(null);
                            setArtRevisionModalOrder(target);
                            setArtRevisionReason('');
                          }}
                          className="px-2.5 py-1 bg-white text-amber-800 border border-amber-300 font-semibold rounded text-[11px] hover:bg-amber-50 transition-colors cursor-pointer"
                        >
                          Pedir Revisão
                        </button>
                      )}
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100">
                Assim que ambos os requisitos forem satisfeitos, o botão de avanço para a etapa{' '}
                <strong>1. Corte & Enfesto</strong> será liberado automaticamente.
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setGateModalOrder(null)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Aprovação Formal de Arte (Gate A.3.2) */}
      {artApprovalModalOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <FileCheck className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold">Registrar Aprovação Formal da Arte</h3>
                  <p className="text-[11px] text-slate-400">
                    {artApprovalModalOrder.orderNumber || artApprovalModalOrder.id} ·{' '}
                    {artApprovalModalOrder.clientName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setArtApprovalModalOrder(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitArtApproval} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Responsável pela Aprovação (Cliente / Contato) *
                </label>
                <input
                  type="text"
                  required
                  value={artApproverName}
                  onChange={(e) => setArtApproverName(e.target.value)}
                  placeholder="Ex: Juliana Mendes (WhatsApp)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Observações / Referência do Layout (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={artApprovalNotes}
                  onChange={(e) => setArtApprovalNotes(e.target.value)}
                  placeholder="Ex: Arte v2 aprovada via WhatsApp — bordado peito esquerdo 8cm"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setArtApprovalModalOrder(null)}
                  disabled={isProcessingModal}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isProcessingModal}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg cursor-pointer disabled:opacity-60"
                >
                  {isProcessingModal ? 'Registrando...' : 'Confirmar Aprovação da Arte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Registro de Retrabalho (Controle de Qualidade) */}
      {reworkModalOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <RotateCcw className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold">Enviar Lote para Retrabalho</h3>
                  <p className="text-[11px] text-slate-400">
                    {reworkModalOrder.orderNumber || reworkModalOrder.id} · {reworkModalOrder.clientName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReworkModalOrder(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitRework} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
                Descreva a não conformidade encontrada na inspeção de qualidade. O motivo será anexado à ficha
                técnica da OP e registrado na trilha de auditoria.
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Motivo / Não Conformidade Detectada *
                </label>
                <textarea
                  rows={3}
                  required
                  value={reworkReason}
                  onChange={(e) => setReworkReason(e.target.value)}
                  placeholder="Ex: 4 unidades tamanho G com travete desalinhado no bolso frontal."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReworkModalOrder(null)}
                  disabled={isProcessingModal}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isProcessingModal}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg cursor-pointer disabled:opacity-60"
                >
                  {isProcessingModal ? 'Enviando...' : 'Enviar para Retrabalho'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Solicitação de Revisão de Arte a partir do PCP */}
      {artRevisionModalOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <RotateCcw className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold">Solicitar Revisão da Arte</h3>
                  <p className="text-[11px] text-slate-400">
                    {artRevisionModalOrder.orderNumber || artRevisionModalOrder.id} ·{' '}
                    {artRevisionModalOrder.clientName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setArtRevisionModalOrder(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitOrderArtRevision} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
                A OP permanecerá retida em <strong>Aguardando Liberação</strong> (Gate A.3.2) e a proposta
                comercial vinculada será notificada como <em>Revisão de Arte Solicitada</em>.
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Ajustes Solicitados na Arte *
                </label>
                <textarea
                  rows={3}
                  required
                  minLength={5}
                  value={artRevisionReason}
                  onChange={(e) => setArtRevisionReason(e.target.value)}
                  placeholder="Ex: Ajustar posição do bordado no bolso esquerdo para 2cm abaixo da costura."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setArtRevisionModalOrder(null)}
                  disabled={isProcessingModal}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isProcessingModal || artRevisionReason.trim().length < 5}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg cursor-pointer disabled:opacity-60"
                >
                  {isProcessingModal ? 'Registrando...' : 'Registrar Revisão de Arte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Interativo de Cronograma & Prazos por Etapa */}
      {scheduleModalOrder && onUpdateOrderSchedule && (
        <OrderScheduleModal
          order={scheduleModalOrder}
          onClose={() => setScheduleModalOrderId(null)}
          onSaveSchedule={onUpdateOrderSchedule}
        />
      )}

    </div>
  );
};
