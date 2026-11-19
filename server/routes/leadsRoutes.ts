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
leadsRouter.post('/', async (req: Request, res: Response) => {
  const { clientName, companyName, phone, email, category, estimatedQty, notes } = req.body;

  if (!clientName || !companyName || !phone || !category) {
    return res.status(400).json({ error: 'Campos obrigatórios: clientName, companyName, phone, category' });
  }

  const leadNumber = await sequenceService.nextLeadNumberAsync();
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

  // Cadastrar ou vincular cliente na carteira se for novo (comparando dígitos do telefone ou razão social)
  const phoneDigits = String(phone).replace(/\D/g, '');
  const allClients = await clientRepository.findAll();
  let matchedClient = allClients.find(
    (c) =>
      (phoneDigits.length >= 10 && c.phone.replace(/\D/g, '') === phoneDigits) ||
      c.companyName.trim().toLowerCase() === String(companyName).trim().toLowerCase() ||
      c.tradeName.trim().toLowerCase() === String(companyName).trim().toLowerCase()
  );

  if (!matchedClient) {
    const clientCode = await sequenceService.nextClientCodeAsync();
    matchedClient = {
      id: crypto.randomUUID(),
      code: clientCode,
      companyName: String(companyName).trim().toUpperCase(),
      tradeName: String(companyName).trim(),
      cnpj: `PEND-${clientCode}`, // Identificador preliminar único (evita colisão UNIQUE no PostgreSQL até validação fiscal)
      contactName: String(clientName).trim(),
      phone: String(phone).trim(),
      email: email ? String(email).trim() : '',
      address: 'São Luís - MA',
      city: 'São Luís',
      state: 'MA',
      segment: 'Corporativo / Lead Web',
      standardUniformNotes: `Origem: Portal Público DE FARDAS. Categoria solicitada: ${category}.`,
      totalOrdersCount: 0,
      totalSpent: 0,
      isDemo: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await clientRepository.save(matchedClient);
  }

  auditService.log({
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
    lead: newLead,
    client: matchedClient,
  });
});

const VALID_LEAD_STATUSES = new Set([
  'novo',
  'em_atendimento',
  'orcamento_enviado',
  'convertido',
  'perdido',
]);

// Atualizar status do lead (Apenas vendedores, gerentes e admin)
leadsRouter.patch('/:id/status', requireAuth, requirePermission('crm:manage_clients'), async (req: RequestWithUser, res: Response) => {
  const lead = await leadRepository.findById(req.params.id);
  if (!lead) {
    return res.status(404).json({ error: 'Lead não encontrado' });
  }

  const { status, sellerId } = req.body;
  if (status !== undefined && !VALID_LEAD_STATUSES.has(status)) {
    return res.status(400).json({
      error: `Status de lead inválido. Permitidos: ${Array.from(VALID_LEAD_STATUSES).join(', ')}.`,
    });
  }

  const oldStatus = lead.status;
  if (status) lead.status = status;
  if (sellerId) lead.assignedSellerId = sellerId;

  await leadRepository.save(lead);

  auditService.log({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    entityName: 'crm.leads',
    entityId: lead.leadNumber,
    action: 'UPDATE_LEAD_STATUS',
    oldData: { status: oldStatus },
    newData: { status: lead.status, assignedSellerId: lead.assignedSellerId },
    notes: `Status do lead ${lead.leadNumber} alterado de '${oldStatus}' para '${lead.status}'.`,
  });

  res.json({ success: true, lead });
});
