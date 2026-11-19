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
  StockMovementEntity,
  PartnerEntity,
  PartnerCustodyEntity
} from '../types/db';
import { sequenceService } from '../services/sequenceService';
import { auditService } from '../services/auditService';

import { pool, db as drizzleDb } from './index';

export class DatabaseManager {
  private pgPool: pg.Pool = pool;
  private isConnectedToPostgres: boolean = false;
  private readyPromise: Promise<void>;

  // Repositórios em memória transacionais com integridade referencial
  public clients: Map<string, ClientEntity> = new Map();
  public leads: Map<string, LeadEntity> = new Map();
  public quotes: Map<string, QuoteEntity> = new Map();
  public orders: Map<string, ProductionOrderEntity> = new Map();
  public finance: Map<string, FinancialTransactionEntity> = new Map();
  public inventory: Map<string, InventoryItemEntity> = new Map();
  public movements: Map<string, StockMovementEntity> = new Map();
  public partners: Map<string, PartnerEntity> = new Map();
  public partnerCustodies: Map<string, PartnerCustodyEntity> = new Map();
  public channels: Map<string, any> = new Map();
  public conversations: Map<string, any> = new Map();
  public messages: Map<string, any> = new Map();

  constructor() {
    this.readyPromise = this.initDatabase();
  }

  public async ensureReady(): Promise<void> {
    await this.readyPromise;
  }

  private async initDatabase() {
    const dbUrl = process.env.DATABASE_URL;
    const isProd = process.env.NODE_ENV === 'production';

    if (dbUrl) {
      try {
        const client = await this.pgPool.connect();
        this.isConnectedToPostgres = true;
        client.release();
        await sequenceService.ensurePostgresSequences();
        console.log('✅ [DATABASE] Conectado com sucesso ao PostgreSQL próprio da DE FARDAS via Drizzle ORM.');
      } catch (err) {
        if (isProd) {
          console.error('❌ [DATABASE] Falha crítica de conexão com o PostgreSQL em produção (P0-001):', err);
        } else {
          console.warn('⚠️ [DATABASE] Conexão com PostgreSQL não disponível no ambiente local. Inicializando estrutura transacional de desenvolvimento.', err);
        }
        this.isConnectedToPostgres = false;
      }
    } else {
      console.log('ℹ️ [DATABASE] DATABASE_URL não definida. Operando no modo de desenvolvimento transacional.');
    }

    // Nunca injetar dados demonstrativos em memória no ambiente de produção
    if (!isProd && !this.isConnectedToPostgres) {
      this.seedInitialDemoData();
    }
  }

  public getDrizzle() {
    return drizzleDb;
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
      cnpj: '14.520.890/0001-77',
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
      cnpj: '08.192.401/0001-00',
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
      outsourcedPartner: 'Facção Têxtil Maranhense',
      partnerCostPerPiece: 12.00,
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

    // 7. Canais WhatsApp (Meta WhatsApp Cloud API e WA-AKG QR Code)
    const ch1 = {
      id: 'ch-meta-official',
      provider: 'meta_cloud',
      channelName: 'DE FARDAS — WhatsApp Business Cloud (Oficial)',
      phoneNumber: '+55 98 98841-2090',
      status: 'connected',
      isActive: true,
      createdAt: '2026-10-01T08:00:00Z',
      updatedAt: '2026-10-01T08:00:00Z',
    };
    const ch2 = {
      id: 'ch-wa-akg-qr',
      provider: 'wa_akg',
      channelName: 'DE FARDAS — WA-AKG (Conexão QR Code)',
      phoneNumber: '+55 98 98123-4567',
      status: 'connected',
      qrCode: null,
      isActive: true,
      createdAt: '2026-10-01T08:00:00Z',
      updatedAt: '2026-10-01T08:00:00Z',
    };
    this.channels.set(ch1.id, ch1);
    this.channels.set(ch2.id, ch2);

    // Conversa demonstrativa do Hospital Guará
    const conv1 = {
      id: 'conv-hospital-guara',
      channelId: ch1.id,
      clientId: c1.id,
      remoteJid: '5598988412090@s.whatsapp.net',
      customerName: 'Dra. Camila Vasconcelos',
      customerPhone: '(98) 98841-2090',
      status: 'open',
      unreadCount: 0,
      lastMessageText: 'Olá! Aprovamos o layout dos jalecos Oxfordine. Segue o comprovante de sinal.',
      lastMessageAt: '2026-10-20T14:35:00Z',
      tags: ['cliente_vip', 'hospitalar', 'op_ativa'],
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-20T14:35:00Z',
    };
    this.conversations.set(conv1.id, conv1);

    const msg1 = {
      id: 'msg-001',
      conversationId: conv1.id,
      direction: 'outbound',
      senderName: 'Atendimento DE FARDAS',
      messageType: 'text',
      body: 'Olá Dra. Camila! Conforme conversamos, estamos enviando o orçamento ORC-2026-1001 com a decomposição de custos para os jalecos e scrubs.',
      status: 'read',
      createdAt: '2026-10-20T10:15:00Z',
    };
    const msg2 = {
      id: 'msg-002',
      conversationId: conv1.id,
      direction: 'inbound',
      senderName: 'Dra. Camila Vasconcelos',
      messageType: 'text',
      body: 'Olá! Aprovamos o layout dos jalecos Oxfordine. Segue o comprovante de sinal.',
      status: 'read',
      createdAt: '2026-10-20T14:35:00Z',
    };
    this.messages.set(msg1.id, msg1);
    this.messages.set(msg2.id, msg2);

    // 8. Parceiros & Terceirizados Homologados (São Luís / MA)
    const p1: PartnerEntity = {
      id: 'p1111111-1111-1111-1111-111111111111',
      code: 'FAC-2026-0001',
      name: 'CONFECÇÕES TÊXTIL MARANHENSE LTDA',
      tradeName: 'Facção Têxtil Maranhense',
      cnpjCpf: '28.419.550/0001-18',
      phone: '(98) 98712-4410',
      email: 'producao@textilmaranhense.com.br',
      address: 'Av. Jerônimo de Albuquerque, 1280 - Cohab Anil',
      city: 'São Luís',
      state: 'MA',
      cep: '65050-175',
      partnerType: 'costura',
      capacityPiecesPerMonth: '3200',
      defaultCostPerPiece: 12.00,
      leadTimeDays: 6,
      pixKey: '28.419.550/0001-18',
      rating: 4.9,
      notes: 'Especializada em camisas polo, jalecos hospitalares e costura reta/overloque industrial.',
      active: true,
      isDemo: true,
      createdAt: '2026-01-12T09:00:00Z',
      updatedAt: '2026-10-15T11:00:00Z',
    };
    const p2: PartnerEntity = {
      id: 'p2222222-2222-2222-2222-222222222222',
      code: 'FAC-2026-0002',
      name: 'BORDADOS SÃO LUÍS PERSONALIZAÇÃO ME',
      tradeName: 'Bordados São Luís',
      cnpjCpf: '31.904.112/0001-44',
      phone: '(98) 98422-8831',
      email: 'artes@bordadossaoluis.com.br',
      address: 'Rua Grande, 512 - Centro',
      city: 'São Luís',
      state: 'MA',
      cep: '65020-250',
      partnerType: 'bordado',
      capacityPiecesPerMonth: '4500',
      defaultCostPerPiece: 6.50,
      leadTimeDays: 3,
      pixKey: '31.904.112/0001-44',
      rating: 4.95,
      notes: 'Bordadeiras Tajima 8 cabeças — alta definição em logomarcas corporativas e brasões.',
      active: true,
      isDemo: true,
      createdAt: '2026-01-18T10:00:00Z',
      updatedAt: '2026-10-18T14:00:00Z',
    };
    const p3: PartnerEntity = {
      id: 'p3333333-3333-3333-3333-333333333333',
      code: 'FAC-2026-0003',
      name: 'ILHA SILK & ESTAMPARIA INDUSTRIAL LTDA',
      tradeName: 'Ilha Silk & Estamparia',
      cnpjCpf: '19.775.320/0001-90',
      phone: '(98) 98109-3377',
      email: 'orcamento@ilhasilk.com.br',
      address: 'Av. Guajajaras, 940 - Tirirical',
      city: 'São Luís',
      state: 'MA',
      cep: '65055-285',
      partnerType: 'silk_screen',
      capacityPiecesPerMonth: '5000',
      defaultCostPerPiece: 5.00,
      leadTimeDays: 4,
      pixKey: '19.775.320/0001-90',
      rating: 4.7,
      notes: 'Silk-screen plastisol, tinta refletiva industrial e sublimação total.',
      active: true,
      isDemo: true,
      createdAt: '2026-02-04T08:30:00Z',
      updatedAt: '2026-10-12T16:20:00Z',
    };
    const p4: PartnerEntity = {
      id: 'p4444444-4444-4444-4444-444444444444',
      code: 'FAC-2026-0004',
      name: 'ATELIÊ RENASCENÇA ACABAMENTO TÊXTIL ME',
      tradeName: 'Acabamento & Revisão Renascença',
      cnpjCpf: '42.118.609/0001-05',
      phone: '(98) 98865-1102',
      email: 'contato@acabamentorenascenca.com.br',
      address: 'Rua dos Tucanos, 88 - Jardim Renascença',
      city: 'São Luís',
      state: 'MA',
      cep: '65075-441',
      partnerType: 'acabamento',
      capacityPiecesPerMonth: '4000',
      defaultCostPerPiece: 3.50,
      leadTimeDays: 2,
      pixKey: '42.118.609/0001-05',
      rating: 4.85,
      notes: 'Caseado, pregação de botões, limpeza de fios, passadoria industrial e embalagem individual.',
      active: true,
      isDemo: true,
      createdAt: '2026-03-01T09:15:00Z',
      updatedAt: '2026-10-10T10:00:00Z',
    };
    this.partners.set(p1.id, p1);
    this.partners.set(p2.id, p2);
    this.partners.set(p3.id, p3);
    this.partners.set(p4.id, p4);

    // 9. Custódia inicial rastreada compatível com m1.inPartnersCustodyStock (60 kg)
    const cust1: PartnerCustodyEntity = {
      id: 'cust-1111-1111-1111-111111111111',
      partnerId: p1.id,
      itemId: m1.id,
      productionOrderId: op1.id,
      sentQuantity: 60.00,
      returnedQuantity: 0.00,
      lostQuantity: 0.00,
      unit: 'kg',
      sentDate: '2026-10-21',
      status: 'em_custodia',
      notes: 'Remessa de Malha Piquet PA Azul Marinho para lote de camisas/jalecos OP-2026-0101.',
      createdAt: '2026-10-21T09:30:00Z',
      updatedAt: '2026-10-21T09:30:00Z',
    };
    this.partnerCustodies.set(cust1.id, cust1);
  }
}

export const db = new DatabaseManager();
