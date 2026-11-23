/**
 * DE FARDAS ERP — Artwork Upload & URL Security Validation Service
 * Previne XSS armazenado (bloqueia SVG/HTML/JS), SSRF (bloqueia loopback/IPs privados)
 * e uploads excessivos no armazenamento de artes e layouts de uniformes.
 */

export type SafeArtworkMimeType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'application/pdf'
  | 'external_link';

export interface ValidatedArtworkResult {
  fileName: string;
  fileUrl: string;
  mimeType: SafeArtworkMimeType;
  fileSizeBytes?: number;
}

const MAX_ARTWORK_BYTES = 4 * 1024 * 1024; // 4 MB decodificado

const DATA_URL_REGEX =
  /^data:(image\/png|image\/jpeg|image\/webp|application\/pdf);base64,([A-Za-z0-9+/=\s]+)$/;

const PRIVATE_OR_LOCAL_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^\[::1\]$/,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /\.local$/i,
  /\.internal$/i,
];

export function sanitizeArtworkFileName(rawName: unknown, fallbackExt = 'png'): string {
  const cleaned = String(rawName || '')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();

  if (!cleaned) {
    return `arte-layout.${fallbackExt}`;
  }

  return cleaned.slice(0, 120);
}

export function validateArtworkPayload(input: {
  fileName?: unknown;
  fileUrl?: unknown;
}): { ok: true; data: ValidatedArtworkResult } | { ok: false; error: string } {
  const rawUrl = typeof input.fileUrl === 'string' ? input.fileUrl.trim() : '';

  if (!rawUrl) {
    return {
      ok: false,
      error: 'Arquivo ou link da arte é obrigatório. Envie uma imagem (PNG, JPG, WebP), PDF ou link HTTPS seguro.',
    };
  }

  // 1. Caso seja Data URL (upload direto em Base64)
  if (rawUrl.toLowerCase().startsWith('data:')) {
    const match = DATA_URL_REGEX.exec(rawUrl);
    if (!match) {
      return {
        ok: false,
        error:
          'Formato de arquivo não permitido por segurança. Utilize apenas imagens PNG, JPG, WebP ou documentos PDF (arquivos SVG/HTML não são permitidos).',
      };
    }

    const mimeType = match[1] as Exclude<SafeArtworkMimeType, 'external_link'>;
    const base64Body = match[2].replace(/\s+/g, '');

    if (base64Body.length === 0) {
      return { ok: false, error: 'O arquivo enviado está vazio.' };
    }

    const padding = base64Body.endsWith('==') ? 2 : base64Body.endsWith('=') ? 1 : 0;
    const decodedBytes = Math.floor((base64Body.length * 3) / 4) - padding;

    if (decodedBytes <= 0) {
      return { ok: false, error: 'Conteúdo base64 da arte é inválido.' };
    }

    if (decodedBytes > MAX_ARTWORK_BYTES) {
      return {
        ok: false,
        error: 'O arquivo da arte excede o limite máximo permitido de 4 MB.',
      };
    }

    const extMap: Record<Exclude<SafeArtworkMimeType, 'external_link'>, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
    };

    return {
      ok: true,
      data: {
        fileName: sanitizeArtworkFileName(input.fileName, extMap[mimeType]),
        fileUrl: `data:${mimeType};base64,${base64Body}`,
        mimeType,
        fileSizeBytes: decodedBytes,
      },
    };
  }

  // 2. Caso seja URL externa — permitir exclusivamente HTTPS público seguro
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      ok: false,
      error: 'URL da arte inválida. Utilize um arquivo PNG/JPG/WebP/PDF ou um link HTTPS válido.',
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      ok: false,
      error: 'Apenas links seguros com protocolo https:// são permitidos para referência de artes.',
    };
  }

  const host = parsed.hostname.toLowerCase();
  if (PRIVATE_OR_LOCAL_HOST_PATTERNS.some((re) => re.test(host))) {
    return {
      ok: false,
      error: 'Endereços locais ou de rede interna não são permitidos como link de arte.',
    };
  }

  if (rawUrl.length > 2048) {
    return { ok: false, error: 'A URL informada excede o limite máximo de 2048 caracteres.' };
  }

  const lowerPath = parsed.pathname.toLowerCase();
  if (lowerPath.endsWith('.svg') || lowerPath.endsWith('.html') || lowerPath.endsWith('.htm') || lowerPath.endsWith('.js')) {
    return {
      ok: false,
      error: 'Links diretos para arquivos SVG, HTML ou scripts não são permitidos por política de segurança.',
    };
  }

  return {
    ok: true,
    data: {
      fileName: sanitizeArtworkFileName(input.fileName || parsed.pathname.split('/').pop(), 'link'),
      fileUrl: parsed.toString(),
      mimeType: 'external_link',
    },
  };
}
