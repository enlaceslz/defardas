/**
 * DE FARDAS ERP — Módulo de Fornecedores & Pedidos de Compra Routes
 *
 * Fluxos integrados ponta a ponta:
 *  - Cadastro completo de Fornecedores de Matéria-Prima (Tecidos, Aviamentos, Estamparia, Embalagens)
 *  - Pedidos de Compra (PC-YYYY-XXXX) com cálculo autoritativo no servidor e vínculo opcional à OP
 *  - Máquina de estados controlada: rascunho -> enviado -> confirmado -> recebido_parcial -> recebido_total | cancelado
 *  - Recebimento Físico no Almoxarifado:
 *      1) Gera evento auditável 'entrada_compra' no Kardex (MOV-YYYY-XXXX)
 *      2) Atualiza saldo físico, última reposição e vincula supplierId no item de Estoque
 *      3) Recalcula Custo Médio Ponderado (CMP) do insumo quando habilitado
 *      4) Atualiza provisão ou gera título de Contas a Pagar (FIN-YYYY-XXXX) de forma idempotente
 *  - Dossiê 360° do Fornecedor: insumos fornecidos, pedidos de compra e extrato financeiro (pago x a pagar x vencido)
 *  - Segurança: RBAC rigoroso, CSRF, allowlist explícita e proteção de integridade referencial na exclusão (409)
 */
import { Router, Response } from 'express';
import crypto from 'crypto';
import { RequestWithUser, requireAuth, requirePermission, PERMISSIONS } from '../auth/rbac';
import { supplierRepository } from '../repositories/supplierRepository';
import { inventoryRepository } from '../repositories/inventoryRepository';
import { financeRepository } from '../repositories/financeRepository';
import { orderRepository } from '../repositories/orderRepository';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';
import { diffDaysISO, getTodayISO } from '../services/productionScheduleService';
import {
  FinancialTransactionEntity,
  PurchaseOrderEntity,
  PurchaseOrderItemEntity,
  PurchaseOrderStatus,
  StockMovementEntity,
  SupplierCategory,
  SupplierEntity,
} from '../types/db';

export const suppliersRouter = Router();

const VALID_CATEGORIES = new Set<SupplierCategory>([
  'tecidos_malhas',
  'aviamentos',
  'bordado_estamparia',
  'embalagens',
  'servicos_manutencao',
  'outros',
]);

const VALID_PAYMENT_METHODS = new Set<SupplierEntity['defaultPaymentMethod']>([
  'pix',
  'boleto',
  'transferencia',
  'cartao',
]);

const ALLOWED_PO_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  rascunho: ['enviado', 'confirmado', 'cancelado'],
  enviado: ['confirmado', 'cancelado', 'rascunho'],
  confirmado: ['cancelado'], // recebimento ocorre exclusivamente via /receive
  recebido_parcial: [],      // concluído via /receive
  recebido_total: [],
  cancelado: [],
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n: number) => Math.round(n * 100) / 100;

function isValidIsoDate(val: unknown): val is string {
  return typeof val === 'string' && ISO_DATE_RE.test(val.trim()) && !Number.isNaN(new Date(`${val.trim()}T12:00:00Z`).getTime());
}

function addDaysToIso(isoDate: string, days: number): string {
  const dt = new Date(`${isoDate}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + Math.max(0, Math.round(days)));
  return dt.toISOString().split('T')[0];
}

function effectiveTrxStatus(trx: FinancialTransactionEntity, todayISO: string): FinancialTransactionEntity['status'] {
  if (trx.status === 'pago' || trx.status === 'estornado') return trx.status;
  if (trx.dueDate && trx.dueDate < todayISO) return 'atrasado';
  return trx.status;
}

function enrichPurchaseOrder(
  po: PurchaseOrderEntity,
  allFinance: FinancialTransactionEntity[],
  todayISO: string
) {
  const linkedPayables = allFinance
    .filter((f) => f.type === 'pagar' && f.status !== 'estornado' && f.purchaseOrderId === po.id)
    .map((f) => ({
      ...f,
      status: effectiveTrxStatus(f, todayISO),
    }));

  const totalOrderedQty = round2(po.items.reduce((sum, it) => sum + (it.quantity || 0), 0));
  const totalReceivedQty = round2(po.items.reduce((sum, it) => sum + (it.receivedQuantity || 0), 0));
  const receivedPercent =
    totalOrderedQty > 0 ? Math.min(100, Math.round((totalReceivedQty / totalOrderedQty) * 100)) : 0;

  const isClosed = po.status === 'recebido_total' || po.status === 'cancelado';
  const daysToExpectedDelivery = diffDaysISO(todayISO, po.expectedDeliveryDate);
  const isDeliveryOverdue = !isClosed && daysToExpectedDelivery < 0;
  const isDeliveryDueSoon = !isClosed && daysToExpectedDelivery >= 0 && daysToExpectedDelivery <= 2;

  const billedAmount = round2(linkedPayables.reduce((sum, f) => sum + f.amount, 0));
  const paidAmount = round2(
    linkedPayables.filter((f) => f.status === 'pago').reduce((sum, f) => sum + f.amount, 0)
  );
  const pendingPayableAmount = round2(
    linkedPayables.filter((f) => f.status === 'pendente' || f.status === 'atrasado').reduce((sum, f) => sum + f.amount, 0)
  );
  const overduePayableAmount = round2(
    linkedPayables.filter((f) => f.status === 'atrasado').reduce((sum, f) => sum + f.amount, 0)
  );

  return {
    ...po,
    totalOrderedQty,
    totalReceivedQty,
    receivedPercent,
    daysToExpectedDelivery,
    isDeliveryOverdue,
    isDeliveryDueSoon,
    linkedPayablesCount: linkedPayables.length,
    billedAmount,
    paidAmount,
    pendingPayableAmount,
    overduePayableAmount,
    hasPayableCoverage: billedAmount >= po.totalAmount - 0.01,
    linkedPayables,
  };
}

function computeSupplierMetrics(
  supplier: SupplierEntity,
  allItems: Awaited<ReturnType<typeof inventoryRepository.findAllItems>>,
  allPOs: PurchaseOrderEntity[],
  allFinance: FinancialTransactionEntity[],
  todayISO: string
) {
  const linkedItems = allItems.filter(
    (it) =>
      it.supplierId === supplier.id ||
      (!it.supplierId &&
        it.supplier &&
        it.supplier.trim().toLowerCase() === supplier.tradeName.trim().toLowerCase())
  );
  const lowStockItemsCount = linkedItems.filter((it) => it.physicalStock <= it.minStock).length;

  const supplierPOs = allPOs.filter((po) => po.supplierId === supplier.id);
  const activePOs = supplierPOs.filter((po) => po.status !== 'cancelado');
  const openPOs = supplierPOs.filter((po) =>
    ['rascunho', 'enviado', 'confirmado', 'recebido_parcial'].includes(po.status)
  );
  const delayedPOsCount = openPOs.filter((po) => diffDaysISO(todayISO, po.expectedDeliveryDate) < 0).length;

  const totalPurchasedAmount = round2(activePOs.reduce((sum, po) => sum + po.totalAmount, 0));
  const openOrdersAmount = round2(openPOs.reduce((sum, po) => sum + po.totalAmount, 0));

  const supplierPayables = allFinance
    .filter((f) => f.type === 'pagar' && f.status !== 'estornado' && f.supplierId === supplier.id)
    .map((f) => ({ ...f, status: effectiveTrxStatus(f, todayISO) }));

  const totalPaidAmount = round2(
    supplierPayables.filter((f) => f.status === 'pago').reduce((sum, f) => sum + f.amount, 0)
  );
  const totalPendingAmount = round2(
    supplierPayables
      .filter((f) => f.status === 'pendente' || f.status === 'atrasado')
      .reduce((sum, f) => sum + f.amount, 0)
  );
  const totalOverdueAmount = round2(
    supplierPayables.filter((f) => f.status === 'atrasado').reduce((sum, f) => sum + f.amount, 0)
  );

  const lastPurchaseDate = activePOs.length > 0 ? activePOs[0].orderDate : undefined;

  return {
    linkedItemsCount: linkedItems.length,
    lowStockItemsCount,
    totalPurchaseOrders: supplierPOs.length,
    openPurchaseOrdersCount: openPOs.length,
    delayedPOsCount,
    totalPurchasedAmount,
    openOrdersAmount,
    totalPaidAmount,
    totalPendingAmount,
    totalOverdueAmount,
    lastPurchaseDate,
  };
}

// Exigir autenticação e permissão base suppliers:view em todas as rotas
suppliersRouter.use(requireAuth);
suppliersRouter.use(requirePermission('suppliers:view'));

// =========================================================================
// 1. RESUMO CONSOLIDADO DE COMPRAS & FORNECEDORES (ANTES DE /:id)
// =========================================================================
suppliersRouter.get('/summary', async (_req: RequestWithUser, res: Response) => {
  const todayISO = getTodayISO();
  const [allSuppliers, allPOs, allItems, allFinance] = await Promise.all([
    supplierRepository.findAll(),
    supplierRepository.findAllPurchaseOrders(),
    inventoryRepository.findAllItems(),
    financeRepository.findAll(),
  ]);

  const activeSuppliersCount = allSuppliers.filter((s) => s.active).length;
  const openPOs = allPOs.filter((po) =>
    ['rascunho', 'enviado', 'confirmado', 'recebido_parcial'].includes(po.status)
  );
  const delayedPOsCount = openPOs.filter((po) => diffDaysISO(todayISO, po.expectedDeliveryDate) < 0).length;
  const openPOsValue = round2(openPOs.reduce((sum, po) => sum + po.totalAmount, 0));

  const lowStockItemsCount = allItems.filter((it) => it.physicalStock <= it.minStock).length;

  const supplierPayables = allFinance
    .filter((f) => f.type === 'pagar' && f.status !== 'estornado' && (f.supplierId || f.subType === 'compra_tecido'))
    .map((f) => ({ ...f, status: effectiveTrxStatus(f, todayISO) }));

  const totalPaidToSuppliers = round2(
    supplierPayables.filter((f) => f.status === 'pago').reduce((sum, f) => sum + f.amount, 0)
  );
  const totalPendingToSuppliers = round2(
    supplierPayables
      .filter((f) => f.status === 'pendente' || f.status === 'atrasado')
      .reduce((sum, f) => sum + f.amount, 0)
  );
  const totalOverdueToSuppliers = round2(
    supplierPayables.filter((f) => f.status === 'atrasado').reduce((sum, f) => sum + f.amount, 0)
  );

  return res.json({
    asOfDate: todayISO,
    totalSuppliersCount: allSuppliers.length,
    activeSuppliersCount,
    openPurchaseOrdersCount: openPOs.length,
    delayedPurchaseOrdersCount: delayedPOsCount,
    openPurchaseOrdersValue: openPOsValue,
    lowStockItemsCount,
    totalPaidToSuppliers,
    totalPendingToSuppliers,
    totalOverdueToSuppliers,
  });
});

// =========================================================================
// 2. PEDIDOS DE COMPRA (ANTES DE /:id)
// =========================================================================
suppliersRouter.get('/purchase-orders', async (req: RequestWithUser, res: Response) => {
  const todayISO = getTodayISO();
  const [allPOs, allFinance] = await Promise.all([
    supplierRepository.findAllPurchaseOrders(),
    financeRepository.findAll(),
  ]);

  const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const supplierIdFilter = typeof req.query.supplierId === 'string' ? req.query.supplierId.trim() : '';

  const filtered = allPOs.filter((po) => {
    if (statusFilter && po.status !== statusFilter) return false;
    if (supplierIdFilter && po.supplierId !== supplierIdFilter) return false;
    return true;
  });

  return res.json(filtered.map((po) => enrichPurchaseOrder(po, allFinance, todayISO)));
});

// Criar Pedido de Compra (PC-YYYY-XXXX)
suppliersRouter.post(
  '/purchase-orders',
  requirePermission('suppliers:manage_orders'),
  async (req: RequestWithUser, res: Response) => {
    const actor = req.user!;
    const body = req.body || {};
    const todayISO = getTodayISO();

    const supplierId = typeof body.supplierId === 'string' ? body.supplierId.trim() : '';
    if (!supplierId) {
      return res.status(400).json({ error: 'Selecione um fornecedor válido (supplierId).' });
    }

    const supplier = await supplierRepository.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({ error: 'Fornecedor não encontrado.' });
    }
    if (!supplier.active) {
      return res.status(409).json({ error: `O fornecedor '${supplier.tradeName}' está inativo para novas compras.` });
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ error: 'Adicione pelo menos um insumo do estoque ao pedido de compra.' });
    }

    // Validar e calcular todos os itens no servidor
    const validatedItems: PurchaseOrderItemEntity[] = [];
    for (const raw of body.items) {
      const itemId = typeof raw?.itemId === 'string' ? raw.itemId.trim() : '';
      const qty = Number(raw?.quantity);
      const unitCost = Number(raw?.unitCost);

      if (!itemId) {
        return res.status(400).json({ error: 'Todos os itens do pedido devem referenciar um insumo válido do estoque.' });
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ error: 'A quantidade de compra de cada insumo deve ser maior que zero.' });
      }
      if (!Number.isFinite(unitCost) || unitCost < 0) {
        return res.status(400).json({ error: 'O custo unitário de cada insumo deve ser maior ou igual a zero.' });
      }

      const invItem = await inventoryRepository.findItemById(itemId);
      if (!invItem) {
        return res.status(404).json({ error: `Insumo de estoque '${itemId}' não encontrado.` });
      }

      const roundedQty = round2(qty);
      const roundedCost = round2(unitCost);
      validatedItems.push({
        id: crypto.randomUUID(),
        itemId: invItem.id,
        itemCode: invItem.code,
        itemName: invItem.name,
        unit: invItem.unit,
        quantity: roundedQty,
        receivedQuantity: 0,
        unitCost: roundedCost,
        subtotal: round2(roundedQty * roundedCost),
      });
    }

    const freightCost = Number(body.freightCost ?? 0);
    const discountAmount = Number(body.discountAmount ?? 0);
    if (!Number.isFinite(freightCost) || freightCost < 0) {
      return res.status(400).json({ error: 'Valor de frete inválido.' });
    }
    if (!Number.isFinite(discountAmount) || discountAmount < 0) {
      return res.status(400).json({ error: 'Valor de desconto inválido.' });
    }

    const subtotalAmount = round2(validatedItems.reduce((sum, it) => sum + it.subtotal, 0));
    const totalAmount = round2(Math.max(0, subtotalAmount + round2(freightCost) - round2(discountAmount)));

    const orderDate = isValidIsoDate(body.orderDate) ? body.orderDate.trim() : todayISO;
    const expectedDeliveryDate = isValidIsoDate(body.expectedDeliveryDate)
      ? body.expectedDeliveryDate.trim()
      : addDaysToIso(orderDate, supplier.leadTimeDays || 7);

    if (diffDaysISO(orderDate, expectedDeliveryDate) < 0) {
      return res.status(400).json({
        error: 'A data prevista de entrega não pode ser anterior à data do pedido.',
      });
    }

    const dueDate = isValidIsoDate(body.dueDate)
      ? body.dueDate.trim()
      : addDaysToIso(expectedDeliveryDate, supplier.paymentTermsDays || 30);

    const paymentMethod = (
      VALID_PAYMENT_METHODS.has(body.paymentMethod) ? body.paymentMethod : supplier.defaultPaymentMethod
    ) as SupplierEntity['defaultPaymentMethod'];

    const paymentTerms =
      typeof body.paymentTerms === 'string' && body.paymentTerms.trim()
        ? body.paymentTerms.trim().slice(0, 100)
        : supplier.paymentTerms;

    let relatedOrderId: string | undefined;
    let relatedOrderNumber: string | undefined;
    if (typeof body.relatedOrderId === 'string' && body.relatedOrderId.trim()) {
      const linkedOp = await orderRepository.findById(body.relatedOrderId.trim());
      if (!linkedOp) {
        return res.status(404).json({ error: 'Ordem de Produção vinculada não encontrada.' });
      }
      relatedOrderId = linkedOp.id;
      relatedOrderNumber = linkedOp.orderNumber;
    }

    const initialStatus: PurchaseOrderStatus =
      body.initialStatus === 'enviado' || body.initialStatus === 'confirmado'
        ? body.initialStatus
        : 'rascunho';

    const poNumber = await sequenceService.nextPurchaseOrderNumberAsync();
    const nowIso = new Date().toISOString();

    const newPO: PurchaseOrderEntity = {
      id: crypto.randomUUID(),
      poNumber,
      supplierId: supplier.id,
      supplierName: supplier.tradeName,
      relatedOrderId,
      relatedOrderNumber,
      status: initialStatus,
      orderDate,
      expectedDeliveryDate,
      items: validatedItems,
      subtotalAmount,
      freightCost: round2(freightCost),
      discountAmount: round2(discountAmount),
      totalAmount,
      paymentTerms,
      paymentMethod,
      dueDate,
      notes: typeof body.notes === 'string' ? body.notes.trim().slice(0, 600) || undefined : undefined,
      createdByName: actor.fullName,
      isDemo: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await supplierRepository.savePurchaseOrder(newPO);

    // Gerar provisão de Contas a Pagar automaticamente quando confirmado ou solicitado
    let createdPayable: FinancialTransactionEntity | undefined;
    const shouldProvision =
      totalAmount > 0 && (body.autoGeneratePayable === true || initialStatus === 'confirmado');

    if (shouldProvision) {
      const trxNumber = await sequenceService.nextFinanceNumberAsync();
      const itemsSummary = validatedItems
        .slice(0, 2)
        .map((it) => `${it.quantity} ${it.unit} ${it.itemName}`)
        .join(', ');
      createdPayable = {
        id: crypto.randomUUID(),
        transactionNumber: trxNumber,
        productionOrderId: relatedOrderId,
        supplierId: supplier.id,
        supplierName: supplier.tradeName,
        purchaseOrderId: newPO.id,
        purchaseOrderNumber: newPO.poNumber,
        type: 'pagar',
        subType: 'compra_tecido',
        description: `Compra ${newPO.poNumber} · ${supplier.tradeName} (${itemsSummary}${validatedItems.length > 2 ? ` +${validatedItems.length - 2}` : ''})`,
        category: 'Matéria-Prima & Tecidos',
        amount: totalAmount,
        dueDate,
        status: 'pendente',
        paymentMethod,
        referenceId: newPO.poNumber,
        isProvision: true,
        isDemo: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await financeRepository.save(createdPayable);
    }

    auditService.log({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      entityName: 'estoque.purchase_orders',
      entityId: newPO.poNumber,
      action: 'CREATE_PURCHASE_ORDER',
      newData: {
        poNumber: newPO.poNumber,
        supplier: supplier.tradeName,
        status: newPO.status,
        itemsCount: validatedItems.length,
        totalAmount: newPO.totalAmount,
        relatedOrderNumber,
        payableNumber: createdPayable?.transactionNumber,
      },
      notes: `Pedido de Compra ${newPO.poNumber} criado para ${supplier.tradeName} no valor de R$ ${newPO.totalAmount.toFixed(2)}${createdPayable ? ` (Provisão CP ${createdPayable.transactionNumber})` : ''}.`,
    });

    const allFinance = await financeRepository.findAll();
    return res.status(201).json({
      purchaseOrder: enrichPurchaseOrder(newPO, allFinance, todayISO),
      createdPayable,
    });
  }
);

// Transição controlada de status do Pedido de Compra
suppliersRouter.post(
  '/purchase-orders/:poId/status',
  requirePermission('suppliers:manage_orders'),
  async (req: RequestWithUser, res: Response) => {
    const actor = req.user!;
    const po = await supplierRepository.findPurchaseOrderById(req.params.poId);
    if (!po) {
      return res.status(404).json({ error: 'Pedido de Compra não encontrado.' });
    }

    const nextStatus = req.body?.status as PurchaseOrderStatus;
    const allowed = ALLOWED_PO_TRANSITIONS[po.status] || [];
    if (!allowed.includes(nextStatus)) {
      return res.status(409).json({
        error: `Transição de status inválida: '${po.status}' -> '${nextStatus}'. Permitidos: ${allowed.length > 0 ? allowed.join(', ') : 'nenhum (use o fluxo de recebimento)'}.`,
        code: 'INVALID_PO_TRANSITION',
      });
    }

    const todayISO = getTodayISO();
    const nowIso = new Date().toISOString();
    const updated: PurchaseOrderEntity = {
      ...po,
      status: nextStatus,
      updatedAt: nowIso,
    };

    await supplierRepository.savePurchaseOrder(updated);

    let createdPayable: FinancialTransactionEntity | undefined;
    const allFinance = await financeRepository.findAll();
    const existingPayables = allFinance.filter(
      (f) => f.type === 'pagar' && f.status !== 'estornado' && f.purchaseOrderId === po.id
    );

    // Ao confirmar o pedido, provisiona automaticamente no Financeiro se ainda não houver título vinculado
    if (
      nextStatus === 'confirmado' &&
      updated.totalAmount > 0 &&
      existingPayables.length === 0 &&
      req.body?.autoGeneratePayable !== false
    ) {
      const trxNumber = await sequenceService.nextFinanceNumberAsync();
      const itemsSummary = updated.items
        .slice(0, 2)
        .map((it) => `${it.quantity} ${it.unit} ${it.itemName}`)
        .join(', ');
      createdPayable = {
        id: crypto.randomUUID(),
        transactionNumber: trxNumber,
        productionOrderId: updated.relatedOrderId,
        supplierId: updated.supplierId,
        supplierName: updated.supplierName,
        purchaseOrderId: updated.id,
        purchaseOrderNumber: updated.poNumber,
        type: 'pagar',
        subType: 'compra_tecido',
        description: `Compra ${updated.poNumber} · ${updated.supplierName} (${itemsSummary})`,
        category: 'Matéria-Prima & Tecidos',
        amount: updated.totalAmount,
        dueDate: updated.dueDate,
        status: 'pendente',
        paymentMethod: updated.paymentMethod,
        referenceId: updated.poNumber,
        isProvision: true,
        isDemo: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await financeRepository.save(createdPayable);
    }

    // Ao cancelar um pedido com provisão pendente (não paga), estorna a provisão automaticamente
    if (nextStatus === 'cancelado') {
      for (const p of existingPayables) {
        if (p.status === 'pendente' || p.status === 'atrasado') {
          await financeRepository.save({
            ...p,
            status: 'estornado',
            confirmationNotes: `${p.confirmationNotes ? `${p.confirmationNotes} | ` : ''}[ESTORNADO automaticamente por cancelamento do Pedido de Compra ${updated.poNumber} em ${todayISO} por ${actor.fullName}]`,
            updatedAt: nowIso,
          });
        }
      }
    }

    auditService.log({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      entityName: 'estoque.purchase_orders',
      entityId: updated.poNumber,
      action: 'UPDATE_PURCHASE_ORDER_STATUS',
      oldData: { status: po.status },
      newData: { status: updated.status, createdPayable: createdPayable?.transactionNumber },
      notes: `Status do Pedido de Compra ${updated.poNumber} alterado de '${po.status}' para '${updated.status}'.`,
    });

    const refreshedFinance = await financeRepository.findAll();
    return res.json({
      purchaseOrder: enrichPurchaseOrder(updated, refreshedFinance, todayISO),
      createdPayable,
    });
  }
);

// Recebimento Físico de Pedido de Compra -> Entrada no Estoque (Kardex) + Custo Médio + Contas a Pagar
suppliersRouter.post(
  '/purchase-orders/:poId/receive',
  requirePermission('suppliers:receive_orders'),
  async (req: RequestWithUser, res: Response) => {
    const actor = req.user!;
    const po = await supplierRepository.findPurchaseOrderById(req.params.poId);
    if (!po) {
      return res.status(404).json({ error: 'Pedido de Compra não encontrado.' });
    }

    if (po.status === 'cancelado') {
      return res.status(409).json({
        error: `O Pedido de Compra ${po.poNumber} está cancelado e não pode ser recebido.`,
        code: 'PO_CANCELLED',
      });
    }
    if (po.status === 'recebido_total') {
      return res.status(409).json({
        error: `O Pedido de Compra ${po.poNumber} já foi recebido integralmente.`,
        code: 'PO_ALREADY_RECEIVED',
      });
    }

    const body = req.body || {};
    const todayISO = getTodayISO();
    const nowIso = new Date().toISOString();
    const invoiceNumber =
      typeof body.invoiceNumber === 'string' && body.invoiceNumber.trim()
        ? body.invoiceNumber.trim().slice(0, 80)
        : po.invoiceNumber;
    const updateUnitCost = body.updateUnitCost !== false;
    const generatePayableIfMissing = body.generatePayableIfMissing !== false;
    const receiveNotes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 300) : '';

    // Montar mapa de quantidades a receber (se items não for enviado, recebe 100% do saldo restante)
    const incomingMap = new Map<string, number>();
    if (Array.isArray(body.items) && body.items.length > 0) {
      for (const entry of body.items) {
        const itemId = typeof entry?.itemId === 'string' ? entry.itemId.trim() : '';
        const qty = Number(entry?.receiveQuantity ?? entry?.quantity ?? 0);
        if (!itemId || !Number.isFinite(qty) || qty < 0) {
          return res.status(400).json({ error: 'Informe quantidades de recebimento válidas (>= 0).' });
        }
        if (qty > 0) {
          incomingMap.set(itemId, round2((incomingMap.get(itemId) || 0) + qty));
        }
      }
    } else {
      for (const it of po.items) {
        const remaining = round2(Math.max(0, it.quantity - it.receivedQuantity));
        if (remaining > 0) incomingMap.set(it.itemId, remaining);
      }
    }

    if (incomingMap.size === 0) {
      return res.status(400).json({ error: 'Informe ao menos um item com quantidade maior que zero para receber.' });
    }

    // Validar limites de recebimento antes de efetivar qualquer mutação
    for (const [itemId, recQty] of incomingMap.entries()) {
      const poItem = po.items.find((i) => i.itemId === itemId);
      if (!poItem) {
        return res.status(400).json({ error: `Insumo '${itemId}' não pertence ao Pedido de Compra ${po.poNumber}.` });
      }
      const remaining = round2(Math.max(0, poItem.quantity - poItem.receivedQuantity));
      if (recQty > remaining + 0.001) {
        return res.status(400).json({
          error: `Quantidade a receber (${recQty} ${poItem.unit}) excede o saldo pendente (${remaining} ${poItem.unit}) para '${poItem.itemName}'.`,
        });
      }
    }

    const supplier = await supplierRepository.findById(po.supplierId);
    const createdMovements: StockMovementEntity[] = [];
    const updatedPoItems: PurchaseOrderItemEntity[] = [];

    for (const poItem of po.items) {
      const receiveNow = incomingMap.get(poItem.itemId) || 0;
      if (receiveNow <= 0) {
        updatedPoItems.push(poItem);
        continue;
      }

      const invItem = await inventoryRepository.findItemById(poItem.itemId);
      if (!invItem) {
        return res.status(404).json({ error: `Insumo '${poItem.itemName}' não encontrado no estoque.` });
      }

      // 1) Atualizar saldo físico + Custo Médio Ponderado (CMP)
      const previousStock = Math.max(0, invItem.physicalStock);
      const nextPhysicalStock = round2(previousStock + receiveNow);

      let nextUnitCost = invItem.unitCostPrice;
      if (updateUnitCost && poItem.unitCost > 0) {
        if (previousStock + receiveNow > 0) {
          nextUnitCost = round2(
            (previousStock * invItem.unitCostPrice + receiveNow * poItem.unitCost) /
              (previousStock + receiveNow)
          );
        } else {
          nextUnitCost = poItem.unitCost;
        }
      }

      await inventoryRepository.saveItem({
        ...invItem,
        physicalStock: nextPhysicalStock,
        unitCostPrice: nextUnitCost,
        supplierId: po.supplierId,
        supplier: supplier?.tradeName || po.supplierName,
        lastRestocked: todayISO,
        updatedAt: nowIso,
      });

      // 2) Registrar movimento Kardex auditável (entrada_compra)
      const movementNumber = await sequenceService.nextMovementNumberAsync();
      const mov: StockMovementEntity = {
        id: crypto.randomUUID(),
        movementNumber,
        itemId: invItem.id,
        productionOrderId: po.relatedOrderId,
        type: 'entrada_compra',
        quantity: receiveNow,
        unit: invItem.unit,
        date: todayISO,
        reason: `Recebimento do Pedido ${po.poNumber} · Fornecedor: ${po.supplierName}${invoiceNumber ? ` · NF ${invoiceNumber}` : ''}${receiveNotes ? ` · ${receiveNotes}` : ''}`,
        referenceDoc: invoiceNumber || po.poNumber,
        operatorId: actor.id,
        operatorName: actor.fullName,
        isDemo: false,
        createdAt: nowIso,
      };
      await inventoryRepository.saveMovement(mov);
      createdMovements.push(mov);

      updatedPoItems.push({
        ...poItem,
        receivedQuantity: round2(poItem.receivedQuantity + receiveNow),
      });
    }

    const allReceived = updatedPoItems.every((it) => it.receivedQuantity >= it.quantity - 0.001);
    const nextStatus: PurchaseOrderStatus = allReceived ? 'recebido_total' : 'recebido_parcial';

    const updatedPO: PurchaseOrderEntity = {
      ...po,
      items: updatedPoItems,
      status: nextStatus,
      invoiceNumber,
      receivedDate: allReceived ? todayISO : po.receivedDate,
      updatedAt: nowIso,
    };
    await supplierRepository.savePurchaseOrder(updatedPO);

    // 3) Sincronizar / gerar Contas a Pagar no Financeiro de forma idempotente
    const allFinance = await financeRepository.findAll();
    const existingPayables = allFinance.filter(
      (f) => f.type === 'pagar' && f.status !== 'estornado' && f.purchaseOrderId === po.id
    );

    let linkedPayable: FinancialTransactionEntity | undefined;
    if (existingPayables.length > 0) {
      // Efetiva provisão pendente com o número da NF recebida
      const firstOpen = existingPayables.find((f) => f.status === 'pendente' || f.status === 'atrasado');
      if (firstOpen) {
        linkedPayable = {
          ...firstOpen,
          isProvision: false,
          referenceId: invoiceNumber || firstOpen.referenceId || po.poNumber,
          description: invoiceNumber && !firstOpen.description.includes(invoiceNumber)
            ? `${firstOpen.description} · NF ${invoiceNumber}`
            : firstOpen.description,
          updatedAt: nowIso,
        };
        await financeRepository.save(linkedPayable);
      }
    } else if (generatePayableIfMissing && updatedPO.totalAmount > 0) {
      const trxNumber = await sequenceService.nextFinanceNumberAsync();
      const dueDate = isValidIsoDate(body.dueDate) ? body.dueDate.trim() : updatedPO.dueDate;
      linkedPayable = {
        id: crypto.randomUUID(),
        transactionNumber: trxNumber,
        productionOrderId: updatedPO.relatedOrderId,
        supplierId: updatedPO.supplierId,
        supplierName: updatedPO.supplierName,
        purchaseOrderId: updatedPO.id,
        purchaseOrderNumber: updatedPO.poNumber,
        type: 'pagar',
        subType: 'compra_tecido',
        description: `Compra ${updatedPO.poNumber} · ${updatedPO.supplierName}${invoiceNumber ? ` · NF ${invoiceNumber}` : ''}`,
        category: 'Matéria-Prima & Tecidos',
        amount: updatedPO.totalAmount,
        dueDate,
        status: 'pendente',
        paymentMethod: updatedPO.paymentMethod,
        referenceId: invoiceNumber || updatedPO.poNumber,
        isProvision: false,
        isDemo: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await financeRepository.save(linkedPayable);
    }

    auditService.log({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      entityName: 'estoque.purchase_orders',
      entityId: updatedPO.poNumber,
      action: 'RECEIVE_PURCHASE_ORDER',
      newData: {
        poNumber: updatedPO.poNumber,
        status: updatedPO.status,
        invoiceNumber,
        movements: createdMovements.map((m) => ({ number: m.movementNumber, itemId: m.itemId, qty: m.quantity })),
        payableNumber: linkedPayable?.transactionNumber,
      },
      notes: `Recebimento ${allReceived ? 'total' : 'parcial'} do Pedido ${updatedPO.poNumber} (${createdMovements.length} entrada(s) no Estoque${invoiceNumber ? ` · NF ${invoiceNumber}` : ''}).`,
    });

    const refreshedFinance = await financeRepository.findAll();
    return res.json({
      success: true,
      purchaseOrder: enrichPurchaseOrder(updatedPO, refreshedFinance, todayISO),
      movements: createdMovements,
      payable: linkedPayable,
    });
  }
);

// Gerar / Provisionar Contas a Pagar para um Pedido de Compra (idempotente)
suppliersRouter.post(
  '/purchase-orders/:poId/generate-payable',
  requirePermission('suppliers:manage_orders'),
  async (req: RequestWithUser, res: Response) => {
    const actor = req.user!;
    const po = await supplierRepository.findPurchaseOrderById(req.params.poId);
    if (!po) {
      return res.status(404).json({ error: 'Pedido de Compra não encontrado.' });
    }
    if (po.status === 'cancelado') {
      return res.status(409).json({ error: 'Não é possível gerar título financeiro para um pedido cancelado.' });
    }

    const allFinance = await financeRepository.findAll();
    const existing = allFinance.filter(
      (f) => f.type === 'pagar' && f.status !== 'estornado' && f.purchaseOrderId === po.id
    );
    const alreadyCovered = round2(existing.reduce((sum, f) => sum + f.amount, 0));
    const remainingToBill = round2(po.totalAmount - alreadyCovered);

    if (remainingToBill <= 0.01) {
      return res.status(409).json({
        error: `O Pedido de Compra ${po.poNumber} já possui cobertura total em Contas a Pagar (${existing.map((e) => e.transactionNumber).join(', ')}).`,
        code: 'PO_ALREADY_BILLED',
      });
    }

    const body = req.body || {};
    const amount = body.amount !== undefined ? round2(Number(body.amount)) : remainingToBill;
    if (!Number.isFinite(amount) || amount <= 0 || amount > remainingToBill + 0.01) {
      return res.status(400).json({
        error: `Valor inválido. O saldo restante a lançar para este pedido é R$ ${remainingToBill.toFixed(2)}.`,
      });
    }

    const dueDate = isValidIsoDate(body.dueDate) ? body.dueDate.trim() : po.dueDate;
    const paymentMethod = (
      VALID_PAYMENT_METHODS.has(body.paymentMethod) ? body.paymentMethod : po.paymentMethod
    ) as SupplierEntity['defaultPaymentMethod'];

    const nowIso = new Date().toISOString();
    const trxNumber = await sequenceService.nextFinanceNumberAsync();
    const newTrx: FinancialTransactionEntity = {
      id: crypto.randomUUID(),
      transactionNumber: trxNumber,
      productionOrderId: po.relatedOrderId,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      purchaseOrderId: po.id,
      purchaseOrderNumber: po.poNumber,
      type: 'pagar',
      subType: 'compra_tecido',
      description:
        typeof body.description === 'string' && body.description.trim()
          ? body.description.trim().slice(0, 240)
          : `Compra ${po.poNumber} · ${po.supplierName}${po.invoiceNumber ? ` · NF ${po.invoiceNumber}` : ''}`,
      category: 'Matéria-Prima & Tecidos',
      amount,
      dueDate,
      status: 'pendente',
      paymentMethod,
      referenceId: po.invoiceNumber || po.poNumber,
      isProvision: po.status !== 'recebido_total',
      isDemo: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await financeRepository.save(newTrx);

    auditService.log({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      entityName: 'financeiro.transactions',
      entityId: newTrx.transactionNumber,
      action: 'CREATE_SUPPLIER_PAYABLE',
      newData: {
        transactionNumber: newTrx.transactionNumber,
        purchaseOrderNumber: po.poNumber,
        supplierName: po.supplierName,
        amount: newTrx.amount,
        dueDate: newTrx.dueDate,
      },
      notes: `Título CP ${newTrx.transactionNumber} gerado para o Pedido ${po.poNumber} (${po.supplierName}).`,
    });

    return res.status(201).json(newTrx);
  }
);

// =========================================================================
// 3. LISTAR FORNECEDORES ENRIQUECIDOS COM MÉTRICAS REAIS
// =========================================================================
suppliersRouter.get('/', async (_req: RequestWithUser, res: Response) => {
  const todayISO = getTodayISO();
  const [allSuppliers, allItems, allPOs, allFinance] = await Promise.all([
    supplierRepository.findAll(),
    inventoryRepository.findAllItems(),
    supplierRepository.findAllPurchaseOrders(),
    financeRepository.findAll(),
  ]);

  const enriched = allSuppliers.map((sup) => ({
    ...sup,
    metrics: computeSupplierMetrics(sup, allItems, allPOs, allFinance, todayISO),
  }));

  return res.json(enriched);
});

// =========================================================================
// 4. DOSSIÊ 360° DO FORNECEDOR
// =========================================================================
suppliersRouter.get('/:id', async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const supplier = await supplierRepository.findById(req.params.id);
  if (!supplier) {
    return res.status(404).json({ error: 'Fornecedor não encontrado.' });
  }

  const todayISO = getTodayISO();
  const [allItems, allPOs, allFinance] = await Promise.all([
    inventoryRepository.findAllItems(),
    supplierRepository.findAllPurchaseOrders(),
    financeRepository.findAll(),
  ]);

  const linkedItems = allItems.filter(
    (it) =>
      it.supplierId === supplier.id ||
      (!it.supplierId &&
        it.supplier &&
        it.supplier.trim().toLowerCase() === supplier.tradeName.trim().toLowerCase())
  );

  const supplierPOs = allPOs
    .filter((po) => po.supplierId === supplier.id)
    .map((po) => enrichPurchaseOrder(po, allFinance, todayISO));

  const canViewFinance = (PERMISSIONS['finance:view'] || []).includes(actor.role);
  const payables = canViewFinance
    ? allFinance
        .filter((f) => f.type === 'pagar' && f.supplierId === supplier.id)
        .map((f) => ({ ...f, status: effectiveTrxStatus(f, todayISO) }))
    : [];

  return res.json({
    supplier,
    metrics: computeSupplierMetrics(supplier, allItems, allPOs, allFinance, todayISO),
    linkedItems,
    purchaseOrders: supplierPOs,
    payables,
  });
});

// =========================================================================
// 5. CRIAR / ATUALIZAR / EXCLUIR FORNECEDOR
// =========================================================================
suppliersRouter.post('/', requirePermission('suppliers:manage'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const body = req.body || {};

  const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
  const tradeName = typeof body.tradeName === 'string' ? body.tradeName.trim() : companyName;
  const contactName = typeof body.contactName === 'string' ? body.contactName.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';

  if (companyName.length < 2) {
    return res.status(400).json({ error: 'Razão Social (companyName) é obrigatória (mínimo 2 caracteres).' });
  }
  if (contactName.length < 2) {
    return res.status(400).json({ error: 'Nome do contato / representante é obrigatório.' });
  }
  if (phone.length < 8) {
    return res.status(400).json({ error: 'Telefone / WhatsApp válido é obrigatório.' });
  }

  const category = (body.category || 'tecidos_malhas') as SupplierCategory;
  if (!VALID_CATEGORIES.has(category)) {
    return res.status(400).json({
      error: `Categoria de fornecedor inválida. Permitidas: ${Array.from(VALID_CATEGORIES).join(', ')}.`,
    });
  }

  const defaultPaymentMethod = (body.defaultPaymentMethod || 'boleto') as SupplierEntity['defaultPaymentMethod'];
  if (!VALID_PAYMENT_METHODS.has(defaultPaymentMethod)) {
    return res.status(400).json({ error: 'Forma de pagamento padrão inválida.' });
  }

  const paymentTermsDays = Math.max(0, Math.min(365, Math.round(Number(body.paymentTermsDays ?? 30) || 0)));
  const leadTimeDays = Math.max(1, Math.min(180, Math.round(Number(body.leadTimeDays ?? 7) || 7)));
  const minOrderValue = round2(Math.max(0, Number(body.minOrderValue ?? 0) || 0));
  const rating = Math.min(5, Math.max(1, round2(Number(body.rating ?? 5) || 5)));

  const code = await sequenceService.nextSupplierCodeAsync();
  const nowIso = new Date().toISOString();

  const newSupplier: SupplierEntity = {
    id: crypto.randomUUID(),
    code,
    companyName: companyName.slice(0, 180),
    tradeName: (tradeName || companyName).slice(0, 150),
    cnpj: typeof body.cnpj === 'string' ? body.cnpj.trim().slice(0, 24) || undefined : undefined,
    stateRegistration:
      typeof body.stateRegistration === 'string' ? body.stateRegistration.trim().slice(0, 30) || undefined : undefined,
    contactName: contactName.slice(0, 120),
    phone: phone.slice(0, 30),
    email: typeof body.email === 'string' ? body.email.trim().slice(0, 150) || undefined : undefined,
    address: typeof body.address === 'string' ? body.address.trim().slice(0, 240) || undefined : undefined,
    city: typeof body.city === 'string' && body.city.trim() ? body.city.trim().slice(0, 80) : 'São Luís',
    state: typeof body.state === 'string' && body.state.trim() ? body.state.trim().toUpperCase().slice(0, 2) : 'MA',
    cep: typeof body.cep === 'string' ? body.cep.trim().slice(0, 12) || undefined : undefined,
    category,
    paymentTerms:
      typeof body.paymentTerms === 'string' && body.paymentTerms.trim()
        ? body.paymentTerms.trim().slice(0, 100)
        : `${paymentTermsDays} dias`,
    paymentTermsDays,
    defaultPaymentMethod,
    pixKey: typeof body.pixKey === 'string' ? body.pixKey.trim().slice(0, 150) || undefined : undefined,
    bankDetails: typeof body.bankDetails === 'string' ? body.bankDetails.trim().slice(0, 240) || undefined : undefined,
    leadTimeDays,
    minOrderValue,
    rating,
    notes: typeof body.notes === 'string' ? body.notes.trim().slice(0, 600) || undefined : undefined,
    active: body.active !== false,
    isDemo: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await supplierRepository.save(newSupplier);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'estoque.suppliers',
    entityId: newSupplier.code,
    action: 'CREATE_SUPPLIER',
    newData: { code: newSupplier.code, tradeName: newSupplier.tradeName, category: newSupplier.category },
    notes: `Fornecedor ${newSupplier.code} (${newSupplier.tradeName}) cadastrado.`,
  });

  return res.status(201).json(newSupplier);
});

suppliersRouter.put('/:id', requirePermission('suppliers:manage'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const existing = await supplierRepository.findById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Fornecedor não encontrado.' });
  }

  const body = req.body || {};
  const companyName =
    body.companyName !== undefined ? String(body.companyName).trim() : existing.companyName;
  const tradeName =
    body.tradeName !== undefined ? String(body.tradeName).trim() || companyName : existing.tradeName;
  const contactName =
    body.contactName !== undefined ? String(body.contactName).trim() : existing.contactName;
  const phone = body.phone !== undefined ? String(body.phone).trim() : existing.phone;

  if (companyName.length < 2) {
    return res.status(400).json({ error: 'Razão Social deve ter ao menos 2 caracteres.' });
  }
  if (contactName.length < 2) {
    return res.status(400).json({ error: 'Nome do contato é obrigatório.' });
  }
  if (phone.length < 8) {
    return res.status(400).json({ error: 'Telefone / WhatsApp válido é obrigatório.' });
  }

  const category = (body.category !== undefined ? body.category : existing.category) as SupplierCategory;
  if (!VALID_CATEGORIES.has(category)) {
    return res.status(400).json({ error: 'Categoria de fornecedor inválida.' });
  }

  const defaultPaymentMethod = (
    body.defaultPaymentMethod !== undefined ? body.defaultPaymentMethod : existing.defaultPaymentMethod
  ) as SupplierEntity['defaultPaymentMethod'];
  if (!VALID_PAYMENT_METHODS.has(defaultPaymentMethod)) {
    return res.status(400).json({ error: 'Forma de pagamento padrão inválida.' });
  }

  const updated: SupplierEntity = {
    ...existing,
    companyName: companyName.slice(0, 180),
    tradeName: tradeName.slice(0, 150),
    cnpj: body.cnpj !== undefined ? String(body.cnpj || '').trim().slice(0, 24) || undefined : existing.cnpj,
    stateRegistration:
      body.stateRegistration !== undefined
        ? String(body.stateRegistration || '').trim().slice(0, 30) || undefined
        : existing.stateRegistration,
    contactName: contactName.slice(0, 120),
    phone: phone.slice(0, 30),
    email: body.email !== undefined ? String(body.email || '').trim().slice(0, 150) || undefined : existing.email,
    address:
      body.address !== undefined ? String(body.address || '').trim().slice(0, 240) || undefined : existing.address,
    city: body.city !== undefined ? String(body.city || '').trim().slice(0, 80) || existing.city : existing.city,
    state:
      body.state !== undefined
        ? String(body.state || '').trim().toUpperCase().slice(0, 2) || existing.state
        : existing.state,
    cep: body.cep !== undefined ? String(body.cep || '').trim().slice(0, 12) || undefined : existing.cep,
    category,
    paymentTerms:
      body.paymentTerms !== undefined
        ? String(body.paymentTerms || '').trim().slice(0, 100) || existing.paymentTerms
        : existing.paymentTerms,
    paymentTermsDays:
      body.paymentTermsDays !== undefined
        ? Math.max(0, Math.min(365, Math.round(Number(body.paymentTermsDays) || 0)))
        : existing.paymentTermsDays,
    defaultPaymentMethod,
    pixKey: body.pixKey !== undefined ? String(body.pixKey || '').trim().slice(0, 150) || undefined : existing.pixKey,
    bankDetails:
      body.bankDetails !== undefined
        ? String(body.bankDetails || '').trim().slice(0, 240) || undefined
        : existing.bankDetails,
    leadTimeDays:
      body.leadTimeDays !== undefined
        ? Math.max(1, Math.min(180, Math.round(Number(body.leadTimeDays) || 7)))
        : existing.leadTimeDays,
    minOrderValue:
      body.minOrderValue !== undefined
        ? round2(Math.max(0, Number(body.minOrderValue) || 0))
        : existing.minOrderValue,
    rating:
      body.rating !== undefined
        ? Math.min(5, Math.max(1, round2(Number(body.rating) || 5)))
        : existing.rating,
    notes: body.notes !== undefined ? String(body.notes || '').trim().slice(0, 600) || undefined : existing.notes,
    active: body.active !== undefined ? Boolean(body.active) : existing.active,
    updatedAt: new Date().toISOString(),
  };

  await supplierRepository.save(updated);

  // Sincronizar nome fantasia nos insumos vinculados caso tenha sido alterado
  if (updated.tradeName !== existing.tradeName) {
    const allItems = await inventoryRepository.findAllItems();
    for (const item of allItems) {
      if (item.supplierId === updated.id) {
        await inventoryRepository.saveItem({
          ...item,
          supplier: updated.tradeName,
          updatedAt: updated.updatedAt,
        });
      }
    }
  }

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'estoque.suppliers',
    entityId: updated.code,
    action: 'UPDATE_SUPPLIER',
    oldData: { tradeName: existing.tradeName, active: existing.active, category: existing.category },
    newData: { tradeName: updated.tradeName, active: updated.active, category: updated.category },
    notes: `Cadastro do fornecedor ${updated.code} (${updated.tradeName}) atualizado.`,
  });

  return res.json(updated);
});

suppliersRouter.delete('/:id', requirePermission('suppliers:delete'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const existing = await supplierRepository.findById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Fornecedor não encontrado.' });
  }

  const [allPOs, allItems, allFinance] = await Promise.all([
    supplierRepository.findAllPurchaseOrders(),
    inventoryRepository.findAllItems(),
    financeRepository.findAll(),
  ]);

  const linkedPOs = allPOs.filter((po) => po.supplierId === existing.id);
  if (linkedPOs.length > 0) {
    return res.status(409).json({
      error: `Não é possível excluir '${existing.tradeName}' pois existem ${linkedPOs.length} Pedido(s) de Compra vinculados. Inative o fornecedor para preservar o histórico.`,
      code: 'SUPPLIER_HAS_PURCHASE_ORDERS',
    });
  }

  const linkedItems = allItems.filter((it) => it.supplierId === existing.id);
  if (linkedItems.length > 0) {
    return res.status(409).json({
      error: `Não é possível excluir '${existing.tradeName}' pois existem ${linkedItems.length} insumo(s) de estoque vinculados.`,
      code: 'SUPPLIER_HAS_INVENTORY_ITEMS',
    });
  }

  const linkedPayables = allFinance.filter((f) => f.supplierId === existing.id);
  if (linkedPayables.length > 0) {
    return res.status(409).json({
      error: `Não é possível excluir '${existing.tradeName}' pois existem ${linkedPayables.length} lançamento(s) financeiro(s) vinculados.`,
      code: 'SUPPLIER_HAS_PAYABLES',
    });
  }

  await supplierRepository.delete(existing.id);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'estoque.suppliers',
    entityId: existing.code,
    action: 'DELETE_SUPPLIER',
    oldData: { code: existing.code, tradeName: existing.tradeName },
    notes: `Fornecedor ${existing.code} (${existing.tradeName}) excluído.`,
  });

  return res.json({ success: true, message: `Fornecedor ${existing.tradeName} excluído com sucesso.` });
});
