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
ordersRouter.post('/:id/advance-stage', requirePermission('orders:advance_stage'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const order = await orderRepository.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Ordem de Produção não encontrada' });
  }

  const { targetStage } = req.body;
  if (!['aguardando_liberacao', 'corte', 'bordado_silk', 'costura', 'conferencia_qualidade', 'retrabalho', 'expedicao', 'entregue'].includes(targetStage)) {
    return res.status(400).json({ error: 'targetStage é obrigatório' });
  }

  const oldStage = order.stage;

  // PORTÃO RÍGIDO (GATE A.3.2): Transição de 'aguardando_liberacao' para 'corte' ou qualquer etapa fabril
  if (targetStage !== 'aguardando_liberacao') {
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
    newData: { stage: targetStage },
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
  order.technicalNotes = `${order.technicalNotes || ''} [Arte aprovada por ${order.artApprovedBy} em ${new Date().toLocaleDateString('pt-BR')}].`;
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
