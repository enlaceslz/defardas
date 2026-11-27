import { Router, Response } from 'express';
import { RequestWithUser, requireAuth } from '../auth/rbac';
import { GeoPrecision, isValidLatLng } from '../services/addressMetadataService';

export const lookupRouter = Router();

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
const cepCache = new Map<string, CacheEntry<CepLookupResult>>();
const cnpjCache = new Map<string, CacheEntry<CnpjLookupResult>>();
const geocodeCache = new Map<string, CacheEntry<GeocodeResult>>();

export interface CepLookupResult {
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

export interface CnpjLookupResult {
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

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  precision: GeoPrecision;
  displayName: string;
  cep?: string;
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  source: string;
}

const BRAZIL_STATE_NAMES: Record<string, string> = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins',
};

const LOWERCASE_PT_WORDS = new Set([
  'a',
  'as',
  'o',
  'os',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'na',
  'nas',
  'no',
  'nos',
  'com',
  'para',
  'por',
]);

const UPPERCASE_PRESERVE_WORDS = new Set([
  'S/N',
  'SN',
  'BR',
  'MA',
  'KM',
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
]);

function onlyDigits(val: string): string {
  return String(val || '').replace(/\D/g, '');
}

function stripAccents(val: string): string {
  return String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeCompare(val: string): string {
  return stripAccents(val)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collapseSpaces(val: string): string {
  return String(val || '').replace(/\s+/g, ' ').trim();
}

function formatBrazilianTitleCase(raw: string): string {
  const cleaned = collapseSpaces(raw).replace(/\s*;\s*/g, '; ');
  if (!cleaned) return '';

  // Se o texto já possui mistura natural de maiúsculas e minúsculas, preserva acentuação e caixa
  const hasLower = /[a-záàâãéèêíïóôõöúç]/.test(cleaned);
  const hasUpper = /[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇ]/.test(cleaned);
  if (hasLower && hasUpper) {
    return cleaned;
  }

  return cleaned
    .split(' ')
    .map((token, idx) => {
      const upper = token.toUpperCase();
      const bareUpper = upper.replace(/[;,.:()]+$/g, '');
      if (UPPERCASE_PRESERVE_WORDS.has(bareUpper)) {
        return upper;
      }
      const lower = token.toLowerCase();
      if (idx > 0 && LOWERCASE_PT_WORDS.has(lower)) {
        return lower;
      }
      // Capitaliza partes separadas por hífen ou barra
      return lower.replace(/(^|[-\/;(])([a-záàâãéèêíïóôõöúç])/g, (_, sep, ch) => `${sep}${ch.toUpperCase()}`);
    })
    .join(' ');
}

function combineStreetTypeAndName(streetType: string, streetName: string): string {
  const typeClean = collapseSpaces(streetType);
  const nameClean = collapseSpaces(streetName);
  if (!nameClean) return '';
  if (!typeClean) return nameClean;

  const normType = normalizeCompare(typeClean);
  const normName = normalizeCompare(nameClean);
  if (
    normName === normType ||
    normName.startsWith(`${normType} `) ||
    (normType === 'avenida' && /^av\.?\s/i.test(nameClean)) ||
    (normType === 'rua' && /^r\.?\s/i.test(nameClean))
  ) {
    return nameClean;
  }
  return `${typeClean} ${nameClean}`.trim();
}

function expandBrazilianStreetAbbreviations(street: string): string {
  const cleaned = collapseSpaces(street);
  if (!cleaned) return '';

  const rules: Array<[RegExp, string]> = [
    [/\bav\.?(?=\s)/gi, 'Avenida'],
    [/\bcel\.?(?=\s)/gi, 'Coronel'],
    [/^r\.?(?=\s)/i, 'Rua'],
    [/\bdr\.?(?=\s)/gi, 'Doutor'],
    [/\bdra\.?(?=\s)/gi, 'Doutora'],
    [/\bprof\.?(?=\s)/gi, 'Professor'],
    [/\bpres\.?(?=\s)/gi, 'Presidente'],
    [/\bgov\.?(?=\s)/gi, 'Governador'],
    [/\bdep\.?(?=\s)/gi, 'Deputado'],
    [/\bsen\.?(?=\s)/gi, 'Senador'],
    [/\bgen\.?(?=\s)/gi, 'General'],
    [/\bmal\.?(?=\s)/gi, 'Marechal'],
    [/\bmaj\.?(?=\s)/gi, 'Major'],
    [/\bcap\.?(?=\s)/gi, 'Capitão'],
    [/\brod\.?(?=\s)/gi, 'Rodovia'],
    [/\best\.?(?=\s)/gi, 'Estrada'],
    [/\btrav\.?(?=\s)/gi, 'Travessa'],
    [/\btv\.?(?=\s)/gi, 'Travessa'],
    [/\bal\.?(?=\s)/gi, 'Alameda'],
    [/\bp[çc]a?\.?(?=\s)/gi, 'Praça'],
    [/\bjd\.?(?=\s)/gi, 'Jardim'],
    [/\bpq\.?(?=\s)/gi, 'Parque'],
    [/\bconj\.?(?=\s)/gi, 'Conjunto'],
  ];

  let expanded = cleaned;
  for (const [pattern, replacement] of rules) {
    expanded = expanded.replace(pattern, replacement);
  }
  return collapseSpaces(expanded);
}

function formatCep(digits: string): string {
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function formatCnpj(digits: string): string {
  if (digits.length !== 14) return digits;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatPhone(raw: string): string {
  let digits = onlyDigits(raw);
  if (digits.length > 11 && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  digits = digits.slice(0, 11);
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return raw.trim();
}

function isValidCnpjDigits(cnpj: string): boolean {
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcDigit = (base: string, weights: number[]) => {
    const sum = weights.reduce((acc, w, idx) => acc + parseInt(base[idx], 10) * w, 0);
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };

  const d1 = calcDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcDigit(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === parseInt(cnpj[12], 10) && d2 === parseInt(cnpj[13], 10);
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number = 6500): Promise<{ ok: boolean; status: number; data: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DE-FARDAS-ERP/1.6.2 (contato@defardas.com.br)',
      },
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function buildAddressLine(street: string, number: string, complement: string, neighborhood?: string): string {
  const streetClean = collapseSpaces(street);
  const numClean = collapseSpaces(number);
  const compClean = collapseSpaces(complement);
  const neighClean = collapseSpaces(neighborhood || '');

  if (!streetClean && !numClean && !neighClean) return '';

  let head = streetClean;
  if (numClean) {
    head = head ? `${head}, ${numClean}` : numClean;
  }
  if (compClean) {
    head = head ? `${head} (${compClean})` : compClean;
  }
  if (neighClean) {
    head = head ? `${head} - ${neighClean}` : neighClean;
  }
  return head;
}

function inferSegmentFromCnae(cnaeDescription: string): string {
  const desc = (cnaeDescription || '').toLowerCase();
  if (!desc) return 'Corporativo';
  if (desc.includes('hospital') || desc.includes('médic') || desc.includes('saúde') || desc.includes('clínic') || desc.includes('odonto')) {
    return 'Saúde & Hospitalar';
  }
  if (desc.includes('educação') || desc.includes('ensino') || desc.includes('escola') || desc.includes('faculdade')) {
    return 'Educação & Escolar';
  }
  if (desc.includes('construção') || desc.includes('engenharia') || desc.includes('obra')) {
    return 'Construção Civil';
  }
  if (desc.includes('transporte') || desc.includes('logíst') || desc.includes('portuár') || desc.includes('carga') || desc.includes('armazen')) {
    return 'Logística & Portuário';
  }
  if (desc.includes('restaurante') || desc.includes('aliment') || desc.includes('hotel') || desc.includes('padaria')) {
    return 'Alimentação & Hotelaria';
  }
  if (desc.includes('indústria') || desc.includes('fabricação') || desc.includes('metalúrg') || desc.includes('confecção') || desc.includes('mineração')) {
    return 'Indústria';
  }
  if (desc.includes('comércio') || desc.includes('supermercado') || desc.includes('varej') || desc.includes('atacad')) {
    return 'Comércio & Varejo';
  }
  if (desc.includes('segurança') || desc.includes('vigilância')) {
    return 'Segurança & Serviços';
  }
  return cnaeDescription.length > 40 ? `${cnaeDescription.slice(0, 37)}...` : cnaeDescription;
}

export async function lookupCepByDigits(digits: string): Promise<{
  ok: true;
  data: CepLookupResult;
} | {
  ok: false;
  status: number;
  code: string;
  error: string;
}> {
  if (digits.length !== 8) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_CEP',
      error: 'CEP inválido. Informe exatamente 8 dígitos numéricos.',
    };
  }

  const cached = cepCache.get(digits);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, data: cached.data };
  }

  // Tentativa 1: ViaCEP (Base oficial dos Correios/DNE — acentuação e bairro canônicos)
  try {
    const vc = await fetchJsonWithTimeout(`https://viacep.com.br/ws/${digits}/json/`);
    if (vc.ok && vc.data && !vc.data.erro && vc.data.localidade) {
      const result: CepLookupResult = {
        cep: formatCep(digits),
        street: collapseSpaces(vc.data.logradouro || ''),
        neighborhood: collapseSpaces(vc.data.bairro || ''),
        city: collapseSpaces(vc.data.localidade || ''),
        state: String(vc.data.uf || '').trim().toUpperCase(),
        source: 'ViaCEP (Correios)',
      };
      cepCache.set(digits, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
      return { ok: true, data: result };
    }
    if (vc.ok && vc.data?.erro) {
      return {
        ok: false,
        status: 404,
        code: 'CEP_NOT_FOUND',
        error: 'CEP não encontrado na base dos Correios.',
      };
    }
  } catch {
    // fallback para BrasilAPI v2
  }

  // Tentativa 2: BrasilAPI v2 (fallback com coordenadas quando disponíveis)
  try {
    const br = await fetchJsonWithTimeout(`https://brasilapi.com.br/api/cep/v2/${digits}`);
    if (br.ok && br.data && br.data.city) {
      const rawLat = Number(br.data.location?.coordinates?.latitude);
      const rawLng = Number(br.data.location?.coordinates?.longitude);
      const coordinates = isValidLatLng(rawLat, rawLng)
        ? {
            latitude: Math.round(rawLat * 1_000_000) / 1_000_000,
            longitude: Math.round(rawLng * 1_000_000) / 1_000_000,
          }
        : undefined;

      const result: CepLookupResult = {
        cep: formatCep(digits),
        street: collapseSpaces(br.data.street || ''),
        neighborhood: collapseSpaces(br.data.neighborhood || ''),
        city: collapseSpaces(br.data.city || ''),
        state: String(br.data.state || '').trim().toUpperCase(),
        coordinates,
        source: 'BrasilAPI',
      };
      cepCache.set(digits, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
      return { ok: true, data: result };
    }
  } catch {
    // segue para 503
  }

  return {
    ok: false,
    status: 503,
    code: 'CEP_LOOKUP_UNAVAILABLE',
    error: 'Serviço de consulta de CEP temporariamente indisponível. Preencha o endereço manualmente.',
  };
}

async function queryNominatimCandidates(params: Record<string, string>, limit = 10): Promise<any[]> {
  const qs = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    countrycodes: 'br',
    limit: String(limit),
    ...params,
  });
  try {
    const res = await fetchJsonWithTimeout(
      `https://nominatim.openstreetmap.org/search?${qs.toString()}`,
      6500
    );
    if (res.ok && Array.isArray(res.data)) {
      return res.data;
    }
  } catch {
    // segue para próximo nível
  }
  return [];
}

interface CandidateScore {
  hit: any;
  score: number;
  exactHouseMatch: boolean;
  exactCepMatch: boolean;
  roadMatch: boolean;
  isCityBoundary: boolean;
}

function scoreNominatimCandidate(
  hit: any,
  criteria: {
    cepDigits: string;
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
  }
): CandidateScore {
  const addr = hit?.address || {};
  let score = 0;

  const hitCep = onlyDigits(addr.postcode || '');
  const exactCepMatch = Boolean(criteria.cepDigits.length === 8 && hitCep === criteria.cepDigits);
  if (exactCepMatch) {
    score += 130;
  } else if (criteria.cepDigits.length === 8 && hitCep.length >= 5 && hitCep.slice(0, 5) === criteria.cepDigits.slice(0, 5)) {
    score += 45;
  } else if (criteria.cepDigits.length === 8 && hitCep.length >= 3 && hitCep.slice(0, 3) === criteria.cepDigits.slice(0, 3)) {
    score += 15;
  }

  const targetNum = normalizeCompare(criteria.number);
  const hitNum = normalizeCompare(addr.house_number || '');
  const exactHouseMatch = Boolean(targetNum && hitNum && hitNum === targetNum);
  if (exactHouseMatch) {
    score += 150;
  } else if (targetNum && hitNum) {
    score += 20;
  }

  const targetStreetNorm = normalizeCompare(expandBrazilianStreetAbbreviations(criteria.street));
  const hitRoadNorm = normalizeCompare(addr.road || hit?.name || '');
  let roadMatch = false;
  if (targetStreetNorm && hitRoadNorm) {
    if (hitRoadNorm === targetStreetNorm) {
      roadMatch = true;
      score += 70;
    } else {
      const targetTokens = targetStreetNorm.split(' ').filter((t) => t.length > 2);
      const hitTokenSet = new Set(hitRoadNorm.split(' ').filter((t) => t.length > 2));
      const matchedCount = targetTokens.filter((t) => hitTokenSet.has(t)).length;
      if (targetTokens.length > 0 && matchedCount / targetTokens.length >= 0.65) {
        roadMatch = true;
        score += 45;
      }
    }
  }

  const targetNeighNorm = normalizeCompare(criteria.neighborhood);
  const hitNeighParts = [addr.suburb, addr.neighbourhood, addr.quarter, addr.city_district]
    .filter(Boolean)
    .map((v) => normalizeCompare(String(v)));
  if (targetNeighNorm && hitNeighParts.length > 0) {
    const neighMatched = hitNeighParts.some(
      (h) => h === targetNeighNorm || h.includes(targetNeighNorm) || targetNeighNorm.includes(h)
    );
    if (neighMatched) {
      score += 35;
    }
  }

  const targetCityNorm = normalizeCompare(criteria.city);
  const hitCityNorm = normalizeCompare(addr.city || addr.town || addr.municipality || '');
  if (targetCityNorm && hitCityNorm) {
    if (hitCityNorm === targetCityNorm) {
      score += 35;
    } else {
      score -= 80; // Penaliza resultado em outro município
    }
  }

  const targetState = criteria.state.toUpperCase();
  const isoState = String(addr['ISO3166-2-lvl4'] || '').toUpperCase();
  const hitStateNorm = normalizeCompare(addr.state || '');
  const expectedStateName = BRAZIL_STATE_NAMES[targetState] ? normalizeCompare(BRAZIL_STATE_NAMES[targetState]) : '';
  if (targetState) {
    if (isoState === `BR-${targetState}` || (expectedStateName && hitStateNorm === expectedStateName)) {
      score += 20;
    } else if (isoState || hitStateNorm) {
      score -= 100; // Penaliza fortemente resultado em outra UF
    }
  }

  const isCityBoundary =
    hit?.class === 'boundary' ||
    hit?.addresstype === 'city' ||
    hit?.addresstype === 'municipality' ||
    hit?.addresstype === 'state';

  if (isCityBoundary && (criteria.street || criteria.cepDigits.length === 8)) {
    score -= 110;
  }

  // Pequeno desempate por relevância OSM
  score += Number(hit?.importance || 0) * 5;

  return {
    hit,
    score,
    exactHouseMatch,
    exactCepMatch,
    roadMatch,
    isCityBoundary,
  };
}

function pickBestCandidate(
  candidates: any[],
  criteria: {
    cepDigits: string;
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
  }
): CandidateScore | null {
  const valid = candidates.filter((c) => isValidLatLng(Number(c?.lat), Number(c?.lon)));
  if (valid.length === 0) return null;

  // Dedup por osm_type + osm_id + lat/lon
  const dedup = new Map<string, any>();
  for (const item of valid) {
    const key = `${item.osm_type || ''}:${item.osm_id || ''}:${item.lat}:${item.lon}`;
    if (!dedup.has(key)) dedup.set(key, item);
  }

  const scored = Array.from(dedup.values()).map((hit) => scoreNominatimCandidate(hit, criteria));
  scored.sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

function normalizeNumberForQuery(raw?: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const upper = trimmed.toUpperCase();
  if (upper === 'S/N' || upper === 'SN' || upper === 'S.N.' || upper === 'SEM NUMERO') {
    return '';
  }
  return trimmed;
}

export async function geocodeBrazilianAddress(input: {
  cep?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  q?: string;
}): Promise<GeocodeResult | null> {
  const cepDigits = onlyDigits(input.cep || '').slice(0, 8);
  let street = collapseSpaces(String(input.street || '').slice(0, 180));
  const num = normalizeNumberForQuery(input.number).slice(0, 30);
  let neighborhood = collapseSpaces(String(input.neighborhood || '').slice(0, 120));
  let city = collapseSpaces(String(input.city || '').slice(0, 80));
  let state = String(input.state || '').trim().toUpperCase().slice(0, 2);
  const freeQuery = collapseSpaces(String(input.q || '').slice(0, 160));

  const cacheKey = JSON.stringify({ cepDigits, street, num, neighborhood, city, state, freeQuery });
  const cached = geocodeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Enriquecimento canônico via CEP (garante acentuação correta de cidade/logradouro/bairro)
  let cepLookupData: CepLookupResult | undefined;
  if (cepDigits.length === 8) {
    const cepRes = await lookupCepByDigits(cepDigits);
    if (cepRes.ok) {
      cepLookupData = cepRes.data;
      if (!street) {
        street = cepRes.data.street;
      } else if (
        cepRes.data.street &&
        normalizeCompare(expandBrazilianStreetAbbreviations(street)) ===
          normalizeCompare(expandBrazilianStreetAbbreviations(cepRes.data.street))
      ) {
        street = cepRes.data.street;
      }
      if (!neighborhood) {
        neighborhood = cepRes.data.neighborhood;
      } else if (
        cepRes.data.neighborhood &&
        normalizeCompare(neighborhood) === normalizeCompare(cepRes.data.neighborhood)
      ) {
        neighborhood = cepRes.data.neighborhood;
      }
      if (!city) {
        city = cepRes.data.city;
      } else if (cepRes.data.city && normalizeCompare(city) === normalizeCompare(cepRes.data.city)) {
        city = cepRes.data.city;
      }
      if (!state) state = cepRes.data.state;
    }
  }

  const queryStreet = expandBrazilianStreetAbbreviations(street);
  const formattedCep = cepDigits.length === 8 ? formatCep(cepDigits) : '';
  const stateName = state ? BRAZIL_STATE_NAMES[state] || state : '';

  const criteria = {
    cepDigits,
    street: queryStreet,
    number: num,
    neighborhood,
    city,
    state,
  };

  const saveAndReturn = (result: GeocodeResult): GeocodeResult => {
    geocodeCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  };

  // Nível 1 & 2 combinados com ranking inteligente: Logradouro + Número + CEP + Cidade
  // (Evita que avenidas longas como Av. Coronel Colares Moreira caiam em um segmento 2 km distante)
  if (queryStreet && city) {
    const pool: any[] = [];

    if (num && formattedCep) {
      const hits = await queryNominatimCandidates(
        { q: [`${queryStreet}, ${num}`, formattedCep, city, stateName || state, 'Brasil'].filter(Boolean).join(', ') },
        10
      );
      pool.push(...hits);
    }

    let best = pickBestCandidate(pool, criteria);

    // Se ainda não encontramos casa exata nem o trecho exato do CEP, busca pelo trecho da via com o CEP
    if (formattedCep && (!best || (!best.exactHouseMatch && !best.exactCepMatch))) {
      const hitsByCepRoad = await queryNominatimCandidates(
        { q: [queryStreet, formattedCep, city, stateName || state, 'Brasil'].filter(Boolean).join(', ') },
        12
      );
      pool.push(...hitsByCepRoad);
      best = pickBestCandidate(pool, criteria);
    }

    // Se ainda não encontramos número exato, tenta Logradouro + Número + Bairro/Cidade
    if (num && (!best || !best.exactHouseMatch)) {
      const hitsByNumNeigh = await queryNominatimCandidates(
        { q: [`${queryStreet}, ${num}`, neighborhood, city, stateName || state, 'Brasil'].filter(Boolean).join(', ') },
        10
      );
      pool.push(...hitsByNumNeigh);
      best = pickBestCandidate(pool, criteria);

      if (neighborhood && (!best || (!best.exactHouseMatch && !best.roadMatch))) {
        const hitsByNumCity = await queryNominatimCandidates(
          { q: [`${queryStreet}, ${num}`, city, stateName || state, 'Brasil'].filter(Boolean).join(', ') },
          10
        );
        pool.push(...hitsByNumCity);
        best = pickBestCandidate(pool, criteria);
      }
    }

    // Fallback de logradouro completo na cidade (até 15 segmentos para casar CEP/bairro)
    if (!best || (!best.exactHouseMatch && !best.exactCepMatch && !best.roadMatch)) {
      const hitsRoadAll = await queryNominatimCandidates(
        { q: [queryStreet, neighborhood, city, stateName || state, 'Brasil'].filter(Boolean).join(', ') },
        15
      );
      pool.push(...hitsRoadAll);
      if (neighborhood && pool.length === 0) {
        const hitsRoadCity = await queryNominatimCandidates(
          { q: [queryStreet, city, stateName || state, 'Brasil'].filter(Boolean).join(', ') },
          15
        );
        pool.push(...hitsRoadCity);
      }
      best = pickBestCandidate(pool, criteria);
    }

    if (best && !best.isCityBoundary && (best.exactHouseMatch || best.exactCepMatch || best.roadMatch)) {
      const lat = Number(best.hit.lat);
      const lng = Number(best.hit.lon);
      const hitAddr = best.hit.address || {};
      const precision: GeoPrecision = best.exactHouseMatch
        ? 'numero'
        : best.roadMatch
          ? 'logradouro'
          : 'cep';

      const sourceLabel = best.exactHouseMatch
        ? 'Nominatim OSM (Número Exato)'
        : best.roadMatch && best.exactCepMatch
          ? `Nominatim OSM (Logradouro + CEP ${formattedCep})`
          : best.roadMatch
            ? 'Nominatim OSM (Logradouro)'
            : `Nominatim OSM (CEP ${formattedCep})`;

      return saveAndReturn({
        latitude: Math.round(lat * 1_000_000) / 1_000_000,
        longitude: Math.round(lng * 1_000_000) / 1_000_000,
        precision,
        displayName: String(best.hit.display_name || [street, num, neighborhood, city, state].filter(Boolean).join(', ')),
        cep: formattedCep || (hitAddr.postcode ? String(hitAddr.postcode) : undefined),
        street: street || hitAddr.road,
        neighborhood: neighborhood || hitAddr.suburb || hitAddr.neighbourhood,
        city: city || hitAddr.city || hitAddr.town || hitAddr.municipality,
        state: state || undefined,
        source: sourceLabel,
      });
    }
  }

  // Nível 3: CEP exato (Nominatim por texto CEP + cidade, evitando cair no centro genérico da cidade)
  if (formattedCep) {
    const cepHits = await queryNominatimCandidates(
      { q: [formattedCep, city, stateName || state, 'Brasil'].filter(Boolean).join(', ') },
      5
    );
    const bestCep = pickBestCandidate(cepHits, criteria);
    if (bestCep && !bestCep.isCityBoundary) {
      const lat = Number(bestCep.hit.lat);
      const lng = Number(bestCep.hit.lon);
      return saveAndReturn({
        latitude: Math.round(lat * 1_000_000) / 1_000_000,
        longitude: Math.round(lng * 1_000_000) / 1_000_000,
        precision: 'cep',
        displayName: String(bestCep.hit.display_name || `${formattedCep}, ${city || 'Brasil'}`),
        cep: formattedCep,
        street: street || cepLookupData?.street,
        neighborhood: neighborhood || cepLookupData?.neighborhood,
        city: city || cepLookupData?.city,
        state: state || cepLookupData?.state,
        source: 'Nominatim OSM (CEP)',
      });
    }

    if (cepLookupData?.coordinates && isValidLatLng(cepLookupData.coordinates.latitude, cepLookupData.coordinates.longitude)) {
      return saveAndReturn({
        latitude: cepLookupData.coordinates.latitude,
        longitude: cepLookupData.coordinates.longitude,
        precision: 'cep',
        displayName: [cepLookupData.street, cepLookupData.neighborhood, `${cepLookupData.city}/${cepLookupData.state}`, cepLookupData.cep]
          .filter(Boolean)
          .join(', '),
        cep: cepLookupData.cep,
        street: cepLookupData.street,
        neighborhood: cepLookupData.neighborhood,
        city: cepLookupData.city,
        state: cepLookupData.state,
        source: 'BrasilAPI v2 (CEP)',
      });
    }
  }

  // Nível 4: Consulta livre (usada pelo leitor público ao digitar endereço de origem)
  if (freeQuery) {
    const hits = await queryNominatimCandidates({ q: `${freeQuery}, Brasil` }, 5);
    const hit = hits.find((h) => isValidLatLng(Number(h?.lat), Number(h?.lon)));
    if (hit) {
      const lat = Number(hit.lat);
      const lng = Number(hit.lon);
      const hitAddr = hit.address || {};
      const precision: GeoPrecision = hitAddr.house_number
        ? 'numero'
        : hitAddr.road
          ? 'logradouro'
          : hitAddr.postcode
            ? 'cep'
            : 'cidade';
      return saveAndReturn({
        latitude: Math.round(lat * 1_000_000) / 1_000_000,
        longitude: Math.round(lng * 1_000_000) / 1_000_000,
        precision,
        displayName: String(hit.display_name || freeQuery),
        cep: hitAddr.postcode ? String(hitAddr.postcode) : undefined,
        street: hitAddr.road ? String(hitAddr.road) : undefined,
        neighborhood: hitAddr.suburb || hitAddr.neighbourhood || undefined,
        city: hitAddr.city || hitAddr.town || hitAddr.municipality || undefined,
        state: undefined,
        source: 'Nominatim OSM',
      });
    }
  }

  // Nível 5: Centro da Cidade + UF
  if (city) {
    const qParts = [city, stateName || state, 'Brasil'].filter(Boolean);
    const hits = await queryNominatimCandidates({ q: qParts.join(', ') }, 3);
    const hit = hits.find((h) => isValidLatLng(Number(h?.lat), Number(h?.lon)));
    if (hit) {
      const lat = Number(hit.lat);
      const lng = Number(hit.lon);
      return saveAndReturn({
        latitude: Math.round(lat * 1_000_000) / 1_000_000,
        longitude: Math.round(lng * 1_000_000) / 1_000_000,
        precision: 'cidade',
        displayName: String(hit.display_name || qParts.join(', ')),
        cep: formattedCep || undefined,
        street: street || undefined,
        neighborhood: neighborhood || undefined,
        city,
        state: state || undefined,
        source: 'Nominatim OSM (Município)',
      });
    }
  }

  return null;
}

interface RawCnpjProviderData {
  companyName: string;
  tradeName: string;
  email: string;
  phone: string;
  cepDigits: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  cnaeDescription: string;
  foundedYear?: number;
  situation?: string;
  source: string;
}

async function fetchFromBrasilApi(digits: string): Promise<{ data?: RawCnpjProviderData; notFound?: boolean }> {
  try {
    const br = await fetchJsonWithTimeout(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
    if (br.status === 404) {
      return { notFound: true };
    }
    if (br.ok && br.data && br.data.razao_social) {
      const street = combineStreetTypeAndName(
        String(br.data.descricao_tipo_de_logradouro || ''),
        String(br.data.logradouro || '')
      );
      const rawPhone = collapseSpaces(String(br.data.ddd_telefone_1 || br.data.ddd_telefone_2 || ''));
      const startYear = br.data.data_inicio_atividade
        ? parseInt(String(br.data.data_inicio_atividade).slice(0, 4), 10)
        : undefined;

      return {
        data: {
          companyName: collapseSpaces(String(br.data.razao_social || '')),
          tradeName: collapseSpaces(String(br.data.nome_fantasia || '')),
          email: collapseSpaces(String(br.data.email || '')).toLowerCase(),
          phone: rawPhone ? formatPhone(rawPhone) : '',
          cepDigits: onlyDigits(String(br.data.cep || '')).slice(0, 8),
          street,
          number: collapseSpaces(String(br.data.numero || '')),
          complement: collapseSpaces(String(br.data.complemento || '')),
          neighborhood: collapseSpaces(String(br.data.bairro || '')),
          city: collapseSpaces(String(br.data.municipio || '')),
          state: String(br.data.uf || '').trim().toUpperCase().slice(0, 2),
          cnaeDescription: collapseSpaces(String(br.data.cnae_fiscal_descricao || '')),
          foundedYear: startYear && startYear >= 1900 ? startYear : undefined,
          situation: collapseSpaces(String(br.data.descricao_situacao_cadastral || '')) || undefined,
          source: 'BrasilAPI',
        },
      };
    }
  } catch {
    // fallback para próximo provedor
  }
  return {};
}

async function fetchFromReceitaWs(digits: string): Promise<{ data?: RawCnpjProviderData; notFound?: boolean }> {
  try {
    const rws = await fetchJsonWithTimeout(`https://receitaws.com.br/v1/cnpj/${digits}`);
    if (rws.ok && rws.data && rws.data.status === 'ERROR' && /inexistente|inv[aá]lido/i.test(String(rws.data.message || ''))) {
      return { notFound: true };
    }
    if (rws.ok && rws.data && rws.data.status === 'OK') {
      const rawPhone = collapseSpaces(String(rws.data.telefone || '').split('/')[0] || '');
      const aberturaParts = String(rws.data.abertura || '').split('/');
      const startYear = aberturaParts.length === 3 ? parseInt(aberturaParts[2], 10) : undefined;
      const cnaeText =
        Array.isArray(rws.data.atividade_principal) && rws.data.atividade_principal[0]?.text
          ? String(rws.data.atividade_principal[0].text)
          : '';

      return {
        data: {
          companyName: collapseSpaces(String(rws.data.nome || '')),
          tradeName: collapseSpaces(String(rws.data.fantasia || '')),
          email: collapseSpaces(String(rws.data.email || '')).toLowerCase(),
          phone: rawPhone ? formatPhone(rawPhone) : '',
          cepDigits: onlyDigits(String(rws.data.cep || '')).slice(0, 8),
          street: collapseSpaces(String(rws.data.logradouro || '')),
          number: collapseSpaces(String(rws.data.numero || '')),
          complement: collapseSpaces(String(rws.data.complemento || '')),
          neighborhood: collapseSpaces(String(rws.data.bairro || '')),
          city: collapseSpaces(String(rws.data.municipio || '')),
          state: String(rws.data.uf || '').trim().toUpperCase().slice(0, 2),
          cnaeDescription: collapseSpaces(cnaeText),
          foundedYear: startYear && startYear >= 1900 ? startYear : undefined,
          situation: collapseSpaces(String(rws.data.situacao || '')) || undefined,
          source: 'ReceitaWS',
        },
      };
    }
  } catch {
    // fallback para próximo provedor
  }
  return {};
}

async function fetchFromCnpjWs(digits: string): Promise<{ data?: RawCnpjProviderData; notFound?: boolean }> {
  try {
    const ws = await fetchJsonWithTimeout(`https://publica.cnpj.ws/cnpj/${digits}`);
    if (ws.status === 404) {
      return { notFound: true };
    }
    if (ws.ok && ws.data && ws.data.razao_social) {
      const est = ws.data.estabelecimento || {};
      const street = combineStreetTypeAndName(
        String(est.tipo_logradouro || ''),
        String(est.logradouro || '')
      );
      const rawPhone =
        est.ddd1 && est.telefone1
          ? `${est.ddd1}${est.telefone1}`
          : est.ddd2 && est.telefone2
            ? `${est.ddd2}${est.telefone2}`
            : '';
      const startYear = est.data_inicio_atividade
        ? parseInt(String(est.data_inicio_atividade).slice(0, 4), 10)
        : undefined;

      return {
        data: {
          companyName: collapseSpaces(String(ws.data.razao_social || '')),
          tradeName: collapseSpaces(String(est.nome_fantasia || '')),
          email: collapseSpaces(String(est.email || '')).toLowerCase(),
          phone: rawPhone ? formatPhone(rawPhone) : '',
          cepDigits: onlyDigits(String(est.cep || '')).slice(0, 8),
          street,
          number: collapseSpaces(String(est.numero || '')),
          complement: collapseSpaces(String(est.complemento || '')),
          neighborhood: collapseSpaces(String(est.bairro || '')),
          city: collapseSpaces(String(est.cidade?.nome || '')),
          state: String(est.estado?.sigla || '').trim().toUpperCase().slice(0, 2),
          cnaeDescription: collapseSpaces(String(est.atividade_principal?.descricao || '')),
          foundedYear: startYear && startYear >= 1900 ? startYear : undefined,
          situation: collapseSpaces(String(est.situacao_cadastral || '')) || undefined,
          source: 'CNPJ.ws',
        },
      };
    }
  } catch {
    // fim dos provedores
  }
  return {};
}

function mergeProviderData(primary: RawCnpjProviderData, secondary: RawCnpjProviderData): RawCnpjProviderData {
  const sources = Array.from(new Set([primary.source, secondary.source])).join(' + ');
  return {
    companyName: primary.companyName || secondary.companyName,
    tradeName: primary.tradeName || secondary.tradeName,
    email: primary.email || secondary.email,
    phone: primary.phone || secondary.phone,
    cepDigits: primary.cepDigits || secondary.cepDigits,
    street: primary.street || secondary.street,
    number: primary.number || secondary.number,
    complement: primary.complement || secondary.complement,
    neighborhood: primary.neighborhood || secondary.neighborhood,
    city: primary.city || secondary.city,
    state: primary.state || secondary.state,
    cnaeDescription: primary.cnaeDescription || secondary.cnaeDescription,
    foundedYear: primary.foundedYear || secondary.foundedYear,
    situation: primary.situation || secondary.situation,
    source: sources,
  };
}

function needsAddressOrContactEnrichment(data: RawCnpjProviderData): boolean {
  return !data.street || !data.number || !data.cepDigits || !data.complement || !data.phone || !data.email;
}

// Exige sessão autenticada do ERP para evitar abuso público de proxy
lookupRouter.use(requireAuth);

// GET /api/lookups/cep/:cep — Busca automática de endereço via ViaCEP (Correios) com fallback para BrasilAPI v2
lookupRouter.get('/cep/:cep', async (req: RequestWithUser, res: Response) => {
  const digits = onlyDigits(req.params.cep);
  const result = await lookupCepByDigits(digits);
  if (!result.ok) {
    return res.status(result.status).json({
      error: result.error,
      code: result.code,
    });
  }
  return res.json(result.data);
});

// GET /api/lookups/geocode — Geocodificação inteligente conforme CEP + Número + Logradouro
lookupRouter.get('/geocode', async (req: RequestWithUser, res: Response) => {
  const cep = typeof req.query.cep === 'string' ? req.query.cep : undefined;
  const street = typeof req.query.street === 'string' ? req.query.street : undefined;
  const number = typeof req.query.number === 'string' ? req.query.number : undefined;
  const neighborhood = typeof req.query.neighborhood === 'string' ? req.query.neighborhood : undefined;
  const city = typeof req.query.city === 'string' ? req.query.city : undefined;
  const state = typeof req.query.state === 'string' ? req.query.state : undefined;

  if (!cep && !street && !city) {
    return res.status(400).json({
      error: 'Informe ao menos CEP, logradouro ou cidade para localizar no mapa.',
      code: 'GEOCODE_PARAMS_REQUIRED',
    });
  }

  const geo = await geocodeBrazilianAddress({
    cep,
    street,
    number,
    neighborhood,
    city,
    state,
  });

  if (!geo) {
    return res.status(404).json({
      error: 'Não foi possível localizar coordenadas para este endereço. Ajuste o pino manualmente no mapa.',
      code: 'GEOCODE_NOT_FOUND',
    });
  }

  return res.json(geo);
});

// GET /api/lookups/cnpj/:cnpj — Preenchimento automático empresarial com enriquecimento multi-provedor + CEP + Mapa OSM
lookupRouter.get('/cnpj/:cnpj', async (req: RequestWithUser, res: Response) => {
  const digits = onlyDigits(req.params.cnpj);
  if (!isValidCnpjDigits(digits)) {
    return res.status(400).json({
      error: 'CNPJ inválido. Verifique os 14 dígitos informados.',
      code: 'INVALID_CNPJ',
    });
  }

  const cached = cnpjCache.get(digits);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.data);
  }

  // 1. Consulta BrasilAPI; para MEIs (que têm logradouro/número omitidos na base aberta LGPD)
  // ou em caso de indisponibilidade, complementa automaticamente com ReceitaWS e CNPJ.ws
  let merged: RawCnpjProviderData | undefined;
  let explicitNotFoundCount = 0;

  const brRes = await fetchFromBrasilApi(digits);
  if (brRes.data) {
    merged = brRes.data;
  } else if (brRes.notFound) {
    explicitNotFoundCount += 1;
  }

  if (!merged || needsAddressOrContactEnrichment(merged)) {
    const rwsRes = await fetchFromReceitaWs(digits);
    if (rwsRes.data) {
      merged = merged ? mergeProviderData(merged, rwsRes.data) : rwsRes.data;
    } else if (rwsRes.notFound) {
      explicitNotFoundCount += 1;
    }
  }

  if (!merged || !merged.street || !merged.number || !merged.cepDigits) {
    const wsRes = await fetchFromCnpjWs(digits);
    if (wsRes.data) {
      merged = merged ? mergeProviderData(merged, wsRes.data) : wsRes.data;
    } else if (wsRes.notFound) {
      explicitNotFoundCount += 1;
    }
  }

  if (!merged) {
    if (explicitNotFoundCount > 0) {
      return res.status(404).json({
        error: 'CNPJ não encontrado na base da Receita Federal.',
        code: 'CNPJ_NOT_FOUND',
      });
    }
    return res.status(503).json({
      error: 'Serviço de consulta de CNPJ indisponível no momento. Você pode continuar preenchendo os dados manualmente.',
      code: 'CNPJ_LOOKUP_UNAVAILABLE',
    });
  }

  // 2. Canonicaliza endereço (acentos/grafia oficial Correios) cruzando com o CEP quando disponível
  let street = formatBrazilianTitleCase(merged.street);
  let number = collapseSpaces(merged.number);
  let complement = formatBrazilianTitleCase(merged.complement);
  let neighborhood = formatBrazilianTitleCase(merged.neighborhood);
  let city = formatBrazilianTitleCase(merged.city);
  let state = merged.state;
  const cepFormatted = merged.cepDigits.length === 8 ? formatCep(merged.cepDigits) : '';

  if (merged.cepDigits.length === 8) {
    const cepRes = await lookupCepByDigits(merged.cepDigits);
    if (cepRes.ok) {
      const cepData = cepRes.data;
      if (!street && cepData.street) {
        street = cepData.street;
      } else if (
        street &&
        cepData.street &&
        normalizeCompare(expandBrazilianStreetAbbreviations(street)) ===
          normalizeCompare(expandBrazilianStreetAbbreviations(cepData.street))
      ) {
        street = cepData.street;
      }

      if (!neighborhood && cepData.neighborhood) {
        neighborhood = cepData.neighborhood;
      } else if (
        neighborhood &&
        cepData.neighborhood &&
        (normalizeCompare(neighborhood) === normalizeCompare(cepData.neighborhood) ||
          normalizeCompare(cepData.neighborhood).endsWith(` ${normalizeCompare(neighborhood)}`))
      ) {
        neighborhood = cepData.neighborhood;
      }

      if (!city && cepData.city) {
        city = cepData.city;
      } else if (city && cepData.city && normalizeCompare(city) === normalizeCompare(cepData.city)) {
        city = cepData.city;
      }

      if (!state && cepData.state) {
        state = cepData.state;
      }
    }
  }

  // 3. Geocodifica automaticamente no OpenStreetMap (Nominatim) para já posicionar o pino exato no mapa
  const geo =
    cepFormatted || street || city
      ? await geocodeBrazilianAddress({
          cep: cepFormatted,
          street,
          number,
          neighborhood,
          city,
          state,
        })
      : null;

  const result: CnpjLookupResult = {
    cnpj: formatCnpj(digits),
    companyName: merged.companyName,
    tradeName: merged.tradeName || merged.companyName,
    email: merged.email,
    phone: merged.phone,
    cep: cepFormatted,
    street,
    number,
    complement,
    neighborhood,
    city,
    state,
    addressLine: buildAddressLine(street, number, complement, neighborhood),
    segment: inferSegmentFromCnae(merged.cnaeDescription),
    foundedYear: merged.foundedYear,
    situation: merged.situation,
    latitude: geo?.latitude,
    longitude: geo?.longitude,
    geoPrecision: geo?.precision,
    geoSource: geo?.source,
    geoDisplayName: geo?.displayName,
    source: `${merged.source} (Receita Federal)`,
  };

  cnpjCache.set(digits, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return res.json(result);
});

