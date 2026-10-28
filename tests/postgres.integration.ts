import 'express-async-errors';
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { pool, db as drizzle } from '../server/db/index';
import { db as manager } from '../server/db/connection';
import { authMiddleware } from '../server/auth/rbac';
import { sessionStore } from '../server/auth/sessionStore';
import { clientsRouter } from '../server/routes/clientsRoutes';
import { quotesRouter } from '../server/routes/quotesRoutes';
import { ordersRouter } from '../server/routes/ordersRoutes';
import { financeRouter } from '../server/routes/financeRoutes';
import { inventoryRouter } from '../server/routes/inventoryRoutes';
import type { Server } from 'node:http';

// Este runner só deve apontar para um banco descartável criado para a suíte.
assert.ok(process.env.DATABASE_URL?.includes('/defardas_test'), 'Use um banco isolado chamado defardas_test.');
let server: Server;
let base: string;
let headers: Record<string, string>;
let clientId: string;
let quoteId: string;
let orders: any[];
let titles: any[];
const item = (model: string, quantity: number, material = 10) => ({ modelName: model, category: 'polos', fabricName: 'Tecido de teste', fabricColor: 'Azul',
  sizes: { pp: 0, p: quantity, m: 0, g: 0, gg: 0, xg: 0, exg: 0, sobMedida: 0 }, totalQuantity: quantity,
  materialUnitCost: material, outsourcedSewingUnitCost: 5, customizationUnitCost: 1, freightUnitCost: 1,
  technicalLossPercentage: 0, markupPercentage: 50 });
async function request(path: string, method = 'GET', body?: any) {
  const response = await fetch(base + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
}
async function createQuote() {
  const response = await request('/api/quotes', 'POST', { clientId, validUntil: '2027-01-01', productionLeadDays: 10,
    commercialStatus: 'aprovado', items: [item('Modelo A', 2), item('Modelo B', 3, 20)] });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data;
}
before(async () => {
  await manager.ready;
  await migrate(drizzle, { migrationsFolder: 'drizzle' });
  const userId = crypto.randomUUID();
  await pool.query(`INSERT INTO core.users (id,full_name,email,password_hash,role,is_active) VALUES ($1,'Integration Admin',$2,'not-a-login-hash','admin',true)`, [userId, `${userId}@example.invalid`]);
  const session = await sessionStore.createSession({ id: userId, fullName: 'Integration Admin', email: `${userId}@example.invalid`, role: 'admin' });
  headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` };
  const app = express(); app.use(express.json()); app.use(cookieParser()); app.use('/api', authMiddleware);
  app.use('/api/clients', clientsRouter); app.use('/api/quotes', quotesRouter); app.use('/api/orders', ordersRouter);
  app.use('/api/finance', financeRouter); app.use('/api/inventory', inventoryRouter);
  app.use((err: any, _req: any, res: any, _next: any) => { res.status(err.status || 500).json({ error: err.message }); });
  server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.on('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  const client = await request('/api/clients', 'POST', { companyName: 'Empresa Teste', tradeName: 'Teste', cnpj: crypto.randomUUID().slice(0, 18),
    contactName: 'Comprador Teste', phone: '0000000000', city: '', state: '', address: '', email: '', segment: '' });
  assert.equal(client.status, 201, JSON.stringify(client.data)); clientId = client.data.id;
});
after(async () => { server?.closeAllConnections(); server?.close(); await pool.end(); });

test('PostgreSQL: proposta grava decomposição de custos e dois itens sem somar material duas vezes', async () => {
  const quote = await createQuote(); quoteId = quote.id;
  const loaded = await request(`/api/quotes/${quoteId}`);
  assert.equal(loaded.data.items.length, 2);
  assert.equal(loaded.data.items.find((i: any) => i.modelName === 'Modelo A').materialUnitCost, 10);
  assert.equal(loaded.data.items.find((i: any) => i.modelName === 'Modelo A').technicalLossPercentage, 0);
});
test('PostgreSQL: conversões concorrentes criam uma OP por item e apenas dois títulos', async () => {
  const responses = await Promise.all(Array.from({ length: 8 }, () => request(`/api/quotes/${quoteId}/convert-to-order`, 'POST')));
  assert.equal(responses.filter((response) => response.status === 201).length, 1, JSON.stringify(responses));
  assert.equal(responses.filter((response) => response.status === 200).length, 7);
  const result = await pool.query('SELECT * FROM producao.production_orders WHERE quote_id = $1 ORDER BY item_title', [quoteId]);
  orders = result.rows;
  assert.equal(orders.length, 2); assert.deepEqual(orders.map((o) => o.total_pieces), [2, 3]);
  titles = (await pool.query('SELECT * FROM financeiro.transactions WHERE quote_id = $1', [quoteId])).rows;
  assert.equal(titles.length, 2);
  assert.equal(new Set(responses.map((response) => response.data.orders.map((o: any) => o.id).sort().join(','))).size, 1);
  assert.equal((await request(`/api/quotes/${quoteId}`)).data.commercialStatus, 'convertido_em_pedido');
});
test('PostgreSQL: falta de arte ou sinal bloqueia gate inclusive via SQL direto', async () => {
  assert.equal((await request(`/api/orders/${orders[0].id}/advance-stage`, 'POST', { targetStage: 'corte' })).status, 422);
  await assert.rejects(pool.query("UPDATE producao.production_orders SET stage='corte' WHERE id=$1", [orders[0].id]), /orders_gate/);
});
test('PostgreSQL: baixa do sinal é idempotente e confirma todas as OPs, sem avançar corte', async () => {
  const entry = titles.find((title) => title.sub_type === 'entrada_pedido');
  const payload = { receiptVoucherNumber: 'TEST-ENTRY', receiptEvidenceUrl: 'https://private.example.invalid/evidence', confirmationNotes: 'Integration test' };
  const responses = await Promise.all(Array.from({ length: 4 }, () => request(`/api/finance/transactions/${entry.id}/confirm-payment`, 'POST', payload)));
  assert.ok(responses.every((response) => response.status === 200), JSON.stringify(responses));
  const stored = (await pool.query('SELECT * FROM producao.production_orders WHERE quote_id=$1', [quoteId])).rows;
  assert.ok(stored.every((order) => order.entry_payment_confirmed && order.stage === 'aguardando_liberacao'));
  assert.equal((await request(`/api/orders/${orders[0].id}/approve-art`, 'POST', { approverName: 'Comprador Teste' })).status, 200);
  assert.equal((await request(`/api/orders/${orders[0].id}/advance-stage`, 'POST', { targetStage: 'corte' })).status, 200);
});
test('PostgreSQL: liquidação do saldo marca todas as OPs como quitadas', async () => {
  const balance = titles.find((title) => title.sub_type === 'saldo_entrega');
  assert.equal((await request(`/api/finance/transactions/${balance.id}/confirm-payment`, 'POST', {
    receiptVoucherNumber: 'TEST-BALANCE', receiptEvidenceUrl: 'https://private.example.invalid/balance' })).status, 200);
  assert.ok((await pool.query('SELECT financial_status FROM producao.production_orders WHERE quote_id=$1', [quoteId])).rows.every((row) => row.financial_status === 'quitado'));
});
test('PostgreSQL: falha no segundo título desfaz OPs, primeiro título e alteração da proposta', async () => {
  const quote = await createQuote();
  await pool.query(`CREATE OR REPLACE FUNCTION core.test_fail_balance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.sub_type='saldo_entrega' AND NEW.quote_id='${quote.id}'::uuid THEN RAISE EXCEPTION 'Injected second title failure'; END IF; RETURN NEW; END $$`);
  await pool.query('CREATE TRIGGER test_fail_balance BEFORE INSERT ON financeiro.transactions FOR EACH ROW EXECUTE FUNCTION core.test_fail_balance()');
  try {
    assert.equal((await request(`/api/quotes/${quote.id}/convert-to-order`, 'POST')).status, 500);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM producao.production_orders WHERE quote_id=$1', [quote.id])).rows[0].count, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM financeiro.transactions WHERE quote_id=$1', [quote.id])).rows[0].count, 0);
    assert.equal((await request(`/api/quotes/${quote.id}`)).data.commercialStatus, 'aprovado');
  } finally { await pool.query('DROP TRIGGER test_fail_balance ON financeiro.transactions'); await pool.query('DROP FUNCTION core.test_fail_balance()'); }
  assert.equal((await request(`/api/quotes/${quote.id}/convert-to-order`, 'POST')).status, 201);
});
test('PostgreSQL: estoque concorrente não permite remessas acima do saldo e registra eventos', async () => {
  const itemResponse = await request('/api/inventory/items', 'POST', { name: 'Tecido teste', category: 'tecido', unit: 'metros', physicalStock: 100, minStock: 0, unitCostPrice: 0 });
  assert.equal(itemResponse.status, 201, JSON.stringify(itemResponse.data));
  const id = itemResponse.data.id;
  const responses = await Promise.all([1, 2].map(() => request('/api/inventory/movements', 'POST', { itemId: id, type: 'remessa_parceiro', quantity: 60, reason: 'Teste' })));
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 400]);
  const stored = (await pool.query('SELECT * FROM estoque.items WHERE id=$1', [id])).rows[0];
  assert.equal(Number(stored.physical_stock), 40); assert.equal(Number(stored.in_partners_custody_stock), 60);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM estoque.movements WHERE item_id=$1', [id])).rows[0].count, 2);
});
test('PostgreSQL: eventos auditados sobrevivem a nova conexão', async () => {
  const result = await pool.query("SELECT * FROM core.audit_logs WHERE entity_id=$1 AND action='CONVERT_QUOTE_TO_ORDER'", [quoteId]);
  assert.equal(result.rowCount, 1);
  assert.equal(result.rows[0].new_data.orderIds.length, 2);
});
