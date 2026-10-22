import { Router, Response } from 'express';
import { RequestWithUser, DEFAULT_USERS } from '../auth/rbac';
import { auditService } from '../services/auditService';

export const authRouter = Router();

// Retorna dados do usuário atualmente autenticado
authRouter.get('/me', (req: RequestWithUser, res: Response) => {
  res.json({
    user: req.user,
    availableRoles: DEFAULT_USERS.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      role: u.role,
    })),
  });
});

// Lista todos os usuários cadastrados
authRouter.get('/users', (req: RequestWithUser, res: Response) => {
  res.json(DEFAULT_USERS);
});

// Troca de usuário / perfil (simulador para testes de alçadas e RBAC)
authRouter.post('/switch-role', (req: RequestWithUser, res: Response) => {
  const { role, userId } = req.body;
  const target = DEFAULT_USERS.find((u) => u.role === role || u.id === userId);
  if (!target) {
    return res.status(404).json({ error: 'Usuário ou perfil não encontrado' });
  }

  auditService.log({
    actorId: target.id,
    actorName: target.fullName,
    actorRole: target.role,
    entityName: 'auth',
    entityId: target.id,
    action: 'SWITCH_ROLE',
    notes: `Sessão alterada para perfil [${target.role}] - ${target.fullName}`,
  });

  res.json({
    success: true,
    user: target,
  });
});
