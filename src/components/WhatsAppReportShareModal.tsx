import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Share2,
  Copy,
  Check,
  MessageSquare,
  ExternalLink,
  Link2,
  Clock,
  ShieldCheck,
  RefreshCw,
  UserCheck,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import {
  Client,
  Partner,
  ReportSnapshot,
  SharedReportListItem,
  Supplier,
} from '../types/erp';
import { api } from '../api/client';
import {
  buildWhatsAppSummaryMessage,
  normalizeWhatsAppDigitsBR,
} from '../utils/reportBuilder';
import {
  buildWhatsAppSendUrl,
  copyTextToClipboard,
} from '../utils/addressUtils';

interface WhatsAppReportShareModalProps {
  snapshot: ReportSnapshot;
  clients?: Client[];
  partners?: Partner[];
  suppliers?: Supplier[];
  canSendViaCentral?: boolean;
  onSendViaCentralWhatsApp?: (
    phone: string,
    recipientName: string,
    message: string
  ) => Promise<void> | void;
  onClose: () => void;
}

export const WhatsAppReportShareModal: React.FC<WhatsAppReportShareModalProps> = ({
  snapshot,
  clients = [],
  partners = [],
  suppliers = [],
  canSendViaCentral = true,
  onSendViaCentralWhatsApp,
  onClose,
}) => {
  const [expiresInHours, setExpiresInHours] = useState<number>(72);
  const [recipientType, setRecipientType] = useState<'custom' | 'client' | 'partner' | 'supplier'>('custom');
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [customName, setCustomName] = useState<string>('');
  const [customPhone, setCustomPhone] = useState<string>('');

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [generatedShare, setGeneratedShare] = useState<{
    id: string;
    token: string;
    url: string;
    expiresAt: string;
  } | null>(null);

  const [messageText, setMessageText] = useState<string>('');
  const [copiedType, setCopiedType] = useState<'link' | 'msg' | null>(null);
  const [isDispatchingCentral, setIsDispatchingCentral] = useState<boolean>(false);

  const [history, setHistory] = useState<SharedReportListItem[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  const recipientLabel = useMemo(() => {
    if (recipientType === 'client') {
      const c = clients.find((item) => item.id === selectedEntityId);
      return c ? `${c.tradeName} (${c.phone})` : '';
    }
    if (recipientType === 'partner') {
      const p = partners.find((item) => item.id === selectedEntityId);
      return p ? `${p.tradeName} (${p.phone})` : '';
    }
    if (recipientType === 'supplier') {
      const s = suppliers.find((item) => item.id === selectedEntityId);
      return s ? `${s.tradeName} (${s.phone})` : '';
    }
    return customName.trim() || customPhone.trim() || '';
  }, [recipientType, selectedEntityId, clients, partners, suppliers, customName, customPhone]);

  const effectivePhoneAndName = useMemo(() => {
    if (recipientType === 'client') {
      const c = clients.find((item) => item.id === selectedEntityId);
      return { phone: c?.phone || '', name: c?.tradeName || c?.companyName || 'Cliente' };
    }
    if (recipientType === 'partner') {
      const p = partners.find((item) => item.id === selectedEntityId);
      return { phone: p?.phone || '', name: p?.tradeName || p?.name || 'Parceiro' };
    }
    if (recipientType === 'supplier') {
      const s = suppliers.find((item) => item.id === selectedEntityId);
      return { phone: s?.phone || '', name: s?.tradeName || s?.companyName || 'Fornecedor' };
    }
    return { phone: customPhone.trim(), name: customName.trim() || 'Destinatário' };
  }, [recipientType, selectedEntityId, clients, partners, suppliers, customPhone, customName]);

  const generateShareLink = async (hours = expiresInHours) => {
    setIsGenerating(true);
    setErrorMsg('');
    const res = await api.createSharedReportLink({
      snapshot,
      expiresInHours: hours,
      recipientLabel: recipientLabel || undefined,
    });
    setIsGenerating(false);

    if (res.status < 200 || res.status >= 300 || !res.data?.token) {
      setErrorMsg(res.error || `Falha ao gerar link compartilhável (HTTP ${res.status}).`);
      return;
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const shareUrl = `${origin}/?relatorio=${encodeURIComponent(res.data.token)}`;
    setGeneratedShare({
      id: res.data.id,
      token: res.data.token,
      url: shareUrl,
      expiresAt: res.data.expiresAt,
    });
    setMessageText(buildWhatsAppSummaryMessage(snapshot, shareUrl, res.data.expiresAt));
    loadHistory();
  };

  const loadHistory = async () => {
    const res = await api.listSharedReportLinks();
    if (res.status === 200 && Array.isArray(res.data)) {
      setHistory(res.data);
    }
  };

  useEffect(() => {
    generateShareLink(expiresInHours);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = async (text: string, type: 'link' | 'msg') => {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setErrorMsg('');
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2500);
    } else {
      setErrorMsg('Não foi possível copiar automaticamente. Selecione o texto e pressione Ctrl+C.');
    }
  };

  const handleRevokeHistoryItem = async (id: string) => {
    const res = await api.revokeSharedReportLink(id);
    if (res.status === 200) {
      loadHistory();
      if (generatedShare?.id === id) {
        setGeneratedShare(null);
        setMessageText('');
      }
    }
  };

  const waDigits = normalizeWhatsAppDigitsBR(effectivePhoneAndName.phone);
  const waHref =
    generatedShare && messageText
      ? buildWhatsAppSendUrl(
          messageText,
          waDigits.length >= 10 ? effectivePhoneAndName.phone : undefined
        )
      : '#';

  const handleSendCentral = async () => {
    if (!onSendViaCentralWhatsApp || !generatedShare) return;
    if (effectivePhoneAndName.phone.trim().length > 0 && waDigits.length < 10) {
      setErrorMsg('Informe o número completo com DDD ou deixe o campo em branco para escolher a conversa na Central.');
      return;
    }
    setErrorMsg('');
    setIsDispatchingCentral(true);
    await onSendViaCentralWhatsApp(
      waDigits.length >= 10 ? effectivePhoneAndName.phone : '',
      effectivePhoneAndName.name,
      messageText
    );
    setIsDispatchingCentral(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 no-print">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-zinc-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#111113] text-white border-b border-zinc-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#C8102E]/20 border border-[#C8102E]/40 text-[#FF4D6A] flex items-center justify-center shrink-0">
              <Share2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold truncate">Exportar Relatório via Link WhatsApp</h3>
              <p className="text-[11px] text-zinc-400 font-mono truncate">
                {snapshot.reportCode} · {snapshot.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg cursor-pointer"
            aria-label="Fechar modal de compartilhamento"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#C8102E] shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Step 1: Link settings & Security */}
          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-zinc-800 font-bold">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Link Auditável Somente Leitura (com Impressão PDF)</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-medium text-zinc-600 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Validade:</span>
                </label>
                <select
                  value={expiresInHours}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setExpiresInHours(next);
                    generateShareLink(next);
                  }}
                  className="px-2.5 py-1 bg-white border border-zinc-300 rounded-lg text-xs font-medium text-zinc-800"
                >
                  <option value={24}>24 horas</option>
                  <option value={72}>3 dias (72h)</option>
                  <option value={168}>7 dias</option>
                  <option value={720}>30 dias</option>
                </select>
                <button
                  type="button"
                  onClick={() => generateShareLink(expiresInHours)}
                  disabled={isGenerating}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-zinc-100 border border-zinc-300 rounded-lg text-[11px] font-semibold text-zinc-700 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  title="Gerar novo token de link"
                >
                  <RefreshCw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
                  <span>Novo Token</span>
                </button>
              </div>
            </div>

            {isGenerating && !generatedShare ? (
              <div className="py-3 text-zinc-500 font-medium">Gerando link criptografado no servidor...</div>
            ) : generatedShare ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-white border border-zinc-300 rounded-lg font-mono text-[11px] text-zinc-800 overflow-hidden">
                  <Link2 className="w-3.5 h-3.5 text-[#C8102E] shrink-0" />
                  <span className="truncate select-all">{generatedShare.url}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(generatedShare.url, 'link')}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-[#111113] hover:bg-[#1E1E22] text-white font-semibold rounded-lg cursor-pointer whitespace-nowrap"
                >
                  {copiedType === 'link' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedType === 'link' ? 'Link Copiado!' : 'Copiar Link'}</span>
                </button>
              </div>
            ) : null}

            {generatedShare && (
              <div className="text-[11px] text-zinc-500 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Expira em:{' '}
                  <strong className="font-mono text-zinc-700">
                    {new Date(generatedShare.expiresAt).toLocaleString('pt-BR')}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowHistory((prev) => !prev);
                    if (!showHistory) loadHistory();
                  }}
                  className="text-[#C8102E] hover:underline font-semibold cursor-pointer"
                >
                  {showHistory ? 'Ocultar links gerados' : `Gerenciar links ativos (${history.length})`}
                </button>
              </div>
            )}
          </div>

          {/* Optional History / Revoke List */}
          {showHistory && (
            <div className="border border-zinc-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-zinc-100 border-b border-zinc-200 font-bold text-zinc-700 flex justify-between">
                <span>Histórico de Links Exportados</span>
                <span className="font-mono text-[11px]">{history.length} registros</span>
              </div>
              <div className="max-h-40 overflow-y-auto divide-y divide-zinc-100">
                {history.length === 0 ? (
                  <div className="p-4 text-center text-zinc-400">Nenhum link registrado nesta sessão.</div>
                ) : (
                  history.map((item) => (
                    <div key={item.id} className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-zinc-50">
                      <div className="min-w-0">
                        <div className="font-semibold text-zinc-800 truncate">
                          <span className="font-mono text-[#C8102E]">{item.reportCode}</span> · {item.title}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          Acessos: {item.accessCount} · Expira: {new Date(item.expiresAt).toLocaleDateString('pt-BR')}
                          {item.revokedAt ? ' · REVOGADO' : item.isExpired ? ' · EXPIRADO' : ' · ATIVO'}
                        </div>
                      </div>
                      {!item.revokedAt && !item.isExpired && (
                        <button
                          type="button"
                          onClick={() => handleRevokeHistoryItem(item.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Revogar</span>
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Step 2: Select Recipient */}
          <div className="space-y-3">
            <label className="block font-bold text-zinc-800 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-[#C8102E]" />
              <span>Destinatário do WhatsApp (Opcional para Envio Direto)</span>
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-zinc-100 rounded-xl">
              {[
                { id: 'custom', label: 'Número Avulso' },
                { id: 'client', label: `Clientes (${clients.length})` },
                { id: 'partner', label: `Parceiros (${partners.length})` },
                { id: 'supplier', label: `Fornecedores (${suppliers.length})` },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setRecipientType(opt.id as any);
                    setSelectedEntityId('');
                  }}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    recipientType === opt.id
                      ? 'bg-white text-zinc-900 shadow-2xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {recipientType === 'custom' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Nome / Empresa destinatária (opcional)"
                  className="px-3 py-2 border border-zinc-300 rounded-lg text-zinc-900"
                />
                <input
                  type="text"
                  value={customPhone}
                  onChange={(e) => setCustomPhone(e.target.value)}
                  placeholder="WhatsApp com DDD (ex: 98 98841-2090)"
                  className="px-3 py-2 border border-zinc-300 rounded-lg text-zinc-900 font-mono"
                />
              </div>
            ) : (
              <select
                value={selectedEntityId}
                onChange={(e) => setSelectedEntityId(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900"
              >
                <option value="">
                  Selecione um{' '}
                  {recipientType === 'client'
                    ? 'cliente'
                    : recipientType === 'partner'
                      ? 'parceiro / facção'
                      : 'fornecedor'}
                  ...
                </option>
                {recipientType === 'client' &&
                  clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.tradeName} — {c.phone}
                    </option>
                  ))}
                {recipientType === 'partner' &&
                  partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.tradeName} ({p.code}) — {p.phone}
                    </option>
                  ))}
                {recipientType === 'supplier' &&
                  suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.tradeName} ({s.code}) — {s.phone}
                    </option>
                  ))}
              </select>
            )}
          </div>

          {/* Step 3: Message Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-zinc-800">Mensagem Pronta para WhatsApp</label>
              <button
                type="button"
                onClick={() => handleCopy(messageText, 'msg')}
                disabled={!messageText}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#C8102E] hover:underline cursor-pointer disabled:opacity-50"
              >
                {copiedType === 'msg' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedType === 'msg' ? 'Mensagem Copiada!' : 'Copiar Mensagem + Link'}</span>
              </button>
            </div>
            <textarea
              rows={7}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-zinc-300 rounded-xl font-sans text-xs text-zinc-800 bg-zinc-50/70 focus:bg-white leading-relaxed"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-zinc-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-zinc-300 rounded-lg text-zinc-700 font-semibold hover:bg-zinc-50 cursor-pointer"
            >
              Fechar
            </button>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!generatedShare}
                className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                  generatedShare
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                    : 'bg-zinc-100 text-zinc-400 border-zinc-200 pointer-events-none'
                }`}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir no WhatsApp Web</span>
              </a>

              {canSendViaCentral && onSendViaCentralWhatsApp && (
                <button
                  type="button"
                  onClick={handleSendCentral}
                  disabled={!generatedShare || isDispatchingCentral}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#C8102E] hover:bg-[#A60D26] text-white font-semibold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>
                    {isDispatchingCentral ? 'Abrindo Central...' : 'Enviar via Central WhatsApp'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
