import type { Client, InventoryItem, FinancialTransaction, Quote, ProductionOrder, CostBreakdown } from '../types/erp';

export const mapClient = (row: any): Client => ({ ...row, id: row.code || row.id, backendId: row.id,
  stateRegistration: row.stateRegistration || '', standardUniformNotes: row.standardUniformNotes || '',
  createdAt: row.createdAt?.slice(0, 10) || '' });
export const mapInventory = (row: any): InventoryItem => ({ ...row, id: row.code || row.id, backendId: row.id,
  currentStock: row.physicalStock, costPrice: row.unitCostPrice });
export const mapFinance = (row: any): FinancialTransaction => ({ ...row, id: row.transactionNumber || row.id, backendId: row.id });
function cost(item: any): CostBreakdown {
  const base = item.calculatedBaseUnitCost ?? 0;
  const negotiated = item.negotiatedUnitPrice ?? 0;
  const suggested = item.suggestedUnitPrice ?? 0;
  return { materialUnitCost: item.materialUnitCost ?? 0, outsourcedSewingUnitCost: item.outsourcedSewingUnitCost ?? 0,
    customizationUnitCost: item.customizationUnitCost ?? 0, freightPerUnit: item.freightUnitCost ?? 0,
    technicalLossPercentage: item.technicalLossPercentage ?? 0, calculatedBaseCost: base,
    markupPercentage: item.markupPercentage ?? 0, suggestedUnitPrice: suggested, negotiatedUnitPrice: negotiated,
    discountPercentage: suggested > 0 ? Math.max(0, (suggested - negotiated) / suggested * 100) : 0,
    belowSuggestedAuthorized: false, estimatedMarginPercentage: negotiated > 0 ? (negotiated - base) / negotiated * 100 : 0 };
}
export function mapQuote(row: any, clients: any[]): Quote {
  const client = clients.find((c) => c.id === row.clientId);
  return { ...row, id: row.quoteNumber || row.id, backendId: row.id, clientId: client?.code || row.clientId,
    clientContact: client?.contactName || '', clientPhone: client?.phone || '', clientEmail: client?.email || '',
    items: row.items.map((item: any) => ({ ...item, costBreakdown: { ...cost(item), belowSuggestedAuthorized: row.belowSuggestedAuthorized },
      unitFinalPrice: item.negotiatedUnitPrice, totalPrice: item.totalItemPrice, customizations: item.customizations || [] })),
    subtotal: row.suggestedTotalAmount, totalAmount: row.negotiatedTotalAmount, discountPercentage: 0,
    balanceDueAtDelivery: row.balanceAmount, status: row.commercialStatus, notes: row.notes || '', convertedToOrderId: row.convertedOrderId };
}
export function mapOrder(row: any, clients: any[], quotes: any[]): ProductionOrder {
  const quote = quotes.find((q) => q.id === row.quoteId);
  const item = quote?.items.find((i: any) => i.id === row.quoteItemId) || (quote?.items.length === 1 ? quote.items[0] : undefined);
  const client = clients.find((c) => c.id === row.clientId);
  return { ...row, id: row.orderNumber || row.id, backendId: row.id, clientId: client?.code || row.clientId,
    quoteId: quote?.quoteNumber || row.quoteId, costBreakdown: cost(item || {}), materials: [],
    customizations: row.customizations || [], technicalNotes: row.technicalNotes || '',
    canStartProduction: Boolean(row.artApproved && row.entryPaymentConfirmed) };
}
