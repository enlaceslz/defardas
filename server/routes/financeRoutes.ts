import { quoteRepository } from '../repositories/quoteRepository';
import { number, text, date, oneOf, money, InputError } from '../validation/input';
import { atomic } from '../db/unitOfWork';
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
financeRouter.post('/transactions', requirePermission('finance:create_transaction'), atomic(async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const payload = req.body;

  if (payload.productionOrderId || payload.quoteId || ['entrada_pedido', 'saldo_entrega'].includes(payload.subType)) {
    throw new InputError('Títulos de pedido são gerados exclusivamente pela conversão da proposta.');
  }
  const amount = money(number(payload.amount, 'Valor', 0.01));
  const trxNumber = await sequenceService.nextFinanceNumber();
  const newTrx: FinancialTransactionEntity = {
    id: crypto.randomUUID(),
    transactionNumber: trxNumber,
    productionOrderId: payload.productionOrderId,
    quoteId: payload.quoteId,
    type: oneOf(payload.type, ['receber', 'pagar'], 'Tipo'),
    subType: oneOf(payload.subType, ['compra_tecido', 'servico_terceirizado', 'despesa_geral'], 'Categoria do título'),
    description: text(payload.description, 'Descrição', 200),
    category: payload.category || 'Venda de Uniformes',
    amount,
    dueDate: date(payload.dueDate, 'Vencimento'),
    status: 'pendente',
    paymentMethod: oneOf(payload.paymentMethod, ['pix', 'boleto', 'transferencia', 'cartao'], 'Forma de pagamento'),
    referenceId: payload.referenceId,
    isDemo: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await financeRepository.save(newTrx);

  await auditService.log({
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
}));

// Confirmação de Pagamento com Comprovante Real (Liquidação e Liberação do Sinal)
financeRouter.post('/transactions/:id/confirm-payment', requirePermission('finance:confirm_receipt'), atomic(async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const trx = await financeRepository.findById(req.params.id);
  if (!trx) {
    return res.status(404).json({ error: 'Lançamento financeiro não encontrado' });
  }

  const { receiptVoucherNumber, receiptEvidenceUrl, confirmationNotes } = req.body;

  if (trx.status === 'pago') return res.json({ success: true, alreadyConfirmed: true, transaction: trx });
  if (trx.status === 'estornado') return res.status(409).json({ error: 'Título estornado não pode ser liquidado.' });
  const voucher = text(receiptVoucherNumber, 'Autenticação bancária', 80);
  const evidence = text(receiptEvidenceUrl, 'URL privada do comprovante', 2000);
  if (!evidence.startsWith('https://')) throw new InputError('Informe a URL HTTPS do comprovante real.');
  let relatedOrders = trx.quoteId ? await orderRepository.findByQuoteId(trx.quoteId) : [];
  if (trx.quoteId && ['entrada_pedido', 'saldo_entrega'].includes(trx.subType)) {
    const quote = await quoteRepository.findById(trx.quoteId);
    const expected = trx.subType === 'entrada_pedido' ? quote?.entryAmount : quote?.balanceAmount;
    if (!quote || !relatedOrders.length || money(trx.amount) !== expected || trx.type !== 'receber') {
      return res.status(409).json({ error: 'Título incompatível com a proposta e suas ordens.' });
    }
  }
  trx.status = 'pago'; trx.paidDate = new Date().toISOString().slice(0, 10);
  trx.receiptVoucherNumber = voucher; trx.receiptEvidenceUrl = evidence;
  trx.confirmedById = actor.id; trx.confirmedByName = actor.fullName;
  trx.confirmationNotes = text(confirmationNotes, 'Observações', 10000, false);
  trx.updatedAt = new Date().toISOString();
  await financeRepository.save(trx);
  if (['entrada_pedido', 'saldo_entrega'].includes(trx.subType)) {
    const titles = (await financeRepository.findAll()).filter((t) => t.quoteId === trx.quoteId && t.type === 'receber');
    const entryPaid = titles.some((t) => t.subType === 'entrada_pedido' && t.status === 'pago');
    const fullyPaid = titles.some((t) => t.subType === 'saldo_entrega' && t.status === 'pago') && entryPaid;
    for (const order of relatedOrders) {
      order.financialStatus = fullyPaid ? 'quitado' : entryPaid ? 'entrada_confirmada' : 'entrada_pendente';
      if (trx.subType === 'entrada_pedido') {
        order.entryPaymentConfirmed = true; order.entryReceiptUrl = evidence;
        order.entryReceiptReference = voucher; order.entryVerifiedById = actor.id;
        order.entryVerificationDate = trx.updatedAt;
      }
      order.updatedAt = trx.updatedAt;
      await orderRepository.save(order);
    }
  }
  const linkedOrderUpdated = relatedOrders.length > 0;
  const updatedOrder = relatedOrders[0] || null;

  await auditService.log({
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
}));

// Excluir lançamento
financeRouter.delete('/transactions/:id', requirePermission('finance:delete_transaction'), atomic(async (req: RequestWithUser, res: Response) => {
  const trx = await financeRepository.findById(req.params.id);
  if (!trx) {
    return res.status(404).json({ error: 'Lançamento financeiro não encontrado' });
  }

  if (trx.quoteId || trx.productionOrderId) {
    return res.status(409).json({ error: 'Título vinculado a produção não pode ser excluído isoladamente.' });
  }
  if (trx.status === 'pago') {
    return res.status(400).json({ error: 'Não é permitido excluir um lançamento financeiro já liquidado. Utilize estorno compensatório.' });
  }

  await financeRepository.delete(req.params.id);

  await auditService.log({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    entityName: 'financeiro.transactions',
    entityId: trx.transactionNumber,
    action: 'DELETE_TRANSACTION',
    notes: `Lançamento financeiro ${trx.transactionNumber} excluído.`,
  });

  res.json({ success: true, message: 'Lançamento financeiro excluído com sucesso.' });
}));
