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
    if (!password || password.length < 6) {
      throw new Error('A senha deve conter no mínimo 6 caracteres.');
    }
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  /**
   * Compara senha informada com hash armazenado
   */
  public static async comparePassword(plainText: string, hash: string): Promise<boolean> {
    if (!plainText || !hash) return false;
    try {
      return await bcrypt.compare(plainText, hash);
    } catch (err) {
      console.error('[AUTH] Erro ao comparar hashes de senha:', err);
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
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasLetter || !hasNumber) {
      return { valid: false, reason: 'A senha deve conter letras e números.' };
    }
    return { valid: true };
  }
}
