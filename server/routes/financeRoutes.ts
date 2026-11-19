import { Router, Response } from 'express';
import crypto from 'crypto';
import { RequestWithUser, requireAuth, requirePermission } from '../auth/rbac';
import { financeRepository } from '../repositories/financeRepository';
import { orderRepository } from '../repositories/orderRepository';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';
import { FinancialTransactionEntity } from '../types/db';

export const financeRouter = Router();

const VALID_RECEIVABLE_SUBTYPES = new Set(['entrada_pedido', 'saldo_entrega']);
const VALID_PAYABLE_SUBTYPES = new Set(['compra_tecido', 'servico_terceirizado', 'despesa_geral']);
const VALID_PAYMENT_METHODS = new Set(['pix', 'boleto', 'transferencia', 'cartao']);
const FORBIDDEN_PLACEHOLDER_VOUCHERS = new Set([
  'teste',
  'test',
  'mock',
  'fake',
  'n/a',
  'na',
  '0000',
  '1234',
  '12345',
  'xxxx',
  'null',
  'undefined',
]);

const round2 = (n: number) => Math.round(n * 100) / 100;

function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function isValidIsoDate(val: unknown): val is string {
  return typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val) && !Number.isNaN(Date.parse(val));
}

function isValidEvidenceUri(uri: string): boolean {
  const trimmed = uri.trim();
  if (trimmed.length < 5) return false;
  return (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('s3://') ||
    trimmed.startsWith('/uploads/')
  );
}

/**
 * Classificação dinâmica de atraso (sem mutação destrutiva):
 * títulos 'pendente' com vencimento anterior à data atual são apresentados como 'atrasado'.
 */
function withEffectiveStatus(trx: FinancialTransactionEntity, todayISO = getTodayISO()): FinancialTransactionEntity {
  if (trx.status === 'pendente' && trx.dueDate && trx.dueDate < todayISO) {
    return { ...trx, status: 'atrasado' };
  }
  return trx;
}

// Exigir autenticação para todas as rotas financeiras
financeRouter.use(requireAuth);

// Listar transações financeiras com detecção de vencidos
financeRouter.get('/transactions', requirePermission('finance:view'), async (_req: RequestWithUser, res: Response) => {
  const todayISO = getTodayISO();
  const allTrx = await financeRepository.findAll();
  res.json(allTrx.map((t) => withEffectiveStatus(t, todayISO)));
});

// Resumo executivo autoritativo do Fluxo de Caixa (Controladoria)
financeRouter.get('/summary', requirePermission('finance:view'), async (_req: RequestWithUser, res: Response) => {
  const todayISO = getTodayISO();
  const allTrx = (await financeRepository.findAll()).map((t) => withEffectiveStatus(t, todayISO));

  let receivablesPending = 0;
  let receivablesOverdue = 0;
  let payablesPending = 0;
  let payablesOverdue = 0;
  let totalReceived = 0;
  let totalPaidOut = 0;
  let pendingDownpaymentsCount = 0;
  let pendingDownpaymentsAmount = 0;
  let reversedCount = 0;
  let reversedAmount = 0;

  for (const t of allTrx) {
    if (t.status === 'estornado') {
      reversedCount += 1;
      reversedAmount += t.amount;
      continue;
    }

    if (t.type === 'receber') {
      if (t.status === 'pago') {
        totalReceived += t.amount;
      } else {
        receivablesPending += t.amount;
        if (t.status === 'atrasado') {
          receivablesOverdue += t.amount;
        }
        if (t.subType === 'entrada_pedido') {
          pendingDownpaymentsCount += 1;
          pendingDownpaymentsAmount += t.amount;
        }
      }
    } else {
      if (t.status === 'pago') {
        totalPaidOut += t.amount;
      } else {
        payablesPending += t.amount;
        if (t.status === 'atrasado') {
          payablesOverdue += t.amount;
        }
      }
    }
  }

  const realizedCashBalance = round2(totalReceived - totalPaidOut);
  const projectedNetBalance = round2(realizedCashBalance + receivablesPending - payablesPending);

  res.json({
    asOfDate: todayISO,
    receivablesPending: round2(receivablesPending),
    receivablesOverdue: round2(receivablesOverdue),
    payablesPending: round2(payablesPending),
    payablesOverdue: round2(payablesOverdue),
    totalReceived: round2(totalReceived),
    totalPaidOut: round2(totalPaidOut),
    realizedCashBalance,
    projectedNetBalance,
    pendingDownpaymentsCount,
    pendingDownpaymentsAmount: round2(pendingDownpaymentsAmount),
    reversedCount,
    reversedAmount: round2(reversedAmount),
  });
});

// Criar novo lançamento financeiro
financeRouter.post('/transactions', requirePermission('finance:create_transaction'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const payload = req.body;

  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'O valor do lançamento financeiro deve ser maior que zero.' });
  }

  const description = typeof payload.description === 'string' ? payload.description.trim() : '';
  if (description.length < 3) {
    return res.status(400).json({ error: 'A descrição do lançamento é obrigatória (mínimo 3 caracteres).' });
  }

  const type: 'receber' | 'pagar' = payload.type === 'pagar' ? 'pagar' : payload.type === 'receber' ? 'receber' : null as any;
  if (!type) {
    return res.status(400).json({ error: "Tipo inválido. Utilize 'receber' ou 'pagar'." });
  }

  const defaultSubType = type === 'receber' ? 'entrada_pedido' : 'compra_tecido';
  const subType = payload.subType || defaultSubType;
  const allowedSubTypes = type === 'receber' ? VALID_RECEIVABLE_SUBTYPES : VALID_PAYABLE_SUBTYPES;
  if (!allowedSubTypes.has(subType)) {
    return res.status(400).json({
      error: `Subtipo '${subType}' incompatível com lançamento do tipo '${type}'. Permitidos: ${Array.from(allowedSubTypes).join(', ')}.`,
    });
  }

  const paymentMethod = payload.paymentMethod || 'pix';
  if (!VALID_PAYMENT_METHODS.has(paymentMethod)) {
    return res.status(400).json({
      error: `Forma de pagamento inválida. Valores permitidos: ${Array.from(VALID_PAYMENT_METHODS).join(', ')}.`,
    });
  }

  const dueDate = payload.dueDate || getTodayISO();
  if (!isValidIsoDate(dueDate)) {
    return res.status(400).json({ error: 'Data de vencimento inválida. Utilize o formato YYYY-MM-DD.' });
  }

  let productionOrderId: string | undefined = payload.productionOrderId || undefined;
  let referenceId: string | undefined = payload.referenceId ? String(payload.referenceId).trim() : undefined;

  if (productionOrderId) {
    const linkedOrder = await orderRepository.findById(productionOrderId);
    if (!linkedOrder) {
      return res.status(404).json({ error: 'Ordem de Produção vinculada não encontrada.' });
    }
    if (!referenceId) {
      referenceId = linkedOrder.orderNumber;
    }
  }

  const trxNumber = await sequenceService.nextFinanceNumberAsync();
  const newTrx: FinancialTransactionEntity = {
    id: crypto.randomUUID(),
    transactionNumber: trxNumber,
    productionOrderId,
    quoteId: payload.quoteId || undefined,
    type,
    subType,
    description,
    category: (typeof payload.category === 'string' && payload.category.trim()) || (type === 'receber' ? 'Venda de Uniformes' : 'Custos Operacionais'),
    amount: round2(amount),
    dueDate,
    status: 'pendente',
    paymentMethod,
    referenceId,
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
    notes: `Lançamento ${newTrx.transactionNumber} (${newTrx.type}/${newTrx.subType}) de R$ ${newTrx.amount.toFixed(2)} cadastrado.`,
  });

  res.status(201).json(withEffectiveStatus(newTrx));
});

// Confirmação de Pagamento com Comprovante Real (Liquidação e Liberação do Sinal - Gate A.3.2)
financeRouter.post('/transactions/:id/confirm-payment', requirePermission('finance:confirm_receipt'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const trx = await financeRepository.findById(req.params.id);
  if (!trx) {
    return res.status(404).json({ error: 'Lançamento financeiro não encontrado' });
  }

  if (trx.status === 'pago') {
    return res.status(409).json({
      error: `O título ${trx.transactionNumber} já foi liquidado anteriormente (Comprovante: ${trx.receiptVoucherNumber || 'N/A'}).`,
    });
  }

  if (trx.status === 'estornado') {
    return res.status(409).json({
      error: `O título ${trx.transactionNumber} encontra-se estornado e não pode ser liquidado novamente. Emita um novo título caso necessário.`,
    });
  }

  const { receiptVoucherNumber, receiptEvidenceUrl, confirmationNotes, paymentMethod } = req.body;
  const cleanVoucher = typeof receiptVoucherNumber === 'string' ? receiptVoucherNumber.trim() : '';
  const cleanEvidenceUrl = typeof receiptEvidenceUrl === 'string' ? receiptEvidenceUrl.trim() : '';

  // Invariante P0-004 / AUD-05: Rejeitar dados fictícios e exigir comprovante real
  if (cleanVoucher.length < 4 || FORBIDDEN_PLACEHOLDER_VOUCHERS.has(cleanVoucher.toLowerCase())) {
    return res.status(422).json({
      error: 'Invariante violada: Informe um código de autenticação bancária real (mínimo 4 caracteres; valores genéricos/fictícios são rejeitados).',
    });
  }

  if (!isValidEvidenceUri(cleanEvidenceUrl)) {
    return res.status(422).json({
      error: 'Invariante violada: A evidência do comprovante deve ser uma URL/URI válida (https://, http://, s3:// ou /uploads/).',
    });
  }

  if (paymentMethod !== undefined) {
    if (!VALID_PAYMENT_METHODS.has(paymentMethod)) {
      return res.status(400).json({
        error: `Forma de pagamento inválida. Valores permitidos: ${Array.from(VALID_PAYMENT_METHODS).join(', ')}.`,
      });
    }
    trx.paymentMethod = paymentMethod;
  }

  // Registrar quitação na transação
  trx.status = 'pago';
  trx.paidDate = getTodayISO();
  trx.receiptVoucherNumber = cleanVoucher;
  trx.receiptEvidenceUrl = cleanEvidenceUrl;
  trx.confirmedById = actor.id;
  trx.confirmedByName = `${actor.fullName} (${actor.role})`;
  trx.confirmationNotes = (typeof confirmationNotes === 'string' && confirmationNotes.trim()) || 'Comprovante bancário conferido e autenticado.';
  trx.updatedAt = new Date().toISOString();

  await financeRepository.save(trx);

  let linkedOrderUpdated = false;
  let updatedOrder = null;

  // PONTE DO PORTÃO (GATE BRIDGE): Atualizar estado financeiro da OP vinculada (apenas títulos a receber)
  if (trx.type === 'receber' && (trx.subType === 'entrada_pedido' || trx.subType === 'saldo_entrega') && (trx.productionOrderId || trx.referenceId)) {
    let order = trx.productionOrderId ? await orderRepository.findById(trx.productionOrderId) : null;
    if (!order && trx.referenceId) {
      const orders = await orderRepository.findAll();
      order = orders.find((o) => o.orderNumber === trx.referenceId || (trx.quoteId && o.quoteId === trx.quoteId)) || null;
    }

    if (order) {
      const allTransactions = await financeRepository.findAll();
      const activeOrderReceivables = allTransactions.filter(
        (t) =>
          t.type === 'receber' &&
          t.status !== 'estornado' &&
          (t.productionOrderId === order!.id || t.referenceId === order!.orderNumber)
      );
      const allSettled = activeOrderReceivables.length > 0 && activeOrderReceivables.every((t) => t.status === 'pago');

      if (trx.subType === 'entrada_pedido') {
        order.entryPaymentConfirmed = true;
        order.financialStatus = allSettled
          ? 'quitado'
          : order.stage === 'expedicao' || order.stage === 'entregue'
            ? 'saldo_em_aberto'
            : 'entrada_confirmada';
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
      } else if (trx.subType === 'saldo_entrega') {
        if (allSettled) {
          order.financialStatus = 'quitado';
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
            action: 'ORDER_FINANCIALLY_SETTLED',
            newData: { orderNumber: order.orderNumber, financialStatus: 'quitado', voucher: trx.receiptVoucherNumber },
            notes: `Saldo de entrega quitado. Status financeiro da OP ${order.orderNumber} atualizado para 'quitado'.`,
          });
        }
      }
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
      paymentMethod: trx.paymentMethod,
      voucher: trx.receiptVoucherNumber,
      amount: trx.amount,
      linkedOrderUpdated,
    },
    notes: `Título ${trx.transactionNumber} liquidado. Comprovante: ${trx.receiptVoucherNumber}.`,
  });

  const orderUpdateSuffix = linkedOrderUpdated
    ? trx.subType === 'entrada_pedido'
      ? ' Sinal de 50% da Ordem de Produção confirmado.'
      : ' Saldo financeiro da Ordem de Produção quitado integralmente.'
    : '';

  res.json({
    success: true,
    message: `Lançamento ${trx.transactionNumber} liquidado com sucesso!${orderUpdateSuffix}`,
    transaction: trx,
    linkedOrderUpdated,
    order: updatedOrder,
  });
});

// Estorno Compensatório Auditável (Substitui exclusão de títulos já liquidados)
financeRouter.post('/transactions/:id/reverse', requirePermission('finance:reverse_transaction'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const trx = await financeRepository.findById(req.params.id);
  if (!trx) {
    return res.status(404).json({ error: 'Lançamento financeiro não encontrado' });
  }

  if (trx.status !== 'pago') {
    return res.status(409).json({
      error: `Apenas títulos já liquidados ('pago') podem ser estornados. Status atual: '${trx.status}'.`,
    });
  }

  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 5) {
    return res.status(400).json({
      error: 'O estorno compensatório exige justificativa detalhada (mínimo 5 caracteres).',
    });
  }

  const oldSnapshot = {
    status: trx.status,
    paidDate: trx.paidDate,
    receiptVoucherNumber: trx.receiptVoucherNumber,
  };

  trx.status = 'estornado';
  trx.confirmationNotes = `${trx.confirmationNotes ? `${trx.confirmationNotes} | ` : ''}[ESTORNADO em ${getTodayISO()} por ${actor.fullName}: ${reason}]`;
  trx.updatedAt = new Date().toISOString();
  await financeRepository.save(trx);

  let linkedOrderUpdated = false;
  let updatedOrder = null;

  // Recalcular estado financeiro da OP vinculada após o estorno
  if (trx.type === 'receber' && (trx.subType === 'entrada_pedido' || trx.subType === 'saldo_entrega') && (trx.productionOrderId || trx.referenceId)) {
    let order = trx.productionOrderId ? await orderRepository.findById(trx.productionOrderId) : null;
    if (!order && trx.referenceId) {
      const orders = await orderRepository.findAll();
      order = orders.find((o) => o.orderNumber === trx.referenceId || (trx.quoteId && o.quoteId === trx.quoteId)) || null;
    }

    if (order) {
      const allTransactions = await financeRepository.findAll();
      const remainingPaidDownpayment = allTransactions.some(
        (t) =>
          t.id !== trx.id &&
          t.type === 'receber' &&
          t.subType === 'entrada_pedido' &&
          t.status === 'pago' &&
          (t.productionOrderId === order!.id || t.referenceId === order!.orderNumber)
      );

      if (trx.subType === 'entrada_pedido' && !remainingPaidDownpayment) {
        order.entryPaymentConfirmed = false;
        if (order.stage === 'aguardando_liberacao') {
          order.financialStatus = 'entrada_pendente';
          order.entryReceiptUrl = undefined;
          order.entryReceiptReference = undefined;
        } else {
          // OP já em produção: preserva rastreio fabril mas sinaliza pendência financeira aberta
          order.financialStatus = 'saldo_em_aberto';
          auditService.log({
            actorId: actor.id,
            actorName: actor.fullName,
            actorRole: actor.role,
            entityName: 'producao.production_orders',
            entityId: order.orderNumber,
            action: 'REVERSAL_ON_ACTIVE_ORDER',
            newData: { stage: order.stage, financialStatus: order.financialStatus, reversedTransaction: trx.transactionNumber },
            notes: `ATENÇÃO: Estorno do sinal (${trx.transactionNumber}) ocorreu com OP ${order.orderNumber} já na etapa '${order.stage}'.`,
          });
        }
        order.updatedAt = new Date().toISOString();
        await orderRepository.save(order);
        linkedOrderUpdated = true;
        updatedOrder = order;
      } else if (trx.subType === 'saldo_entrega' && order.financialStatus === 'quitado') {
        order.financialStatus =
          order.stage === 'expedicao' || order.stage === 'entregue'
            ? 'saldo_em_aberto'
            : order.entryPaymentConfirmed
              ? 'entrada_confirmada'
              : 'entrada_pendente';
        order.updatedAt = new Date().toISOString();
        await orderRepository.save(order);
        linkedOrderUpdated = true;
        updatedOrder = order;
      }
    }
  }

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'financeiro.transactions',
    entityId: trx.transactionNumber,
    action: 'REVERSE_TRANSACTION',
    oldData: oldSnapshot,
    newData: {
      status: 'estornado',
      reason,
      linkedOrderUpdated,
      orderFinancialStatus: updatedOrder?.financialStatus,
    },
    notes: `Estorno compensatório do título ${trx.transactionNumber} (R$ ${trx.amount.toFixed(2)}). Motivo: ${reason}`,
  });

  res.json({
    success: true,
    message: `Título ${trx.transactionNumber} estornado com sucesso.${linkedOrderUpdated ? ` Estado financeiro da OP ${updatedOrder?.orderNumber} atualizado para '${updatedOrder?.financialStatus}'.` : ''}`,
    transaction: trx,
    linkedOrderUpdated,
    order: updatedOrder,
  });
});

// Excluir lançamento (apenas pendente ou atrasado; títulos pagos ou estornados são imutáveis)
financeRouter.delete('/transactions/:id', requirePermission('finance:delete_transaction'), async (req: RequestWithUser, res: Response) => {
  const trx = await financeRepository.findById(req.params.id);
  if (!trx) {
    return res.status(404).json({ error: 'Lançamento financeiro não encontrado' });
  }

  if (trx.status === 'pago') {
    return res.status(400).json({ error: 'Não é permitido excluir um lançamento financeiro já liquidado. Utilize o estorno compensatório.' });
  }

  if (trx.status === 'estornado') {
    return res.status(400).json({ error: 'Lançamentos estornados compõem a trilha de auditoria financeira e não podem ser excluídos.' });
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
