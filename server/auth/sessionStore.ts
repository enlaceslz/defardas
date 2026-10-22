/**
 * DE FARDAS ERP — Session Store & Token Management
 * Sessões com identificadores criptograficamente seguros (CSPRNG), expiração
 * automática e suporte a cookies HttpOnly ou cabeçalhos Bearer.
 */
import crypto from 'crypto';
import { AuthenticatedUser } from './rbac';

export interface SessionRecord {
  token: string;
  user: AuthenticatedUser;
  createdAt: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

class SessionStore {
  private sessions: Map<string, SessionRecord> = new Map();
  // Duração padrão da sessão: 8 horas (jornada de trabalho fabril)
  private readonly SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

  constructor() {
    // Limpeza periódica de sessões expiradas a cada 30 minutos
    setInterval(() => this.cleanupExpired(), 30 * 60 * 1000).unref();
  }

  /**
   * Cria nova sessão para usuário autenticado
   */
  public createSession(user: AuthenticatedUser, ipAddress?: string, userAgent?: string): SessionRecord {
    // Gera token de 256 bits com entropia criptográfica
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.SESSION_DURATION_MS);

    const record: SessionRecord = {
      token,
      user,
      createdAt: now,
      expiresAt,
      ipAddress,
      userAgent,
    };

    this.sessions.set(token, record);
    return record;
  }

  /**
   * Recupera sessão válida pelo token
   */
  public getSession(token: string): SessionRecord | null {
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session) return null;

    // Verificar expiração
    if (new Date() > session.expiresAt) {
      this.sessions.delete(token);
      return null;
    }

    return session;
  }

  /**
   * Destrói sessão (Logout)
   */
  public destroySession(token: string): boolean {
    if (!token) return false;
    return this.sessions.delete(token);
  }

  /**
   * Invalida todas as sessões ativas de determinado usuário (ex: troca de senha)
   */
  public destroyAllUserSessions(userId: string): number {
    let count = 0;
    for (const [token, session] of this.sessions.entries()) {
      if (session.user.id === userId) {
        this.sessions.delete(token);
        count++;
      }
    }
    return count;
  }

  /**
   * Remove sessões expiradas da memória
   */
  public cleanupExpired(): void {
    const now = new Date();
    for (const [token, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(token);
      }
    }
  }

  /**
   * Contagem de sessões ativas (para métricas e diagnósticos)
   */
  public get activeSessionsCount(): number {
    return this.sessions.size;
  }
}

export const sessionStore = new SessionStore();
