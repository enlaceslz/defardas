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
import { clientRepository } from '../repositories/clientRepository';
import { financeRepository } from '../repositories/financeRepository';
import { partnerRepository } from '../repositories/partnerRepository';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';
import { ProductionOrderEntity } from '../types/db';

export const ordersRouter = Router();

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

// 1. Listar Ordens de Produção
ordersRouter.get('/', async (_req: RequestWithUser, res: Response) => {
  const allOrders = await orderRepository.findAll();
  res.json(allOrders);
});

// 2. Buscar OP por ID
ordersRouter.get('/:id', async (req: RequestWithUser, res: Response) => {
  const order = await orderRepository.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Ordem de Produção não encontrada.' });
  }
  res.json(order);
});

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

  const orderId = crypto.randomUUID();
  const orderNumber = await sequenceService.nextOrderNumberAsync();
  const nowIso = new Date().toISOString();

  const newOrder: ProductionOrderEntity = {
    id: orderId,
    orderNumber,
    quoteId: payload.quoteId ? String(payload.quoteId).trim() : undefined,
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

  return res.status(201).json(newOrder);
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

  return res.json(updated);
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
    order,
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
      ? req.body.approverName.trim()
      : actor.fullName;
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';
  const fileUrl = typeof req.body?.fileUrl === 'string' ? req.body.fileUrl.trim() : undefined;

  order.artApproved = true;
  order.artApprovedBy = approverName;
  order.artApprovalDate = new Date().toISOString();

  const noteEntry = `[Arte aprovada por ${order.artApprovedBy} em ${new Date().toLocaleDateString('pt-BR')}${notes ? ` — ${notes}` : ''}]`;
  order.technicalNotes = `${order.technicalNotes || ''} ${noteEntry}`.trim();
  order.updatedAt = new Date().toISOString();
  await orderRepository.save(order);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'producao.production_orders',
    entityId: order.orderNumber,
    action: 'APPROVE_ART',
    newData: {
      artApproved: true,
      artApprovedBy: order.artApprovedBy,
      artApprovalDate: order.artApprovalDate,
      fileUrl,
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
