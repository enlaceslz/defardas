import { Router, Response } from 'express';
import { RequestWithUser, requireAuth, requirePermission } from '../auth/rbac';
import { db } from '../db/connection';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';
import { ClientEntity } from '../types/db';

export const clientsRouter = Router();

// Exigir autenticação para todas as rotas de clientes
clientsRouter.use(requireAuth);

// Listar clientes
clientsRouter.get('/', (req: RequestWithUser, res: Response) => {
  const allClients = Array.from(db.clients.values());
  res.json(allClients);
});

// Cadastrar novo cliente
clientsRouter.post('/', (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const payload = req.body;

  const code = sequenceService.nextClientCode();
  const newClient: ClientEntity = {
    id: `cli-${Date.now()}`,
    code,
    companyName: payload.companyName || 'Empresa Cliente',
    tradeName: payload.tradeName || payload.companyName || 'Cliente',
    cnpj: payload.cnpj || '00.000.000/0001-00',
    stateRegistration: payload.stateRegistration || 'ISENTO',
    contactName: payload.contactName || 'Contato Principal',
    phone: payload.phone || '(98) 98000-0000',
    email: payload.email || 'contato@empresa.com.br',
    address: payload.address || 'São Luís - MA',
    city: payload.city || 'São Luís',
    state: payload.state || 'MA',
    segment: payload.segment || 'Corporativo',
    standardUniformNotes: payload.standardUniformNotes,
    totalOrdersCount: 0,
    totalSpent: 0,
    isDemo: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.clients.set(newClient.id, newClient);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'crm.clients',
    entityId: newClient.code,
    action: 'CREATE_CLIENT',
    newData: newClient,
    notes: `Cliente ${newClient.code} (${newClient.companyName}) cadastrado.`,
  });

  res.status(201).json(newClient);
});

// Atualizar cliente
clientsRouter.put('/:id', (req: RequestWithUser, res: Response) => {
  const client = db.clients.get(req.params.id);
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }

  Object.assign(client, req.body, { updatedAt: new Date().toISOString() });
  res.json(client);
});

// Excluir cliente
clientsRouter.delete('/:id', (req: RequestWithUser, res: Response) => {
  const client = db.clients.get(req.params.id);
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }

  // Verificar se tem orçamentos ou pedidos
  const hasOrders = Array.from(db.orders.values()).some((o) => o.clientId === client.id);
  if (hasOrders) {
    return res.status(400).json({ error: 'Não é permitido excluir cliente com histórico de Ordens de Produção.' });
  }

  db.clients.delete(req.params.id);
  res.json({ success: true, message: 'Cliente excluído com sucesso.' });
});
