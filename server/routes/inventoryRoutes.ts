/**
 * DE FARDAS ERP — Estoque & Tecidoteca Routes
 * Enforces (PRD §3.2 & B.3.5):
 *  - Segregação rigorosa entre Saldo Físico Próprio, Alocado para OPs e Em Poder de Terceiros (Facções)
 *  - Alterações de saldo exclusivamente via eventos compensatórios auditáveis (/movements)
 *  - Registro automático de evento inicial no Kardex ao cadastrar insumo com saldo físico > 0
 *  - Bloqueio de alteração de unidade (unit) quando o item já possui saldo ou movimentações
 *  - Integridade referencial em exclusão (409 para custódia aberta, alocado, saldo físico ou histórico Kardex)
 *  - Validação estrita de enums, números finitos e productionOrderId
 */
import { Router, Response } from 'express';
import crypto from 'crypto';
import { RequestWithUser, requireAuth, requirePermission, PERMISSIONS } from '../auth/rbac';
import { inventoryRepository } from '../repositories/inventoryRepository';
import { partnerRepository } from '../repositories/partnerRepository';
import { orderRepository } from '../repositories/orderRepository';
import { supplierRepository } from '../repositories/supplierRepository';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';
import { InventoryItemEntity, StockMovementEntity } from '../types/db';

export const inventoryRouter = Router();

const VALID_CATEGORIES = new Set<InventoryItemEntity['category']>([
  'tecido',
  'aviamento',
  'insumo_personalizacao',
  'pronta_entrega',
]);

const VALID_UNITS = new Set<InventoryItemEntity['unit']>([
  'metros',
  'kg',
  'rolos',
  'unidades',
  'cones',
  'pecas',
]);

const round2 = (n: number) => Math.round(n * 100) / 100;

// Exigir autenticação para todas as rotas de estoque
inventoryRouter.use(requireAuth);

// 1. Listar itens do estoque
inventoryRouter.get('/items', async (_req: RequestWithUser, res: Response) => {
  const allItems = await inventoryRepository.findAllItems();
  res.json(allItems);
});

// 2. Cadastrar novo item de estoque (gera evento Kardex inicial quando physicalStock > 0)
inventoryRouter.post('/items', requirePermission('inventory:manage_items'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const payload = req.body || {};

  const name = String(payload.name || '').trim();
  if (!name || name.length < 2) {
    return res.status(400).json({ error: 'Nome do insumo (name) é obrigatório (mínimo 2 caracteres).' });
  }

  const category = (payload.category ? String(payload.category).trim() : 'tecido') as InventoryItemEntity['category'];
  if (!VALID_CATEGORIES.has(category)) {
    return res.status(400).json({
      error: `Categoria inválida. Permitidas: ${Array.from(VALID_CATEGORIES).join(', ')}.`,
    });
  }

  const unit = (payload.unit ? String(payload.unit).trim() : 'metros') as InventoryItemEntity['unit'];
  if (!VALID_UNITS.has(unit)) {
    return res.status(400).json({
      error: `Unidade de medida inválida. Permitidas: ${Array.from(VALID_UNITS).join(', ')}.`,
    });
  }

  const rawPhysical = Number(payload.physicalStock ?? payload.currentStock ?? 0);
  const rawMin = Number(payload.minStock ?? 50);
  const rawCost = Number(payload.unitCostPrice ?? payload.costPrice ?? 0);

  if (!Number.isFinite(rawPhysical) || rawPhysical < 0) {
    return res.status(400).json({ error: 'Saldo físico inicial inválido (deve ser número maior ou igual a zero).' });
  }
  if (!Number.isFinite(rawMin) || rawMin < 0) {
    return res.status(400).json({ error: 'Estoque mínimo inválido (deve ser número maior ou igual a zero).' });
  }
  if (!Number.isFinite(rawCost) || rawCost < 0) {
    return res.status(400).json({ error: 'Custo unitário inválido (deve ser número maior ou igual a zero).' });
  }

  const physicalStock = round2(rawPhysical);
  // Invariante §3.2: saldo alocado e custódia de terceiros só nascem via eventos auditáveis
  const allocatedStock = 0;
  const inPartnersCustodyStock = 0;
  const minStock = round2(rawMin);
  const unitCostPrice = round2(rawCost);

  const code = await sequenceService.nextInventoryCodeAsync();
  const todayIso = new Date().toISOString().split('T')[0];
  const nowIso = new Date().toISOString();

  let resolvedSupplierId: string | undefined =
    typeof payload.supplierId === 'string' && payload.supplierId.trim() ? payload.supplierId.trim() : undefined;
  let resolvedSupplierName = String(payload.supplier || '').trim() || 'Fornecedor Homologado';

  if (resolvedSupplierId) {
    const linkedSupplier = await supplierRepository.findById(resolvedSupplierId);
    if (!linkedSupplier) {
      return res.status(404).json({ error: 'Fornecedor selecionado não encontrado.' });
    }
    resolvedSupplierName = linkedSupplier.tradeName;
  }

  const newItem: InventoryItemEntity = {
    id: crypto.randomUUID(),
    code,
    name,
    category,
    unit,
    physicalStock,
    allocatedStock,
    inPartnersCustodyStock,
    minStock,
    unitCostPrice,
    supplierId: resolvedSupplierId,
    supplier: resolvedSupplierName,
    location: String(payload.location || '').trim() || 'Almoxarifado Central',
    lastRestocked: todayIso,
    isDemo: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await inventoryRepository.saveItem(newItem);

  // Rastreabilidade Kardex (§3.2): se o item nasce com saldo físico > 0, registrar evento de entrada inicial
  let initialMovement: StockMovementEntity | undefined;
  if (physicalStock > 0) {
    const movementNumber = await sequenceService.nextMovementNumberAsync();
    initialMovement = {
      id: crypto.randomUUID(),
      movementNumber,
      itemId: newItem.id,
      type: 'entrada_compra',
      quantity: physicalStock,
      unit: newItem.unit,
      date: todayIso,
      reason: 'Saldo físico inicial registrado no cadastro do insumo',
      referenceDoc: newItem.code,
      operatorId: actor.id,
      operatorName: actor.fullName,
      isDemo: false,
      createdAt: nowIso,
    };
    await inventoryRepository.saveMovement(initialMovement);
  }

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'estoque.items',
    entityId: newItem.code,
    action: 'CREATE_INVENTORY_ITEM',
    newData: {
      code: newItem.code,
      name: newItem.name,
      category: newItem.category,
      unit: newItem.unit,
      physicalStock: newItem.physicalStock,
      minStock: newItem.minStock,
      unitCostPrice: newItem.unitCostPrice,
      initialMovementNumber: initialMovement?.movementNumber,
    },
    notes: `Novo item de estoque ${newItem.code} - ${newItem.name} cadastrado${initialMovement ? ` (Kardex inicial ${initialMovement.movementNumber})` : ''}.`,
  });

  return res.status(201).json(newItem);
});

// 3. Atualizar dados cadastrais do item de estoque (Saldos só alteram via /movements por evento compensatório)
inventoryRouter.put('/items/:id', requirePermission('inventory:manage_items'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const item = await inventoryRepository.findItemById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Item de estoque não encontrado.' });
  }

  const payload = req.body || {};

  const nextName = payload.name !== undefined ? String(payload.name).trim() : item.name;
  if (!nextName || nextName.length < 2) {
    return res.status(400).json({ error: 'Nome do insumo (name) deve ter ao menos 2 caracteres.' });
  }

  const nextCategory = (
    payload.category !== undefined ? String(payload.category).trim() : item.category
  ) as InventoryItemEntity['category'];
  if (!VALID_CATEGORIES.has(nextCategory)) {
    return res.status(400).json({
      error: `Categoria inválida. Permitidas: ${Array.from(VALID_CATEGORIES).join(', ')}.`,
    });
  }

  const nextUnit = (
    payload.unit !== undefined ? String(payload.unit).trim() : item.unit
  ) as InventoryItemEntity['unit'];
  if (!VALID_UNITS.has(nextUnit)) {
    return res.status(400).json({
      error: `Unidade de medida inválida. Permitidas: ${Array.from(VALID_UNITS).join(', ')}.`,
    });
  }

  // Impedir troca de unidade de medida caso já exista saldo ou movimentação no Kardex
  if (nextUnit !== item.unit) {
    const existingMovs = await inventoryRepository.findMovementsByItemId(item.id);
    const hasBalance = item.physicalStock > 0 || item.allocatedStock > 0 || item.inPartnersCustodyStock > 0;
    if (hasBalance || existingMovs.length > 0) {
      return res.status(409).json({
        error: `Não é permitido alterar a unidade de medida (${item.unit} -> ${nextUnit}) de um insumo que já possui saldo ou movimentações registradas no Kardex.`,
        code: 'ITEM_UNIT_LOCKED',
      });
    }
  }

  let nextMinStock = item.minStock;
  if (payload.minStock !== undefined) {
    const parsedMin = Number(payload.minStock);
    if (!Number.isFinite(parsedMin) || parsedMin < 0) {
      return res.status(400).json({ error: 'Estoque mínimo inválido.' });
    }
    nextMinStock = round2(parsedMin);
  }

  let nextCostPrice = item.unitCostPrice;
  const rawCostInput = payload.unitCostPrice ?? payload.costPrice;
  if (rawCostInput !== undefined) {
    const parsedCost = Number(rawCostInput);
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      return res.status(400).json({ error: 'Custo unitário inválido.' });
    }
    nextCostPrice = round2(parsedCost);
  }

  const oldSnapshot = {
    name: item.name,
    category: item.category,
    unit: item.unit,
    minStock: item.minStock,
    unitCostPrice: item.unitCostPrice,
    supplier: item.supplier,
    location: item.location,
  };

  let nextSupplierId = item.supplierId;
  let nextSupplierName =
    payload.supplier !== undefined ? String(payload.supplier).trim() || item.supplier : item.supplier;

  if (payload.supplierId !== undefined) {
    const trimmedSupId = typeof payload.supplierId === 'string' ? payload.supplierId.trim() : '';
    if (!trimmedSupId) {
      nextSupplierId = undefined;
    } else {
      const linkedSupplier = await supplierRepository.findById(trimmedSupId);
      if (!linkedSupplier) {
        return res.status(404).json({ error: 'Fornecedor selecionado não encontrado.' });
      }
      nextSupplierId = linkedSupplier.id;
      nextSupplierName = linkedSupplier.tradeName;
    }
  }

  // Allowlist estrita: physicalStock, allocatedStock e inPartnersCustodyStock NUNCA são sobrescritos por PUT
  const updated: InventoryItemEntity = {
    ...item,
    name: nextName,
    category: nextCategory,
    unit: nextUnit,
    minStock: nextMinStock,
    unitCostPrice: nextCostPrice,
    supplierId: nextSupplierId,
    supplier: nextSupplierName,
    location: payload.location !== undefined ? String(payload.location).trim() || item.location : item.location,
    updatedAt: new Date().toISOString(),
  };

  await inventoryRepository.saveItem(updated);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'estoque.items',
    entityId: updated.code,
    action: 'UPDATE_INVENTORY_ITEM',
    oldData: oldSnapshot,
    newData: {
      name: updated.name,
      category: updated.category,
      unit: updated.unit,
      minStock: updated.minStock,
      unitCostPrice: updated.unitCostPrice,
      supplier: updated.supplier,
      location: updated.location,
    },
    notes: `Cadastro do insumo ${updated.code} (${updated.name}) atualizado.`,
  });

  return res.json(updated);
});

// 4. Excluir item de estoque (Integridade referencial estrita — HTTP 409 em caso de vínculos ou saldo)
inventoryRouter.delete('/items/:id', requirePermission('inventory:manage_items'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const item = await inventoryRepository.findItemById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Item de estoque não encontrado.' });
  }

  // 1) Bloquear se houver saldo ou custódia aberta em facções terceirizadas
  const allCustody = await partnerRepository.findAllCustody();
  const openCustody = allCustody.filter(
    (c) => c.itemId === item.id && (c.status === 'em_custodia' || c.status === 'devolvido_parcial')
  );
  if (item.inPartnersCustodyStock > 0 || openCustody.length > 0) {
    return res.status(409).json({
      error: `Não é permitido excluir o insumo ${item.code} enquanto houver ${item.inPartnersCustodyStock} ${item.unit} (${openCustody.length} remessa(s)) em poder de terceiros (facções).`,
      code: 'ITEM_HAS_OPEN_CUSTODY',
    });
  }

  // 2) Bloquear se houver saldo alocado para OPs
  if (item.allocatedStock > 0) {
    return res.status(409).json({
      error: `Não é permitido excluir o insumo ${item.code} enquanto houver ${item.allocatedStock} ${item.unit} alocados para Ordens de Produção ativas.`,
      code: 'ITEM_HAS_ALLOCATED_STOCK',
    });
  }

  // 3) Bloquear se houver saldo físico próprio positivo (exige baixa compensatória antes)
  if (item.physicalStock > 0) {
    return res.status(409).json({
      error: `Não é permitido excluir o insumo ${item.code} com saldo físico positivo (${item.physicalStock} ${item.unit}). Zere o saldo por movimentação auditada antes.`,
      code: 'ITEM_HAS_PHYSICAL_STOCK',
    });
  }

  // 4) Bloquear se houver movimentações históricas no Kardex (protege FK RESTRICT e trilha fiscal/contábil)
  const itemMovements = await inventoryRepository.findMovementsByItemId(item.id);
  if (itemMovements.length > 0) {
    return res.status(409).json({
      error: `Não é permitido excluir o insumo ${item.code} pois existem ${itemMovements.length} movimentação(ões) auditadas vinculadas no Kardex.`,
      code: 'ITEM_HAS_MOVEMENTS',
    });
  }

  await inventoryRepository.deleteItem(req.params.id);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'estoque.items',
    entityId: item.code,
    action: 'DELETE_INVENTORY_ITEM',
    oldData: { code: item.code, name: item.name, category: item.category, unit: item.unit },
    notes: `Item de estoque ${item.code} (${item.name}) excluído.`,
  });

  return res.json({ success: true, message: 'Item de estoque excluído com sucesso.' });
});

// 5. Listar movimentações / Kardex (suporta filtros ?itemId= e ?type=, enriquecido com código/nome do item e OP)
inventoryRouter.get('/movements', async (req: RequestWithUser, res: Response) => {
  const itemIdFilter = typeof req.query.itemId === 'string' ? req.query.itemId.trim() : '';
  const typeFilter = typeof req.query.type === 'string' ? req.query.type.trim() : '';

  const [allMovements, allItems, allOrders] = await Promise.all([
    itemIdFilter
      ? inventoryRepository.findMovementsByItemId(itemIdFilter)
      : inventoryRepository.findAllMovements(),
    inventoryRepository.findAllItems(),
    orderRepository.findAll(),
  ]);

  const itemMap = new Map(allItems.map((i) => [i.id, i]));
  const orderMap = new Map(allOrders.map((o) => [o.id, o]));

  const filtered = typeFilter
    ? allMovements.filter((m) => m.type === typeFilter)
    : allMovements;

  const enriched = filtered.map((m) => {
    const it = itemMap.get(m.itemId);
    const ord = m.productionOrderId ? orderMap.get(m.productionOrderId) : undefined;
    return {
      ...m,
      itemCode: it?.code,
      itemName: it?.name,
      orderNumber: ord?.orderNumber,
    };
  });

  return res.json(enriched);
});

// 6. Registrar movimentação de estoque por evento compensatório (Regra B.3.5)
inventoryRouter.post('/movements', requirePermission('inventory:create_movement'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const { itemId, productionOrderId, type, quantity, reason, referenceDoc } = req.body || {};

  if (!itemId) {
    return res.status(400).json({ error: 'Identificador do insumo (itemId) é obrigatório.' });
  }

  const item = await inventoryRepository.findItemById(String(itemId).trim());
  if (!item) {
    return res.status(404).json({ error: 'Item de estoque não encontrado.' });
  }

  let resolvedOrderId: string | undefined;
  let resolvedOrderNumber: string | undefined;
  if (productionOrderId && String(productionOrderId).trim()) {
    const order = await orderRepository.findById(String(productionOrderId).trim());
    if (!order) {
      return res.status(400).json({ error: 'Ordem de Produção vinculada (productionOrderId) não encontrada.' });
    }
    resolvedOrderId = order.id;
    resolvedOrderNumber = order.orderNumber;
  }

  const qty = round2(Number(quantity));
  if (!Number.isFinite(qty) || (type !== 'ajuste_inventario' && qty <= 0) || (type === 'ajuste_inventario' && qty < 0)) {
    return res.status(400).json({ error: 'Quantidade inválida para este tipo de movimentação.' });
  }

  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
  const trimmedRefDoc = typeof referenceDoc === 'string' && referenceDoc.trim() ? referenceDoc.trim() : resolvedOrderNumber;

  const oldPhysical = item.physicalStock;
  const oldAllocated = item.allocatedStock;
  const oldThirdParty = item.inPartnersCustodyStock;
  let recordedReason = trimmedReason || 'Movimentação operacional';
  let recordedDelta: number | undefined;

  // Lógica de movimentação conforme tipo
  switch (type) {
    case 'entrada_compra':
      item.physicalStock = round2(item.physicalStock + qty);
      item.lastRestocked = new Date().toISOString().split('T')[0];
      break;
    case 'saida_corte':
      if (item.physicalStock < qty) {
        return res.status(400).json({
          error: `Saldo físico insuficiente (Disponível: ${item.physicalStock} ${item.unit}).`,
          code: 'INSUFFICIENT_PHYSICAL_STOCK',
        });
      }
      item.physicalStock = round2(item.physicalStock - qty);
      if (item.allocatedStock > 0) {
        item.allocatedStock = round2(Math.max(0, item.allocatedStock - qty));
      }
      break;
    case 'remessa_parceiro': // Envio para facção externa (mantém sob custódia rastreada)
      if (item.physicalStock < qty) {
        return res.status(400).json({
          error: `Saldo físico insuficiente para remessa à facção (Disponível: ${item.physicalStock} ${item.unit}).`,
          code: 'INSUFFICIENT_PHYSICAL_STOCK',
        });
      }
      item.physicalStock = round2(item.physicalStock - qty);
      if (item.allocatedStock > item.physicalStock) {
        item.allocatedStock = item.physicalStock;
      }
      item.inPartnersCustodyStock = round2(item.inPartnersCustodyStock + qty);
      break;
    case 'retorno_parceiro': // Retorno de sobras ou peças prontas da facção (Correção P0-003)
      if (qty > item.inPartnersCustodyStock) {
        return res.status(400).json({
          error: `Quantidade de retorno (${qty} ${item.unit}) excede o saldo em custódia do parceiro (${item.inPartnersCustodyStock} ${item.unit}). Operação rejeitada.`,
          code: 'EXCEEDS_PARTNER_CUSTODY',
        });
      }
      item.inPartnersCustodyStock = round2(item.inPartnersCustodyStock - qty);
      item.physicalStock = round2(item.physicalStock + qty);
      break;
    case 'perda_tecnica':
      if (trimmedReason.length < 5) {
        return res.status(400).json({
          error: 'Registros de perda técnica exigem justificativa detalhada (mínimo 5 caracteres).',
        });
      }
      if (qty > item.physicalStock) {
        return res.status(400).json({
          error: `Perda técnica (${qty} ${item.unit}) excede o saldo físico disponível (${item.physicalStock} ${item.unit}).`,
          code: 'INSUFFICIENT_PHYSICAL_STOCK',
        });
      }
      if (round2(item.physicalStock - qty) < item.allocatedStock) {
        return res.status(409).json({
          error: `Perda técnica reduziria o saldo físico (${round2(item.physicalStock - qty)} ${item.unit}) abaixo do saldo já alocado para OPs (${item.allocatedStock} ${item.unit}).`,
          code: 'BELOW_ALLOCATED_STOCK',
        });
      }
      item.physicalStock = round2(item.physicalStock - qty);
      break;
    case 'ajuste_inventario': {
      const adjustAllowed = PERMISSIONS['inventory:adjust'] || ['admin'];
      if (!adjustAllowed.includes(actor.role)) {
        return res.status(403).json({
          error: `Acesso negado: Apenas perfis [${adjustAllowed.join(', ')}] podem realizar ajustes de inventário.`,
          code: 'FORBIDDEN',
        });
      }
      if (trimmedReason.length < 5) {
        return res.status(400).json({
          error: 'Ajustes compensatórios de inventário exigem justificativa detalhada (mínimo 5 caracteres).',
        });
      }
      recordedDelta = round2(qty - oldPhysical);
      if (recordedDelta === 0) {
        return res.status(400).json({
          error: `O novo saldo informado (${qty} ${item.unit}) é igual ao saldo físico atual. Nenhum ajuste compensatório necessário.`,
          code: 'NOOP_ADJUSTMENT',
        });
      }
      if (qty < item.allocatedStock) {
        return res.status(409).json({
          error: `Não é possível ajustar o saldo físico (${qty} ${item.unit}) abaixo do saldo alocado para OPs ativas (${item.allocatedStock} ${item.unit}).`,
          code: 'BELOW_ALLOCATED_STOCK',
        });
      }
      item.physicalStock = qty;
      recordedReason = `${trimmedReason} [Evento compensatório: saldo ${oldPhysical} -> ${item.physicalStock}, delta ${recordedDelta >= 0 ? '+' : ''}${recordedDelta} ${item.unit}]`;
      break;
    }
    default:
      return res.status(400).json({ error: 'Tipo de movimentação inválido.' });
  }

  item.updatedAt = new Date().toISOString();
  await inventoryRepository.saveItem(item);

  const movementNumber = await sequenceService.nextMovementNumberAsync();
  const movement: StockMovementEntity = {
    id: crypto.randomUUID(),
    movementNumber,
    itemId: item.id,
    productionOrderId: resolvedOrderId,
    type,
    quantity: type === 'ajuste_inventario' ? Math.abs(recordedDelta ?? 0) : qty,
    unit: item.unit,
    date: new Date().toISOString().split('T')[0],
    reason: recordedReason,
    referenceDoc: trimmedRefDoc || undefined,
    operatorId: actor.id,
    operatorName: actor.fullName,
    isDemo: item.isDemo,
    createdAt: new Date().toISOString(),
  };

  await inventoryRepository.saveMovement(movement);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'estoque.movements',
    entityId: movement.movementNumber,
    action: 'STOCK_MOVEMENT',
    oldData: { physicalStock: oldPhysical, allocatedStock: oldAllocated, inPartnersCustodyStock: oldThirdParty },
    newData: {
      movementNumber: movement.movementNumber,
      itemCode: item.code,
      type,
      quantity: qty,
      delta: recordedDelta,
      newPhysicalStock: item.physicalStock,
      newAllocatedStock: item.allocatedStock,
      newThirdPartyStock: item.inPartnersCustodyStock,
      productionOrderId: resolvedOrderId,
    },
    notes: `Movimento ${movement.movementNumber} (${type}) registrado para ${item.name}.`,
  });

  return res.status(201).json({
    success: true,
    movement: {
      ...movement,
      itemCode: item.code,
      itemName: item.name,
      orderNumber: resolvedOrderNumber,
    },
    item,
  });
});
