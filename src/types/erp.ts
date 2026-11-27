/**
 * DE FARDAS — Modelos de Domínio e Tipos do ERP
 * Baseado no PRD v1.6 (Adendos Normativos e de Auditoria)
 */

// 1. Estados Desacoplados (Regra B.2.2 do PRD)
export type CommercialStatus = 
  | 'rascunho'
  | 'enviado'
  | 'em_negociacao'
  | 'aprovado'
  | 'recusado'
  | 'cancelado'
  | 'convertido_em_pedido';

export type FinancialOrderStatus = 
  | 'entrada_pendente'
  | 'entrada_confirmada'
  | 'saldo_em_aberto'
  | 'quitado';

export type OperationalStage = 
  | 'aguardando_liberacao' // Bloqueado: aguarda entrada confirmada e aprovação de arte
  | 'corte'               // 1. Corte & Enfesto
  | 'bordado_silk'        // 2. Terceirizado: Bordado / Silk-screen
  | 'costura'             // 3. Terceirizado/Interno: Costura & Montagem
  | 'conferencia_qualidade' // 4. Inspeção final da DE FARDAS
  | 'retrabalho'          // 4b. Ocorrência de defeito devolvida a parceiro
  | 'expedicao'           // 5. Embalagem e despacho
  | 'entregue';           // Concluído com comprovante de entrega

export type PriorityLevel = 'normal' | 'alta' | 'urgente';

export type UniformCategory = 
  | 'polos'
  | 'camisetas'
  | 'jalecos'
  | 'calcas'
  | 'coletes'
  | 'linha_social'
  | 'linha_hospitalar'
  | 'aventais_batas'
  | 'macacoes'
  | 'operacional';

export interface SizeGrid {
  pp: number;
  p: number;
  m: number;
  g: number;
  gg: number;
  xg: number;
  exg: number;
  sobMedida: number;
}

export interface CustomizationItem {
  id: string;
  type: 'bordado_peito' | 'bordado_costas' | 'silk_1cor' | 'silk_policromia' | 'sublimacao' | 'patch_emborrachado' | 'faixa_refletiva';
  description: string;
  location: string;
  unitCost: number;
  partnerName?: string;
}

export interface CostBreakdown {
  materialUnitCost: number;          // Tecido e aviamentos
  outsourcedSewingUnitCost: number;  // Costura terceirizada por peça
  customizationUnitCost: number;     // Bordado/Silk por peça
  freightPerUnit: number;            // Frete/entrega rateado
  technicalLossPercentage: number;   // Perda técnica estimada (%)
  calculatedBaseCost: number;        // Custo-base direto total por peça
  markupPercentage: number;          // Markup k% sobre o custo
  suggestedUnitPrice: number;        // Custo-base * (1 + k/100)
  negotiatedUnitPrice: number;       // Preço praticado
  discountPercentage: number;
  belowSuggestedAuthorized: boolean; // Autorização caso preço < sugerido
  authorizerName?: string;
  estimatedMarginPercentage: number; // Margem calculada separadamente: (Preço - Custo) / Preço * 100
}

export interface MaterialRequirement {
  id: string;
  materialName: string;
  unit: string;
  estimatedQuantity: number;
  allocatedInStock: number;
  sentToPartnerQuantity: number;
  returnedFromPartnerQuantity: number;
  lostQuantity: number;
}

export interface ProductionOrder {
  id: string; // Ex: OP-2026-101
  orderNumber?: string;
  idempotencyKey?: string;
  isDemo?: boolean;
  quoteId?: string; // Idempotência: vinculado à versão exata do orçamento
  quoteVersion?: number;
  clientId: string;
  clientName: string;
  itemTitle: string;
  category: UniformCategory;
  fabricName: string;
  fabricColor: string;
  sizes: SizeGrid;
  totalPieces: number;
  customizations: CustomizationItem[];
  costBreakdown: CostBreakdown;
  materials: MaterialRequirement[];
  
  // Tríade de Estados do PRD
  commercialStatus: CommercialStatus;
  financialStatus: FinancialOrderStatus;
  stage: OperationalStage;
  
  // Gates de Liberação para Produção
  artStatus?: ArtworkStatus;
  artApproved: boolean;
  artApprovalDate?: string;
  artApprovedBy?: string;
  artFileUrl?: string;
  artVersionNumber?: number;
  artRevisionNotes?: string;
  entryPaymentConfirmed: boolean;
  entryReceiptUrl?: string;
  canStartProduction: boolean; // artApproved && entryPaymentConfirmed

  // Terceirização e Controle de Qualidade
  outsourcedPartner?: string;
  partnerCostPerPiece?: number;
  qualityCheck?: {
    checkedBy: string;
    date: string;
    approvedPieces: number;
    rejectedPieces: number;
    reworkRequested: boolean;
    lossRecordedMeters: number;
    notes: string;
  };

  priority: PriorityLevel;
  creationDate: string;
  targetDeliveryDate: string;
  completionDate?: string;
  stageSchedule?: StageScheduleItem[];
  deadlineSummary?: OrderDeadlineSummary;
  deliveryProof?: {
    deliveredDate: string;
    receivedBy: string;
    documentNumber: string;
  };
  technicalNotes: string;
  assignedTeam?: string;
}

export interface QuoteItem {
  id: string;
  modelName: string;
  category: UniformCategory;
  fabricName: string;
  fabricColor: string;
  sizes: SizeGrid;
  totalQuantity: number;
  costBreakdown: CostBreakdown;
  unitFinalPrice: number;
  totalPrice: number;
  customizations: CustomizationItem[];
}

export interface Quote {
  id: string; // Ex: ORC-904
  quoteNumber?: string;
  isDemo?: boolean;
  version: number;
  clientId: string;
  clientName: string;
  clientCnpj: string;
  clientContact: string;
  clientPhone: string;
  clientEmail: string;
  sellerName: string;
  date: string;
  validUntil: string;
  items: QuoteItem[];
  subtotal: number;
  discountPercentage: number;
  totalAmount: number;
  
  // Condições Comerciais Aprovadas
  entryPercentage: number; // Ex: 50%
  entryAmount: number;
  balanceDueAtDelivery: number;
  paymentTerms: string;
  productionLeadDays: number;
  
  // Rastreamento de Aceite por WhatsApp
  status: CommercialStatus;
  whatsAppProof?: {
    contactId: string;
    timestamp: string;
    notes: string;
    manualConfirmation: boolean;
  };
  
  // Arte Aprovada & Armazenamento Versionado (Desacoplado do Comercial)
  artStatus?: ArtworkStatus;
  artApproved: boolean;
  artApprovedBy?: string;
  artApprovalDate?: string;
  artFileUrl?: string;
  artNotes?: string;
  artVersions?: ArtworkVersion[];
  versionHistory?: QuoteVersionSnapshot[];
  approvedByName?: string;
  approvedAt?: string;
  acceptanceChannel?: 'whatsapp' | 'email' | 'presencial';
  acceptanceNotes?: string;

  notes: string;
  convertedToOrderId?: string;
}

export type ArtworkStatus =
  | 'pendente'
  | 'enviada_para_cliente'
  | 'revisao_solicitada'
  | 'aprovada';

export interface ArtworkVersion {
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

export interface InventoryMovement {
  id: string;
  movementNumber?: string;
  itemId: string;
  itemCode?: string;
  itemName?: string;
  productionOrderId?: string;
  orderNumber?: string;
  type: 'entrada_compra' | 'saida_corte' | 'remessa_parceiro' | 'retorno_parceiro' | 'perda_tecnica' | 'ajuste_inventario';
  quantity: number;
  unit: string;
  date: string;
  reason: string;
  referenceDoc?: string; // NF-e de compra, OP-2026-101
  operatorName: string;
  createdAt?: string;
}

export type InventoryCategory = 'tecido' | 'aviamento' | 'insumo_personalizacao' | 'pronta_entrega';

export interface InventoryItem {
  id: string;
  code: string;
  name: string;
  category: InventoryCategory;
  unit: 'metros' | 'kg' | 'rolos' | 'unidades' | 'cones' | 'pecas';
  currentStock: number;
  allocatedStock: number; // Reservado para OPs
  inPartnersCustodyStock: number; // Em poder de terceiros
  minStock: number;
  costPrice: number;
  supplierId?: string;
  supplier: string;
  location: string;
  lastRestocked: string;
}

export interface ClientMetrics {
  quotesCount: number;
  openQuotesCount: number;
  ordersCount: number;
  activeOrdersCount: number;
  totalPiecesOrdered: number;
  paidReceivablesAmount: number;
  pendingReceivablesAmount: number;
  lastOrderDate?: string | null;
}

export type GeoPrecision = 'numero' | 'logradouro' | 'cep' | 'cidade' | 'manual';

export interface StructuredAddressValue {
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  address: string;
  latitude?: number;
  longitude?: number;
  geoPrecision?: GeoPrecision;
  geoSource?: string;
}

export interface Client {
  id: string;
  code?: string;
  companyName: string;
  tradeName: string;
  cnpj: string;
  isPreliminaryCnpj?: boolean;
  stateRegistration?: string;
  contactName: string;
  phone: string;
  email: string;
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  address: string;
  city: string;
  state: string;
  latitude?: number;
  longitude?: number;
  geoPrecision?: GeoPrecision;
  geoSource?: string;
  segment: string;
  standardUniformNotes: string;
  totalOrdersCount: number;
  totalSpent: number;
  metrics?: ClientMetrics;
  isDemo?: boolean;
  createdAt: string;
}

export interface LeadItem {
  id: string;
  leadNumber: string;
  clientName: string;
  companyName: string;
  phone: string;
  email?: string;
  category: string;
  estimatedQuantity: number;
  notes?: string;
  origin: string;
  status: 'novo' | 'em_atendimento' | 'orcamento_enviado' | 'convertido' | 'perdido';
  assignedSellerId?: string;
  isDemo?: boolean;
  createdAt: string;
}

export interface ClientProfileResponse {
  client: Client;
  quotes: any[];
  orders: ProductionOrder[];
  transactions: FinancialTransaction[];
  leads: LeadItem[];
  metrics: ClientMetrics;
}

export interface FinancialTransaction {
  id: string;
  transactionNumber?: string;
  productionOrderId?: string;
  quoteId?: string;
  orderNumber?: string;
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
  paymentMethod: 'boleto' | 'pix' | 'transferencia' | 'cartao';
  referenceId?: string; // OP ou Pedido vinculado
  receiptEvidenceUrl?: string; // Comprovante obrigatório
  receiptVoucherNumber?: string;
  confirmedById?: string;
  confirmedByName?: string;
  confirmationNotes?: string;
  isDemo?: boolean;
}

export interface CompanyProfile {
  name: string;
  tradeName: string;
  cnpj: string;
  ie: string;
  foundedYear: number;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  street?: string;
  addressNumber?: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  latitude?: number;
  longitude?: number;
  geoPrecision?: GeoPrecision;
  geoSource?: string;
  openingHours: string;
  productionCapacityPiecesMonth: number;
  logoUrl?: string;
}

export interface PublicCatalogItem {
  id: string;
  title: string;
  category: UniformCategory;
  description: string;
  recommendedFabrics: string[];
  features: string[];
  customizationOptions: string[];
  imageUrl?: string;
  isPopular?: boolean;
}

export type PartnerServiceCategory =
  | 'costura'
  | 'bordado'
  | 'silk_screen'
  | 'acabamento'
  | 'corte_externo';

export interface PartnerMetrics {
  activeOrdersCount: number;
  totalOrdersCount: number;
  totalPiecesAssigned: number;
  openCustodyCount: number;
  openCustodyQty: number;
  totalContractedAmount: number;
  paidServicesAmount: number;
  pendingPayablesAmount: number;
  overduePayablesAmount: number;
  unbilledProvisionAmount: number;
  totalRemainingAmount: number;
  nextPaymentDate: string | null;
}

export interface PartnerOrderFinancials {
  serviceRole: 'principal' | 'personalizacao' | 'misto';
  serviceReference: string;
  unitCost: number;
  contractedAmount: number;
  paidAmount: number;
  pendingCpAmount: number;
  overdueCpAmount: number;
  unbilledProvisionAmount: number;
  remainingTotalAmount: number;
  nextDueDate: string | null;
  forecastDueDate: string;
  openPayablesCount: number;
  paidPayablesCount: number;
  paymentStatus: 'quitado' | 'atrasado' | 'parcial_cp' | 'cp_lancado' | 'a_provisionar';
}

export interface EnrichedPartnerOrder extends ProductionOrder {
  financials: PartnerOrderFinancials;
}

export interface PartnerForecastRow {
  rowKey: string;
  partnerId: string;
  partnerCode: string;
  partnerName: string;
  partnerType: PartnerServiceCategory;
  pixKey?: string;
  leadTimeDays: number;
  productionOrderId?: string;
  orderNumber?: string;
  orderStage?: string;
  itemTitle?: string;
  totalPieces: number;
  targetDeliveryDate?: string;
  clientId?: string;
  clientName: string;
  serviceRole: 'principal' | 'personalizacao' | 'misto' | 'avulso';
  serviceReference: string;
  unitCost: number;
  contractedAmount: number;
  paidAmount: number;
  pendingCpAmount: number;
  overdueCpAmount: number;
  unbilledProvisionAmount: number;
  remainingTotalAmount: number;
  nextDueDate: string | null;
  forecastDueDate: string;
  openPayablesCount: number;
  paidPayablesCount: number;
  paymentStatus: 'quitado' | 'atrasado' | 'parcial_cp' | 'cp_lancado' | 'a_provisionar';
}

export interface PartnerPayablesSummary {
  totalContracted: number;
  totalPaid: number;
  totalPendingCP: number;
  totalOverdueCP: number;
  totalUnbilledProvision: number;
  totalRemaining: number;
  nextPaymentDate: string | null;
  openObligationsCount: number;
  partnersWithOpenBalanceCount: number;
}

export interface PartnerFinancialForecastResponse {
  asOfDate: string;
  rows: PartnerForecastRow[];
  summary: PartnerPayablesSummary;
}

export interface Partner {
  id: string;
  code: string;
  name: string;
  tradeName: string;
  cnpjCpf?: string;
  phone: string;
  email?: string;
  address?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city: string;
  state: string;
  cep?: string;
  latitude?: number;
  longitude?: number;
  geoPrecision?: GeoPrecision;
  geoSource?: string;
  partnerType: PartnerServiceCategory;
  capacityPiecesPerMonth?: string;
  defaultCostPerPiece: number;
  leadTimeDays: number;
  pixKey?: string;
  rating: number;
  notes?: string;
  active: boolean;
  isDemo?: boolean;
  createdAt?: string;
  updatedAt?: string;
  metrics?: PartnerMetrics;
}

export interface PartnerCustody {
  id: string;
  partnerId: string;
  itemId: string;
  productionOrderId?: string;
  remittanceMovementId?: string;
  sentQuantity: number;
  returnedQuantity: number;
  lostQuantity: number;
  pendingQuantity: number;
  unit: string;
  sentDate: string;
  status: 'em_custodia' | 'devolvido_parcial' | 'devolvido_total' | 'avaria_registrada';
  notes?: string;
  partnerCode?: string;
  partnerName?: string;
  partnerType?: PartnerServiceCategory;
  itemCode?: string;
  itemName?: string;
  orderNumber?: string;
  clientName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PartnerDetailResponse {
  partner: Partner;
  orders: EnrichedPartnerOrder[];
  custody: PartnerCustody[];
  payables: FinancialTransaction[];
  financialSummary?: PartnerMetrics;
}

// Cronograma por Etapa & Monitoramento de Prazos (SLA Fabril)
export type CorePipelineStage =
  | 'aguardando_liberacao'
  | 'corte'
  | 'bordado_silk'
  | 'costura'
  | 'conferencia_qualidade'
  | 'expedicao';

export type StageDeadlineStatus =
  | 'concluida_no_prazo'
  | 'concluida_atrasada'
  | 'em_andamento_no_prazo'
  | 'em_andamento_alerta'
  | 'em_andamento_atrasada'
  | 'retrabalho'
  | 'pendente'
  | 'nao_aplicavel';

export type OrderDeliveryStatus =
  | 'entregue_no_prazo'
  | 'entregue_atrasada'
  | 'atrasada'
  | 'critica_hoje'
  | 'atencao'
  | 'no_prazo';

export interface StageScheduleItem {
  stage: CorePipelineStage;
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

export interface EvaluatedStageScheduleItem extends StageScheduleItem {
  status: StageDeadlineStatus;
  daysRemaining: number;
  isCurrent: boolean;
  isCompleted: boolean;
}

export interface OrderDeadlineSummary {
  asOfDate: string;
  deliveryStatus: OrderDeliveryStatus;
  daysToDelivery: number;
  targetDeliveryDate: string;
  progressPercent: number;
  completedStagesCount: number;
  totalApplicableStagesCount: number;
  delayedStagesCount: number;
  isCurrentStageOverdue: boolean;
  isCurrentStageDueSoon: boolean;
  currentStageItem: EvaluatedStageScheduleItem | null;
  stages: EvaluatedStageScheduleItem[];
}

export type NotificationSeverity = 'critical' | 'warning' | 'info';

export type NotificationCategory =
  | 'prazo_entrega'
  | 'prazo_etapa'
  | 'portao_gate'
  | 'retrabalho'
  | 'estoque'
  | 'financeiro'
  | 'comercial';

export interface SystemNotificationItem {
  id: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  message: string;
  entityCode?: string;
  entityId?: string;
  clientName?: string;
  stage?: string;
  stageLabel?: string;
  dueDate?: string;
  daysDelta?: number;
  targetTab: 'orders' | 'quotes' | 'inventory' | 'finance' | 'partners' | 'suppliers';
  actionLabel: string;
  openScheduleModal?: boolean;
}

export interface NotificationsSummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
  overdueOrdersCount: number;
  dueSoonOrdersCount: number;
  overdueStagesCount: number;
  dueSoonStagesCount: number;
  blockedOrdersCount: number;
  reworkOrdersCount: number;
  lowStockCount: number;
  overdueFinanceCount: number;
}

export interface NotificationsPayload {
  asOfDate: string;
  summary: NotificationsSummary;
  notifications: SystemNotificationItem[];
}

// =========================================================================
// MÓDULO DE FORNECEDORES & PEDIDOS DE COMPRA
// =========================================================================

export type SupplierCategory =
  | 'tecidos_malhas'
  | 'aviamentos'
  | 'bordado_estamparia'
  | 'embalagens'
  | 'servicos_manutencao'
  | 'outros';

export interface SupplierMetrics {
  linkedItemsCount: number;
  lowStockItemsCount: number;
  totalPurchaseOrders: number;
  openPurchaseOrdersCount: number;
  delayedPOsCount: number;
  totalPurchasedAmount: number;
  openOrdersAmount: number;
  totalPaidAmount: number;
  totalPendingAmount: number;
  totalOverdueAmount: number;
  lastPurchaseDate?: string;
}

export interface Supplier {
  id: string;
  code: string;
  companyName: string;
  tradeName: string;
  cnpj?: string;
  stateRegistration?: string;
  contactName: string;
  phone: string;
  email?: string;
  address?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city: string;
  state: string;
  cep?: string;
  latitude?: number;
  longitude?: number;
  geoPrecision?: GeoPrecision;
  geoSource?: string;
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
  metrics?: SupplierMetrics;
  createdAt?: string;
  updatedAt?: string;
}

export type PurchaseOrderStatus =
  | 'rascunho'
  | 'enviado'
  | 'confirmado'
  | 'recebido_parcial'
  | 'recebido_total'
  | 'cancelado';

export interface PurchaseOrderItem {
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

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  relatedOrderId?: string;
  relatedOrderNumber?: string;
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDeliveryDate: string;
  receivedDate?: string;
  items: PurchaseOrderItem[];
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
  // Campos enriquecidos pelo servidor
  totalOrderedQty?: number;
  totalReceivedQty?: number;
  receivedPercent?: number;
  daysToExpectedDelivery?: number;
  isDeliveryOverdue?: boolean;
  isDeliveryDueSoon?: boolean;
  linkedPayablesCount?: number;
  billedAmount?: number;
  paidAmount?: number;
  pendingPayableAmount?: number;
  overduePayableAmount?: number;
  hasPayableCoverage?: boolean;
  linkedPayables?: FinancialTransaction[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SuppliersSummaryResponse {
  asOfDate: string;
  totalSuppliersCount: number;
  activeSuppliersCount: number;
  openPurchaseOrdersCount: number;
  delayedPurchaseOrdersCount: number;
  openPurchaseOrdersValue: number;
  lowStockItemsCount: number;
  totalPaidToSuppliers: number;
  totalPendingToSuppliers: number;
  totalOverdueToSuppliers: number;
}

export interface SupplierDetailResponse {
  supplier: Supplier;
  metrics: SupplierMetrics;
  linkedItems: Array<{
    id: string;
    code: string;
    name: string;
    category: InventoryCategory;
    unit: string;
    physicalStock: number;
    allocatedStock: number;
    inPartnersCustodyStock: number;
    minStock: number;
    unitCostPrice: number;
    lastRestocked: string;
  }>;
  purchaseOrders: PurchaseOrder[];
  payables: FinancialTransaction[];
}

// =========================================================================
// MÓDULO DE RELATÓRIOS AUDITÁVEIS & COMPARTILHAMENTO VIA LINK WHATSAPP / PDF
// =========================================================================

export type ReportDomain =
  | 'executivo'
  | 'producao'
  | 'comercial'
  | 'financeiro'
  | 'estoque'
  | 'parceiros'
  | 'fornecedores';

export interface ReportKpiItem {
  label: string;
  value: string;
  sublabel?: string;
  tone?: 'neutral' | 'crimson' | 'emerald' | 'amber' | 'rose';
}

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  mono?: boolean;
}

export interface ReportSection {
  id: string;
  title: string;
  subtitle?: string;
  summaryRight?: string;
  columns: ReportColumn[];
  rows: Array<Record<string, string>>;
  emptyMessage?: string;
  totalsRow?: Record<string, string>;
}

export interface ReportSnapshot {
  reportCode: string;
  reportType: ReportDomain;
  title: string;
  subtitle?: string;
  filterSummary: string;
  filtersMeta?: Record<string, string | number | boolean>;
  generatedAt: string;
  generatedBy: string;
  company: {
    tradeName: string;
    name: string;
    cnpj: string;
    ie?: string;
    phone: string;
    whatsapp?: string;
    email: string;
    address: string;
    neighborhood?: string;
    city: string;
    state: string;
    cep: string;
    logoUrl?: string;
  };
  kpis: ReportKpiItem[];
  sections: ReportSection[];
  notes?: string;
}

export interface SharedReportPublicPayload {
  reportCode: string;
  reportType: ReportDomain;
  createdAt: string;
  expiresAt: string;
  createdByName: string;
  accessCount: number;
  snapshot: ReportSnapshot;
}

export interface SharedReportListItem {
  id: string;
  reportCode: string;
  reportType: ReportDomain;
  title: string;
  filterSummary: string;
  createdByName: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  accessCount: number;
  recipientLabel: string | null;
  isExpired: boolean;
}

// =========================================================================
// GEOLOCALIZAÇÃO POR CEP+NÚMERO, ROTAS E COMPARTILHAMENTO VIA WHATSAPP
// =========================================================================

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  precision: GeoPrecision;
  displayName: string;
  cep?: string;
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  source: string;
}

export type LocationEntityType = 'client' | 'partner' | 'supplier' | 'company';

export interface LocationSharePayload {
  locationCode: string;
  entityType: LocationEntityType;
  entityId?: string;
  title: string;
  subtitle?: string;
  contactName?: string;
  phone?: string;
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city: string;
  state: string;
  fullAddressLine: string;
  latitude: number;
  longitude: number;
  geoPrecision?: GeoPrecision;
  notes?: string;
  company: {
    tradeName: string;
    name: string;
    phone: string;
    whatsapp?: string;
    email: string;
    city: string;
    state: string;
    logoUrl?: string;
  };
}

export interface SharedLocationPublicPayload {
  locationCode: string;
  entityType: LocationEntityType;
  createdAt: string;
  expiresAt: string;
  createdByName: string;
  accessCount: number;
  location: LocationSharePayload;
}

export interface SharedLocationListItem {
  id: string;
  locationCode: string;
  entityType: LocationEntityType;
  title: string;
  fullAddressLine: string;
  createdByName: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  accessCount: number;
  recipientLabel: string | null;
  isExpired: boolean;
}

export interface RouteStepItem {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  name?: string;
}

export interface RouteCalculationResult {
  distanceMeters: number;
  durationSeconds: number;
  geometry: Array<[number, number]>;
  steps: RouteStepItem[];
  source: 'OSRM' | 'Haversine';
}
