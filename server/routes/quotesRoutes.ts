import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { atomic } from '../db/unitOfWork';
import { RequestWithUser, requireAuth, requirePermission } from '../auth/rbac';
import { quoteRepository } from '../repositories/quoteRepository';
import { clientRepository } from '../repositories/clientRepository';
import { orderRepository } from '../repositories/orderRepository';
import { financeRepository } from '../repositories/financeRepository';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';
import { PricingEngine } from '../services/pricingEngine';
import { QuoteEntity, QuoteItemEntity, ProductionOrderEntity, FinancialTransactionEntity } from '../types/db';
import { productionDeadline } from '../validation/productionDeadline';
import { InputError, text, number, date, oneOf, money, sizes } from '../validation/input';

// Limites técnicos das colunas numeric existentes, sem alçada comercial nova.
function quoteDecimal(value: unknown, name: string, digits: number, minimum = 0): number {
  const result = number(value, name, minimum);
  if (Math.abs(result) > 10 ** digits - 0.01 || money(result) !== result) {
    throw new InputError(`${name} deve caber em ${digits} inteiros e 2 decimais.`);
  }
  return result;
}

export const quotesRouter = Router();
quotesRouter.use(requireAuth);
quotesRouter.get('/', async (_req, res) => { res.json(await quoteRepository.findAll()); });
quotesRouter.get('/:id', async (req, res) => {
  const quote = await quoteRepository.findById(req.params.id);
  res.status(quote ? 200 : 404).json(quote || { error: 'Orçamento não encontrado.' });
});
quotesRouter.post('/', requirePermission('quotes:create'), atomic(async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const payload = req.body || {};
  const client = await clientRepository.findById(text(payload.clientId, 'Cliente', 60));
  if (!client) throw new InputError('Cliente não encontrado. Cadastre o cliente antes da proposta.');
  if (payload.entryPercentage !== undefined && payload.entryPercentage !== 50) throw new InputError('O sinal deve ser de 50%, conforme PRD.');
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 100) throw new InputError('Informe de 1 a 100 itens.');
  const quoteId = crypto.randomUUID();
  const items: QuoteItemEntity[] = payload.items.map((item: any) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new InputError('Item da proposta inválido.');
    const costs = item.costBreakdown || item;
    const materialUnitCost = quoteDecimal(costs.materialUnitCost, 'Material', 8);
    const outsourcedSewingUnitCost = quoteDecimal(costs.outsourcedSewingUnitCost, 'Costura', 8);
    const customizationUnitCost = quoteDecimal(costs.customizationUnitCost, 'Personalização', 8);
    const freightUnitCost = quoteDecimal(costs.freightPerUnit ?? costs.freightUnitCost, 'Frete', 8);
    const technicalLossPercentage = quoteDecimal(costs.technicalLossPercentage, 'Perda técnica', 3);
    const markupPercentage = quoteDecimal(costs.markupPercentage, 'Markup', 4);
    const grid = sizes(item.sizes);
    const quantity = Object.values(grid).reduce((a, b) => a + b, 0);
    if (quantity > 2147483647) throw new InputError('Quantidade excede a capacidade inteira do banco.');
    if (item.totalQuantity !== quantity) throw new InputError('Quantidade deve coincidir com a grade de tamanhos.');
    const negotiated = item.unitFinalPrice ?? item.negotiatedUnitPrice;
    if (negotiated !== undefined) quoteDecimal(negotiated, 'Preço negociado', 8, 0.01);
    const pricing = PricingEngine.calculateItemPricing({ materialUnitCost, outsourcedSewingUnitCost, customizationUnitCost,
      freightUnitCost, technicalLossPercentage, markupPercentage, negotiatedUnitPrice: negotiated });
    quoteDecimal(pricing.calculatedBaseUnitCost, 'Custo-base calculado', 8);
    quoteDecimal(pricing.suggestedUnitPrice, 'Preço sugerido calculado', 8);
    quoteDecimal(pricing.negotiatedUnitPrice, 'Preço negociado calculado', 8);
    const totalItemPrice = quoteDecimal(money(pricing.negotiatedUnitPrice * quantity), 'Total do item', 10);
    return { id: crypto.randomUUID(), quoteId, category: text(item.category, 'Categoria', 40),
      modelName: text(item.modelName, 'Modelo', 150), fabricName: text(item.fabricName, 'Tecido', 100),
      fabricColor: text(item.fabricColor, 'Cor', 60), sizes: grid, totalQuantity: quantity,
      materialUnitCost, outsourcedSewingUnitCost, customizationUnitCost, freightUnitCost, technicalLossPercentage, markupPercentage,
      calculatedBaseUnitCost: pricing.calculatedBaseUnitCost, suggestedUnitPrice: pricing.suggestedUnitPrice,
      negotiatedUnitPrice: pricing.negotiatedUnitPrice, totalItemPrice,
      customizations: Array.isArray(item.customizations) ? item.customizations : [] };
  });
  const totalBaseCost = money(items.reduce((sum, item) => sum + item.calculatedBaseUnitCost * item.totalQuantity, 0));
  const suggestedTotalAmount = money(items.reduce((sum, item) => sum + item.suggestedUnitPrice * item.totalQuantity, 0));
  const negotiatedTotalAmount = money(items.reduce((sum, item) => sum + item.totalItemPrice, 0));
  quoteDecimal(totalBaseCost, 'Custo-base total', 10);
  quoteDecimal(suggestedTotalAmount, 'Total sugerido', 10);
  quoteDecimal(negotiatedTotalAmount, 'Total negociado', 10);
  const estimatedMarginPercentage = negotiatedTotalAmount > 0 ? money((negotiatedTotalAmount - totalBaseCost) / negotiatedTotalAmount * 100) : 0;
  quoteDecimal(estimatedMarginPercentage, 'Margem estimada', 4, -9999.99);
  const discounted = items.some((item) => item.negotiatedUnitPrice < item.suggestedUnitPrice);
  if (discounted && actor.role !== 'admin') return res.status(403).json({ error: 'Preço abaixo do sugerido exige autorização de administrador.', code: 'DISCOUNT_REQUIRES_ADMIN_APPROVAL' });
  const now = new Date().toISOString();
  // Validar todos os campos do cabeçalho antes de reservar a numeração.
  const header = {
    commercialStatus: oneOf(payload.commercialStatus ?? payload.status ?? 'enviado', ['rascunho', 'enviado', 'em_negociacao', 'aprovado'], 'Status'),
    date: date(payload.date ?? now.slice(0, 10), 'Data'), validUntil: date(payload.validUntil, 'Validade'),
    productionLeadDays: productionDeadline(payload.productionLeadDays, new Date(now)).days,
    acceptanceChannel: oneOf(payload.acceptanceChannel || 'whatsapp', ['whatsapp', 'email', 'presencial'], 'Canal'),
    notes: text(payload.notes, 'Observações', 10000, false),
  };
  const entryAmount = money(negotiatedTotalAmount / 2);
  const quote: QuoteEntity = { id: quoteId, quoteNumber: await sequenceService.nextQuoteNumber(), version: 1,
    clientId: client.id, clientName: client.companyName, clientCnpj: client.cnpj, sellerId: actor.id, sellerName: actor.fullName,
    ...header,
    totalBaseCost, suggestedTotalAmount, negotiatedTotalAmount, markupPercentage: items[0].markupPercentage,
    discountAmount: money(Math.max(0, suggestedTotalAmount - negotiatedTotalAmount)),
    estimatedMarginPercentage,
    belowSuggestedAuthorized: discounted, authorizedById: discounted ? actor.id : undefined,
    authorizedByName: discounted ? actor.fullName : undefined, authorizationDate: discounted ? now : undefined,
    entryPercentage: 50, entryAmount, balanceAmount: money(negotiatedTotalAmount - entryAmount),
    paymentTerms: '50% Sinal (Liberação de Corte) + 50% na Entrega',
    artApproved: false, isLocked: false, isDemo: false, createdAt: now, updatedAt: now, items };
  await quoteRepository.save(quote);
  await auditService.log({ actorId: actor.id, actorName: actor.fullName, actorRole: actor.role, entityName: 'crm.quotes',
    entityId: quote.id, action: 'CREATE_QUOTE', newData: quote });
  res.status(201).json(quote);
}));
quotesRouter.patch('/:id/status', requirePermission('quotes:edit'), atomic(async (req: RequestWithUser, res: Response) => {
  const quote = await quoteRepository.findById(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Proposta não encontrada.' });
  if (quote.isLocked || quote.commercialStatus === 'convertido_em_pedido') return res.status(409).json({ error: 'Proposta convertida está bloqueada.' });
  const previous = quote.commercialStatus;
  quote.commercialStatus = oneOf(req.body.status, ['rascunho', 'enviado', 'em_negociacao', 'aprovado', 'recusado', 'cancelado'], 'Status');
  quote.updatedAt = new Date().toISOString();
  await quoteRepository.save(quote);
  await auditService.log({ actorId: req.user!.id, actorName: req.user!.fullName, actorRole: req.user!.role, entityName: 'crm.quotes',
    entityId: quote.id, action: 'UPDATE_STATUS', oldData: { status: previous }, newData: { status: quote.commercialStatus } });
  res.json(quote);
}));
quotesRouter.post('/:id/convert-to-order', requirePermission('quotes:convert_to_order'), atomic(async (req: RequestWithUser, res: Response) => {
  const quote = await quoteRepository.findById(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Proposta não encontrada.' });
  const existing = await orderRepository.findByQuoteId(quote.id);
  const receivables = (await financeRepository.findByQuoteId(quote.id)).filter((title) => title.type === 'receber' && ['entrada_pedido', 'saldo_entrega'].includes(title.subType));
  if (existing.length || receivables.length || quote.convertedOrderId || quote.commercialStatus === 'convertido_em_pedido') {
    const orderIds = new Set(existing.map((order) => order.id));
    const complete = quote.isLocked && quote.commercialStatus === 'convertido_em_pedido' &&
      orderIds.has(quote.convertedOrderId || '') && quote.items.length > 0 && existing.length === quote.items.length &&
      new Set(existing.map((order) => order.quoteItemId)).size === quote.items.length &&
      existing.every((order) => order.quoteVersion === quote.version && order.clientId === quote.clientId &&
        quote.items.some((item) => item.id === order.quoteItemId && item.totalQuantity === order.totalPieces)) &&
      receivables.length === 2 && ['entrada_pedido', 'saldo_entrega'].every((kind) => {
        const matches = receivables.filter((title) => title.subType === kind);
        return matches.length === 1 && orderIds.has(matches[0].productionOrderId || '') && Number.isFinite(matches[0].amount) && matches[0].amount > 0 &&
          matches[0].amount === (kind === 'entrada_pedido' ? quote.entryAmount : quote.balanceAmount);
      });
    if (!complete) return res.status(409).json({ error: 'Histórico de conversão incompleto ou divergente. Reconcilie os vínculos da proposta, OPs e títulos antes de continuar.', code: 'QUOTE_CONVERSION_INCOMPLETE' });
    return res.json({ success: true, alreadyConverted: true, order: existing.find((order) => order.id === quote.convertedOrderId), orders: existing, financeTransactions: receivables });
  }
  if (quote.commercialStatus !== 'aprovado' || quote.isLocked) return res.status(409).json({ error: 'A proposta precisa estar aprovada para conversão.' });
  if (!quote.items.length) throw new InputError('Proposta sem itens.');
  const validMoney = (value: number) => Number.isFinite(value) && value >= 0 && value <= 9999999999.99 && money(value) === value;
  const total = quote.negotiatedTotalAmount;
  const itemTotal = money(quote.items.reduce((sum, item) => sum + item.totalItemPrice, 0));
  if (![total, quote.entryAmount, quote.balanceAmount].every((value) => validMoney(value) && value > 0) ||
      !quote.items.every((item) => validMoney(item.totalItemPrice)) || quote.entryPercentage !== 50 ||
      total !== itemTotal || quote.entryAmount !== money(total / 2) || quote.balanceAmount !== money(total - quote.entryAmount)) {
    return res.status(409).json({ error: 'Valores da proposta incompatíveis com a conversão: confira o total dos itens e duas parcelas positivas de sinal e saldo conforme o percentual de 50%.', code: 'QUOTE_FINANCIAL_CONFLICT' });
  }
  const now = new Date().toISOString();
  const delivery = productionDeadline(quote.productionLeadDays, new Date(now)).deliveryDate;
  const orders: ProductionOrderEntity[] = [];
  for (const item of quote.items) {
    const order: ProductionOrderEntity = { revision: 1, id: crypto.randomUUID(), orderNumber: await sequenceService.nextOrderNumber(),
      quoteId: quote.id, quoteItemId: item.id, quoteVersion: quote.version,
      idempotencyKey: `convert_${quote.id}_v${quote.version}_${item.id}`, clientId: quote.clientId, clientName: quote.clientName,
      itemTitle: item.modelName, category: item.category, fabricName: item.fabricName, fabricColor: item.fabricColor,
      sizes: item.sizes, totalPieces: item.totalQuantity, customizations: item.customizations || [], commercialStatus: 'aprovado',
      financialStatus: 'entrada_pendente', stage: 'aguardando_liberacao', artApproved: quote.artApproved,
      artApprovedBy: quote.artApprovedBy, artApprovalDate: quote.artApprovalDate, entryPaymentConfirmed: false,
      priority: 'normal', creationDate: now.slice(0, 10), targetDeliveryDate: delivery,
      technicalNotes: `Proposta ${quote.quoteNumber}, item ${item.modelName}. ${quote.notes || ''}`, assignedTeam: '',
      isDemo: quote.isDemo, createdAt: now, updatedAt: now };
    await orderRepository.save(order);
    orders.push(order);
  }
  const titles: FinancialTransactionEntity[] = [];
  for (const subType of ['entrada_pedido', 'saldo_entrega'] as const) {
    const title: FinancialTransactionEntity = { id: crypto.randomUUID(), transactionNumber: await sequenceService.nextFinanceNumber(),
      productionOrderId: orders[0].id, quoteId: quote.id, type: 'receber', subType, description: `${subType === 'entrada_pedido' ? 'Sinal' : 'Saldo'} 50% - ${quote.quoteNumber}`,
      category: 'Venda de Uniformes', amount: subType === 'entrada_pedido' ? quote.entryAmount : quote.balanceAmount,
      dueDate: subType === 'entrada_pedido' ? now.slice(0, 10) : delivery, status: 'pendente', paymentMethod: 'pix',
      referenceId: quote.quoteNumber, isDemo: quote.isDemo, createdAt: now, updatedAt: now };
    await financeRepository.save(title);
    titles.push(title);
  }
  quote.commercialStatus = 'convertido_em_pedido'; quote.convertedOrderId = orders[0].id; quote.isLocked = true; quote.updatedAt = now;
  await quoteRepository.save(quote);
  await auditService.log({ actorId: req.user!.id, actorName: req.user!.fullName, actorRole: req.user!.role, entityName: 'crm.quotes',
    entityId: quote.id, action: 'CONVERT_QUOTE_TO_ORDER', newData: { orderIds: orders.map((o) => o.id), titleIds: titles.map((t) => t.id) } });
  res.status(201).json({ success: true, alreadyConverted: false, order: orders[0], orders, financeTransactions: titles });
}));
quotesRouter.delete('/:id', requirePermission('quotes:delete'), atomic(async (req: RequestWithUser, res: Response) => {
  const quote = await quoteRepository.findById(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Proposta não encontrada.' });
  if (quote.isLocked || await quoteRepository.hasHistory(quote.id)) return res.status(409).json({ error: 'Proposta com vínculo de produção, financeiro ou lead não pode ser excluída.' });
  await quoteRepository.delete(quote.id);
  await auditService.log({ actorId: req.user!.id, actorName: req.user!.fullName, actorRole: req.user!.role, entityName: 'crm.quotes', entityId: quote.id, action: 'DELETE_QUOTE' });
  res.json({ success: true });
}));
