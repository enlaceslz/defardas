import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  MapPin,
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
  Navigation,
} from 'lucide-react';
import {
  LocationSharePayload,
  SharedLocationListItem,
} from '../types/erp';
import { api } from '../api/client';
import { AddressLocationMap } from './AddressLocationMap';
import { SharedLocationViewer } from './SharedLocationViewer';
import { PhoneInputBR } from './FormInputs';
import {
  buildLocationWhatsAppMessage,
  buildWhatsAppSendUrl,
  copyTextToClipboard,
  encodeLocationShareFallback,
  formatCoordinates,
  getPrecisionLabel,
  normalizeWhatsAppDigitsBR,
} from '../utils/addressUtils';

interface WhatsAppLocationShareModalProps {
  location: LocationSharePayload;
  onSendViaCentralWhatsApp?: (
    phone: string,
    recipientName: string,
    message: string
  ) => Promise<void> | void;
  onClose: () => void;
}

export const WhatsAppLocationShareModal: React.FC<WhatsAppLocationShareModalProps> = ({
  location,
  onSendViaCentralWhatsApp,
  onClose,
}) => {
  const [expiresInHours, setExpiresInHours] = useState<number>(168);
  const [recipientName, setRecipientName] = useState<string>('');
  const [recipientPhone, setRecipientPhone] = useState<string>('');

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [generatedShare, setGeneratedShare] = useState<{
    id: string;
    token: string;
    url: string;
    expiresAt: string;
  } | null>(null);

  const [messageText, setMessageText] = useState<string>('');
  const [copiedType, setCopiedType] = useState<'link' | 'msg' | 'coords' | 'address' | null>(null);
  const [isDispatchingCentral, setIsDispatchingCentral] = useState<boolean>(false);
  const [showRoutePreview, setShowRoutePreview] = useState<boolean>(false);

  const [history, setHistory] = useState<SharedLocationListItem[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const didInitRef = useRef<boolean>(false);

  const precisionInfo = useMemo(
    () => getPrecisionLabel(location.geoPrecision),
    [location.geoPrecision]
  );

  const activeHistoryCount = useMemo(
    () => history.filter((item) => !item.revokedAt && !item.isExpired).length,
    [history]
  );

  const generateShareLink = async (hours = expiresInHours) => {
    setIsGenerating(true);
    setErrorMsg('');
    const label = recipientName.trim() || recipientPhone.trim() || undefined;
    const res = await api.createSharedLocationLink({
      location,
      expiresInHours: hours,
      recipientLabel: label,
    });
    setIsGenerating(false);

    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    if (res.status < 200 || res.status >= 300 || !res.data?.token) {
      const fallbackExpiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
      const fallbackParam = encodeLocationShareFallback(location, fallbackExpiresAt);
      if (fallbackParam) {
        const fallbackUrl = `${origin}/?mapa=share&d=${encodeURIComponent(fallbackParam)}`;
        setGeneratedShare({
          id: 'local-fallback',
          token: 'share',
          url: fallbackUrl,
          expiresAt: fallbackExpiresAt,
        });
        setMessageText(buildLocationWhatsAppMessage(location, fallbackUrl, fallbackExpiresAt));
        setErrorMsg(
          `${res.error || `Servidor retornou HTTP ${res.status}`}. Link direto alternativo gerado para envio imediato no WhatsApp.`
        );
        return;
      }
      setErrorMsg(res.error || `Falha ao gerar link de localização (HTTP ${res.status}).`);
      return;
    }

    const fallbackParam = encodeLocationShareFallback(location, res.data.expiresAt);
    const shareUrl = `${origin}/?mapa=${encodeURIComponent(res.data.token)}${
      fallbackParam ? `&d=${encodeURIComponent(fallbackParam)}` : ''
    }`;
    setGeneratedShare({
      id: res.data.id,
      token: res.data.token,
      url: shareUrl,
      expiresAt: res.data.expiresAt,
    });
    setMessageText(buildLocationWhatsAppMessage(location, shareUrl, res.data.expiresAt));
    loadHistory();
  };

  const loadHistory = async () => {
    const res = await api.listSharedLocationLinks();
    if (res.status === 200 && Array.isArray(res.data)) {
      setHistory(res.data);
    }
  };

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    generateShareLink(expiresInHours);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = async (text: string, type: 'link' | 'msg' | 'coords' | 'address') => {
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
    const res = await api.revokeSharedLocationLink(id);
    if (res.status === 200) {
      loadHistory();
      if (generatedShare?.id === id) {
        setGeneratedShare(null);
        setMessageText('');
      }
    }
  };

  const waDigits = normalizeWhatsAppDigitsBR(recipientPhone);
  const hasInvalidPartialPhone = recipientPhone.trim().length > 0 && waDigits.length < 10;
  const waHref =
    generatedShare && messageText
      ? buildWhatsAppSendUrl(messageText, waDigits.length >= 10 ? recipientPhone : undefined)
      : '#';

  const handleSendCentral = async () => {
    if (!onSendViaCentralWhatsApp || !generatedShare) return;
    if (hasInvalidPartialPhone) {
      setErrorMsg('Informe o número completo com DDD (mín. 10 dígitos) ou deixe o campo em branco para escolher a conversa na Central.');
      return;
    }
    setErrorMsg('');
    setIsDispatchingCentral(true);
    await onSendViaCentralWhatsApp(
      waDigits.length >= 10 ? recipientPhone : '',
      recipientName.trim() || location.title,
      messageText
    );
    setIsDispatchingCentral(false);
    onClose();
  };

  const locationPhoneDigits = normalizeWhatsAppDigitsBR(location.phone || '');

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-zinc-200 my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#111113] text-white border-b border-zinc-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#C8102E]/20 border border-[#C8102E]/40 text-[#FF4D6A] flex items-center justify-center shrink-0">
              <Navigation className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold truncate">Compartilhar Localização &amp; Rota via WhatsApp</h3>
              <p className="text-[11px] text-zinc-400 truncate">
                {location.locationCode} · {location.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg cursor-pointer"
            aria-label="Fechar modal de localização"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-start gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-[#C8102E] shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
              {(!generatedShare || generatedShare.id === 'local-fallback') && (
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => generateShareLink(expiresInHours)}
                  className="px-2.5 py-1 bg-white hover:bg-rose-100 border border-rose-300 rounded-lg text-[11px] font-semibold text-rose-800 cursor-pointer shrink-0"
                >
                  Tentar novamente
                </button>
              )}
            </div>
          )}

          {/* Mini Mapa + Resumo do Endereço */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-zinc-900 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#C8102E] shrink-0" />
                    <span>{location.title}</span>
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${precisionInfo.toneClass}`}>
                    {precisionInfo.label}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-zinc-700 leading-snug">
                  <span>{location.fullAddressLine}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(location.fullAddressLine, 'address')}
                    className="inline-flex items-center gap-1 text-[#C8102E] hover:underline font-semibold cursor-pointer text-[11px]"
                  >
                    {copiedType === 'address' ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copiedType === 'address' ? 'Copiado!' : 'Copiar Endereço'}</span>
                  </button>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-600">
                  <span>GPS: {formatCoordinates(location.latitude, location.longitude)}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(formatCoordinates(location.latitude, location.longitude), 'coords')}
                    className="inline-flex items-center gap-1 text-[#C8102E] hover:underline font-sans font-semibold cursor-pointer"
                  >
                    {copiedType === 'coords' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedType === 'coords' ? 'Copiado!' : 'Copiar Lat/Lng'}</span>
                  </button>
                </div>
              </div>
            </div>

            <AddressLocationMap
              latitude={location.latitude}
              longitude={location.longitude}
              label={location.title}
              heightClass="h-44"
            />
          </div>

          {/* Link Interativo + Validade */}
          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-zinc-800 font-bold">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Link de Mapa Interativo com Rota Automática</span>
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
                  <option value={72}>3 dias</option>
                  <option value={168}>7 dias</option>
                  <option value={720}>30 dias</option>
                </select>
                <button
                  type="button"
                  onClick={() => generateShareLink(expiresInHours)}
                  disabled={isGenerating}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-zinc-100 border border-zinc-300 rounded-lg text-[11px] font-semibold text-zinc-700 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
                  <span>Novo Token</span>
                </button>
              </div>
            </div>

            {isGenerating && !generatedShare ? (
              <div className="py-2 text-zinc-500">Gerando link de localização...</div>
            ) : generatedShare ? (
              <div className="space-y-2">
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

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRoutePreview(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-zinc-100 border border-zinc-300 text-zinc-800 font-semibold rounded-lg text-[11px] cursor-pointer"
                  >
                    <Navigation className="w-3.5 h-3.5 text-[#C8102E]" />
                    <span>Pré-visualizar Mapa &amp; Rota</span>
                  </button>
                  <a
                    href={generatedShare.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-zinc-100 border border-zinc-300 text-zinc-800 font-semibold rounded-lg text-[11px]"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-600" />
                    <span>Abrir Link em Nova Aba</span>
                  </a>
                </div>
              </div>
            ) : null}

            {generatedShare && (
              <div className="text-[11px] text-zinc-500 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Ao abrir o link, o destinatário vê o endereço completo, coordenadas e traça a rota pelo GPS ou CEP.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowHistory((prev) => !prev);
                    if (!showHistory) loadHistory();
                  }}
                  className="text-[#C8102E] hover:underline font-semibold cursor-pointer"
                >
                  {showHistory ? 'Ocultar links' : `Links ativos (${activeHistoryCount})`}
                </button>
              </div>
            )}
          </div>

          {showHistory && (
            <div className="border border-zinc-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-zinc-100 border-b border-zinc-200 font-bold text-zinc-700 flex justify-between">
                <span>Histórico de Localizações Compartilhadas</span>
                <span className="font-mono text-[11px]">{history.length} registros</span>
              </div>
              <div className="max-h-36 overflow-y-auto divide-y divide-zinc-100">
                {history.length === 0 ? (
                  <div className="p-3 text-center text-zinc-400">Nenhum link registrado.</div>
                ) : (
                  history.map((item) => (
                    <div key={item.id} className="px-4 py-2 flex items-center justify-between gap-3 hover:bg-zinc-50">
                      <div className="min-w-0">
                        <div className="font-semibold text-zinc-800 truncate">
                          <span className="font-mono text-[#C8102E]">{item.locationCode}</span> · {item.title}
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

          {/* Destinatário */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="font-bold text-zinc-800 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-[#C8102E]" />
                <span>Destinatário do WhatsApp (Opcional — não precisa digitar número)</span>
              </label>
              <div className="flex items-center gap-3 flex-wrap">
                {locationPhoneDigits.length >= 10 && waDigits !== locationPhoneDigits && (
                  <button
                    type="button"
                    onClick={() => {
                      setRecipientPhone(location.phone || '');
                      if (!recipientName.trim()) {
                        setRecipientName(location.contactName || location.title || '');
                      }
                      if (errorMsg) setErrorMsg('');
                    }}
                    className="text-[11px] font-semibold text-[#C8102E] hover:underline cursor-pointer"
                  >
                    Usar tel. do cadastro ({location.phone})
                  </button>
                )}
                {recipientPhone && (
                  <button
                    type="button"
                    onClick={() => {
                      setRecipientPhone('');
                      if (errorMsg) setErrorMsg('');
                    }}
                    className="text-[11px] font-semibold text-zinc-500 hover:text-[#C8102E] underline cursor-pointer"
                  >
                    Limpar número
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Nome do contato / motorista (opcional)"
                className="px-3 py-2 border border-zinc-300 rounded-lg text-zinc-900"
              />
              <div>
                <PhoneInputBR
                  value={recipientPhone}
                  onChange={(masked) => {
                    setRecipientPhone(masked);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="Opcional: WhatsApp com DDD ou deixe vazio"
                />
                {hasInvalidPartialPhone ? (
                  <p className="mt-1 text-[10px] text-amber-700 font-medium">
                    Complete o número com DDD (mín. 10 dígitos) ou deixe vazio para escolher o contato no WhatsApp.
                  </p>
                ) : (
                  <p className="mt-1 text-[10px] text-zinc-500">
                    Deixe em branco para escolher o contato ou grupo diretamente ao abrir o WhatsApp.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Prévia da Mensagem */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-zinc-800">
                Mensagem WhatsApp (Endereço + Coordenadas + Link de Rota)
              </label>
              <button
                type="button"
                onClick={() => handleCopy(messageText, 'msg')}
                disabled={!messageText}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#C8102E] hover:underline cursor-pointer disabled:opacity-50"
              >
                {copiedType === 'msg' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedType === 'msg' ? 'Copiado!' : 'Copiar Mensagem'}</span>
              </button>
            </div>
            <textarea
              rows={6}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-zinc-300 rounded-xl font-sans text-xs text-zinc-800 bg-zinc-50/70 focus:bg-white leading-relaxed"
            />
          </div>

          {/* Ações */}
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
                <span>
                  {waDigits.length >= 10
                    ? 'Enviar no WhatsApp Web'
                    : 'Abrir WhatsApp (Escolher Contato)'}
                </span>
              </a>

              {onSendViaCentralWhatsApp && (
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

      {showRoutePreview && generatedShare && (
        <div className="fixed inset-0 z-[70] bg-white overflow-y-auto">
          <SharedLocationViewer
            token={generatedShare.token}
            fallbackParam={encodeLocationShareFallback(location, generatedShare.expiresAt)}
            isPreview
            onExitToLogin={() => setShowRoutePreview(false)}
          />
        </div>
      )}
    </div>
  );
};
