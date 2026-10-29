import 'express-async-errors';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import express from 'express';
import crypto from 'node:crypto';
import { inventoryRouter } from '../server/routes/inventoryRoutes';
import { inventoryRepository } from '../server/repositories/inventoryRepository';
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
async function request(path: string, body: any, method = 'POST') {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
