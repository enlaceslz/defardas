import { atomic } from '../db/unitOfWork';
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { RequestWithUser, requireAuth, requirePermission } from '../auth/rbac';
import { leadRepository } from '../repositories/leadRepository';
import { clientRepository } from '../repositories/clientRepository';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';
import { LeadEntity, ClientEntity } from '../types/db';

export const leadsRouter = Router();

// Listar todos os leads centralizados para o CRM da confecção (Apenas equipe interna autenticada)
leadsRouter.get('/', requireAuth, requirePermission('crm:view_leads'), async (_req: RequestWithUser, res: Response) => {
  const allLeads = await leadRepository.findAll();
  res.json(allLeads);
});

// Captura pública de lead vinda do Portal Público (Ambiente 1 do PRD)
leadsRouter.post('/', atomic(async (req: Request, res: Response) => {
  const { clientName, companyName, phone, email, category, estimatedQty, notes } = req.body;

  if (![clientName, companyName, phone, category].every((value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 200)) {
    return res.status(400).json({ error: 'Campos obrigatórios: clientName, companyName, phone, category' });
  }

  const leadNumber = await sequenceService.nextLeadNumber();
  const leadId = crypto.randomUUID();

  const newLead: LeadEntity = {
    id: leadId,
    leadNumber,
    clientName,
    companyName,
    phone,
    email: email || '',
    category,
    estimatedQuantity: Number(estimatedQty) || 50,
    notes: notes || 'Solicitação através do catálogo digital / portal público da DE FARDAS.',
    origin: 'portal_publico',
    status: 'novo',
    isDemo: false,
    createdAt: new Date().toISOString(),
  };

  await leadRepository.save(newLead);

  await auditService.log({
    actorName: 'Portal Público (Visitante)',
    actorRole: 'cliente_portal',
    entityName: 'crm.leads',
    entityId: newLead.leadNumber,
    action: 'LEAD_CAPTURED',
    newData: newLead,
    notes: `Novo lead ${newLead.leadNumber} recebido de ${companyName} (${clientName}).`,
  });

  res.status(201).json({
    success: true,
    message: 'Solicitação de orçamento recebida com sucesso! Nossa equipe comercial entrará em contato em breve via WhatsApp.',
    leadId: newLead.id,
  });
}));

// Atualizar status do lead (Apenas vendedores, gerentes e admin)
leadsRouter.patch('/:id/status', requireAuth, requirePermission('crm:manage_clients'), atomic(async (req: RequestWithUser, res: Response) => {
  const lead = await leadRepository.findById(req.params.id);
  if (!lead) {
    return res.status(404).json({ error: 'Lead não encontrado' });
  }

  const { status, sellerId } = req.body;
  if (status) lead.status = status;
  if (sellerId) lead.assignedSellerId = sellerId;

  await leadRepository.save(lead);
  res.json({ success: true, lead });
}));
