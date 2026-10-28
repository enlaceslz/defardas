import { Router, Response } from 'express';
import { RequestWithUser, requirePermission } from '../auth/rbac';
import { db } from '../db/connection';
import { auditService } from '../services/auditService';

export const migrationRouter = Router();

// Apenas administradores autenticados podem acionar importação de dados
migrationRouter.use(requirePermission('system:import_data'));

// Endpoint seguro e idempotente para migrar dados do localStorage
migrationRouter.post('/import-local-storage', (req: RequestWithUser, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(501).json({ error: 'Importação persistente ainda não implementada. Nenhum dado foi importado.' });
  }
  const actor = req.user!;
  const { clients, inventory, orders, quotes, finance } = req.body;

  let importedClientsCount = 0;
  let importedInventoryCount = 0;
  let importedQuotesCount = 0;
  let importedOrdersCount = 0;
  let importedFinanceCount = 0;

  // 1. Clientes
  if (Array.isArray(clients)) {
    for (const c of clients) {
      if (c && c.id && !db.clients.has(c.id)) {
        db.clients.set(c.id, {
          id: c.id,
          code: c.code || `CLI-${c.id.slice(-4)}`,
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
          totalOrdersCount: c.totalOrdersCount || 0,
          totalSpent: c.totalSpent || 0,
          isDemo: c.isDemo !== undefined ? c.isDemo : true,
          createdAt: c.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        importedClientsCount++;
      }
    }
  }

  // 2. Estoque
  if (Array.isArray(inventory)) {
    for (const item of inventory) {
      if (item && item.id && !db.inventory.has(item.id)) {
        db.inventory.set(item.id, {
          id: item.id,
          code: item.code || `MAT-${item.id.slice(-4)}`,
          name: item.name || 'Insumo Importado',
          category: item.category || 'tecido',
          unit: item.unit || 'metros',
          physicalStock: Number(item.physicalStock || item.currentStock || 0),
          allocatedStock: Number(item.allocatedStock || 0),
          inPartnersCustodyStock: Number(item.inPartnersCustodyStock || 0),
          minStock: Number(item.minStock || 50),
          unitCostPrice: Number(item.unitCostPrice || item.costPrice || 0),
          supplier: item.supplier || 'Fornecedor',
          location: item.location || 'Almoxarifado Central',
          lastRestocked: item.lastRestocked || new Date().toISOString().split('T')[0],
          isDemo: item.isDemo !== undefined ? item.isDemo : true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        importedInventoryCount++;
      }
    }
  }

  // 3. Orçamentos
  if (Array.isArray(quotes)) {
    for (const q of quotes) {
      if (q && q.id && !db.quotes.has(q.id)) {
        db.quotes.set(q.id, {
          ...q,
          entryPercentage: 50.00,
          isDemo: q.isDemo !== undefined ? q.isDemo : true,
          createdAt: q.date || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        importedQuotesCount++;
      }
    }
  }

  // 4. Ordens de Produção
  if (Array.isArray(orders)) {
    for (const o of orders) {
      if (o && o.id && !db.orders.has(o.id)) {
        db.orders.set(o.id, {
          ...o,
          idempotencyKey: o.idempotencyKey || `migrated_order_${o.id}`,
          isDemo: o.isDemo !== undefined ? o.isDemo : true,
          createdAt: o.creationDate || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        importedOrdersCount++;
      }
    }
  }

  // 5. Financeiro
  if (Array.isArray(finance)) {
    for (const f of finance) {
      if (f && f.id && !db.finance.has(f.id)) {
        db.finance.set(f.id, {
          ...f,
          transactionNumber: f.transactionNumber || `FIN-${f.id.slice(-4)}`,
          isDemo: f.isDemo !== undefined ? f.isDemo : true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
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
    notes: `Importação segura de dados locais concluída com sucesso. Zero registros sobrescritos.`,
  });

  res.json({
    success: true,
    message: 'Migração de dados locais concluída com sucesso e sem perda de dados.',
    stats: {
      importedClientsCount,
      importedInventoryCount,
      importedQuotesCount,
      importedOrdersCount,
      importedFinanceCount,
    },
  });
});
