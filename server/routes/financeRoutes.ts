import { completeQuoteConversion } from '../validation/quoteConversion';
import { financeRequestRepository } from '../repositories/financeRequestRepository';
import { isLocalDemoEnvironment } from '../auth/demoEnvironment';
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
  const payload = req.body || {};

  if (payload.productionOrderId || payload.quoteId || ['entrada_pedido', 'saldo_entrega'].includes(payload.subType)) {
    throw new InputError('Títulos de pedido são gerados exclusivamente pela conversão da proposta.');
  }
  const amount = number(payload.amount, 'Valor', 0.01);
  if (amount > 9999999999.99 || money(amount) !== amount) throw new InputError('Valor deve caber em 10 inteiros e 2 decimais.');
  const details = {
    type: oneOf(payload.type, ['receber', 'pagar'], 'Tipo'),
    subType: oneOf(payload.subType, ['compra_tecido', 'servico_terceirizado', 'despesa_geral'], 'Categoria do título'),
    description: text(payload.description, 'Descrição', 200),
    category: text(payload.category, 'Categoria', 60, false),
    amount,
    dueDate: date(payload.dueDate, 'Vencimento'),
    paymentMethod: oneOf(payload.paymentMethod, ['pix', 'boleto', 'transferencia', 'cartao'], 'Forma de pagamento'),
    referenceId: text(payload.referenceId, 'Referência', 60, false) || undefined,
  };
  const key = req.get('idempotency-key');
  if (!key && !isLocalDemoEnvironment()) throw new InputError('Chave de repetição obrigatória.');
  if (key && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) throw new InputError('Chave de repetição inválida.');
  const hash = crypto.createHash('sha256').update(`finance:${actor.id}:${(key || crypto.randomUUID()).toLowerCase()}`).digest('hex');
  const requestId = `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(details)).digest('hex');
  const receipt = await financeRequestRepository.find(requestId);
  if (receipt) {
    if (receipt.fingerprint !== fingerprint) return res.status(409).json({ error: 'Chave de repetição já usada para outro lançamento.' });
    const existing = await financeRepository.findById(receipt.entityId);
    if (!existing) return res.status(410).json({ error: 'Lançamento desta solicitação foi excluído e não foi recriado.' });
    return res.json(existing);
  }
  const trxNumber = await sequenceService.nextFinanceNumber();
  const newTrx: FinancialTransactionEntity = {
    ...details, id: crypto.randomUUID(), transactionNumber: trxNumber, status: 'pendente',
    isDemo: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await financeRepository.save(newTrx);
  await financeRequestRepository.save(requestId, { fingerprint, entityId: newTrx.id });

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

  const { receiptVoucherNumber, receiptEvidenceUrl, confirmationNotes } = req.body || {};

  if (trx.status === 'pago') return res.json({ success: true, alreadyConfirmed: true, transaction: trx });
  if (trx.status === 'estornado') return res.status(409).json({ error: 'Título estornado não pode ser liquidado.' });
  const voucher = text(receiptVoucherNumber, 'Autenticação bancária', 80);
  const evidence = text(receiptEvidenceUrl, 'URL privada do comprovante', 2000);
  let evidenceUrl: URL;
  try { evidenceUrl = new URL(evidence); } catch { throw new InputError('Informe uma URL HTTPS válida para o comprovante.'); }
  if (!/^https:\/\//i.test(evidence) || evidenceUrl.protocol !== 'https:' || !evidenceUrl.hostname || evidenceUrl.username || evidenceUrl.password) {
    throw new InputError('Informe uma URL HTTPS do comprovante sem credenciais embutidas.');
  }
  let relatedOrders = trx.quoteId ? await orderRepository.findByQuoteId(trx.quoteId) : [];
  if (['entrada_pedido', 'saldo_entrega'].includes(trx.subType)) {
    const quote = trx.quoteId ? await quoteRepository.findById(trx.quoteId) : null;
    const receivables = trx.quoteId ? (await financeRepository.findByQuoteId(trx.quoteId)).filter((title) => title.type === 'receber' && ['entrada_pedido', 'saldo_entrega'].includes(title.subType)) : [];
    if (quote && !completeQuoteConversion(quote, relatedOrders, receivables)) {
      return res.status(409).json({ error: 'Histórico de conversão incompleto ou divergente. Reconcilie os vínculos antes da baixa.', code: 'QUOTE_CONVERSION_INCOMPLETE' });
    }
    const expected = trx.subType === 'entrada_pedido' ? quote?.entryAmount : quote?.balanceAmount;
    if (!quote || !trx.productionOrderId || !relatedOrders.some((order) => order.id === trx.productionOrderId) ||
        !Number.isFinite(trx.amount) || trx.amount <= 0 || money(trx.amount) !== trx.amount || trx.amount !== expected || trx.type !== 'receber') {
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
    const titles = (await financeRepository.findByQuoteId(trx.quoteId!)).filter((t) => t.type === 'receber');
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
  const linkedOrderUpdated = ['entrada_pedido', 'saldo_entrega'].includes(trx.subType) && relatedOrders.length > 0;
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
    message: `Lançamento ${trx.transactionNumber} liquidado com sucesso! ${linkedOrderUpdated ? trx.subType === 'entrada_pedido' ? 'Confirmação de entrada registrada nas ordens vinculadas.' : 'Situação financeira atualizada nas ordens vinculadas.' : ''}`,
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
