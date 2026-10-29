import { logOperationalError } from '../server/observability/errors';
import { InputError } from '../server/validation/input';
import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from '../server/db/index';
try {
  if (!process.env.DATABASE_URL) throw new InputError('DATABASE_URL obrigatória para migração.');
  await migrate(db, { migrationsFolder: 'drizzle' });
  console.log('Migrações Drizzle concluídas.');
} catch (error) {
  if (error instanceof InputError) console.error(error.message);
  else { logOperationalError('migration', error); console.error('Falha nas migrações. Operação não confirmada.'); }
  process.exitCode = 1;
} finally { await pool.end(); }
