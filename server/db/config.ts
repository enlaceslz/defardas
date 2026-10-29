import type pg from 'pg';

export class DatabaseConfigurationError extends Error {
  readonly code = 'DATABASE_CONFIG_INVALID';
  constructor() { super('Configuração PostgreSQL inválida. Revise as opções documentadas sem expor credenciais.'); }
}

// A política TLS é definida pelo ambiente da aplicação, nunca por overrides do driver na URL.
export function databasePoolOptions(env: NodeJS.ProcessEnv): pg.PoolConfig {
  const mode = env.DATABASE_SSL_MODE === undefined
    ? (env.NODE_ENV === 'production' ? 'require' : 'disable')
    : env.DATABASE_SSL_MODE.trim().toLowerCase();
  if (!['disable', 'require', 'verify-full'].includes(mode)) throw new DatabaseConfigurationError();
  const insecure = env.DATABASE_ALLOW_INSECURE_SSL;
  if (insecure !== undefined && insecure !== 'true' && insecure !== 'false') throw new DatabaseConfigurationError();
  if (insecure === 'true' && mode !== 'require') throw new DatabaseConfigurationError();
  const max = env.DATABASE_POOL_MAX ?? '20';
  if (!/^[1-9]\d*$/.test(max) || !Number.isSafeInteger(Number(max))) throw new DatabaseConfigurationError();

  let connectionString = env.DATABASE_URL || undefined;
  if (connectionString) {
    let url: URL;
    try { url = new URL(connectionString); } catch { throw new DatabaseConfigurationError(); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new DatabaseConfigurationError();
    const tlsOptions = [...url.searchParams].filter(([name]) => /^ssl/i.test(name) || name.toLowerCase() === 'uselibpqcompat');
    // Compatibilidade com a URL interna do Compose: sslmode é redundante e só pode concordar.
    if (tlsOptions.some(([name, value]) => name !== 'sslmode' || value !== mode) || tlsOptions.length > 1) {
      throw new DatabaseConfigurationError();
    }
    url.searchParams.delete('sslmode');
    connectionString = url.toString();
  }

  const ca = env.DATABASE_CA_CERT?.trim();
  const ssl: pg.ConnectionConfig['ssl'] = mode === 'disable' ? false : {
    rejectUnauthorized: insecure !== 'true', ...(ca ? { ca } : {}),
  };
  if (ca && (mode === 'disable' || insecure === 'true')) throw new DatabaseConfigurationError();
  return { connectionString, ssl, max: Number(max), idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 };
}
