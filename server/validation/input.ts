export class InputError extends Error { status = 400; }
export function text(value: unknown, name: string, max = 200, required = true): string {
  if (value === undefined || value === null || value === '') {
    if (required) throw new InputError(`${name} é obrigatório.`);
    return '';
  }
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new InputError(`${name} inválido.`);
  return value.trim();
}
export function number(value: unknown, name: string, minimum = 0, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || (integer && !Number.isSafeInteger(value))) throw new InputError(`${name} inválido.`);
  return value;
}
export function oneOf<T extends string>(value: unknown, allowed: readonly T[], name: string): T {
  if (!allowed.includes(value as T)) throw new InputError(`${name} inválido.`);
  return value as T;
}
export function date(value: unknown, name: string): string {
  const result = text(value, name, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) throw new InputError(`${name} inválida.`);
  return result;
}
export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function sizes(value: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Grade obrigatória.');
  const result = { pp: 0, p: 0, m: 0, g: 0, gg: 0, xg: 0, exg: 0, sobMedida: 0 };
  for (const key of Object.keys(result) as (keyof typeof result)[]) result[key] = number(value[key] ?? 0, `Grade ${key}`, 0, true);
  if (Object.values(result).reduce((a, b) => a + b, 0) < 1) throw new InputError('Informe ao menos uma peça.');
  return result;
}
