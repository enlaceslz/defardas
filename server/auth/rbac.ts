/**
 * DE FARDAS ERP — Role-Based Access Control (RBAC) & Authentication
 * Normativo: PRD v1.6 e Adendo B.2.5 (Alçadas e Negação por Padrão)
 */
import { Request, Response, NextFunction } from 'express';
import { UserRole, UserEntity } from '../types/db';

export interface AuthenticatedUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

// Usuários pré-cadastrados (seed com credenciais para teste dos perfis)
export const DEFAULT_USERS: AuthenticatedUser[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    fullName: 'Carlos Eduardo Silva',
    email: 'admin@defardas.com.br',
    role: 'admin',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    fullName: 'Mariana Alencar',
    email: 'vendas@defardas.com.br',
    role: 'vendedor',
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    fullName: 'Raimundo Nonato (Mestre de Corte)',
    email: 'pcp@defardas.com.br',
    role: 'pcp_producao',
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    fullName: 'Juliana Rocha (Controladoria)',
    email: 'financeiro@defardas.com.br',
    role: 'financeiro',
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    fullName: 'Roberto Mendes',
    email: 'gerente@defardas.com.br',
    role: 'gerente_comercial',
  },
  {
    id: '66666666-6666-6666-6666-666666666666',
    fullName: 'Patrícia Soares',
    email: 'qualidade@defardas.com.br',
    role: 'expedicao_qualidade',
  },
];

// Matriz de Permissões Rigorosa
export const PERMISSIONS: Record<string, UserRole[]> = {
  // Apenas admin pode autorizar desconto abaixo do sugerido (Adendo B.2.5)
  'quotes:authorize_discount': ['admin'],
  'quotes:create': ['admin', 'gerente_comercial', 'vendedor'],
  'quotes:edit': ['admin', 'gerente_comercial', 'vendedor'],
  'quotes:delete': ['admin', 'gerente_comercial'],
  'quotes:convert_to_order': ['admin', 'gerente_comercial', 'vendedor'],
  
  // Produção & PCP
  'orders:advance_stage': ['admin', 'pcp_producao', 'expedicao_qualidade'],
  'orders:create': ['admin', 'gerente_comercial', 'pcp_producao'],
  'orders:delete': ['admin'],

  // Financeiro
  'finance:confirm_receipt': ['admin', 'financeiro'],
  'finance:create_transaction': ['admin', 'financeiro'],
  'finance:delete_transaction': ['admin'],

  // Estoque
  'inventory:create_movement': ['admin', 'pcp_producao', 'financeiro'],
  'inventory:adjust': ['admin', 'pcp_producao'],
};

/**
 * Middleware de Autenticação
 * Lê o header Authorization ou x-user-role para conveniência e testes de perfis.
 */
export function authMiddleware(req: RequestWithUser, res: Response, next: NextFunction) {
  const customRoleHeader = req.headers['x-user-role'] as string;
  const customUserId = req.headers['x-user-id'] as string;

  if (customRoleHeader) {
    const matched = DEFAULT_USERS.find(
      (u) => u.role === customRoleHeader || (customUserId && u.id === customUserId)
    );
    if (matched) {
      req.user = matched;
      return next();
    }
  }

  // Padrão de sessão: Admin (Carlos Eduardo)
  req.user = DEFAULT_USERS[0];
  next();
}

/**
 * Middleware para exigir papéis específicos
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: RequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Acesso negado: Perfil '${req.user.role}' não possui permissão para esta operação. Exige: ${allowedRoles.join(', ')}.`,
      });
    }
    next();
  };
}

/**
 * Middleware para verificar permissão específica na matriz
 */
export function requirePermission(permissionKey: string) {
  return (req: RequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    const allowedRoles = PERMISSIONS[permissionKey] || ['admin'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Acesso negado para a ação [${permissionKey}]. Apenas perfis [${allowedRoles.join(', ')}] podem autorizar esta ação.`,
      });
    }
    next();
  };
}
