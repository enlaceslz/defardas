import React, { useEffect, useRef, useState } from 'react';
import { Calendar, CheckCircle2, Loader2, Search, AlertCircle } from 'lucide-react';
import { api } from '../api/client';
import { GeoPrecision } from '../types/erp';
import {
  dateBRToIso,
  formatCurrencyInputBRL,
  isoToDateBR,
  isValidCNPJ,
  maskCEP,
  maskCNPJ,
  maskDateBR,
  maskPhoneBR,
  onlyDigits,
  parseCurrencyInputBRL,
  parsePastedCurrencyBRL,
} from '../utils/masks';

/* ============================================================================
 * 1. CurrencyInput — Máscara Monetária em Tempo Real (R$ 0.000,00)
 * ============================================================================ */
interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  required?: boolean;
  disabled?: boolean;
  compact?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onChange,
  min = 0,
  required,
  disabled,
  compact = false,
  placeholder = '0,00',
  className = '',
  ariaLabel,
}) => {
  const displayValue = formatCurrencyInputBRL(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = parseCurrencyInputBRL(e.target.value);
    onChange(Math.max(min, next));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    const parsed = parsePastedCurrencyBRL(text);
    if (parsed !== null) {
      e.preventDefault();
      onChange(Math.max(min, parsed));
    }
  };

  return (
    <div className={`relative flex items-center ${className}`}>
      <span
        className={`pointer-events-none absolute left-2.5 font-mono font-semibold text-slate-400 select-none ${
          compact ? 'text-[11px]' : 'text-xs'
        }`}
      >
        R$
      </span>
      <input
        type="text"
        inputMode="numeric"
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={displayValue}
        onChange={handleChange}
        onPaste={handlePaste}
        className={`w-full border border-slate-300 rounded-lg font-mono font-semibold text-right text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none ${
          compact ? 'pl-7 pr-2 py-1 text-xs rounded' : 'pl-8 pr-3 py-2 text-xs'
        } ${disabled ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white'}`}
      />
    </div>
  );
};

/* ============================================================================
 * 2. DateInputBR — Máscara de Data Brasileira (DD/MM/AAAA) + Seletor Calendário
 *    Converte transparentemente entre DD/MM/AAAA (UI) e YYYY-MM-DD (ISO/API).
 * ============================================================================ */
interface DateInputBRProps {
  value: string; // ISO YYYY-MM-DD
  onChange: (isoDate: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export const DateInputBR: React.FC<DateInputBRProps> = ({
  value,
  onChange,
  required,
  disabled,
  className = '',
  placeholder = 'DD/MM/AAAA',
}) => {
  const [displayText, setDisplayText] = useState<string>(() => isoToDateBR(value));
  const [invalidDate, setInvalidDate] = useState(false);
  const nativePickerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const formatted = isoToDateBR(value);
    setDisplayText(formatted);
    setInvalidDate(false);
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskDateBR(e.target.value);
    setDisplayText(masked);

    if (masked.length === 0) {
      setInvalidDate(false);
      onChange('');
      return;
    }

    if (masked.length === 10) {
      const iso = dateBRToIso(masked);
      if (iso) {
        setInvalidDate(false);
        onChange(iso);
      } else {
        setInvalidDate(true);
      }
    } else {
      setInvalidDate(false);
    }
  };

  const handleBlur = () => {
    if (displayText.length > 0 && displayText.length < 10) {
      setInvalidDate(true);
    }
  };

  const openCalendarPicker = () => {
    const picker = nativePickerRef.current;
    if (!picker || disabled) return;
    if (typeof picker.showPicker === 'function') {
      try {
        picker.showPicker();
        return;
      } catch {
        // fallback para focus/click
      }
    }
    picker.focus();
    picker.click();
  };

  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        inputMode="numeric"
        required={required}
        disabled={disabled}
        maxLength={10}
        placeholder={placeholder}
        value={displayText}
        onChange={handleTextChange}
        onBlur={handleBlur}
        className={`w-full pl-3 pr-9 py-2 border rounded-lg font-mono text-xs text-slate-900 focus:ring-2 focus:outline-none ${
          invalidDate
            ? 'border-rose-400 focus:ring-rose-500 bg-rose-50/40'
            : 'border-slate-300 focus:ring-blue-500 bg-white'
        } ${disabled ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={openCalendarPicker}
        title="Abrir calendário"
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer disabled:opacity-40"
      >
        <Calendar className="w-4 h-4" />
      </button>
      <input
        ref={nativePickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''}
        onChange={(e) => {
          if (e.target.value) {
            onChange(e.target.value);
          }
        }}
        className="sr-only"
      />
      {invalidDate && (
        <p className="text-[10px] text-rose-600 font-medium mt-0.5">
          Informe uma data válida no formato DD/MM/AAAA.
        </p>
      )}
    </div>
  );
};

/* ============================================================================
 * 3. PhoneInputBR — Máscara Automática de Telefone Fixo e WhatsApp Celular
 * ============================================================================ */
interface PhoneInputBRProps {
  value: string;
  onChange: (masked: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export const PhoneInputBR: React.FC<PhoneInputBRProps> = ({
  value,
  onChange,
  required,
  disabled,
  placeholder = '(98) 98800-0000',
  className = '',
}) => {
  return (
    <input
      type="tel"
      inputMode="tel"
      required={required}
      disabled={disabled}
      maxLength={15}
      placeholder={placeholder}
      value={maskPhoneBR(value)}
      onChange={(e) => onChange(maskPhoneBR(e.target.value))}
      className={`w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none ${
        disabled ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white'
      } ${className}`}
    />
  );
};

/* ============================================================================
 * 4. CnpjLookupInput — Máscara CNPJ + Validação + Busca Automática na Receita
 * ============================================================================ */
export interface CnpjAutoFillData {
  cnpj: string;
  companyName: string;
  tradeName: string;
  email: string;
  phone: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  addressLine: string;
  segment: string;
  foundedYear?: number;
  situation?: string;
  latitude?: number;
  longitude?: number;
  geoPrecision?: GeoPrecision;
  geoSource?: string;
  geoDisplayName?: string;
  source: string;
}

interface CnpjLookupInputProps {
  value: string;
  onChange: (maskedCnpj: string) => void;
  onCnpjFound: (data: CnpjAutoFillData) => void;
  required?: boolean;
  disabled?: boolean;
  autoLookup?: boolean;
}

export const CnpjLookupInput: React.FC<CnpjLookupInputProps> = ({
  value,
  onChange,
  onCnpjFound,
  required,
  disabled,
  autoLookup = true,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const lastFetchedDigitsRef = useRef<string>('');

  const digits = onlyDigits(value);
  const isComplete = digits.length === 14;
  const isValid = isComplete && isValidCNPJ(digits);

  const runLookup = async (targetDigits: string, force = false) => {
    if (targetDigits.length !== 14) return;
    if (!isValidCNPJ(targetDigits)) {
      setStatus({ type: 'error', text: 'Dígito verificador do CNPJ inválido.' });
      return;
    }
    if (!force && lastFetchedDigitsRef.current === targetDigits) return;

    lastFetchedDigitsRef.current = targetDigits;
    setIsLoading(true);
    setStatus(null);

    const res = await api.lookupCnpj(targetDigits);
    setIsLoading(false);

    if (res.status === 200 && res.data) {
      onCnpjFound(res.data);
      setStatus({
        type: 'success',
        text: `Dados preenchidos (${res.data.source}${res.data.situation ? ` · ${res.data.situation}` : ''})`,
      });
    } else {
      setStatus({
        type: 'error',
        text: res.error || 'Não foi possível consultar o CNPJ agora.',
      });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskCNPJ(e.target.value);
    const nextDigits = onlyDigits(masked);
    onChange(masked);

    if (nextDigits.length < 14) {
      setStatus(null);
      if (lastFetchedDigitsRef.current !== nextDigits) {
        lastFetchedDigitsRef.current = '';
      }
      return;
    }

    if (nextDigits.length === 14) {
      if (!isValidCNPJ(nextDigits)) {
        setStatus({ type: 'error', text: 'CNPJ com dígitos verificadores inválidos.' });
      } else if (autoLookup) {
        runLookup(nextDigits);
      }
    }
  };

  return (
    <div className="space-y-1">
      <div className="relative flex items-center gap-1.5">
        <div className="relative flex-1">
          <input
            type="text"
            inputMode="numeric"
            required={required}
            disabled={disabled}
            maxLength={18}
            placeholder="00.000.000/0000-00"
            value={maskCNPJ(value)}
            onChange={handleChange}
            className={`w-full pl-3 pr-8 py-2 border rounded-lg font-mono text-xs text-slate-900 focus:ring-2 focus:outline-none ${
              isComplete && !isValid
                ? 'border-rose-400 focus:ring-rose-500 bg-rose-50/30'
                : status?.type === 'success'
                  ? 'border-emerald-400 focus:ring-emerald-500 bg-emerald-50/20'
                  : 'border-slate-300 focus:ring-blue-500 bg-white'
            }`}
          />
          {isComplete && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
              ) : isValid ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
              )}
            </span>
          )}
        </div>

        <button
          type="button"
          disabled={disabled || isLoading || !isValid}
          onClick={() => runLookup(digits, true)}
          title="Consultar dados da empresa pelo CNPJ"
          className="inline-flex items-center gap-1 px-2.5 py-2 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 disabled:opacity-45 border border-slate-300 rounded-lg text-[11px] font-semibold text-slate-700 transition-colors cursor-pointer shrink-0"
        >
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">Buscar</span>
        </button>
      </div>

      {status && (
        <div
          className={`text-[10px] font-medium flex items-center gap-1 ${
            status.type === 'success' ? 'text-emerald-700' : 'text-rose-600'
          }`}
        >
          {status.type === 'success' ? (
            <CheckCircle2 className="w-3 h-3 shrink-0" />
          ) : (
            <AlertCircle className="w-3 h-3 shrink-0" />
          )}
          <span className="truncate">{status.text}</span>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 5. CepLookupInput — Máscara CEP + Busca Automática de Endereço (ViaCEP/BrasilAPI)
 * ============================================================================ */
export interface CepAutoFillData {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  source: string;
}

interface CepLookupInputProps {
  value: string;
  onChange: (maskedCep: string) => void;
  onCepFound: (data: CepAutoFillData) => void;
  required?: boolean;
  disabled?: boolean;
  autoLookup?: boolean;
}

export const CepLookupInput: React.FC<CepLookupInputProps> = ({
  value,
  onChange,
  onCepFound,
  required,
  disabled,
  autoLookup = true,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const lastFetchedCepRef = useRef<string>('');

  const digits = onlyDigits(value);
  const isComplete = digits.length === 8;

  const runLookup = async (targetDigits: string, force = false) => {
    if (targetDigits.length !== 8) return;
    if (!force && lastFetchedCepRef.current === targetDigits) return;

    lastFetchedCepRef.current = targetDigits;
    setIsLoading(true);
    setStatus(null);

    const res = await api.lookupCep(targetDigits);
    setIsLoading(false);

    if (res.status === 200 && res.data) {
      onCepFound(res.data);
      setStatus({
        type: 'success',
        text: `${res.data.city}/${res.data.state} (${res.data.source})`,
      });
    } else {
      setStatus({
        type: 'error',
        text: res.error || 'CEP não encontrado.',
      });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskCEP(e.target.value);
    const nextDigits = onlyDigits(masked);
    onChange(masked);

    if (nextDigits.length < 8) {
      setStatus(null);
      lastFetchedCepRef.current = '';
      return;
    }

    if (nextDigits.length === 8 && autoLookup) {
      runLookup(nextDigits);
    }
  };

  return (
    <div className="space-y-1">
      <div className="relative flex items-center gap-1.5">
        <input
          type="text"
          inputMode="numeric"
          required={required}
          disabled={disabled}
          maxLength={9}
          placeholder="00000-000"
          value={maskCEP(value)}
          onChange={handleChange}
          className={`w-full px-3 py-2 border rounded-lg font-mono text-xs text-slate-900 focus:ring-2 focus:outline-none ${
            status?.type === 'error'
              ? 'border-rose-400 focus:ring-rose-500'
              : status?.type === 'success'
                ? 'border-emerald-400 focus:ring-emerald-500 bg-emerald-50/20'
                : 'border-slate-300 focus:ring-blue-500 bg-white'
          }`}
        />

        <button
          type="button"
          disabled={disabled || isLoading || !isComplete}
          onClick={() => runLookup(digits, true)}
          title="Buscar endereço pelo CEP"
          className="inline-flex items-center justify-center px-2.5 py-2 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 disabled:opacity-45 border border-slate-300 rounded-lg text-[11px] font-semibold text-slate-700 transition-colors cursor-pointer shrink-0"
        >
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
        </button>
      </div>

      {status && (
        <div
          className={`text-[10px] font-medium flex items-center gap-1 ${
            status.type === 'success' ? 'text-emerald-700' : 'text-rose-600'
          }`}
        >
          {status.type === 'success' ? (
            <CheckCircle2 className="w-3 h-3 shrink-0" />
          ) : (
            <AlertCircle className="w-3 h-3 shrink-0" />
          )}
          <span className="truncate">{status.text}</span>
        </div>
      )}
    </div>
  );
};
