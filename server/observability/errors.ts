import crypto from 'node:crypto';

const knownCodes = new Set(['DATABASE_CONFIG_INVALID', 'DATABASE_URL_MISSING', '23505', '23503', '23514', '22P02', '42P01', '42703', '28P01', '53300',
  '57P01', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT']);
export type ErrorContext = 'api' | 'startup' | 'database_connect' | 'user_repository' | 'password_compare' |
  'session_cleanup' | 'migration' | 'admin_provision' | 'password_reset';

/** Never serialize errors, messages, stacks, causes, requests or arbitrary error codes. */
export function operationalErrorCode(error: unknown): string {
  try {
    let current = error;
    // Drizzle encapsula erros PG. Ler apenas códigos permitidos, sem serializar causas.
    for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth++) {
      const code = 'code' in current ? current.code : undefined;
      if (typeof code === 'string' && knownCodes.has(code)) return code;
      current = 'cause' in current ? current.cause : undefined;
    }
    return 'UNCLASSIFIED';
  } catch { return 'UNCLASSIFIED'; }
}
export function logOperationalError(context: ErrorContext, error: unknown): string {
  const incidentId = crypto.randomUUID();
  console.error(JSON.stringify({ event: 'operation_failed', context, incidentId, code: operationalErrorCode(error) }));
  return incidentId;
}
