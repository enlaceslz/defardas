/**
 * DE FARDAS ERP — Reports & Shareable Links Routes
 * Endpoints para geração auditável de links compartilháveis (WhatsApp/Web)
 * e visualização externa somente leitura com impressão em PDF.
 */
import { Router, Request, Response } from 'express';
import { PERMISSIONS, RequestWithUser, requireAuth, requirePermission } from '../auth/rbac';
import {
  ReportDomain,
  reportShareService,
  sanitizeSnapshotPayload,
} from '../services/reportShareService';

export const reportsRouter = Router();

const DOMAIN_PERMISSION_MAP: Record<ReportDomain, string | null> = {
  executivo: null,
  producao: null,
  estoque: null,
  comercial: 'quotes:view',
  financeiro: 'finance:view',
  parceiros: 'partners:view',
  fornecedores: 'suppliers:view',
};

// ==============================================================================
// 1. Visualização Pública Somente Leitura via Token CSPRNG (WhatsApp Link)
// ==============================================================================
reportsRouter.get('/share/:token', async (req: Request, res: Response) => {
  try {
    const result = await reportShareService.getShareByToken(String(req.params.token || ''));

    if (result.status === 'not_found') {
      return res.status(404).json({
        error: 'Link de relatório não encontrado ou inválido.',
        code: 'REPORT_SHARE_NOT_FOUND',
      });
    }

    if (result.status === 'revoked') {
      return res.status(410).json({
        error: 'Este link de relatório foi revogado pelo emissor ou administrador.',
        code: 'REPORT_SHARE_REVOKED',
        revokedAt: result.revokedAt,
      });
    }

    if (result.status === 'expired') {
      return res.status(410).json({
        error: 'Este link de relatório expirou. Solicite uma nova exportação no ERP DE FARDAS.',
        code: 'REPORT_SHARE_EXPIRED',
        expiresAt: result.expiresAt,
      });
    }

    const { record } = result;
    return res.json({
      reportCode: record.reportCode,
      reportType: record.reportType,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      createdByName: record.createdByName,
      accessCount: record.accessCount,
      snapshot: record.snapshot,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message || 'Erro ao carregar relatório compartilhado.',
    });
  }
});

// ==============================================================================
// 2. Rotas Autenticadas (Geração, Listagem e Revogação de Links Auditáveis)
// ==============================================================================
reportsRouter.use(requireAuth);
reportsRouter.use(requirePermission('reports:view'));

reportsRouter.post(
  '/share',
  requirePermission('reports:share'),
  async (req: RequestWithUser, res: Response) => {
    const actor = req.user!;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    try {
      const sanitized = sanitizeSnapshotPayload(req.body?.snapshot, actor);

      // Verificação de alçada RBAC por domínio do relatório
      const requiredDomainPerm = DOMAIN_PERMISSION_MAP[sanitized.reportType];
      if (requiredDomainPerm) {
        const allowed = PERMISSIONS[requiredDomainPerm] || ['admin'];
        if (!allowed.includes(actor.role)) {
          return res.status(403).json({
            error: `Seu perfil (${actor.role}) não possui alçada [${requiredDomainPerm}] para compartilhar relatórios do módulo '${sanitized.reportType}'.`,
            code: 'FORBIDDEN_REPORT_DOMAIN',
          });
        }
      }

      // No relatório executivo, remove eventual seção financeira caso o perfil não possua finance:view
      const canViewFinance = (PERMISSIONS['finance:view'] || ['admin']).includes(actor.role);
      if (sanitized.reportType === 'executivo' && !canViewFinance) {
        sanitized.sections = sanitized.sections.filter((sec) => !sec.id.startsWith('finance'));
        sanitized.kpis = sanitized.kpis.filter(
          (k) => !/caixa|receber|pagar|saldo/i.test(k.label)
        );
      }

      const expiresInHours = Number(req.body?.expiresInHours || 72);
      const recipientLabel =
        typeof req.body?.recipientLabel === 'string' ? req.body.recipientLabel : undefined;

      const created = await reportShareService.createShare({
        snapshot: sanitized,
        actor,
        expiresInHours,
        recipientLabel,
        ipAddress: ip,
      });

      return res.status(201).json({
        success: true,
        ...created,
      });
    } catch (err: any) {
      return res.status(400).json({
        error: err?.message || 'Não foi possível gerar o link compartilhável do relatório.',
      });
    }
  }
);

reportsRouter.get('/shares', async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const list = await reportShareService.listSharesForActor(actor);
  return res.json(list);
});

reportsRouter.delete('/share/:id', async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const result = await reportShareService.revokeShare(String(req.params.id || ''), actor, ip);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  return res.json({ success: true, message: 'Link revogado com sucesso.' });
});
