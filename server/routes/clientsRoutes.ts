import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { atomic } from '../db/unitOfWork';
import { RequestWithUser, requireAuth, requirePermission } from '../auth/rbac';
import { clientRepository } from '../repositories/clientRepository';
import { orderRepository } from '../repositories/orderRepository';
import { quoteRepository } from '../repositories/quoteRepository';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';
import { text } from '../validation/input';
import type { ClientEntity } from '../types/db';
export const clientsRouter = Router();
clientsRouter.use(requireAuth);
clientsRouter.get('/', async (_req, res) => { res.json(await clientRepository.findAll()); });
clientsRouter.get('/:id', async (req, res) => {
  const client = await clientRepository.findById(req.params.id);
  res.status(client ? 200 : 404).json(client || { error: 'Cliente não encontrado.' });
});
function fields(body: any) {
  return { companyName: text(body.companyName, 'Razão social', 150), tradeName: text(body.tradeName || body.companyName, 'Nome fantasia', 150),
    cnpj: text(body.cnpj, 'CPF/CNPJ', 20), stateRegistration: text(body.stateRegistration, 'Inscrição estadual', 30, false),
    contactName: text(body.contactName, 'Contato', 100), phone: text(body.phone, 'Telefone', 30), email: text(body.email, 'E-mail', 150, false),
    address: text(body.address, 'Endereço', 200, false), city: text(body.city, 'Cidade', 80, false), state: text(body.state, 'UF', 2, false),
    segment: text(body.segment, 'Segmento', 80, false), standardUniformNotes: text(body.standardUniformNotes, 'Observações', 10000, false) };
}
async function audit(req: RequestWithUser, client: ClientEntity, action: string) {
  await auditService.log({ actorId: req.user!.id, actorName: req.user!.fullName, actorRole: req.user!.role,
    entityName: 'crm.clients', entityId: client.id, action });
}
clientsRouter.post('/', requirePermission('crm:manage_clients'), atomic(async (req: RequestWithUser, res: Response) => {
  const now = new Date().toISOString();
  const client: ClientEntity = { ...fields(req.body), id: crypto.randomUUID(), code: await sequenceService.nextClientCode(),
    totalOrdersCount: 0, totalSpent: 0, isDemo: false, createdAt: now, updatedAt: now };
  const existing = await clientRepository.findByCnpj(client.cnpj);
  if (existing) return res.status(409).json({ error: 'CPF/CNPJ já cadastrado.' });
  await clientRepository.save(client); await audit(req, client, 'CREATE_CLIENT');
  res.status(201).json(client);
}));
clientsRouter.put('/:id', requirePermission('crm:manage_clients'), atomic(async (req: RequestWithUser, res: Response) => {
  const current = await clientRepository.findById(req.params.id);
  if (!current) return res.status(404).json({ error: 'Cliente não encontrado.' });
  const updated = { ...current, ...fields(req.body), updatedAt: new Date().toISOString() };
  const existing = await clientRepository.findByCnpj(updated.cnpj);
  if (existing && existing.id !== current.id) return res.status(409).json({ error: 'CPF/CNPJ já cadastrado.' });
  await clientRepository.save(updated); await audit(req, updated, 'UPDATE_CLIENT'); res.json(updated);
}));
clientsRouter.delete('/:id', requirePermission('crm:manage_clients'), atomic(async (req: RequestWithUser, res: Response) => {
  const client = await clientRepository.findById(req.params.id);
  if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });
  if ((await orderRepository.findAll()).some((o) => o.clientId === client.id) || (await quoteRepository.findAll()).some((q) => q.clientId === client.id)) {
    return res.status(409).json({ error: 'Cliente com histórico de proposta ou produção não pode ser excluído.' });
  }
  await clientRepository.delete(client.id); await audit(req, client, 'DELETE_CLIENT'); res.json({ success: true });
}));
