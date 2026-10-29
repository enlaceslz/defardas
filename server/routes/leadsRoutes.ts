import { atomic } from '../db/unitOfWork';
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { RequestWithUser, requireAuth, requirePermission } from '../auth/rbac';
import { leadRepository } from '../repositories/leadRepository';
import { userRepository } from '../db/userRepository';
import { text, number, oneOf, InputError } from '../validation/input';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';
import { LeadEntity } from '../types/db';

export const leadsRouter = Router();

// Listar todos os leads centralizados para o CRM da confecção (Apenas equipe interna autenticada)
leadsRouter.get('/', requireAuth, requirePermission('crm:view_leads'), async (_req: RequestWithUser, res: Response) => {
  const allLeads = await leadRepository.findAll();
  res.json(allLeads);
});

// Captura pública de lead vinda do Portal Público (Ambiente 1 do PRD)
leadsRouter.post('/', atomic(async (req: Request, res: Response) => {
  const input = req.body || {};
  const clientName = text(input.clientName, 'Contato', 120);
  const companyName = text(input.companyName, 'Empresa', 150);
  const phone = text(input.phone, 'Telefone', 30);
  const email = text(input.email, 'E-mail', 150, false);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('E-mail inválido.');
  const category = oneOf(input.category, ['polos', 'camisetas', 'jalecos', 'calcas', 'coletes', 'linha_social',
    'linha_hospitalar', 'aventais_batas', 'macacoes', 'operacional'] as const, 'Categoria');
  const estimatedQuantity = number(input.estimatedQty, 'Quantidade estimada', 1, true);
  if (estimatedQuantity > 2147483647) throw new InputError('Quantidade estimada excede a capacidade do registro.');
  const notes = text(input.notes, 'Observações', 10000, false);

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
    estimatedQuantity,
    notes,
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
    entityId: newLead.id,
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

  const input = req.body || {};
  if (input.status === undefined && input.sellerId === undefined) throw new InputError('Informe estado ou responsável.');
  const status = input.status === undefined ? lead.status : oneOf(input.status,
    ['novo', 'em_contato', 'convertido_em_proposta', 'desqualificado'] as const, 'Estado');
  if (status === 'convertido_em_proposta' && !lead.convertedQuoteId) {
    return res.status(422).json({ error: 'Conversão exige proposta vinculada pelo fluxo comercial.' });
  }
  let sellerId = lead.assignedSellerId;
  if (input.sellerId !== undefined) {
    if (input.sellerId === null) sellerId = undefined;
    else {
      sellerId = text(input.sellerId, 'Responsável', 36);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sellerId)) throw new InputError('Responsável inválido.');
      const seller = await userRepository.findById(sellerId);
      if (!seller?.isActive || !['admin', 'gerente_comercial', 'vendedor'].includes(seller.role)) throw new InputError('Responsável comercial indisponível.');
    }
  }
  if (status === lead.status && sellerId === lead.assignedSellerId) return res.json({ success: true, lead });
  const previous = { status: lead.status, assignedSellerId: lead.assignedSellerId || null };
  lead.status = status;
  lead.assignedSellerId = sellerId;
  await leadRepository.save(lead);
  await auditService.log({ actorId: req.user!.id, actorName: req.user!.fullName, actorRole: req.user!.role,
    entityName: 'crm.leads', entityId: lead.id, action: 'LEAD_UPDATED', oldData: previous,
    newData: { status: lead.status, assignedSellerId: lead.assignedSellerId || null } });
  res.json({ success: true, lead });
}));
