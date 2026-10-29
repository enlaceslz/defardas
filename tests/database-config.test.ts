import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { databasePoolOptions, DatabaseConfigurationError } from '../server/db/config';
import { spawnSync } from 'node:child_process';
const url = 'postgresql://test-user:private-test-secret@db.example.invalid/test';
test('TLS mantém certificado/CA no driver real mesmo com sslmode redundante na URL', () => {
  for (const mode of ['require', 'verify-full']) {
    const options = databasePoolOptions({ NODE_ENV: 'production', DATABASE_URL: url + '?sslmode=' + mode,
      DATABASE_SSL_MODE: mode, DATABASE_CA_CERT: 'Test CA' });
    const client = new pg.Client(options);
    assert.deepEqual((client as any).connectionParameters.ssl, { rejectUnauthorized: true, ca: 'Test CA' });
    assert.equal(options.connectionString!.includes('sslmode'), false);
    assert.equal(options.max, 20);
  }
  assert.deepEqual(databasePoolOptions({ NODE_ENV: 'production' }).ssl, { rejectUnauthorized: true });
  assert.deepEqual(databasePoolOptions({ DATABASE_SSL_MODE: 'require' }).ssl, { rejectUnauthorized: true });
  assert.equal(databasePoolOptions({ DATABASE_SSL_MODE: 'disable', DATABASE_URL: url + '?sslmode=disable' }).ssl, false);
  assert.deepEqual(databasePoolOptions({ DATABASE_SSL_MODE: 'require', DATABASE_ALLOW_INSECURE_SSL: 'true' }).ssl, { rejectUnauthorized: false });
});

test('configuração ambígua ou inválida falha sem serializar URL, CA ou valores recebidos', () => {
  const invalid = [
    { DATABASE_SSL_MODE: 'verify-ful' }, { DATABASE_SSL_MODE: '' }, { DATABASE_ALLOW_INSECURE_SSL: 'yes' },
    { DATABASE_SSL_MODE: 'verify-full', DATABASE_ALLOW_INSECURE_SSL: 'true' },
    { DATABASE_SSL_MODE: 'disable', DATABASE_CA_CERT: 'private-ca' },
    { DATABASE_SSL_MODE: 'require', DATABASE_ALLOW_INSECURE_SSL: 'true', DATABASE_CA_CERT: 'private-ca' },
    ...['0', '-1', '1.5', '20oops', '', '9007199254740992'].map((value) => ({ DATABASE_POOL_MAX: value })),
    ...['sslmode=disable', 'sslmode=prefer', 'ssl=false', 'sslrootcert=private-ca', 'sslcert=private-key',
      'sslkey=private-key', 'sslnegotiation=direct', 'uselibpqcompat=true', 'sslmode=require&sslmode=require',
      'SSLMODE=require'].map((query) => ({ DATABASE_URL: url + '?' + query })),
    { DATABASE_URL: 'postgresql://private-test-secret@[invalid' }, { DATABASE_URL: 'https://private-test-secret.invalid' },
  ];
  for (const variant of invalid) {
    assert.throws(() => databasePoolOptions({ NODE_ENV: 'production', DATABASE_URL: url, ...variant }), (error: any) => {
      assert.ok(error instanceof DatabaseConfigurationError); assert.equal(error.code, 'DATABASE_CONFIG_INVALID');
      assert.doesNotMatch(String(error), /private-test-secret|private-ca|private-key/); return true;
    });
  }
});

test('pool desativado explicitamente não herda PGSSLMODE e numeração do pool é estrita', () => {
  const old = process.env.PGSSLMODE; process.env.PGSSLMODE = 'require';
  try {
    const options = databasePoolOptions({ DATABASE_SSL_MODE: 'disable', DATABASE_POOL_MAX: '1', DATABASE_URL: url });
    assert.equal((new pg.Client(options) as any).connectionParameters.ssl, false); assert.equal(options.max, 1);
  } finally { if (old === undefined) delete process.env.PGSSLMODE; else process.env.PGSSLMODE = old; }
});

test('processo com configuração inválida termina antes de conectar e registra somente código seguro', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts'], { encoding: 'utf8', timeout: 10000,
    env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: url + '?sslrootcert=private-ca', DATABASE_SSL_MODE: 'require' } });
  assert.equal(result.status, 1); assert.match(result.stderr, /DATABASE_CONFIG_INVALID/);
  assert.doesNotMatch(result.stdout + result.stderr, /private-test-secret|test-user|private-ca|db\.example/);
});
