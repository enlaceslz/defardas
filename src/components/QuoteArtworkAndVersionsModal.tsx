import React, { useMemo, useState } from 'react';
import {
  X,
  Upload,
  Palette,
  History,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  Link2,
  RotateCcw,
  ShieldCheck,
  Clock,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Loader2,
} from 'lucide-react';
import { ArtworkStatus, ArtworkVersion, Quote, QuoteVersionSnapshot } from '../types/erp';
import { formatCurrencyBRL, formatDateBR, getCommercialStatusBadge } from '../utils/formatters';

interface QuoteArtworkAndVersionsModalProps {
  quote: Quote;
  initialTab?: 'artworks' | 'versions';
  canManageArt: boolean;
  onClose: () => void;
  onUploadArtwork: (
    quoteId: string,
    payload: { fileName: string; fileUrl: string; notes?: string }
  ) => Promise<boolean>;
  onRequestArtRevision: (
    quoteId: string,
    payload: { revisionNotes: string; requestedBy?: string }
  ) => Promise<boolean>;
  onApproveArtwork: (
    quoteId: string,
    payload: { approverName: string; notes?: string; version?: number }
  ) => Promise<boolean>;
}

const ALLOWED_FILE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
]);
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB

export function getArtworkStatusMeta(status?: ArtworkStatus, artApproved?: boolean) {
  const resolved: ArtworkStatus = status || (artApproved ? 'aprovada' : 'pendente');
  switch (resolved) {
    case 'aprovada':
      return {
        label: 'Arte Aprovada',
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case 'revisao_solicitada':
      return {
        label: 'Revisão de Arte Solicitada',
        badge: 'bg-amber-50 text-amber-800 border-amber-300',
      };
    case 'enviada_para_cliente':
      return {
        label: 'Arte Enviada ao Cliente',
        badge: 'bg-blue-50 text-blue-700 border-blue-200',
      };
    default:
      return {
        label: 'Arte Pendente',
        badge: 'bg-slate-100 text-slate-600 border-slate-200',
      };
  }
}

function formatDateTimeBR(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const QuoteArtworkAndVersionsModal: React.FC<QuoteArtworkAndVersionsModalProps> = ({
  quote,
  initialTab = 'artworks',
  canManageArt,
  onClose,
  onUploadArtwork,
  onRequestArtRevision,
  onApproveArtwork,
}) => {
  const [activeTab, setActiveTab] = useState<'artworks' | 'versions'>(initialTab);

  // Upload de nova versão de arte
  const [uploadMode, setUploadMode] = useState<'file' | 'link'>('file');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [selectedFileUrl, setSelectedFileUrl] = useState('');
  const [selectedFileMime, setSelectedFileMime] = useState('');
  const [selectedFileSize, setSelectedFileSize] = useState<number | undefined>(undefined);
  const [externalLink, setExternalLink] = useState('');
  const [externalLinkName, setExternalLinkName] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Fluxos in-app de Revisão e Aprovação da Arte
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionRequestedBy, setRevisionRequestedBy] = useState(quote.clientContact || quote.clientName);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);

  const [approvingVersion, setApprovingVersion] = useState<number | null>(null);
  const [approverName, setApproverName] = useState(quote.approvedByName || quote.clientContact || '');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);

  // Preview em lightbox in-app (zero window.open)
  const [previewArt, setPreviewArt] = useState<ArtworkVersion | null>(null);
  const [expandedVersion, setExpandedVersion] = useState<number | null>(quote.version || 1);

  const artVersions = useMemo(
    () => [...(quote.artVersions || [])].sort((a, b) => b.version - a.version),
    [quote.artVersions]
  );

  const versionHistory: QuoteVersionSnapshot[] = useMemo(() => {
    if (quote.versionHistory && quote.versionHistory.length > 0) {
      return [...quote.versionHistory].sort((a, b) => b.version - a.version);
    }
    const totalPieces = quote.items.reduce((s, it) => s + it.totalQuantity, 0);
    const totalBaseCost = quote.items.reduce(
      (s, it) => s + (it.costBreakdown?.calculatedBaseCost ?? 0) * it.totalQuantity,
      0
    );
    const estMargin =
      quote.totalAmount > 0
        ? Math.round(((quote.totalAmount - totalBaseCost) / quote.totalAmount) * 10000) / 100
        : 0;
    return [
      {
        version: quote.version || 1,
        savedAt: quote.date,
        savedBy: quote.sellerName,
        commercialStatus: quote.status,
        artStatus: quote.artStatus || (quote.artApproved ? 'aprovada' : 'pendente'),
        validUntil: quote.validUntil,
        totalBaseCost,
        suggestedTotalAmount: quote.totalAmount,
        negotiatedTotalAmount: quote.totalAmount,
        discountAmount: 0,
        estimatedMarginPercentage: estMargin,
        entryAmount: quote.entryAmount,
        balanceAmount: quote.balanceDueAtDelivery,
        productionLeadDays: quote.productionLeadDays,
        totalPieces,
        changeSummary: `Versão v${quote.version || 1} atual da proposta`,
        items: quote.items.map((it) => ({
          modelName: it.modelName,
          fabricName: it.fabricName,
          fabricColor: it.fabricColor,
          totalQuantity: it.totalQuantity,
          calculatedBaseUnitCost: it.costBreakdown?.calculatedBaseCost ?? 0,
          suggestedUnitPrice: it.costBreakdown?.suggestedUnitPrice ?? it.unitFinalPrice,
          negotiatedUnitPrice: it.unitFinalPrice,
          totalItemPrice: it.totalPrice,
        })),
      },
    ];
  }, [quote]);

  const commercialBadge = getCommercialStatusBadge(quote.status);
  const artBadge = getArtworkStatusMeta(quote.artStatus, quote.artApproved);
  const isApprovedWithArtRevision =
    (quote.status === 'aprovado' || quote.status === 'convertido_em_pedido') &&
    quote.artStatus === 'revisao_solicitada';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_FILE_MIMES.has(file.type)) {
      setUploadError(
        'Formato bloqueado por segurança. Envie apenas PNG, JPG, WebP ou PDF (SVG e HTML não são aceitos).'
      );
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('O arquivo excede o limite de 4 MB. Compacte a imagem ou PDF e tente novamente.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSelectedFileName(file.name);
        setSelectedFileUrl(reader.result);
        setSelectedFileMime(file.type);
        setSelectedFileSize(file.size);
      }
    };
    reader.onerror = () => {
      setUploadError('Não foi possível ler o arquivo selecionado.');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError('');

    const payloadUrl = uploadMode === 'file' ? selectedFileUrl : externalLink.trim();
    const payloadName =
      uploadMode === 'file'
        ? selectedFileName || 'layout-arte.png'
        : externalLinkName.trim() || 'link-arte-layout';

    if (!payloadUrl) {
      setUploadError(
        uploadMode === 'file'
          ? 'Selecione um arquivo PNG, JPG, WebP ou PDF antes de enviar.'
          : 'Informe um link HTTPS válido para o arquivo da arte.'
      );
      return;
    }

    if (uploadMode === 'link' && !payloadUrl.startsWith('https://')) {
      setUploadError('Por segurança, apenas links públicos iniciados com https:// são aceitos.');
      return;
    }

    setIsUploading(true);
    try {
      const ok = await onUploadArtwork(quote.id, {
        fileName: payloadName,
        fileUrl: payloadUrl,
        notes: uploadNotes.trim() || undefined,
      });
      if (ok) {
        setSelectedFileName('');
        setSelectedFileUrl('');
        setSelectedFileMime('');
        setSelectedFileSize(undefined);
        setExternalLink('');
        setExternalLinkName('');
        setUploadNotes('');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmitRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (revisionNotes.trim().length < 5) return;
    setIsSubmittingRevision(true);
    try {
      const ok = await onRequestArtRevision(quote.id, {
        revisionNotes: revisionNotes.trim(),
        requestedBy: revisionRequestedBy.trim() || quote.clientName,
      });
      if (ok) {
        setShowRevisionForm(false);
        setRevisionNotes('');
      }
    } finally {
      setIsSubmittingRevision(false);
    }
  };

  const handleSubmitApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (approverName.trim().length < 2) return;
    setIsSubmittingApproval(true);
    try {
      const ok = await onApproveArtwork(quote.id, {
        approverName: approverName.trim(),
        notes: approvalNotes.trim() || undefined,
        version: approvingVersion ?? undefined,
      });
      if (ok) {
        setApprovingVersion(null);
        setApprovalNotes('');
      }
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 bg-[#111113] text-white flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold">
                Artes & Versões — {quote.quoteNumber || quote.id}
              </h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/10 text-slate-100 border border-white/15">
                Proposta v{quote.version || 1}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${commercialBadge.bg}`}>
                Comercial: {commercialBadge.label}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${artBadge.badge}`}>
                {artBadge.label}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Cliente: <strong className="text-slate-200">{quote.clientName}</strong>
              {quote.approvedByName && (
                <span> · Aceite comercial por {quote.approvedByName}</span>
              )}
              {quote.convertedToOrderId && (
                <span className="text-blue-300 font-mono"> · OP: {quote.convertedToOrderId}</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-3 bg-slate-50 border-b border-slate-200 flex overflow-x-auto items-center gap-2 shrink-0 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('artworks')}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'artworks'
                ? 'border-[#C8102E] text-[#C8102E] bg-white rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>Artes & Revisões ({artVersions.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('versions')}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'versions'
                ? 'border-[#C8102E] text-[#C8102E] bg-white rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Histórico de Versões da Proposta ({versionHistory.length})</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          {activeTab === 'artworks' ? (
            <>
              {/* Banner de Destaque: Orçamento Aprovado + Revisão de Arte Solicitada */}
              {isApprovedWithArtRevision && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold text-xs">
                      Orçamento Aprovado Comercialmente — Aguardando Revisão da Arte
                    </div>
                    <p className="text-[11px] leading-relaxed text-amber-900">
                      O preço e as condições comerciais da <strong>v{quote.version}</strong> permanecem
                      aprovados sem necessidade de refazer o orçamento. Envie abaixo a nova versão corrigida
                      da arte (ex: Arte v{artVersions.length + 1}). Pelo <strong>Gate A.3.2</strong>, o corte na
                      produção permanece travado até o aceite formal desta nova arte.
                    </p>
                    {quote.artNotes && (
                      <div className="mt-1.5 p-2 rounded bg-white/80 border border-amber-200 text-[11px] text-amber-950">
                        <strong>Ajustes pedidos pelo cliente:</strong> {quote.artNotes}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Banner Arte Aprovada */}
              {quote.artApproved && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">
                        Arte Formalmente Aprovada por {quote.artApprovedBy || 'Cliente'}
                      </div>
                      <div className="text-[11px] text-emerald-800 mt-0.5">
                        {quote.artApprovalDate
                          ? `Registrada em ${formatDateTimeBR(quote.artApprovalDate)}. `
                          : ''}
                        Critério de Arte do Gate A.3.2 satisfeito
                        {quote.convertedToOrderId ? ` e sincronizado com a OP ${quote.convertedToOrderId}.` : '.'}
                      </div>
                    </div>
                  </div>
                  {canManageArt && (
                    <button
                      type="button"
                      onClick={() => setShowRevisionForm((v) => !v)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 rounded-lg font-semibold shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Pedir Revisão</span>
                    </button>
                  )}
                </div>
              )}

              {/* Formulário de Upload de Nova Versão de Arte */}
              {canManageArt && quote.status !== 'recusado' && quote.status !== 'cancelado' && (
                <form
                  onSubmit={handleSubmitUpload}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <Upload className="w-4 h-4 text-blue-600" />
                      <span>
                        Armazenar Nova Versão de Arte (Arte v{artVersions.length + 1})
                      </span>
                    </div>
                    <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          setUploadMode('file');
                          setUploadError('');
                        }}
                        className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                          uploadMode === 'file' ? 'bg-[#111113] text-white' : 'text-slate-600'
                        }`}
                      >
                        Upload de Arquivo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadMode('link');
                          setUploadError('');
                        }}
                        className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                          uploadMode === 'link' ? 'bg-[#111113] text-white' : 'text-slate-600'
                        }`}
                      >
                        Link HTTPS Seguro
                      </button>
                    </div>
                  </div>

                  {uploadMode === 'file' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                      <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-xl bg-white cursor-pointer transition-colors text-center">
                        <Upload className="w-5 h-5 text-blue-600 mb-1" />
                        <span className="font-semibold text-slate-800">
                          {selectedFileName || 'Clique para selecionar PNG, JPG, WebP ou PDF'}
                        </span>
                        <span className="text-[11px] text-slate-500 mt-0.5">
                          Máximo 4 MB · Armazenado com histórico versionado
                        </span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,application/pdf"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </label>

                      {selectedFileUrl ? (
                        <div className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center gap-3">
                          {selectedFileMime.startsWith('image/') ? (
                            <img
                              src={selectedFileUrl}
                              alt="Pré-visualização da arte"
                              className="w-16 h-16 object-contain rounded border border-slate-200 bg-slate-50 shrink-0"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded border border-slate-200 bg-rose-50 text-rose-700 flex flex-col items-center justify-center shrink-0">
                              <FileText className="w-6 h-6" />
                              <span className="text-[9px] font-bold">PDF</span>
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-900 truncate">{selectedFileName}</div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {selectedFileMime} {selectedFileSize ? `· ${formatFileSize(selectedFileSize)}` : ''}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500 leading-relaxed">
                          Cada arquivo enviado gera uma nova versão rastreável (v1, v2, v3...) vinculada à
                          proposta e sincronizada automaticamente com a Ordem de Produção caso já convertida.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Nome de Referência da Arte *
                        </label>
                        <input
                          type="text"
                          value={externalLinkName}
                          onChange={(e) => setExternalLinkName(e.target.value)}
                          placeholder="Ex: Layout Polo Azul Marinho - Logo Peito v2"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          URL Pública Segura (https://) *
                        </label>
                        <input
                          type="url"
                          value={externalLink}
                          onChange={(e) => setExternalLink(e.target.value)}
                          placeholder="https://cdn.exemplo.com/artes/layout-v2.pdf"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={uploadNotes}
                      onChange={(e) => setUploadNotes(e.target.value)}
                      placeholder="Observações desta versão (ex: Logo ampliado para 9cm no peito esquerdo, cor Pantone 281C)"
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isUploading}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#C8102E] hover:bg-[#A60D26] transition-colors text-white font-semibold rounded-lg shadow-xs cursor-pointer disabled:opacity-60 shrink-0 whitespace-nowrap"
                    >
                      {isUploading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      <span>Salvar Arte v{artVersions.length + 1}</span>
                    </button>
                  </div>

                  {uploadError && (
                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-medium">
                      {uploadError}
                    </div>
                  )}
                </form>
              )}

              {/* Ações Rápidas: Solicitar Revisão ou Aprovar Arte */}
              {canManageArt && quote.status !== 'recusado' && quote.status !== 'cancelado' && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="font-bold text-slate-800">
                    Versões Armazenadas ({artVersions.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!quote.artApproved && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowRevisionForm((v) => !v);
                          setApprovingVersion(null);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg font-semibold cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Cliente Pediu Revisão de Arte</span>
                      </button>
                    )}
                    {!quote.artApproved && (
                      <button
                        type="button"
                        onClick={() => {
                          setApprovingVersion(artVersions[0]?.version ?? 0);
                          setShowRevisionForm(false);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg font-semibold cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          {artVersions[0]
                            ? `Aprovar Arte v${artVersions[0].version} Formalmente`
                            : 'Registrar Aprovação Formal da Arte'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Formulário Inline: Solicitar Revisão de Arte */}
              {showRevisionForm && (
                <form
                  onSubmit={handleSubmitRevision}
                  className="p-4 rounded-xl bg-amber-50 border border-amber-300 space-y-3"
                >
                  <div className="font-bold text-amber-950 flex items-center gap-1.5">
                    <RotateCcw className="w-4 h-4 text-amber-700" />
                    <span>Registrar Solicitação de Revisão da Arte (Mantém Proposta Aprovada)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-amber-950 mb-1">
                        Solicitado por (Cliente)
                      </label>
                      <input
                        type="text"
                        value={revisionRequestedBy}
                        onChange={(e) => setRevisionRequestedBy(e.target.value)}
                        className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-white text-slate-900"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-amber-950 mb-1">
                        Ajustes Solicitados na Arte *
                      </label>
                      <input
                        type="text"
                        required
                        minLength={5}
                        value={revisionNotes}
                        onChange={(e) => setRevisionNotes(e.target.value)}
                        placeholder="Ex: Aumentar brasão nas costas para 22cm e trocar cor da linha do bordado para dourado"
                        className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-white text-slate-900"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRevisionForm(false)}
                      className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-amber-900 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingRevision || revisionNotes.trim().length < 5}
                      className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold cursor-pointer disabled:opacity-60"
                    >
                      {isSubmittingRevision ? 'Registrando...' : 'Confirmar Pedido de Revisão'}
                    </button>
                  </div>
                </form>
              )}

              {/* Formulário Inline: Aprovar Arte Formalmente */}
              {approvingVersion !== null && (
                <form
                  onSubmit={handleSubmitApprove}
                  className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 space-y-3"
                >
                  <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <span>
                      Aprovação Formal da {approvingVersion > 0 ? `Arte v${approvingVersion}` : 'Arte'} (Libera Gate A.3.2)
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-emerald-950 mb-1">
                        Aprovado por (Nome do Cliente) *
                      </label>
                      <input
                        type="text"
                        required
                        minLength={2}
                        value={approverName}
                        onChange={(e) => setApproverName(e.target.value)}
                        placeholder="Ex: Juliana Mendes (WhatsApp)"
                        className="w-full px-3 py-2 border border-emerald-300 rounded-lg bg-white text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-emerald-950 mb-1">
                        Observações do Aceite (Opcional)
                      </label>
                      <input
                        type="text"
                        value={approvalNotes}
                        onChange={(e) => setApprovalNotes(e.target.value)}
                        placeholder="Ex: Aceite confirmado no WhatsApp às 15h30"
                        className="w-full px-3 py-2 border border-emerald-300 rounded-lg bg-white text-slate-900"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setApprovingVersion(null)}
                      className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-emerald-900 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingApproval || approverName.trim().length < 2}
                      className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer disabled:opacity-60"
                    >
                      {isSubmittingApproval ? 'Aprovando...' : 'Confirmar Aprovação da Arte'}
                    </button>
                  </div>
                </form>
              )}

              {/* Lista de Versões de Arte */}
              {artVersions.length === 0 ? (
                <div className="p-8 text-center rounded-xl border border-dashed border-slate-300 text-slate-500 space-y-1">
                  <ImageIcon className="w-7 h-7 text-slate-300 mx-auto" />
                  <div className="font-semibold text-slate-700">
                    Nenhuma arte armazenada nesta proposta ainda.
                  </div>
                  <p className="text-[11px]">
                    Envie o layout (PNG, JPG, WebP ou PDF) acima para iniciar o controle de versões e aceite formal.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {artVersions.map((art) => {
                    const isImage = art.mimeType.startsWith('image/');
                    const isPdf = art.mimeType === 'application/pdf';
                    const badgeClass =
                      art.status === 'aprovada'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : art.status === 'revisao_solicitada'
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : art.status === 'substituida'
                        ? 'bg-slate-100 text-slate-500 border-slate-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200';
                    const statusLabel =
                      art.status === 'aprovada'
                        ? 'Aprovada'
                        : art.status === 'revisao_solicitada'
                        ? 'Revisão Solicitada'
                        : art.status === 'substituida'
                        ? 'Substituída'
                        : 'Enviada ao Cliente';

                    return (
                      <div
                        key={art.id}
                        className={`p-4 rounded-xl border flex flex-col sm:flex-row gap-4 ${
                          art.status === 'aprovada'
                            ? 'bg-emerald-50/30 border-emerald-200'
                            : art.status === 'revisao_solicitada'
                            ? 'bg-amber-50/40 border-amber-200'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        {/* Thumbnail / Ícone */}
                        <div className="shrink-0">
                          {isImage ? (
                            <button
                              type="button"
                              onClick={() => setPreviewArt(art)}
                              className="w-24 h-24 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center hover:ring-2 hover:ring-blue-500 transition-all cursor-pointer"
                              title="Clique para ampliar"
                            >
                              <img
                                src={art.fileUrl}
                                alt={`Arte v${art.version} - ${art.fileName}`}
                                className="max-w-full max-h-full object-contain"
                              />
                            </button>
                          ) : (
                            <div className="w-24 h-24 rounded-lg border border-slate-200 bg-slate-100 flex flex-col items-center justify-center text-slate-600 gap-1">
                              {isPdf ? (
                                <FileText className="w-7 h-7 text-rose-600" />
                              ) : (
                                <Link2 className="w-7 h-7 text-blue-600" />
                              )}
                              <span className="text-[10px] font-bold uppercase">
                                {isPdf ? 'PDF' : 'HTTPS'}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Detalhes */}
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-slate-900">
                                Arte v{art.version}
                              </span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${badgeClass}`}>
                                {statusLabel}
                              </span>
                              <span className="text-slate-700 font-medium truncate max-w-[240px]">
                                {art.fileName}
                              </span>
                              {art.fileSizeBytes ? (
                                <span className="text-[10px] font-mono text-slate-400">
                                  ({formatFileSize(art.fileSizeBytes)})
                                </span>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-1.5">
                              {isImage && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewArt(art)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Ampliar</span>
                                </button>
                              )}
                              <a
                                href={art.fileUrl}
                                download={art.mimeType !== 'external_link' ? art.fileName : undefined}
                                target={art.mimeType === 'external_link' ? '_blank' : undefined}
                                rel={art.mimeType === 'external_link' ? 'noopener noreferrer' : undefined}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>{art.mimeType === 'external_link' ? 'Abrir Link' : 'Baixar'}</span>
                              </a>
                              {canManageArt && art.status !== 'aprovada' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setApprovingVersion(art.version);
                                    setShowRevisionForm(false);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Aprovar v{art.version}</span>
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="text-[11px] text-slate-500 flex items-center gap-2">
                            <Clock className="w-3 h-3" />
                            <span>
                              Enviada por <strong className="text-slate-700">{art.uploadedBy}</strong> em{' '}
                              {formatDateTimeBR(art.uploadedAt)}
                            </span>
                          </div>

                          {art.notes && (
                            <div className="text-[11px] text-slate-700 bg-slate-50 px-2.5 py-1.5 rounded border border-slate-100">
                              <strong>Notas da Arte:</strong> {art.notes}
                            </div>
                          )}

                          {art.revisionNotes && (
                            <div className="text-[11px] text-amber-950 bg-amber-50 px-2.5 py-1.5 rounded border border-amber-200">
                              <strong>
                                Revisão solicitada por {art.revisionRequestedBy || 'Cliente'}
                                {art.revisionRequestedAt ? ` em ${formatDateTimeBR(art.revisionRequestedAt)}` : ''}:
                              </strong>{' '}
                              {art.revisionNotes}
                            </div>
                          )}

                          {art.approvedBy && (
                            <div className="text-[11px] text-emerald-900 bg-emerald-50 px-2.5 py-1.5 rounded border border-emerald-200">
                              <strong>Aprovada formalmente por {art.approvedBy}</strong>
                              {art.approvedAt ? ` em ${formatDateTimeBR(art.approvedAt)}` : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* ABA 2: HISTÓRICO DE VERSÕES DA PROPOSTA (v1, v2, v3...) */
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                Cada emissão ou revisão comercial da proposta preserva um <strong>snapshot auditável</strong>{' '}
                com itens, custos, preços negociados, margem estimada e condições de pagamento daquela versão.
              </div>

              {versionHistory.map((snap) => {
                const isExpanded = expandedVersion === snap.version;
                const snapStatus = getCommercialStatusBadge(snap.commercialStatus as any);
                const snapArt = getArtworkStatusMeta(snap.artStatus);
                return (
                  <div
                    key={snap.version}
                    className={`rounded-xl border overflow-hidden ${
                      snap.version === quote.version
                        ? 'border-blue-300 bg-blue-50/20'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedVersion(isExpanded ? null : snap.version)}
                      className="w-full p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left cursor-pointer hover:bg-slate-50/80 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-slate-900 text-sm">
                            Versão v{snap.version}
                          </span>
                          {snap.version === quote.version && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#111113] text-white">
                              ATUAL
                            </span>
                          )}
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${snapStatus.bg}`}>
                            {snapStatus.label}
                          </span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${snapArt.badge}`}>
                            {snapArt.label}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600">
                          {snap.changeSummary}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Salva por <strong className="text-slate-600">{snap.savedBy}</strong> em{' '}
                          {formatDateTimeBR(snap.savedAt)} · Validade: {formatDateBR(snap.validUntil)} ·{' '}
                          {snap.totalPieces} peças
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <div className="font-mono font-black text-sm text-blue-700">
                            {formatCurrencyBRL(snap.negotiatedTotalAmount)}
                          </div>
                          <div className="text-[10px] font-mono text-emerald-700">
                            Margem: {Number(snap.estimatedMarginPercentage || 0).toFixed(1)}% · Sinal 50%:{' '}
                            {formatCurrencyBRL(snap.entryAmount)}
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 border-t border-slate-100 bg-white">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-[11px]">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-500">
                                <th className="py-1.5 pr-3">Item / Tecido</th>
                                <th className="py-1.5 px-2 text-right">Qtd</th>
                                <th className="py-1.5 px-2 text-right">Custo Base</th>
                                <th className="py-1.5 px-2 text-right">Sugerido</th>
                                <th className="py-1.5 px-2 text-right">Negociado</th>
                                <th className="py-1.5 pl-2 text-right">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono">
                              {snap.items.map((it, idx) => (
                                <tr key={idx}>
                                  <td className="py-2 pr-3 font-sans">
                                    <div className="font-semibold text-slate-800">{it.modelName}</div>
                                    <div className="text-[10px] text-slate-500">
                                      {it.fabricName} · {it.fabricColor}
                                    </div>
                                  </td>
                                  <td className="py-2 px-2 text-right">{it.totalQuantity}</td>
                                  <td className="py-2 px-2 text-right text-slate-500">
                                    {formatCurrencyBRL(it.calculatedBaseUnitCost)}
                                  </td>
                                  <td className="py-2 px-2 text-right text-slate-500">
                                    {formatCurrencyBRL(it.suggestedUnitPrice)}
                                  </td>
                                  <td className="py-2 px-2 text-right font-semibold text-slate-900">
                                    {formatCurrencyBRL(it.negotiatedUnitPrice)}
                                  </td>
                                  <td className="py-2 pl-2 text-right font-bold text-blue-700">
                                    {formatCurrencyBRL(it.totalItemPrice)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#111113] hover:bg-[#1E1E22] transition-colors text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Lightbox In-App para Visualizar Imagem da Arte */}
      {previewArt && (
        <div
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setPreviewArt(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 bg-[#111113] text-white flex items-center justify-between text-xs">
              <span className="font-bold">
                Arte v{previewArt.version} — {previewArt.fileName}
              </span>
              <button
                type="button"
                onClick={() => setPreviewArt(null)}
                className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-slate-100 flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={previewArt.fileUrl}
                alt={`Arte v${previewArt.version}`}
                className="max-w-full max-h-[68vh] object-contain rounded shadow-sm bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
