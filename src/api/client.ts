/**
 * DE FARDAS ERP — Client API Layer
 * Camada unificada de comunicação com o backend modular Express/PostgreSQL.
 * Autenticação via credenciais reais (HttpOnly Cookies + Bearer Token).
 * Não aceita nem envia cabeçalhos controlados x-user-role ou x-user-id.
 */

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  code?: string;
  status: number;
}

export interface UserSessionData {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

class ApiClient {
  private baseUrl: string = '/api';
  private sessionToken: string | null = null;
  private csrfToken: string | null = null;

  constructor() {
    // P1-005: Não persistir tokens sensíveis em localStorage (prevenção contra XSS)
    this.sessionToken = null;
    try {
      localStorage.removeItem('defardas_auth_token');
    } catch {
      // Ignorar indisponibilidade
    }
  }

  public setToken(token: string | null) {
    // Armazena estritamente na memória da sessão do cliente; cookies HttpOnly cuidam da persistência segura
    this.sessionToken = token;
    try {
      localStorage.removeItem('defardas_auth_token');
    } catch {
      // Ignorar indisponibilidade
    }
  }

  public getToken(): string | null {
    return this.sessionToken;
  }

  private getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
    return match ? decodeURIComponent(match[3]) : null;
  }

  public getCsrfToken(): string | null {
    if (!this.csrfToken) {
      this.csrfToken = this.getCookie('defardas_csrf_token');
    }
    return this.csrfToken;
  }

  public setCsrfToken(token: string | null) {
    this.csrfToken = token;
  }

  public async fetchCsrfToken(): Promise<string | null> {
    try {
      const res = await fetch(`${this.baseUrl}/auth/csrf-token`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.csrfToken) {
          this.csrfToken = data.csrfToken;
          return data.csrfToken;
        }
      }
    } catch (e) {
      // Ignorar erro silenciosamente
    }
    return this.getCsrfToken();
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }
    return headers;
  }

  // Health
  public async getHealth() {
    return this.request<any>('/health', { method: 'GET' });
  }

  // Auth: Login real com bcrypt no backend
  public async login(email: string, password: string) {
    const res = await this.request<{ success: boolean; user: UserSessionData; token: string; csrfToken?: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.data?.token) {
      this.setToken(res.data.token);
    }
    if (res.data?.csrfToken) {
      this.setCsrfToken(res.data.csrfToken);
    }
    return res;
  }

  // Auth: Logout seguro
  public async logout() {
    const res = await this.request<{ success: boolean; message: string }>('/auth/logout', {
      method: 'POST',
    });
    this.setToken(null);
    return res;
  }

  // Auth: Sessão atual
  public async getMe() {
    return this.request<{ authenticated: boolean; user: UserSessionData }>('/auth/me', { method: 'GET' });
  }

  // Auth: Credenciais de teste locais (apenas desenvolvimento)
  public async getDevCredentials() {
    return this.request<any>('/auth/dev-credentials', { method: 'GET' });
  }

  // Auth: Recuperação segura de senha
  public async recoverPassword(email: string) {
    return this.request<any>('/auth/recover-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  // Auth: Redefinição com token
  public async resetPassword(token: string, newPassword: string) {
    return this.request<any>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  }

  // Auth: Alternador de perfil seguro em desenvolvimento (exige sessão admin)
  public async switchRoleDev(targetRole: string, targetEmail?: string) {
    const res = await this.request<any>('/auth/switch-role', {
      method: 'POST',
      body: JSON.stringify({ targetRole, targetEmail }),
    });
    if (res.data?.token) {
      this.setToken(res.data.token);
    }
    return res;
  }

  // Quotes
  public async getQuotes() {
    return this.request<any[]>('/quotes', { method: 'GET' });
  }

  public async createQuote(payload: any) {
    return this.request<any>('/quotes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async updateQuote(quoteId: string, payload: any) {
    return this.request<any>(`/quotes/${quoteId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  public async updateQuoteStatus(quoteId: string, status: string) {
    return this.request<any>(`/quotes/${quoteId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  public async getQuoteVersions(quoteId: string) {
    return this.request<any>(`/quotes/${quoteId}/versions`, {
      method: 'GET',
    });
  }

  public async approveQuoteCommercial(
    quoteId: string,
    payload: {
      approvedByName: string;
      acceptanceChannel: 'whatsapp' | 'email' | 'presencial';
      acceptanceNotes?: string;
      artDecision: 'manter_pendente' | 'solicitar_revisao_arte' | 'aprovar_arte_atual';
      artRevisionNotes?: string;
      artApproverName?: string;
    }
  ) {
    return this.request<any>(`/quotes/${quoteId}/approve-commercial`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async uploadQuoteArtwork(
    quoteId: string,
    payload: { fileName: string; fileUrl: string; notes?: string }
  ) {
    return this.request<any>(`/quotes/${quoteId}/artworks`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async requestQuoteArtRevision(
    quoteId: string,
    payload: { revisionNotes: string; requestedBy?: string }
  ) {
    return this.request<any>(`/quotes/${quoteId}/artworks/request-revision`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async approveQuoteArtwork(
    quoteId: string,
    payload: { approverName: string; notes?: string; version?: number }
  ) {
    return this.request<any>(`/quotes/${quoteId}/artworks/approve`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async convertQuoteToOrder(quoteId: string, idempotencyKey?: string) {
    return this.request<any>(`/quotes/${quoteId}/convert-to-order`, {
      method: 'POST',
      headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : undefined,
    });
  }

  public async deleteQuote(quoteId: string) {
    return this.request<any>(`/quotes/${quoteId}`, { method: 'DELETE' });
  }

  // Orders
  public async getOrders() {
    return this.request<any[]>('/orders', { method: 'GET' });
  }

  public async createOrder(payload: any) {
    return this.request<any>('/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async updateOrder(orderId: string, payload: any) {
    return this.request<any>(`/orders/${orderId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  public async advanceOrderStage(orderId: string, targetStage: string, reason?: string) {
    return this.request<any>(`/orders/${orderId}/advance-stage`, {
      method: 'POST',
      body: JSON.stringify(reason ? { targetStage, reason } : { targetStage }),
    });
  }

  public async approveOrderArt(orderId: string, approverName: string, notes?: string) {
    return this.request<any>(`/orders/${orderId}/approve-art`, {
      method: 'POST',
      body: JSON.stringify({ approverName, notes }),
    });
  }

  public async requestOrderArtRevision(
    orderId: string,
    payload: { revisionNotes: string; requestedBy?: string }
  ) {
    return this.request<any>(`/orders/${orderId}/request-art-revision`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async deleteOrder(orderId: string) {
    return this.request<any>(`/orders/${orderId}`, { method: 'DELETE' });
  }

  public async getOrderDeadlinesSummary() {
    return this.request<any>('/orders/deadlines-summary', { method: 'GET' });
  }

  public async getOrderSchedule(orderId: string) {
    return this.request<any>(`/orders/${orderId}/schedule`, { method: 'GET' });
  }

  public async updateOrderSchedule(
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
  ) {
    return this.request<any>(`/orders/${orderId}/schedule`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  // Notifications & SLA Monitoring
  public async getNotifications() {
    return this.request<any>('/notifications', { method: 'GET' });
  }

  // Finance
  public async getTransactions() {
    return this.request<any[]>('/finance/transactions', { method: 'GET' });
  }

  public async getFinanceSummary() {
    return this.request<any>('/finance/summary', { method: 'GET' });
  }

  public async createTransaction(payload: any) {
    return this.request<any>('/finance/transactions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async confirmPayment(transactionId: string, payload: {
    receiptVoucherNumber: string;
    receiptEvidenceUrl?: string;
    confirmationNotes?: string;
    paymentMethod?: 'pix' | 'boleto' | 'transferencia' | 'cartao';
  }) {
    return this.request<any>(`/finance/transactions/${transactionId}/confirm-payment`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async reverseTransaction(transactionId: string, reason: string) {
    return this.request<any>(`/finance/transactions/${transactionId}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  public async deleteTransaction(transactionId: string) {
    return this.request<any>(`/finance/transactions/${transactionId}`, { method: 'DELETE' });
  }

  // Inventory
  public async getInventoryItems() {
    return this.request<any[]>('/inventory/items', { method: 'GET' });
  }

  public async createInventoryItem(payload: any) {
    return this.request<any>('/inventory/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async updateInventoryItem(itemId: string, payload: any) {
    return this.request<any>(`/inventory/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  public async deleteInventoryItem(itemId: string) {
    return this.request<any>(`/inventory/items/${itemId}`, { method: 'DELETE' });
  }

  public async getInventoryMovements(filters?: { itemId?: string; type?: string }) {
    const params = new URLSearchParams();
    if (filters?.itemId) params.set('itemId', filters.itemId);
    if (filters?.type) params.set('type', filters.type);
    const qs = params.toString();
    return this.request<any[]>(`/inventory/movements${qs ? `?${qs}` : ''}`, { method: 'GET' });
  }

  public async createStockMovement(payload: any) {
    return this.request<any>('/inventory/movements', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Leads
  public async getLeads() {
    return this.request<any[]>('/leads', { method: 'GET' });
  }

  public async submitPublicLead(payload: {
    clientName: string;
    companyName: string;
    phone: string;
    email?: string;
    category: string;
    estimatedQty: number;
    notes?: string;
  }) {
    return this.request<any>('/leads', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async updateLeadStatus(
    leadId: string,
    status: 'novo' | 'em_atendimento' | 'orcamento_enviado' | 'convertido' | 'perdido'
  ) {
    return this.request<any>(`/leads/${leadId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  // Clients
  public async getClients() {
    return this.request<any[]>('/clients', { method: 'GET' });
  }

  public async getClientProfile(clientId: string) {
    return this.request<any>(`/clients/${clientId}/profile`, { method: 'GET' });
  }

  public async createClient(payload: any) {
    return this.request<any>('/clients', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async updateClient(clientId: string, payload: any) {
    return this.request<any>(`/clients/${clientId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  public async deleteClient(clientId: string) {
    return this.request<any>(`/clients/${clientId}`, { method: 'DELETE' });
  }

  // Partners & Outsourced Services (Facções / Terceirizados + Custódia)
  public async getPartners() {
    return this.request<any[]>('/partners', { method: 'GET' });
  }

  public async getPartnerDetail(partnerId: string) {
    return this.request<any>(`/partners/${partnerId}`, { method: 'GET' });
  }

  public async getPartnerCustody() {
    return this.request<any[]>('/partners/custody', { method: 'GET' });
  }

  public async getPartnersFinancialForecast() {
    return this.request<any>('/partners/financial-forecast', { method: 'GET' });
  }

  public async createPartnerProvision(
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
  ) {
    return this.request<any>(`/partners/${partnerId}/provisions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async createPartner(payload: any) {
    return this.request<any>('/partners', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async updatePartner(partnerId: string, payload: any) {
    return this.request<any>(`/partners/${partnerId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  public async deletePartner(partnerId: string) {
    return this.request<any>(`/partners/${partnerId}`, { method: 'DELETE' });
  }

  public async dispatchPartnerCustody(
    partnerId: string,
    payload: {
      itemId: string;
      productionOrderId?: string;
      sentQuantity: number;
      notes?: string;
    }
  ) {
    return this.request<any>(`/partners/${partnerId}/custody`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async returnPartnerCustody(
    custodyId: string,
    payload: {
      returnedQuantity: number;
      lostQuantity: number;
      returnToPhysicalStock: boolean;
      notes?: string;
    }
  ) {
    return this.request<any>(`/partners/custody/${custodyId}/return`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Communication & WhatsApp
  public async getWhatsAppUnreadSummary() {
    return this.request<{
      totalUnread: number;
      openConversationsCount: number;
      totalConversationsCount: number;
      anyLiveConfigured: boolean;
    }>('/communication/unread-summary', { method: 'GET' });
  }

  public async getChannels() {
    return this.request<any[]>('/communication/channels', { method: 'GET' });
  }

  public async getChannelQr(channelId: string) {
    return this.request<any>(`/communication/channels/${channelId}/qr`, { method: 'GET' });
  }

  public async reconnectChannel(channelId: string) {
    return this.request<any>(`/communication/channels/${channelId}/reconnect`, { method: 'POST' });
  }

  public async getConversations() {
    return this.request<any[]>('/communication/conversations', { method: 'GET' });
  }

  public async startConversation(payload: {
    phone: string;
    customerName?: string;
    clientId?: string;
    channelId?: string;
  }) {
    return this.request<any>('/communication/conversations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async markConversationRead(conversationId: string) {
    return this.request<any>(`/communication/conversations/${conversationId}/read`, {
      method: 'POST',
    });
  }

  public async updateConversationStatus(
    conversationId: string,
    status: 'open' | 'pending' | 'resolved' | 'closed'
  ) {
    return this.request<any>(`/communication/conversations/${conversationId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  public async getConversationMessages(conversationId: string) {
    return this.request<any[]>(`/communication/conversations/${conversationId}/messages`, { method: 'GET' });
  }

  public async sendConversationMessage(
    conversationId: string,
    body: string,
    mediaUrl?: string,
    messageType?: 'text' | 'image' | 'document' | 'template',
    mediaMimeType?: string
  ) {
    return this.request<any>(`/communication/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body, mediaUrl, messageType, mediaMimeType }),
    });
  }

  public async sendTemplateMessage(payload: {
    templateType:
      | 'quote_ready'
      | 'downpayment_confirmed'
      | 'art_approval'
      | 'order_stage_update'
      | 'purchase_order'
      | 'payment_reminder';
    clientPhone: string;
    clientName: string;
    quoteNumber?: string;
    orderNumber?: string;
    poNumber?: string;
    amount?: number;
    voucherNumber?: string;
    artVersion?: number;
    artFileUrl?: string;
    stage?: string;
    targetDeliveryDate?: string;
    expectedDeliveryDate?: string;
    itemsSummary?: string;
    dueDate?: string;
    pixKey?: string;
    paymentLabel?: string;
  }) {
    return this.request<any>('/communication/send-template', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Audit
  public async getAuditLogs(limit: number = 50) {
    return this.request<any[]>(`/audit/logs?limit=${limit}`, { method: 'GET' });
  }

  // Migration
  public async importLocalStorageData(payload: any) {
    return this.request<any>('/migration/import-local-storage', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Lookups (CEP & CNPJ)
  public async lookupCep(cep: string) {
    const digits = cep.replace(/\D/g, '');
    return this.request<{
      cep: string;
      street: string;
      neighborhood: string;
      city: string;
      state: string;
      source: string;
    }>(`/lookups/cep/${digits}`, { method: 'GET' });
  }

  public async lookupCnpj(cnpj: string) {
    const digits = cnpj.replace(/\D/g, '');
    return this.request<{
      cnpj: string;
      companyName: string;
      tradeName: string;
      email: string;
      phone: string;
      cep: string;
      street: string;
      number: string;
      complement: string;
      neighborhood: string;
      city: string;
      state: string;
      addressLine: string;
      segment: string;
      foundedYear?: number;
      situation?: string;
      source: string;
    }>(`/lookups/cnpj/${digits}`, { method: 'GET' });
  }

  // Suppliers & Purchase Orders (Fornecedores & Compras de Insumos)
  public async getSuppliers() {
    return this.request<any[]>('/suppliers', { method: 'GET' });
  }

  public async getSuppliersSummary() {
    return this.request<any>('/suppliers/summary', { method: 'GET' });
  }

  public async getSupplierDetail(supplierId: string) {
    return this.request<any>(`/suppliers/${supplierId}`, { method: 'GET' });
  }

  public async createSupplier(payload: any) {
    return this.request<any>('/suppliers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async updateSupplier(supplierId: string, payload: any) {
    return this.request<any>(`/suppliers/${supplierId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  public async deleteSupplier(supplierId: string) {
    return this.request<any>(`/suppliers/${supplierId}`, { method: 'DELETE' });
  }

  public async getPurchaseOrders(filters?: { status?: string; supplierId?: string }) {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.supplierId) params.set('supplierId', filters.supplierId);
    const qs = params.toString();
    return this.request<any[]>(`/suppliers/purchase-orders${qs ? `?${qs}` : ''}`, { method: 'GET' });
  }

  public async createPurchaseOrder(payload: any) {
    return this.request<any>('/suppliers/purchase-orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async updatePurchaseOrderStatus(
    poId: string,
    payload: { status: string; autoGeneratePayable?: boolean }
  ) {
    return this.request<any>(`/suppliers/purchase-orders/${poId}/status`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async receivePurchaseOrder(
    poId: string,
    payload: {
      invoiceNumber?: string;
      updateUnitCost?: boolean;
      generatePayableIfMissing?: boolean;
      dueDate?: string;
      notes?: string;
      items: Array<{ itemId: string; receiveQuantity: number }>;
    }
  ) {
    return this.request<any>(`/suppliers/purchase-orders/${poId}/receive`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async generatePurchaseOrderPayable(
    poId: string,
    payload?: { amount?: number; dueDate?: string; paymentMethod?: string; description?: string }
  ) {
    return this.request<any>(`/suppliers/purchase-orders/${poId}/generate-payable`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  private async request<T>(path: string, options: RequestInit): Promise<ApiResponse<T>> {
    try {
      const method = (options.method || 'GET').toUpperCase();
      const mergedHeaders: Record<string, string> = {
        ...this.getHeaders(),
        ...(options.headers as Record<string, string> || {}),
      };

      // Injetar cabeçalho de proteção CSRF em requisições de mutação
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        let csrf = this.getCsrfToken();
        if (!csrf && path !== '/auth/login' && path !== '/auth/recover-password' && path !== '/leads') {
          csrf = await this.fetchCsrfToken();
        }
        if (csrf) {
          mergedHeaders['x-csrf-token'] = csrf;
        }
      }

      const res = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: mergedHeaders,
        credentials: 'include', // Envia cookies HttpOnly para a mesma origem
      });

      const contentType = res.headers.get('content-type');
      let data: any = null;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        data = await res.text();
      }

      if (!res.ok) {
        return {
          status: res.status,
          error: data?.error || (typeof data === 'string' ? data : 'Erro na requisição à API'),
          code: data?.code,
          data,
        };
      }

      return {
        status: res.status,
        data,
      };
    } catch (err: any) {
      console.warn(`[API] Erro ao comunicar com ${path}:`, err);
      return {
        status: 0,
        error: err.message || 'Falha de conexão com a API do servidor.',
      };
    }
  }
}

export const api = new ApiClient();
