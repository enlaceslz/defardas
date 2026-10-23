/**
 * DE FARDAS ERP — Drizzle ORM Instance & PostgreSQL Pool
 * Centraliza a conexão tipada com o banco PostgreSQL próprio da DE FARDAS.
 * Correção P0-005: Suporte a SSL com validação estrita e certificados CA configuráveis.
 */
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index';

const { Pool } = pg;

function createPgPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  const isProd = process.env.NODE_ENV === 'production';
  const sslMode = process.env.DATABASE_SSL_MODE || (isProd ? 'require' : 'disable');

  let sslConfig: boolean | pg.ConnectionConfig['ssl'] = false;
  if (sslMode === 'require' || sslMode === 'verify-full') {
    if (process.env.DATABASE_CA_CERT) {
      sslConfig = {
        rejectUnauthorized: true,
        ca: process.env.DATABASE_CA_CERT,
      };
    } else if (isProd && process.env.DATABASE_ALLOW_INSECURE_SSL !== 'true') {
      // Produção: Validação estrita por padrão (P0-005)
      sslConfig = {
        rejectUnauthorized: true,
      };
    } else {
      sslConfig = {
        rejectUnauthorized: false,
      };
    }
  }

  return new Pool({
    connectionString: connectionString || undefined,
    ssl: sslConfig || undefined,
    max: parseInt(process.env.DATABASE_POOL_MAX || '20', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

export const pool = createPgPool();
export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });
export type AppDatabase = typeof db;
export { schema };
