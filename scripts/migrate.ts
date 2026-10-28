import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from '../server/db/index';
try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatória para migração.');
  await migrate(db, { migrationsFolder: 'drizzle' });
  console.log('Migrações Drizzle concluídas.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha nas migrações.');
  process.exitCode = 1;
} finally { await pool.end(); }
