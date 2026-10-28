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
  backendId?: string;
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
  artApproved: boolean;
  artApprovalDate?: string;
  artApprovedBy?: string;
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
  backendId?: string;
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
  
  // Arte Aprovada
  artApproved: boolean;
  artNotes?: string;

  notes: string;
  convertedToOrderId?: string;
}

export interface InventoryMovement {
  id: string;
  itemId: string;
  type: 'entrada_compra' | 'saida_corte' | 'remessa_parceiro' | 'retorno_parceiro' | 'perda_tecnica' | 'ajuste_inventario';
  quantity: number;
  unit: string;
  date: string;
  reason: string;
  referenceDoc?: string; // NF-e de compra, OP-2026-101
  operatorName: string;
}

export type InventoryCategory = 'tecido' | 'aviamento' | 'insumo_personalizacao' | 'pronta_entrega';

export interface InventoryItem {
  backendId?: string;
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
  supplier: string;
  location: string;
  lastRestocked: string;
}

export interface Client {
  backendId?: string;
  id: string;
  code?: string;
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
  standardUniformNotes: string;
  totalOrdersCount: number;
  totalSpent: number;
  isDemo?: boolean;
  createdAt: string;
}

export interface FinancialTransaction {
  backendId?: string;
  id: string;
  transactionNumber?: string;
  type: 'receber' | 'pagar';
  subType: 'entrada_pedido' | 'saldo_entrega' | 'compra_tecido' | 'servico_terceirizado' | 'despesa_geral';
  description: string;
  category: string;
  amount: number;
  dueDate: string;
  paidDate?: string;
  status: 'pendente' | 'pago' | 'atrasado';
  paymentMethod: 'boleto' | 'pix' | 'transferencia' | 'cartao';
  referenceId?: string; // OP ou Pedido vinculado
  receiptEvidenceUrl?: string; // Comprovante obrigatório
  receiptVoucherNumber?: string;
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
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  openingHours: string;
  productionCapacityPiecesMonth: number;
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
