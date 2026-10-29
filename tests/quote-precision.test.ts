import 'express-async-errors';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import express from 'express';
import crypto from 'node:crypto';
import { quotesRouter } from '../server/routes/quotesRoutes';
import { apiErrorHandler } from '../server/middleware/apiErrorHandler';
import { db } from '../server/db/connection';
import { sequenceService } from '../server/services/sequenceService';
await db.ready;
const clientId = crypto.randomUUID();
db.clients.set(clientId, { id: clientId, companyName: 'Test', cnpj: 'TEST' } as any);
const app = express(); app.use(express.json());
app.use((req: any, _res, next) => { req.user = { id: crypto.randomUUID(), fullName: 'Test', role: 'admin' }; next(); });
app.use('/quotes', quotesRouter); app.use(apiErrorHandler);
const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.on('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
after(() => { server.closeAllConnections(); server.close(); });
const item = () => ({ category: 'polos', modelName: 'Test', fabricName: 'Test', fabricColor: 'Test', sizes: { p: 2 }, totalQuantity: 2,
  materialUnitCost: 1.25, outsourcedSewingUnitCost: 0.35, customizationUnitCost: 0.15, freightUnitCost: 0.25,
  technicalLossPercentage: 2.5, markupPercentage: 25.5 });
const input = (items: any[] = [item()]) => ({ clientId, items, validUntil: '2027-01-01', productionLeadDays: 10 });
async function create(body?: any) {
  const response = await fetch(base + '/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
}
test('proposta rejeita precisão/overflow de entrada, derivação e somatório antes de consumir número', async () => {
  const before = structuredClone(db.quotes);
  const invalid: any[] = [undefined, input([null])];
  for (const field of ['materialUnitCost', 'outsourcedSewingUnitCost', 'customizationUnitCost', 'freightUnitCost']) {
    for (const value of [1.005, 100000000, -1, '1.25']) invalid.push(input([{ ...item(), [field]: value }]));
  }
  for (const update of [{ technicalLossPercentage: 1000 }, { technicalLossPercentage: 2.555 }, { markupPercentage: 10000 },
    { markupPercentage: 25.555 }, { negotiatedUnitPrice: 1.005 }, { negotiatedUnitPrice: 100000000 },
    { materialUnitCost: 99999999.99 }, // base/markup calculados excedem numeric(10,2)
    { sizes: { p: 2147483648 }, totalQuantity: 2147483648 },
    { materialUnitCost: 99999999, outsourcedSewingUnitCost: 0, customizationUnitCost: 0, freightUnitCost: 0,
      technicalLossPercentage: 0, markupPercentage: 0, sizes: { p: 101 }, totalQuantity: 101 },
    { materialUnitCost: 1000, negotiatedUnitPrice: 0.01 }]) invalid.push(input([{ ...item(), ...update }]));
  const large = { ...item(), materialUnitCost: 60000000, outsourcedSewingUnitCost: 0, customizationUnitCost: 0, freightUnitCost: 0,
    technicalLossPercentage: 0, markupPercentage: 0, sizes: { p: 100 }, totalQuantity: 100 };
  invalid.push(input([large, large])); // itens válidos isolados, total excede numeric(12,2)
  const original = sequenceService.nextQuoteNumber; let counterCalls = 0;
  try {
    sequenceService.nextQuoteNumber = async () => { counterCalls++; throw new Error('Invalid quote must not allocate number'); };
    for (const body of invalid) assert.equal((await create(body)).status, 400, JSON.stringify(body));
  } finally { sequenceService.nextQuoteNumber = original; }
  assert.equal(counterCalls, 0); assert.deepEqual(db.quotes, before);
});
test('proposta conserva decomposição decimal e markup; margem negativa representável continua permitida', async () => {
  const created = await create(input()); assert.equal(created.status, 201);
  assert.equal(created.data.items[0].materialUnitCost, 1.25);
  assert.equal(created.data.items[0].calculatedBaseUnitCost, 2.05);
  assert.equal(created.data.items[0].suggestedUnitPrice, 2.57);
  assert.equal(created.data.negotiatedTotalAmount, 5.14); assert.equal(created.data.totalBaseCost, 4.1);
  const below = await create(input([{ ...item(), materialUnitCost: 2, outsourcedSewingUnitCost: 0, customizationUnitCost: 0,
    freightUnitCost: 0, technicalLossPercentage: 0, markupPercentage: 0, negotiatedUnitPrice: 1.5 }]));
  assert.equal(below.status, 201); assert.equal(below.data.estimatedMarginPercentage, -33.33);
});
