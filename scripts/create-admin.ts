import 'dotenv/config';
import crypto from 'node:crypto';
import { pool, query } from '../server/db/index';
import { unitOfWork } from '../server/db/unitOfWork';
import { PasswordService } from '../server/auth/passwordService';
import { text } from '../server/validation/input';

try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatória.');
  const email = text(process.env.ADMIN_EMAIL, 'ADMIN_EMAIL', 150).toLowerCase();
  const fullName = text(process.env.ADMIN_NAME, 'ADMIN_NAME', 120);
  const password = process.env.ADMIN_PASSWORD || '';
  const strength = PasswordService.validatePasswordStrength(password);
  if (!strength.valid) throw new Error(strength.reason);
  const hash = await PasswordService.hashPassword(password);
  await unitOfWork(async () => {
    const existing = await query('SELECT id FROM core.users WHERE lower(email)=$1', [email]);
    if (existing.rowCount) throw new Error('E-mail já cadastrado. Nenhuma conta foi alterada.');
    await query(`INSERT INTO core.users(id,full_name,email,password_hash,role,is_active) VALUES($1,$2,$3,$4,'admin',true)`, [crypto.randomUUID(), fullName, email, hash]);
  });
  console.log('Administrador criado. Nenhuma senha foi exibida ou gravada em arquivo.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha no provisionamento.');
  process.exitCode = 1;
} finally { await pool.end(); }
