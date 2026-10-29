import { date, number, InputError } from './input';

// Prazo continua em dias corridos de 24h, como no contrato existente.
// O teto é de representação integer/AAAA-MM-DD, não uma política comercial de prazo.
export function productionDeadline(value: unknown, reference = new Date()) {
  const days = number(value, 'Prazo de produção', 1, true);
  if (days > 2147483647) throw new InputError('Prazo de produção excede a capacidade inteira do banco.');
  const instant = reference.getTime();
  const delivery = new Date(instant + days * 86400000);
  if (!Number.isFinite(instant) || !Number.isFinite(delivery.getTime())) {
    throw new InputError('Prazo de produção gera data de entrega não representável.');
  }
  return { days, deliveryDate: date(delivery.toISOString().slice(0, 10), 'Data de entrega calculada') };
}
