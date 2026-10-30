import { mapClient, mapInventory, mapFinance, mapQuote, mapOrder } from './api/adapters';
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const { user, isAuthenticated, isLoading } = useAuth();
  const emptyState = (): ERPState => { const initial = loadERPState(); return { ...initial, clients: [], inventory: [], orders: [], quotes: [], finance: [] }; };
  const [state, setState] = useState<ERPState>(emptyState);
  const sessionIdentity = useRef(user?.id);
  sessionIdentity.current = user?.id;
  const [syncError, setSyncError] = useState('');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
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

  useEffect(() => { void api.getPublicConfig().then((response) => {
    if (response.status === 200 && response.data?.profile) setState((previous) => ({ ...previous, profile: response.data!.profile }));
  }); }, []);

  const refreshServerState = useCallback(async () => {
    const identity = user?.id;
    if (!identity) return;
    const responses = await Promise.all([api.getOrders(), api.getQuotes(), api.getInventoryItems(), api.getClients(), api.getTransactions()]);
    if (sessionIdentity.current !== identity) return;
    const failure = responses.find((response) => response.status !== 200 || !Array.isArray(response.data));
    if (failure) { setSyncError(failure.error || 'Não foi possível carregar os dados.'); return; }
    const [orders, quotes, inventory, clients, finance] = responses.map((response) => response.data!);
    setState((prev) => ({ ...prev, clients: clients.map(mapClient), inventory: inventory.map(mapInventory),
      finance: finance.map(mapFinance), quotes: quotes.map((row) => mapQuote(row, clients)),
      orders: orders.map((row) => mapOrder(row, clients, quotes)) }));
    setSyncError('');
    setLoadedFor(identity);
  }, [user?.id]);

  useEffect(() => {
    setState((previous) => ({ ...emptyState(), profile: previous.profile })); setLoadedFor(null);
    setSelectedOrderForTicket(null); setSelectedQuoteForPrint(null);
    setIsNewOrderModalOpen(false); setIsNewQuoteModalOpen(false);
    setSyncError('');
    if (user?.id) void refreshServerState();
  }, [user?.id, refreshServerState]);

  async function mutate(operation: () => Promise<{ status: number; error?: string; data?: any }>): Promise<boolean> {
    const identity = user?.id;
    const response = await operation();
    if (identity !== sessionIdentity.current) return false;
    if (response.status < 200 || response.status >= 300) { alert(response.error || 'A operação não foi confirmada.'); return false; }
    await refreshServerState();
    return true;
  }
  const databaseId = (records: { id: string; backendId?: string }[], id: string) => records.find((record) => record.id === id)?.backendId || id;
  const startOrder = () => {
    setCurrentTab('quotes');
    alert('Para emitir uma OP, selecione uma proposta aprovada e use Converter em Pedido. Cada item terá sua própria ficha de produção.');
  };
  const handleSaveOrder = async (order: ProductionOrder) => {
    const existing = state.orders.find((item) => item.id === order.id);
    if (!existing?.backendId) { startOrder(); return false; }
    return mutate(async () => {
      const response = await api.updateOrder(existing.backendId!, order);
      if (response.code === 'ORDER_REVISION_CONFLICT') await refreshServerState();
      return response;
    });
  };
  const handleEditOrder = (order: ProductionOrder) => { setEditingOrder(order); setIsNewOrderModalOpen(true); };
  const handleDeleteOrder = async (id: string) => {
    if (confirm(`Excluir OP ${id}?`)) await mutate(() => api.deleteOrder(databaseId(state.orders, id)));
  };
  const handleUpdateOrderStage = async (id: string, stage: OperationalStage) => {
    const order = state.orders.find((item) => item.id === id);
    if (!order || !Number.isSafeInteger(order.revision) || order.revision! < 1) {
      await refreshServerState();
      alert('Dados da OP foram atualizados. Confira a etapa e tente novamente.');
      return;
    }
    await mutate(async () => {
      const response = await api.advanceOrderStage(databaseId(state.orders, id), stage, order.revision!);
      if (response.code === 'ORDER_REVISION_CONFLICT') await refreshServerState();
      return response;
    });
  };
  const handleConfirmEntryPayment = () => {
    setCurrentTab('finance');
    alert('Localize o título de sinal da proposta e confirme a liquidação com a autenticação bancária e o comprovante real.');
  };
  const handleApproveArt = async (id: string) => {
    const order = state.orders.find((item) => item.id === id);
    if (!order || !Number.isSafeInteger(order.revision) || order.revision! < 1) {
      await refreshServerState();
      alert('Dados da OP foram atualizados. Confira a ficha antes de aprovar a arte.');
      return;
    }
    const approver = prompt('Nome do cliente que aprovou formalmente a arte:');
    if (approver?.trim()) await mutate(async () => {
      const response = await api.approveOrderArt(databaseId(state.orders, id), approver.trim(), order.revision!);
      if (response.code === 'ORDER_REVISION_CONFLICT') await refreshServerState();
      return response;
    });
  };
  const handleSaveQuote = async (quote: Quote) => mutate(() => api.createQuote({ ...quote,
    clientId: databaseId(state.clients, quote.clientId), commercialStatus: quote.status }));
  const handleUpdateQuoteStatus = async (id: string, status: CommercialStatus) => { await mutate(() => api.updateQuoteStatus(databaseId(state.quotes, id), status)); };
  const handleConvertQuoteToOrder = async (quote: Quote) => {
    if (quote.status !== 'aprovado' && quote.status !== 'convertido_em_pedido') {
      if (!confirm(`Registrar aprovação comercial da proposta ${quote.id} e gerar as ordens de produção?`)) return;
      const approval = await api.updateQuoteStatus(quote.backendId || quote.id, 'aprovado');
      if (approval.status !== 200) { alert(approval.error || 'Aprovação não confirmada.'); await refreshServerState(); return; }
    }
    if (await mutate(() => api.convertQuoteToOrder(quote.backendId || quote.id))) {
      setSelectedQuoteForPrint(null); setCurrentTab('orders');
    }
  };
  const handleDeleteQuote = async (id: string) => {
    if (confirm(`Excluir proposta ${id}?`)) await mutate(() => api.deleteQuote(databaseId(state.quotes, id)));
  };
  const handleRequestQuoteFromPortal = async (request: Parameters<typeof api.submitPublicLead>[0]) => {
    const response = await api.submitPublicLead(request);
    if (response.status !== 201) { alert(response.error || 'Não foi possível enviar a solicitação.'); return false; }
    return true;
  };
  const handleSaveInventoryItem = async (item: InventoryItem) => {
    const existing = state.inventory.find((entry) => entry.id === item.id);
    if (!existing?.backendId) return mutate(() => api.createInventoryItem(item));
    const reason = item.currentStock !== existing.currentStock ? prompt('Motivo do ajuste de estoque:') : '';
    if (item.currentStock !== existing.currentStock && !reason?.trim()) return false;
    return mutate(() => api.updateInventoryItem(existing.backendId!, { ...item, expectedPhysicalStock: existing.currentStock, adjustmentReason: reason }));
  };
  const handleDeleteInventoryItem = async (id: string) => {
    if (confirm('Excluir item sem saldo e sem histórico?')) await mutate(() => api.deleteInventoryItem(databaseId(state.inventory, id)));
  };
  const handleSaveClient = async (client: Client) => {
    const existing = state.clients.find((entry) => entry.id === client.id);
    return mutate(() => existing?.backendId ? api.updateClient(existing.backendId, client) : api.createClient(client));
  };
  const handleDeleteClient = async (id: string) => {
    if (confirm('Excluir cliente sem histórico?')) await mutate(() => api.deleteClient(databaseId(state.clients, id)));
  };
  const handleSaveTransaction = async (title: FinancialTransaction, key?: string) => mutate(() => api.createTransaction(title, key));
  const handleDeleteTransaction = async (id: string) => {
    if (confirm('Excluir título pendente sem vínculo com produção?')) await mutate(() => api.deleteTransaction(databaseId(state.finance, id)));
  };
  const handleToggleTransactionStatus = () => { alert('Uma liquidação exige comprovante. Títulos pagos precisam de estorno auditado; não podem ser alternados para pendente.'); };
  const handleConfirmPaymentWithVoucher = async (id: string, voucher: string, notes: string, evidenceUrl: string) =>
    mutate(() => api.confirmPayment(databaseId(state.finance, id), { receiptVoucherNumber: voucher, receiptEvidenceUrl: evidenceUrl, confirmationNotes: notes }));

  // Profile público é persistido no servidor; dados privados não vão ao navegador.
  const handleSaveProfile = async (profile: CompanyProfile) => {
    const response = await api.saveProfile(profile);
    if (response.status !== 200) { alert(response.error || 'Falha ao salvar perfil.'); return false; }
    setState((previous) => ({ ...previous, profile: response.data }));
    return true;
  };

  const handleRestoreState = async (restored: ERPState) => mutate(() => api.importLocalStorageData(restored));

  const handleResetToDefaults = () => { alert('A restauração de demonstração não altera o banco operacional. Use um ambiente de desenvolvimento separado.'); };

  // Counts for sidebar badges
  const activeOrdersCount = state.orders.filter((o) => o.stage !== 'entregue').length;
  const lowStockCount = state.inventory.filter((i) => i.currentStock <= i.minStock).length;
  const pendingQuotesCount = state.quotes.filter((q) => q.status === 'enviado' || q.status === 'aprovado').length;

  if (isAuthenticated && loadedFor !== user?.id) {
    return <div role="status" className="min-h-screen bg-slate-950 p-12 text-white"><p>{syncError || 'Carregando dados da sessão...'}</p>{syncError && <button className="mt-4 underline" onClick={() => void refreshServerState()}>Tentar novamente</button>}</div>;
  }
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white select-none">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-slate-300 font-semibold tracking-wide">DE FARDAS ERP</p>
        <p className="text-xs text-slate-500 mt-1">Verificando sessão segura...</p>
      </div>
    );
  }

  // Se o usuário não está autenticado e não está navegando na vitrine pública, exige login
  if (!isAuthenticated && currentTab !== 'portal') {
    return <LoginView onGoToPortal={() => setCurrentTab('portal')} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-900 antialiased">
      
      {/* Primary Left Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        activeOrdersCount={activeOrdersCount}
        activePieces={state.orders.filter((order) => !['entregue', 'aguardando_liberacao'].includes(order.stage)).reduce((sum, order) => sum + order.totalPieces, 0)}
        lowStockCount={lowStockCount}
        pendingQuotesCount={pendingQuotesCount}
        profile={state.profile}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onOpenNewOrderModal={startOrder}
        onOpenHelpManual={() => setIsHelpManualOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        
        {/* Sleek Top Bar */}
        <Header
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          onOpenNewOrderModal={startOrder}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)}
          lowStockCount={lowStockCount}
          onOpenHelpManual={() => setIsHelpManualOpen(true)}
          onOpenAuditModal={import.meta.env?.DEV ? () => setIsAuditModalOpen(true) : undefined}
        />

        {/* Viewport Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            {syncError && <div role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">{syncError}<button className="ml-4 underline" onClick={() => void refreshServerState()}>Tentar novamente</button></div>}
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
                onOpenNewOrderModal={startOrder}
                onOpenNewQuoteModal={() => setIsNewQuoteModalOpen(true)}
                onSelectOrderForTicket={(order) => setSelectedOrderForTicket(order)}
              />
            )}

            {currentTab === 'orders' && (
              <ProductionOrdersView
                orders={state.orders}
                onOpenNewOrderModal={startOrder}
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

            {currentTab === 'whatsapp' && (
              <WhatsAppOmnichannelView />
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
      {import.meta.env?.DEV && isAuditModalOpen && (
        <FoundationAuditModal
          isOpen={isAuditModalOpen}
          onClose={() => setIsAuditModalOpen(false)}
        />
      )}

    </div>
  );
}
