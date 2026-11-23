/**
 * DE FARDAS ERP — Serviço de Cronograma Fabril por Etapa & Acompanhamento de Prazos (SLA)
 *
 * Responsabilidades:
 * 1. Gerar cronograma estruturado por etapa (Liberação -> Corte -> Bordado/Silk -> Costura -> Qualidade -> Expedição)
 *    totalmente alinhado à data prometida de entrega (targetDeliveryDate).
 * 2. Registrar automaticamente datas reais de início e conclusão ao avançar etapas no PCP.
 * 3. Calcular de forma autoritativa o status de prazo (SLA) de cada etapa e da entrega final.
 */
import { ProductionOrderEntity, StageScheduleItem } from '../types/db';

export type CorePipelineStage =
  | 'aguardando_liberacao'
  | 'corte'
  | 'bordado_silk'
  | 'costura'
  | 'conferencia_qualidade'
  | 'expedicao';

export type StageDeadlineStatus =
  | 'concluida_no_prazo'
  | 'concluida_atrasada'
  | 'em_andamento_no_prazo'
  | 'em_andamento_alerta'
  | 'em_andamento_atrasada'
  | 'retrabalho'
  | 'pendente'
  | 'nao_aplicavel';

export type OrderDeliveryStatus =
  | 'entregue_no_prazo'
  | 'entregue_atrasada'
  | 'atrasada'
  | 'critica_hoje'
  | 'atencao'
  | 'no_prazo';

export interface EvaluatedStageScheduleItem extends StageScheduleItem {
  status: StageDeadlineStatus;
  daysRemaining: number; // > 0 faltam X dias, 0 vence hoje, < 0 atrasado X dias
  isCurrent: boolean;
  isCompleted: boolean;
}

export interface OrderDeadlineSummary {
  asOfDate: string;
  deliveryStatus: OrderDeliveryStatus;
  daysToDelivery: number;
  targetDeliveryDate: string;
  progressPercent: number;
  completedStagesCount: number;
  totalApplicableStagesCount: number;
  delayedStagesCount: number;
  isCurrentStageOverdue: boolean;
  isCurrentStageDueSoon: boolean;
  currentStageItem: EvaluatedStageScheduleItem | null;
  stages: EvaluatedStageScheduleItem[];
}

export const CORE_PIPELINE_STAGES: {
  stage: CorePipelineStage;
  label: string;
  shortLabel: string;
  orderIndex: number;
  weight: number;
  minDays: number;
}[] = [
  {
    stage: 'aguardando_liberacao',
    label: '0. Liberação (Sinal 50% + Arte)',
    shortLabel: 'Liberação',
    orderIndex: 0,
    weight: 0.1,
    minDays: 1,
  },
  {
    stage: 'corte',
    label: '1. Corte & Enfesto',
    shortLabel: 'Corte',
    orderIndex: 1,
    weight: 0.15,
    minDays: 1,
  },
  {
    stage: 'bordado_silk',
    label: '2. Bordado & Silk-Screen',
    shortLabel: 'Bordado/Silk',
    orderIndex: 2,
    weight: 0.2,
    minDays: 1,
  },
  {
    stage: 'costura',
    label: '3. Costura & Montagem',
    shortLabel: 'Costura',
    orderIndex: 3,
    weight: 0.35,
    minDays: 2,
  },
  {
    stage: 'conferencia_qualidade',
    label: '4. Inspeção de Qualidade',
    shortLabel: 'Qualidade',
    orderIndex: 4,
    weight: 0.1,
    minDays: 1,
  },
  {
    stage: 'expedicao',
    label: '5. Embalagem & Expedição',
    shortLabel: 'Expedição',
    orderIndex: 5,
    weight: 0.1,
    minDays: 1,
  },
];

export const STAGE_INDEX_MAP: Record<string, number> = {
  aguardando_liberacao: 0,
  corte: 1,
  bordado_silk: 2,
  costura: 3,
  conferencia_qualidade: 4,
  retrabalho: 4, // Ocorre a partir da conferência de qualidade
  expedicao: 5,
  entregue: 6,
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function isValidIsoDate(val: unknown): val is string {
  if (typeof val !== 'string' || !ISO_DATE_RE.test(val.trim())) return false;
  const d = new Date(`${val.trim()}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(val.trim());
}

export function diffDaysISO(fromISO: string, toISO: string): number {
  const fromMs = Date.parse(`${fromISO}T12:00:00Z`);
  const toMs = Date.parse(`${toISO}T12:00:00Z`);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return 0;
  return Math.round((toMs - fromMs) / 86400000);
}

export function addDaysISO(baseISO: string, days: number): string {
  const baseMs = Date.parse(`${baseISO}T12:00:00Z`);
  if (Number.isNaN(baseMs)) return getTodayISO();
  return new Date(baseMs + days * 86400000).toISOString().split('T')[0];
}

function resolveDefaultResponsible(
  stage: CorePipelineStage,
  order: Pick<ProductionOrderEntity, 'assignedTeam' | 'outsourcedPartner' | 'customizations'>
): string {
  switch (stage) {
    case 'aguardando_liberacao':
      return 'Comercial / Financeiro (Gate A.3.2)';
    case 'corte':
      return order.assignedTeam || 'Mesa de Corte DE FARDAS';
    case 'bordado_silk': {
      const custPartner = Array.isArray(order.customizations)
        ? order.customizations.find((c: any) => c?.partnerName)?.partnerName
        : undefined;
      return custPartner || 'Parceiro de Personalização';
    }
    case 'costura':
      return order.outsourcedPartner || 'Produção Interna DE FARDAS';
    case 'conferencia_qualidade':
      return 'Controle de Qualidade DE FARDAS';
    case 'expedicao':
      return 'Expedição & Logística DE FARDAS';
  }
}

/**
 * Gera um cronograma proporcional padrão do início (creationDate) até targetDeliveryDate.
 * Garante que a última etapa aplicável encerre exatamente em targetDeliveryDate.
 */
export function buildDefaultStageSchedule(
  order: Pick<
    ProductionOrderEntity,
    | 'creationDate'
    | 'targetDeliveryDate'
    | 'completionDate'
    | 'stage'
    | 'assignedTeam'
    | 'outsourcedPartner'
    | 'customizations'
  >,
  todayISO: string = getTodayISO()
): StageScheduleItem[] {
  const startISO = isValidIsoDate(order.creationDate) ? order.creationDate : todayISO;
  const targetISO = isValidIsoDate(order.targetDeliveryDate)
    ? order.targetDeliveryDate
    : addDaysISO(startISO, 15);

  const hasCustomizations =
    (Array.isArray(order.customizations) && order.customizations.length > 0) ||
    order.stage === 'bordado_silk';

  const activeDefs = CORE_PIPELINE_STAGES.filter(
    (def) => def.stage !== 'bordado_silk' || hasCustomizations
  );

  const rawSpanDays = Math.max(1, diffDaysISO(startISO, targetISO));
  const totalWeight = activeDefs.reduce((s, d) => s + d.weight, 0) || 1;

  // Distribuir dias inteiros proporcionalmente garantindo soma exata === rawSpanDays
  const rawAllocations = activeDefs.map((def) => {
    const exact = (def.weight / totalWeight) * rawSpanDays;
    return {
      stage: def.stage,
      exact,
      days: Math.max(rawSpanDays >= activeDefs.length ? 1 : 0, Math.floor(exact)),
      frac: exact - Math.floor(exact),
    };
  });

  let allocatedSum = rawAllocations.reduce((s, a) => s + a.days, 0);
  if (allocatedSum < rawSpanDays) {
    const byFrac = [...rawAllocations].sort((a, b) => b.frac - a.frac);
    let idx = 0;
    while (allocatedSum < rawSpanDays) {
      byFrac[idx % byFrac.length].days += 1;
      allocatedSum += 1;
      idx += 1;
    }
  } else if (allocatedSum > rawSpanDays) {
    // Reduzir dos maiores primeiro sem zerar quando possível
    const byLargest = [...rawAllocations].sort((a, b) => b.days - a.days);
    let guard = 0;
    while (allocatedSum > rawSpanDays && guard < 100) {
      for (const item of byLargest) {
        if (allocatedSum <= rawSpanDays) break;
        if (item.days > 1) {
          item.days -= 1;
          allocatedSum -= 1;
        }
      }
      if (allocatedSum > rawSpanDays) {
        for (const item of byLargest) {
          if (allocatedSum <= rawSpanDays) break;
          if (item.days > 0) {
            item.days -= 1;
            allocatedSum -= 1;
          }
        }
      }
      guard += 1;
    }
  }

  const daysByStage = new Map<CorePipelineStage, number>(
    rawAllocations.map((a) => [a.stage, a.days])
  );

  const currentStageIdx = STAGE_INDEX_MAP[order.stage] ?? 0;
  let cursorDate = startISO;
  let lastActiveIndex = activeDefs.length - 1;
  let seenActive = 0;

  return CORE_PIPELINE_STAGES.map((def) => {
    const isSkipped = def.stage === 'bordado_silk' && !hasCustomizations;
    const plannedStartDate = cursorDate;
    let plannedDays = isSkipped ? 0 : daysByStage.get(def.stage) ?? 1;
    let plannedEndDate = plannedStartDate;

    if (!isSkipped) {
      const isLast = seenActive === lastActiveIndex;
      plannedEndDate = isLast ? targetISO : addDaysISO(plannedStartDate, plannedDays);
      // Garantir que nenhuma etapa intermediária ultrapasse targetISO
      if (diffDaysISO(plannedEndDate, targetISO) < 0) {
        plannedEndDate = targetISO;
      }
      plannedDays = Math.max(0, diffDaysISO(plannedStartDate, plannedEndDate));
      cursorDate = plannedEndDate;
      seenActive += 1;
    }

    // Backfill consistente de datas reais para etapas já concluídas ou em curso
    let actualStartDate: string | undefined;
    let actualEndDate: string | undefined;

    if (!isSkipped) {
      if (def.orderIndex < currentStageIdx) {
        actualStartDate = plannedStartDate;
        actualEndDate =
          order.stage === 'entregue' && def.stage === 'expedicao' && order.completionDate
            ? order.completionDate
            : plannedEndDate;
      } else if (def.orderIndex === currentStageIdx && order.stage !== 'entregue') {
        actualStartDate = def.orderIndex === 0 ? startISO : plannedStartDate;
      }
    }

    return {
      stage: def.stage,
      label: def.label,
      orderIndex: def.orderIndex,
      plannedStartDate,
      plannedEndDate,
      plannedDays,
      actualStartDate,
      actualEndDate,
      responsible: resolveDefaultResponsible(def.stage, order),
      skipped: isSkipped,
    };
  });
}

/**
 * Garante que uma OP sempre possua as 6 etapas canônicas preenchidas e ordenadas.
 */
export function ensureOrderStageSchedule(
  order: ProductionOrderEntity,
  todayISO: string = getTodayISO()
): StageScheduleItem[] {
  const defaults = buildDefaultStageSchedule(order, todayISO);
  if (!Array.isArray(order.stageSchedule) || order.stageSchedule.length === 0) {
    return defaults;
  }

  const existingMap = new Map<string, StageScheduleItem>();
  for (const item of order.stageSchedule) {
    if (item && typeof item.stage === 'string') {
      existingMap.set(item.stage, item);
    }
  }

  return defaults.map((defItem) => {
    const stored = existingMap.get(defItem.stage);
    if (!stored) return defItem;

    const plannedStartDate = isValidIsoDate(stored.plannedStartDate)
      ? stored.plannedStartDate
      : defItem.plannedStartDate;
    const plannedEndDate = isValidIsoDate(stored.plannedEndDate)
      ? stored.plannedEndDate
      : defItem.plannedEndDate;

    return {
      stage: defItem.stage,
      label: defItem.label,
      orderIndex: defItem.orderIndex,
      plannedStartDate,
      plannedEndDate,
      plannedDays: Math.max(0, diffDaysISO(plannedStartDate, plannedEndDate)),
      actualStartDate: isValidIsoDate(stored.actualStartDate)
        ? stored.actualStartDate
        : defItem.actualStartDate,
      actualEndDate: isValidIsoDate(stored.actualEndDate)
        ? stored.actualEndDate
        : defItem.actualEndDate,
      responsible:
        typeof stored.responsible === 'string' && stored.responsible.trim()
          ? stored.responsible.trim()
          : defItem.responsible,
      notes: typeof stored.notes === 'string' && stored.notes.trim() ? stored.notes.trim() : undefined,
      skipped: defItem.stage === 'bordado_silk' ? Boolean(stored.skipped) : false,
    };
  });
}

/**
 * Atualiza datas reais (actualStartDate / actualEndDate) no cronograma ao mudar a etapa da OP.
 */
export function applyStageTransitionToSchedule(
  order: ProductionOrderEntity,
  oldStage: ProductionOrderEntity['stage'],
  newStage: ProductionOrderEntity['stage'],
  todayISO: string = getTodayISO(),
  reason?: string
): StageScheduleItem[] {
  const schedule = ensureOrderStageSchedule(order, todayISO).map((item) => ({ ...item }));
  const oldIdx = STAGE_INDEX_MAP[oldStage] ?? 0;
  const newIdx = STAGE_INDEX_MAP[newStage] ?? 0;

  if (newStage === 'retrabalho') {
    const qcItem = schedule.find((s) => s.stage === 'conferencia_qualidade');
    if (qcItem) {
      qcItem.actualEndDate = undefined;
      qcItem.notes = reason
        ? `Retrabalho (${todayISO}): ${reason}`
        : qcItem.notes || `Enviado para retrabalho em ${todayISO}`;
    }
    return schedule;
  }

  if (newStage === 'entregue') {
    for (const item of schedule) {
      if (item.skipped) continue;
      if (!item.actualStartDate) item.actualStartDate = item.plannedStartDate;
      if (!item.actualEndDate) {
        item.actualEndDate = item.stage === 'expedicao' ? todayISO : item.plannedEndDate;
      }
    }
    return schedule;
  }

  // Avanço normal de etapa
  if (newIdx > oldIdx) {
    for (const item of schedule) {
      if (item.skipped) continue;
      if (item.orderIndex === oldIdx) {
        if (!item.actualStartDate) item.actualStartDate = item.plannedStartDate;
        item.actualEndDate = todayISO;
      } else if (item.orderIndex > oldIdx && item.orderIndex < newIdx) {
        // Etapa intermediária pulada (ex: corte -> costura sem bordado_silk)
        if (item.stage === 'bordado_silk') {
          item.skipped = true;
        }
      } else if (item.orderIndex === newIdx) {
        item.skipped = false;
        item.actualStartDate = todayISO;
        item.actualEndDate = undefined;
      }
    }
  } else if (newIdx < oldIdx) {
    // Retorno de etapa (reabertura ou ajuste)
    for (const item of schedule) {
      if (item.orderIndex === newIdx) {
        item.skipped = false;
        if (!item.actualStartDate) item.actualStartDate = todayISO;
        item.actualEndDate = undefined;
      } else if (item.orderIndex > newIdx) {
        item.actualStartDate = undefined;
        item.actualEndDate = undefined;
      }
    }
  } else if (oldStage === 'retrabalho') {
    // Saindo de retrabalho para costura, bordado_silk ou conferencia_qualidade
    const targetItem = schedule.find((s) => s.stage === newStage);
    if (targetItem) {
      targetItem.skipped = false;
      targetItem.actualStartDate = todayISO;
      targetItem.actualEndDate = undefined;
    }
  }

  return schedule;
}

/**
 * Avalia o SLA de cada etapa e o prazo geral de entrega da OP.
 */
export function evaluateOrderDeadlines(
  order: ProductionOrderEntity,
  todayISO: string = getTodayISO()
): OrderDeadlineSummary {
  const schedule = ensureOrderStageSchedule(order, todayISO);
  const currentIdx = STAGE_INDEX_MAP[order.stage] ?? 0;
  const isDelivered = order.stage === 'entregue';
  const isRework = order.stage === 'retrabalho';

  let completedStagesCount = 0;
  let totalApplicableStagesCount = 0;
  let delayedStagesCount = 0;
  let currentStageItem: EvaluatedStageScheduleItem | null = null;

  const evaluatedStages: EvaluatedStageScheduleItem[] = schedule.map((item) => {
    if (item.skipped) {
      return {
        ...item,
        status: 'nao_aplicavel',
        daysRemaining: 0,
        isCurrent: false,
        isCompleted: false,
      };
    }

    totalApplicableStagesCount += 1;

    const isCompleted = isDelivered || (!isRework && item.orderIndex < currentIdx);
    const isCurrent =
      !isDelivered &&
      ((isRework && item.stage === 'conferencia_qualidade') ||
        (!isRework && item.stage === order.stage));

    let status: StageDeadlineStatus;
    let daysRemaining: number;

    if (isCompleted) {
      completedStagesCount += 1;
      const doneDate = item.actualEndDate || item.plannedEndDate;
      daysRemaining = diffDaysISO(doneDate, item.plannedEndDate); // >= 0 concluiu no prazo
      if (daysRemaining < 0) {
        status = 'concluida_atrasada';
        delayedStagesCount += 1;
      } else {
        status = 'concluida_no_prazo';
      }
    } else if (isCurrent) {
      daysRemaining = diffDaysISO(todayISO, item.plannedEndDate);
      if (isRework) {
        status = 'retrabalho';
        if (daysRemaining < 0) delayedStagesCount += 1;
      } else if (daysRemaining < 0) {
        status = 'em_andamento_atrasada';
        delayedStagesCount += 1;
      } else if (daysRemaining <= 2) {
        status = 'em_andamento_alerta';
      } else {
        status = 'em_andamento_no_prazo';
      }
    } else {
      daysRemaining = diffDaysISO(todayISO, item.plannedEndDate);
      status = 'pendente';
    }

    const evaluated: EvaluatedStageScheduleItem = {
      ...item,
      status,
      daysRemaining,
      isCurrent,
      isCompleted,
    };

    if (isCurrent) {
      currentStageItem = evaluated;
    }

    return evaluated;
  });

  const targetDeliveryDate = isValidIsoDate(order.targetDeliveryDate)
    ? order.targetDeliveryDate
    : todayISO;
  const referenceDate = isDelivered && isValidIsoDate(order.completionDate)
    ? order.completionDate
    : todayISO;
  const daysToDelivery = diffDaysISO(referenceDate, targetDeliveryDate);

  let deliveryStatus: OrderDeliveryStatus;
  if (isDelivered) {
    deliveryStatus = daysToDelivery < 0 ? 'entregue_atrasada' : 'entregue_no_prazo';
  } else if (daysToDelivery < 0) {
    deliveryStatus = 'atrasada';
  } else if (daysToDelivery === 0) {
    deliveryStatus = 'critica_hoje';
  } else if (daysToDelivery <= 3) {
    deliveryStatus = 'atencao';
  } else {
    deliveryStatus = 'no_prazo';
  }

  const progressPercent =
    totalApplicableStagesCount > 0
      ? Math.round((completedStagesCount / totalApplicableStagesCount) * 100)
      : 0;

  const isCurrentStageOverdue =
    !isDelivered &&
    Boolean(currentStageItem) &&
    (currentStageItem!.status === 'em_andamento_atrasada' ||
      (currentStageItem!.status === 'retrabalho' && currentStageItem!.daysRemaining < 0));

  const isCurrentStageDueSoon =
    !isDelivered &&
    Boolean(currentStageItem) &&
    currentStageItem!.status === 'em_andamento_alerta';

  return {
    asOfDate: todayISO,
    deliveryStatus,
    daysToDelivery,
    targetDeliveryDate,
    progressPercent,
    completedStagesCount,
    totalApplicableStagesCount,
    delayedStagesCount,
    isCurrentStageOverdue,
    isCurrentStageDueSoon,
    currentStageItem,
    stages: evaluatedStages,
  };
}
