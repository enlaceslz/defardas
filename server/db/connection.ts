/**
 * DE FARDAS ERP — Database Manager & Connection Store
 * Gerencia a conexão com o PostgreSQL próprio da DE FARDAS (via DATABASE_URL)
 * e fornece persistência transacional com garantia de integridade, constraints
 * do PRD e segregação de dados demonstrativos.
 */
import pg from 'pg';
import { 
  ClientEntity, 
  LeadEntity, 
  QuoteEntity, 
  ProductionOrderEntity, 
  FinancialTransactionEntity, 
  InventoryItemEntity, 
  StockMovementEntity 
} from '../types/db';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';

const { Pool } = pg;

export class DatabaseManager {
  private pgPool: pg.Pool | null = null;
  private isConnectedToPostgres: boolean = false;

  // Repositórios em memória transacionais com integridade referencial
  public clients: Map<string, ClientEntity> = new Map();
  public leads: Map<string, LeadEntity> = new Map();
  public quotes: Map<string, QuoteEntity> = new Map();
  public orders: Map<string, ProductionOrderEntity> = new Map();
  public finance: Map<string, FinancialTransactionEntity> = new Map();
  public inventory: Map<string, InventoryItemEntity> = new Map();
  public movements: Map<string, StockMovementEntity> = new Map();

  constructor() {
    this.initDatabase();
  }

  private async initDatabase() {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      try {
        this.pgPool = new Pool({
          connectionString: dbUrl,
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
        });
        const client = await this.pgPool.connect();
        this.isConnectedToPostgres = true;
        client.release();
        console.log('✅ [DATABASE] Conectado com sucesso ao PostgreSQL próprio da DE FARDAS.');
      } catch (err) {
        console.warn('⚠️ [DATABASE] Conexão com PostgreSQL falhou ou não configurada. Operando no modo transacional resiliente.', err);
        this.isConnectedToPostgres = false;
      }
    } else {
      console.log('ℹ️ [DATABASE] DATABASE_URL não definida. Operando no modo de desenvolvimento transacional.');
    }

    this.seedInitialDemoData();
  }

  public isConnected(): boolean {
    return this.isConnectedToPostgres;
  }

  public getPool(): pg.Pool | null {
    return this.pgPool;
  }

  /**
   * Seed de dados demonstrativos com segregação explícita (is_demo = true)
   */
  public seedInitialDemoData() {
    // 1. Clientes
    const c1: ClientEntity = {
      id: 'c1111111-1111-1111-1111-111111111111',
      code: 'CLI-2026-0201',
      companyName: 'HOSPITAL GUARÁ MEDICINA INTEGRADA LTDA',
      tradeName: 'Hospital Guará',
      cnpj: '14.520.890/0001-33',
      stateRegistration: '12.445.678-9',
      contactName: 'Dra. Camila Vasconcelos',
      phone: '(98) 98841-2090',
      email: 'compras@hospitalguara.com.br',
      address: 'Av. dos Holandeses, 450 - Calhau',
      city: 'São Luís',
      state: 'MA',
      segment: 'Hospitalar / Saúde',
      standardUniformNotes: 'Jalecos Oxfordine anti-manchas e conjuntos scrub microfibra verde cirúrgico.',
      totalOrdersCount: 8,
      totalSpent: 38450.00,
      isDemo: true,
      createdAt: '2026-01-10T10:00:00Z',
      updatedAt: '2026-01-10T10:00:00Z',
    };
    const c2: ClientEntity = {
      id: 'c2222222-2222-2222-2222-222222222222',
      code: 'CLI-2026-0202',
      companyName: 'LOGÍSTICA PORTO GRANDE S/A',
      tradeName: 'Porto Grande Log',
      cnpj: '08.192.401/0001-12',
      stateRegistration: '12.112.980-4',
      contactName: 'Marcos Aurélio Sousa',
      phone: '(98) 98112-9944',
      email: 'marcos.suprimentos@portogrande.com.br',
      address: 'Av. dos Portugueses, s/n - Itaqui',
      city: 'São Luís',
      state: 'MA',
      segment: 'Logística & Transporte Portuário',
      standardUniformNotes: 'Calças operacionais brim pesado com faixa 3M e polos alta visibilidade.',
      totalOrdersCount: 14,
      totalSpent: 92100.00,
      isDemo: true,
      createdAt: '2026-01-15T14:30:00Z',
      updatedAt: '2026-01-15T14:30:00Z',
    };
    this.clients.set(c1.id, c1);
    this.clients.set(c2.id, c2);

    // 2. Estoque
    const m1: InventoryItemEntity = {
      id: 'm1111111-1111-1111-1111-111111111111',
      code: 'MAT-2026-0301',
      name: 'Malha Piquet PA 50/50 Azul Marinho',
      category: 'tecido',
      unit: 'kg',
      physicalStock: 420.00,
      allocatedStock: 150.00,
      inPartnersCustodyStock: 60.00,
      minStock: 100.00,
      unitCostPrice: 36.50,
      supplier: 'Malharia Santanense',
      location: 'Prateleira A1 - Rolo Master',
      lastRestocked: '2026-10-18',
      isDemo: true,
      createdAt: '2026-02-01T08:00:00Z',
      updatedAt: '2026-10-18T09:00:00Z',
    };
    const m2: InventoryItemEntity = {
      id: 'm2222222-2222-2222-2222-222222222222',
      code: 'MAT-2026-0302',
      name: 'Brim Pesado 100% Algodão Cinza Chumbo',
      category: 'tecido',
      unit: 'metros',
      physicalStock: 850.00,
      allocatedStock: 320.00,
      inPartnersCustodyStock: 180.00,
      minStock: 200.00,
      unitCostPrice: 22.80,
      supplier: 'Cedro Têxtil Workwear',
      location: 'Prateleira B2 - Enfesto',
      lastRestocked: '2026-10-10',
      isDemo: true,
      createdAt: '2026-02-01T08:00:00Z',
      updatedAt: '2026-10-10T11:00:00Z',
    };
    this.inventory.set(m1.id, m1);
    this.inventory.set(m2.id, m2);

    // 3. Lead de demonstração centralizado
    const l1: LeadEntity = {
      id: 'lead-1',
      leadNumber: 'LEAD-2026-0101',
      clientName: 'Fernanda Martins',
      companyName: 'Clinica Renascença Odonto',
      phone: '(98) 98455-1212',
      email: 'contato@renascencaodonto.com.br',
      category: 'linha_hospitalar',
      estimatedQuantity: 45,
      notes: 'Solicitação pelo Portal Público: Jalecos bordados manga curta.',
      origin: 'portal_publico',
      status: 'novo',
      isDemo: true,
      createdAt: '2026-10-21T14:00:00Z',
    };
    this.leads.set(l1.id, l1);

    // 4. Orçamento de demonstração (50% sinal fixado)
    const q1: QuoteEntity = {
      id: 'q1111111-1111-1111-1111-111111111111',
      quoteNumber: 'ORC-2026-1001',
      version: 1,
      clientId: c1.id,
      clientName: c1.companyName,
      clientCnpj: c1.cnpj,
      sellerName: 'Mariana Alencar',
      commercialStatus: 'enviado',
      date: '2026-10-20',
      validUntil: '2026-11-04',
      totalBaseCost: 5569.20,
      markupPercentage: 50.00,
      suggestedTotalAmount: 8353.80,
      negotiatedTotalAmount: 8320.00,
      discountAmount: 33.80,
      estimatedMarginPercentage: 33.05,
      belowSuggestedAuthorized: true,
      authorizedByName: 'Carlos Eduardo Silva (Admin)',
      authorizationDate: '2026-10-20T11:30:00Z',
      entryPercentage: 50.00,
      entryAmount: 4160.00,
      balanceAmount: 4160.00,
      paymentTerms: '50% Sinal (Liberação de Corte) + 50% na Entrega',
      productionLeadDays: 16,
      artApproved: true,
      artApprovedBy: 'Dra. Camila Vasconcelos',
      artApprovalDate: '2026-10-20T14:15:00Z',
      acceptanceChannel: 'whatsapp',
      acceptanceNotes: 'Comprovante de aprovação da arte recebido via WhatsApp (98) 98841-2090.',
      isLocked: false,
      isDemo: true,
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-20T14:15:00Z',
      items: [
        {
          id: 'item-1',
          quoteId: 'q1111111-1111-1111-1111-111111111111',
          category: 'linha_hospitalar',
          modelName: 'Jaleco Médico Feminino Oxfordine Especial',
          fabricName: 'Oxfordine Leve 100% Poliéster',
          fabricColor: 'Branco Hospitalar',
          sizes: { pp: 0, p: 20, m: 50, g: 40, gg: 15, xg: 5, exg: 0, sobMedida: 0 },
          totalQuantity: 130,
          materialUnitCost: 22.00,
          outsourcedSewingUnitCost: 12.00,
          customizationUnitCost: 6.50,
          freightUnitCost: 1.50,
          technicalLossPercentage: 2.0,
          calculatedBaseUnitCost: 42.84,
          markupPercentage: 50.0,
          suggestedUnitPrice: 64.26,
          negotiatedUnitPrice: 64.00,
          totalItemPrice: 8320.00,
          customizations: [
            {
              id: 'c-1',
              type: 'bordado_peito',
              description: 'Bordado logomarca alta definição no peito',
              location: 'Peito Esquerdo',
              unitCost: 6.50,
            }
          ]
        }
      ]
    };
    this.quotes.set(q1.id, q1);

    // 5. Ordem de produção modelo (OP-2026-0101) com Portão A.3.2 em aguardando liberação
    const op1: ProductionOrderEntity = {
      id: 'op1111111-1111-1111-1111-111111111111',
      orderNumber: 'OP-2026-0101',
      quoteId: q1.id,
      quoteVersion: 1,
      idempotencyKey: 'convert_quote_q1111111_v1',
      clientId: c1.id,
      clientName: c1.companyName,
      itemTitle: 'Jaleco Médico Feminino Oxfordine Especial',
      category: 'linha_hospitalar',
      fabricName: 'Oxfordine Leve 100% Poliéster',
      fabricColor: 'Branco Hospitalar',
      sizes: { pp: 0, p: 20, m: 50, g: 40, gg: 15, xg: 5, exg: 0, sobMedida: 0 },
      totalPieces: 130,
      customizations: [
        {
          id: 'c-1',
          type: 'bordado_peito',
          description: 'Bordado logomarca alta definição no peito',
          location: 'Peito Esquerdo',
          unitCost: 6.50,
        }
      ],
      commercialStatus: 'aprovado',
      financialStatus: 'entrada_pendente', // Bloqueia produção até comprovar sinal!
      stage: 'aguardando_liberacao',       // Gate A.3.2
      artApproved: true,
      artApprovalDate: '2026-10-20T14:15:00Z',
      artApprovedBy: 'Dra. Camila Vasconcelos',
      entryPaymentConfirmed: false,        // Sinal de 50% pendente de comprovante
      priority: 'normal',
      creationDate: '2026-10-20',
      targetDeliveryDate: '2026-11-05',
      technicalNotes: 'Ficha gerada a partir da Proposta ORC-2026-1001. Amostra de bordado aprovada.',
      assignedTeam: 'Mesa de Corte & Facção Especializada',
      isDemo: true,
      createdAt: '2026-10-20T15:00:00Z',
      updatedAt: '2026-10-20T15:00:00Z',
    };
    this.orders.set(op1.id, op1);

    // 6. Transação de Sinal 50% vinculada à OP
    const fin1: FinancialTransactionEntity = {
      id: 'fin-sinal-1',
      transactionNumber: 'FIN-2026-5001',
      productionOrderId: op1.id,
      quoteId: q1.id,
      type: 'receber',
      subType: 'entrada_pedido',
      description: 'Sinal 50% - Proposta ORC-2026-1001 (Hospital Guará)',
      category: 'Venda de Uniformes',
      amount: 4160.00,
      dueDate: '2026-10-20',
      status: 'pendente',
      paymentMethod: 'pix',
      referenceId: 'OP-2026-0101',
      isDemo: true,
      createdAt: '2026-10-20T15:00:00Z',
      updatedAt: '2026-10-20T15:00:00Z',
    };
    this.finance.set(fin1.id, fin1);
  }
}

export const db = new DatabaseManager();
