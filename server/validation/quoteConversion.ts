import type { QuoteEntity, ProductionOrderEntity, FinancialTransactionEntity } from '../types/db';

// Critério estrutural compartilhado por replay e novas baixas. Não repara histórico.
export function completeQuoteConversion(quote: QuoteEntity, existing: ProductionOrderEntity[], receivables: FinancialTransactionEntity[]): boolean {
  const orderIds = new Set(existing.map((order) => order.id));
  return quote.isLocked && quote.commercialStatus === 'convertido_em_pedido' &&
      orderIds.has(quote.convertedOrderId || '') && quote.items.length > 0 && existing.length === quote.items.length &&
      new Set(existing.map((order) => order.quoteItemId)).size === quote.items.length &&
      existing.every((order) => order.quoteVersion === quote.version && order.clientId === quote.clientId &&
        quote.items.some((item) => item.id === order.quoteItemId && item.totalQuantity === order.totalPieces)) &&
      receivables.length === 2 && ['entrada_pedido', 'saldo_entrega'].every((kind) => {
        const matches = receivables.filter((title) => title.subType === kind);
        return matches.length === 1 && orderIds.has(matches[0].productionOrderId || '') && Number.isFinite(matches[0].amount) && matches[0].amount > 0 &&
          matches[0].amount === (kind === 'entrada_pedido' ? quote.entryAmount : quote.balanceAmount);
      });
}
