import React, { useEffect, useState } from 'react';
import {
  MapPin,
  Navigation,
  LocateFixed,
  Copy,
  Check,
  Clock,
  AlertTriangle,
  LogIn,
  Loader2,
  ExternalLink,
  Compass,
  Phone,
  ChevronDown,
  ChevronUp,
  Search,
} from 'lucide-react';
import { api } from '../api/client';
import {
  RouteCalculationResult,
  SharedLocationPublicPayload,
} from '../types/erp';
import { DEFAULT_BRAND_LOGO_URL } from '../data/initialData';
import { AddressLocationMap } from './AddressLocationMap';
import {
  buildGeoUri,
  buildOsmDirectionsUrl,
  buildWazeUrl,
  copyTextToClipboard,
  decodeLocationShareFallback,
  formatCoordinates,
  formatDistanceKm,
  formatDurationPtBr,
  getPrecisionLabel,
  isValidCoordinates,
} from '../utils/addressUtils';

interface SharedLocationViewerProps {
  token: string;
  fallbackParam?: string | null;
  isPreview?: boolean;
  defaultOrigin?: { lat: number; lng: number; label: string } | null;
  onExitToLogin: () => void;
}

export const SharedLocationViewer: React.FC<SharedLocationViewerProps> = ({
  token,
  fallbackParam,
  isPreview = false,
  defaultOrigin = null,
  onExitToLogin,
}) => {
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<{ code?: string; message: string } | null>(null);
  const [payload, setPayload] = useState<SharedLocationPublicPayload | null>(null);

  const [originCoords, setOriginCoords] = useState<{
    lat: number;
    lng: number;
    label: string;
  } | null>(null);
  const [originQuery, setOriginQuery] = useState('');
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [isSearchingOrigin, setIsSearchingOrigin] = useState(false);
  const [routeError, setRouteError] = useState<string>('');
  const [routeResult, setRouteResult] = useState<RouteCalculationResult | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [copiedField, setCopiedField] = useState<'coords' | 'address' | 'link' | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setErrorState(null);
      const res = await api.getSharedLocationByToken(token);
      if (!active) return;

      if (res.status === 200 && res.data?.location) {
        setPayload(res.data);
        setLoading(false);
        return;
      }

      const isStrictlyBlocked =
        res.status === 410 ||
        res.code === 'LOCATION_SHARE_REVOKED' ||
        res.code === 'LOCATION_SHARE_EXPIRED';

      if (!isStrictlyBlocked) {
        let rawFallback = fallbackParam ?? null;
        if (!rawFallback && typeof window !== 'undefined') {
          try {
            rawFallback = new URLSearchParams(window.location.search).get('d');
          } catch {
            rawFallback = null;
          }
        }
        const decoded = decodeLocationShareFallback(rawFallback);
        if (decoded) {
          setPayload(decoded);
          setLoading(false);
          return;
        }
      }

      setLoading(false);
      setErrorState({
        code: res.code,
        message:
          res.error ||
          'Não foi possível localizar este ponto no mapa. O link pode ter expirado ou sido revogado.',
      });
    };
    load();
    return () => {
      active = false;
    };
  }, [token, fallbackParam]);

  const requestRouteFromCoords = async (fromLat: number, fromLng: number, originLabel: string) => {
    if (!payload?.location) return;
    setRouteError('');
    setOriginCoords({ lat: fromLat, lng: fromLng, label: originLabel });

    const res = await api.calculateRoute({
      fromLat,
      fromLng,
      toLat: payload.location.latitude,
      toLng: payload.location.longitude,
    });

    if (res.status === 200 && res.data) {
      setRouteResult(res.data);
      setShowSteps(true);
    } else {
      setRouteError(res.error || 'Não foi possível calcular a rota neste momento.');
    }
  };

  const handleTraceWithGps = () => {
    setRouteError('');
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setRouteError(
        'Seu navegador não suporta GPS automático. Digite um CEP ou endereço de partida abaixo.'
      );
      return;
    }

    setIsLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setIsLocatingGps(false);
        await requestRouteFromCoords(
          pos.coords.latitude,
          pos.coords.longitude,
          'Sua Localização Atual (GPS)'
        );
      },
      (err) => {
        setIsLocatingGps(false);
        if (err.code === err.PERMISSION_DENIED) {
          setRouteError(
            'Permissão de GPS recusada. Libere a localização ou digite seu CEP / endereço de partida abaixo.'
          );
        } else {
          setRouteError(
            'Não foi possível obter sua posição GPS atual. Digite um CEP ou endereço de partida abaixo.'
          );
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const handleTraceFromOriginInput = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = originQuery.trim();
    if (!q) return;

    setRouteError('');
    setIsSearchingOrigin(true);
    const res = await api.lookupPublicOriginGeocode({ q });
    setIsSearchingOrigin(false);

    if (res.status === 200 && res.data && typeof res.data.latitude === 'number') {
      await requestRouteFromCoords(
        res.data.latitude,
        res.data.longitude,
        res.data.displayName || q
      );
    } else {
      setRouteError(
        res.error || 'Ponto de partida não encontrado. Tente informar CEP ou rua e cidade.'
      );
    }
  };

  useEffect(() => {
    if (!payload?.location || originCoords) return;
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((perm) => {
        if (!cancelled && perm.state === 'granted') {
          handleTraceWithGps();
        }
      })
      .catch(() => {
        // Ignora navegadores sem suporte a Permissions API para geolocation
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload?.locationCode]);

  const handleCopyText = async (text: string, field: 'coords' | 'address' | 'link') => {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2500);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0C0C0E] flex flex-col items-center justify-center text-white p-6">
        <div className="w-8 h-8 border-[3px] border-zinc-800 border-t-[#C8102E] rounded-full animate-spin mb-3" />
        <p className="text-xs text-zinc-400 font-medium">
          Carregando mapa e coordenadas DE FARDAS...
        </p>
      </div>
    );
  }

  if (errorState || !payload) {
    return (
      <div className="min-h-screen bg-[#F6F6F7] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-zinc-200 shadow-lg p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-[#C8102E] flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-extrabold text-zinc-950">
            {errorState?.code === 'LOCATION_SHARE_EXPIRED'
              ? 'Link de Localização Expirado'
              : errorState?.code === 'LOCATION_SHARE_REVOKED'
                ? 'Link Revogado pelo Emissor'
                : 'Localização Indisponível'}
          </h1>
          <p className="text-xs text-zinc-600 leading-relaxed">{errorState?.message}</p>
          <button
            type="button"
            onClick={onExitToLogin}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#111113] hover:bg-[#1E1E22] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>Ir para o Portal DE FARDAS</span>
          </button>
        </div>
      </div>
    );
  }

  const { location } = payload;
  const precisionBadge = getPrecisionLabel(location.geoPrecision);
  const osmUrl = buildOsmDirectionsUrl(
    location.latitude,
    location.longitude,
    originCoords?.lat,
    originCoords?.lng
  );
  const wazeUrl = buildWazeUrl(location.latitude, location.longitude);
  const geoUri = buildGeoUri(location.latitude, location.longitude, location.title);

  return (
    <div className="min-h-screen bg-[#F4F4F6] text-zinc-900 flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-[#111113] text-white border-b border-zinc-800 px-4 sm:px-8 py-3">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-white p-0.5 flex items-center justify-center shrink-0 overflow-hidden">
              <img
                src={location.company.logoUrl || DEFAULT_BRAND_LOGO_URL}
                alt="DE FARDAS"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate flex items-center gap-2">
                <span>Localização &amp; Rota · {location.title}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {location.locationCode}
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                <span>{location.company.tradeName}</span>
                <span className="inline-flex items-center gap-1 font-mono">
                  <Clock className="w-3 h-3" />
                  <span>Válido até {new Date(payload.expiresAt).toLocaleDateString('pt-BR')}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleTraceWithGps}
              disabled={isLocatingGps}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#C8102E] hover:bg-[#A60D26] text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {isLocatingGps ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Navigation className="w-3.5 h-3.5" />
              )}
              <span>{isLocatingGps ? 'Obtendo GPS...' : 'Traçar Rota pelo Meu GPS'}</span>
            </button>
            <button
              type="button"
              onClick={onExitToLogin}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {isPreview ? 'Voltar ao Modal' : 'Portal DE FARDAS'}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-3 sm:p-6 space-y-4 text-xs">
        {/* Destination Details Card */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-xs p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#111113] text-white text-[10px] font-bold uppercase tracking-wider">
                  <MapPin className="w-3 h-3 text-[#FF4D6A]" />
                  <span>{location.subtitle || 'Destino Cadastrado'}</span>
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${precisionBadge.toneClass}`}>
                  {precisionBadge.label}
                </span>
              </div>

              <h1 className="text-lg sm:text-xl font-black text-zinc-950">{location.title}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-zinc-700 font-medium leading-snug">
                  {location.fullAddressLine}
                </p>
                <button
                  type="button"
                  onClick={() => handleCopyText(location.fullAddressLine, 'address')}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[11px] font-semibold cursor-pointer"
                >
                  {copiedField === 'address' ? (
                    <Check className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copiedField === 'address' ? 'Endereço Copiado' : 'Copiar Endereço'}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-[11px] text-zinc-600">
                <span className="inline-flex items-center gap-1.5 font-mono bg-zinc-100 border border-zinc-200 px-2.5 py-1 rounded-lg text-zinc-800">
                  <Compass className="w-3.5 h-3.5 text-[#C8102E]" />
                  <span>{formatCoordinates(location.latitude, location.longitude)}</span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyText(
                        formatCoordinates(location.latitude, location.longitude),
                        'coords'
                      )
                    }
                    className="ml-1 text-[#C8102E] hover:underline font-sans font-semibold inline-flex items-center gap-0.5 cursor-pointer"
                  >
                    {copiedField === 'coords' ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copiedField === 'coords' ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </span>

                {location.phone && (
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Phone className="w-3.5 h-3.5 text-zinc-400" />
                    <span>
                      {location.contactName ? `${location.contactName} · ` : ''}
                      {location.phone}
                    </span>
                  </span>
                )}
              </div>

              {location.notes && (
                <div className="text-[11px] text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 mt-2">
                  <strong>Referência:</strong> {location.notes}
                </div>
              )}
            </div>

            {/* External GPS App Launchers */}
            <div className="flex flex-col gap-2 shrink-0 sm:min-w-[210px]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Abrir Navegação Externa
              </div>
              <a
                href={osmUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg font-semibold text-xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>OpenStreetMap Rota</span>
              </a>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={wazeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1 px-2.5 py-2 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 rounded-lg font-semibold text-[11px]"
                >
                  <Navigation className="w-3 h-3" />
                  <span>Waze</span>
                </a>
                <a
                  href={geoUri}
                  className="inline-flex items-center justify-center gap-1 px-2.5 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 rounded-lg font-semibold text-[11px]"
                >
                  <LocateFixed className="w-3 h-3" />
                  <span>App GPS</span>
                </a>
              </div>
            </div>
          </div>

          {/* Origin Input Bar */}
          <div className="pt-3 border-t border-zinc-200 space-y-2">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button
                type="button"
                onClick={handleTraceWithGps}
                disabled={isLocatingGps}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl cursor-pointer shrink-0 disabled:opacity-60"
              >
                {isLocatingGps ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LocateFixed className="w-4 h-4" />
                )}
                <span>{isLocatingGps ? 'Localizando...' : 'Usar Meu GPS Atual'}</span>
              </button>

              {defaultOrigin &&
                isValidCoordinates(defaultOrigin.lat, defaultOrigin.lng) &&
                (Math.abs(defaultOrigin.lat - location.latitude) > 0.001 ||
                  Math.abs(defaultOrigin.lng - location.longitude) > 0.001) && (
                  <button
                    type="button"
                    onClick={() =>
                      requestRouteFromCoords(defaultOrigin.lat, defaultOrigin.lng, defaultOrigin.label)
                    }
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 text-zinc-800 font-semibold rounded-xl cursor-pointer shrink-0"
                  >
                    <Navigation className="w-3.5 h-3.5 text-[#C8102E]" />
                    <span>Partir da Matriz</span>
                  </button>
                )}

              <form onSubmit={handleTraceFromOriginInput} className="flex-1 flex items-center gap-2">
                <input
                  type="text"
                  value={originQuery}
                  onChange={(e) => setOriginQuery(e.target.value)}
                  placeholder="Ou informe CEP / Endereço de partida (ex: 65075-441 ou Av. Guajajaras, São Luís)"
                  className="flex-1 px-3.5 py-2.5 border border-zinc-300 rounded-xl bg-white text-zinc-900 text-xs focus:ring-2 focus:ring-[#C8102E] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isSearchingOrigin || !originQuery.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#111113] hover:bg-[#232327] text-white font-semibold rounded-xl cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {isSearchingOrigin ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  <span>Traçar Rota</span>
                </button>
              </form>
            </div>
          </div>

          {routeError && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
              <span>{routeError}</span>
            </div>
          )}

          {/* Active Route Summary Banner */}
          {routeResult && (
            <div className="p-3.5 rounded-xl bg-[#111113] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#C8102E] flex items-center justify-center shrink-0">
                  <Navigation className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-base font-black font-mono tabular-nums">
                      {formatDistanceKm(routeResult.distanceMeters)}
                    </span>
                    <span className="text-zinc-400">·</span>
                    <span className="text-base font-black font-mono tabular-nums text-emerald-400">
                      ~{formatDurationPtBr(routeResult.durationSeconds)} de carro
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 truncate max-w-md">
                    Partindo de: {originCoords?.label} ({routeResult.source})
                  </div>
                </div>
              </div>

              {routeResult.steps.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSteps((prev) => !prev)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[11px] font-semibold cursor-pointer self-start sm:self-auto"
                >
                  <span>Instruções ({routeResult.steps.length})</span>
                  {showSteps ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          )}

          {/* Interactive Map */}
          <AddressLocationMap
            latitude={location.latitude}
            longitude={location.longitude}
            label={location.title}
            originLat={originCoords?.lat}
            originLng={originCoords?.lng}
            originLabel={originCoords?.label}
            routeGeometry={routeResult?.geometry}
            heightClass="h-[380px] sm:h-[440px]"
          />

          {/* Step-by-Step Driving Directions */}
          {routeResult && showSteps && routeResult.steps.length > 0 && (
            <div className="border border-zinc-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-zinc-100 border-b border-zinc-200 font-bold text-zinc-800 flex items-center justify-between">
                <span>Passo a Passo do Trajeto</span>
                <span className="font-mono text-[11px] text-zinc-600">
                  {formatDistanceKm(routeResult.distanceMeters)} · {formatDurationPtBr(routeResult.durationSeconds)}
                </span>
              </div>
              <ol className="max-h-64 overflow-y-auto divide-y divide-zinc-100">
                {routeResult.steps.map((step, idx) => (
                  <li key={idx} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-zinc-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="text-zinc-800">{step.instruction}</span>
                    </div>
                    <span className="font-mono text-[11px] text-zinc-500 shrink-0 tabular-nums">
                      {formatDistanceKm(step.distanceMeters)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
