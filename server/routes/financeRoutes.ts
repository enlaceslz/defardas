import { Router, Response } from 'express';
import crypto from 'crypto';
import { RequestWithUser, requireAuth, requirePermission } from '../auth/rbac';
import { financeRepository } from '../repositories/financeRepository';
import { orderRepository } from '../repositories/orderRepository';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';
import { FinancialTransactionEntity } from '../types/db';

export const financeRouter = Router();

// Exigir autenticação para todas as rotas financeiras
financeRouter.use(requireAuth);

// Listar transações financeiras
financeRouter.get('/transactions', async (_req: RequestWithUser, res: Response) => {
  const allTrx = await financeRepository.findAll();
  res.json(allTrx);
});

// Criar novo lançamento financeiro
financeRouter.post('/transactions', requirePermission('finance:create_transaction'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const payload = req.body;

  const trxNumber = sequenceService.nextFinanceNumber();
  const newTrx: FinancialTransactionEntity = {
    id: crypto.randomUUID(),
    transactionNumber: trxNumber,
    productionOrderId: payload.productionOrderId,
    quoteId: payload.quoteId,
    type: payload.type || 'receber',
    subType: payload.subType || 'entrada_pedido',
    description: payload.description || 'Lançamento Financeiro',
    category: payload.category || 'Venda de Uniformes',
    amount: Number(payload.amount || 0),
    dueDate: payload.dueDate || new Date().toISOString().split('T')[0],
    status: 'pendente',
    paymentMethod: payload.paymentMethod || 'pix',
    referenceId: payload.referenceId,
    isDemo: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await financeRepository.save(newTrx);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'financeiro.transactions',
    entityId: newTrx.transactionNumber,
    action: 'CREATE_TRANSACTION',
    newData: newTrx,
    notes: `Lançamento ${newTrx.transactionNumber} de R$ ${newTrx.amount.toFixed(2)} cadastrado.`,
  });

  res.status(201).json(newTrx);
});

// Confirmação de Pagamento com Comprovante Real (Liquidação e Liberação do Sinal)
financeRouter.post('/transactions/:id/confirm-payment', requirePermission('finance:confirm_receipt'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const trx = await financeRepository.findById(req.params.id);
  if (!trx) {
    return res.status(404).json({ error: 'Lançamento financeiro não encontrado' });
  }

  const { receiptVoucherNumber, receiptEvidenceUrl, confirmationNotes } = req.body;

  // Invariante P0-004 / AUD-05: Rejeitar dados fictícios e exigir comprovante real
  if (!receiptVoucherNumber || !receiptEvidenceUrl) {
    return res.status(422).json({
      error: 'Invariante violada: A confirmação de pagamento exige número de autenticação bancária e URL do comprovante real. Dados fictícios são proibidos.',
    });
  }

  // Registrar quitação na transação
  trx.status = 'pago';
  trx.paidDate = new Date().toISOString().split('T')[0];
  trx.receiptVoucherNumber = receiptVoucherNumber;
  trx.receiptEvidenceUrl = receiptEvidenceUrl;
  trx.confirmedById = actor.id;
  trx.confirmedByName = `${actor.fullName} (${actor.role})`;
  trx.confirmationNotes = confirmationNotes || 'Comprovante bancário conferido e autenticado.';
  trx.updatedAt = new Date().toISOString();

  await financeRepository.save(trx);

  let linkedOrderUpdated = false;
  let updatedOrder = null;

  // PONTE DO PORTÃO (GATE BRIDGE): Se for entrada de pedido (sinal de 50%), liberar a Ordem de Produção!
  if (trx.subType === 'entrada_pedido' && (trx.productionOrderId || trx.referenceId)) {
    // Buscar OP pelo productionOrderId ou pelo orderNumber/referenceId
    let order = trx.productionOrderId ? await orderRepository.findById(trx.productionOrderId) : null;
    if (!order && trx.referenceId) {
      const orders = await orderRepository.findAll();
      order = orders.find((o) => o.orderNumber === trx.referenceId || (trx.quoteId && o.quoteId === trx.quoteId)) || null;
    }

    if (order) {
      order.entryPaymentConfirmed = true;
      order.financialStatus = 'entrada_confirmada';
      order.entryReceiptUrl = trx.receiptEvidenceUrl;
      order.entryReceiptReference = trx.receiptVoucherNumber;
      order.entryVerifiedById = actor.id;
      order.entryVerificationDate = new Date().toISOString();
      order.updatedAt = new Date().toISOString();

      await orderRepository.save(order);

      linkedOrderUpdated = true;
      updatedOrder = order;

      auditService.log({
        actorId: actor.id,
        actorName: actor.fullName,
        actorRole: actor.role,
        entityName: 'producao.production_orders',
        entityId: order.orderNumber,
        action: 'DOWNPAYMENT_CONFIRMED',
        newData: {
          orderNumber: order.orderNumber,
          financialStatus: order.financialStatus,
          entryPaymentConfirmed: true,
          voucher: trx.receiptVoucherNumber,
        },
        notes: `Sinal de 50% confirmado com comprovante ${trx.receiptVoucherNumber}. Portão de pagamento da OP ${order.orderNumber} liberado com sucesso!`,
      });
    }
  }

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'financeiro.transactions',
    entityId: trx.transactionNumber,
    action: 'CONFIRM_PAYMENT',
    newData: {
      status: 'pago',
      paidDate: trx.paidDate,
      voucher: trx.receiptVoucherNumber,
      amount: trx.amount,
      linkedOrderUpdated,
    },
    notes: `Título ${trx.transactionNumber} liquidado. Comprovante: ${trx.receiptVoucherNumber}.`,
  });

  res.json({
    success: true,
    message: `Lançamento ${trx.transactionNumber} liquidado com sucesso! ${linkedOrderUpdated ? 'Sinal de 50% da Ordem de Produção confirmado.' : ''}`,
    transaction: trx,
    linkedOrderUpdated,
    order: updatedOrder,
  });
});

// Excluir lançamento
financeRouter.delete('/transactions/:id', requirePermission('finance:delete_transaction'), async (req: RequestWithUser, res: Response) => {
  const trx = await financeRepository.findById(req.params.id);
  if (!trx) {
    return res.status(404).json({ error: 'Lançamento financeiro não encontrado' });
  }

  if (trx.status === 'pago') {
    return res.status(400).json({ error: 'Não é permitido excluir um lançamento financeiro já liquidado. Utilize estorno compensatório.' });
  }

  await financeRepository.delete(req.params.id);

  auditService.log({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    entityName: 'financeiro.transactions',
    entityId: trx.transactionNumber,
    action: 'DELETE_TRANSACTION',
    notes: `Lançamento financeiro ${trx.transactionNumber} excluído.`,
  });

  res.json({ success: true, message: 'Lançamento financeiro excluído com sucesso.' });
});
