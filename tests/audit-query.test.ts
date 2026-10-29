import 'express-async-errors';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import crypto from 'node:crypto';
import { auditRouter } from '../server/routes/auditRoutes';
import { apiErrorHandler } from '../server/middleware/apiErrorHandler';
import { auditService } from '../server/services/auditService';

test('auditoria rejeita filtros incompletos/estruturados e limites inválidos sem consultar serviço', async () => {
  const app = express(); app.use((req: any, _res, next) => { req.user = { id: crypto.randomUUID(), fullName: 'Test', role: 'admin' }; next(); });
  app.use(auditRouter); app.use(apiErrorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.on('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/logs`;
  const original = auditService.getRecentLogs; const calls: any[] = [];
  auditService.getRecentLogs = async (...args) => { calls.push(args); return []; };
  try {
    for (const query of ['entityName=crm.quotes', 'entityId=x', 'entityName=&entityId=x',
      'entityName[]=crm.quotes&entityId=x', 'entityName=crm.quotes&entityId[a]=x',
      'entityName=crm.quotes&entityId=x&entityId=y', 'entityName=crm.quotes&entityId=%00',
      'entityName=crm.quotes&entityId=' + 'x'.repeat(61),
      ...['0', '-1', '1.5', '1e2', 'Infinity', '', '501', '01'].map(value => 'limit=' + value), 'limit=1&limit=2']) {
      assert.equal((await fetch(base + '?' + query)).status, 400, query);
    }
    assert.equal(calls.length, 0);
    assert.equal((await fetch(base)).status, 200); assert.deepEqual(calls.pop(), [100]);
    assert.equal((await fetch(base + '?limit=500&entityName=crm.quotes&entityId=x')).status, 200);
    assert.deepEqual(calls.pop(), [500, 'crm.quotes', 'x']);
  } finally { auditService.getRecentLogs = original; server.closeAllConnections(); server.close(); }
});
