import 'express-async-errors';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import express from 'express';
import crypto from 'node:crypto';
import { inventoryRouter } from '../server/routes/inventoryRoutes';
import { inventoryRepository } from '../server/repositories/inventoryRepository';
import { auditService } from '../server/services/auditService';
import { sequenceService } from '../server/services/sequenceService';
import { db } from '../server/db/connection';
await db.ready;
const actorId = crypto.randomUUID();
const app = express(); app.use(express.json());
// Authentication fixture at router boundary.
app.use((req: any, _res, next) => { req.user = { id: actorId, fullName: 'Test Admin', role: 'admin' }; next(); });
app.use('/inventory', inventoryRouter);
app.use((error: any, _req: any, res: any, _next: any) => res.status(error.code === '23505' ? 409 : error.status || 500).json({ error: error.message }));
const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.on('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}/inventory`;
after(() => { server.closeAllConnections(); server.close(); });
const item = () => ({ name: 'Precision item', category: 'tecido', unit: 'metros', physicalStock: 0.1, minStock: 0, unitCostPrice: 1.25 });
async function request(path: string, body: any, method = 'POST', key?: string) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}

test('estoque mantém precisão SQL e não inventa fornecedor/local; rejeita arredondamento de entrada', async () => {
  const created = await request('/items', item()); assert.equal(created.status, 201);
  assert.equal(created.data.supplier, ''); assert.equal(created.data.location, '');
  const moved = await request('/movements', { itemId: created.data.id, type: 'entrada_compra', quantity: 0.2 });
  assert.equal(moved.status, 201); assert.equal(moved.data.item.physicalStock, 0.3);
  assert.equal(moved.data.movement.quantity, 0.2); assert.equal(moved.data.movement.operatorId, actorId);
  for (const update of [{ physicalStock: 0.001 }, { unitCostPrice: 0.001 }, { minStock: 0.001 },
    { physicalStock: 100000000 }, { supplier: {} }, { supplier: 'x'.repeat(121) }, { location: 'x'.repeat(81) }]) {
    assert.equal((await request('/items', { ...item(), ...update })).status, 400);
  }
  assert.equal((await request('/movements', { itemId: created.data.id, type: 'entrada_compra', quantity: 0.001 })).status, 400);
  assert.equal((await inventoryRepository.findItemById(created.data.id))?.physicalStock, 0.3);
  assert.equal((await request(`/items/${created.data.id}`, { ...item(), currentStock: 0.301, expectedPhysicalStock: 0.3, adjustmentReason: 'Test' }, 'PUT')).status, 400);
  const maximum = await request('/items', { ...item(), physicalStock: 99999999.99 });
  assert.equal(maximum.status, 201);
  assert.equal((await request('/movements', { itemId: maximum.data.id, type: 'entrada_compra', quantity: 0.01 })).status, 400);
  assert.equal((await inventoryRepository.findItemById(maximum.data.id))?.physicalStock, 99999999.99);
});

test('conflito de número do movimento reverte saldo e não substitui histórico', async () => {
  const created = await request('/items', item()); assert.equal(created.status, 201);
  const previous = (await inventoryRepository.findAllMovements()).find((movement) => movement.itemId === created.data.id)!;
  const original = sequenceService.nextMovementNumber;
  sequenceService.nextMovementNumber = async () => previous.movementNumber;
  try {
    const result = await request('/movements', { itemId: created.data.id, type: 'entrada_compra', quantity: 1 });
    assert.equal(result.status, 409);
  } finally { sequenceService.nextMovementNumber = original; }
  assert.equal((await inventoryRepository.findItemById(created.data.id))?.physicalStock, 0.1);
  assert.equal((await inventoryRepository.findAllMovements()).filter((movement) => movement.itemId === created.data.id).length, 1);
});

test('reenvios concorrentes da mesma chave movimentam uma vez e conflito não altera saldo', async () => {
  const created = await request('/items', { ...item(), physicalStock: 0 });
  const key = crypto.randomUUID(); const payload = { itemId: created.data.id, type: 'entrada_compra', quantity: 3, referenceDoc: 'Test' };
  const results = await Promise.all(Array.from({ length: 8 }, () => request('/movements', payload, 'POST', key)));
  assert.equal(results.filter((result) => result.status === 201).length, 1);
  assert.equal(results.filter((result) => result.status === 200).length, 7);
  assert.equal(new Set(results.map((result) => result.data.movement.id)).size, 1);
  assert.equal((await inventoryRepository.findItemById(created.data.id))?.physicalStock, 3);
  assert.equal((await request('/movements', { ...payload, quantity: 4 }, 'POST', key)).status, 409);
  assert.equal((await request('/movements', { ...payload, referenceDoc: 'Changed' }, 'POST', key)).status, 409);
  assert.equal((await inventoryRepository.findAllMovements()).filter((movement) => movement.itemId === created.data.id).length, 1);
});

test('falha de auditoria não consome chave; retry confirma uma única movimentação', async () => {
  const created = await request('/items', { ...item(), physicalStock: 0 });
  const key = crypto.randomUUID(); const payload = { itemId: created.data.id, type: 'entrada_compra', quantity: 2 };
  const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Injected idempotent inventory failure'); };
    assert.equal((await request('/movements', payload, 'POST', key)).status, 500);
  } finally { auditService.log = original; }
  assert.equal((await inventoryRepository.findItemById(created.data.id))?.physicalStock, 0);
  const saved = await request('/movements', payload, 'POST', key); assert.equal(saved.status, 201);
  assert.equal((await request('/movements', payload, 'POST', key)).status, 200);
  assert.equal((await inventoryRepository.findItemById(created.data.id))?.physicalStock, 2);
});

test('movimentação rejeita identificadores inválidos e OP ausente antes de saldo/numeração', async () => {
  const created = await request('/items', item()); assert.equal(created.status, 201);
  const before = structuredClone([db.inventory, db.movements]);
  const original = sequenceService.nextMovementNumber; let calls = 0;
  try {
    sequenceService.nextMovementNumber = async () => { calls++; throw new Error('Must not allocate'); };
    for (const [update, status] of [[{ itemId: 'invalid' }, 400], [{ productionOrderId: 'invalid' }, 400], [{ productionOrderId: crypto.randomUUID() }, 404]] as const) {
      assert.equal((await request('/movements', { itemId: created.data.id, type: 'entrada_compra', quantity: 1, ...update }, 'POST', crypto.randomUUID())).status, status);
    }
    assert.equal(calls, 0); assert.deepEqual([db.inventory, db.movements], before);
  } finally { sequenceService.nextMovementNumber = original; }
  const id = crypto.randomUUID(); db.orders.set(id, { id } as any);
  const key = crypto.randomUUID(); const payload = { itemId: created.data.id.toUpperCase(), productionOrderId: id.toUpperCase(), type: 'entrada_compra', quantity: 1 };
  const valid = await request('/movements', payload, 'POST', key); assert.equal(valid.status, 201);
  assert.equal(valid.data.movement.productionOrderId, id);
  const replay = await request('/movements', payload, 'POST', key); assert.equal(replay.status, 200);
  assert.equal(replay.data.replayed, true); assert.equal(replay.data.item.physicalStock, 1.1);
});

test('exclusão consulta somente existência de histórico e mantém rollback para item livre', async () => {
  const created = await request('/items', { ...item(), physicalStock: 0 }); assert.equal(created.status, 201);
  const id = created.data.id; const originalList = inventoryRepository.findAllMovements;
  const originalAudit = auditService.log;
  const movementId = crypto.randomUUID();
  const remove = () => fetch(`${base}/items/${id}`, { method: 'DELETE' });
  try {
    inventoryRepository.findAllMovements = async () => { throw new Error('Must not load history'); };
    db.movements.set(movementId, { id: movementId, itemId: id } as any);
    assert.equal((await remove()).status, 409); assert.ok(db.inventory.has(id)); assert.ok(db.movements.has(movementId));
    db.movements.delete(movementId);
    auditService.log = async () => { throw new Error('Injected delete failure'); };
    assert.equal((await remove()).status, 500); assert.ok(db.inventory.has(id));
    auditService.log = originalAudit;
    assert.equal((await remove()).status, 200); assert.equal(db.inventory.has(id), false);
  } finally { inventoryRepository.findAllMovements = originalList; auditService.log = originalAudit; }
});

test('ajuste com saldo esperado antigo não grava metadados nem movimento', async () => {
  const created = await request('/items', { ...item(), physicalStock: 10 }); assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal((await request('/movements', { itemId: id, type: 'entrada_compra', quantity: 2 })).status, 201);
  const before = structuredClone([db.inventory, db.movements]);
  const payload = { ...item(), name: 'Não sobrescrever', currentStock: 15, expectedPhysicalStock: 10, adjustmentReason: 'Test' };
  assert.equal((await request(`/items/${id}`, payload, 'PUT')).status, 409);
  assert.deepEqual([db.inventory, db.movements], before);
  assert.equal((await request(`/items/${id}`, { ...payload, expectedPhysicalStock: 12 }, 'PUT')).status, 200);
  assert.equal(db.inventory.get(id)?.physicalStock, 15);
});
