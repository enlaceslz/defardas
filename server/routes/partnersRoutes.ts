/**
 * DE FARDAS ERP — Partners & Outsourced Services Routes
 * Cadastro de facções, bordados, silk-screen, acabamento e corte externo,
 * além da custódia rastreada de materiais em poder de terceiros (estoque.partner_custody)
 * e integração 360° com Ordens de Produção (PCP), Estoque e Financeiro.
 */
import { Router, Response } from 'express';
import crypto from 'crypto';
import { PERMISSIONS, RequestWithUser, requireAuth, requirePermission } from '../auth/rbac';
import { partnerRepository } from '../repositories/partnerRepository';
import { orderRepository } from '../repositories/orderRepository';
import { inventoryRepository } from '../repositories/inventoryRepository';
import { financeRepository } from '../repositories/financeRepository';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';
import {
  composeServerAddressLine,
  sanitizeAddressGeoInput,
} from '../services/addressMetadataService';
import {
  PartnerEntity,
  PartnerServiceCategory,
  PartnerCustodyEntity,
  StockMovementEntity,
  FinancialTransactionEntity,
} from '../types/db';
import {
  addDaysISO,
  buildGlobalPartnerForecast,
  buildPartnerFinancialProfile,
  computePartnerOrderAssignment,
  getTodayISO,
  PARTNER_CATEGORY_SERVICE_LABEL,
  round2,
  withEffectiveStatus,
} from '../services/partnerFinanceService';

export const partnersRouter = Router();

const VALID_PARTNER_TYPES = new Set<PartnerServiceCategory>([
  'costura',
  'bordado',
  'silk_screen',
  'acabamento',
  'corte_externo',
]);

const VALID_PAYMENT_METHODS = new Set(['pix', 'boleto', 'transferencia', 'cartao']);

function isValidIsoDate(val: unknown): val is string {
  return typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val) && !Number.isNaN(Date.parse(val));
}

// Autenticação + Permissão de leitura em todas as rotas de parceiros
partnersRouter.use(requireAuth);
partnersRouter.use(requirePermission('partners:view'));

// 1. Listar todos os parceiros enriquecidos com métricas cruzadas (PCP + Estoque + Financeiro + Provisões CP)
partnersRouter.get('/', async (_req: RequestWithUser, res: Response) => {
  const todayISO = getTodayISO();
  const [partnersList, ordersList, custodyList, financeList] = await Promise.all([
    partnerRepository.findAll(),
    orderRepository.findAll(),
    partnerRepository.findAllCustody(),
    financeRepository.findAll(),
  ]);

  const enriched = partnersList.map((partner) => {
    const linkedCustody = custodyList.filter((c) => c.partnerId === partner.id);
    const openCustody = linkedCustody.filter(
      (c) => c.status === 'em_custodia' || c.status === 'devolvido_parcial'
    );
    const openCustodyQty =
      Math.round(
        openCustody.reduce(
          (s, c) => s + Math.max(0, c.sentQuantity - c.returnedQuantity - c.lostQuantity),
          0
        ) * 100
      ) / 100;

    const finProfile = buildPartnerFinancialProfile(partner, ordersList, financeList, todayISO);

    return {
      ...partner,
      metrics: {
        ...finProfile.metrics,
        openCustodyCount: openCustody.length,
        openCustodyQty,
      },
    };
  });

  res.json(enriched);
});

// 2. Visão consolidada de Provisões, Valores Pagos, Restante CP e Previsão de Pagamento por Serviço/Cliente
partnersRouter.get('/financial-forecast', async (_req: RequestWithUser, res: Response) => {
  const todayISO = getTodayISO();
  const [partnersList, ordersList, financeList] = await Promise.all([
    partnerRepository.findAll(),
    orderRepository.findAll(),
    financeRepository.findAll(),
  ]);

  const forecast = buildGlobalPartnerForecast(partnersList, ordersList, financeList, todayISO);
  res.json({
    asOfDate: todayISO,
    ...forecast,
  });
});

// 3. Listar todas as remessas sob custódia de terceiros (visão consolidada)
partnersRouter.get('/custody', async (_req: RequestWithUser, res: Response) => {
  const [custodyList, partnersList, itemsList, ordersList] = await Promise.all([
    partnerRepository.findAllCustody(),
    partnerRepository.findAll(),
    inventoryRepository.findAllItems(),
    orderRepository.findAll(),
  ]);

  const partnerMap = new Map(partnersList.map((p) => [p.id, p]));
  const itemMap = new Map(itemsList.map((i) => [i.id, i]));
  const orderMap = new Map(ordersList.map((o) => [o.id, o]));

  const enriched = custodyList.map((c) => {
    const partner = partnerMap.get(c.partnerId);
    const item = itemMap.get(c.itemId);
    const order = c.productionOrderId ? orderMap.get(c.productionOrderId) : undefined;
    const pendingQuantity =
      Math.round(Math.max(0, c.sentQuantity - c.returnedQuantity - c.lostQuantity) * 100) / 100;

    return {
      ...c,
      pendingQuantity,
      partnerCode: partner?.code,
      partnerName: partner?.tradeName || partner?.name || 'Parceiro',
      partnerType: partner?.partnerType,
      itemCode: item?.code,
      itemName: item?.name || 'Material',
      orderNumber: order?.orderNumber,
      clientName: order?.clientName,
    };
  });

  res.json(enriched);
});

// 4. Visão 360° de um parceiro (cadastro + OPs com conciliação financeira + custódia + financeiro CP)
partnersRouter.get('/:id', async (req: RequestWithUser, res: Response) => {
  const partner = await partnerRepository.findById(req.params.id);
  if (!partner) {
    return res.status(404).json({ error: 'Parceiro não encontrado.' });
  }

  const todayISO = getTodayISO();
  const [ordersList, custodyList, itemsList, financeList] = await Promise.all([
    orderRepository.findAll(),
    partnerRepository.findCustodyByPartner(partner.id),
    inventoryRepository.findAllItems(),
    financeRepository.findAll(),
  ]);

  const itemMap = new Map(itemsList.map((i) => [i.id, i]));
  const orderMap = new Map(ordersList.map((o) => [o.id, o]));

  const linkedCustody = custodyList.map((c) => {
    const item = itemMap.get(c.itemId);
    const order = c.productionOrderId ? orderMap.get(c.productionOrderId) : undefined;
    return {
      ...c,
      pendingQuantity:
        Math.round(Math.max(0, c.sentQuantity - c.returnedQuantity - c.lostQuantity) * 100) / 100,
      itemCode: item?.code,
      itemName: item?.name || 'Material',
      orderNumber: order?.orderNumber,
      clientName: order?.clientName,
    };
  });

  const openCustody = linkedCustody.filter(
    (c) => c.status === 'em_custodia' || c.status === 'devolvido_parcial'
  );
  const openCustodyQty = round2(openCustody.reduce((s, c) => s + c.pendingQuantity, 0));

  const finProfile = buildPartnerFinancialProfile(partner, ordersList, financeList, todayISO);
  const actor = req.user!;
  const canViewFinance = (PERMISSIONS['finance:view'] || []).includes(actor.role);

  return res.json({
    partner: {
      ...partner,
      metrics: {
        ...finProfile.metrics,
        openCustodyCount: openCustody.length,
        openCustodyQty,
      },
    },
    orders: finProfile.orders,
    custody: linkedCustody,
    payables: canViewFinance ? finProfile.payables : [],
    financialSummary: finProfile.metrics,
  });
});

// 5. Provisionar / Lançar Previsão de Pagamento (CP) para Serviço de Parceiro no Financeiro
partnersRouter.post(
  '/:id/provisions',
  requirePermission('partners:provision_payable'),
  async (req: RequestWithUser, res: Response) => {
    const actor = req.user!;
    const partner = await partnerRepository.findById(req.params.id);
    if (!partner) {
      return res.status(404).json({ error: 'Parceiro não encontrado.' });
    }
    if (!partner.active) {
      return res.status(400).json({
        error: `O parceiro ${partner.tradeName} está inativo e não pode receber novas provisões de pagamento.`,
      });
    }

    const body = req.body || {};
    const amount = round2(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'O valor da provisão/pagamento deve ser maior que zero.' });
    }

    const paymentMethod = String(body.paymentMethod || 'pix');
    if (!VALID_PAYMENT_METHODS.has(paymentMethod)) {
      return res.status(400).json({
        error: `Forma de pagamento inválida. Permitidas: ${Array.from(VALID_PAYMENT_METHODS).join(', ')}.`,
      });
    }

    const todayISO = getTodayISO();
    let linkedOrder = undefined;
    if (body.productionOrderId) {
      linkedOrder = (await orderRepository.findById(String(body.productionOrderId))) || undefined;
      if (!linkedOrder) {
        return res.status(404).json({ error: 'Ordem de Produção vinculada não encontrada.' });
      }
    }

    const defaultDueDate =
      linkedOrder?.targetDeliveryDate || addDaysISO(todayISO, partner.leadTimeDays || 5);
    const dueDate = body.dueDate ? String(body.dueDate).trim() : defaultDueDate;
    if (!isValidIsoDate(dueDate)) {
      return res.status(400).json({ error: 'Data de previsão de pagamento inválida. Utilize YYYY-MM-DD.' });
    }

    const assignment = linkedOrder ? computePartnerOrderAssignment(partner, linkedOrder) : null;
    const categoryLabel =
      PARTNER_CATEGORY_SERVICE_LABEL[partner.partnerType] || 'Serviço Terceirizado';

    const serviceReference =
      (typeof body.serviceReference === 'string' && body.serviceReference.trim()) ||
      assignment?.serviceReference ||
      `${categoryLabel} — ${partner.tradeName}`;

    const clientId = linkedOrder?.clientId || (typeof body.clientId === 'string' ? body.clientId.trim() || undefined : undefined);
    const clientName =
      linkedOrder?.clientName ||
      (typeof body.clientName === 'string' && body.clientName.trim()) ||
      undefined;

    const description =
      (typeof body.description === 'string' && body.description.trim().length >= 3
        ? body.description.trim()
        : `${categoryLabel} (${partner.tradeName})${linkedOrder ? ` · ${linkedOrder.orderNumber}` : ''}${clientName ? ` · Cliente: ${clientName}` : ''}`);

    const trxNumber = await sequenceService.nextFinanceNumberAsync();
    const nowIso = new Date().toISOString();
    const newTrx: FinancialTransactionEntity = {
      id: crypto.randomUUID(),
      transactionNumber: trxNumber,
      productionOrderId: linkedOrder?.id,
      quoteId: linkedOrder?.quoteId,
      partnerId: partner.id,
      partnerName: partner.tradeName,
      clientId,
      clientName,
      serviceReference,
      isProvision: body.isProvision !== false,
      type: 'pagar',
      subType: 'servico_terceirizado',
      description,
      category:
        (typeof body.category === 'string' && body.category.trim()) ||
        `Serviço Terceirizado (${categoryLabel})`,
      amount,
      dueDate,
      status: 'pendente',
      paymentMethod: paymentMethod as FinancialTransactionEntity['paymentMethod'],
      referenceId: linkedOrder?.orderNumber || partner.code,
      isDemo: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await financeRepository.save(newTrx);

    const [ordersList, financeList] = await Promise.all([
      orderRepository.findAll(),
      financeRepository.findAll(),
    ]);
    const updatedProfile = buildPartnerFinancialProfile(partner, ordersList, financeList, todayISO);

    auditService.log({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      entityName: 'financeiro.transactions',
      entityId: newTrx.transactionNumber,
      action: 'CREATE_PARTNER_PROVISION',
      newData: {
        transactionNumber: newTrx.transactionNumber,
        partnerCode: partner.code,
        partnerName: partner.tradeName,
        orderNumber: linkedOrder?.orderNumber,
        clientName,
        serviceReference,
        amount: newTrx.amount,
        dueDate: newTrx.dueDate,
        isProvision: newTrx.isProvision,
      },
      notes: `Provisão CP ${newTrx.transactionNumber} de R$ ${newTrx.amount.toFixed(2)} para ${partner.tradeName} (Previsão: ${dueDate}${clientName ? ` · Cliente: ${clientName}` : ''}).`,
    });

    return res.status(201).json({
      transaction: withEffectiveStatus(newTrx, todayISO),
      financialSummary: updatedProfile.metrics,
    });
  }
);

// 6. Cadastrar novo parceiro / facção terceirizada
partnersRouter.post('/', requirePermission('partners:manage'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const body = req.body || {};

  const name = String(body.name || '').trim();
  const tradeName = String(body.tradeName || name).trim();
  const phone = String(body.phone || '').trim();
  const partnerType = String(body.partnerType || '') as PartnerServiceCategory;

  if (!name || name.length < 2) {
    return res.status(400).json({ error: 'Informe a Razão Social ou Nome completo do parceiro.' });
  }
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'Informe um telefone/WhatsApp válido com DDD.' });
  }
  if (!VALID_PARTNER_TYPES.has(partnerType)) {
    return res.status(400).json({
      error: `Categoria de serviço inválida. Permitidas: ${Array.from(VALID_PARTNER_TYPES).join(', ')}.`,
    });
  }

  const rating = Math.min(5, Math.max(0, Number(body.rating ?? 5)));
  const defaultCostPerPiece = Math.max(0, Math.round(Number(body.defaultCostPerPiece ?? 0) * 100) / 100);
  const leadTimeDays = Math.min(180, Math.max(1, Math.floor(Number(body.leadTimeDays ?? 5))));
  const nowIso = new Date().toISOString();

  const geo = sanitizeAddressGeoInput(body);
  const composedAddress = composeServerAddressLine(geo);
  const resolvedAddress =
    (body.address ? String(body.address).trim() : '') || composedAddress || undefined;

  const newPartner: PartnerEntity = {
    id: crypto.randomUUID(),
    code: await sequenceService.nextPartnerCodeAsync(),
    name,
    tradeName,
    cnpjCpf: body.cnpjCpf ? String(body.cnpjCpf).trim() : undefined,
    phone,
    email: body.email ? String(body.email).trim() : undefined,
    ...geo,
    address: resolvedAddress,
    city: String(body.city || 'São Luís').trim(),
    state: String(body.state || 'MA').trim().toUpperCase().slice(0, 2),
    partnerType,
    capacityPiecesPerMonth: body.capacityPiecesPerMonth
      ? String(body.capacityPiecesPerMonth).replace(/\D/g, '')
      : undefined,
    defaultCostPerPiece,
    leadTimeDays,
    pixKey: body.pixKey ? String(body.pixKey).trim() : undefined,
    rating: Number.isFinite(rating) ? Math.round(rating * 100) / 100 : 5,
    notes: body.notes ? String(body.notes).trim() : undefined,
    active: body.active !== undefined ? Boolean(body.active) : true,
    isDemo: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await partnerRepository.save(newPartner);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'producao.partners',
    entityId: newPartner.code,
    action: 'CREATE_PARTNER',
    newData: {
      code: newPartner.code,
      tradeName: newPartner.tradeName,
      partnerType: newPartner.partnerType,
      defaultCostPerPiece: newPartner.defaultCostPerPiece,
    },
    notes: `Parceiro terceirizado ${newPartner.tradeName} (${newPartner.code} — ${newPartner.partnerType}) homologado.`,
  });

  return res.status(201).json(newPartner);
});

// 7. Atualizar parceiro / facção (allowlist explícita)
partnersRouter.put('/:id', requirePermission('partners:manage'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const existing = await partnerRepository.findById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Parceiro não encontrado.' });
  }

  const body = req.body || {};
  const partnerType = (body.partnerType ?? existing.partnerType) as PartnerServiceCategory;
  if (!VALID_PARTNER_TYPES.has(partnerType)) {
    return res.status(400).json({
      error: `Categoria de serviço inválida. Permitidas: ${Array.from(VALID_PARTNER_TYPES).join(', ')}.`,
    });
  }

  const phone = String(body.phone ?? existing.phone).trim();
  if (phone.replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'Informe um telefone/WhatsApp válido com DDD.' });
  }

  const rating = Math.min(5, Math.max(0, Number(body.rating ?? existing.rating)));
  const defaultCostPerPiece = Math.max(
    0,
    Math.round(Number(body.defaultCostPerPiece ?? existing.defaultCostPerPiece ?? 0) * 100) / 100
  );
  const leadTimeDays = Math.min(
    180,
    Math.max(1, Math.floor(Number(body.leadTimeDays ?? existing.leadTimeDays ?? 5)))
  );

  const geo = sanitizeAddressGeoInput(body, existing);
  const composedAddress = composeServerAddressLine(geo);
  const resolvedAddress =
    body.address !== undefined
      ? String(body.address || '').trim() || composedAddress || undefined
      : composedAddress || existing.address;

  const updated: PartnerEntity = {
    ...existing,
    name: String(body.name ?? existing.name).trim() || existing.name,
    tradeName: String(body.tradeName ?? existing.tradeName).trim() || existing.tradeName,
    cnpjCpf: body.cnpjCpf !== undefined ? String(body.cnpjCpf).trim() || undefined : existing.cnpjCpf,
    phone,
    email: body.email !== undefined ? String(body.email).trim() || undefined : existing.email,
    ...geo,
    address: resolvedAddress,
    city: String(body.city ?? existing.city).trim() || 'São Luís',
    state: String(body.state ?? existing.state ?? 'MA').trim().toUpperCase().slice(0, 2),
    partnerType,
    capacityPiecesPerMonth:
      body.capacityPiecesPerMonth !== undefined
        ? String(body.capacityPiecesPerMonth).replace(/\D/g, '') || undefined
        : existing.capacityPiecesPerMonth,
    defaultCostPerPiece,
    leadTimeDays,
    pixKey: body.pixKey !== undefined ? String(body.pixKey).trim() || undefined : existing.pixKey,
    rating: Number.isFinite(rating) ? Math.round(rating * 100) / 100 : existing.rating,
    notes: body.notes !== undefined ? String(body.notes).trim() || undefined : existing.notes,
    active: body.active !== undefined ? Boolean(body.active) : existing.active,
    updatedAt: new Date().toISOString(),
  };

  await partnerRepository.save(updated);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'producao.partners',
    entityId: updated.code,
    action: 'UPDATE_PARTNER',
    oldData: {
      tradeName: existing.tradeName,
      partnerType: existing.partnerType,
      active: existing.active,
      defaultCostPerPiece: existing.defaultCostPerPiece,
    },
    newData: {
      tradeName: updated.tradeName,
      partnerType: updated.partnerType,
      active: updated.active,
      defaultCostPerPiece: updated.defaultCostPerPiece,
    },
    notes: `Cadastro do parceiro ${updated.tradeName} (${updated.code}) atualizado.`,
  });

  return res.json(updated);
});

// 8. Excluir parceiro (bloqueia se houver custódia ativa, OPs em andamento ou títulos financeiros vinculados)
partnersRouter.delete('/:id', requirePermission('partners:delete'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const partner = await partnerRepository.findById(req.params.id);
  if (!partner) {
    return res.status(404).json({ error: 'Parceiro não encontrado.' });
  }

  const [custodyList, ordersList, financeList] = await Promise.all([
    partnerRepository.findCustodyByPartner(partner.id),
    orderRepository.findAll(),
    financeRepository.findAll(),
  ]);

  const openCustody = custodyList.filter(
    (c) => c.status === 'em_custodia' || c.status === 'devolvido_parcial'
  );
  if (openCustody.length > 0) {
    return res.status(409).json({
      error: `Exclusão bloqueada: ${partner.tradeName} possui ${openCustody.length} remessa(s) de material ainda sob custódia. Registre o retorno ou baixa de perda antes de excluir.`,
      code: 'PARTNER_HAS_OPEN_CUSTODY',
    });
  }

  const finProfile = buildPartnerFinancialProfile(partner, ordersList, financeList);

  if (finProfile.metrics.activeOrdersCount > 0) {
    return res.status(409).json({
      error: `Exclusão bloqueada: ${partner.tradeName} está vinculado a ${finProfile.metrics.activeOrdersCount} Ordem(ns) de Produção em aberto. Inative o parceiro em vez de excluí-lo.`,
      code: 'PARTNER_HAS_ACTIVE_ORDERS',
    });
  }

  if (finProfile.metrics.pendingPayablesAmount > 0) {
    return res.status(409).json({
      error: `Exclusão bloqueada: ${partner.tradeName} possui Contas a Pagar em aberto (R$ ${finProfile.metrics.pendingPayablesAmount.toFixed(2)}). Liquide ou cancele os títulos pendentes antes de excluir, ou inative o parceiro.`,
      code: 'PARTNER_HAS_OPEN_PAYABLES',
    });
  }

  if (finProfile.metrics.paidServicesAmount > 0) {
    return res.status(409).json({
      error: `Exclusão bloqueada: ${partner.tradeName} possui histórico financeiro liquidado (R$ ${finProfile.metrics.paidServicesAmount.toFixed(2)}). Para preservar a auditoria contábil, inative o cadastro em vez de excluí-lo.`,
      code: 'PARTNER_HAS_FINANCIAL_HISTORY',
    });
  }

  await partnerRepository.delete(partner.id);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'producao.partners',
    entityId: partner.code,
    action: 'DELETE_PARTNER',
    notes: `Parceiro ${partner.tradeName} (${partner.code}) excluído.`,
  });

  return res.json({ success: true, message: 'Parceiro excluído com sucesso.' });
});

// 7. Remessa de Material para Custódia do Parceiro (integra Estoque + Movimento + Custódia)
partnersRouter.post(
  '/:id/custody',
  requirePermission('partners:manage_custody'),
  async (req: RequestWithUser, res: Response) => {
    const actor = req.user!;
    const partner = await partnerRepository.findById(req.params.id);
    if (!partner) {
      return res.status(404).json({ error: 'Parceiro não encontrado.' });
    }
    if (!partner.active) {
      return res.status(400).json({
        error: `O parceiro ${partner.tradeName} está inativo e não pode receber novas remessas de material.`,
      });
    }

    const { itemId, productionOrderId, sentQuantity, notes } = req.body || {};
    const qty = Math.round(Number(sentQuantity || 0) * 100) / 100;
    if (!itemId || typeof itemId !== 'string') {
      return res.status(400).json({ error: 'Selecione um insumo/tecido do almoxarifado.' });
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ error: 'A quantidade remetida deve ser maior que zero.' });
    }

    const item = await inventoryRepository.findItemById(itemId);
    if (!item) {
      return res.status(404).json({ error: 'Insumo não encontrado no almoxarifado.' });
    }
    if (item.physicalStock < qty) {
      return res.status(400).json({
        error: `Saldo físico insuficiente para remessa (${item.name}: disponível ${item.physicalStock} ${item.unit}).`,
      });
    }

    let orderRef = undefined;
    if (productionOrderId) {
      const order = await orderRepository.findById(String(productionOrderId));
      if (!order) {
        return res.status(404).json({ error: 'Ordem de Produção vinculada não encontrada.' });
      }
      orderRef = order;
    }

    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];

    // 1. Atualizar saldos do insumo (Físico -> Em Poder de Terceiros), preservando invariante allocatedStock <= physicalStock
    item.physicalStock = Math.round((item.physicalStock - qty) * 100) / 100;
    if (item.allocatedStock > item.physicalStock) {
      item.allocatedStock = item.physicalStock;
    }
    item.inPartnersCustodyStock = Math.round((item.inPartnersCustodyStock + qty) * 100) / 100;
    item.updatedAt = nowIso;
    await inventoryRepository.saveItem(item);

    // 2. Registrar movimento compensatório no Estoque (remessa_parceiro)
    const movement: StockMovementEntity = {
      id: crypto.randomUUID(),
      movementNumber: await sequenceService.nextMovementNumberAsync(),
      itemId: item.id,
      productionOrderId: orderRef?.id,
      type: 'remessa_parceiro',
      quantity: qty,
      unit: item.unit,
      date: todayStr,
      reason: `Remessa para parceiro ${partner.tradeName} (${partner.code})${orderRef ? ` — ${orderRef.orderNumber}` : ''}${notes ? `. ${String(notes).trim()}` : ''}`,
      referenceDoc: orderRef?.orderNumber || partner.code,
      operatorId: actor.id,
      operatorName: actor.fullName,
      isDemo: false,
      createdAt: nowIso,
    };
    await inventoryRepository.saveMovement(movement);

    // 3. Registrar custódia rastreada
    const custody: PartnerCustodyEntity = {
      id: crypto.randomUUID(),
      partnerId: partner.id,
      itemId: item.id,
      productionOrderId: orderRef?.id,
      remittanceMovementId: movement.id,
      sentQuantity: qty,
      returnedQuantity: 0,
      lostQuantity: 0,
      unit: item.unit,
      sentDate: todayStr,
      status: 'em_custodia',
      notes: notes ? String(notes).trim() : undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await partnerRepository.saveCustody(custody);

    auditService.log({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      entityName: 'estoque.partner_custody',
      entityId: movement.movementNumber,
      action: 'PARTNER_CUSTODY_DISPATCH',
      newData: {
        partnerCode: partner.code,
        partnerName: partner.tradeName,
        itemCode: item.code,
        quantity: qty,
        unit: item.unit,
        orderNumber: orderRef?.orderNumber,
      },
      notes: `Remessa de ${qty} ${item.unit} de ${item.name} para ${partner.tradeName}.`,
    });

    return res.status(201).json({ custody, movement, item });
  }
);

// 8. Retorno / Baixa de Consumo / Perda Técnica de Custódia de Parceiro
partnersRouter.post(
  '/custody/:custodyId/return',
  requirePermission('partners:manage_custody'),
  async (req: RequestWithUser, res: Response) => {
    const actor = req.user!;
    const custody = await partnerRepository.findCustodyById(req.params.custodyId);
    if (!custody) {
      return res.status(404).json({ error: 'Registro de custódia não encontrado.' });
    }

    const pending =
      Math.round(Math.max(0, custody.sentQuantity - custody.returnedQuantity - custody.lostQuantity) * 100) /
      100;
    if (pending <= 0) {
      return res.status(400).json({ error: 'Esta remessa já foi totalmente baixada/devolvida.' });
    }

    const returnedQty = Math.round(Math.max(0, Number(req.body?.returnedQuantity || 0)) * 100) / 100;
    const lostQty = Math.round(Math.max(0, Number(req.body?.lostQuantity || 0)) * 100) / 100;
    const returnToPhysicalStock = req.body?.returnToPhysicalStock !== false; // true = sobra devolvida ao estoque; false = consumido em peças prontas
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';

    if (returnedQty + lostQty <= 0) {
      return res.status(400).json({
        error: 'Informe quantidade devolvida/consumida ou perda técnica maior que zero.',
      });
    }
    if (Math.round((returnedQty + lostQty) * 100) > Math.round(pending * 100)) {
      return res.status(400).json({
        error: `A soma (${returnedQty + lostQty} ${custody.unit}) excede o saldo pendente sob custódia (${pending} ${custody.unit}).`,
      });
    }

    const [partner, item] = await Promise.all([
      partnerRepository.findById(custody.partnerId),
      inventoryRepository.findItemById(custody.itemId),
    ]);
    if (!item) {
      return res.status(404).json({ error: 'Insumo vinculado não encontrado.' });
    }

    const totalSettled = Math.round((returnedQty + lostQty) * 100) / 100;
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];

    // Atualizar saldos do estoque
    item.inPartnersCustodyStock = Math.max(
      0,
      Math.round((item.inPartnersCustodyStock - totalSettled) * 100) / 100
    );
    if (returnedQty > 0 && returnToPhysicalStock) {
      item.physicalStock = Math.round((item.physicalStock + returnedQty) * 100) / 100;
    }
    item.updatedAt = nowIso;
    await inventoryRepository.saveItem(item);

    const createdMovements: StockMovementEntity[] = [];

    if (returnedQty > 0) {
      const movRet: StockMovementEntity = {
        id: crypto.randomUUID(),
        movementNumber: await sequenceService.nextMovementNumberAsync(),
        itemId: item.id,
        productionOrderId: custody.productionOrderId,
        type: returnToPhysicalStock ? 'retorno_parceiro' : 'saida_corte',
        quantity: returnedQty,
        unit: item.unit,
        date: todayStr,
        reason: `${
          returnToPhysicalStock ? 'Devolução ao estoque físico' : 'Consumo confirmado em peças prontas'
        } — parceiro ${partner?.tradeName || custody.partnerId}${notes ? `. ${notes}` : ''}`,
        referenceDoc: partner?.code,
        operatorId: actor.id,
        operatorName: actor.fullName,
        isDemo: false,
        createdAt: nowIso,
      };
      await inventoryRepository.saveMovement(movRet);
      createdMovements.push(movRet);
    }

    if (lostQty > 0) {
      const movLoss: StockMovementEntity = {
        id: crypto.randomUUID(),
        movementNumber: await sequenceService.nextMovementNumberAsync(),
        itemId: item.id,
        productionOrderId: custody.productionOrderId,
        type: 'perda_tecnica',
        quantity: lostQty,
        unit: item.unit,
        date: todayStr,
        reason: `Perda técnica / avaria registrada com parceiro ${partner?.tradeName || custody.partnerId}${notes ? `. ${notes}` : ''}`,
        referenceDoc: partner?.code,
        operatorId: actor.id,
        operatorName: actor.fullName,
        isDemo: false,
        createdAt: nowIso,
      };
      await inventoryRepository.saveMovement(movLoss);
      createdMovements.push(movLoss);
    }

    custody.returnedQuantity = Math.round((custody.returnedQuantity + returnedQty) * 100) / 100;
    custody.lostQuantity = Math.round((custody.lostQuantity + lostQty) * 100) / 100;
    const remaining =
      Math.round(
        Math.max(0, custody.sentQuantity - custody.returnedQuantity - custody.lostQuantity) * 100
      ) / 100;

    if (remaining === 0) {
      custody.status = custody.lostQuantity > 0 ? 'avaria_registrada' : 'devolvido_total';
    } else {
      custody.status = 'devolvido_parcial';
    }
    if (notes) {
      custody.notes = custody.notes ? `${custody.notes} | ${notes}` : notes;
    }
    custody.updatedAt = nowIso;
    await partnerRepository.saveCustody(custody);

    auditService.log({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      entityName: 'estoque.partner_custody',
      entityId: custody.id,
      action: 'PARTNER_CUSTODY_RETURN',
      newData: {
        partnerCode: partner?.code,
        returnedQty,
        lostQty,
        returnToPhysicalStock,
        remaining,
        status: custody.status,
      },
      notes: `Baixa de custódia (${partner?.tradeName}): devolvido/consumido ${returnedQty} ${custody.unit}, perda ${lostQty} ${custody.unit}. Saldo restante: ${remaining} ${custody.unit}.`,
    });

    return res.json({ custody, movements: createdMovements, item, remaining });
  }
);
