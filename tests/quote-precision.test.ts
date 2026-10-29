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

test('prazo/data inválidos são rejeitados antes do número e conversão histórica não grava parcialmente', async () => {
  const before = structuredClone(db.quotes); const original = sequenceService.nextQuoteNumber; let counterCalls = 0;
  try {
    sequenceService.nextQuoteNumber = async () => { counterCalls++; throw new Error('Invalid header must not allocate'); };
    for (const update of [{ productionLeadDays: 2147483648 }, { productionLeadDays: 2147483647 }, { productionLeadDays: 1.5 },
      { productionLeadDays: 0 }, { date: '0000-01-01' }, { date: '' }, { validUntil: '0000-01-01' }]) {
      assert.equal((await create({ ...input(), ...update })).status, 400);
    }
  } finally { sequenceService.nextQuoteNumber = original; }
  assert.equal(counterCalls, 0); assert.deepEqual(db.quotes, before);
  const saved = await create({ ...input(), commercialStatus: 'aprovado' }); assert.equal(saved.status, 201);
  const id = saved.data.id; db.quotes.get(id)!.productionLeadDays = 2147483647; // Historical invalid fixture.
  const orders = structuredClone(db.orders); const titles = structuredClone(db.finance); const quote = structuredClone(db.quotes.get(id));
  const response = await fetch(`${base}/quotes/${id}/convert-to-order`, { method: 'POST' });
  assert.equal(response.status, 400); assert.deepEqual(db.orders, orders); assert.deepEqual(db.finance, titles);
  assert.deepEqual(db.quotes.get(id), quote);
});

const convert = (id: string) => fetch(`${base}/quotes/${id}/convert-to-order`, { method: 'POST' });
test('conversão não cria títulos zero e mantém arredondamento existente nas parcelas positivas', async () => {
  for (const amount of [0, 0.01, 0.02, 0.03]) {
    const saved = await create({ ...input([{ ...item(), materialUnitCost: amount, outsourcedSewingUnitCost: 0, customizationUnitCost: 0,
      freightUnitCost: 0, technicalLossPercentage: 0, markupPercentage: 0, sizes: { p: 1 }, totalQuantity: 1 }]), commercialStatus: 'aprovado' });
    assert.equal(saved.status, 201); const orders = structuredClone(db.orders); const titles = structuredClone(db.finance);
    const response = await convert(saved.data.id); const result = await response.json();
    if (amount < 0.02) {
      assert.equal(response.status, 409); assert.equal(result.code, 'QUOTE_FINANCIAL_CONFLICT');
      assert.deepEqual(db.orders, orders); assert.deepEqual(db.finance, titles);
      assert.equal(db.quotes.get(saved.data.id)!.commercialStatus, 'aprovado');
    } else {
      assert.equal(response.status, 201); assert.equal(result.financeTransactions.length, 2);
      assert.ok(result.financeTransactions.every((title: any) => title.amount > 0));
      assert.equal(Math.round(result.financeTransactions.reduce((sum: number, title: any) => sum + title.amount, 0) * 100), Math.round(amount * 100));
      assert.equal((await convert(saved.data.id)).status, 200);
    }
  }
});

test('conversão recusa divergência histórica de percentual/parcelas/itens antes de reservar número', async () => {
  const saved = await create({ ...input(), commercialStatus: 'aprovado' }); assert.equal(saved.status, 201);
  const id = saved.data.id; const originalQuote = structuredClone(db.quotes.get(id)!);
  const orderNumber = sequenceService.nextOrderNumber; const financeNumber = sequenceService.nextFinanceNumber; let calls = 0;
  try {
    sequenceService.nextOrderNumber = sequenceService.nextFinanceNumber = async () => { calls++; throw new Error('Invalid conversion must not allocate'); };
    for (const update of [{ entryPercentage: 45 }, { entryAmount: originalQuote.entryAmount + 1 }, { balanceAmount: 0 },
      { negotiatedTotalAmount: originalQuote.negotiatedTotalAmount + 1 },
      { items: originalQuote.items.map((item) => ({ ...item, totalItemPrice: item.totalItemPrice + 1 })) }]) {
      db.quotes.set(id, { ...structuredClone(originalQuote), ...update });
      const before = structuredClone(db.quotes.get(id));
      const response = await convert(id); assert.equal(response.status, 409);
      assert.deepEqual(db.quotes.get(id), before);
    }
  } finally { sequenceService.nextOrderNumber = orderNumber; sequenceService.nextFinanceNumber = financeNumber; }
  assert.equal(calls, 0);
});

test('replay recusa conversão parcial/divergente sem recriar vínculos e conserva título já pago', async () => {
  const created = await create({ ...input(), commercialStatus: 'aprovado' }); assert.equal(created.status, 201);
  const first = await convert(created.data.id); assert.equal(first.status, 201); const result = await first.json();
  const id = created.data.id; const quote = structuredClone(db.quotes.get(id)!);
  const orders = structuredClone(result.orders); const titles = structuredClone(result.financeTransactions);
  const reset = () => {
    db.quotes.set(id, structuredClone(quote));
    for (const row of orders) db.orders.set(row.id, structuredClone(row));
    for (const row of titles) db.finance.set(row.id, structuredClone(row));
  };
  const originalOrderNumber = sequenceService.nextOrderNumber; const originalFinanceNumber = sequenceService.nextFinanceNumber; let calls = 0;
  try {
    sequenceService.nextOrderNumber = sequenceService.nextFinanceNumber = async () => { calls++; throw new Error('Replay must not allocate'); };
    for (const mutate of [
      () => db.orders.delete(orders[0].id), () => db.finance.delete(titles[0].id),
      () => { db.quotes.get(id)!.commercialStatus = 'aprovado'; },
      () => { db.quotes.get(id)!.convertedOrderId = crypto.randomUUID(); },
      () => { db.orders.get(orders[0].id)!.quoteItemId = undefined; },
      () => { db.orders.get(orders[0].id)!.quoteVersion++; },
      () => { db.finance.get(titles[0].id)!.amount++; },
      () => { db.finance.get(titles[0].id)!.productionOrderId = undefined; },
      () => { db.finance.get(titles[0].id)!.amount = Infinity; db.quotes.get(id)!.entryAmount = Infinity; },
    ]) {
      reset(); mutate(); const before = structuredClone([db.quotes, db.orders, db.finance]);
      const response = await convert(id); assert.equal(response.status, 409);
      assert.equal((await response.json()).code, 'QUOTE_CONVERSION_INCOMPLETE');
      assert.deepEqual([db.quotes, db.orders, db.finance], before);
    }
    reset(); db.finance.get(titles[0].id)!.status = 'pago';
    const before = structuredClone([db.quotes, db.orders, db.finance]);
    const replay = await convert(id); assert.equal(replay.status, 200); const data = await replay.json();
    assert.equal(data.alreadyConverted, true); assert.equal(data.order.id, quote.convertedOrderId); assert.equal(data.financeTransactions.find((row: any) => row.id === titles[0].id).status, 'pago');
    assert.deepEqual([db.quotes, db.orders, db.finance], before); assert.equal(calls, 0);
  } finally { sequenceService.nextOrderNumber = originalOrderNumber; sequenceService.nextFinanceNumber = originalFinanceNumber; }
});
