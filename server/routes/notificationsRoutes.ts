/**
 * DE FARDAS ERP — Central de Notificações & Monitoramento de Prazos Routes
 * Exige autenticação em todas as rotas e aplica filtragem RBAC por perfil do usuário.
 */
import { Router, Response } from 'express';
import { RequestWithUser, requireAuth } from '../auth/rbac';
import { orderRepository } from '../repositories/orderRepository';
import { quoteRepository } from '../repositories/quoteRepository';
import { inventoryRepository } from '../repositories/inventoryRepository';
import { financeRepository } from '../repositories/financeRepository';
import { supplierRepository } from '../repositories/supplierRepository';
import { buildSystemNotifications } from '../services/notificationService';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

// GET /api/notifications — Retorna alertas em tempo real de prazos por etapa, entregas, compras, Gate A.3.2, estoque e finanças
notificationsRouter.get('/', async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;

  const [orders, quotes, inventory, finance, purchaseOrders] = await Promise.all([
    orderRepository.findAll(),
    quoteRepository.findAll(),
    inventoryRepository.findAllItems(),
    financeRepository.findAll(),
    supplierRepository.findAllPurchaseOrders(),
  ]);

  const payload = buildSystemNotifications({
    role: actor.role,
    orders,
    quotes,
    inventory,
    finance,
    purchaseOrders,
  });

  return res.json(payload);
});
