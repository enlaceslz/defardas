/**
 * DE FARDAS ERP — Database & Domain Entity Definitions
 * Schemas: core, crm, producao, estoque, financeiro
 * Normativo: PRD v1.6 e Adendos B.2.1, B.2.2, A.3.2
 */

export type UserRole = 
  | 'admin' 
  | 'gerente_comercial' 
  | 'vendedor' 
  | 'pcp_producao' 
  | 'financeiro' 
  | 'expedicao_qualidade';

export interface UserEntity {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntity {
  id: string;
  actorId?: string;
  actorName: string;
  actorRole: string;
  entityName: string;
  entityId: string;
  action: string;
  oldData?: any;
  newData?: any;
  notes?: string;
  ipAddress?: string;
  createdAt: string;
}

export interface ClientEntity {
  id: string;
  code: string; // Ex: CLI-2026-0201
  companyName: string;
  tradeName: string;
  cnpj: string;
  stateRegistration?: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  segment: string;
  standardUniformNotes?: string;
  totalOrdersCount: number;
  totalSpent: number;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LeadEntity {
  id: string;
  leadNumber: string; // Ex: LEAD-2026-0101
  clientName: string;
  companyName: string;
  phone: string;
  email: string;
  category: string;
  estimatedQuantity: number;
  notes?: string;
  origin: string;
  status: 'novo' | 'em_contato' | 'convertido_em_proposta' | 'desqualificado';
  convertedQuoteId?: string;
  assignedSellerId?: string;
  isDemo: boolean;
  createdAt: string;
}

export interface QuoteItemEntity {
  id: string;
  quoteId: string;
  category: string;
  modelName: string;
  fabricName: string;
  fabricColor: string;
  sizes: {
    pp: number;
    p: number;
    m: number;
    g: number;
    gg: number;
    xg: number;
    exg: number;
    sobMedida: number;
  };
  totalQuantity: number;
  materialUnitCost: number;
  outsourcedSewingUnitCost: number;
  customizationUnitCost: number;
  freightUnitCost: number;
  technicalLossPercentage: number;
  calculatedBaseUnitCost: number;
  markupPercentage: number;
  suggestedUnitPrice: number;
  negotiatedUnitPrice: number;
  totalItemPrice: number;
  customizations?: any[];
}

export interface QuoteEntity {
  id: string;
  quoteNumber: string; // Ex: ORC-2026-1001
  version: number;
  clientId: string;
  clientName: string;
  clientCnpj: string;
  sellerId?: string;
  sellerName: string;
  commercialStatus: 'rascunho' | 'enviado' | 'em_negociacao' | 'aprovado' | 'recusado' | 'cancelado' | 'convertido_em_pedido';
  date: string;
  validUntil: string;
  totalBaseCost: number;
  markupPercentage: number;
  suggestedTotalAmount: number;
  negotiatedTotalAmount: number;
  discountAmount: number;
  estimatedMarginPercentage: number;
  belowSuggestedAuthorized: boolean;
  authorizedById?: string;
  authorizedByName?: string;
  authorizationDate?: string;
  authorizationNotes?: string;
  entryPercentage: 50.00; // Invariante: 50% fixado no PRD
  entryAmount: number;
  balanceAmount: number;
  paymentTerms: string;
  productionLeadDays: number;
  artApproved: boolean;
  artApprovedBy?: string;
  artApprovalDate?: string;
  artFileUrl?: string;
  artNotes?: string;
  acceptanceChannel: 'whatsapp' | 'email' | 'presencial';
  acceptanceNotes?: string;
  acceptanceTimestamp?: string;
  notes?: string;
  convertedOrderId?: string;
  isLocked: boolean;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  items: QuoteItemEntity[];
}

export interface ProductionOrderEntity {
  quoteItemId?: string;
  id: string;
  orderNumber: string; // Ex: OP-2026-0101
  quoteId?: string;
  quoteVersion: number;
  idempotencyKey: string;
  clientId: string;
  clientName: string;
  itemTitle: string;
  category: string;
  fabricName: string;
  fabricColor: string;
  sizes: any;
  totalPieces: number;
  customizations: any[];
  commercialStatus: string;
  financialStatus: 'entrada_pendente' | 'entrada_confirmada' | 'saldo_em_aberto' | 'quitado';
  stage: 'aguardando_liberacao' | 'corte' | 'bordado_silk' | 'costura' | 'conferencia_qualidade' | 'retrabalho' | 'expedicao' | 'entregue';
  artApproved: boolean;
  artApprovalDate?: string;
  artApprovedBy?: string;
  entryPaymentConfirmed: boolean;
  entryReceiptUrl?: string;
  entryReceiptReference?: string;
  entryVerifiedById?: string;
  entryVerificationDate?: string;
  priority: 'normal' | 'alta' | 'urgente';
  creationDate: string;
  targetDeliveryDate: string;
  completionDate?: string;
  outsourcedPartner?: string;
  partnerCostPerPiece?: number;
  technicalNotes?: string;
  assignedTeam: string;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialTransactionEntity {
  id: string;
  transactionNumber: string; // Ex: FIN-2026-5001
  productionOrderId?: string;
  quoteId?: string;
  type: 'receber' | 'pagar';
  subType: 'entrada_pedido' | 'saldo_entrega' | 'compra_tecido' | 'servico_terceirizado' | 'despesa_geral';
  description: string;
  category: string;
  amount: number;
  dueDate: string;
  paidDate?: string;
  status: 'pendente' | 'pago' | 'atrasado' | 'estornado';
  paymentMethod: 'pix' | 'boleto' | 'transferencia' | 'cartao';
  referenceId?: string;
  receiptEvidenceUrl?: string;
  receiptVoucherNumber?: string;
  confirmedById?: string;
  confirmedByName?: string;
  confirmationNotes?: string;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItemEntity {
  id: string;
  code: string; // Ex: MAT-2026-0301
  name: string;
  category: 'tecido' | 'aviamento' | 'insumo_personalizacao' | 'pronta_entrega';
  unit: 'metros' | 'kg' | 'rolos' | 'unidades' | 'cones' | 'pecas';
  physicalStock: number;
  allocatedStock: number;
  inPartnersCustodyStock: number;
  minStock: number;
  unitCostPrice: number;
  supplier: string;
  location: string;
  lastRestocked: string;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovementEntity {
  id: string;
  movementNumber: string; // Ex: MOV-2026-0101
  itemId: string;
  productionOrderId?: string;
  type: 'entrada_compra' | 'saida_corte' | 'remessa_parceiro' | 'retorno_parceiro' | 'perda_tecnica' | 'ajuste_inventario';
  quantity: number;
  unit: string;
  date: string;
  reason: string;
  referenceDoc?: string;
  operatorId?: string;
  operatorName: string;
  isDemo: boolean;
  createdAt: string;
}

export interface WhatsAppChannelEntity {
  id: string;
  provider: 'meta_cloud' | 'wa_akg';
  channelName: string;
  phoneNumber: string;
  status: 'connected' | 'connecting' | 'disconnected' | 'qr_ready' | 'error';
  qrCode?: string;
  config?: any;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationEntity {
  id: string;
  channelId: string;
  clientId?: string;
  leadId?: string;
  remoteJid: string;
  customerName: string;
  customerPhone: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  assignedAgentId?: string;
  unreadCount: number;
  lastMessageText?: string;
  lastMessageAt?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MessageEntity {
  id: string;
  conversationId: string;
  externalId?: string;
  direction: 'inbound' | 'outbound';
  senderName?: string;
  messageType: 'text' | 'image' | 'document' | 'audio' | 'template';
  body: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  errorMessage?: string;
  createdAt: string;
}
