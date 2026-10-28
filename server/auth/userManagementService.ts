import crypto from 'node:crypto';
import { query } from '../db/index';
import { unitOfWork } from '../db/unitOfWork';
import { PasswordService } from './passwordService';
import { auditService } from '../services/auditService';
import { InputError, oneOf, text } from '../validation/input';
import type { UserRole } from '../types/db';

const roles: readonly UserRole[] = ['admin', 'gerente_comercial', 'vendedor', 'pcp_producao', 'financeiro', 'expedicao_qualidade'];
export interface UserManagementInput {
  action: unknown;
  email: unknown;
  fullName?: unknown;
  password?: unknown;
  role?: unknown;
  isActive?: unknown;
  operator: unknown;
  reason: unknown;
}
export function validateUserManagement(input: UserManagementInput) {
  const action = oneOf(input.action, ['create', 'update'] as const, 'Ação');
  const email = text(input.email, 'E-mail', 150).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('E-mail inválido.');
  const operator = text(input.operator, 'Operador', 120);
  const reason = text(input.reason, 'Motivo', 500);
  const role = input.role === undefined ? undefined : oneOf(input.role, roles, 'Perfil');
  if (input.isActive !== undefined && typeof input.isActive !== 'boolean') throw new InputError('Ativação deve ser true ou false.');
  if (action === 'create') {
    const fullName = text(input.fullName, 'Nome', 120);
    if (!role) throw new InputError('Perfil obrigatório.');
    if (typeof input.password !== 'string') throw new InputError('Senha obrigatória.');
    const strength = PasswordService.validatePasswordStrength(input.password);
    if (!strength.valid) throw new InputError(strength.reason);
    if (input.isActive !== undefined) throw new InputError('Nova conta é criada ativa; não informe ativação.');
    return { action, email, operator, reason, role, fullName, password: input.password } as const;
  }
  if (input.password !== undefined || input.fullName !== undefined) throw new InputError('Use o procedimento próprio para redefinir senha; nome não é alterado por este comando.');
  if (role === undefined && input.isActive === undefined) throw new InputError('Informe perfil ou ativação para alterar o acesso.');
  return { action, email, operator, reason, role, isActive: input.isActive as boolean | undefined } as const;
}

interface PublicAccount { id: string; fullName: string; email: string; role: UserRole; isActive: boolean }
const publicColumns = 'id, full_name AS "fullName", email, role, is_active AS "isActive"';

/** Privileged host operation, like admin:create. Never mounted as a public route. */
export async function manageUser(input: UserManagementInput): Promise<PublicAccount> {
  const command = validateUserManagement(input);
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatória. Gestão de equipe exige PostgreSQL.');
  // Bcrypt outside the shared transaction lock.
  const hash = command.action === 'create' ? await PasswordService.hashPassword(command.password) : undefined;
  return unitOfWork(async () => {
    const found = await query<PublicAccount>(`SELECT ${publicColumns} FROM core.users WHERE lower(email)=$1 FOR UPDATE`, [command.email]);
    if ((found.rowCount ?? 0) > 1) throw new InputError('E-mail ambíguo no cadastro existente. Nenhuma conta foi alterada.');
    const previous = found.rows[0];
    let account: PublicAccount;
    if (command.action === 'create') {
      if (previous) throw new InputError('E-mail já cadastrado. Nenhuma conta foi alterada.');
      const result = await query<PublicAccount>(`INSERT INTO core.users(id,full_name,email,password_hash,role,is_active)
        VALUES($1,$2,$3,$4,$5,true) RETURNING ${publicColumns}`,
      [crypto.randomUUID(), command.fullName, command.email, hash, command.role]);
      account = result.rows[0];
    } else {
      if (!previous) throw new InputError('Conta não encontrada. Nenhuma conta foi criada.');
      const role = command.role ?? previous.role;
      const isActive = command.isActive ?? previous.isActive;
      if (role === previous.role && isActive === previous.isActive) return previous;
      if (previous.role === 'admin' && previous.isActive && (role !== 'admin' || !isActive)) {
        const admins = await query('SELECT id FROM core.users WHERE role=$1 AND is_active=true FOR UPDATE', ['admin']);
        if (admins.rowCount! <= 1) throw new InputError('Não é permitido remover o último administrador ativo.');
      }
      const result = await query<PublicAccount>(`UPDATE core.users SET role=$1,is_active=$2,updated_at=NOW()
        WHERE id=$3 RETURNING ${publicColumns}`, [role, isActive, previous.id]);
      account = result.rows[0];
      await query('DELETE FROM core.sessions WHERE user_id=$1', [account.id]);
      await query('DELETE FROM core.password_reset_tokens WHERE user_id=$1', [account.id]);
    }
    await auditService.log({ actorName: command.operator, actorRole: 'system', entityName: 'users', entityId: account.id,
      action: command.action === 'create' ? 'USER_CREATED_BY_OPERATOR' : 'USER_ACCESS_CHANGED_BY_OPERATOR',
      oldData: previous ? { role: previous.role, isActive: previous.isActive } : undefined,
      newData: { role: account.role, isActive: account.isActive }, notes: command.reason });
    return account;
  });
}
