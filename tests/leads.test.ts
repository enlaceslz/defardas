import 'express-async-errors';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import express from 'express';
import crypto from 'node:crypto';
import { leadsRouter } from '../server/routes/leadsRoutes';
import { db } from '../server/db/connection';
import { auditService } from '../server/services/auditService';
import { userRepository } from '../server/db/userRepository';

await db.ready;
const app = express(); app.use(express.json());
const actorId = crypto.randomUUID();
// Fixture at authenticated router boundary; production uses authMiddleware/sessionStore.
app.use((req: any, _res, next) => { req.user = { id: actorId, fullName: 'Test Admin', role: 'admin' }; next(); });
app.use('/leads', leadsRouter);
app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status || 500).json({ error: error.message }));
const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.on('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}/leads`;
after(() => { server.closeAllConnections(); server.close(); });
const capture = () => ({ clientName: '  Contato  ', companyName: '  Empresa  ', phone: ' 000 ',
  email: ' test@example.invalid ', category: 'polos', estimatedQty: 1, notes: ' Detalhes ' });
const request = (path: string, method: string, body: any) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('captura preserva quantidade informada e normaliza campos sem aceitar estado do visitante', async () => {
  const response = await request('', 'POST', { ...capture(), status: 'convertido_em_proposta', sellerId: actorId });
  assert.equal(response.status, 201);
  const lead = db.leads.get((await response.json()).leadId);
  assert.ok(lead);
  assert.equal(lead.estimatedQuantity, 1); assert.equal(lead.clientName, 'Contato');
  assert.equal(lead.email, 'test@example.invalid'); assert.equal(lead.status, 'novo');
  assert.equal(lead.assignedSellerId, undefined);
});

test('captura rejeita quantidade/categoria/campos inválidos sem criar registros', async () => {
  const count = db.leads.size;
  for (const update of [ { estimatedQty: undefined }, { estimatedQty: 0 }, { estimatedQty: -1 },
    { estimatedQty: 1.5 }, { estimatedQty: '20' }, { estimatedQty: 2147483648 },
    { category: 'arbitrary' }, { clientName: 'x'.repeat(121) }, { companyName: 'x'.repeat(151) },
    { phone: 'x'.repeat(31) }, { email: {} }, { email: 'invalid' }, { notes: {} }, { notes: 'x'.repeat(10001) }]) {
    assert.equal((await request('', 'POST', { ...capture(), ...update })).status, 400, JSON.stringify(update));
  }
  assert.equal(db.leads.size, count);
});

test('alteração valida estado/responsável e reverte em falha de auditoria', async () => {
  const response = await request('', 'POST', capture()); const id = (await response.json()).leadId;
  assert.equal((await request(`/${id}/status`, 'PATCH', { status: 'inventado' })).status, 400);
  assert.equal((await request(`/${id}/status`, 'PATCH', { status: 'convertido_em_proposta' })).status, 422);
  assert.equal((await request(`/${id}/status`, 'PATCH', {})).status, 400);
  const sellerId = crypto.randomUUID(); const originalFind = userRepository.findById;
  const originalAudit = auditService.log;
  userRepository.findById = async () => ({ id: sellerId, isActive: true, role: 'vendedor' } as any);
  try {
    auditService.log = async () => { throw new Error('Injected lead audit failure'); };
    assert.equal((await request(`/${id}/status`, 'PATCH', { status: 'em_contato', sellerId })).status, 500);
    assert.equal(db.leads.get(id)!.status, 'novo'); assert.equal(db.leads.get(id)!.assignedSellerId, undefined);
    auditService.log = originalAudit;
    assert.equal((await request(`/${id}/status`, 'PATCH', { status: 'em_contato', sellerId })).status, 200);
    assert.equal(db.leads.get(id)!.assignedSellerId, sellerId);
    const logs = (await auditService.getRecentLogs(500, 'crm.leads', id)).length;
    await request(`/${id}/status`, 'PATCH', { status: 'em_contato', sellerId });
    assert.equal((await auditService.getRecentLogs(500, 'crm.leads', id)).length, logs);
    userRepository.findById = async () => ({ id: sellerId, isActive: false, role: 'vendedor' } as any);
    assert.equal((await request(`/${id}/status`, 'PATCH', { sellerId })).status, 400);
    assert.equal((await request(`/${id}/status`, 'PATCH', { sellerId: null })).status, 200);
    assert.equal(db.leads.get(id)!.assignedSellerId, undefined);
  } finally { userRepository.findById = originalFind; auditService.log = originalAudit; }
});
