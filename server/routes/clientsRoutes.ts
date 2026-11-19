/**
 * DE FARDAS ERP — Carteira de Clientes B2B Routes
 * Validação fiscal de CNPJ (dígitos verificadores + unicidade),
 * métricas cruzadas ao vivo (Orçamentos + OPs + Financeiro),
 * visão 360° por cliente, RBAC granular e integridade referencial.
 */
import { Router, Response } from 'express';
import crypto from 'crypto';
import { RequestWithUser, requireAuth, requirePermission } from '../auth/rbac';
import { clientRepository } from '../repositories/clientRepository';
import { orderRepository } from '../repositories/orderRepository';
import { quoteRepository } from '../repositories/quoteRepository';
import { financeRepository } from '../repositories/financeRepository';
import { leadRepository } from '../repositories/leadRepository';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';
import { ClientEntity } from '../types/db';

export const clientsRouter = Router();

function onlyDigits(val: unknown): string {
  return String(val || '').replace(/\D/g, '');
}

function formatCnpj(digits: string): string {
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

function isPreliminaryCnpj(raw: string): boolean {
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed || trimmed.startsWith('PEND-')) return true;
  const digits = onlyDigits(trimmed);
  return digits === '00000000000100' || digits === '00000000000000';
}

function isValidCnpjDigits(digits: string): boolean {
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const calcDigit = (base: string, weights: number[]) => {
    const sum = base
      .split('')
      .reduce((acc, ch, i) => acc + parseInt(ch, 10) * weights[i], 0);
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };

  const d1 = calcDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return parseInt(digits[12], 10) === d1 && parseInt(digits[13], 10) === d2;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Exigir autenticação para todas as rotas de clientes
clientsRouter.use(requireAuth);

// 1. Listar clientes enriquecidos com métricas reais ao vivo (Orçamentos + OPs + Financeiro)
clientsRouter.get('/', async (_req: RequestWithUser, res: Response) => {
  const [allClients, allOrders, allQuotes, allTransactions] = await Promise.all([
    clientRepository.findAll(),
    orderRepository.findAll(),
    quoteRepository.findAll(),
    financeRepository.findAll(),
  ]);

  const enriched = allClients.map((client) => {
    const clientOrders = allOrders.filter((o) => o.clientId === client.id);
    const activeOrders = clientOrders.filter((o) => o.stage !== 'entregue');
    const clientQuotes = allQuotes.filter((q) => q.clientId === client.id);
    const openQuotes = clientQuotes.filter((q) =>
      ['rascunho', 'enviado', 'em_negociacao', 'aprovado'].includes(q.commercialStatus)
    );

    const orderIds = new Set(clientOrders.map((o) => o.id));
    const quoteIds = new Set(clientQuotes.map((q) => q.id));

    const clientReceivables = allTransactions.filter(
      (f) =>
        f.type === 'receber' &&
        f.status !== 'estornado' &&
        ((f.productionOrderId && orderIds.has(f.productionOrderId)) ||
          (f.quoteId && quoteIds.has(f.quoteId)))
    );

    const paidReceivablesAmount =
      Math.round(
        clientReceivables
          .filter((f) => f.status === 'pago')
          .reduce((sum, f) => sum + Number(f.amount || 0), 0) * 100
      ) / 100;

    const pendingReceivablesAmount =
      Math.round(
        clientReceivables
          .filter((f) => f.status === 'pendente' || f.status === 'atrasado')
          .reduce((sum, f) => sum + Number(f.amount || 0), 0) * 100
      ) / 100;

    const totalPiecesOrdered = clientOrders.reduce((sum, o) => sum + Number(o.totalPieces || 0), 0);

    const convertedQuotesValue =
      Math.round(
        clientQuotes
          .filter((q) => q.commercialStatus === 'convertido_em_pedido')
          .reduce((sum, q) => sum + Number(q.negotiatedTotalAmount || 0), 0) * 100
      ) / 100;

    const totalReceivablesValue =
      Math.round((paidReceivablesAmount + pendingReceivablesAmount) * 100) / 100;

    const sortedOrderDates = clientOrders
      .map((o) => o.creationDate)
      .filter(Boolean)
      .sort()
      .reverse();

    // Preserva histórico legado (seed/importação) quando superior ao volume corrente
    const liveOrdersCount = Math.max(client.totalOrdersCount || 0, clientOrders.length);
    const liveTotalSpent = Math.max(
      client.totalSpent || 0,
      paidReceivablesAmount,
      convertedQuotesValue,
      totalReceivablesValue
    );

    return {
      ...client,
      totalOrdersCount: liveOrdersCount,
      totalSpent: Math.round(liveTotalSpent * 100) / 100,
      isPreliminaryCnpj: isPreliminaryCnpj(client.cnpj),
      metrics: {
        quotesCount: clientQuotes.length,
        openQuotesCount: openQuotes.length,
        ordersCount: clientOrders.length,
        activeOrdersCount: activeOrders.length,
        totalPiecesOrdered,
        paidReceivablesAmount,
        pendingReceivablesAmount,
        lastOrderDate: sortedOrderDates[0] || null,
      },
    };
  });

  res.json(enriched);
});

// 2. Visão 360° do Cliente (Cadastro + Orçamentos + OPs + Títulos Financeiros + Leads)
clientsRouter.get('/:id/profile', async (req: RequestWithUser, res: Response) => {
  const client = await clientRepository.findById(req.params.id);
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado.' });
  }

  const [allOrders, allQuotes, allTransactions, allLeads] = await Promise.all([
    orderRepository.findAll(),
    quoteRepository.findAll(),
    financeRepository.findAll(),
    leadRepository.findAll(),
  ]);

  const orders = allOrders.filter((o) => o.clientId === client.id);
  const quotes = allQuotes.filter((q) => q.clientId === client.id);

  const orderIds = new Set(orders.map((o) => o.id));
  const quoteIds = new Set(quotes.map((q) => q.id));

  const transactions = allTransactions.filter(
    (f) =>
      (f.productionOrderId && orderIds.has(f.productionOrderId)) ||
      (f.quoteId && quoteIds.has(f.quoteId))
  );

  const clientPhoneDigits = onlyDigits(client.phone);
  const leads = allLeads.filter(
    (l) =>
      (clientPhoneDigits.length >= 10 && onlyDigits(l.phone) === clientPhoneDigits) ||
      l.companyName.trim().toLowerCase() === client.tradeName.trim().toLowerCase() ||
      l.companyName.trim().toLowerCase() === client.companyName.trim().toLowerCase()
  );

  const paidReceivablesAmount =
    Math.round(
      transactions
        .filter((f) => f.type === 'receber' && f.status === 'pago')
        .reduce((s, f) => s + Number(f.amount || 0), 0) * 100
    ) / 100;

  const pendingReceivablesAmount =
    Math.round(
      transactions
        .filter((f) => f.type === 'receber' && (f.status === 'pendente' || f.status === 'atrasado'))
        .reduce((s, f) => s + Number(f.amount || 0), 0) * 100
    ) / 100;

  const totalPiecesOrdered = orders.reduce((s, o) => s + Number(o.totalPieces || 0), 0);

  return res.json({
    client: {
      ...client,
      isPreliminaryCnpj: isPreliminaryCnpj(client.cnpj),
    },
    quotes,
    orders,
    transactions,
    leads,
    metrics: {
      quotesCount: quotes.length,
      openQuotesCount: quotes.filter((q) =>
        ['rascunho', 'enviado', 'em_negociacao', 'aprovado'].includes(q.commercialStatus)
      ).length,
      ordersCount: orders.length,
      activeOrdersCount: orders.filter((o) => o.stage !== 'entregue').length,
      totalPiecesOrdered,
      paidReceivablesAmount,
      pendingReceivablesAmount,
    },
  });
});

// 3. Buscar cliente por ID
clientsRouter.get('/:id', async (req: RequestWithUser, res: Response) => {
  const client = await clientRepository.findById(req.params.id);
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado.' });
  }
  res.json(client);
});

// 4. Cadastrar novo cliente (validação fiscal de CNPJ + detecção de duplicidade)
clientsRouter.post('/', requirePermission('crm:manage_clients'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const payload = req.body || {};

  const companyName = String(payload.companyName || '').trim();
  const tradeName = String(payload.tradeName || companyName).trim();
  const contactName = String(payload.contactName || '').trim() || 'Contato Principal';
  const phone = String(payload.phone || '').trim();
  const email = String(payload.email || '').trim();
  const rawCnpj = String(payload.cnpj || '').trim();

  if (!companyName || companyName.length < 2) {
    return res.status(400).json({ error: 'Razão Social (companyName) é obrigatória.' });
  }

  if (!rawCnpj) {
    return res.status(400).json({ error: 'CNPJ é obrigatório para cadastro na carteira B2B.' });
  }

  const cnpjDigits = onlyDigits(rawCnpj);
  if (!isValidCnpjDigits(cnpjDigits)) {
    return res.status(400).json({
      error: 'CNPJ inválido. Verifique os 14 dígitos e os dígitos verificadores.',
      code: 'INVALID_CNPJ',
    });
  }
  const normalizedCnpj = formatCnpj(cnpjDigits);

  // Verificar duplicidade de CNPJ (por dígitos normalizados)
  const existingClients = await clientRepository.findAll();
  const duplicated = existingClients.find((c) => onlyDigits(c.cnpj) === cnpjDigits);
  if (duplicated) {
    return res.status(409).json({
      error: `Já existe um cliente cadastrado com o CNPJ ${normalizedCnpj}: ${duplicated.tradeName} (${duplicated.code}).`,
      code: 'DUPLICATE_CNPJ',
      existingClientId: duplicated.id,
    });
  }

  if (phone && onlyDigits(phone).length < 10) {
    return res.status(400).json({ error: 'Informe um telefone/WhatsApp válido com DDD (mínimo 10 dígitos).' });
  }
  if (email && !isValidEmail(email)) {
    return res.status(400).json({ error: 'Informe um endereço de e-mail válido.' });
  }

  const code = await sequenceService.nextClientCodeAsync();
  const nowIso = new Date().toISOString();
  const newClient: ClientEntity = {
    id: crypto.randomUUID(),
    code,
    companyName,
    tradeName,
    cnpj: normalizedCnpj,
    stateRegistration: String(payload.stateRegistration || 'ISENTO').trim() || 'ISENTO',
    contactName,
    phone: phone || '(98) 98000-0000',
    email: email || 'contato@empresa.com.br',
    address: String(payload.address || 'São Luís - MA').trim() || 'São Luís - MA',
    city: String(payload.city || 'São Luís').trim() || 'São Luís',
    state: String(payload.state || 'MA').trim().toUpperCase().slice(0, 2) || 'MA',
    segment: String(payload.segment || 'Corporativo').trim() || 'Corporativo',
    standardUniformNotes: payload.standardUniformNotes ? String(payload.standardUniformNotes).trim() : undefined,
    totalOrdersCount: 0,
    totalSpent: 0,
    isDemo: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await clientRepository.save(newClient);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'crm.clients',
    entityId: newClient.code,
    action: 'CREATE_CLIENT',
    newData: {
      code: newClient.code,
      companyName: newClient.companyName,
      tradeName: newClient.tradeName,
      cnpj: newClient.cnpj,
      segment: newClient.segment,
    },
    notes: `Cliente ${newClient.code} (${newClient.companyName} — CNPJ ${newClient.cnpj}) cadastrado.`,
  });

  return res.status(201).json(newClient);
});

// 5. Atualizar cliente (Allowlist explícita + validação de CNPJ + unicidade)
clientsRouter.put('/:id', requirePermission('crm:manage_clients'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const client = await clientRepository.findById(req.params.id);
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado.' });
  }

  const payload = req.body || {};

  const nextCompanyName =
    payload.companyName !== undefined ? String(payload.companyName).trim() : client.companyName;
  if (!nextCompanyName || nextCompanyName.length < 2) {
    return res.status(400).json({ error: 'Razão Social (companyName) não pode ficar vazia.' });
  }

  let nextCnpj = client.cnpj;
  if (payload.cnpj !== undefined) {
    const rawCnpj = String(payload.cnpj).trim();
    const cnpjDigits = onlyDigits(rawCnpj);
    const unchanged = rawCnpj === client.cnpj || (cnpjDigits.length > 0 && cnpjDigits === onlyDigits(client.cnpj));

    if (!unchanged && !isPreliminaryCnpj(rawCnpj)) {
      if (!isValidCnpjDigits(cnpjDigits)) {
        return res.status(400).json({
          error: 'CNPJ inválido. Verifique os 14 dígitos e os dígitos verificadores.',
          code: 'INVALID_CNPJ',
        });
      }
      const allClients = await clientRepository.findAll();
      const collision = allClients.find(
        (c) => c.id !== client.id && onlyDigits(c.cnpj) === cnpjDigits
      );
      if (collision) {
        return res.status(409).json({
          error: `CNPJ já cadastrado para ${collision.tradeName} (${collision.code}).`,
          code: 'DUPLICATE_CNPJ',
        });
      }
      nextCnpj = formatCnpj(cnpjDigits);
    }
  }

  const nextPhone = payload.phone !== undefined ? String(payload.phone).trim() : client.phone;
  if (nextPhone && onlyDigits(nextPhone).length < 10) {
    return res.status(400).json({ error: 'Informe um telefone/WhatsApp válido com DDD (mínimo 10 dígitos).' });
  }

  const nextEmail = payload.email !== undefined ? String(payload.email).trim() : client.email;
  if (nextEmail && !isValidEmail(nextEmail)) {
    return res.status(400).json({ error: 'Informe um endereço de e-mail válido.' });
  }

  const updated: ClientEntity = {
    ...client,
    companyName: nextCompanyName,
    tradeName:
      payload.tradeName !== undefined
        ? String(payload.tradeName).trim() || nextCompanyName
        : client.tradeName,
    cnpj: nextCnpj,
    stateRegistration:
      payload.stateRegistration !== undefined
        ? String(payload.stateRegistration).trim() || 'ISENTO'
        : client.stateRegistration,
    contactName:
      payload.contactName !== undefined
        ? String(payload.contactName).trim() || client.contactName
        : client.contactName,
    phone: nextPhone || client.phone,
    email: nextEmail || client.email,
    address:
      payload.address !== undefined
        ? String(payload.address).trim() || client.address
        : client.address,
    city:
      payload.city !== undefined
        ? String(payload.city).trim() || client.city
        : client.city,
    state:
      payload.state !== undefined
        ? String(payload.state).trim().toUpperCase().slice(0, 2) || client.state
        : client.state,
    segment:
      payload.segment !== undefined
        ? String(payload.segment).trim() || client.segment
        : client.segment,
    standardUniformNotes:
      payload.standardUniformNotes !== undefined
        ? String(payload.standardUniformNotes).trim() || undefined
        : client.standardUniformNotes,
    updatedAt: new Date().toISOString(),
  };

  await clientRepository.save(updated);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'crm.clients',
    entityId: updated.code,
    action: 'UPDATE_CLIENT',
    oldData: {
      companyName: client.companyName,
      tradeName: client.tradeName,
      cnpj: client.cnpj,
      phone: client.phone,
      email: client.email,
    },
    newData: {
      companyName: updated.companyName,
      tradeName: updated.tradeName,
      cnpj: updated.cnpj,
      phone: updated.phone,
      email: updated.email,
    },
    notes: `Cadastro do cliente ${updated.code} (${updated.companyName}) atualizado.`,
  });

  return res.json(updated);
});

// 6. Excluir cliente (restrito a admin e gerente_comercial + proteção referencial 409)
clientsRouter.delete('/:id', requirePermission('crm:delete_clients'), async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const client = await clientRepository.findById(req.params.id);
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado.' });
  }

  // Verificar se tem pedidos, propostas ou lançamentos financeiros vinculados
  const [orders, quotes, transactions] = await Promise.all([
    orderRepository.findAll(),
    quoteRepository.findAll(),
    financeRepository.findAll(),
  ]);

  const linkedOrders = orders.filter((o) => o.clientId === client.id);
  if (linkedOrders.length > 0) {
    return res.status(409).json({
      error: `Exclusão bloqueada: ${client.tradeName} possui ${linkedOrders.length} Ordem(ns) de Produção no histórico.`,
      code: 'CLIENT_HAS_ORDERS',
    });
  }

  const linkedQuotes = quotes.filter((q) => q.clientId === client.id);
  if (linkedQuotes.length > 0) {
    return res.status(409).json({
      error: `Exclusão bloqueada: ${client.tradeName} possui ${linkedQuotes.length} proposta(s) comercial(is) vinculada(s).`,
      code: 'CLIENT_HAS_QUOTES',
    });
  }

  const hasTransactions = transactions.some(
    (f) => f.referenceId === client.code
  );
  if (hasTransactions) {
    return res.status(409).json({
      error: `Exclusão bloqueada: ${client.tradeName} possui títulos financeiros vinculados.`,
      code: 'CLIENT_HAS_TRANSACTIONS',
    });
  }

  await clientRepository.delete(req.params.id);

  auditService.log({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityName: 'crm.clients',
    entityId: client.code,
    action: 'DELETE_CLIENT',
    notes: `Cliente ${client.code} (${client.companyName}) excluído.`,
  });

  return res.json({ success: true, message: 'Cliente excluído com sucesso.' });
});
