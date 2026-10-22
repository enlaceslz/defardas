/**
 * DE FARDAS ERP — Atomic Sequence Service
 * Substitui IDs aleatórios (Date.now(), Math.random()) por identificadores únicos,
 * contínuos, legíveis e seguros para conformidade comercial e fiscal.
 */

class SequenceService {
  private currentYear: number;
  private sequences: Map<string, number>;

  constructor() {
    this.currentYear = new Date().getFullYear();
    this.sequences = new Map<string, number>([
      ['quote', 1001],
      ['order', 101],
      ['client', 201],
      ['finance', 5001],
      ['inventory', 301],
      ['lead', 101],
      ['movement', 101],
    ]);
  }

  public nextQuoteNumber(): string {
    const nextVal = this.increment('quote');
    return `ORC-${this.currentYear}-${nextVal}`;
  }

  public nextOrderNumber(): string {
    const nextVal = this.increment('order');
    const padded = String(nextVal).padStart(4, '0');
    return `OP-${this.currentYear}-${padded}`;
  }

  public nextClientCode(): string {
    const nextVal = this.increment('client');
    const padded = String(nextVal).padStart(4, '0');
    return `CLI-${this.currentYear}-${padded}`;
  }

  public nextFinanceNumber(): string {
    const nextVal = this.increment('finance');
    return `FIN-${this.currentYear}-${nextVal}`;
  }

  public nextInventoryCode(): string {
    const nextVal = this.increment('inventory');
    const padded = String(nextVal).padStart(4, '0');
    return `MAT-${this.currentYear}-${padded}`;
  }

  public nextLeadNumber(): string {
    const nextVal = this.increment('lead');
    const padded = String(nextVal).padStart(4, '0');
    return `LEAD-${this.currentYear}-${padded}`;
  }

  public nextMovementNumber(): string {
    const nextVal = this.increment('movement');
    const padded = String(nextVal).padStart(4, '0');
    return `MOV-${this.currentYear}-${padded}`;
  }

  public setSequenceStartingPoint(type: string, lastUsedNumber: number): void {
    const current = this.sequences.get(type) || 0;
    if (lastUsedNumber >= current) {
      this.sequences.set(type, lastUsedNumber + 1);
    }
  }

  private increment(type: string): number {
    const current = this.sequences.get(type) || 1000;
    this.sequences.set(type, current + 1);
    return current;
  }
}

export const sequenceService = new SequenceService();
