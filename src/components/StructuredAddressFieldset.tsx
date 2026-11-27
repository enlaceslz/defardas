import React, { useEffect, useRef, useState } from 'react';
import {
  MapPin,
  Loader2,
  LocateFixed,
  Share2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { StructuredAddressValue } from '../types/erp';
import { CepLookupInput, CepAutoFillData } from './FormInputs';
import { AddressLocationMap } from './AddressLocationMap';
import { api } from '../api/client';
import {
  composeAddressLine,
  formatCoordinates,
  getPrecisionLabel,
  isValidCoordinates,
} from '../utils/addressUtils';

interface StructuredAddressFieldsetProps {
  value: StructuredAddressValue;
  onChange: (next: StructuredAddressValue) => void;
  title?: string;
  entityLabel?: string;
  externalSyncKey?: number;
  onShareLocationClick?: (resolved?: StructuredAddressValue) => void;
  mapHeightClass?: string;
  disabled?: boolean;
}

export const StructuredAddressFieldset: React.FC<StructuredAddressFieldsetProps> = ({
  value,
  onChange,
  title = 'Endereço Estruturado & Localização no Mapa (CEP + Número)',
  entityLabel = 'Endereço Cadastrado',
  externalSyncKey = 0,
  onShareLocationClick,
  mapHeightClass = 'h-52',
  disabled = false,
}) => {
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geoFeedback, setGeoFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  const latestValueRef = useRef(value);
  latestValueRef.current = value;
  const geocodeSeqRef = useRef(0);
  const lastExternalSyncRef = useRef(0);

  const runGeocode = async (
    target: StructuredAddressValue,
    fallbackCoords?: { latitude: number; longitude: number }
  ): Promise<StructuredAddressValue | null> => {
    const hasCriteria = Boolean(
      target.cep.replace(/\D/g, '').length === 8 ||
        target.street.trim() ||
        target.address.trim() ||
        target.city.trim()
    );
    if (!hasCriteria) return null;

    const seq = ++geocodeSeqRef.current;
    setIsGeocoding(true);
    setGeoFeedback(null);

    const res = await api.geocodeAddress({
      cep: target.cep,
      street: target.street || target.address,
      number: target.number,
      neighborhood: target.neighborhood,
      city: target.city,
      state: target.state,
    });

    if (seq !== geocodeSeqRef.current) return null;
    setIsGeocoding(false);

    if (res.status === 200 && res.data && isValidCoordinates(res.data.latitude, res.data.longitude)) {
      const latest = latestValueRef.current;
      const updated: StructuredAddressValue = {
        ...latest,
        latitude: res.data.latitude,
        longitude: res.data.longitude,
        geoPrecision: res.data.precision,
        geoSource: res.data.source,
      };
      onChange(updated);
      setGeoFeedback({
        type:
          res.data.precision === 'numero' ||
          (res.data.precision === 'logradouro' && Boolean(res.data.source?.includes('CEP')))
            ? 'success'
            : 'warning',
        text:
          res.data.precision === 'numero'
            ? `Pino posicionado com precisão no nº ${target.number || 'informado'} (${res.data.source}).`
            : res.data.precision === 'logradouro' && res.data.source?.includes('CEP')
              ? `Pino posicionado no trecho exato do CEP ${target.cep || ''} em ${target.street || 'logradouro'} (${res.data.source}). Arraste o pino se desejar ajuste fino.`
              : `Localizado por ${res.data.precision === 'logradouro' ? 'logradouro' : res.data.precision === 'cep' ? 'CEP' : 'município'}. Arraste o pino se desejar ajuste fino.`,
      });
      return updated;
    }

    if (fallbackCoords && isValidCoordinates(fallbackCoords.latitude, fallbackCoords.longitude)) {
      const latest = latestValueRef.current;
      const updated: StructuredAddressValue = {
        ...latest,
        latitude: fallbackCoords.latitude,
        longitude: fallbackCoords.longitude,
        geoPrecision: 'cep',
        geoSource: 'BrasilAPI v2 (CEP)',
      };
      onChange(updated);
      setGeoFeedback({
        type: 'warning',
        text: 'Posicionado pelo centro do CEP (BrasilAPI). Arraste o pino para ajustar o número exato.',
      });
      return updated;
    }

    setGeoFeedback({
      type: 'error',
      text:
        res.error ||
        'Endereço não encontrado automaticamente no mapa. Clique no mapa para marcar manualmente.',
    });
    return null;
  };

  // Quando o CNPJ preencher o endereço externamente, sincroniza o pino no mapa automaticamente
  useEffect(() => {
    if (externalSyncKey > 0 && externalSyncKey !== lastExternalSyncRef.current) {
      lastExternalSyncRef.current = externalSyncKey;
      const latest = latestValueRef.current;
      if (isValidCoordinates(latest.latitude, latest.longitude)) {
        const isHighConfidence =
          latest.geoPrecision === 'numero' ||
          (latest.geoPrecision === 'logradouro' && Boolean(latest.geoSource?.includes('CEP')));
        setGeoFeedback({
          type: isHighConfidence ? 'success' : 'warning',
          text:
            latest.geoPrecision === 'numero'
              ? `Endereço do CNPJ localizado no nº ${latest.number || 'informado'} (${latest.geoSource || 'OpenStreetMap'}).`
              : latest.geoPrecision === 'logradouro' && latest.geoSource?.includes('CEP')
                ? `Endereço do CNPJ posicionado no trecho exato do CEP ${latest.cep || ''} em ${latest.street || 'logradouro'} (${latest.geoSource}).`
                : `Endereço do CNPJ posicionado no mapa (${latest.geoSource || 'OpenStreetMap'}). Arraste o pino se desejar ajuste fino.`,
        });
      } else {
        runGeocode(latest);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSyncKey]);

  const updateFields = (patch: Partial<StructuredAddressValue>) => {
    const merged: StructuredAddressValue = {
      ...value,
      ...patch,
    };
    merged.address = composeAddressLine({
      street: merged.street,
      number: merged.number,
      complement: merged.complement,
      neighborhood: merged.neighborhood,
    }) || merged.address;
    onChange(merged);
    return merged;
  };

  const handleCepFound = async (data: CepAutoFillData) => {
    const next = updateFields({
      cep: data.cep || value.cep,
      street: data.street || value.street,
      neighborhood: data.neighborhood || value.neighborhood,
      city: data.city || value.city,
      state: data.state || value.state,
    });
    await runGeocode(next, data.coordinates);
  };

  const handleManualPinChange = (lat: number, lng: number) => {
    onChange({
      ...value,
      latitude: lat,
      longitude: lng,
      geoPrecision: 'manual',
      geoSource: 'Ajuste manual no mapa',
    });
    setGeoFeedback({
      type: 'success',
      text: `Posição exata ajustada manualmente (${formatCoordinates(lat, lng)}).`,
    });
  };

  const hasCoords = isValidCoordinates(value.latitude, value.longitude);
  const canAutoLocate = Boolean(
    value.cep.replace(/\D/g, '').length === 8 ||
      value.street.trim() ||
      value.address.trim() ||
      value.city.trim()
  );
  const precisionBadge = getPrecisionLabel(value.geoPrecision);

  const handleShareClick = async () => {
    if (!onShareLocationClick) return;
    if (hasCoords) {
      onShareLocationClick(value);
      return;
    }
    if (!canAutoLocate) return;
    const resolved = await runGeocode(value);
    if (resolved && isValidCoordinates(resolved.latitude, resolved.longitude)) {
      onShareLocationClick(resolved);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[#C8102E] shrink-0" />
          <span className="text-xs font-bold text-slate-800">{title}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {hasCoords && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${precisionBadge.toneClass}`}
            >
              {precisionBadge.label}
            </span>
          )}
          <button
            type="button"
            disabled={disabled || isGeocoding}
            onClick={() => runGeocode(value)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-[11px] font-semibold text-slate-700 cursor-pointer disabled:opacity-50"
          >
            {isGeocoding ? (
              <Loader2 className="w-3 h-3 animate-spin text-[#C8102E]" />
            ) : (
              <LocateFixed className="w-3 h-3 text-[#C8102E]" />
            )}
            <span>{isGeocoding ? 'Localizando...' : 'Localizar (CEP + Nº)'}</span>
          </button>
          {onShareLocationClick && (
            <button
              type="button"
              disabled={disabled || isGeocoding || (!hasCoords && !canAutoLocate)}
              onClick={handleShareClick}
              title={
                hasCoords || canAutoLocate
                  ? 'Compartilhar endereço e rota via WhatsApp'
                  : 'Informe CEP, logradouro ou clique no mapa antes de compartilhar'
              }
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-lg text-[11px] font-semibold cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Share2 className="w-3 h-3" />
              <span>Enviar Mapa</span>
            </button>
          )}
        </div>
      </div>

      {geoFeedback && (
        <div
          className={`px-3 py-2 rounded-lg border text-[11px] flex items-center gap-2 ${
            geoFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : geoFeedback.type === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {geoFeedback.type === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{geoFeedback.text}</span>
        </div>
      )}

      {/* Linha 1: CEP, Número, Complemento */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-4">
          <label className="block text-[11px] font-medium text-slate-700 mb-1">
            CEP (busca automática)
          </label>
          <CepLookupInput
            value={value.cep}
            disabled={disabled}
            onChange={(masked) => updateFields({ cep: masked })}
            onCepFound={handleCepFound}
          />
        </div>

        <div className="sm:col-span-3">
          <label className="block text-[11px] font-medium text-slate-700 mb-1">
            Número
          </label>
          <input
            type="text"
            disabled={disabled}
            value={value.number}
            onChange={(e) => updateFields({ number: e.target.value })}
            onBlur={() => {
              if (value.number.trim() && (value.street.trim() || value.cep.replace(/\D/g, '').length === 8)) {
                runGeocode(value);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                runGeocode(value);
              }
            }}
            placeholder="Ex: 450 ou S/N"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-5">
          <label className="block text-[11px] font-medium text-slate-700 mb-1">
            Complemento / Galpão / Sala
          </label>
          <input
            type="text"
            disabled={disabled}
            value={value.complement}
            onChange={(e) => updateFields({ complement: e.target.value })}
            placeholder="Ex: Sala 102, Galpão B, Bloco 2"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Linha 2: Logradouro e Bairro */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-7">
          <label className="block text-[11px] font-medium text-slate-700 mb-1">
            Logradouro / Avenida / Rua
          </label>
          <input
            type="text"
            disabled={disabled}
            value={value.street}
            onChange={(e) => updateFields({ street: e.target.value })}
            placeholder="Ex: Av. dos Holandeses"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-5">
          <label className="block text-[11px] font-medium text-slate-700 mb-1">
            Bairro
          </label>
          <input
            type="text"
            disabled={disabled}
            value={value.neighborhood}
            onChange={(e) => updateFields({ neighborhood: e.target.value })}
            placeholder="Ex: Calhau, Renascença, Centro"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Linha 3: Cidade, UF e Coordenadas */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-5">
          <label className="block text-[11px] font-medium text-slate-700 mb-1">
            Cidade
          </label>
          <input
            type="text"
            disabled={disabled}
            value={value.city}
            onChange={(e) => updateFields({ city: e.target.value })}
            placeholder="São Luís"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-[11px] font-medium text-slate-700 mb-1">
            UF
          </label>
          <input
            type="text"
            maxLength={2}
            disabled={disabled}
            value={value.state}
            onChange={(e) => updateFields({ state: e.target.value.toUpperCase() })}
            placeholder="MA"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white uppercase font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-5">
          <label className="block text-[11px] font-medium text-slate-700 mb-1">
            Coordenadas GPS (Lat, Lng)
          </label>
          <div className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-[11px] font-mono tabular-nums text-slate-700 flex items-center justify-between gap-2">
            <span className="truncate">
              {hasCoords ? formatCoordinates(value.latitude!, value.longitude!) : 'Aguardando localização...'}
            </span>
            {hasCoords && value.geoSource && (
              <span className="text-[10px] font-sans text-slate-400 truncate max-w-[110px]" title={value.geoSource}>
                {value.geoSource}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Mapa Interativo */}
      <AddressLocationMap
        latitude={value.latitude}
        longitude={value.longitude}
        label={composeAddressLine(value) || entityLabel}
        editable={!disabled}
        onCoordinatesChange={handleManualPinChange}
        heightClass={mapHeightClass}
      />
    </div>
  );
};
