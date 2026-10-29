import 'express-async-errors';
import { apiErrorHandler } from '../server/middleware/apiErrorHandler';
import { manageUser } from '../server/auth/userManagementService';
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
import { settingsRouter } from '../server/routes/settingsRoutes';
import { spawnSync } from 'node:child_process';
import { leadsRouter } from '../server/routes/leadsRoutes';
import { inventoryRouter } from '../server/routes/inventoryRoutes';
import type { Server } from 'node:http';
import { PasswordResetService } from '../server/auth/passwordResetService';
import { PasswordService } from '../server/auth/passwordService';
import { authRouter } from '../server/routes/authRoutes';
import { quoteRepository } from '../server/repositories/quoteRepository';


const credentials = { original: testPassword(), updated: testPassword(), replay: testPassword(),
  concurrent: testPassword(), expired: testPassword(), inactive: testPassword(), operator: testPassword() };
function testPassword() { return `Test-${crypto.randomBytes(24).toString('base64url')}-1`; }
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
  const response = await fetch(base + path, { method, headers: { ...headers, ...(['/api/inventory/movements', '/api/finance/transactions'].includes(path) && method === 'POST' ? { 'idempotency-key': crypto.randomUUID() } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
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
  app.use('/api', settingsRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/clients', clientsRouter); app.use('/api/quotes', quotesRouter); app.use('/api/orders', ordersRouter);
  app.use('/api/leads', leadsRouter);
  app.use('/api/finance', financeRouter); app.use('/api/inventory', inventoryRouter);
  app.use(apiErrorHandler);
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

test('PostgreSQL: perfil institucional persiste e preserva capacidade zero', async () => {
  const result = await request('/api/settings/profile', 'PUT', { name: 'Empresa de Teste', tradeName: 'Marca Teste', foundedYear: 0, productionCapacityPiecesMonth: 0 });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const stored = await request('/api/public-config');
  assert.equal(stored.data.profile.name, 'Empresa de Teste');
  assert.equal(stored.data.profile.productionCapacityPiecesMonth, 0);
});
test('PostgreSQL: provisionamento CLI não mostra senha nem substitui conta existente', async () => {
  const email = `provision-${crypto.randomUUID()}@example.invalid`;
  const password = `Test-${crypto.randomUUID()}-9`;
  const options = { env: { ...process.env, ADMIN_EMAIL: email, ADMIN_NAME: 'Provision Test', ADMIN_PASSWORD: password }, encoding: 'utf8' as const, timeout: 15000 };
  const first = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/create-admin.ts'], options);
  assert.equal(first.status, 0, first.stderr);
  assert.ok(!first.stdout.includes(password));
  const user = (await pool.query('SELECT password_hash,role FROM core.users WHERE email=$1', [email])).rows[0];
  assert.equal(user.role, 'admin'); assert.ok(user.password_hash.startsWith('$2'));
  const second = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/create-admin.ts'], options);
  assert.equal(second.status, 1); assert.match(second.stderr, /já cadastrado/);
  assert.equal((await pool.query('SELECT password_hash FROM core.users WHERE email=$1', [email])).rows[0].password_hash, user.password_hash);
});

async function resetAccount() {
  const id = crypto.randomUUID(); const email = `${id}@example.invalid`;
  const hash = await PasswordService.hashPassword(credentials.original);
  await pool.query(`INSERT INTO core.users(id,full_name,email,password_hash,role,is_active)
    VALUES($1,'Reset Integration',$2,$3,'vendedor',true)`, [id, email, hash]);
  const session = await sessionStore.createSession({ id, email, fullName: 'Reset Integration', role: 'vendedor' });
  return { id, email, hash, session };
}
test('PostgreSQL: recuperação pública indisponível não confirma entrega nem emite token', async () => {
  const account = await resetAccount();
  const result = await request('/api/auth/recover-password', 'POST', { email: account.email });
  assert.equal(result.status, 503); assert.equal(result.data.devResetToken, undefined);
  assert.equal((await pool.query('SELECT * FROM core.password_reset_tokens WHERE user_id=$1', [account.id])).rowCount, 0);
});
test('PostgreSQL: token persiste como hash e pode ser consumido por outra instância', async () => {
  const account = await resetAccount(); const service = new PasswordResetService();
  const token = await service.issue(account.id);
  const stored = (await pool.query('SELECT * FROM core.password_reset_tokens WHERE user_id=$1', [account.id])).rows[0];
  assert.notEqual(stored.token_hash, token);
  assert.equal(stored.token_hash, crypto.createHash('sha256').update(token!).digest('hex'));
  assert.ok(await new PasswordResetService().reset(token!, credentials.updated));
  assert.equal(await service.reset(token!, credentials.replay), false);
  assert.equal(await sessionStore.getSession(account.session.token), null);
  assert.ok(await PasswordService.comparePassword(credentials.updated, (await pool.query('SELECT password_hash FROM core.users WHERE id=$1', [account.id])).rows[0].password_hash));
});
test('PostgreSQL: redefinições concorrentes têm um único vencedor', async () => {
  const account = await resetAccount(); const token = await new PasswordResetService().issue(account.id);
  const results = await Promise.all(Array.from({ length: 4 }, () => new PasswordResetService().reset(token!, credentials.concurrent)));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await pool.query("SELECT * FROM core.audit_logs WHERE entity_id=$1 AND action='PASSWORD_RESET_COMPLETED'", [account.id])).rowCount, 1);
});
test('PostgreSQL: token substituído, expirado ou de conta inativa é recusado', async () => {
  const account = await resetAccount(); const service = new PasswordResetService();
  const old = await service.issue(account.id); const fresh = await service.issue(account.id);
  assert.equal(await service.reset(old!, credentials.updated), false);
  await pool.query("UPDATE core.password_reset_tokens SET expires_at=NOW()-interval '1 second' WHERE user_id=$1", [account.id]);
  assert.equal(await service.reset(fresh!, credentials.updated), false);
  const active = await service.issue(account.id);
  await pool.query('UPDATE core.users SET is_active=FALSE WHERE id=$1', [account.id]);
  assert.equal(await service.issue(account.id), null);
  assert.equal(await service.reset(active!, credentials.updated), false);
  assert.equal((await pool.query('SELECT password_hash FROM core.users WHERE id=$1', [account.id])).rows[0].password_hash, account.hash);
});
test('PostgreSQL: falha na revogação desfaz senha, auditoria e consumo do token', async () => {
  const account = await resetAccount(); const service = new PasswordResetService(); const token = await service.issue(account.id);
  await pool.query(`CREATE FUNCTION core.test_fail_revoke() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF OLD.user_id='${account.id}'::uuid THEN RAISE EXCEPTION 'Injected revoke failure'; END IF; RETURN OLD; END $$`);
  await pool.query('CREATE TRIGGER test_fail_revoke BEFORE DELETE ON core.sessions FOR EACH ROW EXECUTE FUNCTION core.test_fail_revoke()');
  try {
    await assert.rejects(service.reset(token!, credentials.updated), /Injected revoke failure/);
    assert.equal((await pool.query('SELECT password_hash FROM core.users WHERE id=$1', [account.id])).rows[0].password_hash, account.hash);
    assert.ok(await sessionStore.getSession(account.session.token));
    assert.equal((await pool.query('SELECT * FROM core.password_reset_tokens WHERE user_id=$1', [account.id])).rowCount, 1);
    assert.equal((await pool.query("SELECT * FROM core.audit_logs WHERE entity_id=$1 AND action='PASSWORD_RESET_COMPLETED'", [account.id])).rowCount, 0);
  } finally {
    await pool.query('DROP TRIGGER test_fail_revoke ON core.sessions'); await pool.query('DROP FUNCTION core.test_fail_revoke()');
  }
  assert.ok(await service.reset(token!, credentials.updated));
});
test('PostgreSQL: recuperação CLI não exibe senha e revoga sessões e tokens', async () => {
  const account = await resetAccount(); const token = await new PasswordResetService().issue(account.id);
  const password = `Reset-${crypto.randomUUID()}-9`;
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/reset-user-password.ts'], {
    env: { ...process.env, RESET_USER_EMAIL: account.email, RESET_USER_PASSWORD: password }, encoding: 'utf8', timeout: 15000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes(password)); assert.ok(!result.stderr.includes(password));
  assert.equal(await sessionStore.getSession(account.session.token), null);
  assert.equal(await new PasswordResetService().reset(token!, credentials.replay), false);
  assert.ok(await PasswordService.comparePassword(password, (await pool.query('SELECT password_hash FROM core.users WHERE id=$1', [account.id])).rows[0].password_hash));
});
test('PostgreSQL: listagem de propostas agrupa itens em uma única consulta', async () => {
  const original = pool.query; let selects = 0;
  pool.query = (function (...args: any[]) {
    const sql = typeof args[0] === 'string' ? args[0] : args[0].text;
    if (/^select/i.test(sql)) selects++;
    return original.apply(pool, args as any);
  }) as typeof pool.query;
  try {
    const listed = await quoteRepository.findAll();
    const quote = listed.find((row) => row.id === quoteId)!;
    assert.equal(selects, 1); assert.equal(quote.items.length, 2);
    assert.deepEqual(quote.items.map((i) => i.modelName).sort(), ['Modelo A', 'Modelo B']);
    assert.ok(listed.every((q) => q.items.every((i) => i.quoteId === q.id)));
  } finally { pool.query = original; }
});

test('PostgreSQL: login antigo em trânsito é recusado após redefinição', async () => {
  const account = await resetAccount(); const service = new PasswordResetService();
  const original = PasswordService.comparePassword;
  let entered!: () => void; let resume!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const release = new Promise<void>((resolve) => { resume = resolve; });
  PasswordService.comparePassword = async () => { entered(); await release; return true; };
  try {
    const pending = request('/api/auth/login', 'POST', { email: account.email, password: credentials.original });
    await started;
    assert.ok(await service.resetByEmail(account.email, credentials.updated));
    resume();
    assert.equal((await pending).status, 401);
    assert.equal((await pool.query('SELECT * FROM core.sessions WHERE user_id=$1', [account.id])).rowCount, 0);
  } finally { resume(); PasswordService.comparePassword = original; }
});
test('PostgreSQL: falha de auditoria no login desfaz sessão e não emite cookie', async () => {
  const account = await resetAccount();
  await pool.query(`CREATE FUNCTION core.test_fail_login_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.actor_id='${account.id}'::uuid AND NEW.action='AUTH_LOGIN_SUCCESS' THEN RAISE EXCEPTION 'Injected login audit failure'; END IF; RETURN NEW; END $$`);
  await pool.query('CREATE TRIGGER test_fail_login_audit BEFORE INSERT ON core.audit_logs FOR EACH ROW EXECUTE FUNCTION core.test_fail_login_audit()');
  try {
    const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: account.email, password: credentials.original }) });
    assert.equal(response.status, 500); assert.equal(response.headers.get('set-cookie'), null);
    assert.equal((await pool.query('SELECT * FROM core.sessions WHERE user_id=$1', [account.id])).rowCount, 1);
  } finally {
    await pool.query('DROP TRIGGER test_fail_login_audit ON core.audit_logs'); await pool.query('DROP FUNCTION core.test_fail_login_audit()');
  }
});

// Privileged host lifecycle; all accounts and failures belong to this disposable database.
const teamCommand = (email: string) => ({ action: 'create', email, fullName: 'Team Test',
  password: testPassword(), role: 'vendedor', operator: 'Integration Operator', reason: 'Integration team lifecycle' });

test('PostgreSQL: gestão cria conta sem expor hash e altera acesso com revogação e auditoria', async () => {
  const command = teamCommand(`team-${crypto.randomUUID()}@example.invalid`);
  const account = await manageUser(command);
  assert.equal('passwordHash' in account, false);
  assert.equal('password_hash' in account, false);
  assert.ok(await PasswordService.comparePassword(command.password, (await pool.query('SELECT password_hash FROM core.users WHERE id=$1', [account.id])).rows[0].password_hash));
  await assert.rejects(manageUser({ ...command, email: command.email.toUpperCase() }), /já cadastrado/);
  const session = await sessionStore.createSession(account);
  const token = await new PasswordResetService().issue(account.id);
  const changed = await manageUser({ action: 'update', email: account.email, role: 'financeiro', isActive: false,
    operator: command.operator, reason: 'Integration revoke' });
  assert.equal(changed.role, 'financeiro'); assert.equal(changed.isActive, false);
  assert.equal(await sessionStore.getSession(session.token), null);
  assert.equal((await pool.query('SELECT * FROM core.password_reset_tokens WHERE user_id=$1', [account.id])).rowCount, 0);
  await manageUser({ action: 'update', email: account.email, isActive: true, operator: command.operator, reason: 'Integration reactivate' });
  assert.equal(await new PasswordResetService().reset(token!, command.password), false);
  const beforeRoleChange = await sessionStore.createSession(changed);
  const current = await manageUser({ action: 'update', email: account.email, role: 'pcp_producao', operator: command.operator, reason: 'Role-only change' });
  assert.equal(await sessionStore.getSession(beforeRoleChange.token), null);
  const fresh = await sessionStore.createSession(current);
  await manageUser({ action: 'update', email: account.email, isActive: true, operator: command.operator, reason: 'No-op repeat' });
  assert.ok(await sessionStore.getSession(fresh.token));
  const audits = (await pool.query("SELECT * FROM core.audit_logs WHERE entity_id=$1 AND entity_name='users' ORDER BY created_at", [account.id])).rows;
  assert.equal(audits.length, 4);
  assert.equal(audits[1].old_data.role, 'vendedor'); assert.equal(audits[1].new_data.isActive, false);
  assert.equal(audits[1].actor_name, command.operator);
  assert.ok(!JSON.stringify(audits).includes(command.password));
});

test('PostgreSQL: falha de auditoria desfaz criação e alteração com suas revogações', async () => {
  const command = teamCommand(`rollback-${crypto.randomUUID()}@example.invalid`);
  const account = await manageUser(command);
  const session = await sessionStore.createSession(account);
  await new PasswordResetService().issue(account.id);
  await pool.query(`CREATE FUNCTION core.test_fail_user_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.entity_name='users' AND NEW.notes='Injected team rollback' THEN RAISE EXCEPTION 'Injected user audit failure'; END IF; RETURN NEW; END $$`);
  await pool.query('CREATE TRIGGER test_fail_user_audit BEFORE INSERT ON core.audit_logs FOR EACH ROW EXECUTE FUNCTION core.test_fail_user_audit()');
  const failedEmail = `failed-${crypto.randomUUID()}@example.invalid`;
  try {
    await assert.rejects(manageUser({ ...command, email: failedEmail, reason: 'Injected team rollback' }), /Injected user audit failure/);
    assert.equal((await pool.query('SELECT id FROM core.users WHERE email=$1', [failedEmail])).rowCount, 0);
    await assert.rejects(manageUser({ action: 'update', email: account.email, role: 'financeiro', isActive: false,
      operator: command.operator, reason: 'Injected team rollback' }), /Injected user audit failure/);
    assert.equal((await pool.query('SELECT role,is_active FROM core.users WHERE id=$1', [account.id])).rows[0].role, 'vendedor');
    assert.equal((await pool.query('SELECT is_active FROM core.users WHERE id=$1', [account.id])).rows[0].is_active, true);
    assert.ok(await sessionStore.getSession(session.token));
    assert.equal((await pool.query('SELECT * FROM core.password_reset_tokens WHERE user_id=$1', [account.id])).rowCount, 1);
  } finally { await pool.query('DROP TRIGGER test_fail_user_audit ON core.audit_logs'); await pool.query('DROP FUNCTION core.test_fail_user_audit()'); }
});

test('PostgreSQL: alterações concorrentes preservam o último administrador ativo', async () => {
  const originals = (await pool.query("SELECT id FROM core.users WHERE role='admin' AND is_active=true")).rows.map((row) => row.id);
  const first = await manageUser({ ...teamCommand(`admin-a-${crypto.randomUUID()}@example.invalid`), role: 'admin' });
  const second = await manageUser({ ...teamCommand(`admin-b-${crypto.randomUUID()}@example.invalid`), role: 'admin' });
  try {
    await pool.query('UPDATE core.users SET is_active=false WHERE id=ANY($1::uuid[])', [originals]);
    const result = await Promise.allSettled([first, second].map((account) => manageUser({ action: 'update', email: account.email,
      isActive: false, operator: 'Integration Operator', reason: 'Concurrent admin deactivate' })));
    assert.equal(result.filter((entry) => entry.status === 'fulfilled').length, 1);
    assert.equal((await pool.query("SELECT id FROM core.users WHERE role='admin' AND is_active=true")).rowCount, 1);
    const active = (await pool.query("SELECT email FROM core.users WHERE role='admin' AND is_active=true")).rows[0];
    await assert.rejects(manageUser({ action: 'update', email: active.email, role: 'vendedor',
      operator: 'Integration Operator', reason: 'Last admin demotion' }), /último administrador/);
  } finally {
    await pool.query('UPDATE core.users SET is_active=true WHERE id=ANY($1::uuid[])', [originals]);
    await pool.query('UPDATE core.users SET is_active=false WHERE id=ANY($1::uuid[])', [[first.id, second.id]]);
  }
});

test('PostgreSQL: CLI de equipe cria conta sem imprimir credenciais e rejeita ativação ambígua', async () => {
  const command = teamCommand(`cli-team-${crypto.randomUUID()}@example.invalid`);
  const env: NodeJS.ProcessEnv = { ...process.env, ERP_USER_ACTION: 'create', ERP_USER_EMAIL: command.email, ERP_USER_NAME: command.fullName,
    ERP_USER_PASSWORD: command.password, ERP_USER_ROLE: 'pcp_producao', ERP_USER_OPERATOR: command.operator,
    ERP_USER_REASON: command.reason };
  delete env.ERP_USER_ACTIVE;
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/manage-user.ts'], { env, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes(command.password)); assert.ok(!result.stderr.includes(command.password));
  assert.equal((await pool.query('SELECT role FROM core.users WHERE email=$1', [command.email])).rows[0].role, 'pcp_producao');
  const invalid = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/manage-user.ts'], {
    env: { ...env, ERP_USER_ACTIVE: 'yes' }, encoding: 'utf8', timeout: 15000 });
  assert.equal(invalid.status, 1); assert.match(invalid.stderr, /true ou false/);
  delete env.ERP_USER_PASSWORD; delete env.ERP_USER_NAME;
  const updated = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/manage-user.ts'], {
    env: { ...env, ERP_USER_ACTION: 'update', ERP_USER_ACTIVE: 'false' }, encoding: 'utf8', timeout: 15000 });
  assert.equal(updated.status, 0, updated.stderr);
  assert.equal((await pool.query('SELECT is_active FROM core.users WHERE email=$1', [command.email])).rows[0].is_active, false);
});

test('PostgreSQL: recepção WhatsApp concorrente deduplica por canal e mantém não lidas/auditoria', async () => {
  const { WhatsAppService } = await import('../server/services/whatsappService');
  const channelId = crypto.randomUUID();
  await pool.query(`INSERT INTO communication.channels(id,provider,channel_name,phone_number,status,is_active)
    VALUES($1,'wa_akg','Integration','000','connected',true)`, [channelId]);
  const payload = { channelId, fromPhone: '000123456', fromName: 'Integration Contact', body: 'Inbound', externalId: crypto.randomUUID() };
  const responses = await Promise.all(Array.from({ length: 8 }, () => new WhatsAppService().handleInboundMessage(payload)));
  assert.equal(new Set(responses.map((response) => response.id)).size, 1);
  const conv = (await pool.query('SELECT * FROM communication.conversations WHERE channel_id=$1', [channelId])).rows;
  assert.equal(conv.length, 1); assert.equal(conv[0].unread_count, 1);
  assert.equal((await pool.query('SELECT * FROM communication.messages WHERE conversation_id=$1', [conv[0].id])).rowCount, 1);
  assert.equal((await pool.query('SELECT * FROM core.audit_logs WHERE entity_id=$1', [responses[0].id])).rowCount, 1);
  const channel2 = crypto.randomUUID();
  await pool.query(`INSERT INTO communication.channels(id,provider,channel_name,phone_number,status,is_active)
    VALUES($1,'wa_akg','Integration second','000','connected',true)`, [channel2]);
  const other = await new WhatsAppService().handleInboundMessage({ ...payload, channelId: channel2 });
  assert.notEqual(other.conversationId, responses[0].conversationId);
  await assert.rejects(pool.query(`INSERT INTO communication.conversations(channel_id,remote_jid,customer_name,customer_phone)
    VALUES($1,$2,'Duplicate','000')`, [channelId, conv[0].remote_jid]), (error: any) => error.code === '23505');
  await assert.rejects(pool.query(`INSERT INTO communication.messages(conversation_id,external_id,direction,body)
    VALUES($1,$2,'inbound','Duplicate')`, [conv[0].id, payload.externalId]), (error: any) => error.code === '23505');
});

test('PostgreSQL: falha na auditoria de recepção reverte tudo e permite reentrega', async () => {
  const { WhatsAppService } = await import('../server/services/whatsappService');
  const { auditService } = await import('../server/services/auditService');
  const channelId = crypto.randomUUID();
  await pool.query(`INSERT INTO communication.channels(id,provider,channel_name,phone_number,status,is_active)
    VALUES($1,'wa_akg','Rollback','000','connected',true)`, [channelId]);
  const payload = { channelId, fromPhone: '00098765', fromName: 'Rollback Contact', body: 'Inbound rollback', externalId: crypto.randomUUID() };
  const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Injected inbound audit failure'); };
    await assert.rejects(new WhatsAppService().handleInboundMessage(payload), /Injected inbound/);
  } finally { auditService.log = original; }
  assert.equal((await pool.query('SELECT * FROM communication.conversations WHERE channel_id=$1', [channelId])).rowCount, 0);
  assert.equal((await pool.query('SELECT * FROM communication.messages WHERE external_id=$1', [payload.externalId])).rowCount, 0);
  const saved = await new WhatsAppService().handleInboundMessage(payload);
  const secondPayload = { ...payload, externalId: crypto.randomUUID() };
  try {
    auditService.log = async () => { throw new Error('Injected inbound audit failure'); };
    await assert.rejects(new WhatsAppService().handleInboundMessage(secondPayload), /Injected inbound/);
  } finally { auditService.log = original; }
  assert.equal((await pool.query('SELECT unread_count FROM communication.conversations WHERE id=$1', [saved.conversationId])).rows[0].unread_count, 1);
  assert.equal((await pool.query('SELECT * FROM communication.messages WHERE external_id=$1', [secondPayload.externalId])).rowCount, 0);
  await new WhatsAppService().handleInboundMessage(secondPayload);
  assert.equal((await pool.query('SELECT unread_count FROM communication.conversations WHERE id=$1', [saved.conversationId])).rows[0].unread_count, 2);
});

test('PostgreSQL: envio registra pendente antes da rede, deduplica e não segura conexão durante transporte', async () => {
  const { WhatsAppService } = await import('../server/services/whatsappService');
  const { communicationRepository } = await import('../server/repositories/communicationRepository');
  const oldKey = process.env.WA_AKG_API_KEY; const originalFetch = globalThis.fetch;
  process.env.WA_AKG_API_KEY = crypto.randomBytes(24).toString('hex');
  const channelId = crypto.randomUUID(); const conversationId = crypto.randomUUID();
  await pool.query(`INSERT INTO communication.channels(id,provider,channel_name,phone_number,status,is_active)
    VALUES($1,'wa_akg','Outbound test','000','connected',true)`, [channelId]);
  await pool.query(`INSERT INTO communication.conversations(id,channel_id,remote_jid,customer_name,customer_phone,unread_count)
    VALUES($1,$2,'outbound@test','Outbound','000123',3)`, [conversationId, channelId]);
  let finish!: () => void; let started!: () => void; let calls = 0;
  const startedPromise = new Promise<void>((resolve) => { started = resolve; });
  globalThis.fetch = async () => { calls++; started(); return new Promise<Response>((resolve) => { finish = () => resolve(new Response('{}')); }); };
  const actorId = (await pool.query("SELECT id FROM core.users WHERE role='admin' AND is_active=true LIMIT 1")).rows[0].id;
  const options = { conversationId, body: 'Outbound', actorId, idempotencyKey: crypto.randomUUID() };
  try {
    const service = new WhatsAppService();
    const first = service.sendMessage(options);
    await startedPromise;
    const repeated = await service.sendMessage(options);
    assert.equal(repeated.status, 'pending'); assert.equal(calls, 1);
    assert.equal((await communicationRepository.findMessageById(repeated.id))?.status, 'pending');
    await pool.query('UPDATE communication.conversations SET unread_count=4 WHERE id=$1', [conversationId]);
    finish(); assert.equal((await first).status, 'sent');
    assert.equal((await service.sendMessage(options)).id, repeated.id); assert.equal(calls, 1);
    assert.equal((await pool.query('SELECT unread_count FROM communication.conversations WHERE id=$1', [conversationId])).rows[0].unread_count, 4);
    await assert.rejects(service.sendMessage({ ...options, body: 'Changed' }), (error: any) => error.status === 409);
    assert.equal((await pool.query('SELECT * FROM communication.messages WHERE conversation_id=$1', [conversationId])).rowCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.WA_AKG_API_KEY; else process.env.WA_AKG_API_KEY = oldKey;
  }
});

test('PostgreSQL: auditoria inicial impede envio e falha final mantém pendente para reconciliação', async () => {
  const { WhatsAppService } = await import('../server/services/whatsappService');
  const { auditService } = await import('../server/services/auditService');
  const oldKey = process.env.WA_AKG_API_KEY; const originalFetch = globalThis.fetch; const originalAudit = auditService.log;
  process.env.WA_AKG_API_KEY = crypto.randomBytes(24).toString('hex');
  const channelId = crypto.randomUUID(); const conversationId = crypto.randomUUID(); let calls = 0;
  await pool.query(`INSERT INTO communication.channels(id,provider,channel_name,phone_number,status,is_active)
    VALUES($1,'wa_akg','Outbound rollback','000','connected',true)`, [channelId]);
  await pool.query(`INSERT INTO communication.conversations(id,channel_id,remote_jid,customer_name,customer_phone)
    VALUES($1,$2,'rollback@test','Outbound','000123')`, [conversationId, channelId]);
  globalThis.fetch = async () => { calls++; return new Response('{}'); };
  const options = { conversationId, body: 'Outbound', idempotencyKey: crypto.randomUUID() };
  try {
    const service = new WhatsAppService();
    auditService.log = async () => { throw new Error('Injected initial outbound audit failure'); };
    await assert.rejects(service.sendMessage(options), /Injected initial/); assert.equal(calls, 0);
    assert.equal((await pool.query('SELECT * FROM communication.messages WHERE conversation_id=$1', [conversationId])).rowCount, 0);
    auditService.log = async (event) => {
      if (event.action === 'SEND_WHATSAPP_MESSAGE') throw new Error('Injected final outbound audit failure');
      return originalAudit.call(auditService, event);
    };
    await assert.rejects(service.sendMessage(options), /Injected final/); assert.equal(calls, 1);
    auditService.log = originalAudit;
    assert.equal((await service.sendMessage(options)).status, 'pending'); assert.equal(calls, 1);
    assert.equal((await pool.query('SELECT last_message_text FROM communication.conversations WHERE id=$1', [conversationId])).rows[0].last_message_text, null);
  } finally {
    auditService.log = originalAudit; globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.WA_AKG_API_KEY; else process.env.WA_AKG_API_KEY = oldKey;
  }
});

async function pendingWhatsAppFixture() {
  const channelId = crypto.randomUUID(); const conversationId = crypto.randomUUID(); const messageId = crypto.randomUUID();
  await pool.query(`INSERT INTO communication.channels(id,provider,channel_name,phone_number,status,is_active)
    VALUES($1,'wa_akg','Reconciliation','000','connected',true)`, [channelId]);
  await pool.query(`INSERT INTO communication.conversations(id,channel_id,remote_jid,customer_name,customer_phone)
    VALUES($1,$2,'reconcile@test','Test','000123')`, [conversationId, channelId]);
  await pool.query(`INSERT INTO communication.messages(id,conversation_id,direction,body,status,created_at)
    VALUES($1,$2,'outbound','Private reconciliation fixture','pending',NOW()-INTERVAL '2 minutes')`, [messageId, conversationId]);
  return { channelId, conversationId, messageId };
}

test('PostgreSQL: reconciliação CLI confirma resultado com auditoria, sem expor mensagem; repetição é idempotente', async () => {
  const { reconcileWhatsAppMessage } = await import('../server/services/whatsappReconciliationService');
  const { messageId, conversationId } = await pendingWhatsAppFixture();
  const externalId = crypto.randomUUID();
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/reconcile-whatsapp.ts'], { encoding: 'utf8',
    env: { ...process.env, ERP_WA_MESSAGE_ID: messageId, ERP_WA_STATUS: 'sent', ERP_WA_EXTERNAL_ID: externalId,
      ERP_WA_OPERATOR: 'Integration Operator', ERP_WA_REASON: 'Integration reason', ERP_WA_EVIDENCE: 'Integration ticket' } });
  assert.equal(result.status, 0, result.stderr); assert.doesNotMatch(result.stdout + result.stderr, /Private reconciliation fixture/);
  const row = (await pool.query('SELECT status,external_id FROM communication.messages WHERE id=$1', [messageId])).rows[0];
  assert.equal(row.status, 'sent'); assert.equal(row.external_id, externalId);
  assert.equal((await pool.query('SELECT last_message_text FROM communication.conversations WHERE id=$1', [conversationId])).rows[0].last_message_text, 'Private reconciliation fixture');
  const repeat = await reconcileWhatsAppMessage({ messageId, status: 'sent', externalId, operator: 'Other operator', reason: 'Repeat', evidence: 'Ticket' });
  assert.equal(repeat.changed, false);
  const logs = (await pool.query("SELECT * FROM core.audit_logs WHERE entity_id=$1 AND action='WHATSAPP_RECONCILED'", [messageId])).rows;
  assert.equal(logs.length, 1); assert.equal(logs[0].actor_name, 'Integration Operator');
  assert.match(logs[0].notes, /Integration ticket/);
  await assert.rejects(reconcileWhatsAppMessage({ messageId, status: 'failed', operator: 'Operator', reason: 'Conflict', evidence: 'Ticket' }), /Somente envio pendente/);
});

test('PostgreSQL: reconciliação reverte por falha de auditoria e preserva prévia mais recente', async () => {
  const { reconcileWhatsAppMessage } = await import('../server/services/whatsappReconciliationService');
  const { auditService } = await import('../server/services/auditService');
  const { messageId, conversationId } = await pendingWhatsAppFixture();
  await pool.query("UPDATE communication.conversations SET last_message_text='Newer inbound',last_message_at=NOW(),unread_count=7 WHERE id=$1", [conversationId]);
  const input = { messageId, status: 'sent', externalId: crypto.randomUUID(), operator: 'Operator', reason: 'Test', evidence: 'Ticket' };
  const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Injected reconciliation failure'); };
    await assert.rejects(reconcileWhatsAppMessage(input), /Injected/);
  } finally { auditService.log = original; }
  assert.equal((await pool.query('SELECT status FROM communication.messages WHERE id=$1', [messageId])).rows[0].status, 'pending');
  await reconcileWhatsAppMessage(input);
  const conversation = (await pool.query('SELECT * FROM communication.conversations WHERE id=$1', [conversationId])).rows[0];
  assert.equal(conversation.last_message_text, 'Newer inbound'); assert.equal(conversation.unread_count, 7);
  const other = await pendingWhatsAppFixture();
  await pool.query("UPDATE communication.messages SET direction='inbound' WHERE id=$1", [other.messageId]);
  await assert.rejects(reconcileWhatsAppMessage({ ...input, messageId: other.messageId }), /Envio não encontrado/);
});

test('PostgreSQL: resposta tardia do transporte não sobrescreve reconciliação operacional', async () => {
  const { reconcileWhatsAppMessage } = await import('../server/services/whatsappReconciliationService');
  const { WhatsAppService } = await import('../server/services/whatsappService');
  const { conversationId } = await pendingWhatsAppFixture();
  const previousKey = process.env.WA_AKG_API_KEY; const originalFetch = globalThis.fetch;
  process.env.WA_AKG_API_KEY = crypto.randomBytes(24).toString('hex');
  let started!: () => void; let finish!: () => void;
  const startedPromise = new Promise<void>((resolve) => { started = resolve; });
  globalThis.fetch = async () => { started(); return new Promise<Response>((resolve) => { finish = () => resolve(new Response('{}')); }); };
  try {
    const service = new WhatsAppService();
    const options = { conversationId, body: 'In flight', idempotencyKey: crypto.randomUUID() };
    const request = service.sendMessage(options); await startedPromise;
    const pending = await service.sendMessage(options);
    await reconcileWhatsAppMessage({ messageId: pending.id, status: 'failed', operator: 'Operator', reason: 'Verified rejection', evidence: 'Provider test ticket' });
    finish(); assert.equal((await request).status, 'failed');
    const saved = (await pool.query('SELECT * FROM communication.messages WHERE id=$1', [pending.id])).rows[0];
    assert.equal(saved.status, 'failed'); assert.match(saved.error_message, /reconciliação/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.WA_AKG_API_KEY; else process.env.WA_AKG_API_KEY = previousKey;
  }
});

test('PostgreSQL: captura valida quantidade antes de consumir contador e reverte falha de auditoria', async () => {
  const { auditService } = await import('../server/services/auditService');
  const counter = (await pool.query("SELECT value FROM core.number_counters WHERE kind='lead'")).rows[0].value;
  const beforeCount = (await pool.query('SELECT count(*) FROM crm.leads')).rows[0].count;
  const payload = { clientName: ' Contact ', companyName: ' Company ', phone: '000', email: '', category: 'polos', estimatedQty: 3, notes: '' };
  assert.equal((await request('/api/leads', 'POST', { ...payload, estimatedQty: 0 })).status, 400);
  const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Injected capture audit failure'); };
    assert.equal((await request('/api/leads', 'POST', payload)).status, 500);
  } finally { auditService.log = original; }
  assert.equal((await pool.query("SELECT value FROM core.number_counters WHERE kind='lead'")).rows[0].value, counter);
  assert.equal((await pool.query('SELECT count(*) FROM crm.leads')).rows[0].count, beforeCount);
  const captured = await request('/api/leads', 'POST', payload); assert.equal(captured.status, 201);
  const saved = (await pool.query('SELECT * FROM crm.leads WHERE id=$1', [captured.data.leadId])).rows[0];
  assert.equal(saved.estimated_quantity, 3); assert.equal(saved.client_name, 'Contact');
});

test('PostgreSQL: atribuição comercial persiste, audita e reverte integralmente', async () => {
  const { auditService } = await import('../server/services/auditService');
  const { leadRepository } = await import('../server/repositories/leadRepository');
  const captured = await request('/api/leads', 'POST', { clientName: 'Assignment', companyName: 'Company', phone: '000', category: 'camisetas', estimatedQty: 7 });
  assert.equal(captured.status, 201); const id = captured.data.leadId; const sellerId = crypto.randomUUID();
  await pool.query(`INSERT INTO core.users(id,full_name,email,password_hash,role,is_active)
    VALUES($1,'Assigned seller',$2,'not-a-login-hash','vendedor',true)`, [sellerId, `${sellerId}@example.invalid`]);
  assert.equal((await request(`/api/leads/${id}/status`, 'PATCH', { status: 'em_contato', sellerId })).status, 200);
  const reloaded = await leadRepository.findById(id); assert.equal(reloaded?.assignedSellerId, sellerId); assert.equal(reloaded?.status, 'em_contato');
  const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Injected lead update audit failure'); };
    assert.equal((await request(`/api/leads/${id}/status`, 'PATCH', { status: 'desqualificado', sellerId: null })).status, 500);
  } finally { auditService.log = original; }
  const preserved = await leadRepository.findById(id); assert.equal(preserved?.assignedSellerId, sellerId); assert.equal(preserved?.status, 'em_contato');
  assert.equal((await request(`/api/leads/${id}/status`, 'PATCH', { status: 'convertido_em_proposta' })).status, 422);
  assert.equal((await request(`/api/leads/${id}/status`, 'PATCH', { sellerId: null })).status, 200);
  assert.equal((await leadRepository.findById(id))?.assignedSellerId, undefined);
  assert.equal((await pool.query("SELECT count(*) FROM core.audit_logs WHERE entity_id=$1 AND action='LEAD_UPDATED'", [id])).rows[0].count, '2');
});

test('PostgreSQL: estoque e histórico mantêm precisão da resposta sem fornecedor fictício', async () => {
  const { inventoryRepository } = await import('../server/repositories/inventoryRepository');
  const created = await request('/api/inventory/items', 'POST', { name: 'Precision SQL', category: 'tecido', unit: 'metros', physicalStock: 0.1, minStock: 0, unitCostPrice: 1.25 });
  assert.equal(created.status, 201); const id = created.data.id;
  assert.equal(created.data.supplier, '');
  const moved = await request('/api/inventory/movements', 'POST', { itemId: id, type: 'entrada_compra', quantity: 0.2 });
  assert.equal(moved.status, 201); assert.equal(moved.data.item.physicalStock, 0.3);
  const stored = await inventoryRepository.findItemById(id); assert.equal(stored?.physicalStock, 0.3); assert.equal(stored?.supplier, ''); assert.equal(stored?.location, '');
  const movement = (await inventoryRepository.findAllMovements()).find((row) => row.id === moved.data.movement.id)!;
  assert.equal(movement.quantity, 0.2); assert.equal(movement.operatorId, moved.data.movement.operatorId);
  assert.equal((await request('/api/inventory/movements', 'POST', { itemId: id, type: 'entrada_compra', quantity: 0.001 })).status, 400);
  assert.equal((await inventoryRepository.findItemById(id))?.physicalStock, 0.3);
});

test('PostgreSQL: colisão de movimento não confirma saldo nem auditoria parcial', async () => {
  const { sequenceService } = await import('../server/services/sequenceService');
  const { inventoryRepository } = await import('../server/repositories/inventoryRepository');
  const created = await request('/api/inventory/items', 'POST', { name: 'Conflict SQL', category: 'tecido', unit: 'metros', physicalStock: 2, minStock: 0, unitCostPrice: 1 });
  assert.equal(created.status, 201); const id = created.data.id;
  const previous = (await inventoryRepository.findAllMovements()).find((movement) => movement.itemId === id)!;
  const beforeAudit = (await pool.query('SELECT count(*) FROM core.audit_logs')).rows[0].count;
  const original = sequenceService.nextMovementNumber;
  sequenceService.nextMovementNumber = async () => previous.movementNumber;
  try {
    assert.equal((await request('/api/inventory/movements', 'POST', { itemId: id, type: 'entrada_compra', quantity: 1 })).status, 409);
  } finally { sequenceService.nextMovementNumber = original; }
  assert.equal((await inventoryRepository.findItemById(id))?.physicalStock, 2);
  assert.equal((await pool.query('SELECT count(*) FROM estoque.movements WHERE item_id=$1', [id])).rows[0].count, '1');
  assert.equal((await pool.query('SELECT count(*) FROM core.audit_logs')).rows[0].count, beforeAudit);
});

async function keyedStockRequest(body: any, key?: string) {
  const response = await fetch(base + '/api/inventory/movements', { method: 'POST',
    headers: { ...headers, ...(key ? { 'idempotency-key': key } : {}) }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
test('PostgreSQL: requisições concorrentes de estoque com mesma chave gravam evento/contador uma vez', async () => {
  const created = await request('/api/inventory/items', 'POST', { name: 'Keyed stock', category: 'tecido', unit: 'metros', physicalStock: 0, minStock: 0, unitCostPrice: 1 });
  assert.equal(created.status, 201); const id = created.data.id; const key = crypto.randomUUID();
  const payload = { itemId: id, type: 'entrada_compra', quantity: 3, reason: 'Test receipt', referenceDoc: 'Test reference' };
  const before = BigInt((await pool.query("SELECT value FROM core.number_counters WHERE kind='movement'")).rows[0].value);
  const responses = await Promise.all(Array.from({ length: 8 }, () => keyedStockRequest(payload, key)));
  assert.equal(responses.filter((response) => response.status === 201).length, 1);
  assert.equal(responses.filter((response) => response.status === 200).length, 7);
  assert.equal(new Set(responses.map((response) => response.data.movement.id)).size, 1);
  assert.equal(BigInt((await pool.query("SELECT value FROM core.number_counters WHERE kind='movement'")).rows[0].value), before + 1n);
  const movement = responses[0].data.movement;
  assert.equal((await pool.query('SELECT count(*) FROM estoque.movements WHERE item_id=$1', [id])).rows[0].count, '1');
  assert.equal((await pool.query("SELECT count(*) FROM core.audit_logs WHERE action='STOCK_MOVEMENT' AND entity_id=$1", [movement.movementNumber])).rows[0].count, '1');
  assert.equal((await keyedStockRequest({ ...payload, quantity: 4 }, key)).status, 409);
  assert.equal((await keyedStockRequest(payload)).status, 400);
  assert.equal((await keyedStockRequest(payload, 'invalid-key')).status, 400);
  await request('/api/inventory/movements', 'POST', { ...payload, quantity: 2 });
  const replay = await keyedStockRequest(payload, key); assert.equal(replay.status, 200);
  assert.equal(replay.data.item.physicalStock, 5); assert.equal(replay.data.movement.quantity, 3);
});

test('PostgreSQL: rollback preserva chave disponível para retry com único evento', async () => {
  const { auditService } = await import('../server/services/auditService');
  const created = await request('/api/inventory/items', 'POST', { name: 'Key rollback', category: 'tecido', unit: 'metros', physicalStock: 0, minStock: 0, unitCostPrice: 1 });
  const id = created.data.id; const key = crypto.randomUUID(); const payload = { itemId: id, type: 'entrada_compra', quantity: 6 };
  const before = (await pool.query("SELECT value FROM core.number_counters WHERE kind='movement'")).rows[0].value;
  const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Injected keyed stock audit failure'); };
    assert.equal((await keyedStockRequest(payload, key)).status, 500);
  } finally { auditService.log = original; }
  assert.equal((await pool.query("SELECT value FROM core.number_counters WHERE kind='movement'")).rows[0].value, before);
  assert.equal((await pool.query('SELECT count(*) FROM estoque.movements WHERE item_id=$1', [id])).rows[0].count, '0');
  assert.equal((await keyedStockRequest(payload, key)).status, 201);
  assert.equal((await keyedStockRequest(payload, key)).status, 200);
  assert.equal((await pool.query('SELECT physical_stock FROM estoque.items WHERE id=$1', [id])).rows[0].physical_stock, '6.00');
});

test('PostgreSQL: contrato financeiro não arredonda valor manual e recarrega autoria da baixa', async () => {
  const { financeRepository } = await import('../server/repositories/financeRepository');
  const payload = { type: 'pagar', subType: 'despesa_geral', description: 'Manual finance precision', amount: 2.35, dueDate: '2027-01-01', paymentMethod: 'pix' };
  const before = (await pool.query("SELECT value FROM core.number_counters WHERE kind='finance'")).rows[0].value;
  assert.equal((await request('/api/finance/transactions', 'POST', { ...payload, amount: 1.005 })).status, 400);
  assert.equal((await pool.query("SELECT value FROM core.number_counters WHERE kind='finance'")).rows[0].value, before);
  const saved = await request('/api/finance/transactions', 'POST', payload); assert.equal(saved.status, 201);
  assert.equal(saved.data.category, ''); assert.equal((await financeRepository.findById(saved.data.id))?.amount, 2.35);
  assert.equal((await request(`/api/finance/transactions/${saved.data.id}/confirm-payment`, 'POST', { receiptVoucherNumber: 'TEST', receiptEvidenceUrl: 'https://' })).status, 400);
  const paid = await request(`/api/finance/transactions/${saved.data.id}/confirm-payment`, 'POST', { receiptVoucherNumber: 'TEST', receiptEvidenceUrl: 'https://example.invalid/private' });
  assert.equal(paid.status, 200);
  const reloaded = await financeRepository.findById(saved.data.id);
  assert.equal(reloaded?.confirmedById, paid.data.transaction.confirmedById);
  assert.ok(reloaded?.confirmedById); assert.equal(reloaded?.status, 'pago');
  assert.doesNotMatch(paid.data.message, /Sinal|50%/);
});

test('PostgreSQL: baixa de saldo não anuncia sinal nem libera corte', async () => {
  const { financeRepository } = await import('../server/repositories/financeRepository');
  const quote = await createQuote();
  assert.equal((await request(`/api/quotes/${quote.id}/convert-to-order`, 'POST')).status, 201);
  const titles = (await financeRepository.findAll()).filter((title) => title.quoteId === quote.id);
  const balance = titles.find((title) => title.subType === 'saldo_entrega')!;
  const input = { receiptVoucherNumber: 'BALANCE-TEST', receiptEvidenceUrl: 'https://example.invalid/balance' };
  const paid = await request(`/api/finance/transactions/${balance.id}/confirm-payment`, 'POST', input);
  assert.equal(paid.status, 200); assert.equal(paid.data.linkedOrderUpdated, true);
  assert.doesNotMatch(paid.data.message, /Sinal|50%|Confirmação de entrada/);
  assert.match(paid.data.message, /Situação financeira/);
  const related = (await pool.query('SELECT * FROM producao.production_orders WHERE quote_id=$1', [quote.id])).rows;
  assert.ok(related.every((order) => !order.entry_payment_confirmed && order.stage === 'aguardando_liberacao'));
  const repeated = await request(`/api/finance/transactions/${balance.id}/confirm-payment`, 'POST', input);
  assert.equal(repeated.data.alreadyConfirmed, true);
  assert.equal((await pool.query("SELECT count(*) FROM core.audit_logs WHERE action='CONFIRM_PAYMENT' AND entity_id=$1", [balance.transactionNumber])).rows[0].count, '1');
});

async function keyedFinanceRequest(body: any, key?: string) {
  const response = await fetch(base + '/api/finance/transactions', { method: 'POST',
    headers: { ...headers, ...(key ? { 'idempotency-key': key } : {}) }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
test('PostgreSQL: cadastro financeiro concorrente gera um título/contador/auditoria e mantém estado pago no replay', async () => {
  const payload = { type: 'pagar', subType: 'despesa_geral', description: 'Keyed manual finance', category: 'Test', amount: 9.35, dueDate: '2027-01-01', paymentMethod: 'pix' };
  const key = crypto.randomUUID(); const before = BigInt((await pool.query("SELECT value FROM core.number_counters WHERE kind='finance'")).rows[0].value);
  assert.equal((await keyedFinanceRequest(payload)).status, 400);
  assert.equal((await keyedFinanceRequest(payload, 'invalid')).status, 400);
  const responses = await Promise.all(Array.from({ length: 8 }, () => keyedFinanceRequest(payload, key)));
  assert.equal(responses.filter((response) => response.status === 201).length, 1);
  assert.equal(responses.filter((response) => response.status === 200).length, 7);
  assert.equal(new Set(responses.map((response) => response.data.id)).size, 1);
  const saved = responses[0].data;
  assert.equal(BigInt((await pool.query("SELECT value FROM core.number_counters WHERE kind='finance'")).rows[0].value), before + 1n);
  assert.equal((await pool.query("SELECT count(*) FROM core.audit_logs WHERE action='CREATE_TRANSACTION' AND entity_id=$1", [saved.transactionNumber])).rows[0].count, '1');
  const receipts = (await pool.query("SELECT * FROM core.event_log WHERE event_type='FINANCE_MANUAL_CREATED' AND payload->>'entityId'=$1", [saved.id])).rows;
  assert.equal(receipts.length, 1); assert.equal(receipts[0].status, 'completed');
  assert.deepEqual(Object.keys(receipts[0].payload).sort(), ['entityId', 'fingerprint']);
  assert.equal((await keyedFinanceRequest({ ...payload, amount: 8 }, key)).status, 409);
  await request(`/api/finance/transactions/${saved.id}/confirm-payment`, 'POST', { receiptVoucherNumber: 'KEYED', receiptEvidenceUrl: 'https://example.invalid/keyed' });
  assert.equal((await keyedFinanceRequest(payload, key)).data.status, 'pago');
});

test('PostgreSQL: rollback de criação libera chave e exclusão conserva registro para não recriar título', async () => {
  const { auditService } = await import('../server/services/auditService');
  const payload = { type: 'pagar', subType: 'despesa_geral', description: 'Deleted keyed title', amount: 3, dueDate: '2027-01-01', paymentMethod: 'pix' };
  const key = crypto.randomUUID(); const before = (await pool.query("SELECT value FROM core.number_counters WHERE kind='finance'")).rows[0].value;
  const beforeReceipts = (await pool.query("SELECT count(*) FROM core.event_log WHERE event_type='FINANCE_MANUAL_CREATED'")).rows[0].count;
  const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Injected keyed finance failure'); };
    assert.equal((await keyedFinanceRequest(payload, key)).status, 500);
  } finally { auditService.log = original; }
  assert.equal((await pool.query("SELECT value FROM core.number_counters WHERE kind='finance'")).rows[0].value, before);
  assert.equal((await pool.query("SELECT count(*) FROM core.event_log WHERE event_type='FINANCE_MANUAL_CREATED'")).rows[0].count, beforeReceipts);
  const saved = await keyedFinanceRequest(payload, key); assert.equal(saved.status, 201);
  assert.equal((await request(`/api/finance/transactions/${saved.data.id}`, 'DELETE')).status, 200);
  assert.equal((await keyedFinanceRequest(payload, key)).status, 410);
  assert.equal((await pool.query('SELECT count(*) FROM financeiro.transactions WHERE id=$1', [saved.data.id])).rows[0].count, '0');
  assert.equal((await pool.query("SELECT count(*) FROM core.event_log WHERE event_type='FINANCE_MANUAL_CREATED' AND payload->>'entityId'=$1", [saved.data.id])).rows[0].count, '1');
});

test('PostgreSQL: cliente com atendimento preserva vínculo e cliente livre mantém rollback da exclusão', async () => {
  const { auditService } = await import('../server/services/auditService');
  const invalid = await request('/api/clients', 'POST', { companyName: 'Segment test', cnpj: crypto.randomUUID().slice(0,20), contactName: 'Contact', phone: '000', segment: 'x'.repeat(61) });
  assert.equal(invalid.status, 400);
  const created = await request('/api/clients', 'POST', { companyName: 'History client', cnpj: crypto.randomUUID().slice(0,20), contactName: 'Contact', phone: '000' });
  assert.equal(created.status, 201); const id = created.data.id;
  const channelId = crypto.randomUUID(); const conversationId = crypto.randomUUID();
  await pool.query(`INSERT INTO communication.channels(id,provider,channel_name,phone_number,status,is_active)
    VALUES($1,'wa_akg','History channel','000','connected',true)`, [channelId]);
  await pool.query(`INSERT INTO communication.conversations(id,channel_id,client_id,remote_jid,customer_name,customer_phone)
    VALUES($1,$2,$3,'history@test','History','000')`, [conversationId, channelId, id]);
  assert.equal((await request(`/api/clients/${id}`, 'DELETE')).status, 409);
  assert.equal((await pool.query('SELECT client_id FROM communication.conversations WHERE id=$1', [conversationId])).rows[0].client_id, id);
  // Fixture removes the test relationship to exercise the pre-existing free-client path.
  await pool.query('DELETE FROM communication.conversations WHERE id=$1', [conversationId]);
  const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Injected client delete failure'); };
    assert.equal((await request(`/api/clients/${id}`, 'DELETE')).status, 500);
  } finally { auditService.log = original; }
  assert.equal((await pool.query('SELECT * FROM crm.clients WHERE id=$1', [id])).rowCount, 1);
  assert.equal((await request(`/api/clients/${id}`, 'DELETE')).status, 200);
});

test('PostgreSQL: exclusão de proposta não deixa lead ou financeiro sem vínculo', async () => {
  const { auditService } = await import('../server/services/auditService');
  const quote = await createQuote(); const leadId = crypto.randomUUID();
  await pool.query(`INSERT INTO crm.leads(id,lead_number,client_name,company_name,phone,email,category,estimated_quantity,converted_quote_id)
    VALUES($1,$2,'History lead','History','000','','polos',1,$3)`, [leadId, `HISTORY-${leadId.slice(0,8)}`, quote.id]);
  assert.equal((await request(`/api/quotes/${quote.id}`, 'DELETE')).status, 409);
  assert.equal((await pool.query('SELECT converted_quote_id FROM crm.leads WHERE id=$1', [leadId])).rows[0].converted_quote_id, quote.id);
  await pool.query('DELETE FROM crm.leads WHERE id=$1', [leadId]);
  const titleId = crypto.randomUUID();
  await pool.query(`INSERT INTO financeiro.transactions(id,transaction_number,quote_id,type,sub_type,description,category,amount,due_date,payment_method)
    VALUES($1,$2,$3,'receber','despesa_geral','Historical linkage','Test',1,'2027-01-01','pix')`, [titleId, `HISTORY-${titleId.slice(0,8)}`, quote.id]);
  assert.equal((await request(`/api/quotes/${quote.id}`, 'DELETE')).status, 409);
  assert.equal((await pool.query('SELECT quote_id FROM financeiro.transactions WHERE id=$1', [titleId])).rows[0].quote_id, quote.id);
  await pool.query('DELETE FROM financeiro.transactions WHERE id=$1', [titleId]);
  const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Injected quote delete failure'); };
    assert.equal((await request(`/api/quotes/${quote.id}`, 'DELETE')).status, 500);
  } finally { auditService.log = original; }
  assert.equal((await pool.query('SELECT * FROM crm.quotes WHERE id=$1', [quote.id])).rowCount, 1);
  assert.ok((await pool.query('SELECT * FROM crm.quote_items WHERE quote_id=$1', [quote.id])).rowCount! > 0);
  assert.equal((await request(`/api/quotes/${quote.id}`, 'DELETE')).status, 200);
});

test('PostgreSQL: exclusão de OP preserva vínculos financeiros, estoque, custódia e proposta', async () => {
  const { auditService } = await import('../server/services/auditService');
  const id = crypto.randomUUID();
  await pool.query(`INSERT INTO producao.production_orders(id,order_number,idempotency_key,client_id,client_name,item_title,category,fabric_name,fabric_color,sizes,total_pieces,creation_date,target_delivery_date)
    VALUES($1,$2,$4,$3,'Test','History order','polos','Test','Test','{"p":1}',1,'2026-10-29','2027-01-01')`, [id, `HIST-${id.slice(0,8)}`, clientId, `history:${id}`]);
  const titleId = crypto.randomUUID();
  await pool.query(`INSERT INTO financeiro.transactions(id,transaction_number,production_order_id,type,sub_type,description,category,amount,due_date,payment_method)
    VALUES($1,$2,$3,'receber','despesa_geral','Order history','Test',1,'2027-01-01','pix')`, [titleId, `HIST-${titleId.slice(0,8)}`, id]);
  assert.equal((await request(`/api/orders/${id}`, 'DELETE')).status, 409);
  assert.equal((await pool.query('SELECT production_order_id FROM financeiro.transactions WHERE id=$1', [titleId])).rows[0].production_order_id, id);
  await pool.query('DELETE FROM financeiro.transactions WHERE id=$1', [titleId]);
  const itemId = crypto.randomUUID(); const movementId = crypto.randomUUID(); const partnerId = crypto.randomUUID(); const custodyId = crypto.randomUUID();
  await pool.query("INSERT INTO estoque.items(id,code,name,category,unit) VALUES($1,$2,'Test','tecido','metros')", [itemId, `HIST-${itemId.slice(0,8)}`]);
  await pool.query(`INSERT INTO estoque.movements(id,movement_number,item_id,production_order_id,type,quantity,unit,date,reason,operator_name)
    VALUES($1,$2,$3,$4,'saida_corte',1,'metros','2026-10-29','Test','Test')`, [movementId, `HIST-${movementId.slice(0,8)}`, itemId, id]);
  assert.equal((await request(`/api/orders/${id}`, 'DELETE')).status, 409);
  assert.equal((await pool.query('SELECT production_order_id FROM estoque.movements WHERE id=$1', [movementId])).rows[0].production_order_id, id);
  await pool.query('DELETE FROM estoque.movements WHERE id=$1', [movementId]);
  await pool.query("INSERT INTO producao.partners(id,code,name,trade_name,phone,partner_type) VALUES($1,$2,'Test','Test','000','costura')", [partnerId, `HIST-${partnerId.slice(0,8)}`]);
  await pool.query(`INSERT INTO estoque.partner_custody(id,partner_id,item_id,production_order_id,sent_quantity,unit,sent_date)
    VALUES($1,$2,$3,$4,1,'metros','2026-10-29')`, [custodyId, partnerId, itemId, id]);
  assert.equal((await request(`/api/orders/${id}`, 'DELETE')).status, 409);
  assert.equal((await pool.query('SELECT production_order_id FROM estoque.partner_custody WHERE id=$1', [custodyId])).rows[0].production_order_id, id);
  await pool.query('DELETE FROM estoque.partner_custody WHERE id=$1', [custodyId]);
  const quote = await createQuote();
  await pool.query('UPDATE crm.quotes SET converted_order_id=$1 WHERE id=$2', [id, quote.id]);
  assert.equal((await request(`/api/orders/${id}`, 'DELETE')).status, 409);
  assert.equal((await pool.query('SELECT converted_order_id FROM crm.quotes WHERE id=$1', [quote.id])).rows[0].converted_order_id, id);
  await pool.query('UPDATE crm.quotes SET converted_order_id=NULL WHERE id=$1', [quote.id]);
  // Test-only cleanup of relationships lets each guard run independently.
  await pool.query("UPDATE producao.production_orders SET art_approved=true,art_approved_by='Client' WHERE id=$1", [id]);
  assert.equal((await request(`/api/orders/${id}`, 'DELETE')).status, 409);
  await pool.query('UPDATE producao.production_orders SET art_approved=false,art_approved_by=NULL WHERE id=$1', [id]);
  const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Injected order delete failure'); };
    assert.equal((await request(`/api/orders/${id}`, 'DELETE')).status, 500);
  } finally { auditService.log = original; }
  assert.equal((await pool.query('SELECT * FROM producao.production_orders WHERE id=$1', [id])).rowCount, 1);
  assert.equal((await request(`/api/orders/${id}`, 'DELETE')).status, 200);
  assert.equal((await pool.query('SELECT * FROM producao.production_orders WHERE id=$1', [id])).rowCount, 0);
});


test('PostgreSQL: edição de OP recarrega centavos e equipe vazia sem arredondar entrada inválida', async () => {
  const { auditService } = await import('../server/services/auditService');
  const quote = await createQuote();
  const converted = await request(`/api/quotes/${quote.id}/convert-to-order`, 'POST'); assert.equal(converted.status, 201);
  const id = converted.data.orders[0].id;
  assert.equal((await request(`/api/orders/${id}`)).data.assignedTeam, '');
  const input = { priority: 'alta', targetDeliveryDate: '2027-02-01', technicalNotes: 'Edited',
    assignedTeam: '', outsourcedPartner: '', partnerCostPerPiece: 8.25 };
  const before = (await pool.query('SELECT * FROM producao.production_orders WHERE id=$1', [id])).rows[0];
  const count = (await pool.query("SELECT count(*) FROM core.audit_logs WHERE action='UPDATE_ORDER' AND entity_id=$1", [id])).rows[0].count;
  for (const value of [-1, 1.005, 100000000, '2.35']) {
    assert.equal((await request(`/api/orders/${id}`, 'PUT', { ...input, partnerCostPerPiece: value })).status, 400);
    assert.deepEqual((await pool.query('SELECT * FROM producao.production_orders WHERE id=$1', [id])).rows[0], before);
  }
  assert.equal((await request(`/api/orders/${id}`, 'PUT')).status, 400);
  const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Injected order edit failure'); };
    assert.equal((await request(`/api/orders/${id}`, 'PUT', input)).status, 500);
  } finally { auditService.log = original; }
  assert.deepEqual((await pool.query('SELECT * FROM producao.production_orders WHERE id=$1', [id])).rows[0], before);
  assert.equal((await pool.query("SELECT count(*) FROM core.audit_logs WHERE action='UPDATE_ORDER' AND entity_id=$1", [id])).rows[0].count, count);
  for (const cost of [0, 8.25, 99999999.99]) {
    assert.equal((await request(`/api/orders/${id}`, 'PUT', { ...input, partnerCostPerPiece: cost })).status, 200);
    const saved = (await request(`/api/orders/${id}`)).data;
    assert.equal(saved.partnerCostPerPiece, cost); assert.equal(saved.assignedTeam, '');
    assert.equal((await pool.query('SELECT partner_cost_per_piece,assigned_team FROM producao.production_orders WHERE id=$1', [id])).rows[0].partner_cost_per_piece, cost.toFixed(2));
  }
});
