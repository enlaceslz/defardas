/**
 * DE FARDAS ERP — Address Composition, Legacy Parsing, Coordinates & WhatsApp Route Helpers
 */
import {
  CompanyProfile,
  GeoPrecision,
  LocationEntityType,
  LocationSharePayload,
  SharedLocationPublicPayload,
  StructuredAddressValue,
} from '../types/erp';
import { maskCEP } from './masks';
import { normalizeWhatsAppDigitsBR } from './reportBuilder';

export { normalizeWhatsAppDigitsBR };

export function isValidCoordinates(lat?: number | null, lng?: number | null): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) < 0.00001 && Math.abs(lng) < 0.00001) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function composeAddressLine(parts: {
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
}): string {
  const street = (parts.street || '').trim();
  const num = (parts.number || '').trim();
  const comp = (parts.complement || '').trim();
  const neigh = (parts.neighborhood || '').trim();

  if (!street && !neigh && !num) return '';

  let head = street;
  if (num) {
    head = head ? `${head}, ${num}` : num;
  }
  if (comp) {
    head = head ? `${head} (${comp})` : comp;
  }
  if (neigh) {
    head = head ? `${head} - ${neigh}` : neigh;
  }
  return head;
}

export function formatFullAddress(input: {
  address?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
}): string {
  const line =
    composeAddressLine({
      street: input.street,
      number: input.number,
      complement: input.complement,
      neighborhood: input.neighborhood,
    }) || (input.address || '').trim();

  const cityState = [input.city, input.state].filter(Boolean).join('/');
  const cepFmt = input.cep ? `CEP ${maskCEP(input.cep)}` : '';

  return [line, cityState, cepFmt].filter(Boolean).join(' · ');
}

/**
 * Extrai heurísticas de Logradouro, Número, Complemento e Bairro de endereços legados
 * como "Av. dos Holandeses, 450 - Calhau" ou "Av. Colares Moreira, 100 - Edifício Hyde Park, Sala 102".
 */
export function parseLegacyAddress(rawAddress?: string): {
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
} {
  const raw = (rawAddress || '').trim();
  if (!raw) {
    return { street: '', number: '', complement: '', neighborhood: '' };
  }

  let body = raw;
  let neighborhood = '';

  const lastDashIdx = raw.lastIndexOf(' - ');
  if (lastDashIdx > 0) {
    const afterDash = raw.slice(lastDashIdx + 3).trim();
    // Se não parece complemento explícito (Sala/Galpão/Bloco/Loja), trata como bairro
    if (
      afterDash &&
      !/^(sala|sl|loja|lj|bloco|bl|galp[aã]o|ap|apto|andar|edif[ií]cio|conjunto|conj|anexo)\b/i.test(
        afterDash
      )
    ) {
      neighborhood = afterDash;
      body = raw.slice(0, lastDashIdx).trim();
    }
  }

  // Extrair complemento entre parênteses se houver
  let complement = '';
  const parenMatch = body.match(/\(([^)]+)\)\s*$/);
  if (parenMatch) {
    complement = parenMatch[1].trim();
    body = body.slice(0, parenMatch.index).trim();
  }

  // Separar "Rua, Número..."
  const commaIdx = body.indexOf(',');
  if (commaIdx === -1) {
    return { street: body, number: '', complement, neighborhood };
  }

  const street = body.slice(0, commaIdx).trim();
  const afterComma = body.slice(commaIdx + 1).trim();

  // Tenta extrair número inicial ("450", "S/N", "100-A", etc.)
  const numMatch = afterComma.match(/^((?:s\/n|sn|\d+[a-zA-Z0-9\-\/]*))\b(?:[\s,\-]+(.+))?$/i);
  if (numMatch) {
    const number = numMatch[1].trim();
    const tail = (numMatch[2] || '').trim();
    if (tail && !complement) {
      complement = tail;
    }
    return { street, number, complement, neighborhood };
  }

  return {
    street,
    number: '',
    complement: complement || afterComma,
    neighborhood,
  };
}

export function buildStructuredAddressFromEntity(entity: {
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  address?: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  geoPrecision?: GeoPrecision;
  geoSource?: string;
}): StructuredAddressValue {
  const parsed = parseLegacyAddress(entity.address);
  const street = (entity.street || parsed.street || '').trim();
  const number = (entity.number || parsed.number || '').trim();
  const complement = (entity.complement || parsed.complement || '').trim();
  const neighborhood = (entity.neighborhood || parsed.neighborhood || '').trim();
  const city = (entity.city || 'São Luís').trim();
  const state = (entity.state || 'MA').trim().toUpperCase().slice(0, 2);
  const cep = entity.cep ? maskCEP(entity.cep) : '';
  const address =
    (entity.address || '').trim() ||
    composeAddressLine({ street, number, complement, neighborhood });

  return {
    cep,
    street,
    number,
    complement,
    neighborhood,
    city,
    state,
    address,
    latitude: isValidCoordinates(entity.latitude, entity.longitude) ? entity.latitude : undefined,
    longitude: isValidCoordinates(entity.latitude, entity.longitude) ? entity.longitude : undefined,
    geoPrecision: entity.geoPrecision,
    geoSource: entity.geoSource,
  };
}

/**
 * Aplica com segurança os dados de endereço retornados pela consulta de CNPJ:
 * - Substitui campos de endereço antigos (inclusive complemento e número) para evitar mistura de endereços.
 * - Atualiza as coordenadas GPS quando já geocodificadas pelo servidor ou limpa coordenadas antigas
 *   para disparar nova geocodificação automática sem manter pino defasado.
 */
export function applyCnpjAddressUpdate(
  prev: StructuredAddressValue,
  data: {
    cep?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    addressLine?: string;
    latitude?: number;
    longitude?: number;
    geoPrecision?: GeoPrecision;
    geoSource?: string;
  }
): StructuredAddressValue {
  const hasReturnedAddress = Boolean(
    (data.cep || '').trim() ||
      (data.street || '').trim() ||
      (data.neighborhood || '').trim() ||
      (data.city || '').trim()
  );

  if (!hasReturnedAddress) {
    return prev;
  }

  const cep = data.cep ? maskCEP(data.cep) : '';
  const street = (data.street || '').trim();
  const number = (data.number || '').trim();
  const complement = (data.complement || '').trim();
  const neighborhood = (data.neighborhood || '').trim();
  const city = (data.city || '').trim() || prev.city || 'São Luís';
  const state = (data.state || '').trim().toUpperCase().slice(0, 2) || prev.state || 'MA';
  const address =
    composeAddressLine({
      street,
      number,
      complement,
      neighborhood,
    }) ||
    (data.addressLine || '').trim();

  const hasValidCoords = isValidCoordinates(data.latitude, data.longitude);

  return {
    cep,
    street,
    number,
    complement,
    neighborhood,
    city,
    state,
    address,
    latitude: hasValidCoords ? data.latitude : undefined,
    longitude: hasValidCoords ? data.longitude : undefined,
    geoPrecision: hasValidCoords ? data.geoPrecision : undefined,
    geoSource: hasValidCoords ? data.geoSource : undefined,
  };
}

export function buildEntityLocationPayload(params: {
  entityType: LocationEntityType;
  entityId?: string;
  locationCode: string;
  title: string;
  subtitle?: string;
  contactName?: string;
  phone?: string;
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  address?: string;
  city?: string;
  state?: string;
  latitude: number;
  longitude: number;
  geoPrecision?: GeoPrecision;
  notes?: string;
  company: CompanyProfile;
}): LocationSharePayload {
  const parsed = parseLegacyAddress(params.address);
  const street = (params.street || parsed.street || '').trim();
  const number = (params.number || parsed.number || '').trim();
  const complement = (params.complement || parsed.complement || '').trim();
  const neighborhood = (params.neighborhood || parsed.neighborhood || '').trim();

  const safeTitleRaw = (params.title || '').trim();
  const safeTitle =
    safeTitleRaw.length >= 2
      ? safeTitleRaw
      : (params.locationCode || '').trim() || 'Localização DE FARDAS';
  const safeCity = (params.city || '').trim() || 'São Luís';
  const safeState = (params.state || 'MA').trim().toUpperCase().slice(0, 2) || 'MA';
  const resolvedFullLine =
    formatFullAddress({
      address: params.address,
      street,
      number,
      complement,
      neighborhood,
      city: safeCity,
      state: safeState,
      cep: params.cep,
    }) || `${safeCity}/${safeState}`;

  return {
    locationCode: params.locationCode,
    entityType: params.entityType,
    entityId: params.entityId,
    title: safeTitle,
    subtitle: params.subtitle,
    contactName: params.contactName,
    phone: params.phone,
    cep: params.cep,
    street: street || undefined,
    number: number || undefined,
    complement: complement || undefined,
    neighborhood: neighborhood || undefined,
    city: safeCity,
    state: safeState,
    fullAddressLine: resolvedFullLine,
    latitude: params.latitude,
    longitude: params.longitude,
    geoPrecision: params.geoPrecision,
    notes: params.notes,
    company: {
      tradeName: params.company.tradeName,
      name: params.company.name,
      phone: params.company.phone,
      whatsapp: params.company.whatsapp,
      email: params.company.email,
      city: params.company.city,
      state: params.company.state,
      logoUrl: params.company.logoUrl,
    },
  };
}

export function buildCompanyLocationPayload(profile: CompanyProfile): LocationSharePayload {
  const parsed = parseLegacyAddress(profile.address);
  const number = (profile.addressNumber || parsed.number || '').trim();
  const complement = (profile.complement || parsed.complement || '').trim();
  const street = (profile.street || parsed.street || profile.address || '').trim();
  const neighborhood = (profile.neighborhood || parsed.neighborhood || '').trim();

  return {
    locationCode: 'MATRIZ-DEFARDAS',
    entityType: 'company',
    entityId: 'company-hq',
    title: profile.tradeName || 'DE FARDAS Uniformes Profissionais',
    subtitle: 'Fábrica / Matriz DE FARDAS',
    contactName: profile.tradeName,
    phone: profile.whatsapp || profile.phone,
    cep: profile.cep,
    street,
    number,
    complement: complement || undefined,
    neighborhood: neighborhood || undefined,
    city: profile.city || 'São Luís',
    state: profile.state || 'MA',
    fullAddressLine: formatFullAddress({
      address: profile.address,
      street,
      number,
      complement,
      neighborhood,
      city: profile.city,
      state: profile.state,
      cep: profile.cep,
    }),
    latitude: profile.latitude ?? -2.50152,
    longitude: profile.longitude ?? -44.28965,
    geoPrecision: profile.geoPrecision || 'numero',
    notes: profile.openingHours ? `Horário: ${profile.openingHours}` : undefined,
    company: {
      tradeName: profile.tradeName,
      name: profile.name,
      phone: profile.phone,
      whatsapp: profile.whatsapp,
      email: profile.email,
      city: profile.city,
      state: profile.state,
      logoUrl: profile.logoUrl,
    },
  };
}

export function getPrecisionLabel(precision?: GeoPrecision): {
  label: string;
  toneClass: string;
} {
  switch (precision) {
    case 'numero':
      return {
        label: 'Precisão: Número Exato',
        toneClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case 'manual':
      return {
        label: 'Pino Ajustado Manualmente',
        toneClass: 'bg-sky-50 text-sky-700 border-sky-200',
      };
    case 'logradouro':
      return {
        label: 'Precisão: Logradouro / Rua',
        toneClass: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'cep':
      return {
        label: 'Precisão: Centro do CEP',
        toneClass: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'cidade':
      return {
        label: 'Precisão: Município (Ajuste o pino)',
        toneClass: 'bg-rose-50 text-rose-700 border-rose-200',
      };
    default:
      return {
        label: 'Coordenadas Registradas',
        toneClass: 'bg-zinc-100 text-zinc-700 border-zinc-200',
      };
  }
}

export function buildLocationWhatsAppMessage(
  loc: LocationSharePayload,
  shareUrl: string,
  expiresAt?: string
): string {
  const lines: string[] = [
    `📍 *LOCALIZAÇÃO & ROTA — ${loc.title}*`,
    loc.subtitle ? `_${loc.subtitle}_` : '',
    '',
    `🏠 *Endereço:* ${loc.fullAddressLine}`,
    loc.cep ? `📮 *CEP:* ${maskCEP(loc.cep)}` : '',
    `🧭 *Coordenadas GPS:* ${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`,
    loc.contactName ? `👤 *Contato:* ${loc.contactName}${loc.phone ? ` (${loc.phone})` : ''}` : '',
    loc.notes ? `📝 *Referência:* ${loc.notes}` : '',
    '',
    `🗺️ *Clique no link abaixo para abrir o mapa e traçar a rota automática até este endereço:*`,
    shareUrl,
    expiresAt ? `_Link válido até ${new Date(expiresAt).toLocaleDateString('pt-BR')}._` : '',
  ];

  return lines.filter((l, idx, arr) => l !== '' || (idx > 0 && arr[idx - 1] !== '')).join('\n').trim();
}

export function buildOsmDirectionsUrl(toLat: number, toLng: number, fromLat?: number, fromLng?: number): string {
  if (isValidCoordinates(fromLat, fromLng)) {
    return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${fromLat!.toFixed(6)},${fromLng!.toFixed(6)};${toLat.toFixed(6)},${toLng.toFixed(6)}`;
  }
  return `https://www.openstreetmap.org/?mlat=${toLat.toFixed(6)}&mlon=${toLng.toFixed(6)}#map=17/${toLat.toFixed(6)}/${toLng.toFixed(6)}`;
}

export function buildWazeUrl(toLat: number, toLng: number): string {
  return `https://waze.com/ul?ll=${toLat.toFixed(6)},${toLng.toFixed(6)}&navigate=yes`;
}

export function buildGeoUri(toLat: number, toLng: number, label?: string): string {
  const safeLabel = encodeURIComponent((label || 'Destino').slice(0, 80));
  return `geo:${toLat.toFixed(6)},${toLng.toFixed(6)}?q=${toLat.toFixed(6)},${toLng.toFixed(6)}(${safeLabel})`;
}

export function formatDistanceKm(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '0 m';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

export function formatDurationPtBr(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '1 min';
  const totalMin = Math.max(1, Math.round(seconds / 60));
  if (totalMin < 60) return `${totalMin} min`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

/**
 * Copia texto para a área de transferência com fallback para iframes restritos
 * (onde navigator.clipboard.writeText pode lançar NotAllowedError).
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Prossegue para fallback com textarea selecionável
    }
  }

  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

/**
 * Gera URL confiável do WhatsApp Web/App (api.whatsapp.com/send funciona inclusive sem número definido).
 */
export function buildWhatsAppSendUrl(message: string, phone?: string): string {
  const digits = normalizeWhatsAppDigitsBR(phone || '');
  const encoded = encodeURIComponent(message);
  if (digits.length >= 10) {
    return `https://api.whatsapp.com/send?phone=${digits}&text=${encoded}`;
  }
  return `https://api.whatsapp.com/send?text=${encoded}`;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(b64u: string): Uint8Array {
  const normalized = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const ALLOWED_ENTITY_SET = new Set<LocationEntityType>(['client', 'partner', 'supplier', 'company']);
const ALLOWED_PRECISION_SET = new Set<GeoPrecision>(['numero', 'logradouro', 'cep', 'cidade', 'manual']);

export function encodeLocationShareFallback(
  loc: LocationSharePayload,
  expiresAt: string
): string {
  try {
    if (!isValidCoordinates(loc.latitude, loc.longitude)) return '';
    const compact = {
      v: 1,
      lc: (loc.locationCode || '').slice(0, 60),
      et: loc.entityType,
      t: (loc.title || '').slice(0, 140),
      st: loc.subtitle ? loc.subtitle.slice(0, 120) : undefined,
      cn: loc.contactName ? loc.contactName.slice(0, 100) : undefined,
      ph: loc.phone ? loc.phone.slice(0, 32) : undefined,
      cep: loc.cep ? loc.cep.slice(0, 12) : undefined,
      s: loc.street ? loc.street.slice(0, 140) : undefined,
      n: loc.number ? loc.number.slice(0, 24) : undefined,
      cp: loc.complement ? loc.complement.slice(0, 80) : undefined,
      nb: loc.neighborhood ? loc.neighborhood.slice(0, 100) : undefined,
      c: (loc.city || 'São Luís').slice(0, 60),
      uf: (loc.state || 'MA').slice(0, 2).toUpperCase(),
      fa: (loc.fullAddressLine || '').slice(0, 260),
      lat: Math.round(loc.latitude * 1_000_000) / 1_000_000,
      lng: Math.round(loc.longitude * 1_000_000) / 1_000_000,
      gp: loc.geoPrecision,
      nt: loc.notes ? loc.notes.slice(0, 200) : undefined,
      co: {
        tn: (loc.company?.tradeName || 'DE FARDAS').slice(0, 80),
        ph: (loc.company?.phone || '').slice(0, 32),
        wa: loc.company?.whatsapp ? loc.company.whatsapp.slice(0, 32) : undefined,
      },
      exp: expiresAt,
    };
    const json = JSON.stringify(compact);
    const bytes = new TextEncoder().encode(json);
    return bytesToBase64Url(bytes);
  } catch {
    return '';
  }
}

export function decodeLocationShareFallback(
  raw?: string | null
): SharedLocationPublicPayload | null {
  try {
    if (!raw || typeof raw !== 'string' || raw.length > 4096) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(raw)) return null;
    const bytes = base64UrlToBytes(raw);
    const json = new TextDecoder().decode(bytes);
    const data = JSON.parse(json);
    if (!data || data.v !== 1) return null;

    const lat = Number(data.lat);
    const lng = Number(data.lng);
    if (!isValidCoordinates(lat, lng)) return null;

    const expMs = new Date(String(data.exp || '')).getTime();
    if (!Number.isFinite(expMs) || expMs < Date.now()) return null;

    const entityType = String(data.et || 'client') as LocationEntityType;
    if (!ALLOWED_ENTITY_SET.has(entityType)) return null;

    const title = typeof data.t === 'string' ? data.t.trim().slice(0, 140) : '';
    const fullAddressLine = typeof data.fa === 'string' ? data.fa.trim().slice(0, 260) : '';
    if (!title || !fullAddressLine) return null;

    const gp = typeof data.gp === 'string' && ALLOWED_PRECISION_SET.has(data.gp as GeoPrecision)
      ? (data.gp as GeoPrecision)
      : undefined;

    const location: LocationSharePayload = {
      locationCode: typeof data.lc === 'string' && data.lc ? data.lc.slice(0, 60) : 'MAPA',
      entityType,
      title,
      subtitle: typeof data.st === 'string' ? data.st.slice(0, 120) : undefined,
      contactName: typeof data.cn === 'string' ? data.cn.slice(0, 100) : undefined,
      phone: typeof data.ph === 'string' ? data.ph.slice(0, 32) : undefined,
      cep: typeof data.cep === 'string' ? data.cep.slice(0, 12) : undefined,
      street: typeof data.s === 'string' ? data.s.slice(0, 140) : undefined,
      number: typeof data.n === 'string' ? data.n.slice(0, 24) : undefined,
      complement: typeof data.cp === 'string' ? data.cp.slice(0, 80) : undefined,
      neighborhood: typeof data.nb === 'string' ? data.nb.slice(0, 100) : undefined,
      city: typeof data.c === 'string' && data.c ? data.c.slice(0, 60) : 'São Luís',
      state: typeof data.uf === 'string' && data.uf ? data.uf.slice(0, 2).toUpperCase() : 'MA',
      fullAddressLine,
      latitude: lat,
      longitude: lng,
      geoPrecision: gp,
      notes: typeof data.nt === 'string' ? data.nt.slice(0, 200) : undefined,
      company: {
        tradeName: typeof data.co?.tn === 'string' && data.co.tn ? data.co.tn.slice(0, 80) : 'DE FARDAS',
        name: typeof data.co?.tn === 'string' && data.co.tn ? data.co.tn.slice(0, 80) : 'DE FARDAS',
        phone: typeof data.co?.ph === 'string' ? data.co.ph.slice(0, 32) : '',
        whatsapp: typeof data.co?.wa === 'string' ? data.co.wa.slice(0, 32) : undefined,
        email: '',
        city: typeof data.c === 'string' && data.c ? data.c.slice(0, 60) : 'São Luís',
        state: typeof data.uf === 'string' && data.uf ? data.uf.slice(0, 2).toUpperCase() : 'MA',
      },
    };

    return {
      locationCode: location.locationCode,
      entityType,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(expMs).toISOString(),
      createdByName: location.company.tradeName,
      accessCount: 1,
      location,
    };
  } catch {
    return null;
  }
}
