import { InputError } from '../validation/input';
import { logOperationalError } from '../observability/errors';
/**
 * DE FARDAS ERP — Password Service
 * Criptografia robusta de senhas utilizando bcrypt com salt rounds de alta segurança.
 */
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export class PasswordService {
  /**
   * Gera hash seguro para senha
   */
  public static async hashPassword(password: string): Promise<string> {
    const strength = this.validatePasswordStrength(password);
    if (!strength.valid) throw new InputError(strength.reason);
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  /**
   * Compara senha informada com hash armazenado
   */
  public static async comparePassword(plainText: string, hash: string): Promise<boolean> {
    // bcrypt ignora bytes após o 72º; login deve respeitar o limite da criação.
    if (typeof plainText !== 'string' || !plainText || !hash || Buffer.byteLength(plainText, 'utf8') > 72) return false;
    try {
      return await bcrypt.compare(plainText, hash);
    } catch (err) {
      logOperationalError('password_compare', err);
      return false;
    }
  }

  /**
   * Valida critérios de força da senha
   */
  public static validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
    if (!password || password.length < 8) {
      return { valid: false, reason: 'A senha deve conter no mínimo 8 caracteres.' };
    }
    if (Buffer.byteLength(password, 'utf8') > 72) {
      return { valid: false, reason: 'A senha deve conter no máximo 72 bytes em UTF-8.' };
    }
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasLetter || !hasNumber) {
      return { valid: false, reason: 'A senha deve conter letras e números.' };
    }
    return { valid: true };
  }
}
