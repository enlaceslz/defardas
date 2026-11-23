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
import { SuppliersView } from './components/SuppliersView';

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
  PartnerFinancialForecastResponse,
  LeadItem,
  NotificationsPayload,
  SystemNotificationItem,
  Supplier,
  PurchaseOrder,
  PurchaseOrderStatus,
  SuppliersSummaryResponse,
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
  const [partnerForecast, setPartnerForecast] = useState<PartnerFinancialForecastResponse | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliersSummary, setSuppliersSummary] = useState<SuppliersSummaryResponse | null>(null);
  const [preselectedReplenish, setPreselectedReplenish] = useState<{ itemId: string; supplierId?: string } | null>(null);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [notificationsPayload, setNotificationsPayload] = useState<NotificationsPayload | null>(null);
  const [whatsappUnreadCount, setWhatsappUnreadCount] = useState<number>(0);
  const [whatsappHandoff, setWhatsappHandoff] = useState<{
    conversationId: string;
    draftMessage?: string;
  } | null>(null);
  const [focusedScheduleOrderId, setFocusedScheduleOrderId] = useState<string | null>(null);
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
      const [
        ordersRes,
        quotesRes,
        invRes,
        clientsRes,
        finRes,
        partnersRes,
        custodyRes,
        forecastRes,
        suppliersRes,
        purchaseOrdersRes,
        suppliersSummaryRes,
        leadsRes,
        notificationsRes,
        whatsappSummaryRes,
      ] = await Promise.all([
        api.getOrders(),
        api.getQuotes(),
        api.getInventoryItems(),
        api.getClients(),
        api.getTransactions(),
        api.getPartners(),
        api.getPartnerCustody(),
        api.getPartnersFinancialForecast(),
        api.getSuppliers(),
        api.getPurchaseOrders(),
        api.getSuppliersSummary(),
        api.getLeads(),
        api.getNotifications(),
        ['admin', 'gerente_comercial', 'vendedor', 'financeiro'].includes(user?.role || '')
          ? api.getWhatsAppUnreadSummary()
          : Promise.resolve({ status: 403, data: undefined }),
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

      if (forecastRes.status === 200 && forecastRes.data) {
        setPartnerForecast(forecastRes.data);
      } else if (forecastRes.status === 403) {
        setPartnerForecast(null);
      }

      if (suppliersRes.status === 200 && Array.isArray(suppliersRes.data)) {
        setSuppliers(suppliersRes.data);
      } else if (suppliersRes.status === 403) {
        setSuppliers([]);
      }

      if (purchaseOrdersRes.status === 200 && Array.isArray(purchaseOrdersRes.data)) {
        setPurchaseOrders(purchaseOrdersRes.data);
      } else if (purchaseOrdersRes.status === 403) {
        setPurchaseOrders([]);
      }

      if (suppliersSummaryRes.status === 200 && suppliersSummaryRes.data) {
        setSuppliersSummary(suppliersSummaryRes.data);
      } else if (suppliersSummaryRes.status === 403) {
        setSuppliersSummary(null);
      }

      if (leadsRes.status === 200 && Array.isArray(leadsRes.data)) {
        setLeads(leadsRes.data);
      } else if (leadsRes.status === 403) {
        setLeads([]);
      }

      if (notificationsRes.status === 200 && notificationsRes.data) {
        setNotificationsPayload(notificationsRes.data);
      } else if (notificationsRes.status === 401 || notificationsRes.status === 403) {
        setNotificationsPayload(null);
      }

      if (whatsappSummaryRes.status === 200 && whatsappSummaryRes.data) {
        setWhatsappUnreadCount(Number(whatsappSummaryRes.data.totalUnread || 0));
      } else if (whatsappSummaryRes.status === 401 || whatsappSummaryRes.status === 403) {
        setWhatsappUnreadCount(0);
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
            artStatus: o.artStatus || (o.artApproved ? 'aprovada' : 'pendente'),
            artApproved: Boolean(o.artApproved),
            artApprovalDate: o.artApprovalDate,
            artApprovedBy: o.artApprovedBy,
            artFileUrl: o.artFileUrl,
            artVersionNumber: o.artVersionNumber,
            artRevisionNotes: o.artRevisionNotes,
            entryPaymentConfirmed: Boolean(o.entryPaymentConfirmed),
            entryReceiptUrl: o.entryReceiptUrl,
            canStartProduction: Boolean(o.entryPaymentConfirmed && o.artApproved),
            outsourcedPartner: o.outsourcedPartner,
            partnerCostPerPiece: o.partnerCostPerPiece !== undefined ? Number(o.partnerCostPerPiece) : undefined,
            priority: o.priority,
            creationDate: o.creationDate,
            targetDeliveryDate: o.targetDeliveryDate,
            completionDate: o.completionDate,
            stageSchedule: o.stageSchedule,
            deadlineSummary: o.deadlineSummary,
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
              clientPhone: client?.phone || '',
              clientEmail: client?.email || '',
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
              artStatus: q.artStatus || (q.artApproved ? 'aprovada' : 'pendente'),
              artApproved: Boolean(q.artApproved),
              artApprovedBy: q.artApprovedBy,
              artApprovalDate: q.artApprovalDate,
              artFileUrl: q.artFileUrl,
              artNotes: q.artNotes,
              artVersions: Array.isArray(q.artVersions) ? q.artVersions : [],
              versionHistory: Array.isArray(q.versionHistory) ? q.versionHistory : [],
              approvedByName: q.approvedByName,
              approvedAt: q.approvedAt,
              acceptanceChannel: q.acceptanceChannel,
              acceptanceNotes: q.acceptanceNotes,
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
            supplierId: i.supplierId,
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
            orderNumber: f.orderNumber,
            partnerId: f.partnerId,
            partnerName: f.partnerName,
            supplierId: f.supplierId,
            supplierName: f.supplierName,
            purchaseOrderId: f.purchaseOrderId,
            purchaseOrderNumber: f.purchaseOrderNumber,
            clientId: f.clientId,
            clientName: f.clientName,
            serviceReference: f.serviceReference,
            isProvision: Boolean(f.isProvision),
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
  }, [isAuthenticated, user?.role]);

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
      notify(
        'error',
        'Telefone ausente',
        'O cliente não possui número de WhatsApp cadastrado. Atualize o telefone na Carteira de Clientes.'
      );
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
    if (res.data?.message?.status === 'failed') {
      notify(
        'error',
        'Falha na entrega pelo provedor WhatsApp',
        res.data?.message?.errorMessage ||
          'A mensagem foi registrada na Central WhatsApp, mas o provedor recusou o disparo.'
      );
      return;
    }
    notify(
      'success',
      'Proposta enviada no WhatsApp',
      `Resumo da ${quote.quoteNumber || quote.id} disparado para ${quote.clientName} (${targetPhone}).`
    );
  };

  const handleNotifyOrderWhatsApp = async (order: ProductionOrder) => {
    const client = state.clients.find((c) => c.id === order.clientId);
    const targetPhone = client?.phone || '';
    if (!targetPhone) {
      notify(
        'error',
        'Telefone ausente',
        `O cliente ${order.clientName} não possui número de WhatsApp cadastrado.`
      );
      return;
    }

    const res = !order.artApproved
      ? await api.sendTemplateMessage({
          templateType: 'art_approval',
          clientPhone: targetPhone,
          clientName: order.clientName,
          orderNumber: order.orderNumber,
          artVersion: order.artVersionNumber,
          artFileUrl: order.artFileUrl,
        })
      : await api.sendTemplateMessage({
          templateType: 'order_stage_update',
          clientPhone: targetPhone,
          clientName: order.clientName,
          orderNumber: order.orderNumber,
          stage: order.stage,
          targetDeliveryDate: order.targetDeliveryDate,
        });

    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Falha no envio via WhatsApp', res.error || `Falha HTTP ${res.status}`);
      return;
    }
    if (res.data?.message?.status === 'failed') {
      notify(
        'error',
        'Falha na entrega pelo provedor WhatsApp',
        res.data?.message?.errorMessage || 'Verifique a configuração do canal na Central WhatsApp.'
      );
      return;
    }

    notify(
      'success',
      !order.artApproved ? 'Aprovação de arte solicitada no WhatsApp' : 'Etapa da OP enviada no WhatsApp',
      `Mensagem da ${order.orderNumber} enviada para ${order.clientName} (${targetPhone}).`
    );
  };

  const handleSendTransactionWhatsApp = async (trx: FinancialTransaction) => {
    const linkedOrder =
      (trx.productionOrderId
        ? state.orders.find((o) => o.id === trx.productionOrderId)
        : undefined) ||
      (trx.referenceId ? state.orders.find((o) => o.orderNumber === trx.referenceId) : undefined);

    const client =
      (trx.clientId ? state.clients.find((c) => c.id === trx.clientId) : undefined) ||
      (linkedOrder ? state.clients.find((c) => c.id === linkedOrder.clientId) : undefined);

    const targetPhone = client?.phone || '';
    const clientName = client?.tradeName || trx.clientName || linkedOrder?.clientName || 'Cliente';

    if (!targetPhone) {
      notify(
        'error',
        'Telefone ausente',
        `Não foi possível localizar um telefone WhatsApp cadastrado para ${clientName}.`
      );
      return;
    }

    const isPaidDownpayment = trx.status === 'pago' && trx.subType === 'entrada_pedido';
    const res = isPaidDownpayment
      ? await api.sendTemplateMessage({
          templateType: 'downpayment_confirmed',
          clientPhone: targetPhone,
          clientName,
          orderNumber: linkedOrder?.orderNumber || trx.referenceId || trx.transactionNumber,
          voucherNumber: trx.receiptVoucherNumber || trx.transactionNumber,
        })
      : await api.sendTemplateMessage({
          templateType: 'payment_reminder',
          clientPhone: targetPhone,
          clientName,
          orderNumber: linkedOrder?.orderNumber || trx.referenceId || trx.transactionNumber,
          amount: trx.amount,
          dueDate: trx.dueDate,
          pixKey: state.profile.cnpj || undefined,
          paymentLabel:
            trx.subType === 'entrada_pedido'
              ? 'Sinal de 50% (Liberação de Produção)'
              : trx.subType === 'saldo_entrega'
                ? 'Saldo na Entrega (50%)'
                : trx.description,
        });

    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Falha no envio via WhatsApp', res.error || `Falha HTTP ${res.status}`);
      return;
    }
    if (res.data?.message?.status === 'failed') {
      notify(
        'error',
        'Falha na entrega pelo provedor WhatsApp',
        res.data?.message?.errorMessage || 'Verifique a configuração do canal na Central WhatsApp.'
      );
      return;
    }

    notify(
      'success',
      isPaidDownpayment ? 'Confirmação de sinal enviada no WhatsApp' : 'Lembrete financeiro enviado no WhatsApp',
      `Notificação referente a ${trx.transactionNumber} enviada para ${clientName} (${targetPhone}).`
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

  // Aprovação Comercial Auditável (suporta "Aprovou Orçamento mas Pediu Revisão na Arte")
  const handleApproveQuoteCommercial = async (
    quoteId: string,
    payload: {
      approvedByName: string;
      acceptanceChannel: 'whatsapp' | 'email' | 'presencial';
      acceptanceNotes?: string;
      artDecision: 'manter_pendente' | 'solicitar_revisao_arte' | 'aprovar_arte_atual';
      artRevisionNotes?: string;
      artApproverName?: string;
    },
    alsoConvertToOrder?: boolean
  ): Promise<boolean> => {
    const res = await api.approveQuoteCommercial(quoteId, payload);
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Erro na aprovação comercial', res.error || `Falha HTTP ${res.status}`);
      return false;
    }

    if (alsoConvertToOrder) {
      const targetQuote = state.quotes.find((q) => q.id === quoteId);
      const idempotencyKey = `convert_quote_${quoteId}_v${targetQuote?.version || 1}`;
      const convRes = await api.convertQuoteToOrder(quoteId, idempotencyKey);
      await fetchServerState();
      if (convRes.status < 200 || convRes.status >= 300) {
        notify(
          'info',
          'Orçamento aprovado, mas OP não gerada',
          convRes.error || 'Aprovação comercial registrada; tente converter para OP novamente.'
        );
        return true;
      }
      notify(
        'success',
        `Orçamento aprovado e OP ${convRes.data?.order?.orderNumber || ''} gerada`,
        res.data?.message || convRes.data?.message || 'Proposta aprovada e convertida com Gate A.3.2 ativo.'
      );
      setCurrentTab('orders');
      return true;
    }

    await fetchServerState();
    notify(
      'success',
      payload.artDecision === 'solicitar_revisao_arte'
        ? 'Orçamento Aprovado · Revisão de Arte Registrada'
        : 'Orçamento Aprovado Comercialmente',
      res.data?.message || 'Aceite comercial registrado na trilha de auditoria.'
    );
    return true;
  };

  const handleUploadQuoteArtwork = async (
    quoteId: string,
    payload: { fileName: string; fileUrl: string; notes?: string }
  ): Promise<boolean> => {
    const res = await api.uploadQuoteArtwork(quoteId, payload);
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Falha ao armazenar arte', res.error || `Falha HTTP ${res.status}`);
      return false;
    }
    await fetchServerState();
    notify(
      'success',
      `Arte v${res.data?.artwork?.version || ''} armazenada`,
      res.data?.message || 'Nova versão da arte salva e disponibilizada para validação.'
    );
    return true;
  };

  const handleRequestQuoteArtRevision = async (
    quoteId: string,
    payload: { revisionNotes: string; requestedBy?: string }
  ): Promise<boolean> => {
    const res = await api.requestQuoteArtRevision(quoteId, payload);
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Falha ao solicitar revisão de arte', res.error || `Falha HTTP ${res.status}`);
      return false;
    }
    await fetchServerState();
    notify(
      'info',
      'Revisão de Arte Registrada',
      res.data?.message || 'Ajustes da arte registrados mantendo a proposta comercial intacta.'
    );
    return true;
  };

  const handleApproveQuoteArtwork = async (
    quoteId: string,
    payload: { approverName: string; notes?: string; version?: number }
  ): Promise<boolean> => {
    const res = await api.approveQuoteArtwork(quoteId, payload);
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Falha ao aprovar arte', res.error || `Falha HTTP ${res.status}`);
      return false;
    }
    await fetchServerState();
    notify(
      'success',
      'Arte Aprovada Formalmente',
      res.data?.message || 'Critério de Arte do Gate A.3.2 liberado.'
    );
    return true;
  };

  const handleRequestOrderArtRevision = async (
    orderId: string,
    revisionNotes: string,
    requestedBy?: string
  ) => {
    const res = await api.requestOrderArtRevision(orderId, { revisionNotes, requestedBy });
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Revisão de arte bloqueada', res.error || `Falha HTTP ${res.status}`);
      return;
    }
    await fetchServerState();
    notify(
      'info',
      'Revisão de Arte Registrada na OP',
      res.data?.message || 'Gate A.3.2 manterá a OP bloqueada até aprovação da nova arte.'
    );
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
  const handleSaveInventoryItem = async (item: InventoryItem): Promise<boolean> => {
    const exists = state.inventory.some((i) => i.id === item.id);
    const payload = {
      name: item.name,
      category: item.category,
      unit: item.unit,
      physicalStock: item.currentStock,
      minStock: item.minStock,
      unitCostPrice: item.costPrice,
      supplierId: item.supplierId || null,
      supplier: item.supplier,
      location: item.location,
    };

    const res = exists
      ? await api.updateInventoryItem(item.id, payload)
      : await api.createInventoryItem(payload);

    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Erro no estoque', res.error || `Falha HTTP ${res.status}`);
      return false;
    }

    await fetchServerState();
    notify(
      'success',
      exists ? 'Insumo atualizado' : 'Insumo cadastrado',
      `${res.data?.code || item.code} — ${item.name} salvo no almoxarifado.`
    );
    return true;
  };

  const handleDeleteInventoryItem = (itemId: string) => {
    const target = state.inventory.find((i) => i.id === itemId);
    setConfirmDialog({
      title: `Excluir insumo ${target?.code || ''}?`,
      message: 'Insumos com saldo positivo, alocados para OPs, em poder de terceiros ou com histórico no Kardex são protegidos contra exclusão.',
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
    productionOrderId?: string;
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
    if (res.status < 200 || res.status >= 300 || !res.data?.id) {
      notify('error', 'WhatsApp indisponível', res.error || `Falha HTTP ${res.status}`);
      return;
    }
    setWhatsappHandoff({ conversationId: res.data.id });
    setCurrentTab('whatsapp');
    notify(
      'success',
      'Conversa aberta na Central WhatsApp',
      `Atendimento com ${target.name} (${target.phone}) selecionado e pronto para envio.`
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
    if (res.status < 200 || res.status >= 300 || !res.data?.id) {
      notify('error', 'WhatsApp indisponível', res.error || `Falha HTTP ${res.status}`);
      return;
    }
    setWhatsappHandoff({ conversationId: res.data.id });
    setCurrentTab('whatsapp');
    notify(
      'success',
      'Conversa aberta na Central WhatsApp',
      `Atendimento com ${partner.tradeName} (${partner.phone}) selecionado e pronto para envio.`
    );
  };

  const handleCreatePartnerProvision = async (
    partnerId: string,
    payload: {
      productionOrderId?: string;
      clientId?: string;
      clientName?: string;
      serviceReference?: string;
      description?: string;
      category?: string;
      amount: number;
      dueDate: string;
      paymentMethod: 'pix' | 'boleto' | 'transferencia' | 'cartao';
      isProvision?: boolean;
    }
  ): Promise<boolean> => {
    const res = await api.createPartnerProvision(partnerId, payload);
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Provisão rejeitada', res.error || `Falha HTTP ${res.status}`);
      return false;
    }
    await fetchServerState();
    notify(
      'success',
      `Provisão CP ${res.data?.transaction?.transactionNumber || ''} registrada`,
      `Previsão de pagamento lançada em Contas a Pagar no Financeiro.`
    );
    return true;
  };

  // =========================================================================
  // SUPPLIERS & PURCHASE ORDERS ACTIONS (Backend-Authoritative)
  // =========================================================================
  const handleSaveSupplier = async (payload: Partial<Supplier>, existingId?: string): Promise<boolean> => {
    const res = existingId
      ? await api.updateSupplier(existingId, payload)
      : await api.createSupplier(payload);

    if (res.status < 200 || res.status >= 300) {
      notify(
        'error',
        res.status === 409 ? 'CNPJ já cadastrado' : 'Erro ao salvar fornecedor',
        res.error || `Falha HTTP ${res.status}`
      );
      return false;
    }

    await fetchServerState();
    notify(
      'success',
      existingId ? 'Fornecedor atualizado' : 'Fornecedor homologado',
      `${res.data?.tradeName || payload.tradeName || 'Fornecedor'} (${res.data?.code || ''}) salvo com sucesso.`
    );
    return true;
  };

  const handleDeleteSupplier = (supplierId: string) => {
    const target = suppliers.find((s) => s.id === supplierId);
    setConfirmDialog({
      title: `Excluir fornecedor ${target?.tradeName || ''}?`,
      message:
        'Fornecedores vinculados a insumos no estoque, pedidos de compra ou títulos financeiros são protegidos contra exclusão (prefira inativar o cadastro).',
      confirmLabel: 'Excluir Fornecedor',
      onConfirm: async () => {
        const res = await api.deleteSupplier(supplierId);
        if (res.status < 200 || res.status >= 300) {
          notify('error', 'Exclusão bloqueada', res.error || `Falha HTTP ${res.status}`);
          return;
        }
        await fetchServerState();
        notify('success', 'Fornecedor excluído', `${target?.tradeName || 'Fornecedor'} removido da base.`);
      },
    });
  };

  const handleCreatePurchaseOrder = async (payload: any): Promise<boolean> => {
    const res = await api.createPurchaseOrder(payload);
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Pedido de Compra rejeitado', res.error || `Falha HTTP ${res.status}`);
      return false;
    }
    await fetchServerState();
    const poNum = res.data?.purchaseOrder?.poNumber || '';
    const trxNum = res.data?.createdPayable?.transactionNumber;
    notify(
      'success',
      `Pedido de Compra ${poNum} emitido`,
      trxNum
        ? `PC registrado com previsão de CP ${trxNum} provisionada no Financeiro.`
        : `Pedido de Compra ${poNum} salvo com sucesso.`
    );
    return true;
  };

  const handleUpdatePurchaseOrderStatus = async (
    poId: string,
    status: PurchaseOrderStatus,
    autoGeneratePayable?: boolean
  ): Promise<boolean> => {
    const res = await api.updatePurchaseOrderStatus(poId, { status, autoGeneratePayable });
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Transição de PC rejeitada', res.error || `Falha HTTP ${res.status}`);
      return false;
    }
    await fetchServerState();
    const trxNum = res.data?.createdPayable?.transactionNumber;
    notify(
      'success',
      `Status do PC atualizado para '${status}'`,
      trxNum
        ? `Título a pagar ${trxNum} provisionado automaticamente no Financeiro.`
        : res.data?.message || 'Pedido de compra atualizado com sucesso.'
    );
    return true;
  };

  const handleReceivePurchaseOrder = async (
    poId: string,
    payload: {
      invoiceNumber?: string;
      updateUnitCost?: boolean;
      generatePayableIfMissing?: boolean;
      dueDate?: string;
      notes?: string;
      items: Array<{ itemId: string; receiveQuantity: number }>;
    }
  ): Promise<boolean> => {
    const res = await api.receivePurchaseOrder(poId, payload);
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Recebimento rejeitado', res.error || `Falha HTTP ${res.status}`);
      return false;
    }
    await fetchServerState();
    const movCount = Array.isArray(res.data?.movements) ? res.data.movements.length : 0;
    const trxNum = res.data?.payable?.transactionNumber;
    notify(
      'success',
      `Recebimento confirmado (${res.data?.purchaseOrder?.poNumber || 'PC'})`,
      `${movCount} entrada(s) lançadas no Estoque/Kardex com Custo Médio Ponderado${trxNum ? ` e CP ${trxNum} efetivado no Financeiro.` : '.'}`
    );
    return true;
  };

  const handleGeneratePurchaseOrderPayable = async (poId: string): Promise<boolean> => {
    const res = await api.generatePurchaseOrderPayable(poId);
    if (res.status < 200 || res.status >= 300) {
      notify('error', 'Falha ao gerar CP', res.error || `Falha HTTP ${res.status}`);
      return false;
    }
    await fetchServerState();
    notify(
      res.data?.alreadyExists ? 'info' : 'success',
      res.data?.alreadyExists ? 'Título CP já vinculado' : `CP ${res.data?.transaction?.transactionNumber || ''} gerado`,
      res.data?.message || 'Título de Contas a Pagar sincronizado com o Financeiro.'
    );
    return true;
  };

  const handleOpenSupplierWhatsApp = async (supplier: Supplier, po?: PurchaseOrder) => {
    if (po) {
      const itemsSummary = (po.items || [])
        .map((it) => `${it.quantity} ${it.unit} ${it.itemName}`)
        .join(', ');
      const res = await api.sendTemplateMessage({
        templateType: 'purchase_order',
        clientPhone: supplier.phone,
        clientName: `${supplier.tradeName} (${supplier.code})`,
        poNumber: po.poNumber,
        amount: po.totalAmount,
        expectedDeliveryDate: po.expectedDeliveryDate,
        itemsSummary,
      });
      if (res.status < 200 || res.status >= 300) {
        notify('error', 'WhatsApp indisponível', res.error || `Falha HTTP ${res.status}`);
        return;
      }
      if (res.data?.conversationId) {
        setWhatsappHandoff({ conversationId: res.data.conversationId });
      }
      setCurrentTab('whatsapp');
      if (res.data?.message?.status === 'failed') {
        notify(
          'error',
          `Falha ao entregar ${po.poNumber} pelo provedor`,
          res.data?.message?.errorMessage || 'Conversa aberta na Central WhatsApp para reenvio.'
        );
      } else {
        notify(
          'success',
          `Pedido ${po.poNumber} enviado no WhatsApp`,
          `Template do pedido disparado para ${supplier.tradeName} e conversa aberta para acompanhamento.`
        );
      }
      return;
    }

    const res = await api.startConversation({
      phone: supplier.phone,
      customerName: `${supplier.tradeName} (${supplier.code})`,
    });
    if (res.status < 200 || res.status >= 300 || !res.data?.id) {
      notify('error', 'WhatsApp indisponível', res.error || `Falha HTTP ${res.status}`);
      return;
    }
    setWhatsappHandoff({ conversationId: res.data.id });
    setCurrentTab('whatsapp');
    notify(
      'success',
      'Conversa aberta na Central WhatsApp',
      `Atendimento com ${supplier.tradeName} (${supplier.phone}) selecionado e pronto para envio.`
    );
  };

  const handleRequestPurchaseForItem = (item: InventoryItem) => {
    setPreselectedReplenish({ itemId: item.id, supplierId: item.supplierId });
    setCurrentTab('suppliers');
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
      currentTab === 'suppliers' &&
      !['admin', 'pcp_producao', 'financeiro', 'gerente_comercial'].includes(role)
    ) {
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

  const handleUpdateOrderSchedule = async (
    orderId: string,
    payload: {
      targetDeliveryDate?: string;
      syncTargetDelivery?: boolean;
      recalculateProportional?: boolean;
      stages?: Array<{
        stage: string;
        plannedStartDate: string;
        plannedEndDate: string;
        responsible?: string;
        notes?: string;
        skipped?: boolean;
      }>;
    }
  ): Promise<boolean> => {
    const res = await api.updateOrderSchedule(orderId, payload);
    if (res.status === 200) {
      await fetchServerState();
      notify(
        'success',
        'Cronograma de prazos atualizado',
        payload.recalculateProportional
          ? 'Os prazos de todas as etapas foram recalculados proporcionalmente até a entrega final.'
          : 'Os prazos, responsáveis e observações das etapas foram salvos com sucesso.'
      );
      return true;
    }
    notify('error', 'Falha ao atualizar cronograma', res.error || 'Não foi possível salvar os prazos das etapas.');
    return false;
  };

  const handleNotificationAction = (notification: SystemNotificationItem) => {
    if (notification.targetTab) {
      setCurrentTab(notification.targetTab);
    }
    if (notification.openScheduleModal && notification.entityId) {
      setFocusedScheduleOrderId(notification.entityId);
    }
  };

  // Real operational counts for Sidebar badges & capacity bar
  const activeOrders = state.orders.filter((o) => o.stage !== 'entregue');
  const activeOrdersCount = activeOrders.length;
  const activePiecesCount = activeOrders.reduce((sum, o) => sum + (o.totalPieces || 0), 0);
  const blockedOrdersCount = activeOrders.filter((o) => !o.canStartProduction).length;
  const overdueOrdersCount = activeOrders.filter(
    (o) => o.deadlineSummary?.deliveryStatus === 'atrasada'
  ).length;
  const lowStockCount = state.inventory.filter((i) => i.currentStock <= i.minStock).length;
  const openCustodyCount = partnerCustody.filter(
    (c) => c.status === 'em_custodia' || c.status === 'devolvido_parcial'
  ).length;
  const newLeadsCount = leads.filter((l) => l.status === 'novo').length;
  const pendingQuotesCount = state.quotes.filter(
    (q) => q.status === 'enviado' || q.status === 'em_negociacao' || q.status === 'aprovado'
  ).length;
  const todayISO = new Date().toISOString().split('T')[0];
  const openPurchaseOrders = purchaseOrders.filter(
    (po) => po.status !== 'recebido_total' && po.status !== 'cancelado'
  );
  const openPurchaseOrdersCount = openPurchaseOrders.length;
  const delayedPurchaseOrdersCount = openPurchaseOrders.filter(
    (po) => po.expectedDeliveryDate && po.expectedDeliveryDate < todayISO
  ).length;
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
        overdueOrdersCount={overdueOrdersCount}
        lowStockCount={lowStockCount}
        openPurchaseOrdersCount={openPurchaseOrdersCount}
        delayedPurchaseOrdersCount={delayedPurchaseOrdersCount}
        openCustodyCount={openCustodyCount}
        newLeadsCount={newLeadsCount}
        pendingQuotesCount={pendingQuotesCount}
        pendingDownpaymentsCount={pendingDownpaymentsCount}
        overdueFinanceCount={overdueFinanceCount}
        whatsappUnreadCount={whatsappUnreadCount}
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
          notificationsPayload={notificationsPayload}
          onNotificationAction={handleNotificationAction}
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
                onOpenOrderSchedule={(order) => {
                  setFocusedScheduleOrderId(order.id);
                  setCurrentTab('orders');
                }}
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
                onUpdateOrderSchedule={handleUpdateOrderSchedule}
                onOpenPrintTicket={(order) => setSelectedOrderForTicket(order)}
                onGoToFinanceForPayment={() => setCurrentTab('finance')}
                onApproveArt={handleApproveArt}
                onRequestArtRevision={handleRequestOrderArtRevision}
                focusedScheduleOrderId={focusedScheduleOrderId}
                onClearFocusedScheduleOrder={() => setFocusedScheduleOrderId(null)}
                onNotifyOrderWhatsApp={handleNotifyOrderWhatsApp}
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
                onApproveQuoteCommercial={handleApproveQuoteCommercial}
                onUploadQuoteArtwork={handleUploadQuoteArtwork}
                onRequestQuoteArtRevision={handleRequestQuoteArtRevision}
                onApproveQuoteArtwork={handleApproveQuoteArtwork}
                onConvertQuoteToOrder={handleConvertQuoteToOrder}
                onSendQuoteWhatsApp={handleSendQuoteWhatsApp}
                onDeleteQuote={handleDeleteQuote}
              />
            )}

            {currentTab === 'inventory' && (
              <InventoryView
                inventory={state.inventory}
                orders={state.orders}
                suppliers={suppliers}
                onSaveItem={handleSaveInventoryItem}
                onDeleteItem={handleDeleteInventoryItem}
                onCreateStockMovement={handleCreateStockMovement}
                onRequestPurchaseForItem={handleRequestPurchaseForItem}
                onNavigateTab={setCurrentTab}
              />
            )}

            {currentTab === 'suppliers' && (
              <SuppliersView
                suppliers={suppliers}
                purchaseOrders={purchaseOrders}
                summary={suppliersSummary}
                inventory={state.inventory}
                orders={state.orders}
                preselectedReplenish={preselectedReplenish}
                onClearPreselectedReplenish={() => setPreselectedReplenish(null)}
                onSaveSupplier={handleSaveSupplier}
                onDeleteSupplier={handleDeleteSupplier}
                onCreatePurchaseOrder={handleCreatePurchaseOrder}
                onUpdatePurchaseOrderStatus={handleUpdatePurchaseOrderStatus}
                onReceivePurchaseOrder={handleReceivePurchaseOrder}
                onGeneratePurchaseOrderPayable={handleGeneratePurchaseOrderPayable}
                onOpenSupplierWhatsApp={handleOpenSupplierWhatsApp}
                onNavigateTab={setCurrentTab}
              />
            )}

            {currentTab === 'partners' && (
              <PartnersView
                partners={partners}
                custodyList={partnerCustody}
                forecast={partnerForecast}
                inventory={state.inventory}
                orders={state.orders}
                onSavePartner={handleSavePartner}
                onDeletePartner={handleDeletePartner}
                onDispatchCustody={handleDispatchPartnerCustody}
                onReturnCustody={handleReturnPartnerCustody}
                onCreatePartnerProvision={handleCreatePartnerProvision}
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
                partners={partners}
                suppliers={suppliers}
                partnerForecast={partnerForecast}
                onSaveTransaction={handleSaveTransaction}
                onDeleteTransaction={handleDeleteTransaction}
                onConfirmPaymentWithVoucher={handleConfirmPaymentWithVoucher}
                onReverseTransaction={handleReverseTransaction}
                onSendTransactionWhatsApp={handleSendTransactionWhatsApp}
                onNavigateTab={setCurrentTab}
              />
            )}

            {currentTab === 'whatsapp' && (
              <WhatsAppOmnichannelView
                clients={state.clients}
                partners={partners}
                suppliers={suppliers}
                quotes={state.quotes}
                orders={state.orders}
                finance={state.finance}
                profile={state.profile}
                initialConversationId={whatsappHandoff?.conversationId || null}
                initialDraftMessage={whatsappHandoff?.draftMessage || null}
                onClearInitialHandoff={() => setWhatsappHandoff(null)}
                onUnreadCountChange={setWhatsappUnreadCount}
              />
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
