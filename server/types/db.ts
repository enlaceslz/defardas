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

export type ArtworkStatus =
  | 'pendente'
  | 'enviada_para_cliente'
  | 'revisao_solicitada'
  | 'aprovada';

export interface ArtworkVersionEntity {
  id: string;
  version: number;
  fileName: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf' | 'external_link';
  fileUrl: string;
  fileSizeBytes?: number;
  status: 'enviada_para_cliente' | 'revisao_solicitada' | 'aprovada' | 'substituida';
  uploadedBy: string;
  uploadedAt: string;
  notes?: string;
  revisionRequestedBy?: string;
  revisionRequestedAt?: string;
  revisionNotes?: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface QuoteVersionSnapshotItem {
  modelName: string;
  fabricName: string;
  fabricColor: string;
  totalQuantity: number;
  calculatedBaseUnitCost: number;
  suggestedUnitPrice: number;
  negotiatedUnitPrice: number;
  totalItemPrice: number;
}

export interface QuoteVersionSnapshot {
  version: number;
  savedAt: string;
  savedBy: string;
  commercialStatus: string;
  artStatus: ArtworkStatus;
  validUntil: string;
  totalBaseCost: number;
  suggestedTotalAmount: number;
  negotiatedTotalAmount: number;
  discountAmount: number;
  estimatedMarginPercentage: number;
  entryAmount: number;
  balanceAmount: number;
  productionLeadDays: number;
  totalPieces: number;
  changeSummary: string;
  items: QuoteVersionSnapshotItem[];
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
  artStatus?: ArtworkStatus;
  artApproved: boolean;
  artApprovedBy?: string;
  artApprovalDate?: string;
  artFileUrl?: string;
  artNotes?: string;
  artVersions?: ArtworkVersionEntity[];
  versionHistory?: QuoteVersionSnapshot[];
  approvedByName?: string;
  approvedAt?: string;
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

export interface StageScheduleItem {
  stage: 'aguardando_liberacao' | 'corte' | 'bordado_silk' | 'costura' | 'conferencia_qualidade' | 'expedicao';
  label: string;
  orderIndex: number;
  plannedStartDate: string;
  plannedEndDate: string;
  plannedDays: number;
  actualStartDate?: string;
  actualEndDate?: string;
  responsible?: string;
  notes?: string;
  skipped?: boolean;
}

export interface ProductionOrderEntity {
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
  artStatus?: ArtworkStatus;
  artApproved: boolean;
  artApprovalDate?: string;
  artApprovedBy?: string;
  artFileUrl?: string;
  artVersionNumber?: number;
  artRevisionNotes?: string;
  entryPaymentConfirmed: boolean;
  entryReceiptUrl?: string;
  entryReceiptReference?: string;
  entryVerifiedById?: string;
  entryVerificationDate?: string;
  priority: 'normal' | 'alta' | 'urgente';
  creationDate: string;
  targetDeliveryDate: string;
  completionDate?: string;
  stageSchedule?: StageScheduleItem[];
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
  partnerId?: string;
  partnerName?: string;
  supplierId?: string;
  supplierName?: string;
  purchaseOrderId?: string;
  purchaseOrderNumber?: string;
  clientId?: string;
  clientName?: string;
  serviceReference?: string;
  isProvision?: boolean;
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
  supplierId?: string;
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

export type PartnerServiceCategory =
  | 'costura'
  | 'bordado'
  | 'silk_screen'
  | 'acabamento'
  | 'corte_externo';

export interface PartnerEntity {
  id: string;
  code: string; // Ex: FAC-2026-0101
  name: string;
  tradeName: string;
  cnpjCpf?: string;
  phone: string;
  email?: string;
  address?: string;
  city: string;
  state?: string;
  cep?: string;
  partnerType: PartnerServiceCategory;
  capacityPiecesPerMonth?: string;
  defaultCostPerPiece?: number;
  leadTimeDays?: number;
  pixKey?: string;
  rating: number;
  notes?: string;
  active: boolean;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerCustodyEntity {
  id: string;
  partnerId: string;
  itemId: string;
  productionOrderId?: string;
  remittanceMovementId?: string;
  sentQuantity: number;
  returnedQuantity: number;
  lostQuantity: number;
  unit: string;
  sentDate: string;
  status: 'em_custodia' | 'devolvido_total' | 'devolvido_parcial' | 'avaria_registrada';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type SupplierCategory =
  | 'tecidos_malhas'
  | 'aviamentos'
  | 'bordado_estamparia'
  | 'embalagens'
  | 'servicos_manutencao'
  | 'outros';

export interface SupplierEntity {
  id: string;
  code: string; // Ex: FOR-2026-0001
  companyName: string;
  tradeName: string;
  cnpj?: string;
  stateRegistration?: string;
  contactName: string;
  phone: string;
  email?: string;
  address?: string;
  city: string;
  state: string;
  cep?: string;
  category: SupplierCategory;
  paymentTerms: string;
  paymentTermsDays: number;
  defaultPaymentMethod: 'pix' | 'boleto' | 'transferencia' | 'cartao';
  pixKey?: string;
  bankDetails?: string;
  leadTimeDays: number;
  minOrderValue: number;
  rating: number;
  notes?: string;
  active: boolean;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PurchaseOrderStatus =
  | 'rascunho'
  | 'enviado'
  | 'confirmado'
  | 'recebido_parcial'
  | 'recebido_total'
  | 'cancelado';

export interface PurchaseOrderItemEntity {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  receivedQuantity: number;
  unitCost: number;
  subtotal: number;
}

export interface PurchaseOrderEntity {
  id: string;
  poNumber: string; // Ex: PC-2026-0001
  supplierId: string;
  supplierName: string;
  relatedOrderId?: string;
  relatedOrderNumber?: string;
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDeliveryDate: string;
  receivedDate?: string;
  items: PurchaseOrderItemEntity[];
  subtotalAmount: number;
  freightCost: number;
  discountAmount: number;
  totalAmount: number;
  paymentTerms: string;
  paymentMethod: 'pix' | 'boleto' | 'transferencia' | 'cartao';
  dueDate: string;
  invoiceNumber?: string;
  notes?: string;
  createdByName?: string;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

