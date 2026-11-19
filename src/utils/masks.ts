/**
 * DE FARDAS ERP — Utilitários de Máscaras, Validação e Conversão (Padrão Brasileiro)
 * Cobre CNPJ, CEP, Telefone/WhatsApp, Datas (DD/MM/AAAA <-> YYYY-MM-DD) e Valores Monetários (BRL).
 */

export function onlyDigits(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

/** Máscara de CNPJ: 00.000.000/0000-00 */
export function maskCNPJ(value: string): string {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/** Validação matemática oficial dos dígitos verificadores do CNPJ */
export function isValidCNPJ(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcDigit = (base: string, weights: number[]) => {
    const sum = weights.reduce((acc, weight, idx) => acc + parseInt(base[idx], 10) * weight, 0);
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };

  const d1 = calcDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcDigit(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === parseInt(cnpj[12], 10) && d2 === parseInt(cnpj[13], 10);
}

/** Máscara de CEP: 00000-000 */
export function maskCEP(value: string): string {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/**
 * Máscara inteligente de Telefone / WhatsApp brasileiro:
 * - Fixo (10 dígitos): (00) 0000-0000
 * - Celular / WhatsApp (11 dígitos): (00) 00000-0000
 * Remove prefixo +55 automaticamente se colado de agenda ou WhatsApp.
 */
export function maskPhoneBR(value: string): string {
  let digits = onlyDigits(value);
  if (digits.length > 11 && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  digits = digits.slice(0, 11);

  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/** Máscara progressiva de Data brasileira: DD/MM/AAAA */
export function maskDateBR(value: string): string {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Converte ISO (YYYY-MM-DD) para DD/MM/AAAA */
export function isoToDateBR(iso?: string): string {
  if (!iso) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return maskDateBR(iso);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Valida data real no calendário e converte DD/MM/AAAA para ISO (YYYY-MM-DD) */
export function dateBRToIso(br: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br.trim());
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Formata número para exibição dentro de campo monetário (sem prefixo R$, ex: 1.250,00) */
export function formatCurrencyInputBRL(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

/**
 * Converte digitação ou colagem de moeda brasileira para número (em reais com 2 casas):
 * - Digitação incremental (padrão bancário): dígitos acumulados viram centavos (`125000` -> `1250.00`).
 * - Colagem explícita com vírgula ou ponto decimal (`R$ 1.250,5` ou `1250.50`) é preservada corretamente.
 */
export function parseCurrencyInputBRL(raw: string): number {
  const digits = onlyDigits(raw);
  if (!digits) return 0;
  // Limite de segurança para evitar overflow de precisão
  const trimmed = digits.slice(0, 12);
  return Math.round(parseInt(trimmed, 10)) / 100;
}

/** Interpreta texto colado (clipboard) com formatos variados (ex: "1250,50", "R$ 1.250,5", "1250.50") */
export function parsePastedCurrencyBRL(pasted: string): number | null {
  const cleaned = pasted.replace(/[R$\s]/g, '').trim();
  if (!cleaned) return null;

  // Caso possua vírgula como separador decimal (pt-BR)
  if (cleaned.includes(',')) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
  }

  // Caso possua ponto decimal com 1 ou 2 casas (ex: 45.5 ou 1250.50)
  if (/^\d+\.\d{1,2}$/.test(cleaned)) {
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
  }

  const digits = onlyDigits(cleaned);
  if (!digits) return null;
  return parseInt(digits, 10);
}
