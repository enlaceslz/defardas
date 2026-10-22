import { Router, Request, Response } from 'express';
import { db } from '../db/connection';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';
import { LeadEntity, ClientEntity } from '../types/db';

export const leadsRouter = Router();

// Listar todos os leads centralizados para o CRM da confecção
leadsRouter.get('/', (_req: Request, res: Response) => {
  const allLeads = Array.from(db.leads.values());
  res.json(allLeads);
});

// Captura pública de lead vinda do Portal Público (Ambiente 1 do PRD)
leadsRouter.post('/', (req: Request, res: Response) => {
  const { clientName, companyName, phone, email, category, estimatedQty, notes } = req.body;

  if (!clientName || !companyName || !phone || !category) {
    return res.status(400).json({ error: 'Campos obrigatórios: clientName, companyName, phone, category' });
  }

  const leadNumber = sequenceService.nextLeadNumber();
  const leadId = `lead-${Date.now()}`;

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

  db.leads.set(newLead.id, newLead);

  // Cadastrar ou vincular cliente na carteira se for novo
  let matchedClient = Array.from(db.clients.values()).find(
    (c) => c.phone === phone || c.companyName.toLowerCase() === companyName.toLowerCase()
  );

  if (!matchedClient) {
    const clientCode = sequenceService.nextClientCode();
    matchedClient = {
      id: `cli-${Date.now()}`,
      code: clientCode,
      companyName: companyName.toUpperCase(),
      tradeName: companyName,
      cnpj: '00.000.000/0001-00', // Cadastro preliminar aguardando dados fiscais
      contactName: clientName,
      phone,
      email: email || '',
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
    db.clients.set(matchedClient.id, matchedClient);
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

// Atualizar status do lead
leadsRouter.patch('/:id/status', (req: Request, res: Response) => {
  const lead = db.leads.get(req.params.id);
  if (!lead) {
    return res.status(404).json({ error: 'Lead não encontrado' });
  }

  const { status, sellerId } = req.body;
  if (status) lead.status = status;
  if (sellerId) lead.assignedSellerId = sellerId;

  res.json({ success: true, lead });
});
