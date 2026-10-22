/**
 * DE FARDAS ERP — Client API Layer
 * Camada unificada de comunicação com o backend modular Express/PostgreSQL.
 */

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

class ApiClient {
  private baseUrl: string = '/api';
  private currentRole: string = 'admin';
  private currentUserId: string = '11111111-1111-1111-1111-111111111111';

  public setRole(role: string, userId?: string) {
    this.currentRole = role;
    if (userId) this.currentUserId = userId;
  }

  public getRole(): string {
    return this.currentRole;
  }

  public getUserId(): string {
    return this.currentUserId;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-user-role': this.currentRole,
      'x-user-id': this.currentUserId,
    };
  }

  // Health
  public async getHealth() {
    return this.request<any>('/health', { method: 'GET' });
  }

  // Auth
  public async getMe() {
    return this.request<any>('/auth/me', { method: 'GET' });
  }

  public async switchRole(role: string, userId?: string) {
    const res = await this.request<any>('/auth/switch-role', {
      method: 'POST',
      body: JSON.stringify({ role, userId }),
    });
    if (res.data?.user) {
      this.setRole(res.data.user.role, res.data.user.id);
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

  public async advanceOrderStage(orderId: string, targetStage: string) {
    return this.request<any>(`/orders/${orderId}/advance-stage`, {
      method: 'POST',
      body: JSON.stringify({ targetStage }),
    });
  }

  public async approveOrderArt(orderId: string, approverName: string, notes?: string) {
    return this.request<any>(`/orders/${orderId}/approve-art`, {
      method: 'POST',
      body: JSON.stringify({ approverName, notes }),
    });
  }

  public async deleteOrder(orderId: string) {
    return this.request<any>(`/orders/${orderId}`, { method: 'DELETE' });
  }

  // Finance
  public async getTransactions() {
    return this.request<any[]>('/finance/transactions', { method: 'GET' });
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
  }) {
    return this.request<any>(`/finance/transactions/${transactionId}/confirm-payment`, {
      method: 'POST',
      body: JSON.stringify(payload),
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

  // Clients
  public async getClients() {
    return this.request<any[]>('/clients', { method: 'GET' });
  }

  public async createClient(payload: any) {
    return this.request<any>('/clients', {
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

  private async request<T>(path: string, options: RequestInit): Promise<ApiResponse<T>> {
    try {
      const mergedHeaders = {
        ...this.getHeaders(),
        ...(options.headers as Record<string, string> || {}),
      };

      const res = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: mergedHeaders,
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
