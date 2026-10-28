import 'express-async-errors';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import express from 'express';
import crypto from 'node:crypto';
import { authRouter } from '../server/routes/authRoutes';
import { migrationRouter } from '../server/routes/migrationRoutes';
import { userRepository } from '../server/db/userRepository';
import { sessionStore } from '../server/auth/sessionStore';
import { db } from '../server/db/connection';
import { isLocalDemoEnvironment } from '../server/auth/demoEnvironment';

await db.ready;
const app = express();
app.use(express.json());
// Fixture authenticated at the router boundary; no database is contacted.
app.use((req: any, _res, next) => {
  req.user = { id: crypto.randomUUID(), fullName: 'Admin Test', email: 'admin@example.invalid', role: 'admin' };
  next();
});
app.use('/auth', authRouter);
app.use('/migration', migrationRouter);
app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: err.message }));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.on('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
after(() => { server.closeAllConnections(); server.close(); });

async function inEnvironment(environment: string | undefined, database: string | undefined, run: () => Promise<void>) {
  const previous = { environment: process.env.NODE_ENV, database: process.env.DATABASE_URL };
  if (environment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = environment;
  if (database === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = database;
  try { await run(); }
  finally {
    if (previous.environment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.environment;
    if (previous.database === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.database;
  }
}

for (const environment of [undefined, 'development', 'test', 'staging', 'production']) {
  test(`banco configurado bloqueia credenciais, tokens, simulador e importação (${environment ?? 'unset'})`, async () => {
    const originalLookup = userRepository.findByEmail;
    const originalIssue = sessionStore.createSession;
    let lookups = 0; let sessions = 0;
    userRepository.findByEmail = async () => { lookups++; throw new Error('Unexpected user lookup'); };
    sessionStore.createSession = async () => { sessions++; throw new Error('Unexpected session creation'); };
    const id = crypto.randomUUID();
    try {
      await inEnvironment(environment, 'postgresql://invalid.example.invalid/never_connected', async () => {
        const credentials = await fetch(base + '/auth/dev-credentials');
        assert.equal(credentials.status, 404);
        assert.equal('defaultPassword' in await credentials.json(), false);
        for (const [path, body, status] of [
          ['/auth/recover-password', { email: 'user@example.invalid' }, 503],
          ['/auth/switch-role', { targetEmail: 'user@example.invalid' }, 403],
          ['/migration/import-local-storage', { clients: [{ id, companyName: 'Blocked' }] }, 501],
        ] as const) {
          const response = await fetch(base + path, { method: 'POST',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          assert.equal(response.status, status);
          const result = await response.json();
          assert.equal('devResetToken' in result, false);
          assert.equal('token' in result, false);
          assert.notEqual(result.success, true);
        }
        assert.equal(db.clients.has(id), false);
        assert.equal(lookups, 0);
        assert.equal(sessions, 0);
      });
    } finally { userRepository.findByEmail = originalLookup; sessionStore.createSession = originalIssue; }
  });
}

test('demonstração sem banco preserva credenciais locais; ambiente desconhecido fecha acesso', async () => {
  for (const environment of [undefined, 'development', 'test']) {
    await inEnvironment(environment, undefined, async () => {
      assert.equal(isLocalDemoEnvironment(), true);
      const response = await fetch(base + '/auth/dev-credentials');
      assert.equal(response.status, 200);
      assert.equal(typeof (await response.json()).defaultPassword, 'string');
    });
  }
  for (const environment of ['staging', 'production', '']) {
    await inEnvironment(environment, undefined, async () => {
      assert.equal(isLocalDemoEnvironment(), false);
      assert.equal((await fetch(base + '/auth/dev-credentials')).status, 404);
    });
  }
});
