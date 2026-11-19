import { Router, Response } from 'express';
import crypto from 'crypto';
import { RequestWithUser, requirePermission } from '../auth/rbac';
import { clientRepository } from '../repositories/clientRepository';
import { inventoryRepository } from '../repositories/inventoryRepository';
import { quoteRepository } from '../repositories/quoteRepository';
import { orderRepository } from '../repositories/orderRepository';
import { financeRepository } from '../repositories/financeRepository';
import { auditService } from '../services/auditService';

export const migrationRouter = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ensureUuid = (val: unknown): string => (typeof val === 'string' && UUID_REGEX.test(val) ? val : crypto.randomUUID());

// Apenas administradores autenticados podem acionar importação de dados
migrationRouter.use(requirePermission('system:import_data'));

// Endpoint seguro e idempotente para migrar dados do localStorage para os repositórios Drizzle/PostgreSQL
migrationRouter.post('/import-local-storage', async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const { clients, inventory, orders, quotes, finance } = req.body;

  let importedClientsCount = 0;
  let importedInventoryCount = 0;
  let importedQuotesCount = 0;
  let importedOrdersCount = 0;
  let importedFinanceCount = 0;

  // 1. Clientes
  if (Array.isArray(clients)) {
    const existingClients = await clientRepository.findAll();
    const existingIds = new Set(existingClients.map((c) => c.id));
    const existingCodes = new Set(existingClients.map((c) => c.code));

    for (const c of clients) {
      if (!c) continue;
      const id = ensureUuid(c.id);
      const code = c.code || `CLI-${id.slice(-4).toUpperCase()}`;
      if (!existingIds.has(id) && !existingCodes.has(code)) {
        await clientRepository.save({
          id,
          code,
          companyName: c.companyName || 'Empresa Importada',
          tradeName: c.tradeName || c.companyName || 'Cliente',
          cnpj: c.cnpj || '00.000.000/0001-00',
          stateRegistration: c.stateRegistration,
          contactName: c.contactName || 'Contato',
          phone: c.phone || '',
          email: c.email || '',
          address: c.address || 'São Luís - MA',
          city: c.city || 'São Luís',
          state: c.state || 'MA',
          segment: c.segment || 'Corporativo',
          standardUniformNotes: c.standardUniformNotes,
          totalOrdersCount: Number(c.totalOrdersCount || 0),
          totalSpent: Number(c.totalSpent || 0),
          isDemo: c.isDemo !== undefined ? Boolean(c.isDemo) : false,
          createdAt: c.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingIds.add(id);
        existingCodes.add(code);
        importedClientsCount++;
      }
    }
  }

  // 2. Estoque
  if (Array.isArray(inventory)) {
    const existingItems = await inventoryRepository.findAllItems();
    const existingIds = new Set(existingItems.map((i) => i.id));
    const existingCodes = new Set(existingItems.map((i) => i.code));

    for (const item of inventory) {
      if (!item) continue;
      const id = ensureUuid(item.id);
      const code = item.code || `MAT-${id.slice(-4).toUpperCase()}`;
      if (!existingIds.has(id) && !existingCodes.has(code)) {
        await inventoryRepository.saveItem({
          id,
          code,
          name: item.name || 'Insumo Importado',
          category: item.category || 'tecido',
          unit: item.unit || 'metros',
          physicalStock: Math.max(0, Number(item.physicalStock ?? item.currentStock ?? 0)),
          allocatedStock: Math.max(0, Number(item.allocatedStock ?? 0)),
          inPartnersCustodyStock: Math.max(0, Number(item.inPartnersCustodyStock ?? 0)),
          minStock: Math.max(0, Number(item.minStock ?? 50)),
          unitCostPrice: Math.max(0, Number(item.unitCostPrice ?? item.costPrice ?? 0)),
          supplier: item.supplier || 'Fornecedor',
          location: item.location || 'Almoxarifado Central',
          lastRestocked: item.lastRestocked || new Date().toISOString().split('T')[0],
          isDemo: item.isDemo !== undefined ? Boolean(item.isDemo) : false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingIds.add(id);
        existingCodes.add(code);
        importedInventoryCount++;
      }
    }
  }

  // 3. Orçamentos
  if (Array.isArray(quotes)) {
    const existingQuotes = await quoteRepository.findAll();
    const existingIds = new Set(existingQuotes.map((q) => q.id));
    const existingNumbers = new Set(existingQuotes.map((q) => q.quoteNumber));

    for (const q of quotes) {
      if (!q) continue;
      const id = ensureUuid(q.id);
      const quoteNumber = q.quoteNumber || `ORC-IMP-${id.slice(-4).toUpperCase()}`;
      if (!existingIds.has(id) && !existingNumbers.has(quoteNumber)) {
        await quoteRepository.save({
          ...q,
          id,
          quoteNumber,
          clientId: ensureUuid(q.clientId),
          entryPercentage: 50.00,
          isDemo: q.isDemo !== undefined ? Boolean(q.isDemo) : false,
          items: Array.isArray(q.items)
            ? q.items.map((it: any) => ({ ...it, id: ensureUuid(it.id), quoteId: id }))
            : [],
          createdAt: q.createdAt || q.date || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingIds.add(id);
        existingNumbers.add(quoteNumber);
        importedQuotesCount++;
      }
    }
  }

  // 4. Ordens de Produção
  if (Array.isArray(orders)) {
    const existingOrders = await orderRepository.findAll();
    const existingIds = new Set(existingOrders.map((o) => o.id));
    const existingNumbers = new Set(existingOrders.map((o) => o.orderNumber));

    for (const o of orders) {
      if (!o) continue;
      const id = ensureUuid(o.id);
      const orderNumber = o.orderNumber || `OP-IMP-${id.slice(-4).toUpperCase()}`;
      if (!existingIds.has(id) && !existingNumbers.has(orderNumber)) {
        await orderRepository.save({
          ...o,
          id,
          orderNumber,
          clientId: ensureUuid(o.clientId),
          idempotencyKey: o.idempotencyKey || `migrated_order_${id}`,
          isDemo: o.isDemo !== undefined ? Boolean(o.isDemo) : false,
          createdAt: o.createdAt || o.creationDate || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingIds.add(id);
        existingNumbers.add(orderNumber);
        importedOrdersCount++;
      }
    }
  }

  // 5. Financeiro
  if (Array.isArray(finance)) {
    const existingFinance = await financeRepository.findAll();
    const existingIds = new Set(existingFinance.map((f) => f.id));
    const existingNumbers = new Set(existingFinance.map((f) => f.transactionNumber));

    for (const f of finance) {
      if (!f) continue;
      const id = ensureUuid(f.id);
      const transactionNumber = f.transactionNumber || `FIN-IMP-${id.slice(-4).toUpperCase()}`;
      if (!existingIds.has(id) && !existingNumbers.has(transactionNumber)) {
        await financeRepository.save({
          ...f,
          id,
          transactionNumber,
          isDemo: f.isDemo !== undefined ? Boolean(f.isDemo) : false,
          createdAt: f.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingIds.add(id);
        existingNumbers.add(transactionNumber);
        importedFinanceCount++;
      }
    }
  }

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'migration',
    entityId: 'local_storage',
    action: 'IMPORT_LOCAL_STORAGE',
    newData: {
      importedClientsCount,
      importedInventoryCount,
      importedQuotesCount,
      importedOrdersCount,
      importedFinanceCount,
    },
    notes: `Importação segura de dados locais concluída via repositórios Drizzle/PostgreSQL. Zero registros sobrescritos.`,
  });

  res.json({
    success: true,
    message: 'Migração de dados locais concluída com sucesso e persistida nos repositórios oficiais.',
    stats: {
      importedClientsCount,
      importedInventoryCount,
      importedQuotesCount,
      importedOrdersCount,
      importedFinanceCount,
    },
  });
});
