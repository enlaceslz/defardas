// Sem coerção parcial: mesma porta deve ser usada pelo listener e pelo healthcheck.
export function httpPort(value: string | undefined): number {
  if (value === undefined) return 3000;
  if (!/^[1-9]\d*$/.test(value)) throw new Error('PORT deve ser um inteiro decimal entre 1 e 65535.');
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port > 65535) throw new Error('PORT deve ser um inteiro decimal entre 1 e 65535.');
  return port;
}
