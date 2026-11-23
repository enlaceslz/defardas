/**
 * DE FARDAS ERP — Partner Financial Reconciliation & Provision Service
 * Fonte única e server-authoritative para acompanhamento financeiro de parceiros terceirizados:
 * - Valor Contratado (OPs onde o parceiro atua como facção principal e/ou personalização bordado/silk)
 * - Valor Já Pago (títulos servico_terceirizado liquidados)
 * - Restante CP (títulos servico_terceirizado lançados em Contas a Pagar em aberto/atrasados)
 * - A Provisionar (diferença contratada em OPs ainda sem título lançado no Financeiro)
 * - Referência explícita de Serviço, Ordem de Produção, Cliente e Previsão de Pagamento.
 */
import {
  FinancialTransactionEntity,
  PartnerEntity,
  PartnerServiceCategory,
  ProductionOrderEntity,
} from '../types/db';

export const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

export function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function addDaysISO(baseIso: string, days: number): string {
  const base = new Date(`${baseIso}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) return getTodayISO();
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().split('T')[0];
}

export function withEffectiveStatus(
  trx: FinancialTransactionEntity,
  todayISO = getTodayISO()
): FinancialTransactionEntity {
  if (trx.status === 'pendente' && trx.dueDate && trx.dueDate < todayISO) {
    return { ...trx, status: 'atrasado' };
  }
  return trx;
}

export const PARTNER_CATEGORY_SERVICE_LABEL: Record<PartnerServiceCategory, string> = {
  costura: 'Facção de Costura',
  bordado: 'Bordado Computadorizado',
  silk_screen: 'Estamparia & Silk-Screen',
  acabamento: 'Acabamento & Revisão',
  corte_externo: 'Corte Terceirizado',
};

export function normalizeText(value?: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function partnerMatchesName(partner: PartnerEntity, candidate?: string): boolean {
  const target = normalizeText(candidate);
  if (!target) return false;
  const trade = normalizeText(partner.tradeName);
  const legal = normalizeText(partner.name);
  return (
    target === trade ||
    target === legal ||
    (trade.length >= 4 && target.includes(trade)) ||
    (legal.length >= 4 && target.includes(legal))
  );
}

/**
 * Determina com segurança se um lançamento financeiro pertence a um parceiro.
 * Regra anti-contaminação cruzada: quando partnerId está preenchido, a correspondência
 * é estritamente pelo UUID (impede que um título de Bordado seja atribuído à Facção de Costura na mesma OP).
 */
export function doesTransactionBelongToPartner(
  trx: FinancialTransactionEntity,
  partner: PartnerEntity
): boolean {
  if (trx.type !== 'pagar' || trx.subType !== 'servico_terceirizado') {
    return false;
  }
  if (trx.partnerId) {
    return trx.partnerId === partner.id;
  }
  if (trx.partnerName) {
    return partnerMatchesName(partner, trx.partnerName);
  }
  // Fallback somente para lançamentos legados sem partnerId/partnerName
  return partnerMatchesName(partner, trx.description);
}

export interface PartnerOrderAssignment {
  order: ProductionOrderEntity;
  serviceRole: 'principal' | 'personalizacao' | 'misto';
  serviceReference: string;
  unitCost: number;
  contractedAmount: number;
}

export function computePartnerOrderAssignment(
  partner: PartnerEntity,
  order: ProductionOrderEntity
): PartnerOrderAssignment | null {
  const isMainOutsourced = partnerMatchesName(partner, order.outsourcedPartner);
  const customizations = Array.isArray(order.customizations) ? order.customizations : [];
  const matchedCustomizations = customizations.filter((c: any) =>
    partnerMatchesName(partner, c?.partnerName)
  );

  if (!isMainOutsourced && matchedCustomizations.length === 0) {
    return null;
  }

  const pieces = Math.max(0, Number(order.totalPieces || 0));
  const mainUnitCost = isMainOutsourced
    ? Number(order.partnerCostPerPiece && order.partnerCostPerPiece > 0
        ? order.partnerCostPerPiece
        : partner.defaultCostPerPiece || 0)
    : 0;
  const customUnitCost = matchedCustomizations.reduce(
    (sum: number, c: any) => sum + Math.max(0, Number(c?.unitCost || 0)),
    0
  );

  const unitCost = round2(mainUnitCost + customUnitCost);
  const contractedAmount = round2(pieces * unitCost);

  const baseCategoryLabel = PARTNER_CATEGORY_SERVICE_LABEL[partner.partnerType] || 'Serviço Terceirizado';
  const customSummary = matchedCustomizations
    .map((c: any) => c?.description || c?.type || 'Personalização')
    .filter(Boolean)
    .join(' + ');

  let serviceRole: 'principal' | 'personalizacao' | 'misto' = 'principal';
  let serviceReference = `${baseCategoryLabel} — ${order.itemTitle} (${pieces} pçs)`;

  if (isMainOutsourced && matchedCustomizations.length > 0) {
    serviceRole = 'misto';
    serviceReference = `${baseCategoryLabel} + ${customSummary} — ${order.itemTitle} (${pieces} pçs)`;
  } else if (!isMainOutsourced && matchedCustomizations.length > 0) {
    serviceRole = 'personalizacao';
    serviceReference = `${baseCategoryLabel}: ${customSummary} — ${order.itemTitle} (${pieces} pçs)`;
  }

  return {
    order,
    serviceRole,
    serviceReference,
    unitCost,
    contractedAmount,
  };
}

export interface PartnerOrderFinancials {
  serviceRole: 'principal' | 'personalizacao' | 'misto';
  serviceReference: string;
  unitCost: number;
  contractedAmount: number;
  paidAmount: number;
  pendingCpAmount: number;
  overdueCpAmount: number;
  unbilledProvisionAmount: number;
  remainingTotalAmount: number;
  nextDueDate: string | null;
  forecastDueDate: string;
  openPayablesCount: number;
  paidPayablesCount: number;
  paymentStatus: 'quitado' | 'atrasado' | 'parcial_cp' | 'cp_lancado' | 'a_provisionar';
}

export interface EnrichedPartnerOrder extends ProductionOrderEntity {
  financials: PartnerOrderFinancials;
}

export interface PartnerFinancialMetrics {
  activeOrdersCount: number;
  totalOrdersCount: number;
  totalPiecesAssigned: number;
  totalContractedAmount: number;
  paidServicesAmount: number;
  pendingPayablesAmount: number;
  overduePayablesAmount: number;
  unbilledProvisionAmount: number;
  totalRemainingAmount: number;
  nextPaymentDate: string | null;
}

export interface PartnerForecastRow {
  rowKey: string;
  partnerId: string;
  partnerCode: string;
  partnerName: string;
  partnerType: PartnerServiceCategory;
  pixKey?: string;
  leadTimeDays: number;
  productionOrderId?: string;
  orderNumber?: string;
  orderStage?: string;
  itemTitle?: string;
  totalPieces: number;
  targetDeliveryDate?: string;
  clientId?: string;
  clientName: string;
  serviceRole: 'principal' | 'personalizacao' | 'misto' | 'avulso';
  serviceReference: string;
  unitCost: number;
  contractedAmount: number;
  paidAmount: number;
  pendingCpAmount: number;
  overdueCpAmount: number;
  unbilledProvisionAmount: number;
  remainingTotalAmount: number;
  nextDueDate: string | null;
  forecastDueDate: string;
  openPayablesCount: number;
  paidPayablesCount: number;
  paymentStatus: 'quitado' | 'atrasado' | 'parcial_cp' | 'cp_lancado' | 'a_provisionar';
}

export interface PartnerFinancialProfile {
  orders: EnrichedPartnerOrder[];
  payables: (FinancialTransactionEntity & { orderNumber?: string })[];
  standalonePayables: FinancialTransactionEntity[];
  metrics: PartnerFinancialMetrics;
  forecastRows: PartnerForecastRow[];
}

function derivePaymentStatus(
  contractedAmount: number,
  paidAmount: number,
  pendingCpAmount: number,
  overdueCpAmount: number,
  unbilledProvisionAmount: number
): 'quitado' | 'atrasado' | 'parcial_cp' | 'cp_lancado' | 'a_provisionar' {
  if (overdueCpAmount > 0) return 'atrasado';
  if (pendingCpAmount === 0 && unbilledProvisionAmount === 0 && (paidAmount > 0 || contractedAmount === 0)) {
    return 'quitado';
  }
  if (pendingCpAmount > 0 && unbilledProvisionAmount === 0) {
    return 'cp_lancado';
  }
  if (pendingCpAmount > 0 || paidAmount > 0) {
    return 'parcial_cp';
  }
  return 'a_provisionar';
}

export function buildPartnerFinancialProfile(
  partner: PartnerEntity,
  ordersList: ProductionOrderEntity[],
  financeList: FinancialTransactionEntity[],
  todayISO = getTodayISO()
): PartnerFinancialProfile {
  const orderMapById = new Map(ordersList.map((o) => [o.id, o]));
  const orderMapByNumber = new Map(ordersList.map((o) => [o.orderNumber, o]));

  const assignments: PartnerOrderAssignment[] = [];
  for (const order of ordersList) {
    const assignment = computePartnerOrderAssignment(partner, order);
    if (assignment) {
      assignments.push(assignment);
    }
  }

  const assignedOrderIds = new Set(assignments.map((a) => a.order.id));
  const assignedOrderNumbers = new Set(assignments.map((a) => a.order.orderNumber));

  const linkedPayables = financeList
    .filter((f) => doesTransactionBelongToPartner(f, partner))
    .map((raw) => {
      const f = withEffectiveStatus(raw, todayISO);
      const linkedOrder =
        (f.productionOrderId ? orderMapById.get(f.productionOrderId) : undefined) ||
        (f.referenceId ? orderMapByNumber.get(f.referenceId) : undefined);
      return {
        ...f,
        partnerId: f.partnerId || partner.id,
        partnerName: f.partnerName || partner.tradeName,
        clientId: f.clientId || linkedOrder?.clientId,
        clientName: f.clientName || linkedOrder?.clientName,
        orderNumber: linkedOrder?.orderNumber || f.referenceId,
      };
    })
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

  const enrichedOrders: EnrichedPartnerOrder[] = [];
  const forecastRows: PartnerForecastRow[] = [];

  let totalContractedAmount = 0;
  let totalUnbilledProvisionAmount = 0;

  for (const assignment of assignments) {
    const { order, serviceRole, serviceReference, unitCost, contractedAmount } = assignment;
    const orderPayables = linkedPayables.filter(
      (p) =>
        p.status !== 'estornado' &&
        (p.productionOrderId === order.id || (p.referenceId && p.referenceId === order.orderNumber))
    );

    const paidList = orderPayables.filter((p) => p.status === 'pago');
    const openList = orderPayables.filter((p) => p.status === 'pendente' || p.status === 'atrasado');
    const overdueList = orderPayables.filter((p) => p.status === 'atrasado');

    const paidAmount = round2(paidList.reduce((s, p) => s + p.amount, 0));
    const pendingCpAmount = round2(openList.reduce((s, p) => s + p.amount, 0));
    const overdueCpAmount = round2(overdueList.reduce((s, p) => s + p.amount, 0));
    const totalBilled = round2(paidAmount + pendingCpAmount);
    const unbilledProvisionAmount = round2(Math.max(0, contractedAmount - totalBilled));
    const remainingTotalAmount = round2(pendingCpAmount + unbilledProvisionAmount);

    const openDueDates = openList
      .map((p) => p.dueDate)
      .filter(Boolean)
      .sort();
    const nextDueDate = openDueDates.length > 0 ? openDueDates[0] : null;
    const defaultForecastDate =
      order.targetDeliveryDate || addDaysISO(todayISO, partner.leadTimeDays || 5);
    const forecastDueDate = nextDueDate || defaultForecastDate;

    const paymentStatus = derivePaymentStatus(
      contractedAmount,
      paidAmount,
      pendingCpAmount,
      overdueCpAmount,
      unbilledProvisionAmount
    );

    const financials: PartnerOrderFinancials = {
      serviceRole,
      serviceReference,
      unitCost,
      contractedAmount,
      paidAmount,
      pendingCpAmount,
      overdueCpAmount,
      unbilledProvisionAmount,
      remainingTotalAmount,
      nextDueDate,
      forecastDueDate,
      openPayablesCount: openList.length,
      paidPayablesCount: paidList.length,
      paymentStatus,
    };

    enrichedOrders.push({ ...order, financials });
    totalContractedAmount = round2(totalContractedAmount + Math.max(contractedAmount, totalBilled));
    totalUnbilledProvisionAmount = round2(totalUnbilledProvisionAmount + unbilledProvisionAmount);

    forecastRows.push({
      rowKey: `${partner.id}::${order.id}`,
      partnerId: partner.id,
      partnerCode: partner.code,
      partnerName: partner.tradeName,
      partnerType: partner.partnerType,
      pixKey: partner.pixKey,
      leadTimeDays: partner.leadTimeDays || 5,
      productionOrderId: order.id,
      orderNumber: order.orderNumber,
      orderStage: order.stage,
      itemTitle: order.itemTitle,
      totalPieces: order.totalPieces || 0,
      targetDeliveryDate: order.targetDeliveryDate,
      clientId: order.clientId,
      clientName: order.clientName,
      serviceRole,
      serviceReference,
      unitCost,
      contractedAmount,
      paidAmount,
      pendingCpAmount,
      overdueCpAmount,
      unbilledProvisionAmount,
      remainingTotalAmount,
      nextDueDate,
      forecastDueDate,
      openPayablesCount: openList.length,
      paidPayablesCount: paidList.length,
      paymentStatus,
    });
  }

  // Títulos avulsos de serviço terceirizado do parceiro (sem vínculo a uma OP atribuída a ele)
  const standalonePayables = linkedPayables.filter(
    (p) =>
      p.status !== 'estornado' &&
      !(
        (p.productionOrderId && assignedOrderIds.has(p.productionOrderId)) ||
        (p.referenceId && assignedOrderNumbers.has(p.referenceId))
      )
  );

  for (const sp of standalonePayables) {
    const paidAmount = sp.status === 'pago' ? sp.amount : 0;
    const pendingCpAmount = sp.status === 'pendente' || sp.status === 'atrasado' ? sp.amount : 0;
    const overdueCpAmount = sp.status === 'atrasado' ? sp.amount : 0;
    totalContractedAmount = round2(totalContractedAmount + sp.amount);

    forecastRows.push({
      rowKey: `${partner.id}::trx::${sp.id}`,
      partnerId: partner.id,
      partnerCode: partner.code,
      partnerName: partner.tradeName,
      partnerType: partner.partnerType,
      pixKey: partner.pixKey,
      leadTimeDays: partner.leadTimeDays || 5,
      productionOrderId: sp.productionOrderId,
      orderNumber: sp.orderNumber,
      itemTitle: sp.serviceReference || sp.description,
      totalPieces: 0,
      clientId: sp.clientId,
      clientName: sp.clientName || 'Serviço Avulso / Interno',
      serviceRole: 'avulso',
      serviceReference: sp.serviceReference || sp.description,
      unitCost: 0,
      contractedAmount: sp.amount,
      paidAmount: round2(paidAmount),
      pendingCpAmount: round2(pendingCpAmount),
      overdueCpAmount: round2(overdueCpAmount),
      unbilledProvisionAmount: 0,
      remainingTotalAmount: round2(pendingCpAmount),
      nextDueDate: pendingCpAmount > 0 ? sp.dueDate : null,
      forecastDueDate: sp.dueDate,
      openPayablesCount: pendingCpAmount > 0 ? 1 : 0,
      paidPayablesCount: paidAmount > 0 ? 1 : 0,
      paymentStatus:
        overdueCpAmount > 0
          ? 'atrasado'
          : paidAmount > 0
            ? 'quitado'
            : 'cp_lancado',
    });
  }

  const activeOrders = enrichedOrders.filter((o) => o.stage !== 'entregue');
  const totalPiecesAssigned = activeOrders.reduce((s, o) => s + (o.totalPieces || 0), 0);

  const nonReversedPayables = linkedPayables.filter((f) => f.status !== 'estornado');
  const paidServicesAmount = round2(
    nonReversedPayables
      .filter((f) => f.status === 'pago')
      .reduce((s, f) => s + f.amount, 0)
  );
  const openPayables = nonReversedPayables.filter(
    (f) => f.status === 'pendente' || f.status === 'atrasado'
  );
  const pendingPayablesAmount = round2(openPayables.reduce((s, f) => s + f.amount, 0));
  const overduePayablesAmount = round2(
    nonReversedPayables
      .filter((f) => f.status === 'atrasado')
      .reduce((s, f) => s + f.amount, 0)
  );
  const totalRemainingAmount = round2(pendingPayablesAmount + totalUnbilledProvisionAmount);

  // Próxima previsão de pagamento: menor vencimento de CP em aberto ou, se não houver CP lançado, menor entrega de OP a provisionar
  const openDates = openPayables
    .map((f) => f.dueDate)
    .filter(Boolean)
    .sort();
  const unbilledForecastDates = enrichedOrders
    .filter((o) => o.financials.unbilledProvisionAmount > 0)
    .map((o) => o.financials.forecastDueDate)
    .filter(Boolean)
    .sort();
  const nextPaymentDate =
    openDates.length > 0
      ? openDates[0]
      : unbilledForecastDates.length > 0
        ? unbilledForecastDates[0]
        : null;

  return {
    orders: enrichedOrders,
    payables: linkedPayables,
    standalonePayables,
    metrics: {
      activeOrdersCount: activeOrders.length,
      totalOrdersCount: enrichedOrders.length,
      totalPiecesAssigned,
      totalContractedAmount,
      paidServicesAmount,
      pendingPayablesAmount,
      overduePayablesAmount,
      unbilledProvisionAmount: totalUnbilledProvisionAmount,
      totalRemainingAmount,
      nextPaymentDate,
    },
    forecastRows,
  };
}

export interface GlobalPartnerPayablesSummary {
  totalContracted: number;
  totalPaid: number;
  totalPendingCP: number;
  totalOverdueCP: number;
  totalUnbilledProvision: number;
  totalRemaining: number;
  nextPaymentDate: string | null;
  openObligationsCount: number;
  partnersWithOpenBalanceCount: number;
}

export function buildGlobalPartnerForecast(
  partnersList: PartnerEntity[],
  ordersList: ProductionOrderEntity[],
  financeList: FinancialTransactionEntity[],
  todayISO = getTodayISO()
): { rows: PartnerForecastRow[]; summary: GlobalPartnerPayablesSummary } {
  const allRows: PartnerForecastRow[] = [];
  let totalContracted = 0;
  let totalPaid = 0;
  let totalPendingCP = 0;
  let totalOverdueCP = 0;
  let totalUnbilledProvision = 0;
  let totalRemaining = 0;
  let partnersWithOpenBalanceCount = 0;
  const candidateNextDates: string[] = [];

  for (const partner of partnersList) {
    const profile = buildPartnerFinancialProfile(partner, ordersList, financeList, todayISO);
    allRows.push(...profile.forecastRows);
    totalContracted = round2(totalContracted + profile.metrics.totalContractedAmount);
    totalPaid = round2(totalPaid + profile.metrics.paidServicesAmount);
    totalPendingCP = round2(totalPendingCP + profile.metrics.pendingPayablesAmount);
    totalOverdueCP = round2(totalOverdueCP + profile.metrics.overduePayablesAmount);
    totalUnbilledProvision = round2(totalUnbilledProvision + profile.metrics.unbilledProvisionAmount);
    totalRemaining = round2(totalRemaining + profile.metrics.totalRemainingAmount);
    if (profile.metrics.totalRemainingAmount > 0) {
      partnersWithOpenBalanceCount += 1;
    }
    if (profile.metrics.nextPaymentDate) {
      candidateNextDates.push(profile.metrics.nextPaymentDate);
    }
  }

  // Ordenar: atrasados primeiro, depois pendentes/a provisionar por data de previsão crescente, depois quitados
  const statusWeight: Record<PartnerForecastRow['paymentStatus'], number> = {
    atrasado: 0,
    a_provisionar: 1,
    parcial_cp: 2,
    cp_lancado: 3,
    quitado: 4,
  };

  allRows.sort((a, b) => {
    const wDiff = statusWeight[a.paymentStatus] - statusWeight[b.paymentStatus];
    if (wDiff !== 0) return wDiff;
    return (a.forecastDueDate || '9999-12-31').localeCompare(b.forecastDueDate || '9999-12-31');
  });

  candidateNextDates.sort();

  return {
    rows: allRows,
    summary: {
      totalContracted,
      totalPaid,
      totalPendingCP,
      totalOverdueCP,
      totalUnbilledProvision,
      totalRemaining,
      nextPaymentDate: candidateNextDates.length > 0 ? candidateNextDates[0] : null,
      openObligationsCount: allRows.filter((r) => r.remainingTotalAmount > 0).length,
      partnersWithOpenBalanceCount,
    },
  };
}
