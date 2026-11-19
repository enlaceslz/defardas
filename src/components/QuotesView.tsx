import React, { useState } from 'react';
import {
  Plus,
  Search,
  FileText,
  CheckCircle,
  Printer,
  Trash2,
  Clock,
  TrendingUp,
  AlertTriangle,
  MessageSquare,
  ShieldCheck,
  ShieldAlert,
  Pencil,
  Send,
  Loader2,
} from 'lucide-react';
import { Quote, CommercialStatus } from '../types/erp';
import { formatCurrencyBRL, formatDateBR, getCommercialStatusBadge } from '../utils/formatters';
import { useAuth } from '../api/authContext';

interface QuotesViewProps {
  quotes: Quote[];
  onOpenNewQuoteModal: () => void;
  onEditQuote: (quote: Quote) => void;
  onOpenPrintQuote: (quote: Quote) => void;
  onUpdateQuoteStatus: (quoteId: string, status: CommercialStatus) => Promise<void> | void;
  onConvertQuoteToOrder: (quote: Quote) => Promise<void> | void;
  onSendQuoteWhatsApp?: (quote: Quote) => Promise<void> | void;
  onDeleteQuote: (quoteId: string) => void;
}

const VIEW_ROLES = new Set(['admin', 'gerente_comercial', 'vendedor', 'financeiro']);
const CREATE_EDIT_CONVERT_ROLES = new Set(['admin', 'gerente_comercial', 'vendedor']);
const DELETE_ROLES = new Set(['admin', 'gerente_comercial']);

export const QuotesView: React.FC<QuotesViewProps> = ({
  quotes,
  onOpenNewQuoteModal,
  onEditQuote,
  onOpenPrintQuote,
  onUpdateQuoteStatus,
  onConvertQuoteToOrder,
  onSendQuoteWhatsApp,
  onDeleteQuote,
}) => {
  const { user } = useAuth();
  const role = user?.role || '';
  const canView = VIEW_ROLES.has(role);
  const canCreate = CREATE_EDIT_CONVERT_ROLES.has(role);
  const canEdit = CREATE_EDIT_CONVERT_ROLES.has(role);
  const canConvert = CREATE_EDIT_CONVERT_ROLES.has(role);
  const canDelete = DELETE_ROLES.has(role);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [sendingWaId, setSendingWaId] = useState<string | null>(null);

  if (!canView) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center max-w-xl mx-auto mt-10 shadow-xs">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3 border border-rose-200">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900">Acesso Restrito ao Módulo Comercial</h2>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          O módulo de Propostas Comerciais e Formação de Preços contém dados estratégicos de custo-base,
          markup e margem estimada, sendo restrito às equipes Comercial, Financeira e Diretoria.
        </p>
      </div>
    );
  }

  const todayStr = new Date().toISOString().split('T')[0];

  const isExpired = (q: Quote) =>
    Boolean(q.validUntil) &&
    q.validUntil < todayStr &&
    !['convertido_em_pedido', 'recusado', 'cancelado'].includes(q.status);

  const filteredQuotes = quotes.filter((q) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !query ||
      q.id.toLowerCase().includes(query) ||
      (q.quoteNumber || '').toLowerCase().includes(query) ||
      q.clientName.toLowerCase().includes(query) ||
      q.clientCnpj.toLowerCase().includes(query);

    if (!matchesSearch) return false;
    if (statusFilter === 'expired') return isExpired(q);
    if (statusFilter === 'authorized_discount') {
      return q.items.some((it) => it.costBreakdown?.belowSuggestedAuthorized);
    }
    return statusFilter === 'all' || q.status === statusFilter;
  });

  // KPIs Gerenciais
  const openQuotes = quotes.filter((q) =>
    ['rascunho', 'enviado', 'em_negociacao', 'aprovado'].includes(q.status)
  );
  const openPipelineValue = openQuotes.reduce((s, q) => s + q.totalAmount, 0);
  const convertedQuotes = quotes.filter((q) => q.status === 'convertido_em_pedido');
  const convertedValue = convertedQuotes.reduce((s, q) => s + q.totalAmount, 0);
  const expiredCount = quotes.filter(isExpired).length;
  const authorizedDiscountCount = quotes.filter((q) =>
    q.items.some((it) => it.costBreakdown?.belowSuggestedAuthorized)
  ).length;

  const totalRevenueAll = quotes.reduce((s, q) => s + q.totalAmount, 0);
  const totalBaseCostAll = quotes.reduce(
    (s, q) =>
      s +
      q.items.reduce(
        (is, it) => is + (it.costBreakdown?.calculatedBaseCost ?? 0) * it.totalQuantity,
        0
      ),
    0
  );
  const weightedMarginPct =
    totalRevenueAll > 0
      ? Math.round(((totalRevenueAll - totalBaseCostAll) / totalRevenueAll) * 10000) / 100
      : 0;

  const totalFilteredValue = filteredQuotes.reduce((sum, q) => sum + q.totalAmount, 0);

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

        {canCreate && (
          <button
            type="button"
            onClick={onOpenNewQuoteModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 shadow-sm transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Proposta Comercial</span>
          </button>
        )}
      </div>

      {/* KPIs Comerciais & Margem */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Pipeline em Aberto</span>
            <FileText className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-black font-mono text-slate-900 mt-1.5">
            {formatCurrencyBRL(openPipelineValue)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {openQuotes.length} {openQuotes.length === 1 ? 'proposta ativa' : 'propostas ativas'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Convertidas em OP</span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-black font-mono text-emerald-700 mt-1.5">
            {formatCurrencyBRL(convertedValue)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {convertedQuotes.length} de {quotes.length} propostas fechadas
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Margem Média Ponderada</span>
            <TrendingUp className="w-4 h-4 text-indigo-600" />
          </div>
          <div
            className={`text-xl font-black font-mono mt-1.5 ${
              weightedMarginPct < 20 ? 'text-amber-700' : 'text-indigo-700'
            }`}
          >
            {weightedMarginPct.toFixed(2)}%
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Sobre receita negociada (Adendo B.2.1)
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Governança & Prazos</span>
            <ShieldCheck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex items-baseline gap-3 mt-1.5">
            <span className="text-xl font-black font-mono text-amber-700">
              {authorizedDiscountCount}
            </span>
            <span className="text-[11px] text-slate-500">com alçada Admin</span>
          </div>
          <div className="text-[11px] mt-0.5 flex items-center gap-1">
            <Clock className={`w-3 h-3 ${expiredCount > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
            <span className={expiredCount > 0 ? 'text-rose-600 font-semibold' : 'text-slate-500'}>
              {expiredCount} {expiredCount === 1 ? 'proposta vencida' : 'propostas vencidas'}
            </span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex-1 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por número ORC, cliente ou CNPJ..."
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
            <option value="all">Todos os Status ({quotes.length})</option>
            <option value="rascunho">Rascunhos</option>
            <option value="enviado">Enviados</option>
            <option value="em_negociacao">Em Negociação</option>
            <option value="aprovado">Aprovados</option>
            <option value="convertido_em_pedido">Convertidos em OP (Idempotente)</option>
            <option value="recusado">Recusados</option>
            <option value="cancelado">Cancelados</option>
            <option value="expired">Vencidas ({expiredCount})</option>
            <option value="authorized_discount">Com Desconto Autorizado ({authorizedDiscountCount})</option>
          </select>
        </div>

        <div className="text-slate-500 text-xs shrink-0 self-end md:self-auto font-medium">
          Exibindo {filteredQuotes.length}:{' '}
          <span className="font-mono font-bold text-slate-900">
            {formatCurrencyBRL(totalFilteredValue)}
          </span>
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
            const isLocked = quote.status === 'convertido_em_pedido';
            const expired = isExpired(quote);
            const authItem = quote.items.find((it) => it.costBreakdown?.belowSuggestedAuthorized);
            const isConverting = convertingId === quote.id;
            const isSendingWa = sendingWaId === quote.id;

            return (
              <div
                key={quote.id}
                className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-blue-200 transition-colors space-y-4 text-xs"
              >
                {/* Top Line */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      {quote.quoteNumber || quote.id}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                      v{quote.version || 1}
                    </span>

                    {canEdit && !isLocked ? (
                      <select
                        value={quote.status}
                        aria-label={`Status comercial da proposta ${quote.quoteNumber || quote.id}`}
                        onChange={(e) =>
                          onUpdateQuoteStatus(quote.id, e.target.value as CommercialStatus)
                        }
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded border cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${statusInfo.bg}`}
                      >
                        <option value="rascunho">Rascunho</option>
                        <option value="enviado">Enviado</option>
                        <option value="em_negociacao">Em Negociação</option>
                        <option value="aprovado">Aprovado</option>
                        <option value="recusado">Recusado</option>
                        <option value="cancelado">Cancelado</option>
                      </select>
                    ) : (
                      <span
                        className={`text-[11px] font-semibold px-2.5 py-0.5 rounded border ${statusInfo.bg}`}
                      >
                        {statusInfo.label}
                      </span>
                    )}

                    {expired && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                        <AlertTriangle className="w-3 h-3" />
                        Vencida
                      </span>
                    )}

                    {authItem && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200"
                        title={`Autorizado por ${authItem.costBreakdown.authorizerName || 'Administrador'}`}
                      >
                        <ShieldCheck className="w-3 h-3 text-amber-600" />
                        Desconto Autorizado ({authItem.costBreakdown.authorizerName || 'Admin'})
                      </span>
                    )}

                    <span className="text-slate-400 font-mono text-[11px]">
                      Emissão: {formatDateBR(quote.date)} · Validade: {formatDateBR(quote.validUntil)}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenPrintQuote(quote)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Proposta / PDF</span>
                    </button>

                    {onSendQuoteWhatsApp && (
                      <button
                        type="button"
                        disabled={isSendingWa}
                        onClick={async () => {
                          setSendingWaId(quote.id);
                          try {
                            await onSendQuoteWhatsApp(quote);
                          } finally {
                            setSendingWaId(null);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        title="Enviar resumo desta proposta no WhatsApp do cliente"
                      >
                        {isSendingWa ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>WhatsApp</span>
                      </button>
                    )}

                    {canEdit && !isLocked && (
                      <button
                        type="button"
                        onClick={() => onEditQuote(quote)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors cursor-pointer"
                        title="Revisar itens, custos ou validade (cria nova versão)"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Revisar</span>
                      </button>
                    )}

                    {isLocked ? (
                      <span className="px-2.5 py-1 text-[11px] font-mono text-blue-700 bg-blue-50 rounded border border-blue-200">
                        OP Gerada: {quote.convertedToOrderId || 'Vinculada'}
                      </span>
                    ) : quote.status === 'recusado' || quote.status === 'cancelado' ? (
                      <span className="px-2.5 py-1 text-[11px] font-medium text-slate-500 bg-slate-100 rounded border border-slate-200">
                        Encerrada ({statusInfo.label})
                      </span>
                    ) : (
                      canConvert && (
                        <button
                          type="button"
                          disabled={isConverting}
                          onClick={async () => {
                            setConvertingId(quote.id);
                            try {
                              await onConvertQuoteToOrder(quote);
                            } finally {
                              setConvertingId(null);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-60"
                          title="Converter de forma idempotente em Ordem de Produção no PCP"
                        >
                          {isConverting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5" />
                          )}
                          <span>Aprovar & Gerar OP</span>
                        </button>
                      )
                    )}

                    {canDelete && !isLocked && (
                      <button
                        type="button"
                        onClick={() => onDeleteQuote(quote.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                        title="Excluir Proposta"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Body Details */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Client Info */}
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Cliente Solicitante
                    </span>
                    <div className="font-bold text-slate-900 text-sm mt-0.5">{quote.clientName}</div>
                    <div className="text-slate-500 font-mono text-[11px] mt-0.5">
                      CNPJ: {quote.clientCnpj}
                    </div>
                    <div className="text-slate-600 text-[11px]">
                      Contato: {quote.clientContact} ({quote.clientPhone})
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {quote.artApproved ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Arte Aprovada
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          Arte Pendente
                        </span>
                      )}
                      {quote.whatsAppProof && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <MessageSquare className="w-3 h-3 text-emerald-600" />
                          <span>{quote.whatsAppProof.contactId}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Garment Items Summary with Markup & Margin */}
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Itens do Pedido ({totalPieces} peças no lote)
                    </span>
                    <div className="space-y-1.5 mt-1">
                      {quote.items.map((it, idx) => (
                        <div
                          key={it.id || idx}
                          className="text-slate-700 bg-slate-50 p-2 rounded border border-slate-100"
                        >
                          <div className="flex justify-between font-semibold gap-2">
                            <span className="truncate">
                              {it.totalQuantity}x {it.modelName}
                            </span>
                            <span className="font-mono shrink-0">
                              {formatCurrencyBRL(it.totalPrice)}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 flex flex-wrap justify-between gap-1 pt-0.5 font-mono">
                            <span>Custo: {formatCurrencyBRL(it.costBreakdown?.calculatedBaseCost ?? 0)}</span>
                            <span>Markup: {it.costBreakdown?.markupPercentage ?? 0}%</span>
                            <span
                              className={
                                (it.costBreakdown?.estimatedMarginPercentage ?? 0) < 0
                                  ? 'text-rose-700 font-bold'
                                  : 'text-emerald-700 font-semibold'
                              }
                            >
                              Margem: {it.costBreakdown?.estimatedMarginPercentage ?? 0}%
                            </span>
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
                        Sinal de Entrada ({quote.entryPercentage ?? 50}%):{' '}
                        {formatCurrencyBRL(quote.entryAmount ?? quote.totalAmount / 2)}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Saldo na Entrega:{' '}
                        {formatCurrencyBRL(quote.balanceDueAtDelivery ?? quote.totalAmount / 2)}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Prazo de Confecção: <strong>{quote.productionLeadDays} dias úteis</strong>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between mt-2">
                      <span className="font-bold text-slate-700 uppercase text-[11px]">
                        Valor Total:
                      </span>
                      <span className="font-mono font-black text-base text-blue-700">
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
