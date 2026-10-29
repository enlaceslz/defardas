/**
 * DE FARDAS ERP — Drizzle ORM Instance & PostgreSQL Pool
 * Centraliza a conexão tipada com o banco PostgreSQL próprio da DE FARDAS.
 * Correção P0-005: Suporte a SSL com validação estrita e certificados CA configuráveis.
 */
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import * as schema from './schema/index';
import { databasePoolOptions } from './config';
import { logOperationalError } from '../observability/errors';

const { Pool } = pg;

function createPgPool(): pg.Pool {
  try { return new Pool(databasePoolOptions(process.env)); }
  catch (error) {
    logOperationalError('database_connect', error);
    throw error;
  }
}

export const pool = createPgPool();
const rootDb = drizzle(pool, { schema });
const transactionContext = new AsyncLocalStorage<{ client: pg.PoolClient; database: NodePgDatabase<typeof schema> }>();
export const db: NodePgDatabase<typeof schema> = new Proxy(rootDb, {
  get(target, property) {
    const database = transactionContext.getStore()?.database || target;
    const value = Reflect.get(database, property);
    return typeof value === 'function' ? value.bind(database) : value;
  },
});

export async function query<T extends pg.QueryResultRow = any>(text: string, values?: any[]): Promise<pg.QueryResult<T>> {
  const client = transactionContext.getStore()?.client || pool;
  return client.query<T>(text, values);
}

export async function withPgTransaction<T>(operation: () => Promise<T>): Promise<T> {
  if (transactionContext.getStore()) return operation();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serializa mutações ERP entre processos. Lock curto, liberado no commit/rollback.
    // Prioriza integridade inicial; pode evoluir para locks por agregado após medição.
    await client.query('SELECT pg_advisory_xact_lock(4466272601)');
    const result = await transactionContext.run({ client, database: drizzle(client, { schema }) }, operation);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export type AppDatabase = typeof db;
export { schema };

// Cada requisição transacional mantém seu próprio cliente; repositórios não abrem
// conexões independentes no meio de conversões ou baixas.
