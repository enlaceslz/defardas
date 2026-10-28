/**
 * DE FARDAS ERP — CSRF Protection Middleware
 * Proteção contra Cross-Site Request Forgery (CSRF) para métodos mutativos.
 * Utiliza o padrão Double Submit Cookie criptografado com cabeçalho X-CSRF-Token.
 */
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const isProd = process.env.NODE_ENV === 'production';
export const CSRF_COOKIE_NAME = 'defardas_csrf_token';
export const CSRF_HEADER_NAME = 'x-csrf-token';

// Rotas isentas de validação CSRF (ingestão pública de leads e fluxos iniciais de recuperação)
const EXEMPT_PATHS = [
  '/api/leads',                   // Formulário público de solicitação de cotação na landing page
  '/api/auth/login',               // Autenticação inicial (gera o token CSRF na resposta)
  '/api/auth/recover-password',    // Recuperação pública de senha
  '/api/auth/reset-password',      // Redefinição de senha com token de e-mail
  '/api/auth/csrf-token',          // Endpoint de emissão do token
  '/api/communication/webhooks',  // Webhooks externos de WhatsApp (Meta Cloud API e WA-AKG)
];

/**
 * Gera um token CSRF criptograficamente seguro (64 caracteres hexadecimais)
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Middleware que garante a presença do cookie CSRF em requisições GET/HEAD
 * e valida a correspondência do cabeçalho X-CSRF-Token em requisições mutativas.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Garantir que todo cliente receba um token CSRF se ainda não possuir
  let currentToken = req.cookies?.[CSRF_COOKIE_NAME];
  if (!currentToken) {
    currentToken = generateCsrfToken();
    res.cookie(CSRF_COOKIE_NAME, currentToken, {
      httpOnly: false, // Permite leitura pela aplicação frontend para inclusão nos cabeçalhos
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60 * 1000, // 8 horas (alinhado com o tempo de sessão)
    });
  }

  // Métodos seguros (leitura) não exigem validação CSRF
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Verificar se o caminho está na lista de exceções
  const isExempt = EXEMPT_PATHS.some((path) => req.path.startsWith(path));
  if (isExempt) {
    return next();
  }

  // Obter token do cabeçalho
  const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;

  if (!headerToken) {
    return res.status(403).json({
      error: 'Proteção CSRF: Cabeçalho X-CSRF-Token ausente.',
      code: 'CSRF_TOKEN_MISSING',
    });
  }

  // Comparação em tempo constante para prevenir timing attacks
  try {
    const headerBuffer = Buffer.from(headerToken);
    const cookieBuffer = Buffer.from(currentToken);

    if (headerBuffer.length !== cookieBuffer.length || !crypto.timingSafeEqual(headerBuffer, cookieBuffer)) {
      return res.status(403).json({
        error: 'Proteção CSRF: Token CSRF inválido ou expirado.',
        code: 'CSRF_TOKEN_INVALID',
      });
    }
  } catch (err) {
    return res.status(403).json({
      error: 'Proteção CSRF: Erro na validação de segurança.',
      code: 'CSRF_VALIDATION_ERROR',
    });
  }

  next();
}
