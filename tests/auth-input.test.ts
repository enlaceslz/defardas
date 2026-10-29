import 'express-async-errors';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { authRouter } from '../server/routes/authRoutes';
import { apiErrorHandler } from '../server/middleware/apiErrorHandler';
import { userRepository } from '../server/db/userRepository';
import { sessionStore } from '../server/auth/sessionStore';
import { passwordResetService } from '../server/auth/passwordResetService';

test('autenticação rejeita entradas inválidas antes de consultar usuário ou criar sessão/token', async () => {
  const app = express(); app.use(express.json()); app.use('/auth', authRouter); app.use(apiErrorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.on('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const lookup = userRepository.findByEmail; const session = sessionStore.createSession; const issue = passwordResetService.issue;
  let calls = 0;
  try {
    userRepository.findByEmail = async () => { calls++; throw new Error('Must not query'); };
    sessionStore.createSession = async () => { calls++; throw new Error('Must not create session'); };
    passwordResetService.issue = async () => { calls++; throw new Error('Must not issue token'); };
    for (const route of ['login', 'recover-password']) {
      for (const body of [undefined, [], { email: 'private\u0000@example.invalid', password: 'unused' }, { email: 'x'.repeat(151), password: 'unused' }]) {
        const response = await fetch(`${base}/auth/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        assert.equal(response.status, 400); assert.equal(response.headers.get('set-cookie'), null);
        assert.equal((await response.text()).includes('private'), false);
      }
    }
    const reset = await fetch(base + '/auth/reset-password', { method: 'POST' }); assert.equal(reset.status, 400);
    assert.equal(calls, 0);
  } finally {
    userRepository.findByEmail = lookup; sessionStore.createSession = session; passwordResetService.issue = issue;
    server.closeAllConnections(); server.close();
  }
});
