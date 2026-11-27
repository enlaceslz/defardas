import React, { useEffect, useState } from 'react';
import {
  X,
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCcw,
  RefreshCw,
  Save,
  ShieldAlert,
  UserCheck,
  SkipForward,
} from 'lucide-react';
import {
  EvaluatedStageScheduleItem,
  OrderDeliveryStatus,
  ProductionOrder,
  StageDeadlineStatus,
} from '../types/erp';
import { formatDateBR, getStageLabel } from '../utils/formatters';
import { DateInputBR } from './FormInputs';
import { useAuth } from '../api/authContext';

export function formatDaysDeltaLabel(daysDelta: number, context: 'delivery' | 'stage' = 'delivery'): string {
  if (daysDelta < 0) {
    const abs = Math.abs(daysDelta);
    return context === 'stage'
      ? `Atrasada ${abs}d`
      : `Atrasada há ${abs} ${abs === 1 ? 'dia' : 'dias'}`;
  }
  if (daysDelta === 0) {
    return 'Vence hoje';
  }
  return context === 'stage'
    ? `Faltam ${daysDelta}d`
    : `Faltam ${daysDelta} ${daysDelta === 1 ? 'dia' : 'dias'}`;
}

export function getDeliveryStatusBadge(
  status?: OrderDeliveryStatus,
  daysToDelivery?: number
): { label: string; className: string } {
  switch (status) {
    case 'entregue_no_prazo':
      return {
        label: 'Entregue no prazo',
        className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
    case 'entregue_atrasada':
      return {
        label: 'Entregue com atraso',
        className: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'atrasada':
      return {
        label:
          daysToDelivery !== undefined
            ? formatDaysDeltaLabel(daysToDelivery, 'delivery')
            : 'Prazo vencido',
        className: 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
      };
    case 'critica_hoje':
      return {
        label: 'Entrega HOJE',
        className: 'bg-rose-50 text-rose-800 border-rose-300 font-bold',
      };
    case 'atencao':
      return {
        label:
          daysToDelivery !== undefined
            ? formatDaysDeltaLabel(daysToDelivery, 'delivery')
            : 'Vence em breve',
        className: 'bg-amber-100 text-amber-900 border-amber-300 font-semibold',
      };
    default:
      return {
        label:
          daysToDelivery !== undefined
            ? formatDaysDeltaLabel(daysToDelivery, 'delivery')
            : 'No prazo',
        className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
  }
}

export function getStageDeadlineBadge(
  status: StageDeadlineStatus,
  daysRemaining: number
): { label: string; badgeClass: string; dotClass: string; cardBorder: string } {
  switch (status) {
    case 'concluida_no_prazo':
      return {
        label: 'Concluída no prazo',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        dotClass: 'bg-emerald-500',
        cardBorder: 'border-emerald-200/90 bg-emerald-50/20',
      };
    case 'concluida_atrasada':
      return {
        label: `Concluída (+${Math.abs(daysRemaining)}d)`,
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        dotClass: 'bg-amber-500',
        cardBorder: 'border-amber-200/90 bg-amber-50/20',
      };
    case 'em_andamento_atrasada':
      return {
        label: `Atrasada ${Math.abs(daysRemaining)}d`,
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
        dotClass: 'bg-rose-600',
        cardBorder: 'border-rose-300 bg-rose-50/35 ring-1 ring-rose-200',
      };
    case 'em_andamento_alerta':
      return {
        label: daysRemaining === 0 ? 'Vence HOJE' : `Vence em ${daysRemaining}d`,
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
        dotClass: 'bg-amber-500',
        cardBorder: 'border-amber-300 bg-amber-50/30 ring-1 ring-amber-200',
      };
    case 'em_andamento_no_prazo':
      return {
        label: `Em andamento (${daysRemaining}d rest.)`,
        badgeClass: 'bg-blue-50 text-blue-800 border-blue-200 font-semibold',
        dotClass: 'bg-blue-600',
        cardBorder: 'border-blue-300 bg-blue-50/25 ring-1 ring-blue-100',
      };
    case 'retrabalho':
      return {
        label: 'Em Retrabalho',
        badgeClass: 'bg-orange-100 text-orange-900 border-orange-300 font-bold',
        dotClass: 'bg-orange-500',
        cardBorder: 'border-orange-300 bg-orange-50/30 ring-1 ring-orange-200',
      };
    case 'nao_aplicavel':
      return {
        label: 'Não aplicável',
        badgeClass: 'bg-slate-100 text-slate-500 border-slate-200',
        dotClass: 'bg-slate-300',
        cardBorder: 'border-slate-200 bg-slate-50/50 opacity-70',
      };
    default:
      return {
        label: 'Aguardando etapa',
        badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
        dotClass: 'bg-slate-300',
        cardBorder: 'border-slate-200 bg-white',
      };
  }
}

interface EditableStageRow {
  stage: string;
  label: string;
  plannedStartDate: string;
  plannedEndDate: string;
  responsible: string;
  notes: string;
  skipped: boolean;
  actualStartDate?: string;
  actualEndDate?: string;
  status: StageDeadlineStatus;
  daysRemaining: number;
  isCurrent: boolean;
  isCompleted: boolean;
}

interface OrderScheduleModalProps {
  order: ProductionOrder;
  onClose: () => void;
  onSaveSchedule: (
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
}

export const OrderScheduleModal: React.FC<OrderScheduleModalProps> = ({
  order,
  onClose,
  onSaveSchedule,
}) => {
  const { user } = useAuth();
  const role = user?.role || '';
  const isAdmin = role === 'admin';
  const canEditSchedule =
    ['admin', 'pcp_producao', 'gerente_comercial'].includes(role) &&
    (order.stage !== 'entregue' || isAdmin);

  const evaluatedStages: EvaluatedStageScheduleItem[] =
    order.deadlineSummary?.stages ||
    (order.stageSchedule || []).map((s) => ({
      ...s,
      status: s.skipped ? 'nao_aplicavel' : 'pendente',
      daysRemaining: 0,
      isCurrent: s.stage === order.stage,
      isCompleted: false,
    }));

  const [targetDeliveryDate, setTargetDeliveryDate] = useState(order.targetDeliveryDate);
  const [syncTargetDelivery, setSyncTargetDelivery] = useState(false);
  const [rows, setRows] = useState<EditableStageRow[]>(() =>
    evaluatedStages.map((s) => ({
      stage: s.stage,
      label: s.label,
      plannedStartDate: s.plannedStartDate,
      plannedEndDate: s.plannedEndDate,
      responsible: s.responsible || '',
      notes: s.notes || '',
      skipped: Boolean(s.skipped),
      actualStartDate: s.actualStartDate,
      actualEndDate: s.actualEndDate,
      status: s.status,
      daysRemaining: s.daysRemaining,
      isCurrent: s.isCurrent,
      isCompleted: s.isCompleted,
    }))
  );
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Sincronizar quando a OP for atualizada pelo servidor
  useEffect(() => {
    setTargetDeliveryDate(order.targetDeliveryDate);
    const updatedStages = order.deadlineSummary?.stages || [];
    if (updatedStages.length > 0) {
      setRows(
        updatedStages.map((s) => ({
          stage: s.stage,
          label: s.label,
          plannedStartDate: s.plannedStartDate,
          plannedEndDate: s.plannedEndDate,
          responsible: s.responsible || '',
          notes: s.notes || '',
          skipped: Boolean(s.skipped),
          actualStartDate: s.actualStartDate,
          actualEndDate: s.actualEndDate,
          status: s.status,
          daysRemaining: s.daysRemaining,
          isCurrent: s.isCurrent,
          isCompleted: s.isCompleted,
        }))
      );
    }
  }, [order]);

  const updateRow = (stage: string, patch: Partial<EditableStageRow>) => {
    setRows((prev) => prev.map((r) => (r.stage === stage ? { ...r, ...patch } : r)));
  };

  const handleRecalculate = async () => {
    if (!canEditSchedule || isSaving) return;
    setFormError('');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDeliveryDate)) {
      setFormError('Informe uma data prometida de entrega válida antes de recalcular.');
      return;
    }
    setIsSaving(true);
    try {
      await onSaveSchedule(order.id, {
        targetDeliveryDate,
        recalculateProportional: true,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditSchedule || isSaving) return;
    setFormError('');

    for (const row of rows) {
      if (row.skipped) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.plannedStartDate) || !/^\d{4}-\d{2}-\d{2}$/.test(row.plannedEndDate)) {
        setFormError(`Informe datas válidas (início e prazo final) para a etapa "${row.label}".`);
        return;
      }
      if (row.plannedEndDate < row.plannedStartDate) {
        setFormError(`Na etapa "${row.label}", o prazo final não pode ser anterior à data de início.`);
        return;
      }
    }

    setIsSaving(true);
    try {
      const ok = await onSaveSchedule(order.id, {
        targetDeliveryDate,
        syncTargetDelivery,
        stages: rows.map((r) => ({
          stage: r.stage,
          plannedStartDate: r.plannedStartDate,
          plannedEndDate: r.plannedEndDate,
          responsible: r.responsible.trim() || undefined,
          notes: r.notes.trim() || undefined,
          skipped: r.stage === 'bordado_silk' ? r.skipped : false,
        })),
      });
      if (ok) {
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const deliveryBadge = getDeliveryStatusBadge(
    order.deadlineSummary?.deliveryStatus,
    order.deadlineSummary?.daysToDelivery
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#111113] text-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#C8102E]/20 border border-[#C8102E]/35 flex items-center justify-center shrink-0">
              <CalendarClock className="w-5 h-5 text-[#E3263E]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold truncate">
                  Cronograma de Produção & Prazos por Etapa
                </h3>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-white/10 text-slate-100 border border-white/15">
                  {order.orderNumber || order.id}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                {order.clientName} · {order.itemTitle} ({order.totalPieces} pçs)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
            aria-label="Fechar cronograma"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top SLA Summary Bar */}
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 block">
                Etapa Atual
              </span>
              <span className="font-bold text-slate-900">{getStageLabel(order.stage)}</span>
            </div>
            <div className="h-7 w-px bg-slate-200" />
            <div>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 block">
                Progresso das Etapas
              </span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#C8102E] rounded-full transition-all"
                    style={{ width: `${order.deadlineSummary?.progressPercent ?? 0}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-slate-800">
                  {order.deadlineSummary?.completedStagesCount ?? 0}/
                  {order.deadlineSummary?.totalApplicableStagesCount ?? 6} ({order.deadlineSummary?.progressPercent ?? 0}%)
                </span>
              </div>
            </div>
            <div className="h-7 w-px bg-slate-200" />
            <div>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 block">
                Entrega Prometida
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-slate-900">
                  {formatDateBR(order.targetDeliveryDate)}
                </span>
                <span className={`px-2 py-0.5 rounded border text-[10px] ${deliveryBadge.className}`}>
                  {deliveryBadge.label}
                </span>
              </div>
            </div>
          </div>

          {!order.canStartProduction && order.stage === 'aguardando_liberacao' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-semibold">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
              Gate A.3.2 ativo ({!order.entryPaymentConfirmed ? 'Sinal' : ''}{!order.entryPaymentConfirmed && !order.artApproved ? ' + ' : ''}{!order.artApproved ? 'Arte' : ''})
            </span>
          )}
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Global Delivery Date & Auto-Distribute Toolbar */}
          {canEditSchedule && (
            <div className="p-4 bg-blue-50/60 border border-blue-200/80 rounded-xl flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="w-44">
                  <label className="block text-[11px] font-bold text-blue-950 mb-1">
                    Data Final de Entrega (SLA)
                  </label>
                  <DateInputBR
                    value={targetDeliveryDate}
                    onChange={(iso) => setTargetDeliveryDate(iso)}
                    className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-mono text-slate-900"
                  />
                </div>
                <label className="inline-flex items-center gap-2 text-[11px] text-blue-900 pb-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={syncTargetDelivery}
                    onChange={(e) => setSyncTargetDelivery(e.target.checked)}
                    className="rounded border-blue-400 text-blue-600"
                  />
                  <span>Sincronizar entrega final com o prazo da etapa Expedição</span>
                </label>
              </div>

              <button
                type="button"
                disabled={isSaving}
                onClick={handleRecalculate}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-800 bg-white hover:bg-blue-100 border border-blue-300 rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
                <span>Recalcular Prazos Proporcionais</span>
              </button>
            </div>
          )}

          {/* Stage-by-Stage Timeline Cards */}
          <div className="space-y-3">
            {rows.map((row, idx) => {
              const badge = getStageDeadlineBadge(row.status, row.daysRemaining);
              const isPastTarget = !row.skipped && row.plannedEndDate > targetDeliveryDate;

              return (
                <div
                  key={row.stage}
                  className={`p-4 rounded-xl border transition-all ${badge.cardBorder}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200/70">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${badge.dotClass}`} />
                      <span className="font-bold text-slate-900 text-sm">{row.label}</span>
                      {row.isCurrent && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#111113] text-white">
                          Etapa Atual
                        </span>
                      )}
                      {row.stage === 'bordado_silk' && canEditSchedule && !row.isCompleted && (
                        <label className="inline-flex items-center gap-1 text-[11px] text-slate-600 ml-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={row.skipped}
                            onChange={(e) => updateRow(row.stage, { skipped: e.target.checked })}
                            className="rounded border-slate-300"
                          />
                          <SkipForward className="w-3 h-3 text-slate-400" />
                          <span>Sem personalização (pular)</span>
                        </label>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {isPastTarget && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                          Ultrapassa entrega final!
                        </span>
                      )}
                      <span className={`text-[10px] px-2.5 py-0.5 rounded border ${badge.badgeClass}`}>
                        {badge.label}
                      </span>
                    </div>
                  </div>

                  {!row.skipped ? (
                    <div className="pt-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                      {/* Planned Start */}
                      <div className="md:col-span-3">
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                          Início Previsto
                        </label>
                        {canEditSchedule ? (
                          <DateInputBR
                            value={row.plannedStartDate}
                            onChange={(iso) => updateRow(row.stage, { plannedStartDate: iso })}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800"
                          />
                        ) : (
                          <div className="font-mono font-semibold text-slate-800 py-1.5">
                            {formatDateBR(row.plannedStartDate)}
                          </div>
                        )}
                      </div>

                      {/* Planned End (Deadline) */}
                      <div className="md:col-span-3">
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                          Prazo Limite da Etapa
                        </label>
                        {canEditSchedule ? (
                          <DateInputBR
                            value={row.plannedEndDate}
                            onChange={(iso) => updateRow(row.stage, { plannedEndDate: iso })}
                            className={`w-full px-2.5 py-1.5 bg-white border rounded-lg text-xs font-mono font-semibold ${
                              row.status === 'em_andamento_atrasada' || isPastTarget
                                ? 'border-rose-400 text-rose-800'
                                : 'border-slate-300 text-slate-900'
                            }`}
                          />
                        ) : (
                          <div className="font-mono font-bold text-slate-900 py-1.5">
                            {formatDateBR(row.plannedEndDate)}
                          </div>
                        )}
                      </div>

                      {/* Responsible */}
                      <div className="md:col-span-3">
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                          <UserCheck className="w-3 h-3 text-slate-400" />
                          <span>Setor / Parceiro</span>
                        </label>
                        {canEditSchedule ? (
                          <input
                            type="text"
                            value={row.responsible}
                            onChange={(e) => updateRow(row.stage, { responsible: e.target.value })}
                            placeholder="Equipe ou facção"
                            maxLength={120}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800"
                          />
                        ) : (
                          <div className="text-slate-700 font-medium py-1.5 truncate">
                            {row.responsible || 'Equipe interna'}
                          </div>
                        )}
                      </div>

                      {/* Actual Dates / Tracking */}
                      <div className="md:col-span-3">
                        <div className="p-2 rounded-lg bg-white/80 border border-slate-200/80 text-[11px] space-y-0.5">
                          <div className="flex items-center justify-between text-slate-500">
                            <span>Início Real:</span>
                            <span className="font-mono font-semibold text-slate-800">
                              {row.actualStartDate ? formatDateBR(row.actualStartDate) : '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-slate-500">
                            <span>Concluído em:</span>
                            <span className="font-mono font-semibold text-emerald-700">
                              {row.actualEndDate ? formatDateBR(row.actualEndDate) : 'Em aberto'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Optional stage notes */}
                      {(canEditSchedule || row.notes) && (
                        <div className="md:col-span-12">
                          {canEditSchedule ? (
                            <input
                              type="text"
                              value={row.notes}
                              onChange={(e) => updateRow(row.stage, { notes: e.target.value })}
                              placeholder={`Observação / risco da etapa ${idx}... (opcional)`}
                              maxLength={300}
                              className="w-full px-2.5 py-1.5 bg-white/90 border border-slate-200 rounded-lg text-[11px] text-slate-700"
                            />
                          ) : (
                            <div className="text-[11px] text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded border border-slate-200">
                              <strong>Nota:</strong> {row.notes}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="pt-2 text-[11px] text-slate-500 italic">
                      Esta OP não possui personalização de bordado/silk prevista — etapa marcada como não aplicável.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            {order.stage === 'retrabalho' ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 text-orange-600" />
                <span className="text-orange-800 font-semibold">
                  OP em Retrabalho — acompanhe o impacto na data final de entrega.
                </span>
              </>
            ) : order.stage === 'entregue' ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-800 font-semibold">
                  OP entregue em {order.completionDate ? formatDateBR(order.completionDate) : '—'}.
                </span>
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                <span>
                  Datas reais são preenchidas automaticamente ao avançar cada etapa no Kanban.
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Fechar
            </button>
            {canEditSchedule && (
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSubmit}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#C8102E] hover:bg-[#A60D26] transition-colors rounded-lg shadow-xs cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Salvando...' : 'Salvar Cronograma'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
