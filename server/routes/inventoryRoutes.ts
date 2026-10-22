import { Router, Response } from 'express';
import { RequestWithUser, requirePermission } from '../auth/rbac';
import { db } from '../db/connection';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';
import { InventoryItemEntity, StockMovementEntity } from '../types/db';

export const inventoryRouter = Router();

// Listar itens do estoque
inventoryRouter.get('/items', (req: RequestWithUser, res: Response) => {
  const allItems = Array.from(db.inventory.values());
  res.json(allItems);
});

// Cadastrar novo item de estoque
inventoryRouter.post('/items', requirePermission('inventory:adjust'), (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const payload = req.body;

  const code = sequenceService.nextInventoryCode();
  const newItem: InventoryItemEntity = {
    id: `mat-${Date.now()}`,
    code,
    name: payload.name || 'Insumo Têxtil',
    category: payload.category || 'tecido',
    unit: payload.unit || 'metros',
    physicalStock: Number(payload.physicalStock || payload.currentStock || 0),
    allocatedStock: Number(payload.allocatedStock || 0),
    inPartnersCustodyStock: Number(payload.inPartnersCustodyStock || 0),
    minStock: Number(payload.minStock || 50),
    unitCostPrice: Number(payload.unitCostPrice || payload.costPrice || 0),
    supplier: payload.supplier || 'Fornecedor Homologado',
    location: payload.location || 'Almoxarifado Central',
    lastRestocked: new Date().toISOString().split('T')[0],
    isDemo: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.inventory.set(newItem.id, newItem);

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

// Listar movimentações
inventoryRouter.get('/movements', (req: RequestWithUser, res: Response) => {
  const allMovements = Array.from(db.movements.values());
  res.json(allMovements);
});

// Registrar movimentação de estoque por evento compensatório (Regra B.3.5)
inventoryRouter.post('/movements', requirePermission('inventory:create_movement'), (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const { itemId, productionOrderId, type, quantity, reason, referenceDoc } = req.body;

  const item = db.inventory.get(itemId);
  if (!item) {
    return res.status(404).json({ error: 'Item de estoque não encontrado' });
  }

  const qty = Number(quantity);
  if (isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Quantidade deve ser um número positivo' });
  }

  const oldPhysical = item.physicalStock;
  const oldAllocated = item.allocatedStock;
  const oldThirdParty = item.inPartnersCustodyStock;

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
        return res.status(400).json({ error: `Saldo físico insuficiente para remessa à facção.` });
      }
      item.physicalStock -= qty;
      item.inPartnersCustodyStock += qty;
      break;
    case 'retorno_parceiro': // Retorno de sobras ou peças prontas da facção
      item.inPartnersCustodyStock = Math.max(0, item.inPartnersCustodyStock - qty);
      item.physicalStock += qty;
      break;
    case 'perda_tecnica':
      item.physicalStock = Math.max(0, item.physicalStock - qty);
      break;
    case 'ajuste_inventario':
      item.physicalStock = qty; // Ajuste direto autorizado
      break;
    default:
      return res.status(400).json({ error: 'Tipo de movimentação inválido' });
  }

  item.updatedAt = new Date().toISOString();

  const movementNumber = sequenceService.nextMovementNumber();
  const movement: StockMovementEntity = {
    id: `mov-${Date.now()}`,
    movementNumber,
    itemId: item.id,
    productionOrderId,
    type,
    quantity: qty,
    unit: item.unit,
    date: new Date().toISOString().split('T')[0],
    reason: reason || 'Movimentação operacional',
    referenceDoc: referenceDoc || undefined,
    operatorId: actor.id,
    operatorName: actor.fullName,
    isDemo: item.isDemo,
    createdAt: new Date().toISOString(),
  };

  db.movements.set(movement.id, movement);

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
