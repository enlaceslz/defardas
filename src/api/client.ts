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

  constructor() {
    // Carregar token salvo em memória do navegador caso exista
    try {
      this.sessionToken = localStorage.getItem('defardas_auth_token');
    } catch {
      this.sessionToken = null;
    }
  }

  public setToken(token: string | null) {
    this.sessionToken = token;
    try {
      if (token) {
        localStorage.setItem('defardas_auth_token', token);
      } else {
        localStorage.removeItem('defardas_auth_token');
      }
    } catch {
      // Ignorar indisponibilidade de localStorage
    }
  }

  public getToken(): string | null {
    return this.sessionToken;
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
    const res = await this.request<{ success: boolean; user: UserSessionData; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.data?.token) {
      this.setToken(res.data.token);
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
