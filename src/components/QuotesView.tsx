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
  Palette,
  History,
  CheckCircle2,
  X,
  RotateCcw,
} from 'lucide-react';
import { Quote, CommercialStatus } from '../types/erp';
import { formatCurrencyBRL, formatDateBR, getCommercialStatusBadge } from '../utils/formatters';
import { useAuth } from '../api/authContext';
import {
  QuoteArtworkAndVersionsModal,
  getArtworkStatusMeta,
} from './QuoteArtworkAndVersionsModal';

interface QuotesViewProps {
  quotes: Quote[];
  onOpenNewQuoteModal: () => void;
  onEditQuote: (quote: Quote) => void;
  onOpenPrintQuote: (quote: Quote) => void;
  onUpdateQuoteStatus: (quoteId: string, status: CommercialStatus) => Promise<void> | void;
  onApproveQuoteCommercial: (
    quoteId: string,
    payload: {
      approvedByName: string;
      acceptanceChannel: 'whatsapp' | 'email' | 'presencial';
      acceptanceNotes?: string;
      artDecision: 'manter_pendente' | 'solicitar_revisao_arte' | 'aprovar_arte_atual';
      artRevisionNotes?: string;
      artApproverName?: string;
    },
    alsoConvertToOrder?: boolean
  ) => Promise<boolean>;
  onUploadQuoteArtwork: (
    quoteId: string,
    payload: { fileName: string; fileUrl: string; notes?: string }
  ) => Promise<boolean>;
  onRequestQuoteArtRevision: (
    quoteId: string,
    payload: { revisionNotes: string; requestedBy?: string }
  ) => Promise<boolean>;
  onApproveQuoteArtwork: (
    quoteId: string,
    payload: { approverName: string; notes?: string; version?: number }
  ) => Promise<boolean>;
  onConvertQuoteToOrder: (quote: Quote) => Promise<void> | void;
  onSendQuoteWhatsApp?: (quote: Quote) => Promise<void> | void;
  onDeleteQuote: (quoteId: string) => void;
}

const VIEW_ROLES = new Set(['admin', 'gerente_comercial', 'vendedor', 'financeiro']);
const CREATE_EDIT_CONVERT_ROLES = new Set(['admin', 'gerente_comercial', 'vendedor']);
const MANAGE_ART_ROLES = new Set(['admin', 'gerente_comercial', 'vendedor', 'pcp_producao']);
const DELETE_ROLES = new Set(['admin', 'gerente_comercial']);

export const QuotesView: React.FC<QuotesViewProps> = ({
  quotes,
  onOpenNewQuoteModal,
  onEditQuote,
  onOpenPrintQuote,
  onUpdateQuoteStatus,
  onApproveQuoteCommercial,
  onUploadQuoteArtwork,
  onRequestQuoteArtRevision,
  onApproveQuoteArtwork,
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
  const canManageArt = MANAGE_ART_ROLES.has(role);
  const canDelete = DELETE_ROLES.has(role);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [sendingWaId, setSendingWaId] = useState<string | null>(null);

  // Modal de Artes & Versões
  const [artModalQuoteId, setArtModalQuoteId] = useState<string | null>(null);
  const [artModalInitialTab, setArtModalInitialTab] = useState<'artworks' | 'versions'>('artworks');

  // Modal de Aprovação Comercial (com opção explícita de Revisão de Arte!)
  const [approvalModalQuote, setApprovalModalQuote] = useState<Quote | null>(null);
  const [approvedByName, setApprovedByName] = useState('');
  const [acceptanceChannel, setAcceptanceChannel] = useState<'whatsapp' | 'email' | 'presencial'>('whatsapp');
  const [acceptanceNotes, setAcceptanceNotes] = useState('');
  const [artDecision, setArtDecision] = useState<
    'manter_pendente' | 'solicitar_revisao_arte' | 'aprovar_arte_atual'
  >('manter_pendente');
  const [artRevisionNotes, setArtRevisionNotes] = useState('');
  const [alsoConvertToOrder, setAlsoConvertToOrder] = useState(false);
  const [isSubmittingCommercialApproval, setIsSubmittingCommercialApproval] = useState(false);

  const activeArtModalQuote = artModalQuoteId
    ? quotes.find((q) => q.id === artModalQuoteId) || null
    : null;

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

  const openApprovalModal = (quote: Quote) => {
    setApprovalModalQuote(quote);
    setApprovedByName(quote.clientContact || '');
    setAcceptanceChannel(quote.acceptanceChannel || 'whatsapp');
    setAcceptanceNotes(quote.acceptanceNotes || '');
    setArtDecision(quote.artApproved ? 'aprovar_arte_atual' : 'manter_pendente');
    setArtRevisionNotes('');
    setAlsoConvertToOrder(false);
  };

  const handleSubmitCommercialApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvalModalQuote) return;
    if (approvedByName.trim().length < 2) return;
    if (artDecision === 'solicitar_revisao_arte' && artRevisionNotes.trim().length < 5) return;

    setIsSubmittingCommercialApproval(true);
    try {
      const ok = await onApproveQuoteCommercial(
        approvalModalQuote.id,
        {
          approvedByName: approvedByName.trim(),
          acceptanceChannel,
          acceptanceNotes: acceptanceNotes.trim() || undefined,
          artDecision,
          artRevisionNotes:
            artDecision === 'solicitar_revisao_arte' ? artRevisionNotes.trim() : undefined,
        },
        alsoConvertToOrder
      );
      if (ok) {
        setApprovalModalQuote(null);
      }
    } finally {
      setIsSubmittingCommercialApproval(false);
    }
  };

  const artRevisionCount = quotes.filter((q) => q.artStatus === 'revisao_solicitada').length;

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
    if (statusFilter === 'art_revision') return q.artStatus === 'revisao_solicitada';
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
            Propostas Comerciais, Versões & Aprovação de Artes
          </h1>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={onOpenNewQuoteModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#C8102E] rounded-lg hover:bg-[#A60D26] shadow-sm transition-colors cursor-pointer self-start sm:self-auto whitespace-nowrap"
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
            <span>Artes & Governança</span>
            <Palette className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex items-baseline gap-3 mt-1.5">
            <span className="text-xl font-black font-mono text-amber-700">
              {artRevisionCount}
            </span>
            <span className="text-[11px] text-slate-500">em revisão de arte</span>
          </div>
          <div className="text-[11px] mt-0.5 flex items-center gap-2 text-slate-500">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-amber-600" />
              {authorizedDiscountCount} alçada Admin
            </span>
            <span>·</span>
            <span className={expiredCount > 0 ? 'text-rose-600 font-semibold' : ''}>
              {expiredCount} vencida(s)
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
            <option value="aprovado">Aprovados Comercialmente</option>
            <option value="art_revision">Revisão de Arte Solicitada ({artRevisionCount})</option>
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
            const artMeta = getArtworkStatusMeta(quote.artStatus, quote.artApproved);
            const artCount = quote.artVersions?.length || 0;
            const latestArtVer =
              artCount > 0 ? Math.max(...(quote.artVersions || []).map((v) => v.version)) : 0;
            const totalPieces = quote.items.reduce((s, it) => s + it.totalQuantity, 0);
            const isLocked = quote.status === 'convertido_em_pedido';
            const isClosed = quote.status === 'recusado' || quote.status === 'cancelado';
            const expired = isExpired(quote);
            const authItem = quote.items.find((it) => it.costBreakdown?.belowSuggestedAuthorized);
            const isConverting = convertingId === quote.id;
            const isSendingWa = sendingWaId === quote.id;
            const isApprovedPendingArtRevision =
              (quote.status === 'aprovado' || quote.status === 'convertido_em_pedido') &&
              quote.artStatus === 'revisao_solicitada';

            return (
              <div
                key={quote.id}
                className={`bg-white p-5 rounded-xl border shadow-xs transition-colors space-y-4 text-xs ${
                  isApprovedPendingArtRevision
                    ? 'border-amber-300 hover:border-amber-400'
                    : 'border-slate-200 hover:border-blue-200'
                }`}
              >
                {/* Top Line */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      {quote.quoteNumber || quote.id}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setArtModalInitialTab('versions');
                        setArtModalQuoteId(quote.id);
                      }}
                      className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-semibold border border-slate-200 cursor-pointer"
                      title="Ver histórico de versões desta proposta"
                    >
                      <History className="w-3 h-3" />
                      <span>v{quote.version || 1}</span>
                    </button>

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

                    {/* Badge Desacoplada da Arte */}
                    <button
                      type="button"
                      onClick={() => {
                        setArtModalInitialTab('artworks');
                        setArtModalQuoteId(quote.id);
                      }}
                      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border cursor-pointer hover:opacity-90 ${artMeta.badge}`}
                      title="Gerenciar arquivos de arte, revisões e aprovação formal"
                    >
                      <Palette className="w-3 h-3" />
                      <span>
                        {artMeta.label}
                        {latestArtVer > 0 ? ` (v${latestArtVer})` : ''}
                      </span>
                    </button>

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
                      onClick={() => {
                        setArtModalInitialTab('artworks');
                        setArtModalQuoteId(quote.id);
                      }}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 font-medium rounded-lg border transition-colors cursor-pointer ${
                        quote.artStatus === 'revisao_solicitada'
                          ? 'text-amber-900 bg-amber-50 hover:bg-amber-100 border-amber-300'
                          : 'text-purple-700 bg-purple-50 hover:bg-purple-100 border-purple-200'
                      }`}
                      title="Armazenar arte (PNG/JPG/PDF), registrar revisão ou aprovar layout"
                    >
                      <Palette className="w-3.5 h-3.5" />
                      <span>Artes ({artCount})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setArtModalInitialTab('versions');
                        setArtModalQuoteId(quote.id);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                      title="Consultar histórico completo de versões (v1, v2, v3...)"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Versões</span>
                    </button>

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
                        title="Revisar itens, custos ou validade (salva snapshot e gera nova versão)"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Revisar</span>
                      </button>
                    )}

                    {/* Botão Dedicado de Aprovação Comercial (suporta "Aprovou orçamento mas pediu revisão da arte") */}
                    {canEdit && !isLocked && !isClosed && quote.status !== 'aprovado' && (
                      <button
                        type="button"
                        onClick={() => openApprovalModal(quote)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs transition-colors cursor-pointer"
                        title="Registrar aceite comercial do cliente (inclusive quando pede revisão na arte)"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Aprovar Orçamento</span>
                      </button>
                    )}

                    {isLocked ? (
                      <span className="px-2.5 py-1 text-[11px] font-mono text-blue-700 bg-blue-50 rounded border border-blue-200">
                        OP Gerada: {quote.convertedToOrderId || 'Vinculada'}
                      </span>
                    ) : isClosed ? (
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
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-[#C8102E] hover:bg-[#A60D26] rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
                          title="Converter de forma idempotente em Ordem de Produção no PCP"
                        >
                          {isConverting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5" />
                          )}
                          <span>{quote.status === 'aprovado' ? 'Gerar OP (50%)' : 'Aprovar & Gerar OP'}</span>
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

                {/* Alerta Explícito: Orçamento Aprovado + Revisão de Arte Solicitada */}
                {isApprovedPendingArtRevision && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-amber-950">
                    <div className="flex items-start gap-2">
                      <RotateCcw className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Orçamento aprovado comercialmente — cliente solicitou revisão na arte:</strong>{' '}
                        {quote.artNotes || 'Aguardando envio da nova versão corrigida da arte.'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setArtModalInitialTab('artworks');
                        setArtModalQuoteId(quote.id);
                      }}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-md shrink-0 cursor-pointer"
                    >
                      Enviar Nova Arte v{latestArtVer + 1}
                    </button>
                  </div>
                )}

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
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {quote.approvedByName && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>
                            Aceite: {quote.approvedByName} ({quote.acceptanceChannel || 'whatsapp'})
                          </span>
                        </span>
                      )}
                      {quote.artApproved && quote.artApprovedBy && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Arte aprovada por {quote.artApprovedBy}
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

      {/* Modal: Artes & Histórico de Versões da Proposta */}
      {activeArtModalQuote && (
        <QuoteArtworkAndVersionsModal
          quote={activeArtModalQuote}
          initialTab={artModalInitialTab}
          canManageArt={canManageArt}
          onClose={() => setArtModalQuoteId(null)}
          onUploadArtwork={onUploadQuoteArtwork}
          onRequestArtRevision={onRequestQuoteArtRevision}
          onApproveArtwork={onApproveQuoteArtwork}
        />
      )}

      {/* Modal: Registrar Aprovação Comercial (Desacoplada da Revisão de Arte) */}
      {approvalModalQuote && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-[#111113] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold">Registrar Aprovação do Orçamento</h3>
                  <p className="text-[11px] text-slate-400">
                    {approvalModalQuote.quoteNumber || approvalModalQuote.id} v{approvalModalQuote.version || 1} ·{' '}
                    {approvalModalQuote.clientName} · {formatCurrencyBRL(approvalModalQuote.totalAmount)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setApprovalModalQuote(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitCommercialApproval} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Responsável pelo Aceite no Cliente *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={approvedByName}
                    onChange={(e) => setApprovedByName(e.target.value)}
                    placeholder="Ex: Juliana Mendes (Gerente de Compras)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Canal do Aceite *
                  </label>
                  <select
                    value={acceptanceChannel}
                    onChange={(e) => setAcceptanceChannel(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">E-mail Formal</option>
                    <option value="presencial">Presencial / Assinatura</option>
                  </select>
                </div>
              </div>

              {/* Decisão Desacoplada da Arte */}
              <div className="space-y-2">
                <label className="block font-bold text-slate-800">
                  Situação da Arte neste Aceite Comercial *
                </label>

                <label
                  className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                    artDecision === 'manter_pendente'
                      ? 'bg-blue-50 border-blue-300'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="artDecision"
                    checked={artDecision === 'manter_pendente'}
                    onChange={() => setArtDecision('manter_pendente')}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-semibold text-slate-900">
                      Aprovar orçamento — arte pendente de envio/validação
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Aprova preço e prazo; a arte será anexada e validada depois no painel de Artes.
                    </div>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                    artDecision === 'solicitar_revisao_arte'
                      ? 'bg-amber-50 border-amber-300'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="artDecision"
                    checked={artDecision === 'solicitar_revisao_arte'}
                    onChange={() => setArtDecision('solicitar_revisao_arte')}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-semibold text-amber-950">
                      Aprovar orçamento — cliente pediu revisão na arte
                    </div>
                    <div className="text-[11px] text-amber-800">
                      Mantém o orçamento e preço aprovados, registra os ajustes da arte e mantém o Gate A.3.2
                      bloqueado até aprovação da nova versão da arte.
                    </div>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                    artDecision === 'aprovar_arte_atual'
                      ? 'bg-emerald-50 border-emerald-300'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="artDecision"
                    checked={artDecision === 'aprovar_arte_atual'}
                    onChange={() => setArtDecision('aprovar_arte_atual')}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-semibold text-emerald-950">
                      Aprovar orçamento + aprovar arte atual formalmente
                    </div>
                    <div className="text-[11px] text-emerald-800">
                      Registra aceite comercial e aprovação formal da arte (faltando apenas o sinal de 50% para o corte).
                    </div>
                  </div>
                </label>
              </div>

              {artDecision === 'solicitar_revisao_arte' && (
                <div>
                  <label className="block font-semibold text-amber-950 mb-1">
                    Ajustes Solicitados pelo Cliente na Arte *
                  </label>
                  <textarea
                    rows={3}
                    required
                    minLength={5}
                    value={artRevisionNotes}
                    onChange={(e) => setArtRevisionNotes(e.target.value)}
                    placeholder="Ex: Cliente aprovou o valor de R$ 72,68/un, mas pediu para aumentar o logo do peito de 7cm para 9cm e trocar a cor do texto das costas para branco."
                    className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-amber-50/40 text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Observações Comerciais do Aceite (Opcional)
                </label>
                <input
                  type="text"
                  value={acceptanceNotes}
                  onChange={(e) => setAcceptanceNotes(e.target.value)}
                  placeholder="Ex: Pedido confirmado via WhatsApp oficial, aguardando PIX do sinal 50%"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {canConvert && (
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alsoConvertToOrder}
                    onChange={(e) => setAlsoConvertToOrder(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div className="text-[11px] text-slate-700 leading-relaxed">
                    <strong>Já gerar Ordem de Produção (OP) e títulos financeiros (Sinal 50% + Saldo 50%)</strong>
                    <br />
                    Mesmo com a OP criada agora, o <strong>Gate A.3.2</strong> impede o início do corte até que o
                    sinal de 50% seja quitado e a arte revisada seja aprovada.
                  </div>
                </label>
              )}

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isSubmittingCommercialApproval}
                  onClick={() => setApprovalModalQuote(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    isSubmittingCommercialApproval ||
                    approvedByName.trim().length < 2 ||
                    (artDecision === 'solicitar_revisao_arte' && artRevisionNotes.trim().length < 5)
                  }
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg cursor-pointer disabled:opacity-60"
                >
                  {isSubmittingCommercialApproval
                    ? 'Registrando...'
                    : alsoConvertToOrder
                    ? 'Aprovar & Gerar OP'
                    : 'Confirmar Aprovação do Orçamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
