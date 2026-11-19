import { Router, Response } from 'express';
import crypto from 'crypto';
import { AuthenticatedUser, RequestWithUser, requireAuth, requirePermission } from '../auth/rbac';
import { quoteRepository } from '../repositories/quoteRepository';
import { clientRepository } from '../repositories/clientRepository';
import { orderRepository } from '../repositories/orderRepository';
import { financeRepository } from '../repositories/financeRepository';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';
import { PricingEngine } from '../services/pricingEngine';
import { QuoteEntity, QuoteItemEntity, ProductionOrderEntity, FinancialTransactionEntity } from '../types/db';

export const quotesRouter = Router();

const VALID_COMMERCIAL_STATUSES = new Set([
  'rascunho',
  'enviado',
  'em_negociacao',
  'aprovado',
  'recusado',
  'cancelado',
]);

const VALID_ACCEPTANCE_CHANNELS = new Set(['whatsapp', 'email', 'presencial']);
const DEFAULT_PAYMENT_TERMS = '50% Sinal (Liberação de Corte) + 50% na Entrega';

// Trava de concorrência em voo para garantir idempotência absoluta em cliques duplos simultâneos
const convertingQuoteIds = new Set<string>();

function sanitizeSizeGrid(rawSizes: any) {
  const s = rawSizes || {};
  return {
    pp: Math.max(0, Math.floor(Number(s.pp || 0))),
    p: Math.max(0, Math.floor(Number(s.p || 0))),
    m: Math.max(0, Math.floor(Number(s.m || 0))),
    g: Math.max(0, Math.floor(Number(s.g || 0))),
    gg: Math.max(0, Math.floor(Number(s.gg || 0))),
    xg: Math.max(0, Math.floor(Number(s.xg || 0))),
    exg: Math.max(0, Math.floor(Number(s.exg || 0))),
    sobMedida: Math.max(0, Math.floor(Number(s.sobMedida || 0))),
  };
}

function buildValidatedItems(rawItems: any[], quoteId: string): {
  processedItems: QuoteItemEntity[];
  itemsBelowBaseCost: QuoteItemEntity[];
} {
  const itemsBelowBaseCost: QuoteItemEntity[] = [];

  const processedItems: QuoteItemEntity[] = rawItems.map((it: any, idx: number) => {
    const modelName = String(it.modelName || '').trim() || `Uniforme Profissional #${idx + 1}`;
    const materialUnitCost = Number(it.costBreakdown?.materialUnitCost ?? it.materialUnitCost ?? 0);
    const outsourcedSewingUnitCost = Number(
      it.costBreakdown?.outsourcedSewingUnitCost ?? it.outsourcedSewingUnitCost ?? 0
    );
    const customizationUnitCost = Number(
      it.costBreakdown?.customizationUnitCost ?? it.customizationUnitCost ?? 0
    );
    const freightUnitCost = Number(it.costBreakdown?.freightPerUnit ?? it.freightUnitCost ?? 0);
    const technicalLossPercentage = Number(
      it.costBreakdown?.technicalLossPercentage ?? it.technicalLossPercentage ?? 2.0
    );
    const markupPercentage = Number(
      it.costBreakdown?.markupPercentage ?? it.markupPercentage ?? 50.0
    );

    const sizes = sanitizeSizeGrid(it.sizes);
    const gridTotal = Object.values(sizes).reduce((sum, v) => sum + v, 0);
    const fallbackQty = Math.floor(Number(it.totalQuantity ?? 0));
    const totalQuantity = gridTotal > 0 ? gridTotal : fallbackQty;

    if (!Number.isFinite(totalQuantity) || totalQuantity <= 0) {
      throw new Error(
        `Quantidade inválida no item "${modelName}". Informe ao menos 1 peça na grade de tamanhos.`
      );
    }

    const rawNegotiated =
      it.costBreakdown?.negotiatedUnitPrice !== undefined
        ? it.costBreakdown.negotiatedUnitPrice
        : it.unitFinalPrice !== undefined
        ? it.unitFinalPrice
        : it.negotiatedUnitPrice;

    const pricing = PricingEngine.calculateItemPricing({
      materialUnitCost,
      outsourcedSewingUnitCost,
      customizationUnitCost,
      freightUnitCost,
      technicalLossPercentage,
      markupPercentage,
      negotiatedUnitPrice: rawNegotiated,
    });

    const entity: QuoteItemEntity = {
      id: typeof it.id === 'string' && /^[0-9a-f-]{36}$/i.test(it.id) ? it.id : crypto.randomUUID(),
      quoteId,
      category: String(it.category || 'polos'),
      modelName,
      fabricName: String(it.fabricName || 'Padrão DE FARDAS').trim(),
      fabricColor: String(it.fabricColor || 'Padrão').trim(),
      sizes,
      totalQuantity,
      materialUnitCost: Math.round(materialUnitCost * 100) / 100,
      outsourcedSewingUnitCost: Math.round(outsourcedSewingUnitCost * 100) / 100,
      customizationUnitCost: Math.round(customizationUnitCost * 100) / 100,
      freightUnitCost: Math.round(freightUnitCost * 100) / 100,
      technicalLossPercentage: Math.round(technicalLossPercentage * 100) / 100,
      calculatedBaseUnitCost: pricing.calculatedBaseUnitCost,
      markupPercentage: Math.round(markupPercentage * 100) / 100,
      suggestedUnitPrice: pricing.suggestedUnitPrice,
      negotiatedUnitPrice: pricing.negotiatedUnitPrice,
      totalItemPrice: Math.round(pricing.negotiatedUnitPrice * totalQuantity * 100) / 100,
      customizations: Array.isArray(it.customizations) ? it.customizations : [],
    };

    if (pricing.isBelowBaseCost) {
      itemsBelowBaseCost.push(entity);
    }

    return entity;
  });

  return { processedItems, itemsBelowBaseCost };
}

function validateDiscountAuthorization(
  actor: AuthenticatedUser,
  processedItems: QuoteItemEntity[],
  negotiatedTotalAmount: number,
  suggestedTotalAmount: number,
  entityRef: string
):
  | {
      allowed: true;
      isBelowSuggested: boolean;
      belowSuggestedAuthorized: boolean;
      authorizedById?: string;
      authorizedByName?: string;
    }
  | {
      allowed: false;
      statusCode: 403;
      body: Record<string, any>;
    } {
  const itemsBelowSuggested = processedItems.filter(
    (item) => item.negotiatedUnitPrice < item.suggestedUnitPrice
  );
  const isBelowSuggested =
    itemsBelowSuggested.length > 0 || negotiatedTotalAmount < suggestedTotalAmount;

  if (!isBelowSuggested) {
    return {
      allowed: true,
      isBelowSuggested: false,
      belowSuggestedAuthorized: false,
    };
  }

  if (actor.role === 'admin') {
    return {
      allowed: true,
      isBelowSuggested: true,
      belowSuggestedAuthorized: true,
      authorizedById: actor.id,
      authorizedByName: `${actor.fullName} (Administrador)`,
    };
  }

  const formatBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const flaggedItemsSummary = itemsBelowSuggested
    .map((it) => `${it.modelName} (${formatBRL(it.negotiatedUnitPrice)} < ${formatBRL(it.suggestedUnitPrice)})`)
    .join('; ');

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'crm.quotes',
    entityId: entityRef,
    action: 'UNAUTHORIZED_DISCOUNT_ATTEMPT',
    notes: `Tentativa de praticar preço abaixo do sugerido sem aprovação de Administrador. Itens: ${
      flaggedItemsSummary || `Total ${formatBRL(negotiatedTotalAmount)} < ${formatBRL(suggestedTotalAmount)}`
    }.`,
  });

  return {
    allowed: false,
    statusCode: 403,
    body: {
      error: `Alçada violada: Há item(ns) com preço negociado inferior ao preço sugerido (${
        flaggedItemsSummary || `Total ${formatBRL(negotiatedTotalAmount)} < ${formatBRL(suggestedTotalAmount)}`
      }). Exige autorização formal de Administrador conforme PRD v1.6 Adendo B.2.5.`,
      code: 'DISCOUNT_REQUIRES_ADMIN_APPROVAL',
      negotiatedTotalAmount,
      suggestedTotalAmount,
      itemsBelowSuggested: itemsBelowSuggested.map((it) => ({
        modelName: it.modelName,
        negotiatedUnitPrice: it.negotiatedUnitPrice,
        suggestedUnitPrice: it.suggestedUnitPrice,
      })),
    },
  };
}

// Exigir autenticação e permissão de visualização comercial (protege custos e margens)
quotesRouter.use(requireAuth);
quotesRouter.use(requirePermission('quotes:view'));

// Listar orçamentos
quotesRouter.get('/', async (_req: RequestWithUser, res: Response) => {
  const allQuotes = await quoteRepository.findAll();
  res.json(allQuotes);
});

// Buscar orçamento por ID
quotesRouter.get('/:id', async (req: RequestWithUser, res: Response) => {
  const quote = await quoteRepository.findById(req.params.id);
  if (!quote) {
    return res.status(404).json({ error: 'Orçamento não encontrado' });
  }
  res.json(quote);
});

// Criar nova proposta comercial
quotesRouter.post('/', requirePermission('quotes:create'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const payload = req.body || {};

  // 1. Validar Portão Comercial: Sinal de 50% obrigatório e fixado (Regra A.3.2)
  if (payload.entryPercentage !== undefined && !PricingEngine.validateEntryPercentage(payload.entryPercentage)) {
    return res.status(400).json({
      error: 'Invariante violada: O percentual de sinal está fixado em 50.00% conforme o PRD v1.6 e Adendo A.3.2. Não é permitida alteração sem autorização formal da diretoria.',
    });
  }

  if (!payload.clientId || typeof payload.clientId !== 'string' || !payload.clientId.trim()) {
    return res.status(400).json({
      error: 'Cliente obrigatório: informe clientId válido para emitir a proposta comercial.',
    });
  }

  const leadDays = Number(payload.productionLeadDays ?? 16);
  if (!Number.isFinite(leadDays) || leadDays < 1 || leadDays > 365) {
    return res.status(400).json({ error: 'Prazo de fabricação deve estar entre 1 e 365 dias úteis.' });
  }

  const issueDate =
    typeof payload.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
      ? payload.date
      : new Date().toISOString().split('T')[0];
  const validUntil =
    typeof payload.validUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.validUntil)
      ? payload.validUntil
      : new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0];

  if (validUntil < issueDate) {
    return res.status(400).json({
      error: 'A data de validade da proposta não pode ser anterior à data de emissão.',
    });
  }

  // 2. Processar itens através do motor de cálculo de markup (Adendo B.2.1)
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  if (rawItems.length === 0) {
    return res.status(400).json({ error: 'A proposta comercial deve conter ao menos um item.' });
  }

  const quoteId = crypto.randomUUID();
  let processedItems: QuoteItemEntity[];
  let itemsBelowBaseCost: QuoteItemEntity[];
  try {
    const built = buildValidatedItems(rawItems, quoteId);
    processedItems = built.processedItems;
    itemsBelowBaseCost = built.itemsBelowBaseCost;
  } catch (err: any) {
    return res.status(400).json({
      error: err.message || 'Dados de precificação inválidos nos itens da proposta.',
    });
  }

  const totals = PricingEngine.calculateQuoteTotals(processedItems);

  // 3. Validação de Alçada ITEM A ITEM e no TOTAL (Adendo B.2.5)
  const authCheck = validateDiscountAuthorization(
    actor,
    processedItems,
    totals.negotiatedTotalAmount,
    totals.suggestedTotalAmount,
    'new_quote'
  );
  if (!authCheck.allowed) {
    return res.status(authCheck.statusCode).json(authCheck.body);
  }

  // Enriquecer dados canônicos do cliente a partir do repositório quando disponível
  const clientRecord = await clientRepository.findById(payload.clientId.trim());
  const clientName = clientRecord?.companyName || String(payload.clientName || 'Cliente B2B').trim();
  const clientCnpj = clientRecord?.cnpj || String(payload.clientCnpj || '00.000.000/0001-00').trim();

  const quoteNumber = await sequenceService.nextQuoteNumberAsync();
  const requestedStatus = payload.commercialStatus || payload.status;
  const initialStatus = VALID_COMMERCIAL_STATUSES.has(requestedStatus) ? requestedStatus : 'enviado';
  const acceptanceChannel = VALID_ACCEPTANCE_CHANNELS.has(payload.acceptanceChannel)
    ? payload.acceptanceChannel
    : 'whatsapp';

  const customPaymentTerms =
    typeof payload.paymentTerms === 'string' && payload.paymentTerms.trim().length > 0
      ? payload.paymentTerms.trim()
      : DEFAULT_PAYMENT_TERMS;

  const acceptanceNotes =
    typeof payload.acceptanceNotes === 'string' && payload.acceptanceNotes.trim()
      ? payload.acceptanceNotes.trim()
      : typeof payload.whatsAppProof?.notes === 'string'
      ? payload.whatsAppProof.notes.trim()
      : undefined;

  const nowIso = new Date().toISOString();

  const newQuote: QuoteEntity = {
    id: quoteId,
    quoteNumber,
    version: 1,
    clientId: payload.clientId.trim(),
    clientName,
    clientCnpj,
    sellerId: actor.id,
    sellerName: actor.fullName,
    commercialStatus: initialStatus,
    date: issueDate,
    validUntil,
    totalBaseCost: totals.totalBaseCost,
    markupPercentage: totals.effectiveMarkupPercentage,
    suggestedTotalAmount: totals.suggestedTotalAmount,
    negotiatedTotalAmount: totals.negotiatedTotalAmount,
    discountAmount: totals.discountAmount,
    estimatedMarginPercentage: totals.estimatedMarginPercentage,
    belowSuggestedAuthorized: authCheck.belowSuggestedAuthorized,
    authorizedById: authCheck.authorizedById,
    authorizedByName: authCheck.authorizedByName,
    authorizationDate: authCheck.belowSuggestedAuthorized ? nowIso : undefined,
    authorizationNotes:
      typeof payload.authorizationNotes === 'string' && payload.authorizationNotes.trim()
        ? payload.authorizationNotes.trim()
        : itemsBelowBaseCost.length > 0
        ? 'Atenção: proposta autorizada por Administrador com item abaixo do custo-base.'
        : undefined,
    entryPercentage: 50.00,
    entryAmount: totals.entryAmount,
    balanceAmount: totals.balanceAmount,
    paymentTerms: customPaymentTerms,
    productionLeadDays: Math.floor(leadDays),
    artApproved: Boolean(payload.artApproved),
    artApprovedBy: payload.artApproved ? String(payload.artApprovedBy || actor.fullName) : undefined,
    artApprovalDate: payload.artApproved ? nowIso : undefined,
    acceptanceChannel,
    acceptanceNotes,
    acceptanceTimestamp: payload.whatsAppProof?.timestamp || nowIso,
    notes: typeof payload.notes === 'string' ? payload.notes.trim() : '',
    isLocked: false,
    isDemo: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    items: processedItems,
  };

  await quoteRepository.save(newQuote);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'crm.quotes',
    entityId: newQuote.quoteNumber,
    action: 'CREATE_QUOTE',
    newData: {
      quoteNumber: newQuote.quoteNumber,
      version: newQuote.version,
      totalAmount: newQuote.negotiatedTotalAmount,
      entryAmount: newQuote.entryAmount,
      estimatedMarginPercentage: newQuote.estimatedMarginPercentage,
      isBelowSuggested: authCheck.isBelowSuggested,
      belowSuggestedAuthorized: authCheck.belowSuggestedAuthorized,
      hasBelowBaseCostItem: itemsBelowBaseCost.length > 0,
    },
    notes: `Proposta comercial ${newQuote.quoteNumber} v${newQuote.version} criada para ${newQuote.clientName}.`,
  });

  res.status(201).json(newQuote);
});

// Revisar / Editar proposta comercial aberta (incrementa versão com recálculo obrigatório e alçada B.2.5)
quotesRouter.put('/:id', requirePermission('quotes:edit'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const existing = await quoteRepository.findById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Orçamento não encontrado' });
  }

  if (existing.isLocked || existing.commercialStatus === 'convertido_em_pedido') {
    return res.status(409).json({
      error: 'Proposta bloqueada: Propostas já convertidas em Ordem de Produção são imutáveis.',
      code: 'QUOTE_LOCKED',
    });
  }

  const payload = req.body || {};

  if (payload.entryPercentage !== undefined && !PricingEngine.validateEntryPercentage(payload.entryPercentage)) {
    return res.status(400).json({
      error: 'Invariante violada: O percentual de sinal está fixado em 50.00% conforme o PRD v1.6 e Adendo A.3.2.',
    });
  }

  const leadDays = Number(payload.productionLeadDays ?? existing.productionLeadDays);
  if (!Number.isFinite(leadDays) || leadDays < 1 || leadDays > 365) {
    return res.status(400).json({ error: 'Prazo de fabricação deve estar entre 1 e 365 dias úteis.' });
  }

  const validUntil =
    typeof payload.validUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.validUntil)
      ? payload.validUntil
      : existing.validUntil;

  if (validUntil < existing.date) {
    return res.status(400).json({
      error: 'A data de validade da proposta não pode ser anterior à data de emissão.',
    });
  }

  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  if (rawItems.length === 0) {
    return res.status(400).json({ error: 'A proposta comercial deve conter ao menos um item.' });
  }

  let processedItems: QuoteItemEntity[];
  let itemsBelowBaseCost: QuoteItemEntity[];
  try {
    const built = buildValidatedItems(rawItems, existing.id);
    processedItems = built.processedItems;
    itemsBelowBaseCost = built.itemsBelowBaseCost;
  } catch (err: any) {
    return res.status(400).json({
      error: err.message || 'Dados de precificação inválidos nos itens da proposta.',
    });
  }

  const totals = PricingEngine.calculateQuoteTotals(processedItems);

  const authCheck = validateDiscountAuthorization(
    actor,
    processedItems,
    totals.negotiatedTotalAmount,
    totals.suggestedTotalAmount,
    existing.quoteNumber
  );
  if (!authCheck.allowed) {
    return res.status(authCheck.statusCode).json(authCheck.body);
  }

  const targetClientId =
    typeof payload.clientId === 'string' && payload.clientId.trim()
      ? payload.clientId.trim()
      : existing.clientId;
  const clientRecord = await clientRepository.findById(targetClientId);
  const requestedStatus = payload.commercialStatus || payload.status;
  const nextStatus = VALID_COMMERCIAL_STATUSES.has(requestedStatus)
    ? requestedStatus
    : existing.commercialStatus;
  const nowIso = new Date().toISOString();

  const oldSnapshot = {
    version: existing.version,
    totalAmount: existing.negotiatedTotalAmount,
    estimatedMarginPercentage: existing.estimatedMarginPercentage,
    commercialStatus: existing.commercialStatus,
  };

  const revisedQuote: QuoteEntity = {
    ...existing,
    version: (existing.version || 1) + 1,
    clientId: targetClientId,
    clientName: clientRecord?.companyName || String(payload.clientName || existing.clientName).trim(),
    clientCnpj: clientRecord?.cnpj || String(payload.clientCnpj || existing.clientCnpj).trim(),
    commercialStatus: nextStatus,
    validUntil,
    totalBaseCost: totals.totalBaseCost,
    markupPercentage: totals.effectiveMarkupPercentage,
    suggestedTotalAmount: totals.suggestedTotalAmount,
    negotiatedTotalAmount: totals.negotiatedTotalAmount,
    discountAmount: totals.discountAmount,
    estimatedMarginPercentage: totals.estimatedMarginPercentage,
    belowSuggestedAuthorized: authCheck.belowSuggestedAuthorized,
    authorizedById: authCheck.authorizedById,
    authorizedByName: authCheck.authorizedByName,
    authorizationDate: authCheck.belowSuggestedAuthorized ? nowIso : undefined,
    authorizationNotes:
      typeof payload.authorizationNotes === 'string' && payload.authorizationNotes.trim()
        ? payload.authorizationNotes.trim()
        : itemsBelowBaseCost.length > 0
        ? 'Revisão autorizada por Administrador com item abaixo do custo-base.'
        : undefined,
    entryPercentage: 50.00,
    entryAmount: totals.entryAmount,
    balanceAmount: totals.balanceAmount,
    paymentTerms:
      typeof payload.paymentTerms === 'string' && payload.paymentTerms.trim()
        ? payload.paymentTerms.trim()
        : existing.paymentTerms,
    productionLeadDays: Math.floor(leadDays),
    artApproved: payload.artApproved !== undefined ? Boolean(payload.artApproved) : existing.artApproved,
    artApprovedBy:
      payload.artApproved && !existing.artApproved
        ? String(payload.artApprovedBy || actor.fullName)
        : existing.artApprovedBy,
    artApprovalDate:
      payload.artApproved && !existing.artApproved ? nowIso : existing.artApprovalDate,
    acceptanceNotes:
      typeof payload.acceptanceNotes === 'string'
        ? payload.acceptanceNotes.trim()
        : typeof payload.whatsAppProof?.notes === 'string'
        ? payload.whatsAppProof.notes.trim()
        : existing.acceptanceNotes,
    notes: typeof payload.notes === 'string' ? payload.notes.trim() : existing.notes,
    updatedAt: nowIso,
    items: processedItems,
  };

  await quoteRepository.save(revisedQuote);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'crm.quotes',
    entityId: revisedQuote.quoteNumber,
    action: 'UPDATE_QUOTE',
    oldData: oldSnapshot,
    newData: {
      version: revisedQuote.version,
      totalAmount: revisedQuote.negotiatedTotalAmount,
      estimatedMarginPercentage: revisedQuote.estimatedMarginPercentage,
      commercialStatus: revisedQuote.commercialStatus,
      belowSuggestedAuthorized: revisedQuote.belowSuggestedAuthorized,
    },
    notes: `Proposta ${revisedQuote.quoteNumber} revisada para v${revisedQuote.version}.`,
  });

  return res.json(revisedQuote);
});

// Atualizar status comercial
quotesRouter.patch('/:id/status', requirePermission('quotes:edit'), async (req: RequestWithUser, res: Response) => {
  const quote = await quoteRepository.findById(req.params.id);
  if (!quote) {
    return res.status(404).json({ error: 'Orçamento não encontrado' });
  }

  if (quote.isLocked || quote.commercialStatus === 'convertido_em_pedido') {
    return res.status(409).json({
      error: 'Proposta bloqueada: Propostas já convertidas em Ordem de Produção não podem ter seu status comercial alterado.',
    });
  }

  const oldStatus = quote.commercialStatus;
  const newStatus = req.body?.status;
  if (!newStatus || !VALID_COMMERCIAL_STATUSES.has(newStatus)) {
    return res.status(400).json({
      error: `Status comercial inválido. Valores permitidos: ${Array.from(VALID_COMMERCIAL_STATUSES).join(', ')}.`,
    });
  }

  quote.commercialStatus = newStatus;
  quote.updatedAt = new Date().toISOString();

  await quoteRepository.save(quote);

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
quotesRouter.post('/:id/convert-to-order', requirePermission('quotes:convert_to_order'), async (req: RequestWithUser, res: Response) => {
  const quoteIdParam = req.params.id;

  if (convertingQuoteIds.has(quoteIdParam)) {
    return res.status(409).json({
      error: 'Conversão desta proposta já está em andamento. Aguarde a conclusão para preservar a idempotência.',
      code: 'CONVERSION_IN_PROGRESS',
    });
  }

  convertingQuoteIds.add(quoteIdParam);
  try {
    const quote = await quoteRepository.findById(quoteIdParam);
    if (!quote) {
      return res.status(404).json({ error: 'Orçamento não encontrado' });
    }

    // 1. Bloquear conversão de propostas recusadas ou canceladas (Invariante Comercial B.2.2)
    if (quote.commercialStatus === 'recusado' || quote.commercialStatus === 'cancelado') {
      return res.status(409).json({
        error: `Conversão bloqueada: Proposta ${quote.quoteNumber} está com status '${quote.commercialStatus}' e não pode gerar Ordem de Produção.`,
        code: 'QUOTE_NOT_CONVERTIBLE',
      });
    }

    if (!quote.items || quote.items.length === 0 || quote.negotiatedTotalAmount <= 0) {
      return res.status(400).json({
        error: `Proposta ${quote.quoteNumber} não possui itens válidos ou valor positivo para gerar OP.`,
      });
    }

    // 2. Idempotência absoluta por Proposta + Idempotency-Key (nunca duplica OP nem títulos financeiros)
    const customIdempotencyKey = req.headers['idempotency-key'] as string;
    const canonicalKey = `convert_quote_${quote.id}_v${quote.version}`;
    const idempotencyKey = customIdempotencyKey || canonicalKey;

    let existingOrder =
      (quote.convertedOrderId ? await orderRepository.findById(quote.convertedOrderId) : null) ||
      (await orderRepository.findByIdempotencyKey(idempotencyKey)) ||
      (idempotencyKey !== canonicalKey ? await orderRepository.findByIdempotencyKey(canonicalKey) : null);

    if (!existingOrder && quote.commercialStatus === 'convertido_em_pedido') {
      const allOrders = await orderRepository.findAll();
      existingOrder = allOrders.find((o) => o.quoteId === quote.id) || null;
    }

    if (existingOrder) {
      return res.status(200).json({
        success: true,
        alreadyConverted: true,
        message: `Idempotência garantida: A proposta comercial ${quote.quoteNumber} já foi convertida na OP ${existingOrder.orderNumber}.`,
        order: existingOrder,
      });
    }

    const orderNumber = await sequenceService.nextOrderNumberAsync();
    const orderId = crypto.randomUUID();
    const firstItem = quote.items[0];
    const totalPieces = quote.items.reduce((sum, item) => sum + item.totalQuantity, 0);

    // Consolidar grade de tamanhos de todos os itens para consistência total com totalPieces
    const aggregatedSizes = quote.items.reduce(
      (acc, item) => ({
        pp: acc.pp + (item.sizes?.pp || 0),
        p: acc.p + (item.sizes?.p || 0),
        m: acc.m + (item.sizes?.m || 0),
        g: acc.g + (item.sizes?.g || 0),
        gg: acc.gg + (item.sizes?.gg || 0),
        xg: acc.xg + (item.sizes?.xg || 0),
        exg: acc.exg + (item.sizes?.exg || 0),
        sobMedida: acc.sobMedida + (item.sizes?.sobMedida || 0),
      }),
      { pp: 0, p: 0, m: 0, g: 0, gg: 0, xg: 0, exg: 0, sobMedida: 0 }
    );

    const allCustomizations = quote.items.flatMap((it) => it.customizations || []);
    const itemTitle =
      quote.items.length > 1
        ? `${firstItem.modelName} (+${quote.items.length - 1} ${quote.items.length - 1 === 1 ? 'item' : 'itens'})`
        : firstItem.modelName;

    const itemsSummary = quote.items
      .map(
        (it, idx) =>
          `[${idx + 1}] ${it.totalQuantity}x ${it.modelName} (${it.fabricName} - ${it.fabricColor})`
      )
      .join(' | ');

    const todayStr = new Date().toISOString().split('T')[0];
    const expiredNote =
      quote.validUntil < todayStr
        ? ` [Aviso: convertida após validade original ${quote.validUntil}]`
        : '';

    // Criar Ordem de Produção no PCP com Portão A.3.2: stage inicial 'aguardando_liberacao'
    const newOrder: ProductionOrderEntity = {
      id: orderId,
      orderNumber,
      quoteId: quote.id,
      quoteVersion: quote.version,
      idempotencyKey,
      clientId: quote.clientId,
      clientName: quote.clientName,
      itemTitle,
      category: firstItem.category,
      fabricName: firstItem.fabricName,
      fabricColor: firstItem.fabricColor,
      sizes: aggregatedSizes,
      totalPieces,
      customizations: allCustomizations,
      commercialStatus: 'aprovado',
      financialStatus: 'entrada_pendente', // Bloqueado até confirmar sinal de 50%!
      stage: 'aguardando_liberacao',       // Gate A.3.2
      artApproved: quote.artApproved,
      artApprovalDate: quote.artApprovalDate,
      artApprovedBy: quote.artApprovedBy,
      entryPaymentConfirmed: false,        // Portão rígido do PRD
      priority: 'normal',
      creationDate: todayStr,
      targetDeliveryDate: new Date(Date.now() + quote.productionLeadDays * 86400000).toISOString().split('T')[0],
      technicalNotes: `Gerado a partir da Proposta ${quote.quoteNumber} v${quote.version}. Itens: ${itemsSummary}.${expiredNote} ${quote.notes || ''}`.trim(),
      assignedTeam: 'Mesa de Corte & Facção Terceirizada',
      isDemo: quote.isDemo,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await orderRepository.save(newOrder);

    // Lançamentos Financeiros Idempotentes: Sinal de 50% + Saldo na Entrega
    const finSinalNumber = await sequenceService.nextFinanceNumberAsync();
    const finSinal: FinancialTransactionEntity = {
      id: crypto.randomUUID(),
      transactionNumber: finSinalNumber,
      productionOrderId: newOrder.id,
      quoteId: quote.id,
      type: 'receber',
      subType: 'entrada_pedido',
      description: `Sinal 50% - Proposta ${quote.quoteNumber} (${quote.clientName})`,
      category: 'Venda de Uniformes',
      amount: quote.entryAmount,
      dueDate: todayStr,
      status: 'pendente',
      paymentMethod: 'pix',
      referenceId: newOrder.orderNumber,
      isDemo: quote.isDemo,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const finSaldoNumber = await sequenceService.nextFinanceNumberAsync();
    const finSaldo: FinancialTransactionEntity = {
      id: crypto.randomUUID(),
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

    await financeRepository.save(finSinal);
    await financeRepository.save(finSaldo);

    // Atualizar a proposta como convertida e bloqueada
    quote.commercialStatus = 'convertido_em_pedido';
    quote.convertedOrderId = newOrder.id;
    quote.isLocked = true;
    quote.updatedAt = new Date().toISOString();
    await quoteRepository.save(quote);

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
        quoteVersion: quote.version,
        totalPieces: newOrder.totalPieces,
        itemsCount: quote.items.length,
        financialStatus: newOrder.financialStatus,
        stage: newOrder.stage,
        sinalTransaction: finSinal.transactionNumber,
        saldoTransaction: finSaldo.transactionNumber,
      },
      notes: `Proposta ${quote.quoteNumber} v${quote.version} convertida na OP ${newOrder.orderNumber}. Títulos financeiros de 50% gerados.`,
    });

    return res.status(201).json({
      success: true,
      alreadyConverted: false,
      message: `Proposta ${quote.quoteNumber} convertida na OP ${newOrder.orderNumber}. A OP está em 'aguardando_liberacao' até quitação do sinal de 50% e aprovação de arte.`,
      order: newOrder,
      financeTransactions: [finSinal, finSaldo],
    });
  } finally {
    convertingQuoteIds.delete(quoteIdParam);
  }
});

// Excluir proposta
quotesRouter.delete('/:id', requirePermission('quotes:delete'), async (req: RequestWithUser, res: Response) => {
  const quote = await quoteRepository.findById(req.params.id);
  if (!quote) {
    return res.status(404).json({ error: 'Orçamento não encontrado' });
  }

  if (quote.isLocked || quote.commercialStatus === 'convertido_em_pedido') {
    return res.status(409).json({
      error: 'Não é permitido excluir uma proposta já convertida em Ordem de Produção.',
    });
  }

  await quoteRepository.delete(req.params.id);

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
