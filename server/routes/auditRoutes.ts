import { Router, Response } from 'express';
import { RequestWithUser, requirePermission } from '../auth/rbac';
import { auditService } from '../services/auditService';
import { InputError, text } from '../validation/input';

export const auditRouter = Router();

// Apenas administradores autenticados podem consultar trilha de auditoria
auditRouter.use(requirePermission('system:view_audit'));

// Consultar trilha de auditoria
auditRouter.get('/logs', async (req: RequestWithUser, res: Response) => {
  const rawLimit = req.query.limit;
  if (rawLimit !== undefined && (typeof rawLimit !== 'string' || !/^[1-9]\d*$/.test(rawLimit) || Number(rawLimit) > 500)) {
    throw new InputError('Limite deve ser um inteiro de 1 a 500.');
  }
  const limit = rawLimit === undefined ? 100 : Number(rawLimit);
  const hasName = req.query.entityName !== undefined;
  const hasId = req.query.entityId !== undefined;
  if (hasName !== hasId) throw new InputError('Informe entidade e identificador juntos.');

  if (hasName) {
    const entityName = text(req.query.entityName, 'Entidade', 60);
    const entityId = text(req.query.entityId, 'Identificador', 60);
    return res.json(await auditService.getRecentLogs(limit, entityName, entityId));
  }

  res.json(await auditService.getRecentLogs(limit));
});
