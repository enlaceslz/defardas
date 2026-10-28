import 'dotenv/config';
import { pool } from '../server/db/index';
import { manageUser } from '../server/auth/userManagementService';

try {
  const active = process.env.ERP_USER_ACTIVE;
  if (active !== undefined && active !== 'true' && active !== 'false') throw new Error('ERP_USER_ACTIVE deve ser true ou false.');
  await manageUser({ action: process.env.ERP_USER_ACTION, email: process.env.ERP_USER_EMAIL,
    fullName: process.env.ERP_USER_NAME, password: process.env.ERP_USER_PASSWORD,
    role: process.env.ERP_USER_ROLE, isActive: active === undefined ? undefined : active === 'true',
    operator: process.env.ERP_USER_OPERATOR, reason: process.env.ERP_USER_REASON });
  console.log('Gestão de acesso concluída. Nenhuma credencial foi exibida.');
} catch (error) {
  // Do not print database errors, inputs, hashes or connection strings.
  const { InputError } = await import('../server/validation/input');
  const known = error instanceof InputError || (error instanceof Error && /^(DATABASE_URL obrigatória|ERP_USER_ACTIVE deve)/.test(error.message));
  console.error(known ? (error as Error).message : 'Falha na gestão de acesso. A operação não foi confirmada.');
  process.exitCode = 1;
} finally { await pool.end(); }
