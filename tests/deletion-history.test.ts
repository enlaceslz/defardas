import 'express-async-errors';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import express from 'express';
import crypto from 'node:crypto';
import { clientsRouter } from '../server/routes/clientsRoutes';
import { ordersRouter } from '../server/routes/ordersRoutes';
import { quotesRouter } from '../server/routes/quotesRoutes';
import { apiErrorHandler } from '../server/middleware/apiErrorHandler';
import { db } from '../server/db/connection';
import { auditService } from '../server/services/auditService';
await db.ready;
const app = express(); app.use(express.json());
app.use((req: any, _res, next) => { req.user = { id: crypto.randomUUID(), fullName: 'Test Admin', role: 'admin' }; next(); });
app.use('/orders', ordersRouter); app.use('/clients', clientsRouter); app.use('/quotes', quotesRouter); app.use(apiErrorHandler);
const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.on('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
after(() => { server.closeAllConnections(); server.close(); });
const clientInput = () => ({ companyName: 'Test Company', tradeName: 'Test', cnpj: crypto.randomUUID().slice(0,20),
  contactName: 'Test Contact', phone: '000', email: '', address: '', city: '', state: '', segment: '' });
async function createClient(input = clientInput()) {
  const response = await fetch(base + '/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return { status: response.status, data: await response.json() };
}
const remove = (path: string) => fetch(base + path, { method: 'DELETE' });

test('cliente com conversa não perde vínculo por exclusão; segmento respeita limite SQL', async () => {
  assert.equal((await createClient({ ...clientInput(), segment: 'x'.repeat(61) })).status, 400);
  const created = await createClient(); assert.equal(created.status, 201); const id = created.data.id;
  const conversationId = crypto.randomUUID();
  db.conversations.set(conversationId, { id: conversationId, clientId: id });
  assert.equal((await remove(`/clients/${id}`)).status, 409);
  assert.ok(db.clients.has(id)); assert.equal(db.conversations.get(conversationId).clientId, id);
  db.conversations.delete(conversationId);
  const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Injected delete audit failure'); };
    assert.equal((await remove(`/clients/${id}`)).status, 500);
  } finally { auditService.log = original; }
  assert.ok(db.clients.has(id));
  assert.equal((await remove(`/clients/${id}`)).status, 200);
  assert.equal(db.clients.has(id), false);
});

test('proposta com lead ou título não é excluída; proposta livre mantém rollback e exclusão auditada', async () => {
  const quoteId = crypto.randomUUID(); const leadId = crypto.randomUUID(); const titleId = crypto.randomUUID();
  db.quotes.set(quoteId, { id: quoteId, isLocked: false } as any);
  db.leads.set(leadId, { id: leadId, convertedQuoteId: quoteId } as any);
  assert.equal((await remove(`/quotes/${quoteId}`)).status, 409); assert.ok(db.quotes.has(quoteId));
  db.leads.delete(leadId);
  db.finance.set(titleId, { id: titleId, quoteId } as any);
  assert.equal((await remove(`/quotes/${quoteId}`)).status, 409); assert.ok(db.quotes.has(quoteId));
  db.finance.delete(titleId);
  const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Injected quote delete audit failure'); };
    assert.equal((await remove(`/quotes/${quoteId}`)).status, 500);
  } finally { auditService.log = original; }
  assert.ok(db.quotes.has(quoteId));
  assert.equal((await remove(`/quotes/${quoteId}`)).status, 200);
  assert.equal(db.quotes.has(quoteId), false);
});


test('OP aguardando liberação conserva aprovação, comprovante e vínculos antes de excluir', async () => {
  const id = crypto.randomUUID(); const relatedId = crypto.randomUUID();
  const fresh = () => ({ id, orderNumber: 'OP-HISTORY', stage: 'aguardando_liberacao', entryPaymentConfirmed: false, artApproved: false } as any);
  for (const history of [{ artApproved: true }, { artApprovedBy: 'Cliente' }, { artApprovalDate: '2026-10-29T00:00:00Z' },
    { entryReceiptUrl: 'https://example.invalid/private' }, { entryReceiptReference: 'TEST' },
    { entryVerifiedById: crypto.randomUUID() }, { entryVerificationDate: '2026-10-29T00:00:00Z' }, { quoteItemId: crypto.randomUUID() }]) {
    db.orders.set(id, { ...fresh(), ...history });
    assert.equal((await remove(`/orders/${id}`)).status, 409); assert.ok(db.orders.has(id));
  }
  db.orders.set(id, fresh());
  for (const [collection, row] of [[db.finance, { productionOrderId: id }], [db.movements, { productionOrderId: id }],
    [db.quotes, { convertedOrderId: id }]] as const) {
    collection.set(relatedId, { id: relatedId, ...row } as any);
    assert.equal((await remove(`/orders/${id}`)).status, 409); assert.ok(db.orders.has(id));
    collection.delete(relatedId);
  }
  const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Injected order delete audit failure'); };
    assert.equal((await remove(`/orders/${id}`)).status, 500);
  } finally { auditService.log = original; }
  assert.ok(db.orders.has(id));
  assert.equal((await remove(`/orders/${id}`)).status, 200); assert.equal(db.orders.has(id), false);
});


test('edição de OP preserva centavos e equipe vazia, sem mutações em entrada inválida ou falha de auditoria', async () => {
  const id = crypto.randomUUID();
  const originalOrder = { id, priority: 'normal', targetDeliveryDate: '2027-01-01', technicalNotes: 'Original',
    assignedTeam: 'Equipe anterior', outsourcedPartner: 'Facção anterior', partnerCostPerPiece: 2.35 } as any;
  db.orders.set(id, structuredClone(originalOrder));
  const input = { priority: 'alta', targetDeliveryDate: '2027-02-01', technicalNotes: 'Alterado',
    assignedTeam: '', outsourcedPartner: '', partnerCostPerPiece: 8.25 };
  const edit = (body?: any) => fetch(`${base}/orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  for (const value of [-1, 1.005, 100000000, '2.35']) {
    assert.equal((await edit({ ...input, partnerCostPerPiece: value })).status, 400);
    assert.deepEqual(db.orders.get(id), originalOrder);
  }
  assert.equal((await edit()).status, 400); assert.deepEqual(db.orders.get(id), originalOrder);
  const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Injected order update failure'); };
    assert.equal((await edit(input)).status, 500);
  } finally { auditService.log = original; }
  assert.deepEqual(db.orders.get(id), originalOrder);
  for (const cost of [0, 8.25, 99999999.99]) {
    const response = await edit({ ...input, partnerCostPerPiece: cost }); assert.equal(response.status, 200);
    const saved = await response.json(); assert.equal(saved.partnerCostPerPiece, cost); assert.equal(saved.assignedTeam, '');
    assert.equal(db.orders.get(id)?.partnerCostPerPiece, cost);
  }
});
