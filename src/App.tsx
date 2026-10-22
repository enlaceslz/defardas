import React, { useState, useEffect } from 'react';
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

import { NewOrderModal } from './components/NewOrderModal';
import { NewQuoteModal } from './components/NewQuoteModal';
import { PrintOrderTicketModal } from './components/PrintOrderTicketModal';
import { PrintQuoteModal } from './components/PrintQuoteModal';
import { HelpManualModal } from './components/HelpManualModal';
import { FoundationAuditModal } from './components/FoundationAuditModal';
import { api } from './api/client';

import { 
  ERPState, 
  loadERPState, 
  saveERPState, 
  resetERPState 
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
  CostBreakdown
} from './types/erp';

export default function App() {
  const [state, setState] = useState<ERPState>(() => loadERPState());
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Modals state
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ProductionOrder | null>(null);

  const [isNewQuoteModalOpen, setIsNewQuoteModalOpen] = useState(false);

  const [selectedOrderForTicket, setSelectedOrderForTicket] = useState<ProductionOrder | null>(null);
  const [selectedQuoteForPrint, setSelectedQuoteForPrint] = useState<Quote | null>(null);
  const [isHelpManualOpen, setIsHelpManualOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  // Sync to localStorage
  useEffect(() => {
    saveERPState(state);
  }, [state]);

  // Orders Actions
  const handleSaveOrder = (savedOrder: ProductionOrder) => {
    setState((prev) => {
      const exists = prev.orders.some((o) => o.id === savedOrder.id);
      let updatedOrders: ProductionOrder[];
      if (exists) {
        updatedOrders = prev.orders.map((o) => (o.id === savedOrder.id ? savedOrder : o));
      } else {
        updatedOrders = [savedOrder, ...prev.orders];
      }
      return { ...prev, orders: updatedOrders };
    });
    setEditingOrder(null);
  };

  const handleEditOrder = (order: ProductionOrder) => {
    setEditingOrder(order);
    setIsNewOrderModalOpen(true);
  };

  const handleDeleteOrder = (orderId: string) => {
    if (confirm(`Deseja realmente excluir a Ordem de Produção ${orderId}?`)) {
      setState((prev) => ({
        ...prev,
        orders: prev.orders.filter((o) => o.id !== orderId),
      }));
    }
  };

  const handleUpdateOrderStage = (orderId: string, nextStage: OperationalStage) => {
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => {
        if (o.id === orderId) {
          return {
            ...o,
            stage: nextStage,
            completionDate: nextStage === 'entregue' ? new Date().toISOString().split('T')[0] : o.completionDate,
          };
        }
        return o;
      }),
    }));
  };

  // PRD Gate 1: Confirmação do Sinal de Entrada (50%) com comprovante
  const handleConfirmEntryPayment = (orderId: string) => {
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => {
        if (o.id === orderId) {
          const canStart = Boolean(o.artApproved);
          return {
            ...o,
            entryPaymentConfirmed: true,
            entryReceiptUrl: `comprovante_manual_${Date.now()}.pdf`,
            financialStatus: 'entrada_confirmada',
            canStartProduction: canStart,
            stage: canStart && o.stage === 'aguardando_liberacao' ? 'corte' : o.stage,
          };
        }
        return o;
      }),
    }));
  };

  // PRD Gate 2: Aprovação formal da Arte / Layout
  const handleApproveArt = (orderId: string) => {
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => {
        if (o.id === orderId) {
          const canStart = Boolean(o.entryPaymentConfirmed);
          return {
            ...o,
            artApproved: true,
            artApprovalDate: new Date().toISOString().split('T')[0],
            artApprovedBy: 'Cliente (WhatsApp)',
            canStartProduction: canStart,
            stage: canStart && o.stage === 'aguardando_liberacao' ? 'corte' : o.stage,
          };
        }
        return o;
      }),
    }));
  };

  // Quotes Actions
  const handleSaveQuote = (quote: Quote) => {
    setState((prev) => ({
      ...prev,
      quotes: [quote, ...prev.quotes],
    }));
  };

  const handleUpdateQuoteStatus = (quoteId: string, status: CommercialStatus) => {
    setState((prev) => ({
      ...prev,
      quotes: prev.quotes.map((q) => (q.id === quoteId ? { ...q, status } : q)),
    }));
  };

  // Conversão Idempotente de Orçamento em Pedido (PRD A.3.1 e B.3)
  const handleConvertQuoteToOrder = (quote: Quote) => {
    // Idempotência Rígida: Se já foi convertido ou OP com este quoteId já existe, não recriar
    const alreadyConverted = state.orders.some((o) => o.quoteId === quote.id) || quote.status === 'convertido_em_pedido';
    if (alreadyConverted) {
      alert(`Esta proposta já foi convertida anteriormente (OP vinculada: ${quote.convertedToOrderId || 'Existente'}). Ação idempotente mantida.`);
      return;
    }

    // Disparar sincronização com o backend
    api.convertQuoteToOrder(quote.id).catch((err) => console.warn('Erro ao sincronizar conversão no backend:', err));

    const opSeq = String(Math.floor(100 + Math.random() * 900)).padStart(4, '0');
    const opId = `OP-2026-${opSeq}`;

    const newOrders: ProductionOrder[] = quote.items.map((item, idx) => {
      const orderSpecificId = idx === 0 ? opId : `${opId}-${idx + 1}`;
      const defaultCost = item.costBreakdown || {
        materialUnitCost: 24.0,
        outsourcedSewingUnitCost: 15.0,
        customizationUnitCost: 6.5,
        freightPerUnit: 1.5,
        technicalLossPercentage: 2.0,
        calculatedBaseCost: 47.94,
        markupPercentage: 45.0,
        suggestedUnitPrice: 69.51,
        negotiatedUnitPrice: item.unitFinalPrice,
        discountPercentage: 0,
        belowSuggestedAuthorized: false,
        estimatedMarginPercentage: 31.0,
      };

      const canStart = Boolean(quote.artApproved);

      return {
        id: orderSpecificId,
        quoteId: quote.id,
        quoteVersion: quote.version || 1,
        clientId: quote.clientId,
        clientName: quote.clientName,
        itemTitle: item.modelName,
        category: item.category,
        fabricName: item.fabricName,
        fabricColor: item.fabricColor,
        sizes: item.sizes,
        totalPieces: item.totalQuantity,
        customizations: item.customizations,
        costBreakdown: defaultCost,
        materials: [
          {
            id: `mat-${Date.now()}-${idx}`,
            materialName: item.fabricName,
            unit: 'metros',
            estimatedQuantity: Math.round(item.totalQuantity * 1.4),
            allocatedInStock: Math.round(item.totalQuantity * 1.4),
            sentToPartnerQuantity: 0,
            returnedFromPartnerQuantity: 0,
            lostQuantity: 1,
          }
        ],
        commercialStatus: 'aprovado',
        financialStatus: 'entrada_pendente', // Bloqueia produção até comprovar sinal de 50%!
        stage: 'aguardando_liberacao',       // Portão de liberação fabril Gate A.3.2
        artApproved: quote.artApproved,
        artApprovalDate: quote.artApproved ? new Date().toISOString().split('T')[0] : undefined,
        entryPaymentConfirmed: false,        // Sinal de 50% pendente
        canStartProduction: false,
        priority: 'normal',
        creationDate: new Date().toISOString().split('T')[0],
        targetDeliveryDate: new Date(Date.now() + quote.productionLeadDays * 86400000).toISOString().split('T')[0],
        technicalNotes: `Gerado a partir da Proposta Comercial ${quote.id} v${quote.version}. ${quote.notes || ''}`,
        assignedTeam: 'Mesa de Corte & Facção Terceirizada',
      };
    });

    // Lançamento do Sinal de 50% no Financeiro
    const finSinalId = `FIN-2026-${Math.floor(5000 + Math.random() * 500)}`;
    const newReceivableEntry: FinancialTransaction = {
      id: finSinalId,
      type: 'receber',
      subType: 'entrada_pedido',
      description: `Sinal 50% - Proposta ${quote.id} (${quote.clientName})`,
      category: 'Venda de Uniformes',
      amount: quote.entryAmount || (quote.totalAmount / 2),
      dueDate: new Date().toISOString().split('T')[0],
      status: 'pendente',
      paymentMethod: 'pix',
      referenceId: opId,
    };

    // Lançamento do Saldo para a data da entrega
    const finSaldoId = `FIN-2026-${Math.floor(6000 + Math.random() * 500)}`;
    const newReceivableBalance: FinancialTransaction = {
      id: finSaldoId,
      type: 'receber',
      subType: 'saldo_entrega',
      description: `Saldo 50% na Entrega - Proposta ${quote.id} (${quote.clientName})`,
      category: 'Venda de Uniformes',
      amount: quote.balanceDueAtDelivery || (quote.totalAmount / 2),
      dueDate: new Date(Date.now() + quote.productionLeadDays * 86400000).toISOString().split('T')[0],
      status: 'pendente',
      paymentMethod: 'boleto',
      referenceId: opId,
    };

    setState((prev) => ({
      ...prev,
      quotes: prev.quotes.map((q) => (q.id === quote.id ? { ...q, status: 'convertido_em_pedido', convertedToOrderId: opId } : q)),
      orders: [...newOrders, ...prev.orders],
      finance: [newReceivableEntry, newReceivableBalance, ...prev.finance],
    }));

    if (selectedQuoteForPrint?.id === quote.id) {
      setSelectedQuoteForPrint(null);
    }

    alert(`Proposta ${quote.id} convertida em OP com sucesso! A OP ${opId} foi criada no estágio 'Aguardando Liberação', com bloqueio ativo até quitação do sinal de 50% e aprovação de arte.`);
    setCurrentTab('orders');
  };

  const handleDeleteQuote = (quoteId: string) => {
    if (confirm(`Deseja excluir a proposta comercial ${quoteId}?`)) {
      setState((prev) => ({
        ...prev,
        quotes: prev.quotes.filter((q) => q.id !== quoteId),
      }));
    }
  };

  // Solicitação de orçamento originada no Portal Público (Ambiente 1 do PRD)
  const handleRequestQuoteFromPortal = (req: {
    clientName: string;
    companyName: string;
    phone: string;
    email: string;
    category: UniformCategory;
    estimatedQty: number;
    notes: string;
  }) => {
    // Sincronizar lead com persistência centralizada no backend (crm.leads)
    api.submitPublicLead(req).catch((err) => console.warn('Erro ao sincronizar lead no backend:', err));

    // 1. Cadastrar cliente se for novo
    let matchedClient = state.clients.find(
      (c) => c.phone === req.phone || c.companyName.toLowerCase() === req.companyName.toLowerCase()
    );

    if (!matchedClient) {
      const cliNum = Math.floor(200 + Math.random() * 800);
      matchedClient = {
        id: `CLI-2026-${String(cliNum).padStart(4, '0')}`,
        companyName: req.companyName.toUpperCase(),
        tradeName: req.companyName,
        cnpj: "00.000.000/0001-00",
        contactName: req.clientName,
        phone: req.phone,
        email: req.email,
        address: "São Luís",
        city: "São Luís",
        state: "MA",
        segment: "Corporativo / Web Lead",
        standardUniformNotes: `Origem: Portal Público DE FARDAS. Categoria: ${req.category}.`,
        totalOrdersCount: 0,
        totalSpent: 0,
        createdAt: new Date().toISOString().split('T')[0],
      };
      setState((prev) => ({ ...prev, clients: [matchedClient!, ...prev.clients] }));
    }

    // 2. Criar Orçamento no CRM com numeração segura
    const orcNum = Math.floor(1000 + Math.random() * 900);
    const newQuote: Quote = {
      id: `ORC-2026-${orcNum}`,
      version: 1,
      clientId: matchedClient.id,
      clientName: matchedClient.tradeName,
      clientCnpj: matchedClient.cnpj,
      clientContact: matchedClient.contactName,
      clientPhone: matchedClient.phone,
      clientEmail: matchedClient.email,
      sellerName: "Atendimento Web / WhatsApp",
      date: new Date().toISOString().split('T')[0],
      validUntil: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
      items: [
        {
          id: `qi-web-${Date.now()}`,
          modelName: `Fardamento Linha ${req.category.replace('_', ' ')}`,
          category: req.category,
          fabricName: "Tecido Homologado Padrão DE FARDAS",
          fabricColor: "Conforme Identidade da Empresa",
          sizes: { pp: 0, p: Math.round(req.estimatedQty * 0.2), m: Math.round(req.estimatedQty * 0.4), g: Math.round(req.estimatedQty * 0.3), gg: Math.round(req.estimatedQty * 0.1), xg: 0, exg: 0, sobMedida: 0 },
          totalQuantity: req.estimatedQty,
          costBreakdown: {
            materialUnitCost: 28.00,
            outsourcedSewingUnitCost: 16.00,
            customizationUnitCost: 6.50,
            freightPerUnit: 1.50,
            technicalLossPercentage: 2.0,
            calculatedBaseCost: 53.04,
            markupPercentage: 45.0,
            suggestedUnitPrice: 76.91,
            negotiatedUnitPrice: 76.00,
            discountPercentage: 0,
            belowSuggestedAuthorized: false,
            estimatedMarginPercentage: 30.2,
          },
          unitFinalPrice: 76.00,
          totalPrice: 76.00 * req.estimatedQty,
          customizations: [
            {
              id: 'c-web-1',
              type: 'bordado_peito',
              description: 'Bordado Institucional',
              location: 'Peito Esquerdo',
              unitCost: 6.50,
            }
          ]
        }
      ],
      subtotal: 76.00 * req.estimatedQty,
      discountPercentage: 0,
      totalAmount: 76.00 * req.estimatedQty,
      entryPercentage: 50,
      entryAmount: (76.00 * req.estimatedQty) / 2,
      balanceDueAtDelivery: (76.00 * req.estimatedQty) / 2,
      paymentTerms: "50% Sinal na Liberação + 50% na Entrega",
      productionLeadDays: 16,
      status: 'enviado',
      whatsAppProof: {
        contactId: req.phone,
        timestamp: new Date().toISOString(),
        notes: `Lead recebido através do site institucional com solicitação de ${req.estimatedQty} peças.`,
        manualConfirmation: false,
      },
      artApproved: false,
      notes: `Solicitação via Portal Público: ${req.notes}`,
    };

    setState((prev) => ({ ...prev, quotes: [newQuote, ...prev.quotes] }));
  };

  // Inventory Actions
  const handleSaveInventoryItem = (item: InventoryItem) => {
    setState((prev) => {
      const exists = prev.inventory.some((i) => i.id === item.id);
      let updated: InventoryItem[];
      if (exists) {
        updated = prev.inventory.map((i) => (i.id === item.id ? item : i));
      } else {
        updated = [item, ...prev.inventory];
      }
      return { ...prev, inventory: updated };
    });
  };

  const handleDeleteInventoryItem = (itemId: string) => {
    if (confirm('Deseja excluir este item do almoxarifado?')) {
      setState((prev) => ({
        ...prev,
        inventory: prev.inventory.filter((i) => i.id !== itemId),
      }));
    }
  };

  // Clients Actions
  const handleSaveClient = (client: Client) => {
    setState((prev) => {
      const exists = prev.clients.some((c) => c.id === client.id);
      let updated: Client[];
      if (exists) {
        updated = prev.clients.map((c) => (c.id === client.id ? client : c));
      } else {
        updated = [client, ...prev.clients];
      }
      return { ...prev, clients: updated };
    });
  };

  const handleDeleteClient = (clientId: string) => {
    if (confirm('Deseja excluir este cliente da carteira?')) {
      setState((prev) => ({
        ...prev,
        clients: prev.clients.filter((c) => c.id !== clientId),
      }));
    }
  };

  // Financial Actions
  const handleSaveTransaction = (trx: FinancialTransaction) => {
    setState((prev) => ({
      ...prev,
      finance: [trx, ...prev.finance],
    }));
  };

  const handleDeleteTransaction = (trxId: string) => {
    if (confirm('Deseja excluir este lançamento financeiro?')) {
      setState((prev) => ({
        ...prev,
        finance: prev.finance.filter((f) => f.id !== trxId),
      }));
    }
  };

  const handleToggleTransactionStatus = (trxId: string) => {
    setState((prev) => ({
      ...prev,
      finance: prev.finance.map((f) => {
        if (f.id === trxId) {
          const isPending = f.status === 'pendente';
          return {
            ...f,
            status: isPending ? 'pago' : 'pendente',
            paidDate: isPending ? new Date().toISOString().split('T')[0] : undefined,
          };
        }
        return f;
      }),
    }));
  };

  // Quitação de título com comprovante bancário e liberação automática do sinal da OP (Portão A.3.2)
  const handleConfirmPaymentWithVoucher = (trxId: string, voucherNumber: string, notes: string) => {
    // Sincronizar com o backend
    api.confirmPayment(trxId, { receiptVoucherNumber: voucherNumber, confirmationNotes: notes })
      .catch((err) => console.warn('Erro ao sincronizar pagamento no backend:', err));

    setState((prev) => {
      const targetTrx = prev.finance.find((f) => f.id === trxId);
      if (!targetTrx) return prev;

      const updatedFinance = prev.finance.map((f) => {
        if (f.id === trxId) {
          return {
            ...f,
            status: 'pago' as const,
            paidDate: new Date().toISOString().split('T')[0],
            receiptEvidenceUrl: `comprovante_${voucherNumber}.pdf`,
          };
        }
        return f;
      });

      // Se for sinal de 50%, atualizar automaticamente a OP vinculada!
      let updatedOrders = prev.orders;
      if (targetTrx.subType === 'entrada_pedido') {
        updatedOrders = prev.orders.map((o) => {
          const matches = o.id === targetTrx.referenceId || o.orderNumber === targetTrx.referenceId || o.quoteId === targetTrx.referenceId;
          if (matches) {
            const canStart = Boolean(o.artApproved);
            return {
              ...o,
              entryPaymentConfirmed: true,
              financialStatus: 'entrada_confirmada' as const,
              entryReceiptUrl: `comprovante_${voucherNumber}.pdf`,
              canStartProduction: canStart,
              stage: canStart && o.stage === 'aguardando_liberacao' ? 'corte' : o.stage,
            };
          }
          return o;
        });
      }

      return {
        ...prev,
        finance: updatedFinance,
        orders: updatedOrders,
      };
    });
  };

  // Profile & Reset
  const handleSaveProfile = (profile: CompanyProfile) => {
    setState((prev) => ({ ...prev, profile }));
  };

  const handleRestoreState = (restored: ERPState) => {
    setState(restored);
  };

  const handleResetToDefaults = () => {
    const fresh = resetERPState();
    setState(fresh);
    alert('Dados de demonstração do PRD v1.6 restaurados com sucesso.');
  };

  // Counts for sidebar badges
  const activeOrdersCount = state.orders.filter((o) => o.stage !== 'entregue').length;
  const lowStockCount = state.inventory.filter((i) => i.currentStock <= i.minStock).length;
  const pendingQuotesCount = state.quotes.filter((q) => q.status === 'enviado' || q.status === 'aprovado').length;

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-900 antialiased">
      
      {/* Primary Left Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        activeOrdersCount={activeOrdersCount}
        lowStockCount={lowStockCount}
        pendingQuotesCount={pendingQuotesCount}
        profile={state.profile}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onOpenNewOrderModal={() => {
          setEditingOrder(null);
          setIsNewOrderModalOpen(true);
        }}
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
                orders={state.orders}
                quotes={state.quotes}
                inventory={state.inventory}
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
                onConfirmEntryPayment={handleConfirmEntryPayment}
                onApproveArt={handleApproveArt}
              />
            )}

            {currentTab === 'quotes' && (
              <QuotesView
                quotes={state.quotes}
                onOpenNewQuoteModal={() => setIsNewQuoteModalOpen(true)}
                onOpenPrintQuote={(quote) => setSelectedQuoteForPrint(quote)}
                onUpdateQuoteStatus={handleUpdateQuoteStatus}
                onConvertQuoteToOrder={handleConvertQuoteToOrder}
                onDeleteQuote={handleDeleteQuote}
              />
            )}

            {currentTab === 'inventory' && (
              <InventoryView
                inventory={state.inventory}
                onSaveItem={handleSaveInventoryItem}
                onDeleteItem={handleDeleteInventoryItem}
              />
            )}

            {currentTab === 'clients' && (
              <ClientsView
                clients={state.clients}
                onSaveClient={handleSaveClient}
                onDeleteClient={handleDeleteClient}
              />
            )}

            {currentTab === 'finance' && (
              <FinancialView
                transactions={state.finance}
                onSaveTransaction={handleSaveTransaction}
                onDeleteTransaction={handleDeleteTransaction}
                onToggleStatus={handleToggleTransactionStatus}
                onConfirmPaymentWithVoucher={handleConfirmPaymentWithVoucher}
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

      {/* Modal: New/Edit Production Order */}
      {isNewOrderModalOpen && (
        <NewOrderModal
          clients={state.clients}
          existingOrder={editingOrder}
          onClose={() => {
            setIsNewOrderModalOpen(false);
            setEditingOrder(null);
          }}
          onSaveOrder={handleSaveOrder}
        />
      )}

      {/* Modal: New Commercial Quote with PRD Pricing Engine */}
      {isNewQuoteModalOpen && (
        <NewQuoteModal
          clients={state.clients}
          onClose={() => setIsNewQuoteModalOpen(false)}
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
        <HelpManualModal
          onClose={() => setIsHelpManualOpen(false)}
        />
      )}

      {/* Modal: Foundation P0 Audit, Tests & Database Invariants */}
      {isAuditModalOpen && (
        <FoundationAuditModal
          isOpen={isAuditModalOpen}
          onClose={() => setIsAuditModalOpen(false)}
        />
      )}

    </div>
  );
}
