import 'express-async-errors';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { apiErrorHandler } from '../server/middleware/apiErrorHandler';
import { operationalErrorCode, logOperationalError } from '../server/observability/errors';
import { InputError } from '../server/validation/input';

const secret = 'private-fixture-password-token-and-personal-data';
test('diagnóstico só registra campos fixos e código permitido, sem serializar erro/cause', () => {
  const records: string[] = []; const original = console.error;
  console.error = (...args) => { records.push(JSON.stringify(args)); };
  try {
    const error = Object.assign(new Error(secret, { cause: new Error(secret) }), { code: '23505', detail: secret, query: secret, parameters: [secret] });
    const incidentId = logOperationalError('api', error);
    const entry = JSON.parse(JSON.parse(records[0])[0]);
    assert.deepEqual(Object.keys(entry).sort(), ['code', 'context', 'event', 'incidentId']);
    assert.equal(entry.code, '23505'); assert.equal(entry.incidentId, incidentId);
    assert.match(incidentId, /^[a-f0-9-]{36}$/);
    assert.equal(records.join('').includes(secret), false);
    assert.equal(operationalErrorCode({ code: secret }), 'UNCLASSIFIED');
    assert.equal(operationalErrorCode(null), 'UNCLASSIFIED');
    assert.equal(operationalErrorCode({ get code() { throw new Error(secret); } }), 'UNCLASSIFIED');
  } finally { console.error = original; }
});

test('HTTP não expõe nem registra JSON inválido, SQL, headers, query ou credenciais', async () => {
  const records: string[] = []; const original = console.error;
  console.error = (...args) => { records.push(JSON.stringify(args)); };
  const app = express(); app.use(express.json({ limit: 1024 }));
  app.post('/sql', () => { throw Object.assign(new Error(secret), { code: '23505', detail: secret, parameters: [secret] }); });
  app.get('/unknown', () => { throw { message: secret, code: secret, stack: secret }; });
  app.get('/validation', () => { throw new InputError('Campo obrigatório.'); });
  app.use(apiErrorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.on('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    for (const [path, body, expected] of [['/sql', JSON.stringify({ password: secret }), 409],
      ['/sql', `{"password":"${secret}"`, 400], ['/sql', JSON.stringify({ private: secret.repeat(100) }), 413]] as const) {
      const response = await fetch(base + path + '?token=' + secret, { method: 'POST', body,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}`, Cookie: `session=${secret}`, 'X-Diagnostic-Id': secret } });
      assert.equal(response.status, expected);
      assert.match(response.headers.get('X-Diagnostic-Id')!, /^[a-f0-9-]{36}$/);
      assert.equal((await response.text()).includes(secret), false);
    }
    const unknown = await fetch(base + '/unknown'); assert.equal(unknown.status, 500);
    assert.equal((await unknown.text()).includes(secret), false);
    const validation = await fetch(base + '/validation'); assert.equal(validation.status, 400);
    assert.equal((await validation.json()).error, 'Campo obrigatório.');
    assert.equal(records.join('').includes(secret), false);
    assert.equal(records.length, 5);
  } finally { server.closeAllConnections(); server.close(); console.error = original; }
});

test('CLIs de migração, admin e senha não imprimem detalhes de conexão inválida', () => {
  for (const script of ['migrate.ts', 'create-admin.ts', 'reset-user-password.ts']) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', `scripts/${script}`], { encoding: 'utf8', timeout: 15000,
      env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: `postgresql://private-user:${secret}@[invalid`,
        ADMIN_EMAIL: 'admin@example.invalid', ADMIN_NAME: 'Test Admin', ADMIN_PASSWORD: `Test-${crypto.randomBytes(24).toString('hex')}-1`,
        RESET_USER_EMAIL: 'user@example.invalid', RESET_USER_PASSWORD: `Test-${crypto.randomBytes(24).toString('hex')}-1` } });
    assert.equal(result.status, 1, script + result.stderr);
    assert.equal((result.stdout + result.stderr).includes(secret), false, script);
    assert.equal((result.stdout + result.stderr).includes('private-user'), false, script);
    assert.match(result.stderr, /operation_failed/);
  }
});
