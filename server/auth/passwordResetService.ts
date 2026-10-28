import crypto from 'node:crypto';
import { query } from '../db/index';
import { unitOfWork } from '../db/unitOfWork';
import { userRepository } from '../db/userRepository';
import { sessionStore } from './sessionStore';
import { PasswordService } from './passwordService';
import { auditService } from '../services/auditService';

const digest = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const persistent = () => process.env.NODE_ENV === 'production' || Boolean(process.env.DATABASE_URL);
type ResetRecord = { userId: string; expiresAt: number };

export class PasswordResetService {
  private tokens = new Map<string, ResetRecord>();

  // A emissão não entrega mensagens. O chamador deve usar um canal homologado.
  async issue(userId: string): Promise<string | null> {
    return unitOfWork(async () => {
      const user = await userRepository.findById(userId);
      if (!user?.isActive) return null;
      const token = crypto.randomBytes(32).toString('hex');
      const hash = digest(token);
      const expiresAt = Date.now() + 60 * 60 * 1000;
      if (persistent()) {
        await query('DELETE FROM core.password_reset_tokens WHERE user_id=$1 OR expires_at <= NOW()', [userId]);
        await query('INSERT INTO core.password_reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,$3)',
          [hash, userId, new Date(expiresAt)]);
      } else {
        for (const [key, record] of this.tokens) {
          if (record.userId === userId || record.expiresAt <= Date.now()) this.tokens.delete(key);
        }
        this.tokens.set(hash, { userId, expiresAt });
      }
      return token;
    });
  }

  async reset(token: string, newPassword: string, ipAddress?: string): Promise<boolean> {
    if (!/^[a-f0-9]{64}$/.test(token)) return false;
    const strength = PasswordService.validatePasswordStrength(newPassword);
    if (!strength.valid) throw new Error(strength.reason);
    // Trabalho bcrypt fora do lock; token só é consumido junto com a troca efetiva.
    const passwordHash = await PasswordService.hashPassword(newPassword);
    return unitOfWork(async () => {
      const hash = digest(token);
      let record: ResetRecord | undefined;
      if (persistent()) {
        const result = await query(`SELECT user_id FROM core.password_reset_tokens
          WHERE token_hash=$1 AND expires_at > NOW() FOR UPDATE`, [hash]);
        if (result.rows[0]) record = { userId: result.rows[0].user_id, expiresAt: 0 };
      } else {
        record = this.tokens.get(hash);
        if (record && record.expiresAt <= Date.now()) record = undefined;
      }
      if (!record) return false;
      return this.applyPassword(record.userId, passwordHash, 'PASSWORD_RESET_COMPLETED', ipAddress);
    });
  }

  // Recuperação administrativa por acesso ao host, sem expor tokens nem enviar e-mail.
  async resetByEmail(email: string, newPassword: string): Promise<boolean> {
    const strength = PasswordService.validatePasswordStrength(newPassword);
    if (!strength.valid) throw new Error(strength.reason);
    const passwordHash = await PasswordService.hashPassword(newPassword);
    return unitOfWork(async () => {
      const user = await userRepository.findByEmail(email);
      if (!user?.isActive) return false;
      return this.applyPassword(user.id, passwordHash, 'PASSWORD_RESET_BY_OPERATOR');
    });
  }

  private async applyPassword(userId: string, passwordHash: string, action: string, ipAddress?: string): Promise<boolean> {
    const user = await userRepository.findById(userId);
    if (!user?.isActive) return false;
    // Auditoria e revogação participam da mesma transação PostgreSQL.
    await auditService.log({ actorName: action === 'PASSWORD_RESET_BY_OPERATOR' ? 'Operador CLI' : user.email,
      actorRole: action === 'PASSWORD_RESET_BY_OPERATOR' ? 'system' : 'usuario',
      entityName: 'auth', entityId: user.id, action, ipAddress,
      notes: 'Redefinição de senha e revogação de todas as sessões e tokens de recuperação.' });
    if (persistent()) {
      const result = await query('UPDATE core.users SET password_hash=$1, updated_at=NOW() WHERE id=$2 AND is_active=TRUE', [passwordHash, user.id]);
      if (!result.rowCount) throw new Error('Usuário indisponível durante redefinição.');
      await query('DELETE FROM core.sessions WHERE user_id=$1', [user.id]);
      await query('DELETE FROM core.password_reset_tokens WHERE user_id=$1', [user.id]);
    } else {
      await sessionStore.destroyAllUserSessions(user.id);
      userRepository.setLocalPasswordHash(user.id, passwordHash);
      for (const [key, record] of this.tokens) if (record.userId === user.id) this.tokens.delete(key);
    }
    return true;
  }
}

export const passwordResetService = new PasswordResetService();
