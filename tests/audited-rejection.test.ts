import 'express-async-errors';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import express from 'express';
import crypto from 'node:crypto';
import { atomic, rejectWithAudit } from '../server/db/unitOfWork';
import { db } from '../server/db/connection';
import { apiErrorHandler } from '../server/middleware/apiErrorHandler';
await db.ready;
const app = express(); app.use(express.json());
let audits = 0;
const id = crypto.randomUUID(); const auditMarker = crypto.randomUUID();
app.post('/reject', atomic(async (req, _res) => {
  db.orders.get(id)!.technicalNotes = 'Must roll back';
  rejectWithAudit(422, { error: 'Blocked' }, async () => {
    // This must observe the state after rollback, without deadlocking the memory queue.
    assert.equal(db.orders.get(id)!.technicalNotes, 'Original');
    if (req.body.failAudit) {
      db.orders.set(auditMarker, { id: auditMarker } as any);
      throw new Error('Injected audit transaction failure');
    }
    audits++;
  });
}));
app.post('/ordinary', atomic(async (_req, res) => {
  db.orders.get(id)!.technicalNotes = 'Must roll back';
  res.status(409).json({ error: 'Ordinary rejection' });
}));
app.use(apiErrorHandler);
const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.on('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
after(() => { server.closeAllConnections(); server.close(); });
test('rejeição auditada desfaz escrita antes do callback; falha da segunda UoW também reverte e não muda rejeições comuns', async () => {
  const original = { id, technicalNotes: 'Original' } as any; db.orders.set(id, structuredClone(original));
  const send = (path: string, body = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await send('/reject')).status, 422); assert.equal(audits, 1); assert.deepEqual(db.orders.get(id), original);
  assert.equal((await send('/reject', { failAudit: true })).status, 500);
  assert.equal(db.orders.has(auditMarker), false); assert.equal(audits, 1); assert.deepEqual(db.orders.get(id), original);
  assert.equal((await send('/ordinary')).status, 409); assert.equal(audits, 1); assert.deepEqual(db.orders.get(id), original);
});
