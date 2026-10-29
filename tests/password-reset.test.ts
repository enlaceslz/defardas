import 'express-async-errors';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import crypto from 'node:crypto';
import express from 'express';
import { PasswordResetService } from '../server/auth/passwordResetService';
import { PasswordService } from '../server/auth/passwordService';
import { userRepository } from '../server/db/userRepository';
import { sessionStore } from '../server/auth/sessionStore';
import { authRouter } from '../server/routes/authRoutes';

const credentials = { original: testPassword(), updated: testPassword(), replay: testPassword(),
  concurrent: testPassword(), expired: testPassword(), inactive: testPassword(), operator: testPassword() };
function testPassword() { return `Test-${crypto.randomBytes(24).toString('base64url')}-1`; }

const app = express(); app.use(express.json()); app.use('/auth', authRouter);
app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: err.message }));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.on('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
after(() => { server.closeAllConnections(); server.close(); });
const createUser = () => userRepository.createUser({ fullName: 'Reset Test',
  email: `${crypto.randomUUID()}@example.invalid`, password: credentials.original, role: 'vendedor' });

test('senha rejeita truncamento bcrypt em 72 bytes, inclusive Unicode', async () => {
  assert.equal(PasswordService.validatePasswordStrength('a1' + 'a'.repeat(70)).valid, true);
  assert.equal(PasswordService.validatePasswordStrength('a1' + 'a'.repeat(71)).valid, false);
  assert.equal(PasswordService.validatePasswordStrength('a1' + 'á'.repeat(36)).valid, false);
  await assert.rejects(PasswordService.hashPassword('123'), /mínimo/);
});
test('novo token substitui anterior e sucesso revoga sessões e impede reutilização', async () => {
  const user = await createUser(); const service = new PasswordResetService();
  const session = await sessionStore.createSession(user);
  const old = await service.issue(user.id); const token = await service.issue(user.id);
  assert.equal(await service.reset(old!, credentials.updated), false);
  assert.equal(await service.reset(token!, credentials.updated), true);
  assert.equal(await sessionStore.getSession(session.token), null);
  assert.equal(await service.reset(token!, credentials.replay), false);
  assert.ok(await PasswordService.comparePassword(credentials.updated, (await userRepository.findById(user.id))!.passwordHash));
});
test('token concorrente tem apenas um vencedor e senha fraca não consome token', async () => {
  const user = await createUser(); const service = new PasswordResetService(); const token = await service.issue(user.id);
  await assert.rejects(service.reset(token!, 'weak'), /mínimo/);
  const results = await Promise.all([1, 2, 3].map(() => service.reset(token!, credentials.concurrent)));
  assert.equal(results.filter(Boolean).length, 1);
});
test('token expirado ou conta inativa não altera senha', async () => {
  const user = await createUser(); const service = new PasswordResetService(); const token = await service.issue(user.id);
  const now = Date.now; Date.now = () => now() + 61 * 60 * 1000;
  try { assert.equal(await service.reset(token!, credentials.expired), false); }
  finally { Date.now = now; }
  const fresh = await service.issue(user.id); user.isActive = false;
  assert.equal(await service.issue(user.id), null);
  assert.equal(await service.reset(fresh!, credentials.inactive), false);
});
test('login iniciado com senha antiga não cria sessão depois de redefinição', async () => {
  const user = await createUser(); const service = new PasswordResetService();
  const original = PasswordService.comparePassword;
  let entered!: () => void; let resume!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const release = new Promise<void>((resolve) => { resume = resolve; });
  PasswordService.comparePassword = async () => { entered(); await release; return true; };
  try {
    const login = fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: credentials.original }) });
    await started;
    assert.ok(await service.resetByEmail(user.email, credentials.operator));
    resume();
    const result = await login;
    assert.equal(result.status, 401); assert.equal(result.headers.get('set-cookie'), null);
  } finally { resume(); PasswordService.comparePassword = original; }
});


test('comparação bcrypt aceita 72 bytes exatos e rejeita sufixos truncados, inclusive Unicode', async () => {
  for (const password of ['A1' + crypto.randomBytes(35).toString('hex'), 'A1' + 'á'.repeat(35)]) {
    assert.equal(Buffer.byteLength(password, 'utf8'), 72);
    const hash = await PasswordService.hashPassword(password);
    assert.equal(await PasswordService.comparePassword(password, hash), true);
    for (const suffix of ['x', 'ç', '🧵']) assert.equal(await PasswordService.comparePassword(password + suffix, hash), false);
    assert.equal(await PasswordService.comparePassword('wrong-password-1', hash), false);
  }
});

test('login recusa senha com sufixo além de 72 bytes sem criar sessão ou cookie', async () => {
  const password = 'A1' + crypto.randomBytes(35).toString('hex');
  const user = await userRepository.createUser({ fullName: 'Boundary Test', email: `${crypto.randomUUID()}@example.invalid`, password, role: 'vendedor' });
  const original = sessionStore.createSession; let calls = 0;
  try {
    sessionStore.createSession = async (...args) => { calls++; return original.apply(sessionStore, args); };
    const login = (candidate: string) => fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: candidate }) });
    const rejected = await login(password + 'suffix');
    assert.equal(rejected.status, 401); assert.equal((await rejected.json()).token, undefined);
    assert.equal(rejected.headers.get('set-cookie'), null); assert.equal(calls, 0);
    const accepted = await login(password); assert.equal(accepted.status, 200); assert.equal(calls, 1);
    const data = await accepted.json(); assert.ok(await sessionStore.getSession(data.token));
    await sessionStore.destroySession(data.token);
  } finally { sessionStore.createSession = original; }
});
