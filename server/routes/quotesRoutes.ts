import { Router, Response } from 'express';
import { RequestWithUser, requirePermission } from '../auth/rbac';
import { db } from '../db/connection';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';
import { PricingEngine } from '../services/pricingEngine';
import { QuoteEntity, QuoteItemEntity, ProductionOrderEntity, FinancialTransactionEntity } from '../types/db';

export const quotesRouter = Router();

// Listar orçamentos
quotesRouter.get('/', (req: RequestWithUser, res: Response) => {
  const allQuotes = Array.from(db.quotes.values());
  res.json(allQuotes);
});

// Buscar orçamento por ID
quotesRouter.get('/:id', (req: RequestWithUser, res: Response) => {
  const quote = db.quotes.get(req.params.id);
  if (!quote) {
    return res.status(404).json({ error: 'Orçamento não encontrado' });
  }
  res.json(quote);
});

// Criar nova proposta comercial
quotesRouter.post('/', (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const payload = req.body;

  // 1. Validar Portão Comercial: Sinal de 50% obrigatório e fixado (Regra A.3.2)
  if (payload.entryPercentage !== undefined && !PricingEngine.validateEntryPercentage(payload.entryPercentage)) {
    return res.status(400).json({
      error: 'Invariante violada: O percentual de sinal está fixado em 50.00% conforme o PRD v1.6 e Adendo A.3.2. Não é permitida alteração sem autorização formal da diretoria.',
    });
  }

  // 2. Processar itens através do motor de cálculo de markup
  const processedItems: QuoteItemEntity[] = (payload.items || []).map((it: any, idx: number) => {
    const pricing = PricingEngine.calculateItemPricing({
      materialUnitCost: it.costBreakdown?.materialUnitCost || it.materialUnitCost,
      outsourcedSewingUnitCost: it.costBreakdown?.outsourcedSewingUnitCost || it.outsourcedSewingUnitCost,
      customizationUnitCost: it.costBreakdown?.customizationUnitCost || it.customizationUnitCost,
      freightUnitCost: it.costBreakdown?.freightPerUnit || it.freightUnitCost,
      technicalLossPercentage: it.costBreakdown?.technicalLossPercentage || it.technicalLossPercentage || 2.0,
      markupPercentage: it.costBreakdown?.markupPercentage || it.markupPercentage || 50.0,
      negotiatedUnitPrice: it.unitFinalPrice || it.negotiatedUnitPrice,
    });

    return {
      id: it.id || `qi-${Date.now()}-${idx}`,
      quoteId: '',
      category: it.category || 'polos',
      modelName: it.modelName || 'Uniforme Profissional',
      fabricName: it.fabricName || 'Padrão DE FARDAS',
      fabricColor: it.fabricColor || 'Padrão',
      sizes: it.sizes || { pp: 0, p: 0, m: 0, g: 0, gg: 0, xg: 0, exg: 0, sobMedida: 0 },
      totalQuantity: it.totalQuantity || 1,
      materialUnitCost: pricing.directUnitCost,
      outsourcedSewingUnitCost: it.costBreakdown?.outsourcedSewingUnitCost || 0,
      customizationUnitCost: it.costBreakdown?.customizationUnitCost || 0,
      freightUnitCost: it.costBreakdown?.freightPerUnit || 0,
      technicalLossPercentage: it.costBreakdown?.technicalLossPercentage || 2.0,
      calculatedBaseUnitCost: pricing.calculatedBaseUnitCost,
      markupPercentage: it.costBreakdown?.markupPercentage || 50.0,
      suggestedUnitPrice: pricing.suggestedUnitPrice,
      negotiatedUnitPrice: pricing.negotiatedUnitPrice,
      totalItemPrice: Math.round(pricing.negotiatedUnitPrice * (it.totalQuantity || 1) * 100) / 100,
      customizations: it.customizations || [],
    };
  });

  const totalBaseCost = processedItems.reduce((sum, item) => sum + (item.calculatedBaseUnitCost * item.totalQuantity), 0);
  const suggestedTotalAmount = processedItems.reduce((sum, item) => sum + (item.suggestedUnitPrice * item.totalQuantity), 0);
  const negotiatedTotalAmount = processedItems.reduce((sum, item) => sum + item.totalItemPrice, 0);
  const discountAmount = Math.max(0, suggestedTotalAmount - negotiatedTotalAmount);
  
  const estimatedMarginPercentage = negotiatedTotalAmount > 0
    ? Math.round(((negotiatedTotalAmount - totalBaseCost) / negotiatedTotalAmount) * 10000) / 100
    : 0;

  // 3. Validação de Alçada para Preço Negociado < Preço Sugerido (Adendo B.2.5)
  const isBelowSuggested = negotiatedTotalAmount < suggestedTotalAmount;
  let belowSuggestedAuthorized = false;
  let authorizedById = undefined;
  let authorizedByName = undefined;

  if (isBelowSuggested) {
    if (actor.role === 'admin') {
      belowSuggestedAuthorized = true;
      authorizedById = actor.id;
      authorizedByName = `${actor.fullName} (Administrador)`;
    } else if (payload.belowSuggestedAuthorized && payload.authorizedByName) {
      // Autorização passada por administrador
      belowSuggestedAuthorized = true;
      authorizedByName = payload.authorizedByName;
    } else {
      return res.status(403).json({
        error: `Alçada violada: O valor negociado (R$ ${negotiatedTotalAmount.toFixed(2)}) é inferior ao preço sugerido (R$ ${suggestedTotalAmount.toFixed(2)}). Exige autorização formal de Administrador conforme PRD v1.6 Adendo B.2.5.`,
      });
    }
  }

  const quoteId = `quote-${Date.now()}`;
  const quoteNumber = sequenceService.nextQuoteNumber();
  const entryAmount = Math.round((negotiatedTotalAmount * 0.5) * 100) / 100;
  const balanceAmount = negotiatedTotalAmount - entryAmount;

  const newQuote: QuoteEntity = {
    id: quoteId,
    quoteNumber,
    version: 1,
    clientId: payload.clientId || 'c1111111-1111-1111-1111-111111111111',
    clientName: payload.clientName || 'Cliente Modelo',
    clientCnpj: payload.clientCnpj || '00.000.000/0001-00',
    sellerId: actor.id,
    sellerName: actor.fullName,
    commercialStatus: payload.commercialStatus || 'enviado',
    date: payload.date || new Date().toISOString().split('T')[0],
    validUntil: payload.validUntil || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
    totalBaseCost,
    markupPercentage: 50.0,
    suggestedTotalAmount,
    negotiatedTotalAmount,
    discountAmount,
    estimatedMarginPercentage,
    belowSuggestedAuthorized,
    authorizedById,
    authorizedByName,
    authorizationDate: belowSuggestedAuthorized ? new Date().toISOString() : undefined,
    authorizationNotes: payload.authorizationNotes,
    entryPercentage: 50.00,
    entryAmount,
    balanceAmount,
    paymentTerms: '50% Sinal (Liberação de Corte) + 50% na Entrega',
    productionLeadDays: payload.productionLeadDays || 16,
    artApproved: !!payload.artApproved,
    artApprovedBy: payload.artApprovedBy,
    artApprovalDate: payload.artApproved ? new Date().toISOString() : undefined,
    acceptanceChannel: payload.acceptanceChannel || 'whatsapp',
    acceptanceNotes: payload.acceptanceNotes,
    notes: payload.notes || '',
    isLocked: false,
    isDemo: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: processedItems.map((it) => ({ ...it, quoteId })),
  };

  db.quotes.set(newQuote.id, newQuote);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'crm.quotes',
    entityId: newQuote.quoteNumber,
    action: 'CREATE_QUOTE',
    newData: {
      quoteNumber: newQuote.quoteNumber,
      totalAmount: newQuote.negotiatedTotalAmount,
      entryAmount: newQuote.entryAmount,
      isBelowSuggested,
      belowSuggestedAuthorized,
    },
    notes: `Proposta comercial ${newQuote.quoteNumber} criada para ${newQuote.clientName}.`,
  });

  res.status(201).json(newQuote);
});

// Atualizar status comercial
quotesRouter.patch('/:id/status', (req: RequestWithUser, res: Response) => {
  const quote = db.quotes.get(req.params.id);
  if (!quote) {
    return res.status(404).json({ error: 'Orçamento não encontrado' });
  }

  const oldStatus = quote.commercialStatus;
  const newStatus = req.body.status;
  quote.commercialStatus = newStatus;
  quote.updatedAt = new Date().toISOString();

  auditService.log({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    entityName: 'crm.quotes',
    entityId: quote.quoteNumber,
    action: 'UPDATE_STATUS',
    oldData: { status: oldStatus },
    newData: { status: newStatus },
    notes: `Status da proposta ${quote.quoteNumber} alterado de ${oldStatus} para ${newStatus}.`,
  });

  res.json(quote);
});

// Conversão IDEMPOTENTE de Orçamento em Pedido / Ordem de Produção (Regra B.2.2 & Gate A.3.2)
quotesRouter.post('/:id/convert-to-order', (req: RequestWithUser, res: Response) => {
  const quote = db.quotes.get(req.params.id);
  if (!quote) {
    return res.status(404).json({ error: 'Orçamento não encontrado' });
  }

  // Idempotency Key
  const customIdempotencyKey = req.headers['idempotency-key'] as string;
  const idempotencyKey = customIdempotencyKey || `convert_quote_${quote.id}_v${quote.version}`;

  // Verificar se já existe uma OP gerada com esta idempotencyKey
  const existingOrder = Array.from(db.orders.values()).find(
    (o) => o.idempotencyKey === idempotencyKey || o.quoteId === quote.id
  );

  if (existingOrder) {
    return res.status(200).json({
      success: true,
      alreadyConverted: true,
      message: `Idempotência garantida: A proposta comercial ${quote.quoteNumber} já foi convertida na OP ${existingOrder.orderNumber}.`,
      order: existingOrder,
    });
  }

  const orderNumber = sequenceService.nextOrderNumber();
  const orderId = `op-${Date.now()}`;
  const firstItem = quote.items[0] || {
    modelName: 'Fardamento Confeccionado',
    category: 'polos',
    fabricName: 'Padrão Homologado',
    fabricColor: 'Padrão',
    sizes: { pp: 0, p: 0, m: 0, g: 0, gg: 0, xg: 0, exg: 0, sobMedida: 0 },
    totalQuantity: 100,
  };

  const totalPieces = quote.items.reduce((sum, item) => sum + item.totalQuantity, 0);

  // Criar Ordem de Produção no PCP com Portão A.3.2: stage inicial 'aguardando_liberacao'
  const newOrder: ProductionOrderEntity = {
    id: orderId,
    orderNumber,
    quoteId: quote.id,
    quoteVersion: quote.version,
    idempotencyKey,
    clientId: quote.clientId,
    clientName: quote.clientName,
    itemTitle: firstItem.modelName,
    category: firstItem.category,
    fabricName: firstItem.fabricName,
    fabricColor: firstItem.fabricColor,
    sizes: firstItem.sizes,
    totalPieces,
    customizations: firstItem.customizations || [],
    commercialStatus: 'aprovado',
    financialStatus: 'entrada_pendente', // Bloqueado até confirmar sinal de 50%!
    stage: 'aguardando_liberacao',       // Gate A.3.2
    artApproved: quote.artApproved,
    artApprovalDate: quote.artApprovalDate,
    artApprovedBy: quote.artApprovedBy,
    entryPaymentConfirmed: false,        // Portão rígido do PRD
    priority: 'normal',
    creationDate: new Date().toISOString().split('T')[0],
    targetDeliveryDate: new Date(Date.now() + quote.productionLeadDays * 86400000).toISOString().split('T')[0],
    technicalNotes: `Gerado a partir da Proposta Comercial ${quote.quoteNumber}. ${quote.notes || ''}`,
    assignedTeam: 'Mesa de Corte & Facção Terceirizada',
    isDemo: quote.isDemo,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.orders.set(newOrder.id, newOrder);

  // Lançamentos Financeiros Idempotentes: Sinal de 50% + Saldo na Entrega
  const finSinalNumber = sequenceService.nextFinanceNumber();
  const finSinal: FinancialTransactionEntity = {
    id: `fin-${Date.now()}-sinal`,
    transactionNumber: finSinalNumber,
    productionOrderId: newOrder.id,
    quoteId: quote.id,
    type: 'receber',
    subType: 'entrada_pedido',
    description: `Sinal 50% - Proposta ${quote.quoteNumber} (${quote.clientName})`,
    category: 'Venda de Uniformes',
    amount: quote.entryAmount,
    dueDate: new Date().toISOString().split('T')[0],
    status: 'pendente',
    paymentMethod: 'pix',
    referenceId: newOrder.orderNumber,
    isDemo: quote.isDemo,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const finSaldoNumber = sequenceService.nextFinanceNumber();
  const finSaldo: FinancialTransactionEntity = {
    id: `fin-${Date.now()}-saldo`,
    transactionNumber: finSaldoNumber,
    productionOrderId: newOrder.id,
    quoteId: quote.id,
    type: 'receber',
    subType: 'saldo_entrega',
    description: `Saldo 50% na Entrega - Proposta ${quote.quoteNumber} (${quote.clientName})`,
    category: 'Venda de Uniformes',
    amount: quote.balanceAmount,
    dueDate: newOrder.targetDeliveryDate,
    status: 'pendente',
    paymentMethod: 'boleto',
    referenceId: newOrder.orderNumber,
    isDemo: quote.isDemo,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.finance.set(finSinal.id, finSinal);
  db.finance.set(finSaldo.id, finSaldo);

  // Atualizar a proposta como convertida
  quote.commercialStatus = 'convertido_em_pedido';
  quote.convertedOrderId = newOrder.id;
  quote.isLocked = true;
  quote.updatedAt = new Date().toISOString();

  auditService.log({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    entityName: 'producao.production_orders',
    entityId: newOrder.orderNumber,
    action: 'CONVERT_QUOTE_TO_ORDER',
    newData: {
      orderNumber: newOrder.orderNumber,
      quoteNumber: quote.quoteNumber,
      totalPieces: newOrder.totalPieces,
      financialStatus: newOrder.financialStatus,
      stage: newOrder.stage,
      sinalTransaction: finSinal.transactionNumber,
      saldoTransaction: finSaldo.transactionNumber,
    },
    notes: `Proposta ${quote.quoteNumber} convertida com sucesso na OP ${newOrder.orderNumber}. Títulos financeiros de 50% gerados.`,
  });

  res.status(201).json({
    success: true,
    alreadyConverted: false,
    message: `Proposta ${quote.quoteNumber} convertida na OP ${newOrder.orderNumber}. A OP está em 'aguardando_liberacao' até quitação do sinal de 50% e aprovação de arte.`,
    order: newOrder,
    financeTransactions: [finSinal, finSaldo],
  });
});

// Excluir proposta
quotesRouter.delete('/:id', requirePermission('quotes:delete'), (req: RequestWithUser, res: Response) => {
  const quote = db.quotes.get(req.params.id);
  if (!quote) {
    return res.status(404).json({ error: 'Orçamento não encontrado' });
  }

  if (quote.commercialStatus === 'convertido_em_pedido') {
    return res.status(400).json({ error: 'Não é permitido excluir uma proposta já convertida em Ordem de Produção.' });
  }

  db.quotes.delete(req.params.id);

  auditService.log({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    entityName: 'crm.quotes',
    entityId: quote.quoteNumber,
    action: 'DELETE_QUOTE',
    notes: `Proposta comercial ${quote.quoteNumber} excluída.`,
  });

  res.json({ success: true, message: 'Proposta excluída com sucesso' });
});
