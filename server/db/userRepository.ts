/**
 * DE FARDAS ERP — User Repository & Persistence
 * Persistência e gerenciamento de usuários no PostgreSQL (schema core.users)
 * com fallback transacional e senhas protegidas com bcrypt.
 */
import { UserEntity, UserRole } from '../types/db';
import { PasswordService } from '../auth/passwordService';
import { db } from './connection';
import crypto from 'crypto';

export interface CreateUserData {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface PasswordResetTokenRecord {
  token: string;
  userId: string;
  email: string;
  expiresAt: Date;
}

const isProd = process.env.NODE_ENV === 'production';

// Senha padrão estritamente para ambiente de desenvolvimento/testes locais (Dev Seed)
// Em produção, as senhas devem ser configuradas via variáveis de ambiente ou migração
export const DEV_DEFAULT_PASSWORD = isProd ? '' : (process.env.ERP_DEV_PASSWORD || 'DeFardas@2026!');

class UserRepository {
  private users: Map<string, UserEntity> = new Map();
  private resetTokens: Map<string, PasswordResetTokenRecord> = new Map();
  private initPromise: Promise<void> | null = null;

  constructor() {
    if (!isProd) {
      this.initPromise = this.initUsers();
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  /**
   * Inicializa usuários padrão do sistema com senhas criptografadas em bcrypt (apenas DEV)
   */
  private async initUsers() {
    if (isProd) return;

    // Gerar hash para a credencial inicial segura
    const defaultHash = await PasswordService.hashPassword(DEV_DEFAULT_PASSWORD);

    const initialUsers: Omit<UserEntity, 'createdAt' | 'updatedAt'>[] = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        fullName: 'Carlos Eduardo Silva',
        email: 'admin@defardas.com.br',
        passwordHash: defaultHash,
        role: 'admin',
        isActive: true,
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        fullName: 'Mariana Alencar',
        email: 'vendas@defardas.com.br',
        passwordHash: defaultHash,
        role: 'vendedor',
        isActive: true,
      },
      {
        id: '33333333-3333-3333-3333-333333333333',
        fullName: 'Raimundo Nonato (Mestre de Corte)',
        email: 'pcp@defardas.com.br',
        passwordHash: defaultHash,
        role: 'pcp_producao',
        isActive: true,
      },
      {
        id: '44444444-4444-4444-4444-444444444444',
        fullName: 'Juliana Rocha (Controladoria)',
        email: 'financeiro@defardas.com.br',
        passwordHash: defaultHash,
        role: 'financeiro',
        isActive: true,
      },
      {
        id: '55555555-5555-5555-5555-555555555555',
        fullName: 'Roberto Mendes',
        email: 'gerente@defardas.com.br',
        passwordHash: defaultHash,
        role: 'gerente_comercial',
        isActive: true,
      },
      {
        id: '66666666-6666-6666-6666-666666666666',
        fullName: 'Patrícia Soares',
        email: 'qualidade@defardas.com.br',
        passwordHash: defaultHash,
        role: 'expedicao_qualidade',
        isActive: true,
      },
    ];

    const now = new Date().toISOString();
    for (const u of initialUsers) {
      this.users.set(u.id, {
        ...u,
        createdAt: now,
        updatedAt: now,
      });
    }

    console.log(`🔐 [AUTH] Repositório de usuários DEV inicializado com ${this.users.size} contas protegidas por bcrypt.`);
  }

  /**
   * Busca usuário por email
   */
  public async findByEmail(email: string): Promise<UserEntity | null> {
    await this.ensureInitialized();
    const normalized = email.trim().toLowerCase();

    // Se conectado ao PostgreSQL real, consulta tabela core.users como fonte única da verdade
    if (db.isConnected() && db.getPool()) {
      try {
        const pool = db.getPool()!;
        const res = await pool.query(
          'SELECT id, full_name, email, password_hash, role, is_active, created_at, updated_at FROM core.users WHERE LOWER(email) = $1',
          [normalized]
        );
        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
            id: row.id,
            fullName: row.full_name,
            email: row.email,
            passwordHash: row.password_hash,
            role: row.role as UserRole,
            isActive: row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          };
        }
        // Em produção com PostgreSQL ativo, NUNCA recorrer a seed de desenvolvimento
        if (isProd) {
          return null;
        }
      } catch (err) {
        console.warn('[AUTH] Falha ao consultar PostgreSQL para usuário:', err);
        if (isProd) return null;
      }
    }

    // Consulta repositório transacional local (DEV)
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === normalized) {
        return u;
      }
    }
    return null;
  }

  /**
   * Busca usuário por ID
   */
  public async findById(id: string): Promise<UserEntity | null> {
    await this.ensureInitialized();
    if (db.isConnected() && db.getPool()) {
      try {
        const pool = db.getPool()!;
        const res = await pool.query(
          'SELECT id, full_name, email, password_hash, role, is_active, created_at, updated_at FROM core.users WHERE id = $1',
          [id]
        );
        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
            id: row.id,
            fullName: row.full_name,
            email: row.email,
            passwordHash: row.password_hash,
            role: row.role as UserRole,
            isActive: row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          };
        }
        if (isProd) return null;
      } catch (err) {
        console.warn('[AUTH] Falha ao consultar PostgreSQL para usuário por ID:', err);
        if (isProd) return null;
      }
    }

    return this.users.get(id) || null;
  }

  /**
   * Lista todos os usuários (sem expor o hash da senha)
   */
  public async listAll(): Promise<Omit<UserEntity, 'passwordHash'>[]> {
    if (db.isConnected() && db.getPool()) {
      try {
        const pool = db.getPool()!;
        const res = await pool.query(
          'SELECT id, full_name, email, role, is_active, created_at, updated_at FROM core.users ORDER BY full_name ASC'
        );
        return res.rows.map((row) => ({
          id: row.id,
          fullName: row.full_name,
          email: row.email,
          role: row.role as UserRole,
          isActive: row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
      } catch (err) {
        console.warn('[AUTH] Falha ao listar usuários do PostgreSQL:', err);
      }
    }

    return Array.from(this.users.values()).map(({ passwordHash, ...rest }) => rest);
  }

  /**
   * Cria novo usuário com hash de senha
   */
  public async createUser(data: CreateUserData): Promise<UserEntity> {
    const existing = await this.findByEmail(data.email);
    if (existing) {
      throw new Error(`O email ${data.email} já está cadastrado no sistema.`);
    }

    const passwordHash = await PasswordService.hashPassword(data.password);
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();

    const newUser: UserEntity = {
      id: userId,
      fullName: data.fullName,
      email: data.email.trim().toLowerCase(),
      passwordHash,
      role: data.role,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    if (db.isConnected() && db.getPool()) {
      try {
        const pool = db.getPool()!;
        await pool.query(
          `INSERT INTO core.users (id, full_name, email, password_hash, role, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [newUser.id, newUser.fullName, newUser.email, newUser.passwordHash, newUser.role, newUser.isActive, newUser.createdAt, newUser.updatedAt]
        );
      } catch (err) {
        console.error('[AUTH] Falha ao persistir usuário no PostgreSQL:', err);
      }
    }

    this.users.set(newUser.id, newUser);
    return newUser;
  }

  /**
   * Atualiza senha do usuário
   */
  public async updatePassword(userId: string, newPassword: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user) return false;

    const passwordHash = await PasswordService.hashPassword(newPassword);
    const now = new Date().toISOString();

    if (db.isConnected() && db.getPool()) {
      try {
        const pool = db.getPool()!;
        await pool.query(
          'UPDATE core.users SET password_hash = $1, updated_at = $2 WHERE id = $3',
          [passwordHash, now, userId]
        );
      } catch (err) {
        console.error('[AUTH] Erro ao atualizar senha no PostgreSQL:', err);
      }
    }

    user.passwordHash = passwordHash;
    user.updatedAt = now;
    this.users.set(user.id, user);
    return true;
  }

  /**
   * Gera token seguro para recuperação de senha
   */
  public createPasswordResetToken(userId: string, email: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora de validade
    this.resetTokens.set(token, {
      token,
      userId,
      email,
      expiresAt,
    });
    return token;
  }

  /**
   * Valida e consome token de recuperação de senha
   */
  public consumePasswordResetToken(token: string): PasswordResetTokenRecord | null {
    const record = this.resetTokens.get(token);
    if (!record) return null;
    if (new Date() > record.expiresAt) {
      this.resetTokens.delete(token);
      return null;
    }
    this.resetTokens.delete(token);
    return record;
  }
}

export const userRepository = new UserRepository();
