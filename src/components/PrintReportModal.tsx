import React from 'react';
import { X, Printer, BarChart3, Wallet } from 'lucide-react';
import {
  CompanyProfile,
  FinancialTransaction,
  InventoryItem,
  ProductionOrder,
  Quote,
} from '../types/erp';
import { formatCurrencyBRL, formatDateBR, getStageLabel } from '../utils/formatters';

interface PrintReportModalProps {
  mode: 'executive' | 'financial';
  profile: CompanyProfile;
  orders?: ProductionOrder[];
  quotes?: Quote[];
  inventory?: InventoryItem[];
  transactions?: FinancialTransaction[];
  filterSummary?: string;
  generatedBy?: string;
  onClose: () => void;
}

export const PrintReportModal: React.FC<PrintReportModalProps> = ({
  mode,
  profile,
  orders = [],
  quotes = [],
  inventory = [],
  transactions = [],
  filterSummary,
  generatedBy,
  onClose,
}) => {
  const now = new Date();
  const generatedDate = now.toLocaleDateString('pt-BR');
  const generatedTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Executive metrics
  const activeOrders = orders.filter((o) => o.stage !== 'entregue');
  const blockedOrders = activeOrders.filter((o) => !o.canStartProduction);
  const totalPiecesActive = activeOrders.reduce((sum, o) => sum + o.totalPieces, 0);
  const monthlyCapacity = Math.max(1, profile.productionCapacityPiecesMonth || 5000);
  const capacityPercent = Math.min(100, Math.round((totalPiecesActive / monthlyCapacity) * 100));
  const lowStockItems = inventory.filter((i) => i.currentStock <= i.minStock);
  const openQuotes = quotes.filter((q) => ['enviado', 'em_negociacao', 'aprovado'].includes(q.status));
  const openQuotesAmount = openQuotes.reduce((sum, q) => sum + q.totalAmount, 0);

  // Financial metrics (exclude reversed from operational balances)
  const activeFin = transactions.filter((t) => t.status !== 'estornado');
  const totalReceberOpen = activeFin
    .filter((t) => t.type === 'receber' && (t.status === 'pendente' || t.status === 'atrasado'))
    .reduce((sum, t) => sum + t.amount, 0);
  const totalPagarOpen = activeFin
    .filter((t) => t.type === 'pagar' && (t.status === 'pendente' || t.status === 'atrasado'))
    .reduce((sum, t) => sum + t.amount, 0);
  const totalReceived = activeFin
    .filter((t) => t.type === 'receber' && t.status === 'pago')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalPaid = activeFin
    .filter((t) => t.type === 'pagar' && t.status === 'pago')
    .reduce((sum, t) => sum + t.amount, 0);
  const realizedCash = totalReceived - totalPaid;
  const projectedBalance = realizedCash + totalReceberOpen - totalPagarOpen;

  const title =
    mode === 'financial'
      ? 'Relatório Financeiro & Fluxo de Caixa'
      : 'Relatório Executivo de Produção, Comercial & Estoque';

  const reportCode =
    mode === 'financial'
      ? `REL-FIN-${now.toISOString().slice(0, 10).replace(/-/g, '')}`
      : `REL-GER-${now.toISOString().slice(0, 10).replace(/-/g, '')}`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full overflow-hidden border border-slate-200">
        {/* Toolbar (hidden when printing) */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white no-print">
          <div className="flex items-center gap-2">
            {mode === 'financial' ? (
              <Wallet className="w-4 h-4 text-emerald-400" />
            ) : (
              <BarChart3 className="w-4 h-4 text-blue-400" />
            )}
            <span className="text-sm font-bold">{title}</span>
            <span className="text-xs text-slate-400 font-mono">[{reportCode}]</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Salvar PDF (Ctrl+P)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              aria-label="Fechar relatório"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Report Page */}
        <div className="p-8 sm:p-10 space-y-6 text-slate-900 bg-white print-page text-xs">
          {/* Institutional Letterhead with Logo */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between border-b-2 border-slate-900 pb-5 gap-4">
            <div className="flex items-start gap-4">
              {profile.logoUrl && (
                <div className="shrink-0 flex items-center justify-center bg-white border border-slate-200 rounded-lg p-2 max-w-[140px] max-h-[72px]">
                  <img
                    src={profile.logoUrl}
                    alt={`Logomarca ${profile.tradeName}`}
                    className="max-h-14 max-w-[124px] w-auto object-contain"
                  />
                </div>
              )}
              <div>
                <div className="text-xl font-black tracking-tight text-slate-900">
                  {profile.tradeName}
                </div>
                <div className="text-xs text-slate-600 font-mono mt-0.5">
                  {profile.name} · CNPJ: {profile.cnpj} {profile.ie ? `· I.E.: ${profile.ie}` : ''}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {profile.address}
                  {profile.neighborhood ? ` - ${profile.neighborhood}` : ''}, {profile.city}/{profile.state} · CEP:{' '}
                  {profile.cep}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Tel/WhatsApp: {profile.phone} · E-mail: {profile.email}
                </div>
              </div>
            </div>

            <div className="text-left sm:text-right shrink-0">
              <div className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">
                Relatório Gerencial Oficial
              </div>
              <div className="text-lg font-black text-blue-700 mt-0.5">{title}</div>
              <div className="text-xs text-slate-600 font-mono mt-1">
                Código: {reportCode} · Emissão: {generatedDate} às {generatedTime}
              </div>
              {generatedBy && (
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Emitido por: <span className="font-semibold text-slate-800">{generatedBy}</span>
                </div>
              )}
            </div>
          </div>

          {filterSummary && (
            <div className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600">
              <strong className="text-slate-800">Escopo / Filtros Aplicados:</strong> {filterSummary}
            </div>
          )}

          {/* Mode: Financial Report */}
          {mode === 'financial' ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-500 font-semibold">A Receber (Em Aberto)</div>
                  <div className="text-base font-black font-mono text-emerald-700 mt-1">
                    {formatCurrencyBRL(totalReceberOpen)}
                  </div>
                </div>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-500 font-semibold">A Pagar (Em Aberto)</div>
                  <div className="text-base font-black font-mono text-rose-700 mt-1">
                    {formatCurrencyBRL(totalPagarOpen)}
                  </div>
                </div>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-500 font-semibold">Caixa Realizado Líquido</div>
                  <div className={`text-base font-black font-mono mt-1 ${realizedCash >= 0 ? 'text-slate-900' : 'text-rose-700'}`}>
                    {formatCurrencyBRL(realizedCash)}
                  </div>
                </div>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-500 font-semibold">Saldo Projetado Final</div>
                  <div className={`text-base font-black font-mono mt-1 ${projectedBalance >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>
                    {formatCurrencyBRL(projectedBalance)}
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-100 px-4 py-2 font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 flex justify-between">
                  <span>Detalhamento de Lançamentos ({transactions.length} registros)</span>
                  <span className="font-mono text-slate-600">
                    Entradas Liquidadas: {formatCurrencyBRL(totalReceived)} · Saídas Liquidadas: {formatCurrencyBRL(totalPaid)}
                  </span>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-2 px-3">Nº Título</th>
                      <th className="py-2 px-3">Tipo</th>
                      <th className="py-2 px-3">Descrição / Ref.</th>
                      <th className="py-2 px-3">Vencimento</th>
                      <th className="py-2 px-3">Forma</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3 text-right">Valor (R$)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {transactions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-400">
                          Nenhum lançamento financeiro no escopo selecionado.
                        </td>
                      </tr>
                    ) : (
                      transactions.map((t) => (
                        <tr key={t.id} className={t.status === 'estornado' ? 'text-slate-400 line-through' : ''}>
                          <td className="py-2 px-3 font-mono text-[11px]">{t.transactionNumber || t.id.slice(0, 8)}</td>
                          <td className="py-2 px-3 font-semibold">{t.type === 'receber' ? 'Receber' : 'Pagar'}</td>
                          <td className="py-2 px-3">
                            <div className="font-semibold text-slate-900">{t.description}</div>
                            {t.referenceId && (
                              <span className="text-[10px] font-mono text-blue-700">Ref: {t.referenceId}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono">{formatDateBR(t.dueDate)}</td>
                          <td className="py-2 px-3 uppercase font-mono text-[11px]">{t.paymentMethod}</td>
                          <td className="py-2 px-3 uppercase font-semibold text-[11px]">{t.status}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold">
                            {formatCurrencyBRL(t.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            /* Mode: Executive Production & Commercial Report */
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-500 font-semibold">OPs Ativas no Chão de Fábrica</div>
                  <div className="text-base font-black font-mono text-slate-900 mt-1">
                    {activeOrders.length} OPs ({totalPiecesActive} pçs)
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {blockedOrders.length} bloqueada(s) pelo Gate A.3.2
                  </div>
                </div>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-500 font-semibold">Ocupação da Capacidade Mensal</div>
                  <div className="text-base font-black font-mono text-blue-700 mt-1">{capacityPercent}%</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Meta: {monthlyCapacity.toLocaleString('pt-BR')} pçs/mês
                  </div>
                </div>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-500 font-semibold">Carteira de Propostas Abertas</div>
                  <div className="text-base font-black font-mono text-emerald-700 mt-1">
                    {formatCurrencyBRL(openQuotesAmount)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{openQuotes.length} proposta(s) em aberto</div>
                </div>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-500 font-semibold">Alertas de Estoque Crítico</div>
                  <div className={`text-base font-black font-mono mt-1 ${lowStockItems.length > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {lowStockItems.length} item(ns)
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    De {inventory.length} insumos cadastrados
                  </div>
                </div>
              </div>

              {/* Active Production Orders */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-100 px-4 py-2 font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200">
                  1. Ordens de Produção Ativas ({activeOrders.length})
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-2 px-3">OP</th>
                      <th className="py-2 px-3">Cliente</th>
                      <th className="py-2 px-3">Modelo / Tecido</th>
                      <th className="py-2 px-3 text-right">Qtd</th>
                      <th className="py-2 px-3">Estágio</th>
                      <th className="py-2 px-3">Gate A.3.2</th>
                      <th className="py-2 px-3">Entrega</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {activeOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-4 text-center text-slate-400">
                          Nenhuma ordem de produção ativa no momento.
                        </td>
                      </tr>
                    ) : (
                      activeOrders.map((o) => (
                        <tr key={o.id}>
                          <td className="py-2 px-3 font-mono font-bold text-blue-700">{o.orderNumber || o.id}</td>
                          <td className="py-2 px-3 font-semibold text-slate-900">{o.clientName}</td>
                          <td className="py-2 px-3">
                            <div>{o.itemTitle}</div>
                            <div className="text-[10px] text-slate-500">
                              {o.fabricName} · {o.fabricColor}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold">{o.totalPieces}</td>
                          <td className="py-2 px-3">{getStageLabel(o.stage)}</td>
                          <td className="py-2 px-3">
                            {o.canStartProduction ? (
                              <span className="font-semibold text-emerald-700">Liberado</span>
                            ) : (
                              <span className="font-semibold text-rose-700">Bloqueado</span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono">{formatDateBR(o.targetDeliveryDate)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Critical Inventory Section */}
              {lowStockItems.length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-rose-50 px-4 py-2 font-bold uppercase tracking-wider text-rose-900 border-b border-rose-200">
                    2. Insumos Abaixo do Estoque Mínimo ({lowStockItems.length})
                  </div>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="py-2 px-3">Código</th>
                        <th className="py-2 px-3">Material</th>
                        <th className="py-2 px-3">Fornecedor</th>
                        <th className="py-2 px-3 text-right">Saldo Próprio</th>
                        <th className="py-2 px-3 text-right">Em Terceiros</th>
                        <th className="py-2 px-3 text-right">Mínimo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {lowStockItems.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2 px-3 font-mono">{item.code}</td>
                          <td className="py-2 px-3 font-semibold text-slate-900">{item.name}</td>
                          <td className="py-2 px-3 text-slate-600">{item.supplier}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-rose-700">
                            {item.currentStock} {item.unit}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-slate-700">
                            {item.inPartnersCustodyStock ?? 0} {item.unit}
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            {item.minStock} {item.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Consolidated Financial Snapshot when provided */}
              {transactions.length > 0 && (
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-500">Caixa Realizado</div>
                    <div className="font-mono font-bold text-sm text-slate-900 mt-0.5">
                      {formatCurrencyBRL(realizedCash)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-500">A Receber Aberto</div>
                    <div className="font-mono font-bold text-sm text-emerald-700 mt-0.5">
                      {formatCurrencyBRL(totalReceberOpen)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-500">A Pagar Aberto</div>
                    <div className="font-mono font-bold text-sm text-rose-700 mt-0.5">
                      {formatCurrencyBRL(totalPagarOpen)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-500">Saldo Projetado</div>
                    <div className="font-mono font-bold text-sm text-blue-700 mt-0.5">
                      {formatCurrencyBRL(projectedBalance)}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Footer */}
          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>
              Documento gerado pelo sistema ERP {profile.tradeName} · {profile.city}/{profile.state}
            </span>
            <span className="font-mono">
              {reportCode} · {generatedDate} {generatedTime}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
