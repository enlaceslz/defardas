import { logOperationalError } from '../observability/errors';
import crypto from 'node:crypto';
import type { AuthenticatedUser } from './rbac';
import { query } from '../db/index';

export interface SessionRecord {
  token: string;
  user: AuthenticatedUser;
  createdAt: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

class SessionStore {
  private sessions = new Map<string, SessionRecord>();
  private readonly duration = 8 * 60 * 60 * 1000;
  private get persistent() { return process.env.NODE_ENV === 'production' || Boolean(process.env.DATABASE_URL); }

  constructor() {
    setInterval(() => { void this.cleanupExpired().catch((err) => logOperationalError('session_cleanup', err)); }, 30 * 60 * 1000).unref();
  }

  public async createSession(user: AuthenticatedUser, ipAddress?: string, userAgent?: string): Promise<SessionRecord> {
    const record: SessionRecord = {
      token: crypto.randomBytes(32).toString('hex'), user, createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.duration), ipAddress, userAgent,
    };
    if (this.persistent) {
      await query(`INSERT INTO core.sessions
        (token, user_id, user_role, user_full_name, user_email, created_at, expires_at, ip_address, user_agent)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [record.token, user.id, user.role, user.fullName, user.email, record.createdAt, record.expiresAt, ipAddress || null, userAgent?.slice(0, 255) || null]);
    } else {
      this.sessions.set(record.token, record);
    }
    return record;
  }

  public async getSession(token: string): Promise<SessionRecord | null> {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    if (this.persistent) {
      // Consulta autoritativa em cada pedido: logout e desativação valem em todas as instâncias.
      const result = await query(`SELECT s.created_at, s.expires_at, s.ip_address, s.user_agent,
        u.id, u.full_name, u.email, u.role FROM core.sessions s
        JOIN core.users u ON u.id = s.user_id
        WHERE s.token = $1 AND s.expires_at > NOW() AND u.is_active = TRUE`, [token]);
      const row = result.rows[0];
      if (!row) return null;
      return { token, user: { id: row.id, fullName: row.full_name, email: row.email, role: row.role },
        createdAt: new Date(row.created_at), expiresAt: new Date(row.expires_at),
        ipAddress: row.ip_address, userAgent: row.user_agent };
    }
    const session = this.sessions.get(token);
    if (!session || session.expiresAt <= new Date()) {
      this.sessions.delete(token);
      return null;
    }
    return session;
  }

  public async destroySession(token: string): Promise<boolean> {
    if (this.persistent) {
      const result = await query('DELETE FROM core.sessions WHERE token = $1', [token]);
      return (result.rowCount || 0) > 0;
    }
    return this.sessions.delete(token);
  }

  public async destroyAllUserSessions(userId: string): Promise<number> {
    if (this.persistent) {
      const result = await query('DELETE FROM core.sessions WHERE user_id = $1', [userId]);
      return result.rowCount || 0;
    }
    let count = 0;
    for (const [token, session] of this.sessions) {
      if (session.user.id === userId) { this.sessions.delete(token); count++; }
    }
    return count;
  }

  public async cleanupExpired(): Promise<void> {
    if (this.persistent) {
      await query('DELETE FROM core.sessions WHERE expires_at <= NOW()');
    } else {
      for (const [token, session] of this.sessions) {
        if (session.expiresAt <= new Date()) this.sessions.delete(token);
      }
    }
  }
}
export const sessionStore = new SessionStore();
