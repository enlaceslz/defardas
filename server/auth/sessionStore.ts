/**
 * DE FARDAS ERP — Session Store & Token Management
 * Sessões com identificadores criptograficamente seguros (CSPRNG), expiração
 * automática, suporte a cookies HttpOnly e persistência no PostgreSQL (core.sessions).
 * Correção P0-002: Persistência de sessões para sobrevivência a reinícios do servidor.
 */
import crypto from 'crypto';
import { AuthenticatedUser } from './rbac';
import { pool } from '../db/index';

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
    this.loadActiveSessionsFromDb();
    // Limpeza periódica de sessões expiradas a cada 30 minutos
    setInterval(() => this.cleanupExpired(), 30 * 60 * 1000).unref();
  }

  /**
   * Carrega sessões ativas do PostgreSQL para a memória durante inicialização do processo
   */
  public async loadActiveSessionsFromDb(): Promise<void> {
    try {
      const res = await pool.query<{
        token: string;
        user_id: string;
        user_role: string;
        user_full_name: string;
        user_email: string;
        created_at: Date;
        expires_at: Date;
        ip_address: string | null;
        user_agent: string | null;
      }>(`
        SELECT token, user_id, user_role, user_full_name, user_email, created_at, expires_at, ip_address, user_agent
        FROM core.sessions
        WHERE expires_at > NOW()
      `);

      for (const row of res.rows) {
        this.sessions.set(row.token, {
          token: row.token,
          user: {
            id: row.user_id,
            role: row.user_role as any,
            fullName: row.user_full_name,
            email: row.user_email,
          },
          createdAt: new Date(row.created_at),
          expiresAt: new Date(row.expires_at),
          ipAddress: row.ip_address || undefined,
          userAgent: row.user_agent || undefined,
        });
      }
      if (res.rows.length > 0) {
        console.log(`🔒 [AUTH] ${res.rows.length} sessões ativas carregadas com sucesso do PostgreSQL.`);
      }
    } catch {
      // Ignorar se a tabela core.sessions ainda não estiver migrada
    }
  }

  /**
   * Cria nova sessão para usuário autenticado e persiste no PostgreSQL
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

    // Persistência assíncrona no PostgreSQL
    pool.query(
      `INSERT INTO core.sessions (token, user_id, user_role, user_full_name, user_email, created_at, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (token) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
      [token, user.id, user.role, user.fullName, user.email, now, expiresAt, ipAddress || null, userAgent || null]
    ).catch(() => {});

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
      pool.query(`DELETE FROM core.sessions WHERE token = $1`, [token]).catch(() => {});
      return null;
    }

    return session;
  }

  /**
   * Destrói sessão (Logout)
   */
  public destroySession(token: string): boolean {
    if (!token) return false;
    const deleted = this.sessions.delete(token);
    pool.query(`DELETE FROM core.sessions WHERE token = $1`, [token]).catch(() => {});
    return deleted;
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
    pool.query(`DELETE FROM core.sessions WHERE user_id = $1`, [userId]).catch(() => {});
    return count;
  }

  /**
   * Remove sessões expiradas da memória e do banco
   */
  public cleanupExpired(): void {
    const now = new Date();
    for (const [token, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(token);
      }
    }
    pool.query(`DELETE FROM core.sessions WHERE expires_at <= NOW()`).catch(() => {});
  }

  /**
   * Contagem de sessões ativas
   */
  public get activeSessionsCount(): number {
    return this.sessions.size;
  }
}

export const sessionStore = new SessionStore();
