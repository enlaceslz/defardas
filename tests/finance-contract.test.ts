import 'express-async-errors';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import express from 'express';
import crypto from 'node:crypto';
import { financeRouter } from '../server/routes/financeRoutes';
import { financeRepository } from '../server/repositories/financeRepository';
import { db } from '../server/db/connection';
import { auditService } from '../server/services/auditService';
await db.ready;
const actorId = crypto.randomUUID();
const app = express(); app.use(express.json());
// Authenticated fixture at router boundary.
app.use((req: any, _res, next) => { req.user = { id: actorId, fullName: 'Test Finance Admin', role: 'admin' }; next(); });
app.use('/finance', financeRouter);
app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status || 500).json({ error: error.message }));
const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.on('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}/finance`;
after(() => { server.closeAllConnections(); server.close(); });
const title = () => ({ type: 'pagar', subType: 'despesa_geral', description: 'Despesa teste', amount: 2.35, dueDate: '2027-01-01', paymentMethod: 'pix' });
async function request(path: string, body: any) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}

test('lançamento manual preserva centavos e não inventa categoria de venda', async () => {
  const saved = await request('/transactions', title()); assert.equal(saved.status, 201);
  assert.equal(saved.data.amount, 2.35); assert.equal(saved.data.category, '');
  for (const update of [{ amount: 1.005 }, { amount: 10000000000 }, { amount: 0 }, { amount: '2.35' },
    { category: {} }, { category: 'x'.repeat(61) }, { referenceId: {} }, { referenceId: 'x'.repeat(61) }]) {
    assert.equal((await request('/transactions', { ...title(), ...update })).status, 400);
  }
});

test('comprovante exige URL válida sem credenciais; confirmação preserva autoria e replay', async () => {
  const saved = await request('/transactions', title()); const id = saved.data.id;
  for (const url of ['https://', 'https://?', 'https:example.invalid/private', 'http://example.invalid/file', 'https://user:password@example.invalid/file']) {
    assert.equal((await request(`/transactions/${id}/confirm-payment`, { receiptVoucherNumber: 'TEST', receiptEvidenceUrl: url })).status, 400);
    assert.equal((await financeRepository.findById(id))?.status, 'pendente');
  }
  const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Injected finance audit failure'); };
    assert.equal((await request(`/transactions/${id}/confirm-payment`, { receiptVoucherNumber: 'TEST', receiptEvidenceUrl: 'https://example.invalid/private' })).status, 500);
  } finally { auditService.log = original; }
  assert.equal((await financeRepository.findById(id))?.status, 'pendente');
  const paid = await request(`/transactions/${id}/confirm-payment`, { receiptVoucherNumber: 'TEST', receiptEvidenceUrl: 'https://example.invalid/private?signature=test' });
  assert.equal(paid.status, 200); assert.equal(paid.data.linkedOrderUpdated, false);
  assert.equal(paid.data.transaction.confirmedById, actorId); assert.doesNotMatch(paid.data.message, /Sinal|50%/);
  const repeated = await request(`/transactions/${id}/confirm-payment`, {});
  assert.equal(repeated.status, 200); assert.equal(repeated.data.alreadyConfirmed, true);
});
