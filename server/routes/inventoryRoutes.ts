import { Router, Response } from 'express';
import crypto from 'crypto';
import { RequestWithUser, requireAuth, requirePermission, PERMISSIONS } from '../auth/rbac';
import { inventoryRepository } from '../repositories/inventoryRepository';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';
import { InventoryItemEntity, StockMovementEntity } from '../types/db';

export const inventoryRouter = Router();

// Exigir autenticação para todas as rotas de estoque
inventoryRouter.use(requireAuth);

// Listar itens do estoque
inventoryRouter.get('/items', async (_req: RequestWithUser, res: Response) => {
  const allItems = await inventoryRepository.findAllItems();
  res.json(allItems);
});

// Cadastrar novo item de estoque
inventoryRouter.post('/items', requirePermission('inventory:manage_items'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const payload = req.body;

  if (!payload.name) {
    return res.status(400).json({ error: 'Nome do insumo (name) é obrigatório.' });
  }

  const physicalStock = Math.max(0, Number(payload.physicalStock ?? payload.currentStock ?? 0));
  const allocatedStock = Math.max(0, Number(payload.allocatedStock ?? 0));
  const inPartnersCustodyStock = Math.max(0, Number(payload.inPartnersCustodyStock ?? 0));
  const minStock = Math.max(0, Number(payload.minStock ?? 50));
  const unitCostPrice = Math.max(0, Number(payload.unitCostPrice ?? payload.costPrice ?? 0));

  const code = await sequenceService.nextInventoryCodeAsync();
  const newItem: InventoryItemEntity = {
    id: crypto.randomUUID(),
    code,
    name: payload.name,
    category: payload.category || 'tecido',
    unit: payload.unit || 'metros',
    physicalStock,
    allocatedStock,
    inPartnersCustodyStock,
    minStock,
    unitCostPrice,
    supplier: payload.supplier || 'Fornecedor Homologado',
    location: payload.location || 'Almoxarifado Central',
    lastRestocked: new Date().toISOString().split('T')[0],
    isDemo: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await inventoryRepository.saveItem(newItem);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'estoque.items',
    entityId: newItem.code,
    action: 'CREATE_INVENTORY_ITEM',
    newData: newItem,
    notes: `Novo item de estoque ${newItem.code} - ${newItem.name} cadastrado.`,
  });

  res.status(201).json(newItem);
});

// Atualizar dados cadastrais do item de estoque (Saldos só alteram via /movements por evento compensatório)
inventoryRouter.put('/items/:id', requirePermission('inventory:manage_items'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const item = await inventoryRepository.findItemById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Item de estoque não encontrado' });
  }

  const payload = req.body;
  const updated: InventoryItemEntity = {
    ...item,
    name: payload.name ?? item.name,
    category: payload.category ?? item.category,
    unit: payload.unit ?? item.unit,
    minStock: payload.minStock !== undefined ? Math.max(0, Number(payload.minStock)) : item.minStock,
    unitCostPrice:
      (payload.unitCostPrice ?? payload.costPrice) !== undefined
        ? Math.max(0, Number(payload.unitCostPrice ?? payload.costPrice))
        : item.unitCostPrice,
    supplier: payload.supplier ?? item.supplier,
    location: payload.location ?? item.location,
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
    newData: { name: updated.name, minStock: updated.minStock, unitCostPrice: updated.unitCostPrice, supplier: updated.supplier },
    notes: `Cadastro do insumo ${updated.code} (${updated.name}) atualizado.`,
  });

  res.json(updated);
});

// Excluir item de estoque (Apenas se não houver saldo em poder de terceiros)
inventoryRouter.delete('/items/:id', requirePermission('inventory:manage_items'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const item = await inventoryRepository.findItemById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Item de estoque não encontrado' });
  }

  if (item.inPartnersCustodyStock > 0) {
    return res.status(400).json({
      error: `Não é permitido excluir o insumo ${item.code} enquanto houver ${item.inPartnersCustodyStock} ${item.unit} em poder de terceiros (facções).`,
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
    notes: `Item de estoque ${item.code} (${item.name}) excluído.`,
  });

  res.json({ success: true, message: 'Item de estoque excluído com sucesso.' });
});

// Listar movimentações
inventoryRouter.get('/movements', async (_req: RequestWithUser, res: Response) => {
  const allMovements = await inventoryRepository.findAllMovements();
  res.json(allMovements);
});

// Registrar movimentação de estoque por evento compensatório (Regra B.3.5)
inventoryRouter.post('/movements', requirePermission('inventory:create_movement'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const { itemId, productionOrderId, type, quantity, reason, referenceDoc } = req.body;

  const item = await inventoryRepository.findItemById(itemId);
  if (!item) {
    return res.status(404).json({ error: 'Item de estoque não encontrado' });
  }

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || (type !== 'ajuste_inventario' && qty <= 0) || (type === 'ajuste_inventario' && qty < 0)) {
    return res.status(400).json({ error: 'Quantidade inválida para este tipo de movimentação.' });
  }

  const oldPhysical = item.physicalStock;
  const oldAllocated = item.allocatedStock;
  const oldThirdParty = item.inPartnersCustodyStock;
  let recordedReason = reason || 'Movimentação operacional';
  let recordedDelta: number | undefined;

  // Lógica de movimentação conforme tipo
  switch (type) {
    case 'entrada_compra':
      item.physicalStock += qty;
      item.lastRestocked = new Date().toISOString().split('T')[0];
      break;
    case 'saida_corte':
      if (item.physicalStock < qty) {
        return res.status(400).json({ error: `Saldo físico insuficiente (Disponível: ${item.physicalStock} ${item.unit})` });
      }
      item.physicalStock -= qty;
      if (item.allocatedStock >= qty) {
        item.allocatedStock -= qty;
      }
      break;
    case 'remessa_parceiro': // Envio para facção externa (mantém sob custódia rastreada)
      if (item.physicalStock < qty) {
        return res.status(400).json({ error: `Saldo físico insuficiente para remessa à facção (Disponível: ${item.physicalStock} ${item.unit}).` });
      }
      item.physicalStock -= qty;
      item.inPartnersCustodyStock += qty;
      break;
    case 'retorno_parceiro': // Retorno de sobras ou peças prontas da facção (Correção P0-003)
      if (qty > item.inPartnersCustodyStock) {
        return res.status(400).json({
          error: `Quantidade de retorno (${qty} ${item.unit}) excede o saldo em custódia do parceiro (${item.inPartnersCustodyStock} ${item.unit}). Operação rejeitada.`,
        });
      }
      item.inPartnersCustodyStock -= qty;
      item.physicalStock += qty;
      break;
    case 'perda_tecnica':
      if (qty > item.physicalStock) {
        return res.status(400).json({
          error: `Perda técnica (${qty} ${item.unit}) excede o saldo físico disponível (${item.physicalStock} ${item.unit}).`,
        });
      }
      item.physicalStock -= qty;
      break;
    case 'ajuste_inventario': {
      const adjustAllowed = PERMISSIONS['inventory:adjust'] || ['admin'];
      if (!adjustAllowed.includes(actor.role)) {
        return res.status(403).json({
          error: `Acesso negado: Apenas perfis [${adjustAllowed.join(', ')}] podem realizar ajustes de inventário.`,
        });
      }
      if (!reason || String(reason).trim().length < 5) {
        return res.status(400).json({
          error: 'Ajustes compensatórios de inventário exigem justificativa detalhada (mínimo 5 caracteres).',
        });
      }
      recordedDelta = Math.round((qty - oldPhysical) * 100) / 100;
      item.physicalStock = qty;
      recordedReason = `${reason.trim()} [Evento compensatório: saldo ${oldPhysical} -> ${qty}, delta ${recordedDelta >= 0 ? '+' : ''}${recordedDelta} ${item.unit}]`;
      break;
    }
    default:
      return res.status(400).json({ error: 'Tipo de movimentação inválido' });
  }

  item.updatedAt = new Date().toISOString();
  await inventoryRepository.saveItem(item);

  const movementNumber = await sequenceService.nextMovementNumberAsync();
  const movement: StockMovementEntity = {
    id: crypto.randomUUID(),
    movementNumber,
    itemId: item.id,
    productionOrderId,
    type,
    quantity: type === 'ajuste_inventario' ? Math.abs(recordedDelta ?? 0) : qty,
    unit: item.unit,
    date: new Date().toISOString().split('T')[0],
    reason: recordedReason,
    referenceDoc: referenceDoc || undefined,
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
      newThirdPartyStock: item.inPartnersCustodyStock,
    },
    notes: `Movimento ${movement.movementNumber} (${type}) registrado para ${item.name}.`,
  });

  res.status(201).json({
    success: true,
    movement,
    item,
  });
});
