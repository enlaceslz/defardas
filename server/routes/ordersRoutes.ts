/**
 * DE FARDAS ERP — Ordens de Produção (PCP) Routes
 * Enforces:
 *  - Gate A.3.2 (Sinal 50% confirmado no Financeiro + Arte aprovada antes do Corte)
 *  - Máquina de estados fabril (proíbe saltos de etapa e reabertura não autorizada)
 *  - Persistência real de terceirização (outsourcedPartner & partnerCostPerPiece)
 *  - Cálculo autoritativo da grade de tamanhos (totalPieces)
 *  - Integridade referencial em exclusão (409 para OP entregue, custódia aberta ou títulos liquidados)
 */
import { Router, Response } from 'express';
import crypto from 'crypto';
import { RequestWithUser, requireAuth, requirePermission } from '../auth/rbac';
import { orderRepository } from '../repositories/orderRepository';
import { quoteRepository } from '../repositories/quoteRepository';
import { clientRepository } from '../repositories/clientRepository';
import { financeRepository } from '../repositories/financeRepository';
import { partnerRepository } from '../repositories/partnerRepository';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';
import { validateArtworkPayload } from '../services/artworkValidation';
import {
  CORE_PIPELINE_STAGES,
  applyStageTransitionToSchedule,
  buildDefaultStageSchedule,
  diffDaysISO,
  ensureOrderStageSchedule,
  evaluateOrderDeadlines,
  getTodayISO,
  isValidIsoDate,
} from '../services/productionScheduleService';
import { ProductionOrderEntity, StageScheduleItem } from '../types/db';

export const ordersRouter = Router();

function enrichOrderWithSchedule(order: ProductionOrderEntity, todayISO: string = getTodayISO()) {
  const stageSchedule = ensureOrderStageSchedule(order, todayISO);
  const deadlineSummary = evaluateOrderDeadlines({ ...order, stageSchedule }, todayISO);
  return {
    ...order,
    stageSchedule,
    deadlineSummary,
  };
}

const VALID_STAGES: ProductionOrderEntity['stage'][] = [
  'aguardando_liberacao',
  'corte',
  'bordado_silk',
  'costura',
  'conferencia_qualidade',
  'retrabalho',
  'expedicao',
  'entregue',
];

// Máquina de estados fabril do PRD v1.6 (impede saltos indevidos como corte -> entregue)
const ALLOWED_STAGE_TRANSITIONS: Record<
  ProductionOrderEntity['stage'],
  ProductionOrderEntity['stage'][]
> = {
  aguardando_liberacao: ['corte'],
  corte: ['aguardando_liberacao', 'bordado_silk', 'costura'],
  bordado_silk: ['corte', 'costura'],
  costura: ['bordado_silk', 'corte', 'conferencia_qualidade'],
  conferencia_qualidade: ['costura', 'retrabalho', 'expedicao'],
  retrabalho: ['costura', 'bordado_silk', 'conferencia_qualidade'],
  expedicao: ['conferencia_qualidade', 'entregue'],
  entregue: ['expedicao'], // Reabertura restrita a admin
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeSizes(rawSizes: any): Record<string, number> {
  const keys = ['pp', 'p', 'm', 'g', 'gg', 'xg', 'exg', 'sobMedida'];
  const sanitized: Record<string, number> = {};
  for (const key of keys) {
    const val = Math.floor(Number(rawSizes?.[key] ?? 0));
    sanitized[key] = Number.isFinite(val) && val > 0 ? val : 0;
  }
  return sanitized;
}

function sumSizes(sizes: Record<string, number>): number {
  return Object.values(sizes).reduce((sum, n) => sum + (Number.isFinite(n) && n > 0 ? n : 0), 0);
}

// Exigir autenticação para todas as rotas de Ordens de Produção
ordersRouter.use(requireAuth);

// 1. Listar Ordens de Produção (enriquecidas com cronograma por etapa e SLA)
ordersRouter.get('/', async (_req: RequestWithUser, res: Response) => {
  const todayISO = getTodayISO();
  const allOrders = await orderRepository.findAll();
  res.json(allOrders.map((o) => enrichOrderWithSchedule(o, todayISO)));
});

// 1b. Resumo Consolidado de Prazos & Gargalos por Etapa (ANTES de /:id)
ordersRouter.get('/deadlines-summary', async (_req: RequestWithUser, res: Response) => {
  const todayISO = getTodayISO();
  const allOrders = await orderRepository.findAll();
  const activeOrders = allOrders.filter((o) => o.stage !== 'entregue');

  let overdueDeliveryCount = 0;
  let dueTodayCount = 0;
  let dueSoonCount = 0;
  let onTrackCount = 0;
  let overdueStageCount = 0;
  let dueSoonStageCount = 0;

  const byStage: Record<
    string,
    { stage: string; label: string; activeOrders: number; overdueOrders: number; dueSoonOrders: number; totalPieces: number }
  > = {};

  for (const def of CORE_PIPELINE_STAGES) {
    byStage[def.stage] = {
      stage: def.stage,
      label: def.label,
      activeOrders: 0,
      overdueOrders: 0,
      dueSoonOrders: 0,
      totalPieces: 0,
    };
  }

  for (const order of activeOrders) {
    const summary = evaluateOrderDeadlines(order, todayISO);
    if (summary.deliveryStatus === 'atrasada') overdueDeliveryCount += 1;
    else if (summary.deliveryStatus === 'critica_hoje') dueTodayCount += 1;
    else if (summary.deliveryStatus === 'atencao') dueSoonCount += 1;
    else onTrackCount += 1;

    if (summary.isCurrentStageOverdue) overdueStageCount += 1;
    else if (summary.isCurrentStageDueSoon) dueSoonStageCount += 1;

    const stageBucketKey = order.stage === 'retrabalho' ? 'conferencia_qualidade' : order.stage;
    if (byStage[stageBucketKey]) {
      byStage[stageBucketKey].activeOrders += 1;
      byStage[stageBucketKey].totalPieces += order.totalPieces;
      if (summary.isCurrentStageOverdue) byStage[stageBucketKey].overdueOrders += 1;
      else if (summary.isCurrentStageDueSoon) byStage[stageBucketKey].dueSoonOrders += 1;
    }
  }

  return res.json({
    asOfDate: todayISO,
    activeOrdersCount: activeOrders.length,
    overdueDeliveryCount,
    dueTodayCount,
    dueSoonCount,
    onTrackCount,
    overdueStageCount,
    dueSoonStageCount,
    byStage: Object.values(byStage),
  });
});

// 2. Buscar OP por ID (enriquecida com cronograma e prazos por etapa)
ordersRouter.get('/:id', async (req: RequestWithUser, res: Response) => {
  const order = await orderRepository.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Ordem de Produção não encontrada.' });
  }
  res.json(enrichOrderWithSchedule(order));
});

// 2b. Consultar Cronograma & SLA Detalhado da OP
ordersRouter.get('/:id/schedule', async (req: RequestWithUser, res: Response) => {
  const order = await orderRepository.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Ordem de Produção não encontrada.' });
  }
  const todayISO = getTodayISO();
  const stageSchedule = ensureOrderStageSchedule(order, todayISO);
  const deadlineSummary = evaluateOrderDeadlines({ ...order, stageSchedule }, todayISO);
  return res.json({
    orderId: order.id,
    orderNumber: order.orderNumber,
    stage: order.stage,
    targetDeliveryDate: order.targetDeliveryDate,
    stageSchedule,
    deadlineSummary,
  });
});

// 2c. Atualizar Prazos por Etapa do Cronograma (RBAC: admin, pcp_producao, gerente_comercial)
ordersRouter.put(
  '/:id/schedule',
  requirePermission('orders:manage_schedule'),
  async (req: RequestWithUser, res: Response) => {
    const actor = req.user!;
    const order = await orderRepository.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Ordem de Produção não encontrada.' });
    }

    if (order.stage === 'entregue' && actor.role !== 'admin') {
      return res.status(409).json({
        error: `A OP ${order.orderNumber} já foi entregue e o cronograma está travado para edição.`,
        code: 'ORDER_ALREADY_DELIVERED',
      });
    }

    const body = req.body || {};
    const todayISO = getTodayISO();
    const oldSchedule = ensureOrderStageSchedule(order, todayISO);

    let nextTargetDeliveryDate = order.targetDeliveryDate;
    if (body.targetDeliveryDate !== undefined) {
      if (!isValidIsoDate(body.targetDeliveryDate)) {
        return res.status(400).json({
          error: 'Data prometida de entrega inválida. Utilize o formato YYYY-MM-DD.',
        });
      }
      nextTargetDeliveryDate = String(body.targetDeliveryDate).trim();
    }

    let nextSchedule: StageScheduleItem[];

    if (body.recalculateProportional === true) {
      nextSchedule = buildDefaultStageSchedule(
        {
          ...order,
          targetDeliveryDate: nextTargetDeliveryDate,
        },
        todayISO
      );
    } else {
      if (!Array.isArray(body.stages) || body.stages.length === 0) {
        return res.status(400).json({
          error: 'Informe a lista de etapas (stages) ou utilize recalculateProportional: true.',
        });
      }

      const incomingByStage = new Map<string, any>();
      for (const raw of body.stages) {
        if (raw && typeof raw.stage === 'string') {
          incomingByStage.set(raw.stage, raw);
        }
      }

      const validStageKeys = new Set(CORE_PIPELINE_STAGES.map((c) => c.stage));
      for (const key of incomingByStage.keys()) {
        if (!validStageKeys.has(key as any)) {
          return res.status(400).json({
            error: `Etapa de cronograma inválida: '${key}'.`,
          });
        }
      }

      const builtSchedule: StageScheduleItem[] = [];
      for (const existing of oldSchedule) {
        const patch = incomingByStage.get(existing.stage);
        if (!patch) {
          builtSchedule.push(existing);
          continue;
        }

        const plannedStartDate =
          patch.plannedStartDate !== undefined
            ? String(patch.plannedStartDate).trim()
            : existing.plannedStartDate;
        const plannedEndDate =
          patch.plannedEndDate !== undefined
            ? String(patch.plannedEndDate).trim()
            : existing.plannedEndDate;

        if (!isValidIsoDate(plannedStartDate) || !isValidIsoDate(plannedEndDate)) {
          return res.status(400).json({
            error: `Datas inválidas na etapa '${existing.label}'. Use o formato YYYY-MM-DD.`,
          });
        }

        if (diffDaysISO(plannedStartDate, plannedEndDate) < 0) {
          return res.status(400).json({
            error: `Na etapa '${existing.label}', a data final prevista (${plannedEndDate}) não pode ser anterior à data de início (${plannedStartDate}).`,
          });
        }

        const responsible =
          patch.responsible !== undefined
            ? String(patch.responsible || '').trim().slice(0, 120) || existing.responsible
            : existing.responsible;
        const notes =
          patch.notes !== undefined
            ? String(patch.notes || '').trim().slice(0, 300) || undefined
            : existing.notes;
        const skipped =
          existing.stage === 'bordado_silk' && patch.skipped !== undefined
            ? Boolean(patch.skipped)
            : existing.skipped;

        builtSchedule.push({
          ...existing,
          plannedStartDate,
          plannedEndDate,
          plannedDays: Math.max(0, diffDaysISO(plannedStartDate, plannedEndDate)),
          responsible,
          notes,
          skipped,
        });
      }
      nextSchedule = builtSchedule;
    }

    // Se o usuário não alterou explicitamente targetDeliveryDate, mas ajustou o prazo final de expedição, manter coerência informativa (sem alterar targetDeliveryDate silenciosamente a menos que syncTargetDelivery seja true)
    if (body.syncTargetDelivery === true) {
      const expStage = nextSchedule.find((s) => s.stage === 'expedicao');
      if (expStage && isValidIsoDate(expStage.plannedEndDate)) {
        nextTargetDeliveryDate = expStage.plannedEndDate;
      }
    }

    const updated: ProductionOrderEntity = {
      ...order,
      targetDeliveryDate: nextTargetDeliveryDate,
      stageSchedule: nextSchedule,
      updatedAt: new Date().toISOString(),
    };

    await orderRepository.save(updated);

    auditService.log({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      entityName: 'producao.production_orders',
      entityId: updated.orderNumber,
      action: 'UPDATE_ORDER_SCHEDULE',
      oldData: {
        targetDeliveryDate: order.targetDeliveryDate,
        stageDeadlines: oldSchedule.map((s) => ({ stage: s.stage, end: s.plannedEndDate })),
      },
      newData: {
        targetDeliveryDate: updated.targetDeliveryDate,
        stageDeadlines: nextSchedule.map((s) => ({ stage: s.stage, end: s.plannedEndDate })),
      },
      notes: `Cronograma por etapa da OP ${updated.orderNumber} atualizado.`,
    });

    return res.json({
      success: true,
      message: `Cronograma de etapas da OP ${updated.orderNumber} atualizado com sucesso.`,
      order: enrichOrderWithSchedule(updated, todayISO),
    });
  }
);

// 3. Criar nova Ordem de Produção (Sempre inicia bloqueada em aguardando_liberacao — Gate A.3.2)
ordersRouter.post('/', requirePermission('orders:create'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const payload = req.body || {};

  const clientId = String(payload.clientId || '').trim();
  const itemTitle = String(payload.itemTitle || '').trim();

  if (!clientId || !itemTitle) {
    return res.status(400).json({ error: 'Campos obrigatórios: clientId e itemTitle.' });
  }

  const client = await clientRepository.findById(clientId);
  const resolvedClientName = client?.tradeName || String(payload.clientName || '').trim();
  if (!resolvedClientName) {
    return res.status(400).json({ error: 'Cliente inválido ou não informado.' });
  }

  const sizes = sanitizeSizes(payload.sizes);
  const computedPieces = sumSizes(sizes);
  const totalPieces = computedPieces > 0 ? computedPieces : Math.floor(Number(payload.totalPieces || 0));
  if (!Number.isFinite(totalPieces) || totalPieces <= 0) {
    return res.status(400).json({ error: 'A grade de tamanhos deve totalizar ao menos 1 peça.' });
  }

  if (payload.targetDeliveryDate !== undefined && String(payload.targetDeliveryDate).trim() !== '') {
    if (!ISO_DATE_RE.test(String(payload.targetDeliveryDate).trim())) {
      return res.status(400).json({ error: 'Data prometida de entrega inválida (use formato YYYY-MM-DD).' });
    }
  }
  const targetDeliveryDate =
    typeof payload.targetDeliveryDate === 'string' && ISO_DATE_RE.test(payload.targetDeliveryDate.trim())
      ? payload.targetDeliveryDate.trim()
      : new Date(Date.now() + 16 * 86400000).toISOString().split('T')[0];

  const creationDate =
    typeof payload.creationDate === 'string' && ISO_DATE_RE.test(payload.creationDate)
      ? payload.creationDate
      : new Date().toISOString().split('T')[0];

  const outsourcedPartner =
    typeof payload.outsourcedPartner === 'string' && payload.outsourcedPartner.trim()
      ? payload.outsourcedPartner.trim()
      : undefined;

  const partnerCostPerPiece =
    payload.partnerCostPerPiece !== undefined && Number.isFinite(Number(payload.partnerCostPerPiece))
      ? Math.max(0, Math.round(Number(payload.partnerCostPerPiece) * 100) / 100)
      : 0;

  const requestedQuoteId = payload.quoteId ? String(payload.quoteId).trim() : undefined;
  if (requestedQuoteId) {
    const existingOrders = await orderRepository.findAll();
    const duplicateForQuote = existingOrders.find((o) => o.quoteId === requestedQuoteId);
    if (duplicateForQuote) {
      return res.status(409).json({
        error: `A proposta vinculada já possui a Ordem de Produção ${duplicateForQuote.orderNumber} aberta (idempotência de conversão).`,
        code: 'QUOTE_ALREADY_CONVERTED',
        existingOrderNumber: duplicateForQuote.orderNumber,
      });
    }
  }

  const orderId = crypto.randomUUID();
  const orderNumber = await sequenceService.nextOrderNumberAsync();
  const nowIso = new Date().toISOString();

  const newOrder: ProductionOrderEntity = {
    id: orderId,
    orderNumber,
    quoteId: requestedQuoteId,
    quoteVersion: Number(payload.quoteVersion) || 1,
    idempotencyKey: payload.idempotencyKey ? String(payload.idempotencyKey).trim() : `manual_op_${orderId}`,
    clientId,
    clientName: resolvedClientName,
    itemTitle,
    category: String(payload.category || 'polos').trim(),
    fabricName: String(payload.fabricName || 'Padrão DE FARDAS').trim(),
    fabricColor: String(payload.fabricColor || 'Padrão').trim(),
    sizes,
    totalPieces,
    customizations: Array.isArray(payload.customizations) ? payload.customizations : [],
    commercialStatus: 'aprovado',
    // Portão Rígido (Gate A.3.2): Nenhuma OP nasce liberada sem quitação real no Financeiro e aprovação de arte
    financialStatus: 'entrada_pendente',
    stage: 'aguardando_liberacao',
    artApproved: false,
    entryPaymentConfirmed: false,
    outsourcedPartner,
    partnerCostPerPiece,
    priority: ['normal', 'alta', 'urgente'].includes(payload.priority) ? payload.priority : 'normal',
    creationDate,
    targetDeliveryDate,
    technicalNotes: typeof payload.technicalNotes === 'string' ? payload.technicalNotes.trim() : '',
    assignedTeam:
      typeof payload.assignedTeam === 'string' && payload.assignedTeam.trim()
        ? payload.assignedTeam.trim()
        : 'Mesa de Corte & Facção Terceirizada',
    isDemo: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  newOrder.stageSchedule = buildDefaultStageSchedule(newOrder);

  await orderRepository.save(newOrder);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'producao.production_orders',
    entityId: newOrder.orderNumber,
    action: 'CREATE_ORDER',
    newData: {
      orderNumber: newOrder.orderNumber,
      clientName: newOrder.clientName,
      totalPieces: newOrder.totalPieces,
      outsourcedPartner: newOrder.outsourcedPartner,
      partnerCostPerPiece: newOrder.partnerCostPerPiece,
      stage: newOrder.stage,
    },
    notes: `Ordem de produção ${newOrder.orderNumber} criada em 'aguardando_liberacao' (Gate A.3.2 ativo).`,
  });

  return res.status(201).json(enrichOrderWithSchedule(newOrder));
});

// 4. Atualizar detalhes operacionais da OP (Allowlist estrita — NUNCA permite bypass do Gate A.3.2)
ordersRouter.put('/:id', requirePermission('orders:create'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const order = await orderRepository.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Ordem de Produção não encontrada.' });
  }

  // OPs já entregues são congeladas para perfis não-admin (integridade histórica)
  if (order.stage === 'entregue' && actor.role !== 'admin') {
    return res.status(409).json({
      error: `A OP ${order.orderNumber} já foi entregue e está travada para edição. Apenas administradores podem ajustar registros encerrados.`,
      code: 'ORDER_ALREADY_DELIVERED',
    });
  }

  const payload = req.body || {};
  const sizes = payload.sizes ? sanitizeSizes(payload.sizes) : order.sizes;
  const computedPieces = sumSizes(sizes);
  if (payload.sizes && computedPieces <= 0) {
    return res.status(400).json({ error: 'A grade de tamanhos deve totalizar ao menos 1 peça.' });
  }

  const totalPieces = computedPieces > 0 ? computedPieces : order.totalPieces;

  const nextTargetDate =
    payload.targetDeliveryDate !== undefined
      ? ISO_DATE_RE.test(String(payload.targetDeliveryDate))
        ? String(payload.targetDeliveryDate)
        : null
      : order.targetDeliveryDate;

  if (!nextTargetDate) {
    return res.status(400).json({ error: 'Data prometida de entrega inválida (use formato YYYY-MM-DD).' });
  }

  const nextPartner =
    payload.outsourcedPartner !== undefined
      ? String(payload.outsourcedPartner || '').trim() || undefined
      : order.outsourcedPartner;

  const nextPartnerCost =
    payload.partnerCostPerPiece !== undefined && Number.isFinite(Number(payload.partnerCostPerPiece))
      ? Math.max(0, Math.round(Number(payload.partnerCostPerPiece) * 100) / 100)
      : order.partnerCostPerPiece;

  let nextClientId = order.clientId;
  let nextClientName = order.clientName;
  if (payload.clientId && String(payload.clientId).trim() !== order.clientId) {
    const newClient = await clientRepository.findById(String(payload.clientId).trim());
    nextClientId = String(payload.clientId).trim();
    nextClientName = newClient?.tradeName || String(payload.clientName || order.clientName).trim();
  } else if (payload.clientName) {
    nextClientName = String(payload.clientName).trim();
  }

  const updated: ProductionOrderEntity = {
    ...order,
    clientId: nextClientId,
    clientName: nextClientName,
    itemTitle: payload.itemTitle !== undefined ? String(payload.itemTitle).trim() || order.itemTitle : order.itemTitle,
    category: payload.category !== undefined ? String(payload.category).trim() || order.category : order.category,
    fabricName: payload.fabricName !== undefined ? String(payload.fabricName).trim() || order.fabricName : order.fabricName,
    fabricColor: payload.fabricColor !== undefined ? String(payload.fabricColor).trim() || order.fabricColor : order.fabricColor,
    sizes,
    totalPieces,
    customizations: Array.isArray(payload.customizations) ? payload.customizations : order.customizations,
    outsourcedPartner: nextPartner,
    partnerCostPerPiece: nextPartnerCost,
    priority: ['normal', 'alta', 'urgente'].includes(payload.priority) ? payload.priority : order.priority,
    targetDeliveryDate: nextTargetDate,
    technicalNotes:
      payload.technicalNotes !== undefined ? String(payload.technicalNotes).trim() : order.technicalNotes,
    assignedTeam:
      payload.assignedTeam !== undefined
        ? String(payload.assignedTeam).trim() || order.assignedTeam
        : order.assignedTeam,
    updatedAt: new Date().toISOString(),
  };

  // Se a data prometida de entrega mudou ou ainda não havia cronograma salvo, recalcular cronograma proporcional preservando datas reais já registradas
  const targetDateChanged = nextTargetDate !== order.targetDeliveryDate;
  const existingSchedule = ensureOrderStageSchedule(order);
  let nextStageSchedule = existingSchedule;
  if (targetDateChanged || !Array.isArray(order.stageSchedule) || order.stageSchedule.length === 0) {
    const recalculated = buildDefaultStageSchedule({ ...updated, targetDeliveryDate: nextTargetDate });
    const existingByStage = new Map(existingSchedule.map((s) => [s.stage, s]));
    nextStageSchedule = recalculated.map((rec) => {
      const prev = existingByStage.get(rec.stage);
      return {
        ...rec,
        actualStartDate: prev?.actualStartDate ?? rec.actualStartDate,
        actualEndDate: prev?.actualEndDate ?? rec.actualEndDate,
        notes: prev?.notes ?? rec.notes,
      };
    });
  } else {
    // Atualizar responsável da costura se o parceiro mudou
    nextStageSchedule = existingSchedule.map((s) =>
      s.stage === 'costura' && nextPartner !== order.outsourcedPartner
        ? { ...s, responsible: nextPartner || 'Produção Interna DE FARDAS' }
        : s
    );
  }
  updated.stageSchedule = nextStageSchedule;

  await orderRepository.save(updated);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'producao.production_orders',
    entityId: updated.orderNumber,
    action: 'UPDATE_ORDER',
    oldData: {
      itemTitle: order.itemTitle,
      totalPieces: order.totalPieces,
      outsourcedPartner: order.outsourcedPartner,
      partnerCostPerPiece: order.partnerCostPerPiece,
      targetDeliveryDate: order.targetDeliveryDate,
      priority: order.priority,
    },
    newData: {
      itemTitle: updated.itemTitle,
      totalPieces: updated.totalPieces,
      outsourcedPartner: updated.outsourcedPartner,
      partnerCostPerPiece: updated.partnerCostPerPiece,
      targetDeliveryDate: updated.targetDeliveryDate,
      priority: updated.priority,
    },
    notes: `Ficha técnica da OP ${updated.orderNumber} atualizada.`,
  });

  return res.json(enrichOrderWithSchedule(updated));
});

// 5. Avanço / Transição de Etapa com Máquina de Estados + Gate A.3.2 do PRD
ordersRouter.post('/:id/advance-stage', requirePermission('orders:advance_stage'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const order = await orderRepository.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Ordem de Produção não encontrada.' });
  }

  const { targetStage, reason } = req.body || {};
  if (!targetStage || !VALID_STAGES.includes(targetStage)) {
    return res.status(400).json({
      error: `targetStage inválido. Etapas permitidas: ${VALID_STAGES.join(', ')}.`,
    });
  }

  const oldStage = order.stage;
  if (oldStage === targetStage) {
    return res.json({ success: true, message: `OP já se encontra na etapa ${targetStage}.`, order });
  }

  // PORTÃO RÍGIDO (GATE A.3.2): Transição a partir de 'aguardando_liberacao'
  if (oldStage === 'aguardando_liberacao') {
    const isArtApproved = !!order.artApproved;
    const isPaymentConfirmed = !!order.entryPaymentConfirmed;

    if (!isArtApproved || !isPaymentConfirmed) {
      auditService.log({
        actorId: actor.id,
        actorName: actor.fullName,
        actorRole: actor.role,
        entityName: 'producao.production_orders',
        entityId: order.orderNumber,
        action: 'GATE_BYPASS_ATTEMPT',
        oldData: { stage: oldStage, artApproved: isArtApproved, entryPaymentConfirmed: isPaymentConfirmed },
        newData: { attemptedStage: targetStage },
        notes: `Tentativa bloqueada de liberar OP ${order.orderNumber} para '${targetStage}' sem cumprimento do Gate A.3.2.`,
      });

      return res.status(422).json({
        error:
          'Bloqueio do Portão de Liberação Fabril (Gate A.3.2): A Ordem de Produção NÃO pode avançar para o corte enquanto o sinal de 50% não for confirmado no Financeiro e a arte final não for formalmente aprovada pelo cliente.',
        code: 'GATE_A32_BLOCKED',
        gateStatus: {
          artApproved: isArtApproved,
          entryPaymentConfirmed: isPaymentConfirmed,
          artRequirementMessage: isArtApproved
            ? 'Arte final aprovada.'
            : 'Pendente: Aprovação formal da arte do cliente.',
          paymentRequirementMessage: isPaymentConfirmed
            ? 'Sinal de 50% confirmado com comprovante.'
            : 'Pendente: Confirmação de recebimento do sinal de 50% no financeiro.',
        },
      });
    }
  }

  // Validação da máquina de estados fabril (impede pular etapas críticas como Corte -> Entregue)
  const allowedTargets = ALLOWED_STAGE_TRANSITIONS[oldStage] || [];
  if (!allowedTargets.includes(targetStage)) {
    auditService.log({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      entityName: 'producao.production_orders',
      entityId: order.orderNumber,
      action: 'INVALID_STAGE_TRANSITION_ATTEMPT',
      oldData: { stage: oldStage },
      newData: { attemptedStage: targetStage, allowedTargets },
      notes: `Transição inválida bloqueada na OP ${order.orderNumber}: '${oldStage}' -> '${targetStage}'.`,
    });

    return res.status(422).json({
      error: `Transição de etapa não permitida: não é possível mover diretamente de '${oldStage}' para '${targetStage}'. Etapas válidas a partir de '${oldStage}': ${allowedTargets.join(', ')}.`,
      code: 'INVALID_STAGE_TRANSITION',
      allowedTargets,
    });
  }

  // Reabertura de OP já entregue é restrita ao perfil administrador
  if (oldStage === 'entregue' && actor.role !== 'admin') {
    return res.status(403).json({
      error: 'Apenas administradores podem reabrir uma Ordem de Produção já marcada como Entregue.',
      code: 'REOPEN_DELIVERED_REQUIRES_ADMIN',
    });
  }

  order.stage = targetStage;

  if (targetStage === 'entregue') {
    order.completionDate = new Date().toISOString().split('T')[0];
  } else if (oldStage === 'entregue') {
    order.completionDate = undefined;
  }

  // Tríade B.2.2: ao chegar em expedição/entrega com saldo ainda não quitado, reflete 'saldo_em_aberto'
  if (
    (targetStage === 'expedicao' || targetStage === 'entregue') &&
    order.financialStatus === 'entrada_confirmada'
  ) {
    order.financialStatus = 'saldo_em_aberto';
  }

  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
  if (targetStage === 'retrabalho' && trimmedReason) {
    const tag = `[Retrabalho registrado por ${actor.fullName} em ${new Date().toLocaleDateString('pt-BR')}: ${trimmedReason}]`;
    order.technicalNotes = `${order.technicalNotes || ''} ${tag}`.trim();
  }

  const todayISO = getTodayISO();
  order.stageSchedule = applyStageTransitionToSchedule(
    order,
    oldStage,
    targetStage,
    todayISO,
    trimmedReason || undefined
  );

  order.updatedAt = new Date().toISOString();
  await orderRepository.save(order);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'producao.production_orders',
    entityId: order.orderNumber,
    action: targetStage === 'retrabalho' ? 'SEND_TO_REWORK' : 'ADVANCE_STAGE',
    oldData: { stage: oldStage },
    newData: {
      stage: targetStage,
      completionDate: order.completionDate,
      reason: trimmedReason || undefined,
    },
    notes: `Etapa da OP ${order.orderNumber} alterada de '${oldStage}' para '${targetStage}'${trimmedReason ? ` — Motivo: ${trimmedReason}` : ''}.`,
  });

  return res.json({
    success: true,
    message: `Etapa atualizada com sucesso para ${targetStage}.`,
    order: enrichOrderWithSchedule(order, todayISO),
  });
});

// 6. Aprovação Formal de Arte (Gate da Arte — idempotente)
ordersRouter.post('/:id/approve-art', requirePermission('orders:approve_art'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const order = await orderRepository.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Ordem de Produção não encontrada.' });
  }

  if (order.artApproved) {
    return res.json({
      success: true,
      alreadyApproved: true,
      message: `Arte final já aprovada anteriormente por ${order.artApprovedBy || 'responsável'}.`,
      order,
    });
  }

  const approverName =
    typeof req.body?.approverName === 'string' && req.body.approverName.trim()
      ? req.body.approverName.trim().slice(0, 120)
      : actor.fullName;
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 1000) : '';
  const rawFileUrl = typeof req.body?.fileUrl === 'string' ? req.body.fileUrl.trim() : '';

  let validatedFileUrl: string | undefined;
  if (rawFileUrl) {
    const check = validateArtworkPayload({
      fileName: req.body?.fileName || `arte-${order.orderNumber}`,
      fileUrl: rawFileUrl,
    });
    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }
    validatedFileUrl = check.data.fileUrl;
  }

  const nowIso = new Date().toISOString();
  order.artStatus = 'aprovada';
  order.artApproved = true;
  order.artApprovedBy = approverName;
  order.artApprovalDate = nowIso;
  order.artRevisionNotes = undefined;
  if (validatedFileUrl) {
    order.artFileUrl = validatedFileUrl;
  }

  const noteEntry = `[Arte aprovada por ${order.artApprovedBy} em ${new Date().toLocaleDateString('pt-BR')}${notes ? ` — ${notes}` : ''}]`;
  order.technicalNotes = `${order.technicalNotes || ''} ${noteEntry}`.trim();
  order.updatedAt = nowIso;
  await orderRepository.save(order);

  // Sincronizar aprovação de volta para a Proposta Comercial vinculada
  if (order.quoteId) {
    const linkedQuote = await quoteRepository.findById(order.quoteId);
    if (linkedQuote) {
      linkedQuote.artStatus = 'aprovada';
      linkedQuote.artApproved = true;
      linkedQuote.artApprovedBy = approverName;
      linkedQuote.artApprovalDate = nowIso;
      if (validatedFileUrl) {
        linkedQuote.artFileUrl = validatedFileUrl;
      }
      if (notes) {
        linkedQuote.artNotes = notes;
      }
      if (Array.isArray(linkedQuote.artVersions) && linkedQuote.artVersions.length > 0) {
        const latestVer = Math.max(...linkedQuote.artVersions.map((v) => v.version));
        linkedQuote.artVersions = linkedQuote.artVersions.map((v) =>
          v.version === latestVer
            ? { ...v, status: 'aprovada', approvedBy: approverName, approvedAt: nowIso }
            : v.status === 'enviada_para_cliente'
            ? { ...v, status: 'substituida' }
            : v
        );
      }
      linkedQuote.updatedAt = nowIso;
      await quoteRepository.save(linkedQuote);
    }
  }

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'producao.production_orders',
    entityId: order.orderNumber,
    action: 'APPROVE_ART',
    newData: {
      artApproved: true,
      artStatus: 'aprovada',
      artApprovedBy: order.artApprovedBy,
      artApprovalDate: order.artApprovalDate,
      fileUrl: validatedFileUrl,
      notes: notes || undefined,
    },
    notes: `Arte final da OP ${order.orderNumber} formalmente aprovada por ${order.artApprovedBy}.`,
  });

  return res.json({
    success: true,
    message: 'Arte final aprovada com sucesso.',
    order,
  });
});

// 6b. Solicitar Revisão de Arte a partir do PCP (permitido apenas enquanto OP estiver em 'aguardando_liberacao')
ordersRouter.post('/:id/request-art-revision', requirePermission('orders:approve_art'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const order = await orderRepository.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Ordem de Produção não encontrada.' });
  }

  if (order.stage !== 'aguardando_liberacao') {
    return res.status(409).json({
      error: `Revisão de arte bloqueada: a OP ${order.orderNumber} já avançou para '${order.stage}'.`,
      code: 'ART_LOCKED_IN_PRODUCTION',
    });
  }

  const revisionNotes =
    typeof req.body?.revisionNotes === 'string' ? req.body.revisionNotes.trim().slice(0, 1000) : '';
  if (revisionNotes.length < 5) {
    return res.status(400).json({
      error: 'Informe os ajustes solicitados na arte (mínimo 5 caracteres).',
    });
  }

  const requestedBy =
    typeof req.body?.requestedBy === 'string' && req.body.requestedBy.trim()
      ? req.body.requestedBy.trim().slice(0, 120)
      : order.clientName;

  const nowIso = new Date().toISOString();
  order.artStatus = 'revisao_solicitada';
  order.artApproved = false;
  order.artApprovedBy = undefined;
  order.artApprovalDate = undefined;
  order.artRevisionNotes = revisionNotes;
  order.updatedAt = nowIso;
  await orderRepository.save(order);

  if (order.quoteId) {
    const linkedQuote = await quoteRepository.findById(order.quoteId);
    if (linkedQuote) {
      linkedQuote.artStatus = 'revisao_solicitada';
      linkedQuote.artApproved = false;
      linkedQuote.artApprovedBy = undefined;
      linkedQuote.artApprovalDate = undefined;
      linkedQuote.artNotes = revisionNotes;
      if (Array.isArray(linkedQuote.artVersions) && linkedQuote.artVersions.length > 0) {
        const latestVer = Math.max(...linkedQuote.artVersions.map((v) => v.version));
        linkedQuote.artVersions = linkedQuote.artVersions.map((v) =>
          v.version === latestVer
            ? {
                ...v,
                status: 'revisao_solicitada',
                revisionRequestedBy: requestedBy,
                revisionRequestedAt: nowIso,
                revisionNotes,
              }
            : v
        );
      }
      linkedQuote.updatedAt = nowIso;
      await quoteRepository.save(linkedQuote);
    }
  }

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'producao.production_orders',
    entityId: order.orderNumber,
    action: 'REQUEST_ARTWORK_REVISION',
    newData: { requestedBy, revisionNotes, artStatus: 'revisao_solicitada' },
    notes: `Revisão de arte solicitada na OP ${order.orderNumber} por ${requestedBy}: ${revisionNotes}`,
  });

  return res.json({
    success: true,
    message: 'Revisão de arte registrada. O Gate A.3.2 manterá a OP retida até aprovação da nova arte.',
    order,
  });
});

// 7. Exclusão de OP (proteção 409 contra OP entregue, custódia aberta e títulos liquidados)
ordersRouter.delete('/:id', requirePermission('orders:delete'), async (req: RequestWithUser, res: Response) => {
  const order = await orderRepository.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Ordem de Produção não encontrada.' });
  }

  if (order.stage === 'entregue') {
    return res.status(409).json({
      error: `Exclusão bloqueada: a OP ${order.orderNumber} já foi entregue e pertence ao histórico fiscal/produtivo.`,
      code: 'ORDER_ALREADY_DELIVERED',
    });
  }

  const [allTransactions, allCustody] = await Promise.all([
    financeRepository.findAll(),
    partnerRepository.findAllCustody(),
  ]);

  const openCustody = allCustody.filter(
    (c) =>
      c.productionOrderId === order.id &&
      (c.status === 'em_custodia' || c.status === 'devolvido_parcial')
  );
  if (openCustody.length > 0) {
    return res.status(409).json({
      error: `Exclusão bloqueada: a OP ${order.orderNumber} possui ${openCustody.length} remessa(s) de material ainda sob custódia de terceiros. Dê baixa na custódia antes de excluir.`,
      code: 'ORDER_HAS_OPEN_CUSTODY',
    });
  }

  const linkedTransactions = allTransactions.filter(
    (t) => t.productionOrderId === order.id || (t.referenceId && t.referenceId === order.orderNumber)
  );

  const settledTransactions = linkedTransactions.filter((t) => t.status === 'pago');
  if (settledTransactions.length > 0) {
    return res.status(409).json({
      error: `Não é permitido excluir a OP ${order.orderNumber} pois existem ${settledTransactions.length} título(s) financeiro(s) já liquidado(s) (${settledTransactions.map((t) => t.transactionNumber).join(', ')}). Estorne o(s) pagamento(s) antes de remover a OP.`,
      code: 'ORDER_HAS_SETTLED_TRANSACTIONS',
    });
  }

  // Remover títulos pendentes/atrasados vinculados para não inflar projeção de caixa com títulos órfãos
  const removableTransactions = linkedTransactions.filter((t) => t.status !== 'estornado');
  for (const trx of removableTransactions) {
    await financeRepository.delete(trx.id);
  }

  await orderRepository.delete(req.params.id);

  // Evita referência órfã na proposta comercial caso a OP não iniciada/não paga tenha sido removida
  if (order.quoteId) {
    const linkedQuote = await quoteRepository.findById(order.quoteId);
    if (linkedQuote && linkedQuote.convertedOrderId === order.id) {
      linkedQuote.convertedOrderId = undefined;
      linkedQuote.isLocked = false;
      linkedQuote.commercialStatus = 'aprovado';
      linkedQuote.updatedAt = new Date().toISOString();
      await quoteRepository.save(linkedQuote);
    }
  }

  auditService.log({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    entityName: 'producao.production_orders',
    entityId: order.orderNumber,
    action: 'DELETE_ORDER',
    newData: { removedPendingTransactions: removableTransactions.map((t) => t.transactionNumber) },
    notes: `Ordem de produção ${order.orderNumber} excluída.${removableTransactions.length > 0 ? ` ${removableTransactions.length} título(s) pendente(s) vinculado(s) removido(s).` : ''}`,
  });

  return res.json({ success: true, message: 'Ordem de produção excluída com sucesso.' });
});
