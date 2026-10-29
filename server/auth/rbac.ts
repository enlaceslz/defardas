/**
 * DE FARDAS ERP — Role-Based Access Control (RBAC) & Authentication Middleware
 * Normativo: PRD v1.6 e Adendos B.2.1, B.2.5 (Alçadas e Negação por Padrão)
 * 
 * Regras Absolutas de Segurança:
 * 1. Não aceita cabeçalhos manipulados pelo cliente (x-user-role / x-user-id).
 * 2. Não possui administrador automático nem identidade padrão.
 * 3. Autenticação obrigatória com tokens de sessão validados pelo backend.
 * 4. Retorna HTTP 401 para requisições não autenticadas e HTTP 403 para acessos sem alçada.
 * 5. Registra tentativas de acesso não autorizado na trilha de auditoria.
 */
import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types/db';
import { sessionStore } from './sessionStore';
import { auditService } from '../services/auditService';
import { securityRequestContext } from '../observability/requestContext';

export interface AuthenticatedUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
  sessionToken?: string;
}

// Matriz de Permissões Rigorosa (PRD v1.6 e Adendo B.2.5)
export const PERMISSIONS: Record<string, UserRole[]> = {
  // Apenas admin pode autorizar desconto abaixo do preço sugerido (Adendo B.2.5)
  'quotes:authorize_discount': ['admin'],
  'quotes:create': ['admin', 'gerente_comercial', 'vendedor'],
  'quotes:edit': ['admin', 'gerente_comercial', 'vendedor'],
  'quotes:delete': ['admin', 'gerente_comercial'],
  'quotes:convert_to_order': ['admin', 'gerente_comercial', 'vendedor'],
  
  // Produção & PCP
  'orders:advance_stage': ['admin', 'pcp_producao', 'expedicao_qualidade'],
  'orders:create': ['admin', 'gerente_comercial', 'pcp_producao'],
  'orders:delete': ['admin'],
  'orders:approve_art': ['admin', 'gerente_comercial', 'vendedor', 'pcp_producao'],

  // Financeiro (Quitação de sinal e baixas)
  'finance:confirm_receipt': ['admin', 'financeiro'],
  'finance:create_transaction': ['admin', 'financeiro'],
  'finance:delete_transaction': ['admin'],

  // Estoque & Tecidoteca
  'inventory:create_movement': ['admin', 'pcp_producao', 'financeiro'],
  'inventory:adjust': ['admin', 'pcp_producao'],
  'inventory:manage_items': ['admin', 'pcp_producao'],

  // CRM & Clientes
  'crm:manage_clients': ['admin', 'gerente_comercial', 'vendedor'],
  'crm:view_leads': ['admin', 'gerente_comercial', 'vendedor'],
  
  // Auditoria e Migração
  'system:view_audit': ['admin'],
  'system:import_data': ['admin'],
};

/**
 * Middleware de Autenticação
 * Extrai o token de sessão exclusivamente a partir do cookie HttpOnly (defardas_session)
 * ou do cabeçalho padronizado Authorization (Bearer <token>).
 * NUNCA aceita 'x-user-role' ou 'x-user-id'.
 * NUNCA atribui administrador por padrão.
 */
export async function authMiddleware(req: RequestWithUser, _res: Response, next: NextFunction) {
  let token: string | undefined;

  // 1. Tentar ler do cookie seguro HttpOnly
  if (req.cookies && req.cookies.defardas_session) {
    token = req.cookies.defardas_session;
  }

  // 2. Tentar ler do cabeçalho padrão Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  if (token) {
    const session = await sessionStore.getSession(token);
    if (session) {
      req.user = session.user;
      req.sessionToken = token;
      return next();
    }
  }

  // Se não houver token ou for inválido, req.user permanece undefined (não autenticado)
  req.user = undefined;
  req.sessionToken = undefined;
  next();
}

/**
 * Middleware para exigir usuário autenticado
 * Retorna HTTP 401 caso não haja sessão válida
 */
export async function requireAuth(req: RequestWithUser, res: Response, next: NextFunction) {
  if (!req.user) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const context = securityRequestContext(req);
    await auditService.log({
      actorName: 'Anônimo / Não Autenticado',
      actorRole: 'unauthenticated',
      entityName: 'security',
      entityId: context.route,
      action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
      notes: `Tentativa de acesso não autenticado bloqueada na rota [${context.method} ${context.route}] a partir de IP ${ip}.`,
      ipAddress: ip,
    });

    return res.status(401).json({
      error: 'Não autenticado. Por favor, realize o login para acessar este recurso.',
      code: 'UNAUTHENTICATED',
    });
  }
  next();
}

/**
 * Middleware para exigir perfis específicos (RBAC)
 * Retorna HTTP 401 se não autenticado e HTTP 403 se não autorizado
 */
export function requireRole(allowedRoles: UserRole[]) {
  return async (req: RequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Não autenticado. Por favor, realize o login para acessar este recurso.',
        code: 'UNAUTHENTICATED',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const context = securityRequestContext(req);
      await auditService.log({
        actorId: req.user.id,
        actorName: req.user.fullName,
        actorRole: req.user.role,
        entityName: 'security',
        entityId: context.route,
        action: 'FORBIDDEN_ACCESS_ATTEMPT',
        notes: `Acesso negado para o perfil [${req.user.role}] na rota [${context.method} ${context.route}]. Operação restrita a: [${allowedRoles.join(', ')}].`,
        ipAddress: ip,
      });

      return res.status(403).json({
        error: `Acesso negado: Perfil '${req.user.role}' não possui permissão para esta operação. Perfis autorizados: ${allowedRoles.join(', ')}.`,
        code: 'FORBIDDEN',
        requiredRoles: allowedRoles,
      });
    }

    next();
  };
}

/**
 * Middleware para verificar permissão específica na matriz de governança do PRD
 */
export function requirePermission(permissionKey: string) {
  return async (req: RequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Não autenticado. Por favor, realize o login para acessar este recurso.',
        code: 'UNAUTHENTICATED',
      });
    }

    const allowedRoles = PERMISSIONS[permissionKey] || [];
    if (!allowedRoles.includes(req.user.role)) {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      await auditService.log({
        actorId: req.user.id,
        actorName: req.user.fullName,
        actorRole: req.user.role,
        entityName: 'security',
        entityId: permissionKey,
        action: 'PERMISSION_DENIED',
        notes: `Usuário '${req.user.fullName}' (${req.user.role}) tentou executar ação restrita [${permissionKey}] sem alçada suficiente.`,
        ipAddress: ip,
      });

      return res.status(403).json({
        error: `Acesso negado para a ação restrita [${permissionKey}]. Apenas perfis [${allowedRoles.join(', ')}] podem autorizar esta operação.`,
        code: 'FORBIDDEN',
        permission: permissionKey,
        authorizedRoles: allowedRoles,
      });
    }

    next();
  };
}
