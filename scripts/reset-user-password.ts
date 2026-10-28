import 'dotenv/config';
import { pool } from '../server/db/index';
import { passwordResetService } from '../server/auth/passwordResetService';
import { text } from '../server/validation/input';

try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatória.');
  const email = text(process.env.RESET_USER_EMAIL, 'RESET_USER_EMAIL', 150).toLowerCase();
  const password = process.env.RESET_USER_PASSWORD || '';
  // Remover a senha do ambiente antes de executar o restante da operação.
  delete process.env.RESET_USER_PASSWORD;
  if (!await passwordResetService.resetByEmail(email, password)) throw new Error('Conta ativa não encontrada. Nenhuma senha foi alterada.');
  console.log('Senha redefinida. Sessões e tokens anteriores revogados. Nenhuma credencial foi exibida.');
} catch (error) {
  // Não imprimir objetos de erro SQL: parâmetros podem conter informações privadas.
  console.error(error instanceof Error && !('code' in error) ? error.message : 'Falha na redefinição. Operação não confirmada.');
  process.exitCode = 1;
} finally { await pool.end(); }
