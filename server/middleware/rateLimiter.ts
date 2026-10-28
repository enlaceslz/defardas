/**
 * DE FARDAS ERP — Rate Limiting Middleware
 * Proteção contra ataques de força bruta e abusos em rotas sensíveis de autenticação.
 */
import { Request, Response, NextFunction } from 'express';
import { auditService } from '../services/auditService';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

export interface RateLimiterOptions {
  windowMs: number;       // Janela de tempo em milissegundos
  maxRequests: number;    // Máximo de requisições por janela
  message: string;        // Mensagem de erro em caso de bloqueio
  actionName?: string;    // Nome da ação para o log de auditoria
}

export class InMemoryRateLimiter {
  private records: Map<string, RateLimitRecord> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(private options: RateLimiterOptions) {
    // Limpeza periódica de registros expirados a cada minuto
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, record] of this.records.entries()) {
      if (now > record.resetTime) {
        this.records.delete(key);
      }
    }
  }

  public middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const ip = req.ip ||
                 req.socket.remoteAddress ||
                 'unknown';

      const key = `${req.path}:${ip}`;
      const now = Date.now();
      const record = this.records.get(key);

      if (!record || now > record.resetTime) {
        this.records.set(key, {
          count: 1,
          resetTime: now + this.options.windowMs,
        });
        res.setHeader('X-RateLimit-Limit', this.options.maxRequests);
        res.setHeader('X-RateLimit-Remaining', this.options.maxRequests - 1);
        return next();
      }

      if (record.count >= this.options.maxRequests) {
        const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
        res.setHeader('Retry-After', retryAfterSeconds);
        res.setHeader('X-RateLimit-Limit', this.options.maxRequests);
        res.setHeader('X-RateLimit-Remaining', 0);

        // Registro de incidente de segurança na trilha de auditoria
        auditService.log({
          actorName: `IP:${ip}`,
          actorRole: 'unauthenticated',
          entityName: 'security_rate_limit',
          entityId: ip,
          action: 'AUTH_RATE_LIMIT_EXCEEDED',
          notes: `Bloqueio por excesso de requisições (${record.count + 1}/${this.options.maxRequests}) em ${req.path}. Tente em ${retryAfterSeconds}s.`,
          ipAddress: ip,
        });

        return res.status(429).json({
          error: this.options.message,
          retryAfter: retryAfterSeconds,
          code: 'RATE_LIMIT_EXCEEDED',
        });
      }

      record.count += 1;
      res.setHeader('X-RateLimit-Limit', this.options.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, this.options.maxRequests - record.count));
      next();
    };
  }
}

// Limitador de autenticação (Login): máximo 10 tentativas por minuto por IP
export const authRateLimiter = new InMemoryRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  message: 'Muitas tentativas de autenticação a partir deste endereço IP. Aguarde 60 segundos antes de tentar novamente.',
  actionName: 'AUTH_LOGIN_RATE_LIMIT',
}).middleware();

// Limitador de recuperação de senha: máximo 5 tentativas a cada 15 minutos por IP
export const passwordRecoveryRateLimiter = new InMemoryRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  message: 'Muitas solicitações de recuperação de senha. Por segurança, aguarde alguns minutos.',
  actionName: 'AUTH_RECOVERY_RATE_LIMIT',
}).middleware();
