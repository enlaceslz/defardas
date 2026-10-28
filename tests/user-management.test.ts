import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import { manageUser, validateUserManagement } from '../server/auth/userManagementService';
const testPassword = () => ['Test', crypto.randomBytes(24).toString('base64url'), '1'].join('-');
const common = { action: 'update', email: ' STAFF@EXAMPLE.INVALID ', operator: 'Operator Test', reason: 'Teste de acesso' };

test('gestão de equipe normaliza e-mail e exige alteração explícita', () => {
  assert.equal(validateUserManagement({ ...common, role: 'vendedor' }).email, 'staff@example.invalid');
  assert.throws(() => validateUserManagement(common), /perfil ou ativação/);
  assert.throws(() => validateUserManagement({ ...common, isActive: 'false' }), /true ou false/);
  assert.equal(validateUserManagement({ ...common, isActive: false }).action, 'update');
});
test('gestão de equipe rejeita perfis arbitrários e identidade/motivo ausentes', () => {
  for (const patch of [{ role: 'superadmin' }, { role: 'admin', operator: '' }, { role: 'admin', reason: '' }, { role: 'admin', email: 'invalid' }]) {
    assert.throws(() => validateUserManagement({ ...common, ...patch }));
  }
});
test('criação exige senha válida, nome e perfil; atualização não troca senha', () => {
  const create = { ...common, action: 'create', fullName: 'Staff Test', role: 'vendedor', password: testPassword() };
  assert.equal(validateUserManagement(create).action, 'create');
  for (const patch of [{ password: crypto.randomBytes(2).toString('hex') }, { fullName: '' }, { role: undefined }, { isActive: false }]) {
    assert.throws(() => validateUserManagement({ ...create, ...patch }));
  }
  assert.throws(() => validateUserManagement({ ...common, role: 'vendedor', password: create.password }), /procedimento próprio/);
});
test('gestão de equipe não confirma criação em memória sem PostgreSQL', async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try { await assert.rejects(manageUser({ ...common, role: 'vendedor' }), /DATABASE_URL obrigatória/); }
  finally { if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous; }
});
