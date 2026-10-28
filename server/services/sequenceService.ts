import { query } from '../db/index';

// Contadores são transacionais e inicializados pela migração 0001.
const definitions = {
  quote: ['ORC', 1002], order: ['OP', 102], client: ['CLI', 203],
  finance: ['FIN', 5002], inventory: ['MAT', 303], lead: ['LEAD', 102], movement: ['MOV', 102],
} as const;
class SequenceService {
  private memory = new Map<string, number>();
  private async next(type: keyof typeof definitions): Promise<string> {
    let value: number;
    if (process.env.DATABASE_URL || process.env.NODE_ENV === 'production') {
      const result = await query<{ value: string }>(`UPDATE core.number_counters SET value = value + 1 WHERE kind = $1 RETURNING value`, [type]);
      if (!result.rows[0]) throw new Error(`Contador ${type} ausente. Execute as migrações.`);
      value = Number(result.rows[0].value);
    } else {
      value = this.memory.get(type) ?? definitions[type][1];
      this.memory.set(type, value + 1);
    }
    const year = new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(new Date());
    return `${definitions[type][0]}-${year}-${String(value).padStart(4, '0')}`;
  }
  nextQuoteNumber() { return this.next('quote'); }
  nextOrderNumber() { return this.next('order'); }
  nextClientCode() { return this.next('client'); }
  nextFinanceNumber() { return this.next('finance'); }
  nextInventoryCode() { return this.next('inventory'); }
  nextLeadNumber() { return this.next('lead'); }
  nextMovementNumber() { return this.next('movement'); }
}
export const sequenceService = new SequenceService();
