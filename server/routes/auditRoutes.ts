import { Router, Response } from 'express';
import { RequestWithUser, requirePermission } from '../auth/rbac';
import { auditService } from '../services/auditService';

export const auditRouter = Router();

// Apenas administradores autenticados podem consultar trilha de auditoria
auditRouter.use(requirePermission('system:view_audit'));

// Consultar trilha de auditoria
auditRouter.get('/logs', async (req: RequestWithUser, res: Response) => {
  const limit = Number(req.query.limit) || 100;
  const entityName = req.query.entityName as string;
  const entityId = req.query.entityId as string;

  if (entityName && entityId) {
    return res.json(await auditService.getRecentLogs(limit, entityName, entityId));
  }

  res.json(await auditService.getRecentLogs(limit));
});
