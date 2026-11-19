import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle2, X, ShieldCheck, LogIn } from 'lucide-react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { ProductionOrdersView } from './components/ProductionOrdersView';
import { QuotesView } from './components/QuotesView';
import { InventoryView } from './components/InventoryView';
import { ClientsView } from './components/ClientsView';
import { FinancialView } from './components/FinancialView';
import { SettingsView } from './components/SettingsView';
import { PublicPortalView } from './components/PublicPortalView';
import { LoginView } from './components/LoginView';
import { WhatsAppOmnichannelView } from './components/WhatsAppOmnichannelView';
import { PartnersView } from './components/PartnersView';

import { NewOrderModal } from './components/NewOrderModal';
import { NewQuoteModal } from './components/NewQuoteModal';
import { PrintOrderTicketModal } from './components/PrintOrderTicketModal';
import { PrintQuoteModal } from './components/PrintQuoteModal';
import { HelpManualModal } from './components/HelpManualModal';
import { FoundationAuditModal } from './components/FoundationAuditModal';
import { api } from './api/client';
import { useAuth } from './api/authContext';

import {
  ERPState,
  loadERPState,
  saveERPState,
  resetERPState,
} from './utils/storage';
import {
  ProductionOrder,
  Quote,
  InventoryItem,
  Client,
  FinancialTransaction,
  CompanyProfile,
  OperationalStage,
  CommercialStatus,
  UniformCategory,
  Partner,
  PartnerCustody,
  LeadItem,
} from './types/erp';

interface ToastMessage {
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
}

export default function App() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [state, setState] = useState<ERPState>(() => loadERPState());
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerCustody, setPartnerCustody] = useState<PartnerCustody[]>([]);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('defardas_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const handleToggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('defardas_sidebar_collapsed', String(next));
      } catch {
        // Ignorar indisponibilidade de storage
      }
      return next;
    });
  };

  // Notification Toast & Confirm Dialog (substitui window.alert / window.confirm)
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  const notify = useCallback((type: ToastMessage['type'], title: string, message: string) => {
    setToast({ type, title, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Modals state
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ProductionOrder | null>(null);
  const [isNewQuoteModalOpen, setIsNewQuoteModalOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [quoteInitialClientId, setQuoteInitialClientId] = useState<string | null>(null);
  const [selectedOrderForTicket, setSelectedOrderForTicket] = useState<ProductionOrder | null>(null);
  const [selectedQuoteForPrint, setSelectedQuoteForPrint] = useState<Quote | null>(null);
  const [isHelpManualOpen, setIsHelpManualOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  // Sync de cache local (apenas backup de visualização / perfil institucional)
  useEffect(() => {
    saveERPState(state);
  }, [state]);

  // Carregar dados reais e autoritativos do backend PostgreSQL preservando UUIDs canônicos
  const fetchServerState = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const [ordersRes, quotesRes, invRes, clientsRes, finRes, partnersRes, custodyRes, leadsRes] = await Promise.all([
        api.getOrders(),
        api.getQuotes(),
        api.getInventoryItems(),
        api.getClients(),
        api.getTransactions(),
        api.getPartners(),
        api.getPartnerCustody(),
        api.getLeads(),
      ]);

      if (partnersRes.status === 200 && Array.isArray(partnersRes.data)) {
        setPartners(partnersRes.data);
      } else if (partnersRes.status === 403) {
        setPartners([]);
      }

      if (custodyRes.status === 200 && Array.isArray(custodyRes.data)) {
        setPartnerCustody(custodyRes.data);
      } else if (custodyRes.status === 403) {
        setPartnerCustody([]);
      }

      if (leadsRes.status === 200 && Array.isArray(leadsRes.data)) {
        setLeads(leadsRes.data);
      } else if (leadsRes.status === 403) {
        setLeads([]);
      }

      setState((prev) => {
        const updated = { ...prev };

        if (ordersRes.status === 200 && Array.isArray(ordersRes.data)) {
          updated.orders = ordersRes.data.map((o: any) => ({
            id: o.id,
            orderNumber: o.orderNumber || o.id,
            idempotencyKey: o.idempotencyKey,
            isDemo: o.isDemo,
            quoteId: o.quoteId,
            quoteVersion: o.quoteVersion || 1,
            clientId: o.clientId,
            clientName: o.clientName,
            itemTitle: o.itemTitle,
            category: o.category,
            fabricName: o.fabricName,
            fabricColor: o.fabricColor,
            sizes: o.sizes || { pp: 0, p: 0, m: 0, g: 0, gg: 0, xg: 0, exg: 0, sobMedida: 0 },
            totalPieces: o.totalPieces,
            customizations: o.customizations || [],
            costBreakdown: o.costBreakdown || {
              materialUnitCost: 25,
              outsourcedSewingUnitCost: 15,
              customizationUnitCost: 6,
              freightPerUnit: 1.5,
              technicalLossPercentage: 2,
              calculatedBaseCost: 48.45,
              markupPercentage: 50,
              suggestedUnitPrice: 72.68,
              negotiatedUnitPrice: 72.68,
              discountPercentage: 0,
              belowSuggestedAuthorized: false,
              estimatedMarginPercentage: 33.3,
            },
            materials: o.materials || [],
            commercialStatus: o.commercialStatus,
            financialStatus: o.financialStatus,
            stage: o.stage,
            artApproved: Boolean(o.artApproved),
            artApprovalDate: o.artApprovalDate,
            artApprovedBy: o.artApprovedBy,
            entryPaymentConfirmed: Boolean(o.entryPaymentConfirmed),
            entryReceiptUrl: o.entryReceiptUrl,
            canStartProduction: Boolean(o.entryPaymentConfirmed && o.artApproved),
            outsourcedPartner: o.outsourcedPartner,
            partnerCostPerPiece: o.partnerCostPerPiece !== undefined ? Number(o.partnerCostPerPiece) : undefined,
            priority: o.priority,
            creationDate: o.creationDate,
            targetDeliveryDate: o.targetDeliveryDate,
            completionDate: o.completionDate,
            technicalNotes: o.technicalNotes || '',
            assignedTeam: o.assignedTeam,
          }));
        }

        if (quotesRes.status === 200 && Array.isArray(quotesRes.data)) {
          const clientsById = new Map<string, any>(
            Array.isArray(clientsRes.data) ? clientsRes.data.map((c: any) => [c.id, c]) : []
          );
          const ordersById = new Map<string, any>(
            Array.isArray(ordersRes.data) ? ordersRes.data.map((o: any) => [o.id, o]) : []
          );

          updated.quotes = quotesRes.data.map((q: any) => {
            const client = clientsById.get(q.clientId);
            const linkedOrder = q.convertedOrderId ? ordersById.get(q.convertedOrderId) : null;
            return {
              id: q.id,
              quoteNumber: q.quoteNumber || q.id,
              isDemo: q.isDemo,
              version: q.version || 1,
              clientId: q.clientId,
              clientName: q.clientName,
              clientCnpj: q.clientCnpj,
              clientContact: client?.contactName || q.sellerName,
              clientPhone: client?.phone || '(98) 98841-2090',
              clientEmail: client?.email || 'compras@cliente.com.br',
              sellerName: q.sellerName,
              date: q.date,
              validUntil: q.validUntil,
              items: (q.items || []).map((it: any) => {
                const baseCost = Number(it.calculatedBaseUnitCost ?? 0);
                const suggested = Number(it.suggestedUnitPrice ?? 0);
                const negotiated = Number(it.negotiatedUnitPrice ?? 0);
                const itemDiscAmt = Math.max(0, Math.round((suggested - negotiated) * 100) / 100);
                const itemDiscPct =
                  suggested > 0 ? Math.round((itemDiscAmt / suggested) * 10000) / 100 : 0;
                const estMargin =
                  negotiated > 0
                    ? Math.round(((negotiated - baseCost) / negotiated) * 10000) / 100
                    : 0;
                return {
                  id: it.id,
                  modelName: it.modelName,
                  category: it.category,
                  fabricName: it.fabricName,
                  fabricColor: it.fabricColor,
                  sizes: it.sizes || { pp: 0, p: 0, m: 0, g: 0, gg: 0, xg: 0, exg: 0, sobMedida: 0 },
                  totalQuantity: it.totalQuantity || it.quantity || 1,
                  costBreakdown: {
                    materialUnitCost: Number(it.materialUnitCost ?? 0),
                    outsourcedSewingUnitCost: Number(it.outsourcedSewingUnitCost ?? 0),
                    customizationUnitCost: Number(it.customizationUnitCost ?? 0),
                    freightPerUnit: Number(it.freightUnitCost ?? 0),
                    technicalLossPercentage: Number(it.technicalLossPercentage ?? 2),
                    calculatedBaseCost: baseCost,
                    markupPercentage: Number(it.markupPercentage ?? 50),
                    suggestedUnitPrice: suggested,
                    negotiatedUnitPrice: negotiated,
                    discountPercentage: itemDiscPct,
                    belowSuggestedAuthorized: Boolean(q.belowSuggestedAuthorized && negotiated < suggested),
                    authorizerName: q.authorizedByName,
                    estimatedMarginPercentage: estMargin,
                  },
                  unitFinalPrice: negotiated,
                  totalPrice: Number(it.totalItemPrice ?? Math.round(negotiated * (it.totalQuantity || 1) * 100) / 100),
                  customizations: it.customizations || [],
                };
              }),
              subtotal: Number(q.negotiatedTotalAmount ?? 0),
              discountPercentage:
                q.suggestedTotalAmount > 0 && q.discountAmount > 0
                  ? Math.round((q.discountAmount / q.suggestedTotalAmount) * 10000) / 100
                  : 0,
              totalAmount: Number(q.negotiatedTotalAmount ?? 0),
              entryPercentage: 50,
              entryAmount: Number(q.entryAmount ?? 0),
              balanceDueAtDelivery: Number(q.balanceAmount ?? 0),
              paymentTerms: q.paymentTerms,
              productionLeadDays: q.productionLeadDays,
              status: q.commercialStatus,
              artApproved: Boolean(q.artApproved),
              notes: q.notes || '',
              convertedToOrderId: linkedOrder?.orderNumber || q.convertedOrderId,
            };
          });
        } else if (quotesRes.status === 403) {
          updated.quotes = [];
        }

        if (invRes.status === 200 && Array.isArray(invRes.data)) {
          updated.inventory = invRes.data.map((i: any) => ({
            id: i.id,
            code: i.code || i.id,
            name: i.name,
            category: i.category,
            unit: i.unit,
            currentStock: Number(i.physicalStock ?? i.currentStock ?? 0),
            allocatedStock: Number(i.allocatedStock ?? 0),
            inPartnersCustodyStock: Number(i.inPartnersCustodyStock ?? 0),
            minStock: Number(i.minStock ?? 50),
            costPrice: Number(i.unitCostPrice ?? i.costPrice ?? 0),
            supplier: i.supplier || 'Fornecedor Homologado',
            location: i.location || 'Almoxarifado Central',
            lastRestocked: i.lastRestocked || new Date().toISOString().split('T')[0],
          }));
        }

        if (clientsRes.status === 200 && Array.isArray(clientsRes.data)) {
          updated.clients = clientsRes.data.map((c: any) => ({
            id: c.id,
            code: c.code,
            companyName: c.companyName,
            tradeName: c.tradeName,
            cnpj: c.cnpj,
            isPreliminaryCnpj: Boolean(c.isPreliminaryCnpj),
            stateRegistration: c.stateRegistration,
            contactName: c.contactName,
            phone: c.phone,
            email: c.email,
            address: c.address,
            city: c.city,
            state: c.state,
            segment: c.segment,
            standardUniformNotes: c.standardUniformNotes || '',
            totalOrdersCount: Number(c.totalOrdersCount ?? 0),
            totalSpent: Number(c.totalSpent ?? 0),
            metrics: c.metrics,
            isDemo: c.isDemo,
            createdAt: c.createdAt ? c.createdAt.split('T')[0] : '2026-01-01',
          }));
        }

        if (finRes.status === 200 && Array.isArray(finRes.data)) {
          updated.finance = finRes.data.map((f: any) => ({
            id: f.id,
            transactionNumber: f.transactionNumber || f.id,
            productionOrderId: f.productionOrderId,
            quoteId: f.quoteId,
            type: f.type,
            subType: f.subType,
            description: f.description,
            category: f.category,
            amount: Number(f.amount ?? 0),
            dueDate: f.dueDate,
            paidDate: f.paidDate,
            status: f.status,
            paymentMethod: f.paymentMethod,
            referenceId: f.referenceId,
            receiptEvidenceUrl: f.receiptEvidenceUrl,
            receiptVoucherNumber: f.receiptVoucherNumber,
            confirmedById: f.confirmedById,
            confirmedByName: f.confirmedByName,
            confirmationNotes: f.confirmationNotes,
            isDemo: f.isDemo,
          }));
        } else if (finRes.status === 403) {
          updated.finance = [];
        }

        return updated;
      });
    } catch (err) {
      console.warn('⚠️ [ERP Frontend] Falha ao sincronizar dados com o backend:', err);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchServerState();
  }, [fetchServerState]);

  // =========================================================================
  // ORDERS ACTIONS (Backend-Authoritative)
  // =========================================================================
  const handleSaveOrder = async (savedOrder: ProductionOrder): Promise<boolean> => {
    const exists = state.orders.some((o) => o.id === savedOrder.id);
    const res = exists
      ? await api.updateOrder(savedOrder.id, savedOrder)
      : await api.createOrder(savedOrder);

    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Erro ao salvar Ordem de Produção', res.error || `Falha HTTP ${res.status}`);
      return false;
    }

    await fetchServerState();
    setEditingOrder(null);
    notify(
      'success',
      exists ? 'OP atualizada' : 'OP emitida com Gate A.3.2',
      exists
        ? `Ficha técnica da OP ${res.data?.orderNumber || savedOrder.orderNumber || savedOrder.id} atualizada.`
        : `OP ${res.data?.orderNumber} criada em 'Aguardando Liberação' até quitação do sinal 50% e aprovação de arte.`
    );
    return true;
  };

  const handleEditOrder = (order: ProductionOrder) => {
    setEditingOrder(order);
    setIsNewOrderModalOpen(true);
  };

  const handleDeleteOrder = (orderId: string) => {
    const target = state.orders.find((o) => o.id === orderId);
    const label = target?.orderNumber || orderId;
    setConfirmDialog({
      title: `Excluir Ordem de Produção ${label}?`,
      message: 'Esta operação remove a OP do servidor e será registrada na trilha de auditoria. OPs entregues, com custódia aberta em facção ou com títulos liquidados são protegidas pelo servidor.',
      confirmLabel: 'Excluir OP',
      onConfirm: async () => {
        const res = await api.deleteOrder(orderId);
        if (res.status < 200 || res.status >= 300) {
          notify('error', 'Exclusão negada', res.error || `Falha HTTP ${res.status}`);
          return;
        }
        await fetchServerState();
        notify('success', 'OP excluída', `Ordem de Produção ${label} removida com sucesso.`);
      },
    });
  };

  const handleUpdateOrderStage = async (orderId: string, nextStage: OperationalStage, reason?: string) => {
    const res = await api.advanceOrderStage(orderId, nextStage, reason);
    if (res.status < 200 || res.status >= 300) {
      const title =
        res.code === 'GATE_A32_BLOCKED'
          ? 'Portão Fabril Bloqueado (Gate A.3.2)'
          : res.code === 'INVALID_STAGE_TRANSITION'
            ? 'Transição de Etapa Não Permitida'
            : res.code === 'REOPEN_DELIVERED_REQUIRES_ADMIN'
              ? 'Reabertura Restrita à Diretoria'
              : 'Avanço de etapa não permitido';
      notify('error', title, res.error || `Servidor rejeitou a transição com HTTP ${res.status}.`);
      return;
    }

    await fetchServerState();
    notify('success', 'Etapa atualizada', res.data?.message || `OP avançada para ${nextStage}.`);
  };

  // PRD Gate 2: Aprovação formal da Arte / Layout (Autoritativa no Backend)
  const handleApproveArt = async (orderId: string, approverName?: string, notes?: string) => {
    const resolvedApprover = (approverName || '').trim() || user?.fullName || 'Cliente (WhatsApp)';
    const res = await api.approveOrderArt(orderId, resolvedApprover, notes?.trim() || undefined);
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Falha ao aprovar arte', res.error || `Falha HTTP ${res.status}`);
      return;
    }

    await fetchServerState();
    notify(
      res.data?.alreadyApproved ? 'info' : 'success',
      res.data?.alreadyApproved ? 'Arte já estava aprovada' : 'Arte final aprovada',
      res.data?.message || `Aprovação formal de ${resolvedApprover} registrada na OP e na trilha de auditoria.`
    );
  };

  // =========================================================================
  // QUOTES ACTIONS (Backend-Authoritative)
  // =========================================================================
  const handleSaveQuote = async (quote: Quote, isEdit = false): Promise<boolean> => {
    const res = isEdit
      ? await api.updateQuote(quote.id, quote)
      : await api.createQuote(quote);
    if (res.status < 200 || res.status >= 300) {
      notify(
        'error',
        res.status === 403 ? 'Alçada Comercial Violada (Adendo B.2.5)' : 'Erro ao salvar proposta',
        res.error || `Falha HTTP ${res.status}`
      );
      return false;
    }

    await fetchServerState();
    setEditingQuote(null);
    notify(
      'success',
      isEdit ? 'Proposta revisada' : 'Proposta emitida',
      isEdit
        ? `Proposta ${res.data?.quoteNumber || quote.quoteNumber || ''} atualizada para v${res.data?.version || quote.version}.`
        : `Proposta ${res.data?.quoteNumber || ''} salva com sucesso no servidor.`
    );
    return true;
  };

  const handleEditQuote = (quote: Quote) => {
    setEditingQuote(quote);
    setIsNewQuoteModalOpen(true);
  };

  const handleSendQuoteWhatsApp = async (quote: Quote) => {
    const targetPhone = quote.whatsAppProof?.contactId || quote.clientPhone;
    if (!targetPhone) {
      notify('error', 'Telefone ausente', 'O cliente não possui número de WhatsApp cadastrado.');
      return;
    }
    const res = await api.sendTemplateMessage({
      templateType: 'quote_ready',
      clientPhone: targetPhone,
      clientName: quote.clientName,
      quoteNumber: quote.quoteNumber || quote.id,
      amount: quote.totalAmount,
    });
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Falha no envio via WhatsApp', res.error || `Falha HTTP ${res.status}`);
      return;
    }
    notify(
      'success',
      'Proposta enviada no WhatsApp',
      `Resumo da ${quote.quoteNumber || quote.id} disparado para ${quote.clientName} (${targetPhone}).`
    );
  };

  const handleUpdateQuoteStatus = async (quoteId: string, status: CommercialStatus) => {
    const res = await api.updateQuoteStatus(quoteId, status);
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Erro ao alterar status da proposta', res.error || `Falha HTTP ${res.status}`);
      return;
    }
    await fetchServerState();
    notify('success', 'Status atualizado', `Status comercial alterado para '${status}'.`);
  };

  // Conversão Idempotente de Orçamento em Pedido (PRD A.3.1 e B.3 — 100% Backend)
  const handleConvertQuoteToOrder = async (quote: Quote) => {
    const idempotencyKey = `convert_quote_${quote.id}_v${quote.version || 1}`;
    const res = await api.convertQuoteToOrder(quote.id, idempotencyKey);

    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Falha na conversão da proposta', res.error || `Falha HTTP ${res.status}`);
      return;
    }

    await fetchServerState();

    if (selectedQuoteForPrint?.id === quote.id) {
      setSelectedQuoteForPrint(null);
    }

    const orderNum = res.data?.order?.orderNumber || '';
    notify(
      res.data?.alreadyConverted ? 'info' : 'success',
      res.data?.alreadyConverted ? 'Conversão Idempotente Preservada' : `OP ${orderNum} Gerada com Sucesso`,
      res.data?.message || `Proposta convertida na OP ${orderNum}. Aguarda sinal 50% no Financeiro e aprovação de arte.`
    );
    setCurrentTab('orders');
  };

  const handleDeleteQuote = (quoteId: string) => {
    const target = state.quotes.find((q) => q.id === quoteId);
    const label = target?.quoteNumber || quoteId;
    setConfirmDialog({
      title: `Excluir Proposta ${label}?`,
      message: 'Propostas já convertidas em Ordem de Produção não podem ser excluídas.',
      confirmLabel: 'Excluir Proposta',
      onConfirm: async () => {
        const res = await api.deleteQuote(quoteId);
        if (res.status < 200 || res.status >= 300) {
          notify('error', 'Exclusão negada', res.error || `Falha HTTP ${res.status}`);
          return;
        }
        await fetchServerState();
        notify('success', 'Proposta excluída', `Proposta ${label} removida com sucesso.`);
      },
    });
  };

  // Solicitação de orçamento originada no Portal Público (Ambiente 1 -> POST /api/leads)
  const handleRequestQuoteFromPortal = async (req: {
    clientName: string;
    companyName: string;
    phone: string;
    email: string;
    category: UniformCategory;
    estimatedQty: number;
    notes: string;
  }) => {
    const res = await api.submitPublicLead(req);
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Falha ao enviar solicitação', res.error || 'Tente novamente em instantes.');
      return;
    }

    if (isAuthenticated) {
      await fetchServerState();
    }
    notify(
      'success',
      `Lead ${res.data?.lead?.leadNumber || ''} registrado`,
      res.data?.message || 'Solicitação recebida com sucesso pela equipe comercial DE FARDAS.'
    );
  };

  // =========================================================================
  // INVENTORY ACTIONS (Backend-Authoritative + Movimentos Compensatórios)
  // =========================================================================
  const handleSaveInventoryItem = async (item: InventoryItem) => {
    const exists = state.inventory.some((i) => i.id === item.id);
    const payload = {
      name: item.name,
      category: item.category,
      unit: item.unit,
      physicalStock: item.currentStock,
      allocatedStock: item.allocatedStock,
      inPartnersCustodyStock: item.inPartnersCustodyStock,
      minStock: item.minStock,
      unitCostPrice: item.costPrice,
      supplier: item.supplier,
      location: item.location,
    };

    const res = exists
      ? await api.updateInventoryItem(item.id, payload)
      : await api.createInventoryItem(payload);

    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Erro no estoque', res.error || `Falha HTTP ${res.status}`);
      return;
    }

    await fetchServerState();
    notify('success', exists ? 'Insumo atualizado' : 'Insumo cadastrado', `${item.name} salvo no almoxarifado.`);
  };

  const handleDeleteInventoryItem = (itemId: string) => {
    const target = state.inventory.find((i) => i.id === itemId);
    setConfirmDialog({
      title: `Excluir insumo ${target?.code || ''}?`,
      message: 'Itens com saldo em poder de terceiros (facções) não podem ser excluídos.',
      confirmLabel: 'Excluir Insumo',
      onConfirm: async () => {
        const res = await api.deleteInventoryItem(itemId);
        if (res.status < 200 || res.status >= 300) {
          notify('error', 'Exclusão bloqueada', res.error || `Falha HTTP ${res.status}`);
          return;
        }
        await fetchServerState();
        notify('success', 'Insumo removido', `${target?.name || 'Item'} excluído do almoxarifado.`);
      },
    });
  };

  const handleCreateStockMovement = async (payload: {
    itemId: string;
    type: 'entrada_compra' | 'saida_corte' | 'remessa_parceiro' | 'retorno_parceiro' | 'perda_tecnica' | 'ajuste_inventario';
    quantity: number;
    reason: string;
    referenceDoc?: string;
  }) => {
    const res = await api.createStockMovement(payload);
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Movimentação rejeitada', res.error || `Falha HTTP ${res.status}`);
      return false;
    }

    await fetchServerState();
    notify(
      'success',
      `Movimento ${res.data?.movement?.movementNumber || ''} registrado`,
      `Saldo atualizado com rastreabilidade auditável (${payload.type}).`
    );
    return true;
  };

  // =========================================================================
  // CLIENTS & LEADS ACTIONS (Backend-Authoritative)
  // =========================================================================
  const handleSaveClient = async (client: Client): Promise<boolean> => {
    const exists = state.clients.some((c) => c.id === client.id);
    const res = exists
      ? await api.updateClient(client.id, client)
      : await api.createClient(client);

    if (res.status < 200 || res.status >= 300) {
      notify(
        'error',
        res.status === 409 ? 'CNPJ já cadastrado' : 'Erro ao salvar cliente',
        res.error || `Falha HTTP ${res.status}`
      );
      return false;
    }

    await fetchServerState();
    notify('success', exists ? 'Cliente atualizado' : 'Cliente cadastrado', `${client.companyName} salvo na carteira B2B.`);
    return true;
  };

  const handleUpdateLeadStatus = async (leadId: string, status: LeadItem['status']): Promise<boolean> => {
    const res = await api.updateLeadStatus(leadId, status);
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Erro ao atualizar lead', res.error || `Falha HTTP ${res.status}`);
      return false;
    }
    await fetchServerState();
    notify('success', 'Status do lead atualizado', `Lead movido para '${status}'.`);
    return true;
  };

  const handleOpenClientWhatsApp = async (target: { id?: string; name: string; phone: string }) => {
    const res = await api.startConversation({
      phone: target.phone,
      customerName: target.name,
      clientId: target.id,
    });
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'WhatsApp indisponível', res.error || `Falha HTTP ${res.status}`);
      return;
    }
    setCurrentTab('whatsapp');
    notify(
      'success',
      'Conversa aberta na Central WhatsApp',
      `Atendimento com ${target.name} (${target.phone}) pronto para envio.`
    );
  };

  const handleDeleteClient = (clientId: string) => {
    const target = state.clients.find((c) => c.id === clientId);
    setConfirmDialog({
      title: `Excluir cliente ${target?.tradeName || ''}?`,
      message: 'Clientes com histórico de Ordens de Produção, propostas comerciais ou títulos financeiros não podem ser excluídos.',
      confirmLabel: 'Excluir Cliente',
      onConfirm: async () => {
        const res = await api.deleteClient(clientId);
        if (res.status < 200 || res.status >= 300) {
          notify('error', 'Exclusão bloqueada', res.error || `Falha HTTP ${res.status}`);
          return;
        }
        await fetchServerState();
        notify('success', 'Cliente excluído', `${target?.tradeName || 'Cliente'} removido da carteira.`);
      },
    });
  };

  // =========================================================================
  // PARTNERS & OUTSOURCED CUSTODY ACTIONS (Backend-Authoritative)
  // =========================================================================
  const handleSavePartner = async (payload: Partial<Partner>, existingId?: string): Promise<boolean> => {
    const res = existingId
      ? await api.updatePartner(existingId, payload)
      : await api.createPartner(payload);

    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Erro ao salvar parceiro', res.error || `Falha HTTP ${res.status}`);
      return false;
    }

    await fetchServerState();
    notify(
      'success',
      existingId ? 'Parceiro atualizado' : 'Parceiro homologado',
      `${res.data?.tradeName || payload.tradeName || 'Parceiro'} (${res.data?.code || ''}) salvo com sucesso.`
    );
    return true;
  };

  const handleDeletePartner = (partnerId: string) => {
    const target = partners.find((p) => p.id === partnerId);
    setConfirmDialog({
      title: `Excluir parceiro ${target?.tradeName || ''}?`,
      message: 'Parceiros com materiais em custódia aberta ou OPs em andamento não podem ser excluídos (prefira inativar).',
      confirmLabel: 'Excluir Parceiro',
      onConfirm: async () => {
        const res = await api.deletePartner(partnerId);
        if (res.status < 200 || res.status >= 300) {
          notify('error', 'Exclusão bloqueada', res.error || `Falha HTTP ${res.status}`);
          return;
        }
        await fetchServerState();
        notify('success', 'Parceiro excluído', `${target?.tradeName || 'Parceiro'} removido da base.`);
      },
    });
  };

  const handleDispatchPartnerCustody = async (
    partnerId: string,
    payload: {
      itemId: string;
      productionOrderId?: string;
      sentQuantity: number;
      notes?: string;
    }
  ): Promise<boolean> => {
    const res = await api.dispatchPartnerCustody(partnerId, payload);
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Remessa rejeitada', res.error || `Falha HTTP ${res.status}`);
      return false;
    }
    await fetchServerState();
    notify(
      'success',
      `Remessa ${res.data?.movement?.movementNumber || ''} registrada`,
      'Material transferido do Estoque Físico para Em Poder de Terceiros com rastreabilidade auditável.'
    );
    return true;
  };

  const handleReturnPartnerCustody = async (
    custodyId: string,
    payload: {
      returnedQuantity: number;
      lostQuantity: number;
      returnToPhysicalStock: boolean;
      notes?: string;
    }
  ): Promise<boolean> => {
    const res = await api.returnPartnerCustody(custodyId, payload);
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Baixa de custódia rejeitada', res.error || `Falha HTTP ${res.status}`);
      return false;
    }
    await fetchServerState();
    notify(
      'success',
      'Baixa de custódia registrada',
      payload.returnToPhysicalStock
        ? 'Devolução lançada no estoque físico com evento compensatório.'
        : 'Consumo/perda confirmada com atualização do saldo em poder de terceiros.'
    );
    return true;
  };

  const handleOpenPartnerWhatsApp = async (partner: Partner) => {
    const res = await api.startConversation({
      phone: partner.phone,
      customerName: `${partner.tradeName} (${partner.code})`,
    });
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'WhatsApp indisponível', res.error || `Falha HTTP ${res.status}`);
      return;
    }
    setCurrentTab('whatsapp');
    notify(
      'success',
      'Conversa aberta na Central WhatsApp',
      `Atendimento com ${partner.tradeName} (${partner.phone}) pronto para envio.`
    );
  };

  // =========================================================================
  // FINANCIAL ACTIONS (Backend-Authoritative)
  // =========================================================================
  const handleSaveTransaction = async (trx: FinancialTransaction) => {
    const res = await api.createTransaction(trx);
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Erro ao lançar título', res.error || `Falha HTTP ${res.status}`);
      return;
    }

    await fetchServerState();
    notify('success', 'Lançamento registrado', `Título ${res.data?.transactionNumber || ''} salvo no financeiro.`);
  };

  const handleDeleteTransaction = (trxId: string) => {
    const target = state.finance.find((f) => f.id === trxId);
    setConfirmDialog({
      title: `Excluir título ${target?.transactionNumber || ''}?`,
      message: 'Títulos já liquidados não podem ser excluídos; apenas lançamentos pendentes podem ser removidos por administradores.',
      confirmLabel: 'Excluir Título',
      onConfirm: async () => {
        const res = await api.deleteTransaction(trxId);
        if (res.status < 200 || res.status >= 300) {
          notify('error', 'Exclusão bloqueada', res.error || `Falha HTTP ${res.status}`);
          return;
        }
        await fetchServerState();
        notify('success', 'Lançamento excluído', `Título ${target?.transactionNumber || ''} removido.`);
      },
    });
  };

  // Quitação de título com comprovante bancário real e liberação automática do sinal da OP (Portão A.3.2)
  const handleConfirmPaymentWithVoucher = async (
    trxId: string,
    voucherNumber: string,
    evidenceUrl: string,
    notes: string,
    paymentMethod?: FinancialTransaction['paymentMethod']
  ) => {
    const res = await api.confirmPayment(trxId, {
      receiptVoucherNumber: voucherNumber,
      receiptEvidenceUrl: evidenceUrl,
      confirmationNotes: notes,
      paymentMethod,
    });

    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Liquidação rejeitada', res.error || `Falha HTTP ${res.status}`);
      return false;
    }

    await fetchServerState();
    notify(
      'success',
      'Pagamento liquidado com comprovante',
      res.data?.message || 'Baixa financeira registrada com sucesso.'
    );
    return true;
  };

  // Estorno compensatório auditável (títulos liquidados nunca são apagados)
  const handleReverseTransaction = async (trxId: string, reason: string) => {
    const res = await api.reverseTransaction(trxId, reason);
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Estorno negado', res.error || `Falha HTTP ${res.status}`);
      return false;
    }

    await fetchServerState();
    notify(
      'info',
      'Estorno compensatório registrado',
      res.data?.message || 'Título estornado com registro em auditoria.'
    );
    return true;
  };

  // Profile, Server-Synced Backup Restore & Cache Reset
  const handleSaveProfile = (profile: CompanyProfile) => {
    setState((prev) => ({ ...prev, profile }));
    notify('success', 'Perfil atualizado', 'Dados institucionais e logomarca salvos para todos os documentos.');
  };

  const handleRestoreState = async (restored: ERPState) => {
    setState(restored);
    saveERPState(restored);

    const syncRes = await api.importLocalStorageData({
      clients: restored.clients,
      inventory: restored.inventory,
      orders: restored.orders,
      quotes: restored.quotes,
      finance: restored.finance,
    });

    if (syncRes.status >= 200 && syncRes.status < 300) {
      await fetchServerState();
      // Preserva explicitamente o perfil institucional e logomarca restaurados do backup
      setState((prev) => ({ ...prev, profile: restored.profile }));
      const stats = syncRes.data?.stats;
      const summary = stats
        ? `Backup restaurado e sincronizado no servidor (+${stats.importedClientsCount} clientes, +${stats.importedInventoryCount} insumos, +${stats.importedQuotesCount} orçamentos, +${stats.importedOrdersCount} OPs, +${stats.importedFinanceCount} títulos).`
        : 'Backup JSON restaurado e sincronizado com o servidor.';
      notify('success', 'Backup restaurado e sincronizado', summary);
      return { syncedToServer: true, summary };
    }

    const fallbackSummary =
      'Backup JSON aplicado localmente (incluindo perfil e logomarca). Sincronização com servidor indisponível no momento.';
    notify('info', 'Backup restaurado localmente', syncRes.error || fallbackSummary);
    return { syncedToServer: false, summary: fallbackSummary };
  };

  const handleResetToDefaults = (preserveProfile: boolean = true) => {
    const fresh = resetERPState(preserveProfile ? state.profile : undefined);
    setState(fresh);
    fetchServerState();
    notify(
      'info',
      'Cache local ressincronizado',
      preserveProfile
        ? 'Cache local limpo e ressincronizado com o servidor mantendo os dados e a logo da empresa.'
        : 'Cache local e perfil institucional restaurados aos padrões.'
    );
  };

  // Redirecionar aba restrita automaticamente caso o perfil logado não possua alçada RBAC
  useEffect(() => {
    if (!isAuthenticated || !user?.role) return;
    const role = user.role;
    if (currentTab === 'finance' && !['admin', 'financeiro', 'gerente_comercial'].includes(role)) {
      setCurrentTab('dashboard');
    } else if (
      currentTab === 'partners' &&
      !['admin', 'gerente_comercial', 'pcp_producao', 'expedicao_qualidade', 'financeiro'].includes(role)
    ) {
      setCurrentTab('dashboard');
    } else if (currentTab === 'whatsapp' && !['admin', 'gerente_comercial', 'vendedor', 'financeiro'].includes(role)) {
      setCurrentTab('dashboard');
    } else if (currentTab === 'settings' && role !== 'admin') {
      setCurrentTab('dashboard');
    }
  }, [isAuthenticated, user?.role, currentTab]);

  // Real operational counts for Sidebar badges & capacity bar
  const activeOrders = state.orders.filter((o) => o.stage !== 'entregue');
  const activeOrdersCount = activeOrders.length;
  const activePiecesCount = activeOrders.reduce((sum, o) => sum + (o.totalPieces || 0), 0);
  const blockedOrdersCount = activeOrders.filter((o) => !o.canStartProduction).length;
  const lowStockCount = state.inventory.filter((i) => i.currentStock <= i.minStock).length;
  const openCustodyCount = partnerCustody.filter(
    (c) => c.status === 'em_custodia' || c.status === 'devolvido_parcial'
  ).length;
  const newLeadsCount = leads.filter((l) => l.status === 'novo').length;
  const pendingQuotesCount = state.quotes.filter(
    (q) => q.status === 'enviado' || q.status === 'em_negociacao' || q.status === 'aprovado'
  ).length;
  const todayISO = new Date().toISOString().split('T')[0];
  const pendingDownpaymentsCount = state.finance.filter(
    (f) => f.type === 'receber' && f.subType === 'entrada_pedido' && (f.status === 'pendente' || f.status === 'atrasado')
  ).length;
  const overdueFinanceCount = state.finance.filter(
    (f) => f.status === 'atrasado' || (f.status === 'pendente' && f.dueDate && f.dueDate < todayISO)
  ).length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white select-none">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-slate-300 font-semibold tracking-wide">DE FARDAS ERP</p>
        <p className="text-xs text-slate-500 mt-1">Verificando sessão segura...</p>
      </div>
    );
  }

  // Visitante não autenticado navegando na Vitrine Pública (Ambiente 1 isolado — sem Sidebar interna!)
  if (!isAuthenticated && currentTab === 'portal') {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col">
        <header className="sticky top-0 z-30 bg-slate-950 text-white border-b border-slate-800 px-4 sm:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {state.profile.logoUrl ? (
              <div className="h-8 max-w-[110px] bg-white rounded-md px-1.5 py-0.5 flex items-center justify-center overflow-hidden">
                <img
                  src={state.profile.logoUrl}
                  alt={`Logomarca ${state.profile.tradeName}`}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : (
              <ShieldCheck className="w-5 h-5 text-blue-400" />
            )}
            <span className="font-bold tracking-tight text-sm">{state.profile.tradeName || 'DE FARDAS'}</span>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              · Vitrine Digital & Catálogo B2B ({state.profile.city} - {state.profile.state})
            </span>
          </div>
          <button
            onClick={() => setCurrentTab('dashboard')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Acesso Interno ERP</span>
          </button>
        </header>

        {toast && (
          <div className="max-w-4xl mx-auto w-full px-4 pt-4">
            <div className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 ${
              toast.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}>
              <div>
                <div className="font-bold">{toast.title}</div>
                <div className="mt-0.5">{toast.message}</div>
              </div>
              <button onClick={() => setToast(null)} className="p-0.5 opacity-60 hover:opacity-100 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          <PublicPortalView
            catalog={state.catalog}
            profile={state.profile}
            onRequestQuote={handleRequestQuoteFromPortal}
          />
        </main>
      </div>
    );
  }

  // Se o usuário não está autenticado e não está na vitrine pública, exige login
  if (!isAuthenticated) {
    return <LoginView onGoToPortal={() => setCurrentTab('portal')} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-900 antialiased">
      {/* Primary Left Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        activeOrdersCount={activeOrdersCount}
        activePiecesCount={activePiecesCount}
        blockedOrdersCount={blockedOrdersCount}
        lowStockCount={lowStockCount}
        openCustodyCount={openCustodyCount}
        newLeadsCount={newLeadsCount}
        pendingQuotesCount={pendingQuotesCount}
        pendingDownpaymentsCount={pendingDownpaymentsCount}
        overdueFinanceCount={overdueFinanceCount}
        profile={state.profile}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebarCollapse}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onOpenNewOrderModal={() => {
          setEditingOrder(null);
          setIsNewOrderModalOpen(true);
        }}
        onOpenNewQuoteModal={() => setIsNewQuoteModalOpen(true)}
        onOpenHelpManual={() => setIsHelpManualOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Sleek Top Bar */}
        <Header
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          onOpenNewOrderModal={() => {
            setEditingOrder(null);
            setIsNewOrderModalOpen(true);
          }}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)}
          lowStockCount={lowStockCount}
          onOpenHelpManual={() => setIsHelpManualOpen(true)}
          onOpenAuditModal={() => setIsAuditModalOpen(true)}
        />

        {/* In-App Toast Notification Banner */}
        {toast && (
          <div className="px-4 sm:px-6 lg:px-8 pt-3 shrink-0">
            <div className={`max-w-7xl mx-auto p-3.5 rounded-xl border shadow-xs flex items-start justify-between gap-3 text-xs ${
              toast.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : toast.type === 'info'
                ? 'bg-blue-50 border-blue-200 text-blue-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}>
              <div className="flex items-start gap-2.5">
                {toast.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold">{toast.title}</div>
                  <div className="mt-0.5 leading-relaxed">{toast.message}</div>
                </div>
              </div>
              <button
                onClick={() => setToast(null)}
                className="p-1 opacity-60 hover:opacity-100 rounded cursor-pointer"
                aria-label="Fechar notificação"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Viewport Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            {currentTab === 'portal' && (
              <PublicPortalView
                catalog={state.catalog}
                profile={state.profile}
                onRequestQuote={handleRequestQuoteFromPortal}
              />
            )}

            {currentTab === 'dashboard' && (
              <DashboardView
                profile={state.profile}
                orders={state.orders}
                quotes={state.quotes}
                inventory={state.inventory}
                finance={state.finance}
                onSelectTab={setCurrentTab}
                onOpenNewOrderModal={() => {
                  setEditingOrder(null);
                  setIsNewOrderModalOpen(true);
                }}
                onOpenNewQuoteModal={() => setIsNewQuoteModalOpen(true)}
                onSelectOrderForTicket={(order) => setSelectedOrderForTicket(order)}
              />
            )}

            {currentTab === 'orders' && (
              <ProductionOrdersView
                orders={state.orders}
                onOpenNewOrderModal={() => {
                  setEditingOrder(null);
                  setIsNewOrderModalOpen(true);
                }}
                onEditOrder={handleEditOrder}
                onDeleteOrder={handleDeleteOrder}
                onUpdateOrderStage={handleUpdateOrderStage}
                onOpenPrintTicket={(order) => setSelectedOrderForTicket(order)}
                onGoToFinanceForPayment={() => setCurrentTab('finance')}
                onApproveArt={handleApproveArt}
              />
            )}

            {currentTab === 'quotes' && (
              <QuotesView
                quotes={state.quotes}
                onOpenNewQuoteModal={() => {
                  setEditingQuote(null);
                  setIsNewQuoteModalOpen(true);
                }}
                onEditQuote={handleEditQuote}
                onOpenPrintQuote={(quote) => setSelectedQuoteForPrint(quote)}
                onUpdateQuoteStatus={handleUpdateQuoteStatus}
                onConvertQuoteToOrder={handleConvertQuoteToOrder}
                onSendQuoteWhatsApp={handleSendQuoteWhatsApp}
                onDeleteQuote={handleDeleteQuote}
              />
            )}

            {currentTab === 'inventory' && (
              <InventoryView
                inventory={state.inventory}
                onSaveItem={handleSaveInventoryItem}
                onDeleteItem={handleDeleteInventoryItem}
                onCreateStockMovement={handleCreateStockMovement}
              />
            )}

            {currentTab === 'partners' && (
              <PartnersView
                partners={partners}
                custodyList={partnerCustody}
                inventory={state.inventory}
                orders={state.orders}
                onSavePartner={handleSavePartner}
                onDeletePartner={handleDeletePartner}
                onDispatchCustody={handleDispatchPartnerCustody}
                onReturnCustody={handleReturnPartnerCustody}
                onCreateServicePayable={handleSaveTransaction}
                onOpenWhatsApp={handleOpenPartnerWhatsApp}
                onNavigateTab={setCurrentTab}
              />
            )}

            {currentTab === 'clients' && (
              <ClientsView
                clients={state.clients}
                leads={leads}
                onSaveClient={handleSaveClient}
                onDeleteClient={handleDeleteClient}
                onSelectClientForQuote={(client) => {
                  setEditingQuote(null);
                  setQuoteInitialClientId(client.id);
                  setIsNewQuoteModalOpen(true);
                }}
                onOpenWhatsApp={handleOpenClientWhatsApp}
                onUpdateLeadStatus={handleUpdateLeadStatus}
                onNavigateTab={setCurrentTab}
              />
            )}

            {currentTab === 'finance' && (
              <FinancialView
                profile={state.profile}
                transactions={state.finance}
                orders={state.orders}
                onSaveTransaction={handleSaveTransaction}
                onDeleteTransaction={handleDeleteTransaction}
                onConfirmPaymentWithVoucher={handleConfirmPaymentWithVoucher}
                onReverseTransaction={handleReverseTransaction}
              />
            )}

            {currentTab === 'whatsapp' && (
              <WhatsAppOmnichannelView clients={state.clients} profile={state.profile} />
            )}

            {currentTab === 'settings' && (
              <SettingsView
                profile={state.profile}
                fullState={state}
                onSaveProfile={handleSaveProfile}
                onRestoreState={handleRestoreState}
                onResetToDefaults={handleResetToDefaults}
              />
            )}
          </div>
        </main>
      </div>

      {/* In-App Confirmation Modal (substitui window.confirm) */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">{confirmDialog.title}</h3>
              <button
                onClick={() => setConfirmDialog(null)}
                className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 text-xs text-slate-600 leading-relaxed">
              {confirmDialog.message}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 text-xs">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const fn = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  await fn();
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg cursor-pointer"
              >
                {confirmDialog.confirmLabel || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: New/Edit Production Order */}
      {isNewOrderModalOpen && (
        <NewOrderModal
          clients={state.clients}
          partners={partners}
          existingOrder={editingOrder}
          onClose={() => {
            setIsNewOrderModalOpen(false);
            setEditingOrder(null);
          }}
          onSaveOrder={handleSaveOrder}
        />
      )}

      {/* Modal: New/Edit Commercial Quote with PRD Pricing Engine */}
      {isNewQuoteModalOpen && (
        <NewQuoteModal
          clients={state.clients}
          existingQuote={editingQuote}
          initialClientId={quoteInitialClientId}
          onClose={() => {
            setIsNewQuoteModalOpen(false);
            setEditingQuote(null);
            setQuoteInitialClientId(null);
          }}
          onSaveQuote={handleSaveQuote}
        />
      )}

      {/* Modal: Printable Manufacturing Ticket (Ficha de Produção Fabril) */}
      {selectedOrderForTicket && (
        <PrintOrderTicketModal
          order={selectedOrderForTicket}
          profile={state.profile}
          onClose={() => setSelectedOrderForTicket(null)}
        />
      )}

      {/* Modal: Printable Commercial Proposal (Proposta Comercial B2B) */}
      {selectedQuoteForPrint && (
        <PrintQuoteModal
          quote={selectedQuoteForPrint}
          profile={state.profile}
          onClose={() => setSelectedQuoteForPrint(null)}
          onApproveAndConvertToOrder={handleConvertQuoteToOrder}
        />
      )}

      {/* Modal: Interactive Operating Manual & Business Rules PRD v1.6 */}
      {isHelpManualOpen && (
        <HelpManualModal onClose={() => setIsHelpManualOpen(false)} />
      )}

      {/* Modal: Foundation P0 Audit, Tests & Database Invariants */}
      {isAuditModalOpen && (
        <FoundationAuditModal
          isOpen={isAuditModalOpen}
          onClose={() => {
            setIsAuditModalOpen(false);
            fetchServerState();
          }}
        />
      )}
    </div>
  );
}
