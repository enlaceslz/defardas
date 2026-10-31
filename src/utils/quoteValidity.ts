// Dias corridos de 24h; limite técnico de representação, sem política comercial nova.
export function quoteValidity(days: number, reference = new Date()): string {
  if (!Number.isSafeInteger(days) || days < 1 || days > 2147483647) throw new Error('Informe uma validade inteira positiva.');
  const instant = new Date(reference.getTime() + days * 86400000);
  if (!Number.isFinite(reference.getTime()) || !Number.isFinite(instant.getTime())) throw new Error('A validade gera uma data não representável.');
  const result = instant.toISOString().slice(0, 10);
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error('A validade deve gerar uma data entre os anos 0001 e 9999.');
  return result;
}
