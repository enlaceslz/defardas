/**
 * DE FARDAS ERP — Serviço Central de Notificações & Monitoramento de Prazos (SLA)
 *
 * Consolida alertas autoritativos em tempo real, filtrados pelo perfil RBAC do usuário:
 *  - Prazos de entrega de OPs (atrasadas, vencendo hoje, vencendo em até 3 dias)
 *  - Prazos internos por etapa de produção (Corte, Bordado/Silk, Costura, Qualidade, Expedição)
 *  - Portão A.3.2 (OPs retidas aguardando sinal 50% ou aprovação/revisão de arte)
 *  - Lotes em Retrabalho
 *  - Estoque abaixo do ponto de pedido
 *  - Propostas comerciais vencendo / vencidas (RBAC quotes:view)
 *  - Títulos financeiros e provisões de parceiros em atraso (RBAC finance:view)
 */
import { PERMISSIONS } from '../auth/rbac';
import {
  FinancialTransactionEntity,
  InventoryItemEntity,
  ProductionOrderEntity,
  PurchaseOrderEntity,
  QuoteEntity,
  UserRole,
} from '../types/db';
import {
  diffDaysISO,
  evaluateOrderDeadlines,
  getTodayISO,
} from './productionScheduleService';

export type NotificationSeverity = 'critical' | 'warning' | 'info';

export type NotificationCategory =
  | 'prazo_entrega'
  | 'prazo_etapa'
  | 'portao_gate'
  | 'retrabalho'
  | 'estoque'
  | 'financeiro'
  | 'comercial';

export interface SystemNotificationItem {
  id: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  message: string;
  entityCode?: string;
  entityId?: string;
  clientName?: string;
  stage?: string;
  stageLabel?: string;
  dueDate?: string;
  daysDelta?: number; // negativo = atrasado X dias, 0 = hoje, positivo = faltam X dias
  targetTab: 'orders' | 'quotes' | 'inventory' | 'finance' | 'partners' | 'suppliers';
  actionLabel: string;
  openScheduleModal?: boolean;
}

export interface NotificationsSummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
  overdueOrdersCount: number;
  dueSoonOrdersCount: number;
  overdueStagesCount: number;
  dueSoonStagesCount: number;
  blockedOrdersCount: number;
  reworkOrdersCount: number;
  lowStockCount: number;
  overdueFinanceCount: number;
}

export interface NotificationsPayload {
  asOfDate: string;
  summary: NotificationsSummary;
  notifications: SystemNotificationItem[];
}

function formatDateShortBR(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '--/--';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function buildSystemNotifications(params: {
  role: UserRole;
  orders: ProductionOrderEntity[];
  quotes: QuoteEntity[];
  inventory: InventoryItemEntity[];
  finance: FinancialTransactionEntity[];
  purchaseOrders?: PurchaseOrderEntity[];
  todayISO?: string;
}): NotificationsPayload {
  const todayISO = params.todayISO || getTodayISO();
  const { role, orders, quotes, inventory, finance, purchaseOrders = [] } = params;

  const canViewQuotes = (PERMISSIONS['quotes:view'] || []).includes(role);
  const canViewFinance = (PERMISSIONS['finance:view'] || []).includes(role);
  const canViewSuppliers = (PERMISSIONS['suppliers:view'] || []).includes(role);

  const notifications: SystemNotificationItem[] = [];

  let overdueOrdersCount = 0;
  let dueSoonOrdersCount = 0;
  let overdueStagesCount = 0;
  let dueSoonStagesCount = 0;
  let blockedOrdersCount = 0;
  let reworkOrdersCount = 0;

  // 1. Prazos de Entrega, Prazos por Etapa, Gate A.3.2 e Retrabalho (OPs ativas)
  for (const order of orders) {
    if (order.stage === 'entregue') continue;

    const evalSummary = evaluateOrderDeadlines(order, todayISO);
    const currentStage = evalSummary.currentStageItem;
    const isBlocked = !order.artApproved || !order.entryPaymentConfirmed;

    // 1a. Prazo final de entrega atrasado
    if (evalSummary.deliveryStatus === 'atrasada') {
      overdueOrdersCount += 1;
      const lateDays = Math.abs(evalSummary.daysToDelivery);
      notifications.push({
        id: `op-delivery-overdue-${order.id}`,
        category: 'prazo_entrega',
        severity: 'critical',
        title: `Entrega atrasada há ${lateDays} ${lateDays === 1 ? 'dia' : 'dias'} · ${order.orderNumber}`,
        message: `${order.clientName} (${order.totalPieces} pçs) — Prazo era ${formatDateShortBR(order.targetDeliveryDate)}. Etapa atual: ${currentStage?.label || order.stage}.`,
        entityCode: order.orderNumber,
        entityId: order.id,
        clientName: order.clientName,
        stage: order.stage,
        stageLabel: currentStage?.label,
        dueDate: order.targetDeliveryDate,
        daysDelta: evalSummary.daysToDelivery,
        targetTab: 'orders',
        actionLabel: 'Abrir Cronograma',
        openScheduleModal: true,
      });
    } else if (
      evalSummary.deliveryStatus === 'critica_hoje' ||
      evalSummary.deliveryStatus === 'atencao'
    ) {
      dueSoonOrdersCount += 1;
      const isToday = evalSummary.daysToDelivery === 0;
      notifications.push({
        id: `op-delivery-soon-${order.id}`,
        category: 'prazo_entrega',
        severity: isToday ? 'critical' : 'warning',
        title: isToday
          ? `Entrega vence HOJE · ${order.orderNumber}`
          : `Entrega em ${evalSummary.daysToDelivery} ${evalSummary.daysToDelivery === 1 ? 'dia' : 'dias'} · ${order.orderNumber}`,
        message: `${order.clientName} (${order.totalPieces} pçs) — Progresso ${evalSummary.progressPercent}% (${evalSummary.completedStagesCount}/${evalSummary.totalApplicableStagesCount} etapas). Etapa atual: ${currentStage?.label || order.stage}.`,
        entityCode: order.orderNumber,
        entityId: order.id,
        clientName: order.clientName,
        stage: order.stage,
        stageLabel: currentStage?.label,
        dueDate: order.targetDeliveryDate,
        daysDelta: evalSummary.daysToDelivery,
        targetTab: 'orders',
        actionLabel: 'Abrir Cronograma',
        openScheduleModal: true,
      });
    }

    // 1b. Prazo interno da ETAPA atual (alerta precoce de gargalo por setor/facção)
    if (currentStage) {
      if (evalSummary.isCurrentStageOverdue) {
        overdueStagesCount += 1;
        const stageLateDays = Math.abs(currentStage.daysRemaining);
        notifications.push({
          id: `op-stage-overdue-${order.id}-${currentStage.stage}`,
          category: 'prazo_etapa',
          severity: 'critical',
          title: `Etapa atrasada (${stageLateDays}d): ${currentStage.label} · ${order.orderNumber}`,
          message: `Prazo da etapa era ${formatDateShortBR(currentStage.plannedEndDate)} (${currentStage.responsible || 'Equipe interna'}). Entrega final da OP: ${formatDateShortBR(order.targetDeliveryDate)}.`,
          entityCode: order.orderNumber,
          entityId: order.id,
          clientName: order.clientName,
          stage: currentStage.stage,
          stageLabel: currentStage.label,
          dueDate: currentStage.plannedEndDate,
          daysDelta: currentStage.daysRemaining,
          targetTab: 'orders',
          actionLabel: 'Ver Etapa & Prazo',
          openScheduleModal: true,
        });
      } else if (evalSummary.isCurrentStageDueSoon) {
        dueSoonStagesCount += 1;
        const d = currentStage.daysRemaining;
        notifications.push({
          id: `op-stage-soon-${order.id}-${currentStage.stage}`,
          category: 'prazo_etapa',
          severity: 'warning',
          title:
            d === 0
              ? `Etapa vence HOJE: ${currentStage.label} · ${order.orderNumber}`
              : `Etapa vence em ${d} ${d === 1 ? 'dia' : 'dias'}: ${currentStage.label} · ${order.orderNumber}`,
          message: `Responsável: ${currentStage.responsible || 'Equipe interna'} · Prazo da etapa: ${formatDateShortBR(currentStage.plannedEndDate)}.`,
          entityCode: order.orderNumber,
          entityId: order.id,
          clientName: order.clientName,
          stage: currentStage.stage,
          stageLabel: currentStage.label,
          dueDate: currentStage.plannedEndDate,
          daysDelta: d,
          targetTab: 'orders',
          actionLabel: 'Ver Etapa & Prazo',
          openScheduleModal: true,
        });
      }
    }

    // 1c. Portão Gate A.3.2 (OP bloqueada)
    if (isBlocked) {
      blockedOrdersCount += 1;
      const missing: string[] = [];
      if (!order.entryPaymentConfirmed) missing.push('sinal 50% no Financeiro');
      if (!order.artApproved) {
        missing.push(
          order.artStatus === 'revisao_solicitada'
            ? 'revisão/aprovação da arte solicitada'
            : 'aprovação formal da arte'
        );
      }
      notifications.push({
        id: `op-gate-${order.id}`,
        category: 'portao_gate',
        severity: evalSummary.daysToDelivery <= 5 ? 'critical' : 'warning',
        title: `OP Bloqueada (Gate A.3.2) · ${order.orderNumber}`,
        message: `${order.clientName} — Aguardando ${missing.join(' e ')}. Entrega prevista: ${formatDateShortBR(order.targetDeliveryDate)}.`,
        entityCode: order.orderNumber,
        entityId: order.id,
        clientName: order.clientName,
        stage: order.stage,
        stageLabel: '0. Liberação (Gate A.3.2)',
        dueDate: order.targetDeliveryDate,
        daysDelta: evalSummary.daysToDelivery,
        targetTab: !order.entryPaymentConfirmed && canViewFinance ? 'finance' : 'orders',
        actionLabel: !order.entryPaymentConfirmed && canViewFinance ? 'Confirmar Sinal' : 'Liberar OP',
        openScheduleModal: false,
      });
    }

    // 1d. Lote em retrabalho
    if (order.stage === 'retrabalho') {
      reworkOrdersCount += 1;
      notifications.push({
        id: `op-rework-${order.id}`,
        category: 'retrabalho',
        severity: 'critical',
        title: `Lote em Retrabalho · ${order.orderNumber}`,
        message: `${order.clientName} (${order.totalPieces} pçs) — Peças em ajuste pós-inspeção. Entrega prevista: ${formatDateShortBR(order.targetDeliveryDate)}.`,
        entityCode: order.orderNumber,
        entityId: order.id,
        clientName: order.clientName,
        stage: order.stage,
        stageLabel: '4b. Retrabalho / Ajustes',
        dueDate: order.targetDeliveryDate,
        daysDelta: evalSummary.daysToDelivery,
        targetTab: 'orders',
        actionLabel: 'Acompanhar OP',
        openScheduleModal: true,
      });
    }
  }

  // 2. Estoque abaixo do mínimo
  const lowStockItems = inventory.filter((item) => item.physicalStock <= item.minStock);
  for (const item of lowStockItems) {
    const isZero = item.physicalStock <= 0;
    notifications.push({
      id: `stock-low-${item.id}`,
      category: 'estoque',
      severity: isZero ? 'critical' : 'warning',
      title: isZero
        ? `Estoque zerado · ${item.code}`
        : `Estoque no ponto de pedido · ${item.code}`,
      message: `${item.name} — Saldo atual: ${item.physicalStock} ${item.unit} (mínimo: ${item.minStock} ${item.unit}).`,
      entityCode: item.code,
      entityId: item.id,
      targetTab: 'inventory',
      actionLabel: 'Repor Insumo',
    });
  }

  // 2b. Pedidos de Compra com entrega atrasada ou prevista em <= 2 dias (RBAC suppliers:view)
  if (canViewSuppliers) {
    for (const po of purchaseOrders) {
      if (!['enviado', 'confirmado', 'recebido_parcial'].includes(po.status)) continue;
      const daysLeft = diffDaysISO(todayISO, po.expectedDeliveryDate);
      if (daysLeft < 0) {
        const late = Math.abs(daysLeft);
        notifications.push({
          id: `po-delivery-overdue-${po.id}`,
          category: 'estoque',
          severity: 'critical',
          title: `Compra atrasada (${late}d) · ${po.poNumber}`,
          message: `${po.supplierName} — Entrega prevista era ${formatDateShortBR(po.expectedDeliveryDate)} (${po.items.length} insumo(s)).`,
          entityCode: po.poNumber,
          entityId: po.id,
          clientName: po.supplierName,
          dueDate: po.expectedDeliveryDate,
          daysDelta: daysLeft,
          targetTab: 'suppliers',
          actionLabel: 'Receber / Cobrar',
        });
      } else if (daysLeft <= 2) {
        notifications.push({
          id: `po-delivery-soon-${po.id}`,
          category: 'estoque',
          severity: 'warning',
          title:
            daysLeft === 0
              ? `Entrega de compra HOJE · ${po.poNumber}`
              : `Entrega de compra em ${daysLeft}d · ${po.poNumber}`,
          message: `${po.supplierName} — Previsto para ${formatDateShortBR(po.expectedDeliveryDate)}. Prepare o recebimento no almoxarifado.`,
          entityCode: po.poNumber,
          entityId: po.id,
          clientName: po.supplierName,
          dueDate: po.expectedDeliveryDate,
          daysDelta: daysLeft,
          targetTab: 'suppliers',
          actionLabel: 'Ver Pedido',
        });
      }
    }
  }

  // 3. Propostas Comerciais próximas do vencimento ou vencidas (RBAC quotes:view)
  if (canViewQuotes) {
    for (const q of quotes) {
      if (!['enviado', 'em_negociacao'].includes(q.commercialStatus)) continue;
      const daysLeft = diffDaysISO(todayISO, q.validUntil);
      if (daysLeft <= 2) {
        notifications.push({
          id: `quote-exp-${q.id}`,
          category: 'comercial',
          severity: daysLeft < 0 ? 'warning' : 'info',
          title:
            daysLeft < 0
              ? `Proposta vencida há ${Math.abs(daysLeft)}d · ${q.quoteNumber}`
              : daysLeft === 0
                ? `Proposta vence HOJE · ${q.quoteNumber}`
                : `Proposta vence em ${daysLeft}d · ${q.quoteNumber}`,
          message: `${q.clientName} — Validade ${formatDateShortBR(q.validUntil)}. Faça follow-up para aprovação ou revalidação.`,
          entityCode: q.quoteNumber,
          entityId: q.id,
          clientName: q.clientName,
          dueDate: q.validUntil,
          daysDelta: daysLeft,
          targetTab: 'quotes',
          actionLabel: 'Ver Proposta',
        });
      }
    }
  }

  // 4. Títulos financeiros vencidos ou vencendo hoje (RBAC finance:view)
  let overdueFinanceCount = 0;
  if (canViewFinance) {
    for (const trx of finance) {
      if (trx.status === 'pago' || trx.status === 'estornado') continue;
      const daysLeft = diffDaysISO(todayISO, trx.dueDate);
      if (daysLeft < 0 || trx.status === 'atrasado') {
        overdueFinanceCount += 1;
        const late = Math.abs(Math.min(0, daysLeft));
        const isPartnerCp = trx.type === 'pagar' && trx.subType === 'servico_terceirizado';
        const isSupplierCp = trx.type === 'pagar' && Boolean(trx.supplierId);
        notifications.push({
          id: `fin-overdue-${trx.id}`,
          category: 'financeiro',
          severity: 'critical',
          title: isPartnerCp
            ? `CP Parceiro vencido (${late}d) · ${trx.transactionNumber}`
            : isSupplierCp
              ? `CP Fornecedor vencido (${late}d) · ${trx.transactionNumber}`
              : `${trx.type === 'receber' ? 'Recebível' : 'Conta a Pagar'} vencido (${late}d) · ${trx.transactionNumber}`,
          message: `${trx.description} — Vencimento ${formatDateShortBR(trx.dueDate)} · Valor R$ ${trx.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
          entityCode: trx.transactionNumber,
          entityId: trx.id,
          clientName: trx.supplierName || trx.partnerName || trx.clientName,
          dueDate: trx.dueDate,
          daysDelta: daysLeft,
          targetTab: isPartnerCp ? 'partners' : isSupplierCp ? 'suppliers' : 'finance',
          actionLabel: isPartnerCp ? 'Ver CP Parceiro' : isSupplierCp ? 'Ver Fornecedor' : 'Ir ao Financeiro',
        });
      } else if (daysLeft <= 2) {
        const isPartnerCp = trx.type === 'pagar' && trx.subType === 'servico_terceirizado';
        const isSupplierCp = trx.type === 'pagar' && Boolean(trx.supplierId);
        notifications.push({
          id: `fin-soon-${trx.id}`,
          category: 'financeiro',
          severity: 'warning',
          title:
            daysLeft === 0
              ? `Vence HOJE · ${trx.transactionNumber}`
              : `Vence em ${daysLeft}d · ${trx.transactionNumber}`,
          message: `${trx.description} — Valor R$ ${trx.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
          entityCode: trx.transactionNumber,
          entityId: trx.id,
          clientName: trx.supplierName || trx.partnerName || trx.clientName,
          dueDate: trx.dueDate,
          daysDelta: daysLeft,
          targetTab: isPartnerCp ? 'partners' : isSupplierCp ? 'suppliers' : 'finance',
          actionLabel: isPartnerCp ? 'Ver Previsão CP' : isSupplierCp ? 'Ver Compra' : 'Ver Título',
        });
      }
    }
  }

  // Ordenação determinística: severidade -> menor daysDelta (mais atrasado primeiro)
  const severityWeight: Record<NotificationSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  notifications.sort((a, b) => {
    const sevDiff = severityWeight[a.severity] - severityWeight[b.severity];
    if (sevDiff !== 0) return sevDiff;
    const da = a.daysDelta ?? 999;
    const db = b.daysDelta ?? 999;
    if (da !== db) return da - db;
    return a.id.localeCompare(b.id);
  });

  const critical = notifications.filter((n) => n.severity === 'critical').length;
  const warning = notifications.filter((n) => n.severity === 'warning').length;
  const info = notifications.filter((n) => n.severity === 'info').length;

  return {
    asOfDate: todayISO,
    summary: {
      total: notifications.length,
      critical,
      warning,
      info,
      overdueOrdersCount,
      dueSoonOrdersCount,
      overdueStagesCount,
      dueSoonStagesCount,
      blockedOrdersCount,
      reworkOrdersCount,
      lowStockCount: lowStockItems.length,
      overdueFinanceCount,
    },
    notifications,
  };
}
