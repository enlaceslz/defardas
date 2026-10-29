import { isLocalDemoEnvironment } from '../auth/demoEnvironment';
import { number, text, oneOf, InputError, money } from '../validation/input';
import { atomic } from '../db/unitOfWork';
import { Router, Response } from 'express';
import crypto from 'crypto';
import { RequestWithUser, requireAuth, requirePermission } from '../auth/rbac';
import { inventoryRepository } from '../repositories/inventoryRepository';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';
import { InventoryItemEntity, StockMovementEntity } from '../types/db';

export const inventoryRouter = Router();

// Capacidade e escala do numeric(10,2) existente; não define regra comercial.
function decimal(value: unknown, name: string, minimum = 0): number {
  const result = number(value, name, minimum);
  if (Math.abs(result) > 99999999.99 || money(result) !== result) throw new InputError(`${name} deve caber em 8 inteiros e 2 decimais.`);
  return result;
}
function storedBalance(value: number, name: string): number {
  return decimal(money(value), name);
}


// Exigir autenticação para todas as rotas de estoque
inventoryRouter.use(requireAuth);

// Listar itens do estoque
inventoryRouter.get('/items', async (_req: RequestWithUser, res: Response) => {
  const allItems = await inventoryRepository.findAllItems();
  res.json(allItems);
});

// Cadastrar novo item de estoque
inventoryRouter.post('/items', requirePermission('inventory:adjust'), atomic(async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const payload = req.body || {};

  const code = await sequenceService.nextInventoryCode();
  const newItem: InventoryItemEntity = {
    id: crypto.randomUUID(),
    code,
    name: text(payload.name, 'Nome', 150),
    category: oneOf(payload.category, ['tecido', 'aviamento', 'insumo_personalizacao', 'pronta_entrega'], 'Categoria'),
    unit: oneOf(payload.unit, ['metros', 'kg', 'rolos', 'unidades', 'cones', 'pecas'], 'Unidade'),
    physicalStock: decimal(payload.physicalStock ?? payload.currentStock ?? 0, 'Saldo inicial'),
    allocatedStock: 0,
    inPartnersCustodyStock: 0,
    minStock: decimal(payload.minStock ?? 0, 'Estoque mínimo'),
    unitCostPrice: decimal(payload.unitCostPrice ?? payload.costPrice ?? 0, 'Custo'),
    supplier: text(payload.supplier, 'Fornecedor', 120, false),
    location: text(payload.location, 'Localização', 80, false),
    lastRestocked: new Date().toISOString().split('T')[0],
    isDemo: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await inventoryRepository.saveItem(newItem);
  if (newItem.physicalStock > 0) await inventoryRepository.saveMovement({ id: crypto.randomUUID(),
    movementNumber: await sequenceService.nextMovementNumber(), itemId: newItem.id, type: 'entrada_compra',
    quantity: newItem.physicalStock, unit: newItem.unit, date: newItem.lastRestocked,
    reason: 'Saldo inicial informado no cadastro', operatorId: actor.id, operatorName: actor.fullName,
    isDemo: false, createdAt: newItem.createdAt });

  await auditService.log({
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
}));

// Listar movimentações
inventoryRouter.get('/movements', async (_req: RequestWithUser, res: Response) => {
  const allMovements = await inventoryRepository.findAllMovements();
  res.json(allMovements);
});

// Registrar movimentação de estoque por evento compensatório (Regra B.3.5)
inventoryRouter.post('/movements', requirePermission('inventory:create_movement'), atomic(async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const { itemId, productionOrderId, type, quantity, reason, referenceDoc } = req.body || {};
  const movementReason = text(reason, 'Motivo', 1000, false);
  const reference = text(referenceDoc, 'Documento de referência', 80, false) || undefined;

  const requestedItemId = text(itemId, 'Item', 36).toLowerCase();
  const orderId = text(productionOrderId, 'Ordem de produção', 36, false).toLowerCase() || undefined;
  oneOf(type, ['entrada_compra', 'saida_corte', 'remessa_parceiro', 'retorno_parceiro', 'perda_tecnica', 'ajuste_inventario'], 'Tipo de movimentação');
  const qty = decimal(quantity, 'Quantidade', type === 'ajuste_inventario' ? -99999999.99 : 0);
  if (qty === 0) throw new InputError('Quantidade não pode ser zero.');
  if (type === 'ajuste_inventario') {
    if (!['admin', 'pcp_producao'].includes(actor.role)) return res.status(403).json({ error: 'Sem permissão para ajuste.' });
    text(reason, 'Motivo do ajuste', 1000);
  }
  const key = req.get('idempotency-key');
  if (!key && !isLocalDemoEnvironment()) throw new InputError('Chave de repetição obrigatória.');
  if (key && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) throw new InputError('Chave de repetição inválida.');
  const hash = key ? crypto.createHash('sha256').update(`inventory:${actor.id}:${key.toLowerCase()}`).digest('hex') : undefined;
  const movementId = hash ? `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}` : crypto.randomUUID();
  const existing = await inventoryRepository.findMovementById(movementId);
  if (existing) {
    if (existing.itemId !== requestedItemId || existing.type !== type || existing.quantity !== qty ||
        existing.productionOrderId !== orderId || existing.reason !== (movementReason || 'Movimentação operacional') || existing.referenceDoc !== reference) {
      return res.status(409).json({ error: 'Chave de repetição já usada para outra movimentação.' });
    }
    const item = await inventoryRepository.findItemById(existing.itemId);
    if (!item) throw new Error('Item da movimentação indisponível.');
    return res.json({ success: true, replayed: true, movement: existing, item });
  }
  const item = await inventoryRepository.findItemById(requestedItemId);
  if (!item) return res.status(404).json({ error: 'Item de estoque não encontrado' });

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
      if (qty > item.physicalStock) throw new InputError('Perda superior ao saldo físico.');
      item.physicalStock -= qty;
      break;
    case 'ajuste_inventario':
      if (!['admin', 'pcp_producao'].includes(actor.role)) return res.status(403).json({ error: 'Sem permissão para ajuste.' });
      text(reason, 'Motivo do ajuste', 1000);
      if (item.physicalStock + qty < 0) throw new InputError('Ajuste resultaria em saldo negativo.');
      item.physicalStock += qty; // Evento compensatório: quantidade é o delta assinado.
      break;
    default:
      return res.status(400).json({ error: 'Tipo de movimentação inválido' });
  }

  item.physicalStock = storedBalance(item.physicalStock, 'Saldo físico');
  item.allocatedStock = storedBalance(item.allocatedStock, 'Saldo alocado');
  item.inPartnersCustodyStock = storedBalance(item.inPartnersCustodyStock, 'Saldo em terceiros');
  item.updatedAt = new Date().toISOString();
  await inventoryRepository.saveItem(item);

  const movementNumber = await sequenceService.nextMovementNumber();
  const movement: StockMovementEntity = {
    id: movementId,
    movementNumber,
    itemId: item.id,
    productionOrderId: orderId,
    type,
    quantity: qty,
    unit: item.unit,
    date: new Date().toISOString().split('T')[0],
    reason: movementReason || 'Movimentação operacional',
    referenceDoc: reference,
    operatorId: actor.id,
    operatorName: actor.fullName,
    isDemo: item.isDemo,
    createdAt: new Date().toISOString(),
  };

  await inventoryRepository.saveMovement(movement);

  await auditService.log({
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
}));

inventoryRouter.put('/items/:id', requirePermission('inventory:manage_items'), atomic(async (req: RequestWithUser, res: Response) => {
  const item = await inventoryRepository.findItemById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item não encontrado.' });
  const body = req.body || {};
  item.name = text(body.name, 'Nome', 150);
  item.category = oneOf(body.category, ['tecido', 'aviamento', 'insumo_personalizacao', 'pronta_entrega'], 'Categoria');
  if (body.unit !== item.unit) throw new InputError('Unidade de item cadastrado não pode ser alterada.');
  item.minStock = decimal(body.minStock, 'Estoque mínimo');
  item.unitCostPrice = decimal(body.unitCostPrice ?? body.costPrice, 'Custo');
  item.supplier = text(body.supplier, 'Fornecedor', 120, false);
  item.location = text(body.location, 'Localização', 80, false);
  if (body.currentStock !== undefined && body.currentStock !== item.physicalStock) {
    const target = decimal(body.currentStock, 'Saldo desejado');
    if (body.expectedPhysicalStock !== item.physicalStock) return res.status(409).json({ error: 'Estoque foi alterado por outra operação. Atualize a tela.' });
    const reason = text(body.adjustmentReason, 'Motivo do ajuste', 1000);
    await inventoryRepository.saveMovement({ id: crypto.randomUUID(), movementNumber: await sequenceService.nextMovementNumber(),
      itemId: item.id, type: 'ajuste_inventario', quantity: money(target - item.physicalStock), unit: item.unit,
      date: new Date().toISOString().slice(0, 10), reason, operatorId: req.user!.id, operatorName: req.user!.fullName,
      isDemo: item.isDemo, createdAt: new Date().toISOString() });
    item.physicalStock = target;
  }
  item.updatedAt = new Date().toISOString();
  await inventoryRepository.saveItem(item);
  await auditService.log({ actorId: req.user!.id, actorName: req.user!.fullName, actorRole: req.user!.role,
    entityName: 'estoque.items', entityId: item.id, action: 'UPDATE_ITEM' });
  res.json(item);
}));
inventoryRouter.delete('/items/:id', requirePermission('inventory:manage_items'), atomic(async (req: RequestWithUser, res: Response) => {
  const item = await inventoryRepository.findItemById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item não encontrado.' });
  if (item.physicalStock || item.allocatedStock || item.inPartnersCustodyStock || (await inventoryRepository.findAllMovements()).some((m) => m.itemId === item.id)) {
    return res.status(409).json({ error: 'Item com saldo ou histórico não pode ser excluído.' });
  }
  await inventoryRepository.deleteItem(item.id);
  await auditService.log({ actorId: req.user!.id, actorName: req.user!.fullName, actorRole: req.user!.role,
    entityName: 'estoque.items', entityId: item.id, action: 'DELETE_ITEM' });
  res.json({ success: true });
}));
