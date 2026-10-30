export class InputError extends Error { status = 400; }
export function text(value: unknown, name: string, max = 200, required = true): string {
  if (value === undefined || value === null || value === '') {
    if (required) throw new InputError(`${name} é obrigatório.`);
    return '';
  }
  // PostgreSQL não representa U+0000 em text/varchar; rejeitar, sem remover silenciosamente.
  if (typeof value !== 'string' || value.includes('\u0000') || value.trim().length > max || (required && !value.trim())) throw new InputError(`${name} inválido.`);
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
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) throw new InputError(`${name} inválida.`);
  return result;
}
export { roundCurrency as money } from '../../shared/pricingEngine';
export function customizations(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new InputError('Personalizações devem ser uma lista.');
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new InputError('Personalização inválida.');
    // Estrutura já utilizada nas fichas e impressões. O limite do corpo HTTP continua aplicável.
    const field = (value: unknown, name: string, required = false) => text(value, name, Number.MAX_SAFE_INTEGER, required);
    return {
      id: field(item.id, 'Identificador da personalização', true),
      type: oneOf(item.type, ['bordado_peito', 'bordado_costas', 'silk_1cor', 'silk_policromia',
        'sublimacao', 'patch_emborrachado', 'faixa_refletiva'] as const, 'Tipo da personalização'),
      description: field(item.description, 'Descrição da personalização'),
      location: field(item.location, 'Posição da personalização'),
      unitCost: number(item.unitCost, 'Custo da personalização'),
      ...(item.partnerName === undefined ? {} : { partnerName: field(item.partnerName, 'Parceiro da personalização') }),
    };
  });
}
export function sizes(value: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Grade obrigatória.');
  const result = { pp: 0, p: 0, m: 0, g: 0, gg: 0, xg: 0, exg: 0, sobMedida: 0 };
  for (const key of Object.keys(result) as (keyof typeof result)[]) result[key] = number(value[key] ?? 0, `Grade ${key}`, 0, true);
  if (Object.values(result).reduce((a, b) => a + b, 0) < 1) throw new InputError('Informe ao menos uma peça.');
  return result;
}
