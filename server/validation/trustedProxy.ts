import { isIP } from 'node:net';
// Somente endereços de infraestrutura explicitamente confiáveis; nunca número de saltos.
export function trustedProxy(value: string | undefined): false | string[] {
  if (value === undefined || value.trim() === '') return false;
  const entries = value.split(',').map(entry => entry.trim());
  for (const entry of entries) {
    const parts = entry.split('/'); const family = isIP(parts[0]);
    if (!family || parts.length > 2 || (parts.length === 2 &&
      (!/^[1-9]\d*$/.test(parts[1]) || Number(parts[1]) > (family === 4 ? 32 : 128)))) {
      throw new Error('TRUST_PROXY_CIDRS deve conter IPs ou CIDRs explícitos separados por vírgula, sem /0.');
    }
  }
  return [...new Set(entries)];
}
