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
import { validateArtworkPayload } from '../services/artworkValidation';
import { buildDefaultStageSchedule } from '../services/productionScheduleService';
import {
  ArtworkStatus,
  ArtworkVersionEntity,
  QuoteEntity,
  QuoteItemEntity,
  QuoteVersionSnapshot,
  ProductionOrderEntity,
  FinancialTransactionEntity,
} from '../types/db';

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

function resolveArtStatus(quote: Pick<QuoteEntity, 'artStatus' | 'artApproved' | 'artVersions'>): ArtworkStatus {
  if (quote.artStatus) return quote.artStatus;
  if (quote.artApproved) return 'aprovada';
  if (quote.artVersions && quote.artVersions.length > 0) return 'enviada_para_cliente';
  return 'pendente';
}

function buildQuoteVersionSnapshot(
  quote: Pick<
    QuoteEntity,
    | 'version'
    | 'commercialStatus'
    | 'artStatus'
    | 'artApproved'
    | 'artVersions'
    | 'validUntil'
    | 'totalBaseCost'
    | 'suggestedTotalAmount'
    | 'negotiatedTotalAmount'
    | 'discountAmount'
    | 'estimatedMarginPercentage'
    | 'entryAmount'
    | 'balanceAmount'
    | 'productionLeadDays'
    | 'items'
  >,
  savedBy: string,
  changeSummary: string,
  savedAt: string
): QuoteVersionSnapshot {
  const totalPieces = (quote.items || []).reduce((sum, it) => sum + (it.totalQuantity || 0), 0);
  return {
    version: quote.version || 1,
    savedAt,
    savedBy,
    commercialStatus: quote.commercialStatus,
    artStatus: resolveArtStatus(quote),
    validUntil: quote.validUntil,
    totalBaseCost: quote.totalBaseCost,
    suggestedTotalAmount: quote.suggestedTotalAmount,
    negotiatedTotalAmount: quote.negotiatedTotalAmount,
    discountAmount: quote.discountAmount,
    estimatedMarginPercentage: quote.estimatedMarginPercentage,
    entryAmount: quote.entryAmount,
    balanceAmount: quote.balanceAmount,
    productionLeadDays: quote.productionLeadDays,
    totalPieces,
    changeSummary,
    items: (quote.items || []).map((it) => ({
      modelName: it.modelName,
      fabricName: it.fabricName,
      fabricColor: it.fabricColor,
      totalQuantity: it.totalQuantity,
      calculatedBaseUnitCost: it.calculatedBaseUnitCost,
      suggestedUnitPrice: it.suggestedUnitPrice,
      negotiatedUnitPrice: it.negotiatedUnitPrice,
      totalItemPrice: it.totalItemPrice,
    })),
  };
}

async function findLinkedOrderForQuote(quote: QuoteEntity): Promise<ProductionOrderEntity | null> {
  if (quote.convertedOrderId) {
    const direct = await orderRepository.findById(quote.convertedOrderId);
    if (direct) return direct;
  }
  const allOrders = await orderRepository.findAll();
  return allOrders.find((o) => o.quoteId === quote.id) || null;
}

function getLatestArtVersion(quote: QuoteEntity): ArtworkVersionEntity | undefined {
  const versions = quote.artVersions || [];
  if (versions.length === 0) return undefined;
  return [...versions].sort((a, b) => b.version - a.version)[0];
}

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
    artStatus: 'pendente',
    artApproved: false,
    artApprovedBy: undefined,
    artApprovalDate: undefined,
    artVersions: [],
    versionHistory: [],
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

  newQuote.versionHistory = [
    buildQuoteVersionSnapshot(
      newQuote,
      actor.fullName,
      'Emissão inicial da proposta comercial (v1)',
      nowIso
    ),
  ];

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

  const existingHistory = Array.isArray(existing.versionHistory) ? [...existing.versionHistory] : [];
  if (existingHistory.length === 0) {
    existingHistory.push(
      buildQuoteVersionSnapshot(
        existing,
        existing.sellerName || actor.fullName,
        `Snapshot preservado da v${existing.version || 1} antes da revisão`,
        existing.updatedAt || existing.createdAt
      )
    );
  }

  const nextVersion = (existing.version || 1) + 1;
  const formatBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const autoSummary =
    existing.negotiatedTotalAmount !== totals.negotiatedTotalAmount
      ? `Revisão v${nextVersion}: valor atualizado de ${formatBRL(existing.negotiatedTotalAmount)} para ${formatBRL(totals.negotiatedTotalAmount)}`
      : `Revisão v${nextVersion}: atualização de itens, grade ou condições comerciais`;
  const revisionSummary =
    typeof payload.revisionSummary === 'string' && payload.revisionSummary.trim()
      ? payload.revisionSummary.trim().slice(0, 240)
      : autoSummary;

  const revisedQuote: QuoteEntity = {
    ...existing,
    version: nextVersion,
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
    artStatus: resolveArtStatus(existing),
    artApproved: existing.artApproved,
    artApprovedBy: existing.artApprovedBy,
    artApprovalDate: existing.artApprovalDate,
    artVersions: existing.artVersions || [],
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

  revisedQuote.versionHistory = [
    ...existingHistory,
    buildQuoteVersionSnapshot(revisedQuote, actor.fullName, revisionSummary, nowIso),
  ];

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

// Histórico completo de versões da proposta + versões de arte armazenadas
quotesRouter.get('/:id/versions', async (req: RequestWithUser, res: Response) => {
  const quote = await quoteRepository.findById(req.params.id);
  if (!quote) {
    return res.status(404).json({ error: 'Orçamento não encontrado' });
  }

  const versionHistory =
    quote.versionHistory && quote.versionHistory.length > 0
      ? quote.versionHistory
      : [
          buildQuoteVersionSnapshot(
            quote,
            quote.sellerName,
            `Versão v${quote.version || 1} atual da proposta`,
            quote.updatedAt || quote.createdAt
          ),
        ];

  return res.json({
    quoteId: quote.id,
    quoteNumber: quote.quoteNumber,
    currentVersion: quote.version,
    commercialStatus: quote.commercialStatus,
    artStatus: resolveArtStatus(quote),
    artApproved: quote.artApproved,
    approvedByName: quote.approvedByName,
    approvedAt: quote.approvedAt,
    versionHistory,
    artVersions: quote.artVersions || [],
  });
});

// Aprovação Comercial Auditável (DESACOPLADA da Arte — suporta "Aprovou Orçamento mas Pediu Revisão na Arte")
quotesRouter.post('/:id/approve-commercial', requirePermission('quotes:edit'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const quote = await quoteRepository.findById(req.params.id);
  if (!quote) {
    return res.status(404).json({ error: 'Orçamento não encontrado' });
  }

  if (quote.isLocked || quote.commercialStatus === 'convertido_em_pedido') {
    return res.status(409).json({
      error: 'Esta proposta já foi convertida em Ordem de Produção.',
      code: 'QUOTE_ALREADY_CONVERTED',
    });
  }

  if (quote.commercialStatus === 'recusado' || quote.commercialStatus === 'cancelado') {
    return res.status(409).json({
      error: `Proposta ${quote.quoteNumber} está com status '${quote.commercialStatus}' e não pode ser aprovada.`,
      code: 'QUOTE_NOT_APPROVABLE',
    });
  }

  const approvedByName =
    typeof req.body?.approvedByName === 'string' && req.body.approvedByName.trim().length >= 2
      ? req.body.approvedByName.trim().slice(0, 120)
      : '';
  if (!approvedByName) {
    return res.status(400).json({
      error: 'Informe o nome do responsável pelo aceite comercial no cliente (mínimo 2 caracteres).',
    });
  }

  const channel = VALID_ACCEPTANCE_CHANNELS.has(req.body?.acceptanceChannel)
    ? (req.body.acceptanceChannel as 'whatsapp' | 'email' | 'presencial')
    : quote.acceptanceChannel || 'whatsapp';
  const acceptanceNotes =
    typeof req.body?.acceptanceNotes === 'string' ? req.body.acceptanceNotes.trim().slice(0, 1000) : '';

  const validArtDecisions = new Set(['manter_pendente', 'solicitar_revisao_arte', 'aprovar_arte_atual']);
  const artDecision = validArtDecisions.has(req.body?.artDecision)
    ? (req.body.artDecision as 'manter_pendente' | 'solicitar_revisao_arte' | 'aprovar_arte_atual')
    : 'manter_pendente';
  const artRevisionNotes =
    typeof req.body?.artRevisionNotes === 'string' ? req.body.artRevisionNotes.trim().slice(0, 1000) : '';

  if (artDecision === 'solicitar_revisao_arte' && artRevisionNotes.length < 5) {
    return res.status(400).json({
      error: 'Descreva os ajustes solicitados pelo cliente na arte (mínimo 5 caracteres).',
    });
  }

  const nowIso = new Date().toISOString();
  const oldStatus = quote.commercialStatus;
  const oldArtStatus = resolveArtStatus(quote);

  quote.commercialStatus = 'aprovado';
  quote.approvedByName = approvedByName;
  quote.approvedAt = nowIso;
  quote.acceptanceChannel = channel;
  quote.acceptanceTimestamp = nowIso;
  if (acceptanceNotes) {
    quote.acceptanceNotes = acceptanceNotes;
  }

  const versions = Array.isArray(quote.artVersions) ? [...quote.artVersions] : [];
  const latestArt = versions.length > 0 ? [...versions].sort((a, b) => b.version - a.version)[0] : undefined;

  let auditAction = 'APPROVE_QUOTE_COMMERCIAL';
  let responseMessage = `Orçamento ${quote.quoteNumber} v${quote.version} aprovado comercialmente por ${approvedByName}.`;

  if (artDecision === 'solicitar_revisao_arte') {
    quote.artStatus = 'revisao_solicitada';
    quote.artApproved = false;
    quote.artApprovedBy = undefined;
    quote.artApprovalDate = undefined;
    quote.artNotes = artRevisionNotes;

    if (latestArt) {
      quote.artVersions = versions.map((v) =>
        v.version === latestArt.version
          ? {
              ...v,
              status: 'revisao_solicitada',
              revisionRequestedBy: approvedByName,
              revisionRequestedAt: nowIso,
              revisionNotes: artRevisionNotes,
            }
          : v
      );
    }
    auditAction = 'APPROVE_QUOTE_WITH_ART_REVISION';
    responseMessage = `Orçamento ${quote.quoteNumber} v${quote.version} APROVADO comercialmente com SOLICITAÇÃO DE REVISÃO DE ARTE registrada. O preço e a proposta ficam preservados e o corte permanecerá travado (Gate A.3.2) até aprovação da nova versão da arte.`;
  } else if (artDecision === 'aprovar_arte_atual') {
    const artApprover =
      typeof req.body?.artApproverName === 'string' && req.body.artApproverName.trim()
        ? req.body.artApproverName.trim().slice(0, 120)
        : approvedByName;
    quote.artStatus = 'aprovada';
    quote.artApproved = true;
    quote.artApprovedBy = artApprover;
    quote.artApprovalDate = nowIso;
    if (latestArt) {
      quote.artFileUrl = latestArt.fileUrl;
      quote.artVersions = versions.map((v) =>
        v.version === latestArt.version
          ? { ...v, status: 'aprovada', approvedBy: artApprover, approvedAt: nowIso }
          : v.status === 'enviada_para_cliente'
          ? { ...v, status: 'substituida' }
          : v
      );
    }
    auditAction = 'APPROVE_QUOTE_AND_ART';
    responseMessage = `Orçamento ${quote.quoteNumber} v${quote.version} e Arte formalmente aprovados por ${approvedByName}.`;
  } else {
    quote.artStatus = resolveArtStatus(quote);
  }

  // Atualizar o snapshot mais recente no histórico com o aceite comercial e status da arte
  const history = Array.isArray(quote.versionHistory) ? [...quote.versionHistory] : [];
  if (history.length === 0) {
    history.push(
      buildQuoteVersionSnapshot(
        quote,
        actor.fullName,
        `Aprovação comercial registrada por ${approvedByName} via ${channel}`,
        nowIso
      )
    );
  } else {
    const lastIdx = history.length - 1;
    history[lastIdx] = {
      ...history[lastIdx],
      commercialStatus: quote.commercialStatus,
      artStatus: resolveArtStatus(quote),
    };
  }
  quote.versionHistory = history;
  quote.updatedAt = nowIso;

  await quoteRepository.save(quote);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'crm.quotes',
    entityId: quote.quoteNumber,
    action: auditAction,
    oldData: { commercialStatus: oldStatus, artStatus: oldArtStatus },
    newData: {
      commercialStatus: quote.commercialStatus,
      artStatus: quote.artStatus,
      artApproved: quote.artApproved,
      approvedByName,
      acceptanceChannel: channel,
      artRevisionNotes: artRevisionNotes || undefined,
    },
    notes: responseMessage,
  });

  return res.json({
    success: true,
    message: responseMessage,
    quote,
  });
});

// Armazenar nova versão de arte/layout (Arte v1, v2, v3...) — permitido mesmo após conversão em OP enquanto OP estiver em 'aguardando_liberacao'
quotesRouter.post('/:id/artworks', requirePermission('orders:approve_art'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const quote = await quoteRepository.findById(req.params.id);
  if (!quote) {
    return res.status(404).json({ error: 'Orçamento não encontrado' });
  }

  if (quote.commercialStatus === 'recusado' || quote.commercialStatus === 'cancelado') {
    return res.status(409).json({
      error: `Não é permitido anexar artes em propostas com status '${quote.commercialStatus}'.`,
      code: 'QUOTE_CANCELLED',
    });
  }

  const linkedOrder = await findLinkedOrderForQuote(quote);
  if (linkedOrder && linkedOrder.stage !== 'aguardando_liberacao') {
    return res.status(409).json({
      error: `Arte bloqueada: a OP vinculada (${linkedOrder.orderNumber}) já avançou para a etapa '${linkedOrder.stage}'. Não é permitido substituir a arte após o início do corte.`,
      code: 'ART_LOCKED_IN_PRODUCTION',
    });
  }

  const validation = validateArtworkPayload({
    fileName: req.body?.fileName,
    fileUrl: req.body?.fileUrl,
  });
  if (!validation.ok) {
    return res.status(400).json({ error: validation.error });
  }

  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 1000) : undefined;
  const nowIso = new Date().toISOString();
  const existingVersions = Array.isArray(quote.artVersions) ? [...quote.artVersions] : [];
  const nextArtVersion =
    existingVersions.length > 0
      ? Math.max(...existingVersions.map((v) => v.version)) + 1
      : 1;

  const updatedPrevious: ArtworkVersionEntity[] = existingVersions.map((v) =>
    v.status === 'enviada_para_cliente' || v.status === 'aprovada'
      ? { ...v, status: 'substituida' }
      : v
  );

  const newArt: ArtworkVersionEntity = {
    id: crypto.randomUUID(),
    version: nextArtVersion,
    fileName: validation.data.fileName,
    mimeType: validation.data.mimeType,
    fileUrl: validation.data.fileUrl,
    fileSizeBytes: validation.data.fileSizeBytes,
    status: 'enviada_para_cliente',
    uploadedBy: actor.fullName,
    uploadedAt: nowIso,
    notes,
  };

  quote.artVersions = [...updatedPrevious, newArt];
  quote.artStatus = 'enviada_para_cliente';
  quote.artApproved = false;
  quote.artApprovedBy = undefined;
  quote.artApprovalDate = undefined;
  quote.artFileUrl = newArt.fileUrl;
  if (notes) {
    quote.artNotes = notes;
  }
  quote.updatedAt = nowIso;
  await quoteRepository.save(quote);

  // Sincronização automática com a OP vinculada (mantém Gate A.3.2 travado até aprovação desta nova versão!)
  if (linkedOrder) {
    linkedOrder.artStatus = 'enviada_para_cliente';
    linkedOrder.artApproved = false;
    linkedOrder.artApprovedBy = undefined;
    linkedOrder.artApprovalDate = undefined;
    linkedOrder.artFileUrl = newArt.fileUrl;
    linkedOrder.artVersionNumber = newArt.version;
    linkedOrder.artRevisionNotes = undefined;
    linkedOrder.updatedAt = nowIso;
    await orderRepository.save(linkedOrder);
  }

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'crm.quotes',
    entityId: quote.quoteNumber,
    action: 'UPLOAD_ARTWORK_VERSION',
    newData: {
      artVersion: newArt.version,
      fileName: newArt.fileName,
      mimeType: newArt.mimeType,
      fileSizeBytes: newArt.fileSizeBytes,
      syncedOrderNumber: linkedOrder?.orderNumber,
    },
    notes: `Arte v${newArt.version} (${newArt.fileName}) armazenada na proposta ${quote.quoteNumber}${linkedOrder ? ` e sincronizada com a OP ${linkedOrder.orderNumber}` : ''}.`,
  });

  return res.status(201).json({
    success: true,
    message: `Arte v${newArt.version} armazenada e enviada para aprovação do cliente.`,
    artwork: newArt,
    quote,
    syncedOrder: linkedOrder || undefined,
  });
});

// Solicitar Revisão de Arte (mantém aprovação comercial intacta e re-trava Gate A.3.2 se OP ainda não entrou no corte)
quotesRouter.post('/:id/artworks/request-revision', requirePermission('orders:approve_art'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const quote = await quoteRepository.findById(req.params.id);
  if (!quote) {
    return res.status(404).json({ error: 'Orçamento não encontrado' });
  }

  const linkedOrder = await findLinkedOrderForQuote(quote);
  if (linkedOrder && linkedOrder.stage !== 'aguardando_liberacao') {
    return res.status(409).json({
      error: `Revisão de arte bloqueada: a OP ${linkedOrder.orderNumber} já avançou para '${linkedOrder.stage}'. Para ajustes após o corte, abra retrabalho no PCP.`,
      code: 'ART_LOCKED_IN_PRODUCTION',
    });
  }

  const revisionNotes =
    typeof req.body?.revisionNotes === 'string' ? req.body.revisionNotes.trim().slice(0, 1000) : '';
  if (revisionNotes.length < 5) {
    return res.status(400).json({
      error: 'Informe os detalhes do ajuste solicitado pelo cliente na arte (mínimo 5 caracteres).',
    });
  }

  const requestedBy =
    typeof req.body?.requestedBy === 'string' && req.body.requestedBy.trim()
      ? req.body.requestedBy.trim().slice(0, 120)
      : quote.clientName;

  const nowIso = new Date().toISOString();
  const versions = Array.isArray(quote.artVersions) ? [...quote.artVersions] : [];
  const latestArt = getLatestArtVersion(quote);

  if (latestArt) {
    quote.artVersions = versions.map((v) =>
      v.version === latestArt.version
        ? {
            ...v,
            status: 'revisao_solicitada',
            revisionRequestedBy: requestedBy,
            revisionRequestedAt: nowIso,
            revisionNotes,
          }
        : v
    );
  }

  quote.artStatus = 'revisao_solicitada';
  quote.artApproved = false;
  quote.artApprovedBy = undefined;
  quote.artApprovalDate = undefined;
  quote.artNotes = revisionNotes;
  quote.updatedAt = nowIso;
  await quoteRepository.save(quote);

  if (linkedOrder) {
    linkedOrder.artStatus = 'revisao_solicitada';
    linkedOrder.artApproved = false;
    linkedOrder.artApprovedBy = undefined;
    linkedOrder.artApprovalDate = undefined;
    linkedOrder.artRevisionNotes = revisionNotes;
    linkedOrder.updatedAt = nowIso;
    await orderRepository.save(linkedOrder);
  }

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'crm.quotes',
    entityId: quote.quoteNumber,
    action: 'REQUEST_ARTWORK_REVISION',
    newData: {
      artVersion: latestArt?.version,
      requestedBy,
      revisionNotes,
      syncedOrderNumber: linkedOrder?.orderNumber,
    },
    notes: `Revisão de arte solicitada por ${requestedBy} na proposta ${quote.quoteNumber}: ${revisionNotes}`,
  });

  return res.json({
    success: true,
    message: `Revisão de arte registrada. A aprovação comercial permanece preservada e o corte segue bloqueado até o cliente aprovar a nova arte.`,
    quote,
    syncedOrder: linkedOrder || undefined,
  });
});

// Aprovação Formal da Arte (desbloqueia o requisito de Arte do Gate A.3.2 na Proposta e na OP vinculada)
quotesRouter.post('/:id/artworks/approve', requirePermission('orders:approve_art'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const quote = await quoteRepository.findById(req.params.id);
  if (!quote) {
    return res.status(404).json({ error: 'Orçamento não encontrado' });
  }

  const linkedOrder = await findLinkedOrderForQuote(quote);
  if (linkedOrder && linkedOrder.stage !== 'aguardando_liberacao') {
    return res.status(409).json({
      error: `Arte bloqueada: a OP ${linkedOrder.orderNumber} já avançou para '${linkedOrder.stage}' e não permite alterar a arte aprovada.`,
      code: 'ART_LOCKED_IN_PRODUCTION',
    });
  }

  const approverName =
    typeof req.body?.approverName === 'string' && req.body.approverName.trim().length >= 2
      ? req.body.approverName.trim().slice(0, 120)
      : actor.fullName;
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 1000) : '';
  const requestedVersion = req.body?.version !== undefined ? Number(req.body.version) : undefined;

  const versions = Array.isArray(quote.artVersions) ? [...quote.artVersions] : [];
  let targetArt: ArtworkVersionEntity | undefined;
  if (requestedVersion !== undefined && Number.isFinite(requestedVersion)) {
    targetArt = versions.find((v) => v.version === requestedVersion);
    if (!targetArt) {
      return res.status(404).json({ error: `Arte v${requestedVersion} não encontrada nesta proposta.` });
    }
  } else {
    targetArt = getLatestArtVersion(quote);
  }

  const nowIso = new Date().toISOString();

  if (targetArt) {
    quote.artVersions = versions.map((v) =>
      v.version === targetArt!.version
        ? {
            ...v,
            status: 'aprovada',
            approvedBy: approverName,
            approvedAt: nowIso,
          }
        : v.status === 'enviada_para_cliente' || v.status === 'aprovada'
        ? { ...v, status: 'substituida' }
        : v
    );
    quote.artFileUrl = targetArt.fileUrl;
  }

  quote.artStatus = 'aprovada';
  quote.artApproved = true;
  quote.artApprovedBy = approverName;
  quote.artApprovalDate = nowIso;
  if (notes) {
    quote.artNotes = notes;
  }
  quote.updatedAt = nowIso;
  await quoteRepository.save(quote);

  if (linkedOrder) {
    linkedOrder.artStatus = 'aprovada';
    linkedOrder.artApproved = true;
    linkedOrder.artApprovedBy = approverName;
    linkedOrder.artApprovalDate = nowIso;
    if (quote.artFileUrl) {
      linkedOrder.artFileUrl = quote.artFileUrl;
    }
    if (targetArt) {
      linkedOrder.artVersionNumber = targetArt.version;
    }
    linkedOrder.artRevisionNotes = undefined;
    const tag = `[Arte${targetArt ? ` v${targetArt.version}` : ''} aprovada por ${approverName} em ${new Date().toLocaleDateString('pt-BR')}${notes ? ` — ${notes}` : ''}]`;
    linkedOrder.technicalNotes = `${linkedOrder.technicalNotes || ''} ${tag}`.trim();
    linkedOrder.updatedAt = nowIso;
    await orderRepository.save(linkedOrder);
  }

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'crm.quotes',
    entityId: quote.quoteNumber,
    action: 'APPROVE_ARTWORK_VERSION',
    newData: {
      artVersion: targetArt?.version,
      approverName,
      notes: notes || undefined,
      syncedOrderNumber: linkedOrder?.orderNumber,
    },
    notes: `Arte${targetArt ? ` v${targetArt.version}` : ''} da proposta ${quote.quoteNumber} formalmente aprovada por ${approverName}${linkedOrder ? ` (OP ${linkedOrder.orderNumber} atualizada)` : ''}.`,
  });

  return res.json({
    success: true,
    message: `Arte${targetArt ? ` v${targetArt.version}` : ''} aprovada formalmente por ${approverName}.${linkedOrder ? ` A OP ${linkedOrder.orderNumber} foi liberada no critério de Arte (Gate A.3.2).` : ''}`,
    quote,
    syncedOrder: linkedOrder || undefined,
  });
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

    const latestArt = getLatestArtVersion(quote);
    const resolvedArtStatus = resolveArtStatus(quote);

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
      artStatus: resolvedArtStatus,
      artApproved: quote.artApproved,
      artApprovalDate: quote.artApprovalDate,
      artApprovedBy: quote.artApprovedBy,
      artFileUrl: quote.artFileUrl || latestArt?.fileUrl,
      artVersionNumber: latestArt?.version,
      artRevisionNotes: resolvedArtStatus === 'revisao_solicitada' ? quote.artNotes : undefined,
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
    newOrder.stageSchedule = buildDefaultStageSchedule(newOrder);

    await orderRepository.save(newOrder);

    // Lançamentos Financeiros Idempotentes: Sinal de 50% + Saldo na Entrega
    const existingFinance = await financeRepository.findAll();
    const existingSinal = existingFinance.find(
      (f) =>
        f.type === 'receber' &&
        f.status !== 'estornado' &&
        f.subType === 'entrada_pedido' &&
        (f.productionOrderId === newOrder.id || f.quoteId === quote.id || f.referenceId === newOrder.orderNumber)
    );
    const existingSaldo = existingFinance.find(
      (f) =>
        f.type === 'receber' &&
        f.status !== 'estornado' &&
        f.subType === 'saldo_entrega' &&
        (f.productionOrderId === newOrder.id || f.quoteId === quote.id || f.referenceId === newOrder.orderNumber)
    );

    const finSinal: FinancialTransactionEntity =
      existingSinal || {
        id: crypto.randomUUID(),
        transactionNumber: await sequenceService.nextFinanceNumberAsync(),
        productionOrderId: newOrder.id,
        quoteId: quote.id,
        clientId: quote.clientId,
        clientName: quote.clientName,
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

    const finSaldo: FinancialTransactionEntity =
      existingSaldo || {
        id: crypto.randomUUID(),
        transactionNumber: await sequenceService.nextFinanceNumberAsync(),
        productionOrderId: newOrder.id,
        quoteId: quote.id,
        clientId: quote.clientId,
        clientName: quote.clientName,
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

    if (!existingSinal) {
      await financeRepository.save(finSinal);
    }
    if (!existingSaldo) {
      await financeRepository.save(finSaldo);
    }

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
