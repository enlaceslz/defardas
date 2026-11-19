import { Router, Response } from 'express';
import crypto from 'crypto';
import { RequestWithUser, requireAuth, requirePermission } from '../auth/rbac';
import { orderRepository } from '../repositories/orderRepository';
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

// Exigir autenticação para todas as rotas de Ordens de Produção
ordersRouter.use(requireAuth);

// Listar Ordens de Produção
ordersRouter.get('/', async (_req: RequestWithUser, res: Response) => {
  const allOrders = await orderRepository.findAll();
  res.json(allOrders);
});

// Buscar OP por ID
ordersRouter.get('/:id', async (req: RequestWithUser, res: Response) => {
  const order = await orderRepository.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Ordem de Produção não encontrada' });
  }
  res.json(order);
});

// Criar nova Ordem de Produção (Sempre inicia bloqueada em aguardando_liberacao — Gate A.3.2)
ordersRouter.post('/', requirePermission('orders:create'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const payload = req.body;

  if (!payload.clientName || !payload.itemTitle) {
    return res.status(400).json({ error: 'Campos obrigatórios: clientName e itemTitle.' });
  }

  const orderId = crypto.randomUUID();
  const orderNumber = await sequenceService.nextOrderNumberAsync();
  const sizes = payload.sizes || { pp: 0, p: 0, m: 0, g: 0, gg: 0, xg: 0, exg: 0, sobMedida: 0 };
  const computedPieces = Object.values(sizes).reduce((sum: number, val: any) => sum + Math.max(0, Number(val || 0)), 0);
  const totalPieces = Math.max(1, Number(payload.totalPieces || computedPieces || 1));

  const newOrder: ProductionOrderEntity = {
    id: orderId,
    orderNumber,
    quoteId: payload.quoteId,
    quoteVersion: payload.quoteVersion || 1,
    idempotencyKey: payload.idempotencyKey || `manual_op_${orderId}`,
    clientId: payload.clientId || 'c1111111-1111-1111-1111-111111111111',
    clientName: payload.clientName,
    itemTitle: payload.itemTitle,
    category: payload.category || 'polos',
    fabricName: payload.fabricName || 'Padrão DE FARDAS',
    fabricColor: payload.fabricColor || 'Padrão',
    sizes,
    totalPieces,
    customizations: Array.isArray(payload.customizations) ? payload.customizations : [],
    commercialStatus: 'aprovado',
    // Portão Rígido (Gate A.3.2): Nenhuma OP nasce liberada sem quitação real no Financeiro
    financialStatus: 'entrada_pendente',
    stage: 'aguardando_liberacao',
    artApproved: false,
    entryPaymentConfirmed: false,
    priority: ['normal', 'alta', 'urgente'].includes(payload.priority) ? payload.priority : 'normal',
    creationDate: payload.creationDate || new Date().toISOString().split('T')[0],
    targetDeliveryDate: payload.targetDeliveryDate || new Date(Date.now() + 16 * 86400000).toISOString().split('T')[0],
    technicalNotes: payload.technicalNotes || '',
    assignedTeam: payload.assignedTeam || 'Mesa de Corte & Facção Terceirizada',
    isDemo: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
      stage: newOrder.stage,
    },
    notes: `Ordem de produção ${newOrder.orderNumber} criada em 'aguardando_liberacao' (Gate A.3.2 ativo).`,
  });

  res.status(201).json(newOrder);
});

// Atualizar detalhes operacionais da OP (NUNCA permite bypass de stage, artApproved ou entryPaymentConfirmed)
ordersRouter.put('/:id', requirePermission('orders:create'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const order = await orderRepository.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Ordem de Produção não encontrada' });
  }

  const payload = req.body;
  const sizes = payload.sizes || order.sizes;
  const computedPieces = Object.values(sizes).reduce((sum: number, val: any) => sum + Math.max(0, Number(val || 0)), 0);

  const updated: ProductionOrderEntity = {
    ...order,
    clientId: payload.clientId ?? order.clientId,
    clientName: payload.clientName ?? order.clientName,
    itemTitle: payload.itemTitle ?? order.itemTitle,
    category: payload.category ?? order.category,
    fabricName: payload.fabricName ?? order.fabricName,
    fabricColor: payload.fabricColor ?? order.fabricColor,
    sizes,
    totalPieces: payload.totalPieces ? Math.max(1, Number(payload.totalPieces)) : (computedPieces || order.totalPieces),
    customizations: Array.isArray(payload.customizations) ? payload.customizations : order.customizations,
    priority: ['normal', 'alta', 'urgente'].includes(payload.priority) ? payload.priority : order.priority,
    targetDeliveryDate: payload.targetDeliveryDate ?? order.targetDeliveryDate,
    technicalNotes: payload.technicalNotes ?? order.technicalNotes,
    assignedTeam: payload.assignedTeam ?? order.assignedTeam,
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
    newData: { itemTitle: updated.itemTitle, totalPieces: updated.totalPieces, targetDeliveryDate: updated.targetDeliveryDate },
    notes: `Ficha técnica da OP ${updated.orderNumber} atualizada.`,
  });

  res.json(updated);
});

// Avanço de Etapa com Verificação Rígida de Portão (Gate A.3.2 do PRD)
ordersRouter.post('/:id/advance-stage', requirePermission('orders:advance_stage'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const order = await orderRepository.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Ordem de Produção não encontrada' });
  }

  const { targetStage } = req.body;
  if (!targetStage || !VALID_STAGES.includes(targetStage)) {
    return res.status(400).json({
      error: `targetStage inválido. Etapas permitidas: ${VALID_STAGES.join(', ')}.`,
    });
  }

  const oldStage = order.stage;

  // PORTÃO RÍGIDO (GATE A.3.2): Transição de 'aguardando_liberacao' para 'corte' ou qualquer etapa fabril
  if (oldStage === 'aguardando_liberacao' && targetStage !== 'aguardando_liberacao') {
    const isArtApproved = !!order.artApproved;
    const isPaymentConfirmed = !!order.entryPaymentConfirmed;

    if (!isArtApproved || !isPaymentConfirmed) {
      // Registrar tentativa de bypass de portão na trilha de auditoria
      auditService.log({
        actorId: actor.id,
        actorName: actor.fullName,
        actorRole: actor.role,
        entityName: 'producao.production_orders',
        entityId: order.orderNumber,
        action: 'GATE_BYPASS_ATTEMPT',
        oldData: { stage: oldStage, artApproved: isArtApproved, entryPaymentConfirmed: isPaymentConfirmed },
        newData: { attemptedStage: targetStage },
        notes: `Tentativa bloqueada de liberar OP ${order.orderNumber} para corte sem cumprimento dos gates normativos do PRD v1.6.`,
      });

      return res.status(422).json({
        error: 'Bloqueio do Portão de Liberação Fabril (Gate A.3.2): A Ordem de Produção NÃO pode avançar para o corte enquanto o sinal de 50% não for confirmado e a arte final não for formalmente aprovada pelo cliente.',
        gateStatus: {
          artApproved: isArtApproved,
          entryPaymentConfirmed: isPaymentConfirmed,
          artRequirementMessage: isArtApproved ? 'Arte final aprovada.' : 'Pendente: Aprovação formal da arte do cliente.',
          paymentRequirementMessage: isPaymentConfirmed ? 'Sinal de 50% confirmado com comprovante.' : 'Pendente: Confirmação de recebimento do sinal de 50% no financeiro.',
        },
      });
    }
  }

  order.stage = targetStage;
  if (targetStage === 'entregue' && !order.completionDate) {
    order.completionDate = new Date().toISOString().split('T')[0];
  }
  order.updatedAt = new Date().toISOString();
  await orderRepository.save(order);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'producao.production_orders',
    entityId: order.orderNumber,
    action: 'ADVANCE_STAGE',
    oldData: { stage: oldStage },
    newData: { stage: targetStage, completionDate: order.completionDate },
    notes: `Etapa da OP ${order.orderNumber} avançada de '${oldStage}' para '${targetStage}'.`,
  });

  res.json({
    success: true,
    message: `Etapa atualizada com sucesso para ${targetStage}.`,
    order,
  });
});

// Aprovação Formal de Arte (Gate da Arte)
ordersRouter.post('/:id/approve-art', requirePermission('orders:approve_art'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const order = await orderRepository.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Ordem de Produção não encontrada' });
  }

  const { approverName, fileUrl } = req.body;
  order.artApproved = true;
  order.artApprovedBy = approverName || actor.fullName;
  order.artApprovalDate = new Date().toISOString();
  order.technicalNotes = `${order.technicalNotes || ''} [Arte aprovada por ${order.artApprovedBy} em ${new Date().toLocaleDateString('pt-BR')}].`.trim();
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
    },
    notes: `Arte final da OP ${order.orderNumber} formalmente aprovada por ${order.artApprovedBy}.`,
  });

  res.json({
    success: true,
    message: 'Arte final aprovada com sucesso.',
    order,
  });
});

// Exclusão de OP
ordersRouter.delete('/:id', requirePermission('orders:delete'), async (req: RequestWithUser, res: Response) => {
  const order = await orderRepository.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Ordem de Produção não encontrada' });
  }

  await orderRepository.delete(req.params.id);

  auditService.log({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    entityName: 'producao.production_orders',
    entityId: order.orderNumber,
    action: 'DELETE_ORDER',
    notes: `Ordem de produção ${order.orderNumber} excluída.`,
  });

  res.json({ success: true, message: 'Ordem de produção excluída com sucesso.' });
});
