import { Router, Response } from 'express';
import { RequestWithUser, requireAuth } from '../auth/rbac';

export const lookupRouter = Router();

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
const cepCache = new Map<string, CacheEntry<CepLookupResult>>();
const cnpjCache = new Map<string, CacheEntry<CnpjLookupResult>>();

export interface CepLookupResult {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
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
  source: string;
}

function onlyDigits(val: string): string {
  return String(val || '').replace(/\D/g, '');
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

async function fetchJsonWithTimeout(url: string, timeoutMs: number = 6000): Promise<{ ok: boolean; status: number; data: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DE-FARDAS-ERP/1.6',
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

function buildAddressLine(street: string, number: string, complement: string): string {
  const parts: string[] = [];
  const normNum = number.trim().toUpperCase();
  if (street) parts.push(street);
  if (normNum && normNum !== 'S/N' && normNum !== 'SN') parts.push(`nº ${number.trim()}`);
  else if (normNum) parts.push('S/N');
  if (complement) parts.push(complement);
  return parts.join(', ');
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

// Exige sessão autenticada do ERP para evitar abuso público de proxy
lookupRouter.use(requireAuth);

// GET /api/lookups/cep/:cep — Busca automática de endereço via BrasilAPI com fallback para ViaCEP
lookupRouter.get('/cep/:cep', async (req: RequestWithUser, res: Response) => {
  const digits = onlyDigits(req.params.cep);
  if (digits.length !== 8) {
    return res.status(400).json({
      error: 'CEP inválido. Informe exatamente 8 dígitos numéricos.',
      code: 'INVALID_CEP',
    });
  }

  const cached = cepCache.get(digits);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.data);
  }

  // Tentativa 1: BrasilAPI v2
  try {
    const br = await fetchJsonWithTimeout(`https://brasilapi.com.br/api/cep/v2/${digits}`);
    if (br.ok && br.data && br.data.city) {
      const result: CepLookupResult = {
        cep: formatCep(digits),
        street: String(br.data.street || '').trim(),
        neighborhood: String(br.data.neighborhood || '').trim(),
        city: String(br.data.city || '').trim(),
        state: String(br.data.state || '').trim().toUpperCase(),
        source: 'BrasilAPI',
      };
      cepCache.set(digits, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
      return res.json(result);
    }
  } catch {
    // fallback para ViaCEP
  }

  // Tentativa 2: ViaCEP
  try {
    const vc = await fetchJsonWithTimeout(`https://viacep.com.br/ws/${digits}/json/`);
    if (vc.ok && vc.data && !vc.data.erro) {
      const result: CepLookupResult = {
        cep: formatCep(digits),
        street: String(vc.data.logradouro || '').trim(),
        neighborhood: String(vc.data.bairro || '').trim(),
        city: String(vc.data.localidade || '').trim(),
        state: String(vc.data.uf || '').trim().toUpperCase(),
        source: 'ViaCEP',
      };
      cepCache.set(digits, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
      return res.json(result);
    }
    if (vc.ok && vc.data?.erro) {
      return res.status(404).json({
        error: 'CEP não encontrado na base dos Correios.',
        code: 'CEP_NOT_FOUND',
      });
    }
  } catch {
    // segue para 503
  }

  return res.status(503).json({
    error: 'Serviço de consulta de CEP temporariamente indisponível. Preencha o endereço manualmente.',
    code: 'CEP_LOOKUP_UNAVAILABLE',
  });
});

// GET /api/lookups/cnpj/:cnpj — Preenchimento automático empresarial via BrasilAPI com fallback para ReceitaWS
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

  // Tentativa 1: BrasilAPI
  try {
    const br = await fetchJsonWithTimeout(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
    if (br.ok && br.data && br.data.razao_social) {
      const streetPrefix = br.data.descricao_tipo_de_logradouro ? `${br.data.descricao_tipo_de_logradouro} ` : '';
      const street = `${streetPrefix}${br.data.logradouro || ''}`.trim();
      const number = String(br.data.numero || '').trim();
      const complement = String(br.data.complemento || '').trim();
      const rawPhone = String(br.data.ddd_telefone_1 || br.data.ddd_telefone_2 || '').trim();
      const startYear = br.data.data_inicio_atividade ? parseInt(String(br.data.data_inicio_atividade).slice(0, 4), 10) : undefined;

      const result: CnpjLookupResult = {
        cnpj: formatCnpj(digits),
        companyName: String(br.data.razao_social || '').trim(),
        tradeName: String(br.data.nome_fantasia || br.data.razao_social || '').trim(),
        email: String(br.data.email || '').trim().toLowerCase(),
        phone: rawPhone ? formatPhone(rawPhone) : '',
        cep: formatCep(onlyDigits(br.data.cep || '')),
        street,
        number,
        complement,
        neighborhood: String(br.data.bairro || '').trim(),
        city: String(br.data.municipio || '').trim(),
        state: String(br.data.uf || '').trim().toUpperCase(),
        addressLine: buildAddressLine(street, number, complement),
        segment: inferSegmentFromCnae(String(br.data.cnae_fiscal_descricao || '')),
        foundedYear: startYear && startYear >= 1900 ? startYear : undefined,
        situation: String(br.data.descricao_situacao_cadastral || '').trim() || undefined,
        source: 'BrasilAPI (Receita Federal)',
      };
      cnpjCache.set(digits, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
      return res.json(result);
    }
    if (br.status === 404) {
      return res.status(404).json({
        error: 'CNPJ não encontrado na base da Receita Federal.',
        code: 'CNPJ_NOT_FOUND',
      });
    }
  } catch {
    // fallback para ReceitaWS
  }

  // Tentativa 2: ReceitaWS
  try {
    const rws = await fetchJsonWithTimeout(`https://receitaws.com.br/v1/cnpj/${digits}`);
    if (rws.ok && rws.data && rws.data.status === 'OK') {
      const street = String(rws.data.logradouro || '').trim();
      const number = String(rws.data.numero || '').trim();
      const complement = String(rws.data.complemento || '').trim();
      const rawPhone = String(rws.data.telefone || '').split('/')[0].trim();
      const aberturaParts = String(rws.data.abertura || '').split('/');
      const startYear = aberturaParts.length === 3 ? parseInt(aberturaParts[2], 10) : undefined;
      const cnaeText = Array.isArray(rws.data.atividade_principal) && rws.data.atividade_principal[0]?.text
        ? String(rws.data.atividade_principal[0].text)
        : '';

      const result: CnpjLookupResult = {
        cnpj: formatCnpj(digits),
        companyName: String(rws.data.nome || '').trim(),
        tradeName: String(rws.data.fantasia || rws.data.nome || '').trim(),
        email: String(rws.data.email || '').trim().toLowerCase(),
        phone: rawPhone ? formatPhone(rawPhone) : '',
        cep: formatCep(onlyDigits(rws.data.cep || '')),
        street,
        number,
        complement,
        neighborhood: String(rws.data.bairro || '').trim(),
        city: String(rws.data.municipio || '').trim(),
        state: String(rws.data.uf || '').trim().toUpperCase(),
        addressLine: buildAddressLine(street, number, complement),
        segment: inferSegmentFromCnae(cnaeText),
        foundedYear: startYear && startYear >= 1900 ? startYear : undefined,
        situation: String(rws.data.situacao || '').trim() || undefined,
        source: 'ReceitaWS',
      };
      cnpjCache.set(digits, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
      return res.json(result);
    }
  } catch {
    // segue para 503
  }

  return res.status(503).json({
    error: 'Serviço de consulta de CNPJ indisponível no momento. Você pode continuar preenchendo os dados manualmente.',
    code: 'CNPJ_LOOKUP_UNAVAILABLE',
  });
});
