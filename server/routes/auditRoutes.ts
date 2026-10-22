import { Router, Response } from 'express';
import { RequestWithUser } from '../auth/rbac';
import { auditService } from '../services/auditService';

export const auditRouter = Router();

// Consultar trilha de auditoria
auditRouter.get('/logs', (req: RequestWithUser, res: Response) => {
  const limit = Number(req.query.limit) || 100;
  const entityName = req.query.entityName as string;
  const entityId = req.query.entityId as string;

  if (entityName && entityId) {
    return res.json(auditService.getLogsForEntity(entityName, entityId));
  }

  res.json(auditService.getRecentLogs(limit));
});
