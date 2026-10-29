import 'express-async-errors';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import express from 'express';
import crypto from 'node:crypto';
import { settingsRouter } from '../server/routes/settingsRoutes';
import { apiErrorHandler } from '../server/middleware/apiErrorHandler';
import { auditService } from '../server/services/auditService';
import { db } from '../server/db/connection';
await db.ready;
const app = express(); app.use(express.json());
app.use((req: any, _res, next) => { req.user = { id: crypto.randomUUID(), fullName: 'Test', role: 'admin' }; next(); });
app.use(settingsRouter); app.use(apiErrorHandler);
const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.on('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
after(() => { server.closeAllConnections(); server.close(); });
const input = { name: 'Empresa', tradeName: 'Marca', foundedYear: 0, productionCapacityPiecesMonth: 0 };
const save = (body?: any) => fetch(base + '/settings/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const read = async () => (await (await fetch(base + '/public-config')).json()).profile;

test('perfil local reverte primeira gravação e edição quando auditoria falha', async () => {
  db.publicSettings.clear(); assert.equal(await read(), null);
  const original = auditService.log;
  try {
    auditService.log = async () => { throw new Error('Injected audit failure'); };
    assert.equal((await save(input)).status, 500); assert.equal(await read(), null);
  } finally { auditService.log = original; }
  assert.equal((await save(input)).status, 200); const before = await read();
  assert.equal(before.productionCapacityPiecesMonth, 0);
  try {
    auditService.log = async () => { throw new Error('Injected audit failure'); };
    assert.equal((await save({ ...input, name: 'Alterada' })).status, 500);
    assert.deepEqual(await read(), before);
  } finally { auditService.log = original; }
  assert.equal((await save()).status, 400); assert.deepEqual(await read(), before);
  assert.equal((await save({ ...input, name: 'Atualizada' })).status, 200);
  assert.equal((await read()).name, 'Atualizada');
});
