import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  FileText, 
  CheckCircle, 
  Printer, 
  Trash2, 
  Clock, 
  DollarSign, 
  Users,
  AlertCircle,
  MessageSquare,
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import { Quote, CommercialStatus } from '../types/erp';
import { formatCurrencyBRL, formatDateBR, getCommercialStatusBadge } from '../utils/formatters';

interface QuotesViewProps {
  quotes: Quote[];
  onOpenNewQuoteModal: () => void;
  onOpenPrintQuote: (quote: Quote) => void;
  onUpdateQuoteStatus: (quoteId: string, status: CommercialStatus) => void;
  onConvertQuoteToOrder: (quote: Quote) => void;
  onDeleteQuote: (quoteId: string) => void;
}

export const QuotesView: React.FC<QuotesViewProps> = ({
  quotes,
  onOpenNewQuoteModal,
  onOpenPrintQuote,
  onUpdateQuoteStatus,
  onConvertQuoteToOrder,
  onDeleteQuote,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredQuotes = quotes.filter((q) => {
    const matchesSearch = 
      q.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.clientCnpj.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || q.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalValue = filteredQuotes.reduce((sum, q) => sum + q.totalAmount, 0);

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="text-xs font-medium text-slate-500 flex items-center gap-2">
            <span>DE FARDAS</span>
            <span aria-hidden="true">/</span>
            <span>Comercial & CRM</span>
            <span aria-hidden="true">/</span>
            <span className="text-slate-800 font-semibold">Motor de Orçamentos (PRD v1.6)</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Propostas Comerciais & Precificação Transparente
          </h1>
        </div>

        <button
          onClick={onOpenNewQuoteModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 shadow-sm transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>+ Nova Proposta Comercial</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex-1 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por proposta, cliente ou CNPJ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="all">Todos os Status</option>
            <option value="enviado">Enviados / Em Negociação</option>
            <option value="aprovado">Aprovados</option>
            <option value="convertido_em_pedido">Convertidos em OP (Idempotente)</option>
            <option value="rascunho">Rascunhos</option>
            <option value="recusado">Recusados</option>
          </select>
        </div>

        <div className="text-slate-500 text-xs shrink-0 self-end md:self-auto font-medium">
          Total em Propostas: <span className="font-mono font-bold text-slate-900">{formatCurrencyBRL(totalValue)}</span>
        </div>
      </div>

      {/* Quotes Cards Grid */}
      <div className="space-y-4">
        {filteredQuotes.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-xl border border-slate-200 text-slate-400 text-xs space-y-2">
            <FileText className="w-8 h-8 text-slate-300 mx-auto" />
            <p>Nenhuma proposta comercial encontrada para os filtros aplicados.</p>
          </div>
        ) : (
          filteredQuotes.map((quote) => {
            const statusInfo = getCommercialStatusBadge(quote.status);
            const totalPieces = quote.items.reduce((s, it) => s + it.totalQuantity, 0);

            return (
              <div
                key={quote.id}
                className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-blue-200 transition-colors space-y-4 text-xs"
              >
                {/* Top Line */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      {quote.id}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                      v{quote.version || 1}
                    </span>
                    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded border ${statusInfo.bg}`}>
                      {statusInfo.label}
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      Emissão: {formatDateBR(quote.date)} · Validade: {formatDateBR(quote.validUntil)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onOpenPrintQuote(quote)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Ver Proposta & Imprimir</span>
                    </button>

                    {quote.status !== 'convertido_em_pedido' ? (
                      <button
                        onClick={() => onConvertQuoteToOrder(quote)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm transition-colors cursor-pointer"
                        title="Converter de forma idempotente em Ordem de Produção no PCP"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Aprovar & Gerar OP</span>
                      </button>
                    ) : (
                      <span className="px-2.5 py-1 text-[11px] font-mono text-blue-700 bg-blue-50 rounded border border-blue-200">
                        OP Gerada: {quote.convertedToOrderId || 'Vinculada'}
                      </span>
                    )}

                    <button
                      onClick={() => onDeleteQuote(quote.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                      title="Excluir Proposta"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Body Details */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Client Info */}
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Cliente Solicitante
                    </span>
                    <div className="font-bold text-slate-900 text-sm mt-0.5">
                      {quote.clientName}
                    </div>
                    <div className="text-slate-500 font-mono text-[11px] mt-0.5">
                      CNPJ: {quote.clientCnpj}
                    </div>
                    <div className="text-slate-600 text-[11px]">
                      Contato: {quote.clientContact} ({quote.clientPhone})
                    </div>
                    {quote.whatsAppProof && (
                      <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <MessageSquare className="w-3 h-3 text-emerald-600" />
                        <span>WhatsApp: {quote.whatsAppProof.contactId}</span>
                      </div>
                    )}
                  </div>

                  {/* Garment Items Summary with Markup */}
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Itens do Pedido ({totalPieces} peças no lote)
                    </span>
                    <div className="space-y-1.5 mt-1">
                      {quote.items.map((it, idx) => (
                        <div key={idx} className="text-slate-700 bg-slate-50 p-2 rounded border border-slate-100">
                          <div className="flex justify-between font-semibold">
                            <span>{it.totalQuantity}x {it.modelName}</span>
                            <span className="font-mono">{formatCurrencyBRL(it.totalPrice)}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 flex justify-between pt-0.5 font-mono">
                            <span>Markup: {it.costBreakdown?.markupPercentage ?? 0}%</span>
                            <span className="text-emerald-700">Margem: {it.costBreakdown?.estimatedMarginPercentage ?? 0}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Commercial Terms & Entry */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex flex-col justify-between">
                    <div className="space-y-1">
                      <div className="text-[11px] text-slate-700 font-semibold">
                        {quote.paymentTerms}
                      </div>
                      <div className="text-[11px] text-blue-700 font-mono font-bold">
                        Sinal de Entrada ({quote.entryPercentage || 50}%): {formatCurrencyBRL(quote.entryAmount || (quote.totalAmount / 2))}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Saldo na Entrega: {formatCurrencyBRL(quote.balanceDueAtDelivery || (quote.totalAmount / 2))}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Prazo de Confecção: <strong>{quote.productionLeadDays} dias úteis</strong>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between mt-2">
                      <span className="font-bold text-slate-700 uppercase text-[11px]">Valor Total:</span>
                      <span className="font-mono font-black text-slate-900 text-base text-blue-700">
                        {formatCurrencyBRL(quote.totalAmount)}
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>

    </div>
  );
};
