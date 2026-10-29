import { number, text, date, oneOf, money, InputError } from '../validation/input';
import { atomic, rejectWithAudit } from '../db/unitOfWork';
import { Router, Response } from 'express';
import { RequestWithUser, requireAuth, requirePermission } from '../auth/rbac';
import { orderRepository } from '../repositories/orderRepository';
import { auditService } from '../services/auditService';
import { ProductionOrderEntity } from '../types/db';

export const ordersRouter = Router();

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

// Avanço de Etapa com Verificação Rígida de Portão (Gate A.3.2 do PRD)
ordersRouter.post('/:id/advance-stage', requirePermission('orders:advance_stage'), atomic(async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const order = await orderRepository.findByIdForUpdate(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Ordem de Produção não encontrada' });
  }

  const { targetStage } = req.body || {};
  if (!['aguardando_liberacao', 'corte', 'bordado_silk', 'costura', 'conferencia_qualidade', 'retrabalho', 'expedicao', 'entregue'].includes(targetStage)) {
    return res.status(400).json({ error: 'targetStage é obrigatório' });
  }

  const expectedRevision = number(req.body.expectedRevision, 'Revisão esperada da OP', 1, true);
  const oldStage = order.stage;

  // PORTÃO RÍGIDO (GATE A.3.2): Transição de 'aguardando_liberacao' para 'corte' ou qualquer etapa fabril
  if (targetStage !== 'aguardando_liberacao') {
    const isArtApproved = !!order.artApproved;
    const isPaymentConfirmed = !!order.entryPaymentConfirmed;

    if (!isArtApproved || !isPaymentConfirmed) {
      // Capturar os fatos observados; registrar só depois do rollback da operação bloqueada.
      const attempt = {
        actorId: actor.id,
        actorName: actor.fullName,
        actorRole: actor.role,
        entityName: 'producao.production_orders',
        entityId: order.orderNumber,
        action: 'GATE_BYPASS_ATTEMPT',
        oldData: { stage: oldStage, artApproved: isArtApproved, entryPaymentConfirmed: isPaymentConfirmed },
        newData: { attemptedStage: targetStage },
        notes: `Tentativa bloqueada de liberar OP ${order.orderNumber} para corte sem cumprimento dos gates normativos do PRD v1.6.`,
      };

      return rejectWithAudit(422, {
        error: 'Bloqueio do Portão de Liberação Fabril (Gate A.3.2): A Ordem de Produção NÃO pode avançar para o corte enquanto o sinal de 50% não for confirmado e a arte final não for formalmente aprovada pelo cliente.',
        gateStatus: {
          artApproved: isArtApproved,
          entryPaymentConfirmed: isPaymentConfirmed,
          artRequirementMessage: isArtApproved ? 'Arte final aprovada.' : 'Pendente: Aprovação formal da arte do cliente.',
          paymentRequirementMessage: isPaymentConfirmed ? 'Sinal de 50% confirmado com comprovante.' : 'Pendente: Confirmação de recebimento do sinal de 50% no financeiro.',
        },
      }, () => auditService.log(attempt));
    }
  }

  // Mesmo destino é uma consulta da confirmação atual, sem regravar datas/histórico.
  // Mantém os portões acima, inclusive para OP histórica em estado inconsistente.
  if (oldStage === targetStage) {
    return res.json({ success: true, alreadyAtStage: true, message: `OP já está na etapa ${targetStage}.`, order });
  }

  if (expectedRevision !== (order.revision ?? 1)) {
    return res.status(409).json({ error: 'A OP foi alterada desde a leitura. Atualize os dados antes de mudar a etapa.', code: 'ORDER_REVISION_CONFLICT' });
  }

  order.stage = targetStage;
  order.completionDate = targetStage === 'entregue' ? new Date().toISOString().slice(0, 10) : undefined;
  order.updatedAt = new Date().toISOString();
  await orderRepository.save(order);

  await auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'producao.production_orders',
    entityId: order.orderNumber,
    action: 'ADVANCE_STAGE',
    oldData: { stage: oldStage },
    newData: { stage: targetStage },
    notes: `Etapa da OP ${order.orderNumber} avançada de '${oldStage}' para '${targetStage}'.`,
  });

  res.json({
    success: true,
    message: `Etapa atualizada com sucesso para ${targetStage}.`,
    order,
  });
}));

// Aprovação Formal de Arte (Gate da Arte)
ordersRouter.post('/:id/approve-art', requirePermission('orders:approve_art'), atomic(async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const order = await orderRepository.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Ordem de Produção não encontrada' });
  }

  // Aprovação já registrada não pode ser substituída por um retry da mesma ação.
  if (order.artApproved) {
    return res.json({ success: true, alreadyApproved: true, message: 'Arte já aprovada anteriormente.', order });
  }
  const { approverName, fileUrl } = req.body || {};
  const approvedBy = text(approverName, 'Nome do cliente que aprovou a arte', 100);
  order.artApproved = true;
  order.artApprovedBy = approvedBy;
  order.artApprovalDate = new Date().toISOString();
  order.technicalNotes = `${order.technicalNotes || ''} [Arte aprovada por ${order.artApprovedBy} em ${new Date().toLocaleDateString('pt-BR')}].`;
  order.updatedAt = new Date().toISOString();
  await orderRepository.save(order);

  await auditService.log({
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
}));

// Exclusão de OP
ordersRouter.delete('/:id', requirePermission('orders:delete'), atomic(async (req: RequestWithUser, res: Response) => {
  const order = await orderRepository.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Ordem de Produção não encontrada' });
  }

  if (order.quoteId || order.quoteItemId || order.stage !== 'aguardando_liberacao' || order.entryPaymentConfirmed ||
      order.artApproved || order.artApprovedBy || order.artApprovalDate || order.entryReceiptUrl ||
      order.entryReceiptReference || order.entryVerifiedById || order.entryVerificationDate ||
      await orderRepository.hasHistory(order.id)) {
    return res.status(409).json({ error: 'OP vinculada à proposta ou com histórico não pode ser excluída isoladamente.' });
  }
  await orderRepository.delete(req.params.id);

  await auditService.log({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    entityName: 'producao.production_orders',
    entityId: order.orderNumber,
    action: 'DELETE_ORDER',
    notes: `Ordem de produção ${order.orderNumber} excluída.`,
  });

  res.json({ success: true, message: 'Ordem de produção excluída com sucesso.' });
}));

ordersRouter.put('/:id', requirePermission('orders:create'), atomic(async (req: RequestWithUser, res: Response) => {
  const order = await orderRepository.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'OP não encontrada.' });
  const body = req.body || {};
  order.priority = oneOf(body.priority, ['normal', 'alta', 'urgente'], 'Prioridade');
  order.targetDeliveryDate = date(body.targetDeliveryDate, 'Entrega');
  order.technicalNotes = text(body.technicalNotes, 'Notas técnicas', 10000, false);
  order.assignedTeam = text(body.assignedTeam, 'Equipe', 100, false);
  order.outsourcedPartner = text(body.outsourcedPartner, 'Facção', 100, false);
  const partnerCost = number(body.partnerCostPerPiece ?? 0, 'Custo da facção');
  // Contrato da coluna numeric(10,2): rejeitar arredondamento e overflow antes de salvar.
  if (partnerCost > 99999999.99 || money(partnerCost) !== partnerCost) {
    throw new InputError('Custo da facção deve caber em 8 inteiros e 2 decimais.');
  }
  order.partnerCostPerPiece = partnerCost;
  order.updatedAt = new Date().toISOString();
  await orderRepository.save(order);
  await auditService.log({ actorId: req.user!.id, actorName: req.user!.fullName, actorRole: req.user!.role,
    entityName: 'producao.production_orders', entityId: order.id, action: 'UPDATE_ORDER', newData: order });
  res.json(order);
}));
