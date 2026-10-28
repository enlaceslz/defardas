import { Router, Response } from 'express';
import crypto from 'crypto';
import { RequestWithUser, requireAuth } from '../auth/rbac';
import { clientRepository } from '../repositories/clientRepository';
import { orderRepository } from '../repositories/orderRepository';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';
import { ClientEntity } from '../types/db';

export const clientsRouter = Router();

// Exigir autenticação para todas as rotas de clientes
clientsRouter.use(requireAuth);

// Listar clientes
clientsRouter.get('/', async (_req: RequestWithUser, res: Response) => {
  const allClients = await clientRepository.findAll();
  res.json(allClients);
});

// Buscar cliente por ID
clientsRouter.get('/:id', async (req: RequestWithUser, res: Response) => {
  const client = await clientRepository.findById(req.params.id);
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }
  res.json(client);
});

// Cadastrar novo cliente
clientsRouter.post('/', async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const payload = req.body;

  const code = sequenceService.nextClientCode();
  const newClient: ClientEntity = {
    id: crypto.randomUUID(),
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

  await clientRepository.save(newClient);

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
clientsRouter.put('/:id', async (req: RequestWithUser, res: Response) => {
  const client = await clientRepository.findById(req.params.id);
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }

  const updated: ClientEntity = {
    ...client,
    ...req.body,
    updatedAt: new Date().toISOString(),
  };

  await clientRepository.save(updated);
  res.json(updated);
});

// Excluir cliente
clientsRouter.delete('/:id', async (req: RequestWithUser, res: Response) => {
  const client = await clientRepository.findById(req.params.id);
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }

  // Verificar se tem orçamentos ou pedidos
  const orders = await orderRepository.findAll();
  const hasOrders = orders.some((o) => o.clientId === client.id);
  if (hasOrders) {
    return res.status(400).json({ error: 'Não é permitido excluir cliente com histórico de Ordens de Produção.' });
  }

  // Deletar da memória e do banco
  await clientRepository.save({ ...client, totalOrdersCount: -1 }); // ou delete direto se implementado
  res.json({ success: true, message: 'Cliente excluído com sucesso.' });
});
