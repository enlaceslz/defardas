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


async function approveArt(id: string, body?: any) {
  const response = await fetch(`${base}/orders/${id}/approve-art`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
}
test('aprovações concorrentes registram uma vez e replay preserva responsável, data e notas', async () => {
  const id = crypto.randomUUID(); const orderNumber = `ART-${id.slice(0,8)}`;
  db.orders.set(id, { id, orderNumber, artApproved: false, stage: 'aguardando_liberacao', technicalNotes: 'Original' } as any);
  const responses = await Promise.all(Array.from({ length: 8 }, () => approveArt(id, { approverName: 'Cliente original' })));
  assert.ok(responses.every((r) => r.status === 200));
  assert.equal(responses.filter((r) => r.data.alreadyApproved).length, 7);
  const stored = structuredClone(db.orders.get(id));
  assert.ok(stored?.artApproved); assert.equal(stored?.stage, 'aguardando_liberacao');
  assert.equal(stored?.artApprovedBy, 'Cliente original');
  assert.equal(stored?.technicalNotes?.split('[Arte aprovada').length, 2);
  const replay = await approveArt(id, { approverName: 'Outro cliente', fileUrl: 'https://example.invalid/other' });
  assert.equal(replay.data.alreadyApproved, true); assert.deepEqual(db.orders.get(id), stored);
  assert.equal((await approveArt(id)).data.alreadyApproved, true);
  const logs = await auditService.getRecentLogs(500, 'producao.production_orders', orderNumber);
  assert.equal(logs.filter((log) => log.action === 'APPROVE_ART').length, 1);
});

test('aprovação inválida ou auditoria com falha não altera OP e permite nova tentativa', async () => {
  const id = crypto.randomUUID(); const originalOrder = { id, orderNumber: `ART-${id.slice(0,8)}`, artApproved: false, technicalNotes: 'Original' } as any;
  db.orders.set(id, structuredClone(originalOrder));
  for (const payload of [undefined, {}, { approverName: ' ' }, { approverName: 'x'.repeat(101) }]) {
    assert.equal((await approveArt(id, payload)).status, 400); assert.deepEqual(db.orders.get(id), originalOrder);
  }
  const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Injected art approval failure'); };
    assert.equal((await approveArt(id, { approverName: 'Cliente' })).status, 500);
  } finally { auditService.log = original; }
  assert.deepEqual(db.orders.get(id), originalOrder);
  assert.equal((await approveArt(id, { approverName: 'Cliente' })).status, 200);
  const stored = structuredClone(db.orders.get(id));
  try {
    auditService.log = async () => { throw new Error('Replay must not audit'); };
    assert.equal((await approveArt(id, { approverName: 'Outro' })).data.alreadyApproved, true);
  } finally { auditService.log = original; }
  assert.deepEqual(db.orders.get(id), stored);
});


async function advanceStage(id: string, body?: any) {
  const response = await fetch(`${base}/orders/${id}/advance-stage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
}
test('etapa repetida não troca conclusão histórica, updatedAt ou auditoria; concorrência confirma uma vez', async () => {
  const id = crypto.randomUUID(); const orderNumber = `STAGE-${id.slice(0,8)}`;
  db.orders.set(id, { id, orderNumber, stage: 'expedicao', artApproved: true, entryPaymentConfirmed: true } as any);
  const responses = await Promise.all(Array.from({ length: 8 }, () => advanceStage(id, { targetStage: 'entregue' })));
  assert.ok(responses.every((r) => r.status === 200)); assert.equal(responses.filter((r) => r.data.alreadyAtStage).length, 7);
  assert.equal((await auditService.getRecentLogs(500, 'producao.production_orders', orderNumber)).filter((r) => r.action === 'ADVANCE_STAGE').length, 1);
  // Historical fixture: retry on a later day must preserve the original delivery date.
  db.orders.get(id)!.completionDate = '2026-01-01';
  db.orders.get(id)!.updatedAt = '2026-01-01T00:00:00Z';
  const before = structuredClone(db.orders.get(id)); const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Replay must not audit'); };
    const repeated = await advanceStage(id, { targetStage: 'entregue' });
    assert.equal(repeated.status, 200); assert.equal(repeated.data.alreadyAtStage, true);
  } finally { auditService.log = original; }
  assert.deepEqual(db.orders.get(id), before);
});

test('repetição de etapa mantém gates e validação; falha de auditoria reverte transição real', async () => {
  const id = crypto.randomUUID(); const fresh = { id, orderNumber: `STAGE-${id.slice(0,8)}`, stage: 'aguardando_liberacao', artApproved: false, entryPaymentConfirmed: false } as any;
  db.orders.set(id, structuredClone(fresh));
  assert.equal((await advanceStage(id, { targetStage: 'aguardando_liberacao' })).data.alreadyAtStage, true);
  for (const input of [undefined, {}, { targetStage: 'invalid' }]) assert.equal((await advanceStage(id, input)).status, 400);
  assert.equal((await advanceStage(id, { targetStage: 'corte' })).status, 422);
  db.orders.get(id)!.stage = 'corte'; // Inconsistent legacy fixture: no-op must not bypass gates.
  assert.equal((await advanceStage(id, { targetStage: 'corte' })).status, 422);
  db.orders.set(id, { ...fresh, artApproved: true, entryPaymentConfirmed: true });
  const before = structuredClone(db.orders.get(id)); const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Injected stage audit failure'); };
    assert.equal((await advanceStage(id, { targetStage: 'corte' })).status, 500);
  } finally { auditService.log = original; }
  assert.deepEqual(db.orders.get(id), before);
  const saved = await advanceStage(id, { targetStage: 'corte' }); assert.equal(saved.status, 200); assert.equal(saved.data.order.stage, 'corte');
});


test('bloqueio de gate é auditado sem alterar OP; falha ao auditar retorna erro e não avança', async () => {
  const id = crypto.randomUUID(); const orderNumber = `GATE-${id.slice(0,8)}`;
  const originalOrder = { id, orderNumber, stage: 'aguardando_liberacao', artApproved: false, entryPaymentConfirmed: false } as any;
  db.orders.set(id, structuredClone(originalOrder));
  const response = await advanceStage(id, { targetStage: 'corte' }); assert.equal(response.status, 422);
  assert.equal(response.data.gateStatus.artApproved, false); assert.deepEqual(db.orders.get(id), originalOrder);
  const logs = await auditService.getRecentLogs(500, 'producao.production_orders', orderNumber);
  assert.equal(logs.filter((log) => log.action === 'GATE_BYPASS_ATTEMPT').length, 1);
  assert.deepEqual(logs[0].newData, { attemptedStage: 'corte' });
  const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Injected rejected audit failure'); };
    assert.equal((await advanceStage(id, { targetStage: 'corte' })).status, 500);
  } finally { auditService.log = original; }
  assert.deepEqual(db.orders.get(id), originalOrder);
  assert.equal((await advanceStage(id, { targetStage: 'corte' })).status, 422);
  assert.equal((await auditService.getRecentLogs(500, 'producao.production_orders', orderNumber)).filter((log) => log.action === 'GATE_BYPASS_ATTEMPT').length, 2);
});
