import React, { useEffect, useMemo, useState } from 'react';
import {
  Truck,
  Plus,
  Search,
  ShoppingCart,
  PackageCheck,
  AlertTriangle,
  Wallet,
  Building2,
  Phone,
  Mail,
  MapPin,
  Clock,
  Star,
  Pencil,
  Trash2,
  X,
  Eye,
  CheckCircle2,
  Send,
  XCircle,
  Boxes,
  MessageSquare,
  ArrowRight,
  KeyRound,
  FileText,
  Loader2,
  Factory,
  RefreshCw,
  Navigation,
} from 'lucide-react';
import {
  CompanyProfile,
  InventoryItem,
  LocationSharePayload,
  ProductionOrder,
  PurchaseOrder,
  PurchaseOrderStatus,
  StructuredAddressValue,
  Supplier,
  SupplierCategory,
  SupplierDetailResponse,
  SuppliersSummaryResponse,
} from '../types/erp';
import { formatCurrencyBRL, formatDateBR } from '../utils/formatters';
import {
  CnpjLookupInput,
  PhoneInputBR,
  CurrencyInput,
  DateInputBR,
  CnpjAutoFillData,
} from './FormInputs';
import { useAuth } from '../api/authContext';
import { api } from '../api/client';
import { initialCompanyProfile } from '../data/initialData';
import {
  applyCnpjAddressUpdate,
  buildEntityLocationPayload,
  buildStructuredAddressFromEntity,
  composeAddressLine,
  isValidCoordinates,
} from '../utils/addressUtils';
import { StructuredAddressFieldset } from './StructuredAddressFieldset';
import { WhatsAppLocationShareModal } from './WhatsAppLocationShareModal';

export const SUPPLIER_CATEGORY_META: Record<
  SupplierCategory,
  { label: string; shortLabel: string; badgeClass: string }
> = {
  tecidos_malhas: {
    label: 'Tecidos & Malhas',
    shortLabel: 'Tecidos',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  aviamentos: {
    label: 'Aviamentos & Zíperes',
    shortLabel: 'Aviamentos',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  bordado_estamparia: {
    label: 'Insumos de Bordado / Silk',
    shortLabel: 'Personalização',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  embalagens: {
    label: 'Embalagens & Etiquetas',
    shortLabel: 'Embalagens',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  servicos_manutencao: {
    label: 'Peças & Manutenção Industrial',
    shortLabel: 'Manutenção',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
  },
  outros: {
    label: 'Outros Insumos',
    shortLabel: 'Outros',
    badgeClass: 'bg-slate-50 text-slate-600 border-slate-200',
  },
};

const PO_STATUS_META: Record<PurchaseOrderStatus, { label: string; badgeClass: string }> = {
  rascunho: { label: 'Rascunho', badgeClass: 'bg-slate-100 text-slate-700 border-slate-300' },
  enviado: { label: 'Enviado ao Fornecedor', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  confirmado: { label: 'Confirmado (Em Trânsito)', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  recebido_parcial: { label: 'Recebido Parcial', badgeClass: 'bg-amber-50 text-amber-800 border-amber-300' },
  recebido_total: { label: 'Recebido Total', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelado: { label: 'Cancelado', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' },
};

interface PreselectedReplenishItem {
  itemId: string;
  supplierId?: string;
}

interface SuppliersViewProps {
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  summary?: SuppliersSummaryResponse | null;
  inventory: InventoryItem[];
  orders: ProductionOrder[];
  profile?: CompanyProfile;
  preselectedReplenish?: PreselectedReplenishItem | null;
  onClearPreselectedReplenish?: () => void;
  onSaveSupplier: (payload: Partial<Supplier>, existingId?: string) => Promise<boolean>;
  onDeleteSupplier: (supplierId: string) => void;
  onCreatePurchaseOrder: (payload: any) => Promise<boolean>;
  onUpdatePurchaseOrderStatus: (
    poId: string,
    status: PurchaseOrderStatus,
    autoGeneratePayable?: boolean
  ) => Promise<boolean>;
  onReceivePurchaseOrder: (
    poId: string,
    payload: {
      invoiceNumber?: string;
      updateUnitCost?: boolean;
      generatePayableIfMissing?: boolean;
      dueDate?: string;
      notes?: string;
      items: Array<{ itemId: string; receiveQuantity: number }>;
    }
  ) => Promise<boolean>;
  onGeneratePurchaseOrderPayable: (poId: string) => Promise<boolean>;
  onOpenSupplierWhatsApp?: (supplier: Supplier, po?: PurchaseOrder) => Promise<void>;
  onSendViaCentralWhatsApp?: (
    phone: string,
    recipientName: string,
    message: string
  ) => Promise<void> | void;
  onNavigateTab: (tab: string) => void;
}

interface DraftPoLine {
  itemId: string;
  quantity: number;
  unitCost: number;
}

function addDaysISO(baseISO: string, days: number): string {
  const dt = new Date(`${baseISO}T12:00:00Z`);
  if (Number.isNaN(dt.getTime())) return baseISO;
  dt.setUTCDate(dt.getUTCDate() + Math.max(0, Math.round(days)));
  return dt.toISOString().split('T')[0];
}

export const SuppliersView: React.FC<SuppliersViewProps> = ({
  suppliers,
  purchaseOrders,
  summary,
  inventory,
  orders,
  profile,
  preselectedReplenish,
  onClearPreselectedReplenish,
  onSaveSupplier,
  onDeleteSupplier,
  onCreatePurchaseOrder,
  onUpdatePurchaseOrderStatus,
  onReceivePurchaseOrder,
  onGeneratePurchaseOrderPayable,
  onOpenSupplierWhatsApp,
  onSendViaCentralWhatsApp,
  onNavigateTab,
}) => {
  const { user } = useAuth();
  const role = user?.role || '';
  const companyProfile = profile || initialCompanyProfile;

  // Permissões alinhadas estritamente a server/auth/rbac.ts
  const canManageSuppliers = ['admin', 'pcp_producao', 'financeiro'].includes(role);
  const canManageOrders = ['admin', 'pcp_producao', 'financeiro'].includes(role);
  const canReceiveOrders = ['admin', 'pcp_producao'].includes(role);
  const canDeleteSupplier = role === 'admin';
  const canViewFinance = ['admin', 'financeiro', 'gerente_comercial'].includes(role);
  const canUseWhatsApp = ['admin', 'gerente_comercial', 'vendedor', 'financeiro'].includes(role);

  const [activeTab, setActiveTab] = useState<'suppliers' | 'orders' | 'replenish' | 'finance'>('suppliers');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | SupplierCategory>('all');
  const [showInactive, setShowInactive] = useState(false);

  // PO filters
  const [poStatusFilter, setPoStatusFilter] = useState<'all' | 'open' | 'delayed' | 'received' | 'cancelled'>('all');
  const [poSearch, setPoSearch] = useState('');

  // Modal: Cadastro / Edição de Fornecedor
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supCompanyName, setSupCompanyName] = useState('');
  const [supTradeName, setSupTradeName] = useState('');
  const [supCnpj, setSupCnpj] = useState('');
  const [supIE, setSupIE] = useState('');
  const [supContactName, setSupContactName] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supEmail, setSupEmail] = useState('');
  const [supAddressData, setSupAddressData] = useState<StructuredAddressValue>(() =>
    buildStructuredAddressFromEntity({ city: 'São Luís', state: 'MA' })
  );
  const [supAddressSyncKey, setSupAddressSyncKey] = useState(0);
  const [locationShareTarget, setLocationShareTarget] = useState<LocationSharePayload | null>(null);
  const [locatingSupplierId, setLocatingSupplierId] = useState<string | null>(null);
  const [supCategory, setSupCategory] = useState<SupplierCategory>('tecidos_malhas');
  const [supPaymentTerms, setSupPaymentTerms] = useState('30 dias no boleto');
  const [supPaymentTermsDays, setSupPaymentTermsDays] = useState(30);
  const [supPaymentMethod, setSupPaymentMethod] = useState<Supplier['defaultPaymentMethod']>('boleto');
  const [supPixKey, setSupPixKey] = useState('');
  const [supBankDetails, setSupBankDetails] = useState('');
  const [supLeadTimeDays, setSupLeadTimeDays] = useState(7);
  const [supMinOrderValue, setSupMinOrderValue] = useState(0);
  const [supRating, setSupRating] = useState(5);
  const [supNotes, setSupNotes] = useState('');
  const [supActive, setSupActive] = useState(true);
  const [supFormError, setSupFormError] = useState('');
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);

  // Modal: Novo Pedido de Compra
  const [isPoModalOpen, setIsPoModalOpen] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poRelatedOrderId, setPoRelatedOrderId] = useState('');
  const [poExpectedDelivery, setPoExpectedDelivery] = useState('');
  const [poDueDate, setPoDueDate] = useState('');
  const [poPaymentTerms, setPoPaymentTerms] = useState('30 dias');
  const [poPaymentMethod, setPoPaymentMethod] = useState<PurchaseOrder['paymentMethod']>('boleto');
  const [poFreightCost, setPoFreightCost] = useState(0);
  const [poDiscountAmount, setPoDiscountAmount] = useState(0);
  const [poInitialStatus, setPoInitialStatus] = useState<'rascunho' | 'enviado' | 'confirmado'>('confirmado');
  const [poAutoPayable, setPoAutoPayable] = useState(true);
  const [poNotes, setPoNotes] = useState('');
  const [poLines, setPoLines] = useState<DraftPoLine[]>([]);
  const [poFormError, setPoFormError] = useState('');
  const [isSavingPo, setIsSavingPo] = useState(false);

  // Modal: Recebimento Físico de Pedido de Compra
  const [receivingPo, setReceivingPo] = useState<PurchaseOrder | null>(null);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({});
  const [receiveInvoiceNumber, setReceiveInvoiceNumber] = useState('');
  const [receiveUpdateCost, setReceiveUpdateCost] = useState(true);
  const [receiveGeneratePayable, setReceiveGeneratePayable] = useState(true);
  const [receiveNotes, setReceiveNotes] = useState('');
  const [receiveError, setReceiveError] = useState('');
  const [isSubmittingReceive, setIsSubmittingReceive] = useState(false);

  // Modal: Dossiê 360° do Fornecedor
  const [detailSupplierId, setDetailSupplierId] = useState<string | null>(null);
  const [supplierDetail, setSupplierDetail] = useState<SupplierDetailResponse | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Ação de status em andamento
  const [busyPoId, setBusyPoId] = useState<string | null>(null);

  const activeSuppliers = useMemo(() => suppliers.filter((s) => s.active), [suppliers]);

  const lowStockItems = useMemo(
    () =>
      inventory
        .filter((it) => it.currentStock <= it.minStock)
        .sort((a, b) => a.currentStock - a.minStock - (b.currentStock - b.minStock)),
    [inventory]
  );

  // Abrir Pedido de Compra pré-preenchido quando vindo da tela de Estoque ("Comprar do Fornecedor")
  useEffect(() => {
    if (!preselectedReplenish || !canManageOrders) return;
    const item = inventory.find((it) => it.id === preselectedReplenish.itemId);
    if (item) {
      const matchedSup =
        suppliers.find((s) => s.id === (preselectedReplenish.supplierId || item.supplierId)) ||
        suppliers.find((s) => s.tradeName.toLowerCase() === item.supplier.toLowerCase()) ||
        activeSuppliers[0];

      const suggestedQty = Math.max(
        Math.ceil(item.minStock * 2 - item.currentStock),
        Math.ceil(item.minStock || 50)
      );
      openNewPoModal(matchedSup?.id, [
        {
          itemId: item.id,
          quantity: Math.max(1, suggestedQty),
          unitCost: item.costPrice || 0,
        },
      ]);
      setActiveTab('orders');
    }
    onClearPreselectedReplenish?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedReplenish]);

  // Carregar Dossiê 360°
  useEffect(() => {
    if (!detailSupplierId) {
      setSupplierDetail(null);
      return;
    }
    let cancelled = false;
    setIsLoadingDetail(true);
    api.getSupplierDetail(detailSupplierId).then((res) => {
      if (cancelled) return;
      setIsLoadingDetail(false);
      if (res.status === 200 && res.data) {
        setSupplierDetail(res.data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [detailSupplierId, suppliers, purchaseOrders, inventory]);

  // Filtros de Fornecedores
  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (!showInactive && !s.active) return false;
      if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        s.tradeName.toLowerCase().includes(q) ||
        s.companyName.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.cnpj || '').toLowerCase().includes(q) ||
        s.contactName.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q)
      );
    });
  }, [suppliers, searchQuery, categoryFilter, showInactive]);

  // Filtros de Pedidos de Compra
  const filteredPOs = useMemo(() => {
    const q = poSearch.trim().toLowerCase();
    return purchaseOrders.filter((po) => {
      if (poStatusFilter === 'open' && !['rascunho', 'enviado', 'confirmado', 'recebido_parcial'].includes(po.status)) {
        return false;
      }
      if (poStatusFilter === 'delayed' && !po.isDeliveryOverdue) return false;
      if (poStatusFilter === 'received' && po.status !== 'recebido_total') return false;
      if (poStatusFilter === 'cancelled' && po.status !== 'cancelado') return false;
      if (!q) return true;
      return (
        po.poNumber.toLowerCase().includes(q) ||
        po.supplierName.toLowerCase().includes(q) ||
        (po.invoiceNumber || '').toLowerCase().includes(q) ||
        (po.relatedOrderNumber || '').toLowerCase().includes(q) ||
        po.items.some((it) => it.itemName.toLowerCase().includes(q) || it.itemCode.toLowerCase().includes(q))
      );
    });
  }, [purchaseOrders, poStatusFilter, poSearch]);

  // KPIs
  const kpiActiveSuppliers = summary?.activeSuppliersCount ?? activeSuppliers.length;
  const kpiOpenPOs = summary?.openPurchaseOrdersCount ?? purchaseOrders.filter((po) => ['rascunho', 'enviado', 'confirmado', 'recebido_parcial'].includes(po.status)).length;
  const kpiOpenPOsValue = summary?.openPurchaseOrdersValue ?? purchaseOrders.filter((po) => ['rascunho', 'enviado', 'confirmado', 'recebido_parcial'].includes(po.status)).reduce((s, p) => s + p.totalAmount, 0);
  const kpiDelayedPOs = summary?.delayedPurchaseOrdersCount ?? purchaseOrders.filter((po) => po.isDeliveryOverdue).length;
  const kpiLowStock = summary?.lowStockItemsCount ?? lowStockItems.length;
  const kpiPaid = summary?.totalPaidToSuppliers ?? 0;
  const kpiPending = summary?.totalPendingToSuppliers ?? 0;
  const kpiOverdue = summary?.totalOverdueToSuppliers ?? 0;

  // =========================================================================
  // HANDLERS: FORNECEDOR
  // =========================================================================
  const openSupplierModal = (sup?: Supplier) => {
    setSupFormError('');
    if (sup) {
      setEditingSupplier(sup);
      setSupCompanyName(sup.companyName);
      setSupTradeName(sup.tradeName);
      setSupCnpj(sup.cnpj || '');
      setSupIE(sup.stateRegistration || '');
      setSupContactName(sup.contactName);
      setSupPhone(sup.phone);
      setSupEmail(sup.email || '');
      setSupAddressData(buildStructuredAddressFromEntity(sup));
      setSupCategory(sup.category);
      setSupPaymentTerms(sup.paymentTerms || '30 dias');
      setSupPaymentTermsDays(sup.paymentTermsDays ?? 30);
      setSupPaymentMethod(sup.defaultPaymentMethod || 'boleto');
      setSupPixKey(sup.pixKey || '');
      setSupBankDetails(sup.bankDetails || '');
      setSupLeadTimeDays(sup.leadTimeDays ?? 7);
      setSupMinOrderValue(sup.minOrderValue ?? 0);
      setSupRating(sup.rating ?? 5);
      setSupNotes(sup.notes || '');
      setSupActive(sup.active);
    } else {
      setEditingSupplier(null);
      setSupCompanyName('');
      setSupTradeName('');
      setSupCnpj('');
      setSupIE('');
      setSupContactName('');
      setSupPhone('');
      setSupEmail('');
      setSupAddressData(buildStructuredAddressFromEntity({ city: 'São Luís', state: 'MA' }));
      setSupCategory('tecidos_malhas');
      setSupPaymentTerms('30 dias no boleto');
      setSupPaymentTermsDays(30);
      setSupPaymentMethod('boleto');
      setSupPixKey('');
      setSupBankDetails('');
      setSupLeadTimeDays(7);
      setSupMinOrderValue(0);
      setSupRating(5);
      setSupNotes('');
      setSupActive(true);
    }
    setIsSupplierModalOpen(true);
  };

  const handleShareSupplierLocation = async (sup: Supplier) => {
    const structured = buildStructuredAddressFromEntity(sup);
    const catLabel = SUPPLIER_CATEGORY_META[sup.category]?.label || 'Fornecedor';
    if (isValidCoordinates(structured.latitude, structured.longitude)) {
      setLocationShareTarget(
        buildEntityLocationPayload({
          entityType: 'supplier',
          entityId: sup.id,
          locationCode: sup.code,
          title: sup.tradeName || sup.companyName,
          subtitle: `${catLabel} · Fornecedor Homologado`,
          contactName: sup.contactName,
          phone: sup.phone,
          cep: structured.cep,
          street: structured.street,
          number: structured.number,
          complement: structured.complement,
          neighborhood: structured.neighborhood,
          address: structured.address,
          city: structured.city,
          state: structured.state,
          latitude: structured.latitude!,
          longitude: structured.longitude!,
          geoPrecision: structured.geoPrecision,
          company: companyProfile,
        })
      );
      return;
    }

    setLocatingSupplierId(sup.id);
    const res = await api.geocodeAddress({
      cep: structured.cep,
      street: structured.street || structured.address,
      number: structured.number,
      neighborhood: structured.neighborhood,
      city: structured.city,
      state: structured.state,
    });
    setLocatingSupplierId(null);

    if (res.status === 200 && res.data && isValidCoordinates(res.data.latitude, res.data.longitude)) {
      const resolvedLat = res.data.latitude;
      const resolvedLng = res.data.longitude;
      const resolvedPrecision = res.data.precision;
      const resolvedSource = res.data.source;

      if (canManageSuppliers) {
        api.updateSupplier(sup.id, {
          cep: structured.cep || undefined,
          street: structured.street || undefined,
          number: structured.number || undefined,
          complement: structured.complement || undefined,
          neighborhood: structured.neighborhood || undefined,
          address: structured.address || undefined,
          city: structured.city,
          state: structured.state,
          latitude: resolvedLat,
          longitude: resolvedLng,
          geoPrecision: resolvedPrecision,
          geoSource: resolvedSource,
        });
      }

      setSupplierDetail((prev) =>
        prev && prev.supplier.id === sup.id
          ? {
              ...prev,
              supplier: {
                ...prev.supplier,
                latitude: resolvedLat,
                longitude: resolvedLng,
                geoPrecision: resolvedPrecision,
                geoSource: resolvedSource,
              },
            }
          : prev
      );

      setLocationShareTarget(
        buildEntityLocationPayload({
          entityType: 'supplier',
          entityId: sup.id,
          locationCode: sup.code,
          title: sup.tradeName || sup.companyName,
          subtitle: `${catLabel} · Fornecedor Homologado`,
          contactName: sup.contactName,
          phone: sup.phone,
          cep: structured.cep,
          street: structured.street,
          number: structured.number,
          complement: structured.complement,
          neighborhood: structured.neighborhood,
          address: structured.address,
          city: structured.city,
          state: structured.state,
          latitude: resolvedLat,
          longitude: resolvedLng,
          geoPrecision: resolvedPrecision,
          company: companyProfile,
        })
      );
      return;
    }

    setDetailSupplierId(null);
    openSupplierModal(sup);
    setSupFormError('Marque a localização exata do fornecedor no mapa antes de compartilhar a rota.');
  };

  const handleCnpjAutoFill = (data: CnpjAutoFillData) => {
    if (data.companyName) setSupCompanyName(data.companyName);
    if (data.tradeName) setSupTradeName(data.tradeName);
    if (data.phone) setSupPhone(data.phone);
    if (data.email) setSupEmail(data.email);
    setSupAddressData((prev) => applyCnpjAddressUpdate(prev, data));
    setSupAddressSyncKey((k) => k + 1);
  };

  const handleSubmitSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setSupFormError('');
    if (supCompanyName.trim().length < 2) {
      setSupFormError('Informe a Razão Social do fornecedor.');
      return;
    }
    if (supContactName.trim().length < 2) {
      setSupFormError('Informe o nome do representante ou contato comercial.');
      return;
    }
    if (supPhone.replace(/\D/g, '').length < 8) {
      setSupFormError('Informe um telefone / WhatsApp válido.');
      return;
    }

    const composedAddress =
      composeAddressLine({
        street: supAddressData.street,
        number: supAddressData.number,
        complement: supAddressData.complement,
        neighborhood: supAddressData.neighborhood,
      }) || supAddressData.address.trim();

    let resolvedLat = isValidCoordinates(supAddressData.latitude, supAddressData.longitude)
      ? supAddressData.latitude
      : undefined;
    let resolvedLng = isValidCoordinates(supAddressData.latitude, supAddressData.longitude)
      ? supAddressData.longitude
      : undefined;
    let resolvedPrecision = supAddressData.geoPrecision;
    let resolvedSource = supAddressData.geoSource;

    setIsSavingSupplier(true);
    if (
      !isValidCoordinates(resolvedLat, resolvedLng) &&
      (supAddressData.cep.replace(/\D/g, '').length === 8 ||
        supAddressData.street.trim() ||
        supAddressData.address.trim() ||
        supAddressData.city.trim())
    ) {
      const geoRes = await api.geocodeAddress({
        cep: supAddressData.cep,
        street: supAddressData.street || supAddressData.address,
        number: supAddressData.number,
        neighborhood: supAddressData.neighborhood,
        city: supAddressData.city,
        state: supAddressData.state,
      });
      if (
        geoRes.status === 200 &&
        geoRes.data &&
        isValidCoordinates(geoRes.data.latitude, geoRes.data.longitude)
      ) {
        resolvedLat = geoRes.data.latitude;
        resolvedLng = geoRes.data.longitude;
        resolvedPrecision = geoRes.data.precision;
        resolvedSource = geoRes.data.source;
      }
    }

    const ok = await onSaveSupplier(
      {
        companyName: supCompanyName.trim(),
        tradeName: supTradeName.trim() || supCompanyName.trim(),
        cnpj: supCnpj.trim() || undefined,
        stateRegistration: supIE.trim() || undefined,
        contactName: supContactName.trim(),
        phone: supPhone.trim(),
        email: supEmail.trim() || undefined,
        cep: supAddressData.cep.trim() || undefined,
        street: supAddressData.street.trim() || undefined,
        number: supAddressData.number.trim() || undefined,
        complement: supAddressData.complement.trim() || undefined,
        neighborhood: supAddressData.neighborhood.trim() || undefined,
        address: composedAddress || undefined,
        city: supAddressData.city.trim() || 'São Luís',
        state: supAddressData.state.trim().toUpperCase().slice(0, 2) || 'MA',
        latitude: resolvedLat,
        longitude: resolvedLng,
        geoPrecision: resolvedPrecision,
        geoSource: resolvedSource,
        category: supCategory,
        paymentTerms: supPaymentTerms.trim() || `${supPaymentTermsDays} dias`,
        paymentTermsDays: supPaymentTermsDays,
        defaultPaymentMethod: supPaymentMethod,
        pixKey: supPixKey.trim() || undefined,
        bankDetails: supBankDetails.trim() || undefined,
        leadTimeDays: supLeadTimeDays,
        minOrderValue: supMinOrderValue,
        rating: supRating,
        notes: supNotes.trim() || undefined,
        active: supActive,
      },
      editingSupplier?.id
    );
    setIsSavingSupplier(false);
    if (ok) {
      setIsSupplierModalOpen(false);
    }
  };

  // =========================================================================
  // HANDLERS: PEDIDO DE COMPRA
  // =========================================================================
  const applySupplierDefaultsToPo = (supId: string) => {
    setPoSupplierId(supId);
    const sup = suppliers.find((s) => s.id === supId);
    const todayISO = new Date().toISOString().split('T')[0];
    if (sup) {
      const expected = addDaysISO(todayISO, sup.leadTimeDays || 7);
      setPoExpectedDelivery(expected);
      setPoDueDate(addDaysISO(expected, sup.paymentTermsDays || 30));
      setPoPaymentTerms(sup.paymentTerms || `${sup.paymentTermsDays || 30} dias`);
      setPoPaymentMethod(sup.defaultPaymentMethod || 'boleto');
    } else {
      const expected = addDaysISO(todayISO, 7);
      setPoExpectedDelivery(expected);
      setPoDueDate(addDaysISO(expected, 30));
    }
  };

  const openNewPoModal = (defaultSupId?: string, initialLines?: DraftPoLine[]) => {
    setPoFormError('');
    const chosenSupId = defaultSupId || activeSuppliers[0]?.id || '';
    applySupplierDefaultsToPo(chosenSupId);
    setPoRelatedOrderId('');
    setPoFreightCost(0);
    setPoDiscountAmount(0);
    setPoInitialStatus('confirmado');
    setPoAutoPayable(true);
    setPoNotes('');

    if (initialLines && initialLines.length > 0) {
      setPoLines(initialLines);
    } else {
      const firstInv =
        inventory.find((it) => it.supplierId === chosenSupId) || inventory[0];
      setPoLines(
        firstInv
          ? [{ itemId: firstInv.id, quantity: Math.max(50, firstInv.minStock || 50), unitCost: firstInv.costPrice || 0 }]
          : []
      );
    }
    setIsPoModalOpen(true);
  };

  const poSubtotal = useMemo(
    () =>
      Math.round(
        poLines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0) * 100
      ) / 100,
    [poLines]
  );

  const poTotal = useMemo(
    () => Math.max(0, Math.round((poSubtotal + (Number(poFreightCost) || 0) - (Number(poDiscountAmount) || 0)) * 100) / 100),
    [poSubtotal, poFreightCost, poDiscountAmount]
  );

  const handleAddPoLine = () => {
    const unused = inventory.find((it) => !poLines.some((l) => l.itemId === it.id)) || inventory[0];
    if (!unused) return;
    setPoLines((prev) => [
      ...prev,
      { itemId: unused.id, quantity: Math.max(10, unused.minStock || 20), unitCost: unused.costPrice || 0 },
    ]);
  };

  const handleUpdatePoLine = (idx: number, patch: Partial<DraftPoLine>) => {
    setPoLines((prev) =>
      prev.map((line, i) => {
        if (i !== idx) return line;
        const next = { ...line, ...patch };
        if (patch.itemId && patch.itemId !== line.itemId) {
          const inv = inventory.find((it) => it.id === patch.itemId);
          if (inv && patch.unitCost === undefined) {
            next.unitCost = inv.costPrice || 0;
          }
        }
        return next;
      })
    );
  };

  const handleRemovePoLine = (idx: number) => {
    setPoLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitPo = async (e: React.FormEvent) => {
    e.preventDefault();
    setPoFormError('');
    if (!poSupplierId) {
      setPoFormError('Selecione um fornecedor ativo.');
      return;
    }
    if (poLines.length === 0) {
      setPoFormError('Adicione pelo menos um insumo do estoque.');
      return;
    }
    for (const l of poLines) {
      if (!l.itemId || l.quantity <= 0) {
        setPoFormError('Todos os insumos devem ter quantidade maior que zero.');
        return;
      }
    }

    setIsSavingPo(true);
    const ok = await onCreatePurchaseOrder({
      supplierId: poSupplierId,
      relatedOrderId: poRelatedOrderId || undefined,
      expectedDeliveryDate: poExpectedDelivery,
      dueDate: poDueDate,
      paymentTerms: poPaymentTerms,
      paymentMethod: poPaymentMethod,
      freightCost: poFreightCost,
      discountAmount: poDiscountAmount,
      initialStatus: poInitialStatus,
      autoGeneratePayable: poAutoPayable,
      notes: poNotes.trim() || undefined,
      items: poLines.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        unitCost: l.unitCost,
      })),
    });
    setIsSavingPo(false);
    if (ok) {
      setIsPoModalOpen(false);
      setActiveTab('orders');
    }
  };

  // =========================================================================
  // HANDLERS: RECEBIMENTO FÍSICO
  // =========================================================================
  const openReceiveModal = (po: PurchaseOrder) => {
    setReceiveError('');
    const initialQtyMap: Record<string, number> = {};
    po.items.forEach((it) => {
      const remaining = Math.max(0, Math.round((it.quantity - it.receivedQuantity) * 100) / 100);
      initialQtyMap[it.itemId] = remaining;
    });
    setReceiveQuantities(initialQtyMap);
    setReceiveInvoiceNumber(po.invoiceNumber || '');
    setReceiveUpdateCost(true);
    setReceiveGeneratePayable(!po.hasPayableCoverage);
    setReceiveNotes('');
    setReceivingPo(po);
  };

  const handleSubmitReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingPo) return;
    setReceiveError('');

    const itemsToReceive = receivingPo.items
      .map((it) => ({
        itemId: it.itemId,
        receiveQuantity: Number(receiveQuantities[it.itemId] || 0),
        remaining: Math.max(0, Math.round((it.quantity - it.receivedQuantity) * 100) / 100),
        itemName: it.itemName,
      }))
      .filter((x) => x.receiveQuantity > 0);

    if (itemsToReceive.length === 0) {
      setReceiveError('Informe ao menos uma quantidade maior que zero para dar entrada no estoque.');
      return;
    }

    for (const row of itemsToReceive) {
      if (row.receiveQuantity > row.remaining + 0.001) {
        setReceiveError(`Quantidade de '${row.itemName}' excede o saldo pendente (${row.remaining}).`);
        return;
      }
    }

    setIsSubmittingReceive(true);
    const ok = await onReceivePurchaseOrder(receivingPo.id, {
      invoiceNumber: receiveInvoiceNumber.trim() || undefined,
      updateUnitCost: receiveUpdateCost,
      generatePayableIfMissing: receiveGeneratePayable,
      notes: receiveNotes.trim() || undefined,
      items: itemsToReceive.map((x) => ({ itemId: x.itemId, receiveQuantity: x.receiveQuantity })),
    });
    setIsSubmittingReceive(false);
    if (ok) {
      setReceivingPo(null);
    }
  };

  const handleChangePoStatus = async (po: PurchaseOrder, nextStatus: PurchaseOrderStatus) => {
    setBusyPoId(po.id);
    await onUpdatePurchaseOrderStatus(po.id, nextStatus, nextStatus === 'confirmado');
    setBusyPoId(null);
  };

  const handleGeneratePayableClick = async (po: PurchaseOrder) => {
    setBusyPoId(po.id);
    await onGeneratePurchaseOrderPayable(po.id);
    setBusyPoId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <div className="text-xs font-medium text-slate-500 flex items-center gap-2">
            <span>DE FARDAS</span>
            <span aria-hidden="true" className="text-slate-300">/</span>
            <span>Suprimentos &amp; Compras</span>
            <span aria-hidden="true" className="text-slate-300">/</span>
            <span className="text-slate-800 font-semibold">Fornecedores de Matéria-Prima</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1 flex items-center gap-2.5">
            <Truck className="w-6 h-6 text-blue-600" />
            <span>Fornecedores &amp; Pedidos de Compra</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Fluxo integrado: <strong>Fornecedor</strong> &rarr; <strong>Pedido de Compra (PC)</strong> &rarr;{' '}
            <strong>Entrada no Estoque (Kardex + Custo Médio)</strong> &rarr; <strong>Contas a Pagar (Financeiro)</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => onNavigateTab('inventory')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          >
            <Boxes className="w-3.5 h-3.5 text-slate-500" />
            <span>Estoque</span>
          </button>
          {canViewFinance && (
            <button
              type="button"
              onClick={() => onNavigateTab('finance')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
            >
              <Wallet className="w-3.5 h-3.5 text-slate-500" />
              <span>Financeiro CP</span>
            </button>
          )}
          {canManageSuppliers && (
            <button
              type="button"
              onClick={() => openSupplierModal()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-blue-600" />
              <span>Novo Fornecedor</span>
            </button>
          )}
          {canManageOrders && (
            <button
              type="button"
              onClick={() => openNewPoModal()}
              disabled={activeSuppliers.length === 0 || inventory.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#C8102E] hover:bg-[#A60D26] disabled:opacity-50 rounded-lg shadow-sm transition-colors cursor-pointer whitespace-nowrap"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>+ Pedido de Compra</span>
            </button>
          )}
        </div>
      </div>

      {/* 5 Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div
          onClick={() => setActiveTab('suppliers')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs cursor-pointer hover:border-blue-300 transition-all"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Fornecedores Ativos</span>
            <Building2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
            {kpiActiveSuppliers}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {suppliers.length} cadastrados no total
          </div>
        </div>

        <div
          onClick={() => {
            setActiveTab('orders');
            setPoStatusFilter('open');
          }}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs cursor-pointer hover:border-indigo-300 transition-all"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Pedidos em Aberto</span>
            <ShoppingCart className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
            {kpiOpenPOs}
          </div>
          <div className="mt-1 text-[11px] text-indigo-700 font-mono font-semibold">
            {formatCurrencyBRL(kpiOpenPOsValue)} em compras
          </div>
        </div>

        <div
          onClick={() => {
            setActiveTab('orders');
            setPoStatusFilter('delayed');
          }}
          className={`p-4 rounded-xl border shadow-xs cursor-pointer transition-all ${
            kpiDelayedPOs > 0
              ? 'bg-rose-50/70 border-rose-200 hover:border-rose-300'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Entregas Atrasadas</span>
            <Clock className={`w-4 h-4 ${kpiDelayedPOs > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
          </div>
          <div className={`mt-2 text-2xl font-bold font-mono ${kpiDelayedPOs > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
            {kpiDelayedPOs}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {kpiDelayedPOs > 0 ? 'Cobrar fornecedor agora' : 'Entregas dentro do prazo'}
          </div>
        </div>

        <div
          onClick={() => setActiveTab('replenish')}
          className={`p-4 rounded-xl border shadow-xs cursor-pointer transition-all ${
            kpiLowStock > 0
              ? 'bg-amber-50/70 border-amber-200 hover:border-amber-300'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Ponto de Pedido</span>
            <AlertTriangle className={`w-4 h-4 ${kpiLowStock > 0 ? 'text-amber-600' : 'text-emerald-600'}`} />
          </div>
          <div className={`mt-2 text-2xl font-bold font-mono ${kpiLowStock > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
            {kpiLowStock}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {kpiLowStock > 0 ? 'Insumos p/ repor →' : 'Estoque abastecido'}
          </div>
        </div>

        <div
          onClick={() => setActiveTab('finance')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs cursor-pointer hover:border-emerald-300 transition-all"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>CP Fornecedores</span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-slate-900">
            {formatCurrencyBRL(kpiPending)}
          </div>
          <div className="mt-1 text-[11px] flex items-center justify-between font-mono">
            <span className="text-emerald-700">Pago: {formatCurrencyBRL(kpiPaid)}</span>
            {kpiOverdue > 0 && <span className="text-rose-700 font-bold">Venc!</span>}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/80 rounded-xl text-xs font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setActiveTab('suppliers')}
            className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'suppliers' ? 'bg-white text-slate-900 font-semibold shadow-xs' : 'hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Fornecedores ({suppliers.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'orders' ? 'bg-white text-slate-900 font-semibold shadow-xs' : 'hover:text-slate-900'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Pedidos de Compra ({purchaseOrders.length})</span>
            {kpiDelayedPOs > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-rose-100 text-rose-700 rounded">
                {kpiDelayedPOs} atras.
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('replenish')}
            className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'replenish' ? 'bg-white text-slate-900 font-semibold shadow-xs' : 'hover:text-slate-900'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reposição de Estoque</span>
            {lowStockItems.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-amber-100 text-amber-800 rounded">
                {lowStockItems.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('finance')}
            className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'finance' ? 'bg-white text-slate-900 font-semibold shadow-xs' : 'hover:text-slate-900'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Financeiro de Compras</span>
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* TAB 1: FORNECEDORES HOMOLOGADOS */}
      {/* =================================================================== */}
      {activeTab === 'suppliers' && (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nome fantasia, razão social, CNPJ, contato ou cidade..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as any)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:border-blue-500"
              >
                <option value="all">Todas as categorias</option>
                {(Object.keys(SUPPLIER_CATEGORY_META) as SupplierCategory[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {SUPPLIER_CATEGORY_META[cat].label}
                  </option>
                ))}
              </select>

              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none px-2">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>Mostrar inativos</span>
              </label>
            </div>
          </div>

          {filteredSuppliers.length === 0 ? (
            <div className="bg-white p-10 rounded-xl border border-slate-200 text-center space-y-2">
              <Truck className="w-9 h-9 text-slate-300 mx-auto" />
              <div className="text-sm font-semibold text-slate-700">Nenhum fornecedor encontrado</div>
              <p className="text-xs text-slate-500">
                Cadastre seus fornecedores de tecidos, malhas, aviamentos e embalagens para emitir Pedidos de Compra integrados.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredSuppliers.map((sup) => {
                const catMeta = SUPPLIER_CATEGORY_META[sup.category] || SUPPLIER_CATEGORY_META.outros;
                const m = sup.metrics;
                return (
                  <div
                    key={sup.id}
                    className={`bg-white rounded-xl border shadow-xs p-5 flex flex-col justify-between gap-4 transition-all ${
                      sup.active ? 'border-slate-200 hover:border-blue-300' : 'border-slate-200 opacity-70 bg-slate-50/50'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {sup.code}
                            </span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${catMeta.badgeClass}`}>
                              {catMeta.label}
                            </span>
                            {!sup.active && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-600">
                                Inativo
                              </span>
                            )}
                          </div>
                          <h3 className="text-base font-bold text-slate-900 mt-1.5 truncate">{sup.tradeName}</h3>
                          <p className="text-[11px] text-slate-500 truncate">
                            {sup.companyName} {sup.cnpj ? `· CNPJ ${sup.cnpj}` : ''}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-mono font-bold shrink-0">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                          <span>{Number(sup.rating || 5).toFixed(1)}</span>
                        </div>
                      </div>

                      {/* Contact & Commercial Terms */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-1.5 truncate">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">
                            <strong>{sup.contactName}</strong> · {sup.phone}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                          <MapPin
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isValidCoordinates(sup.latitude, sup.longitude)
                                ? 'text-emerald-600'
                                : 'text-slate-400'
                            }`}
                          />
                          <span className="truncate">
                            {sup.address ? `${sup.address} · ` : ''}
                            {sup.city} — {sup.state}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>
                            Prazo entrega: <strong>{sup.leadTimeDays} dias</strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                          <Wallet className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">
                            Pgto: <strong>{sup.paymentTerms}</strong> ({sup.defaultPaymentMethod.toUpperCase()})
                          </span>
                        </div>
                      </div>

                      {/* Real Cross-Module Metrics */}
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70">
                          <div className="text-[10px] text-slate-500">Insumos</div>
                          <div className="text-sm font-bold font-mono text-slate-900">
                            {m?.linkedItemsCount ?? 0}
                          </div>
                          {(m?.lowStockItemsCount ?? 0) > 0 && (
                            <div className="text-[9px] font-bold text-amber-700">{m?.lowStockItemsCount} crítico(s)</div>
                          )}
                        </div>
                        <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70">
                          <div className="text-[10px] text-slate-500">PCs Abertos</div>
                          <div className="text-sm font-bold font-mono text-indigo-700">
                            {m?.openPurchaseOrdersCount ?? 0}
                          </div>
                          {(m?.delayedPOsCount ?? 0) > 0 && (
                            <div className="text-[9px] font-bold text-rose-700">{m?.delayedPOsCount} atras.</div>
                          )}
                        </div>
                        <div className="p-2 rounded-lg bg-emerald-50/50 border border-emerald-200/70">
                          <div className="text-[10px] text-emerald-800">Já Pago</div>
                          <div className="text-xs font-bold font-mono text-emerald-900 mt-0.5">
                            {formatCurrencyBRL(m?.totalPaidAmount ?? 0)}
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-amber-50/50 border border-amber-200/70">
                          <div className="text-[10px] text-amber-900">A Pagar</div>
                          <div className="text-xs font-bold font-mono text-amber-950 mt-0.5">
                            {formatCurrencyBRL(m?.totalPendingAmount ?? 0)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setDetailSupplierId(sup.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Dossiê 360°</span>
                        </button>
                        {canManageOrders && sup.active && (
                          <button
                            type="button"
                            onClick={() => openNewPoModal(sup.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-[#C8102E] hover:bg-[#A60D26] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            <span>Comprar</span>
                          </button>
                        )}
                        {canUseWhatsApp && onOpenSupplierWhatsApp && (
                          <button
                            type="button"
                            onClick={() => onOpenSupplierWhatsApp(sup)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                            title="Abrir conversa na Central WhatsApp"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={locatingSupplierId === sup.id}
                          onClick={() => handleShareSupplierLocation(sup)}
                          title="Abrir mapa e enviar localização/rota do fornecedor via WhatsApp"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#C8102E] bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 rounded-lg transition-colors cursor-pointer disabled:opacity-60"
                        >
                          {locatingSupplierId === sup.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Navigation className="w-3.5 h-3.5" />
                          )}
                          <span>Mapa / Rota</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        {canManageSuppliers && (
                          <button
                            type="button"
                            onClick={() => openSupplierModal(sup)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Editar fornecedor"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDeleteSupplier && (
                          <button
                            type="button"
                            onClick={() => onDeleteSupplier(sup.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Excluir fornecedor"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: PEDIDOS DE COMPRA (PC-YYYY-XXXX) */}
      {/* =================================================================== */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={poSearch}
                onChange={(e) => setPoSearch(e.target.value)}
                placeholder="Buscar por PC-2026, fornecedor, NF-e, insumo ou OP vinculada..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'open', label: 'Em Aberto' },
                { id: 'delayed', label: 'Atrasados' },
                { id: 'received', label: 'Recebidos' },
                { id: 'cancelled', label: 'Cancelados' },
              ].map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setPoStatusFilter(btn.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    poStatusFilter === btn.id
                      ? 'bg-[#111113] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {filteredPOs.length === 0 ? (
            <div className="bg-white p-10 rounded-xl border border-slate-200 text-center space-y-2">
              <ShoppingCart className="w-9 h-9 text-slate-300 mx-auto" />
              <div className="text-sm font-semibold text-slate-700">Nenhum Pedido de Compra neste filtro</div>
              <p className="text-xs text-slate-500">
                Emita um Pedido de Compra para abastecer o almoxarifado e gerar automaticamente a previsão no Financeiro.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {filteredPOs.map((po) => {
                const statusMeta = PO_STATUS_META[po.status] || PO_STATUS_META.rascunho;
                const supplierObj = suppliers.find((s) => s.id === po.supplierId);
                const isBusy = busyPoId === po.id;
                const canReceiveThisPo =
                  canReceiveOrders &&
                  ['enviado', 'confirmado', 'recebido_parcial'].includes(po.status);

                return (
                  <div
                    key={po.id}
                    className={`bg-white rounded-xl border shadow-xs p-5 space-y-4 ${
                      po.isDeliveryOverdue ? 'border-rose-300 bg-rose-50/15' : 'border-slate-200'
                    }`}
                  >
                    {/* PO Header */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-mono font-extrabold text-slate-900">
                            {po.poNumber}
                          </span>
                          <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${statusMeta.badgeClass}`}>
                            {statusMeta.label}
                          </span>
                          {po.relatedOrderNumber && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                              <Factory className="w-3 h-3" />
                              {po.relatedOrderNumber}
                            </span>
                          )}
                          {po.invoiceNumber && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <FileText className="w-3 h-3" />
                              NF {po.invoiceNumber}
                            </span>
                          )}
                          {po.isDeliveryOverdue && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                              Entrega atrasada há {Math.abs(po.daysToExpectedDelivery || 0)}d
                            </span>
                          )}
                          {po.isDeliveryDueSoon && !po.isDeliveryOverdue && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                              {po.daysToExpectedDelivery === 0
                                ? 'Entrega prevista HOJE'
                                : `Chega em ${po.daysToExpectedDelivery}d`}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-600 flex items-center gap-3 flex-wrap">
                          <span>
                            Fornecedor: <strong className="text-slate-900">{po.supplierName}</strong>
                          </span>
                          <span>Pedido em: {formatDateBR(po.orderDate)}</span>
                          <span>
                            Entrega prevista: <strong className="font-mono">{formatDateBR(po.expectedDeliveryDate)}</strong>
                          </span>
                          <span>
                            Vencimento CP: <strong className="font-mono">{formatDateBR(po.dueDate)}</strong> ({po.paymentMethod.toUpperCase()})
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                            Total do Pedido
                          </div>
                          <div className="text-lg font-extrabold font-mono text-slate-900">
                            {formatCurrencyBRL(po.totalAmount)}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            {po.hasPayableCoverage ? (
                              <span className="text-emerald-700 font-semibold">
                                CP Vinculado · Pago {formatCurrencyBRL(po.paidAmount || 0)}
                              </span>
                            ) : po.status !== 'cancelado' ? (
                              <span className="text-amber-700 font-semibold">Sem provisão CP ainda</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Items & Receiving Progress */}
                    <div className="bg-slate-50 rounded-lg border border-slate-200/80 overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-100/70">
                            <th className="py-2 px-3">Insumo (Estoque)</th>
                            <th className="py-2 px-3 text-right">Pedido</th>
                            <th className="py-2 px-3 text-right">Recebido</th>
                            <th className="py-2 px-3 text-right">Custo Unit.</th>
                            <th className="py-2 px-3 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/60">
                          {po.items.map((it) => {
                            const pct = it.quantity > 0 ? Math.min(100, Math.round((it.receivedQuantity / it.quantity) * 100)) : 0;
                            return (
                              <tr key={it.id}>
                                <td className="py-2 px-3">
                                  <span className="font-mono text-[10px] text-slate-500 mr-1.5">{it.itemCode}</span>
                                  <span className="font-semibold text-slate-800">{it.itemName}</span>
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-semibold text-slate-700">
                                  {it.quantity} {it.unit}
                                </td>
                                <td className="py-2 px-3 text-right font-mono">
                                  <span className={pct >= 100 ? 'text-emerald-700 font-bold' : 'text-slate-700'}>
                                    {it.receivedQuantity} {it.unit} ({pct}%)
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-slate-700">
                                  {formatCurrencyBRL(it.unitCost)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                                  {formatCurrencyBRL(it.subtotal)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {(po.freightCost > 0 || po.discountAmount > 0 || po.notes) && (
                        <div className="px-3 py-2 bg-white border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500 flex-wrap gap-2">
                          <span>{po.notes || 'Sem observações adicionais.'}</span>
                          <div className="font-mono flex items-center gap-3">
                            {po.freightCost > 0 && <span>Frete: +{formatCurrencyBRL(po.freightCost)}</span>}
                            {po.discountAmount > 0 && <span className="text-emerald-700">Desconto: -{formatCurrencyBRL(po.discountAmount)}</span>}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Workflow Action Bar */}
                    <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {canManageOrders && po.status === 'rascunho' && (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleChangePoStatus(po, 'enviado')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Marcar como Enviado</span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleChangePoStatus(po, 'confirmado')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Confirmar &amp; Provisionar CP</span>
                            </button>
                          </>
                        )}

                        {canManageOrders && po.status === 'enviado' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleChangePoStatus(po, 'confirmado')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Confirmar Pedido &amp; Provisionar CP</span>
                          </button>
                        )}

                        {canReceiveThisPo && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => openReceiveModal(po)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <PackageCheck className="w-4 h-4" />
                            <span>
                              {po.status === 'recebido_parcial'
                                ? 'Receber Saldo Restante no Estoque'
                                : 'Receber no Almoxarifado (Kardex)'}
                            </span>
                          </button>
                        )}

                        {canManageOrders && !po.hasPayableCoverage && po.status !== 'cancelado' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleGeneratePayableClick(po)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            <span>Gerar CP no Financeiro</span>
                          </button>
                        )}

                        {po.status === 'recebido_total' && (
                          <button
                            type="button"
                            onClick={() => onNavigateTab('inventory')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                          >
                            <Boxes className="w-3.5 h-3.5" />
                            <span>Ver Entrada no Estoque &rarr;</span>
                          </button>
                        )}

                        {canViewFinance && (po.linkedPayablesCount || 0) > 0 && (
                          <button
                            type="button"
                            onClick={() => onNavigateTab('finance')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            <span>Ver CP no Financeiro</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {supplierObj && (
                          <button
                            type="button"
                            disabled={locatingSupplierId === supplierObj.id}
                            onClick={() => handleShareSupplierLocation(supplierObj)}
                            title="Abrir mapa e compartilhar localização de coleta/fornecedor via WhatsApp"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#C8102E] bg-white hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors cursor-pointer disabled:opacity-60"
                          >
                            {locatingSupplierId === supplierObj.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Navigation className="w-3.5 h-3.5" />
                            )}
                            <span>Mapa / Rota</span>
                          </button>
                        )}
                        {canUseWhatsApp && onOpenSupplierWhatsApp && supplierObj && (
                          <button
                            type="button"
                            onClick={() => onOpenSupplierWhatsApp(supplierObj, po)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Enviar via WhatsApp</span>
                          </button>
                        )}

                        {canManageOrders && ['rascunho', 'enviado', 'confirmado'].includes(po.status) && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleChangePoStatus(po, 'cancelado')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Cancelar</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: REPOSIÇÃO INTELIGENTE DE ESTOQUE */}
      {/* =================================================================== */}
      {activeTab === 'replenish' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Fila de Reposição Automática (Integração Estoque &rarr; Compras)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Insumos abaixo ou no limite do estoque mínimo, prontos para emissão de Pedido de Compra em 1 clique.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('inventory')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              Ir para Estoque &amp; Tecidos &rarr;
            </button>
          </div>

          {lowStockItems.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <div className="text-sm font-bold text-slate-800">Nenhum insumo abaixo do ponto de pedido!</div>
              <p className="text-xs text-slate-500">
                Todos os tecidos e aviamentos cadastrados estão com saldo físico acima do estoque mínimo.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50">
                    <th className="py-3 px-4">Insumo</th>
                    <th className="py-3 px-4">Fornecedor Vinculado</th>
                    <th className="py-3 px-4 text-right">Saldo Atual</th>
                    <th className="py-3 px-4 text-right">Mínimo</th>
                    <th className="py-3 px-4 text-right">Sugestão de Compra</th>
                    <th className="py-3 px-4 text-right">Custo Estimado</th>
                    <th className="py-3 px-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lowStockItems.map((item) => {
                    const suggestedQty = Math.max(
                      Math.ceil(item.minStock * 2 - item.currentStock),
                      Math.ceil(item.minStock || 50)
                    );
                    const matchedSup =
                      suppliers.find((s) => s.id === item.supplierId) ||
                      suppliers.find((s) => s.tradeName.toLowerCase() === item.supplier.toLowerCase());
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{item.name}</div>
                          <div className="text-[11px] font-mono text-slate-500">{item.code}</div>
                        </td>
                        <td className="py-3 px-4">
                          {matchedSup ? (
                            <div>
                              <span className="font-semibold text-slate-800">{matchedSup.tradeName}</span>
                              <div className="text-[10px] text-slate-500">
                                Entrega: {matchedSup.leadTimeDays}d · {matchedSup.paymentTerms}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-500">{item.supplier || 'Sem vínculo'}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-rose-700">
                          {item.currentStock} {item.unit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">
                          {item.minStock} {item.unit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-blue-700">
                          +{suggestedQty} {item.unit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800">
                          {formatCurrencyBRL(suggestedQty * (item.costPrice || 0))}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {canManageOrders && (
                            <button
                              type="button"
                              onClick={() =>
                                openNewPoModal(matchedSup?.id || activeSuppliers[0]?.id, [
                                  { itemId: item.id, quantity: suggestedQty, unitCost: item.costPrice || 0 },
                                ])
                              }
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#C8102E] hover:bg-[#A60D26] text-white font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <ShoppingCart className="w-3.5 h-3.5" />
                              <span>Gerar Pedido</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4: FINANCEIRO DE COMPRAS (PAGO x A PAGAR x VENCIDO POR FORNECEDOR) */}
      {/* =================================================================== */}
      {activeTab === 'finance' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Posição Financeira por Fornecedor (Contas a Pagar)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Acompanhamento de valores comprados, já quitados com comprovante, em aberto e vencidos.
              </p>
            </div>
            {canViewFinance && (
              <button
                type="button"
                onClick={() => onNavigateTab('finance')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#111113] hover:bg-[#1E1E22] transition-colors text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap"
              >
                <span>Quitar Títulos no Financeiro</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50">
                  <th className="py-3 px-4">Fornecedor</th>
                  <th className="py-3 px-4">Condições &amp; PIX</th>
                  <th className="py-3 px-4 text-right">Total Comprado</th>
                  <th className="py-3 px-4 text-right">Já Pago</th>
                  <th className="py-3 px-4 text-right">Em Aberto (CP)</th>
                  <th className="py-3 px-4 text-right">Vencido</th>
                  <th className="py-3 px-4 text-right">Dossiê</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suppliers.map((sup) => {
                  const m = sup.metrics;
                  return (
                    <tr key={sup.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{sup.tradeName}</div>
                        <div className="text-[10px] font-mono text-slate-500">{sup.code} · {sup.cnpj || 'S/ CNPJ'}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-700 font-medium">{sup.paymentTerms}</div>
                        {sup.pixKey && (
                          <div className="text-[10px] font-mono text-slate-500 flex items-center gap-1 mt-0.5">
                            <KeyRound className="w-3 h-3" />
                            <span>PIX: {sup.pixKey}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrencyBRL(m?.totalPurchasedAmount ?? 0)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700">
                        {formatCurrencyBRL(m?.totalPaidAmount ?? 0)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-amber-800">
                        {formatCurrencyBRL(m?.totalPendingAmount ?? 0)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-rose-700">
                        {formatCurrencyBRL(m?.totalOverdueAmount ?? 0)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setDetailSupplierId(sup.id)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg cursor-pointer"
                        >
                          Extrato 360°
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 1: CADASTRAR / EDITAR FORNECEDOR */}
      {/* =================================================================== */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-[55] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-[#111113] text-white flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-base font-bold">
                  {editingSupplier ? `Editar Fornecedor · ${editingSupplier.code}` : 'Cadastrar Novo Fornecedor'}
                </h2>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Cadastro completo com consulta automática de CNPJ/CEP e condições comerciais de compra
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSupplierModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitSupplier} className="p-6 overflow-y-auto space-y-5 text-xs">
              {supFormError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-medium">
                  {supFormError}
                </div>
              )}

              {/* Identificação */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">CNPJ / CPF (Busca Automática)</label>
                  <CnpjLookupInput
                    value={supCnpj}
                    onChange={setSupCnpj}
                    onCnpjFound={handleCnpjAutoFill}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Categoria de Fornecimento *</label>
                  <select
                    value={supCategory}
                    onChange={(e) => setSupCategory(e.target.value as SupplierCategory)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800"
                  >
                    {(Object.keys(SUPPLIER_CATEGORY_META) as SupplierCategory[]).map((cat) => (
                      <option key={cat} value={cat}>
                        {SUPPLIER_CATEGORY_META[cat].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Razão Social *</label>
                  <input
                    type="text"
                    required
                    value={supCompanyName}
                    onChange={(e) => setSupCompanyName(e.target.value)}
                    placeholder="Ex: CIA. DE TECIDOS SANTANENSE S/A"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nome Fantasia *</label>
                  <input
                    type="text"
                    required
                    value={supTradeName}
                    onChange={(e) => setSupTradeName(e.target.value)}
                    placeholder="Ex: Malharia Santanense"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Inscrição Estadual</label>
                  <input
                    type="text"
                    value={supIE}
                    onChange={(e) => setSupIE(e.target.value)}
                    placeholder="Opcional / Isento"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Representante / Contato *</label>
                  <input
                    type="text"
                    required
                    value={supContactName}
                    onChange={(e) => setSupContactName(e.target.value)}
                    placeholder="Nome do vendedor ou representante"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Telefone / WhatsApp *</label>
                  <PhoneInputBR value={supPhone} onChange={setSupPhone} required />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">E-mail de Pedidos</label>
                  <input
                    type="email"
                    value={supEmail}
                    onChange={(e) => setSupEmail(e.target.value)}
                    placeholder="pedidos@fornecedor.com.br"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Endereço Estruturado & Mapa (CEP + Número) */}
              <div className="pt-3 border-t border-slate-200">
                <StructuredAddressFieldset
                  title="Endereço do Fornecedor & Pino no Mapa (CEP + Número)"
                  entityLabel={supTradeName || supCompanyName || 'Fornecedor'}
                  value={supAddressData}
                  onChange={setSupAddressData}
                  externalSyncKey={supAddressSyncKey}
                  onShareLocationClick={(resolved) => {
                    const addr = resolved || supAddressData;
                    if (!isValidCoordinates(addr.latitude, addr.longitude)) return;
                    const catLabel = SUPPLIER_CATEGORY_META[supCategory]?.label || 'Fornecedor';
                    setLocationShareTarget(
                      buildEntityLocationPayload({
                        entityType: 'supplier',
                        entityId: editingSupplier?.id,
                        locationCode: editingSupplier?.code || 'FORNECEDOR',
                        title: supTradeName.trim() || supCompanyName.trim() || 'Fornecedor',
                        subtitle: `${catLabel} · Fornecedor Homologado`,
                        contactName: supContactName.trim() || undefined,
                        phone: supPhone.trim() || undefined,
                        cep: addr.cep,
                        street: addr.street,
                        number: addr.number,
                        complement: addr.complement,
                        neighborhood: addr.neighborhood,
                        address: addr.address,
                        city: addr.city,
                        state: addr.state,
                        latitude: addr.latitude!,
                        longitude: addr.longitude!,
                        geoPrecision: addr.geoPrecision,
                        company: companyProfile,
                      })
                    );
                  }}
                />
              </div>

              {/* Condições Comerciais & Financeiro */}
              <div className="pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Condição de Pagamento</label>
                  <input
                    type="text"
                    value={supPaymentTerms}
                    onChange={(e) => setSupPaymentTerms(e.target.value)}
                    placeholder="Ex: 28/56 dias no boleto"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Prazo Padrão CP (dias)</label>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={supPaymentTermsDays}
                    onChange={(e) => setSupPaymentTermsDays(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Forma de Pgto Padrão</label>
                  <select
                    value={supPaymentMethod}
                    onChange={(e) => setSupPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="boleto">Boleto Bancário</option>
                    <option value="pix">PIX</option>
                    <option value="transferencia">Transferência / TED</option>
                    <option value="cartao">Cartão Corporativo</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Lead Time de Entrega (dias)</label>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={supLeadTimeDays}
                    onChange={(e) => setSupLeadTimeDays(Number(e.target.value) || 7)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Pedido Mínimo (R$)</label>
                  <CurrencyInput value={supMinOrderValue} onChange={setSupMinOrderValue} />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Avaliação (1 a 5)</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    step={0.1}
                    value={supRating}
                    onChange={(e) => setSupRating(Number(e.target.value) || 5)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Chave PIX</label>
                  <input
                    type="text"
                    value={supPixKey}
                    onChange={(e) => setSupPixKey(e.target.value)}
                    placeholder="CNPJ, e-mail ou chave aleatória"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Dados Bancários</label>
                  <input
                    type="text"
                    value={supBankDetails}
                    onChange={(e) => setSupBankDetails(e.target.value)}
                    placeholder="Banco, agência e conta corrente"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observações Comerciais / Catálogo</label>
                <textarea
                  rows={2}
                  value={supNotes}
                  onChange={(e) => setSupNotes(e.target.value)}
                  placeholder="Principais tecidos, largura de rolos, política de frete CIF/FOB..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              {editingSupplier && (
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={supActive}
                    onChange={(e) => setSupActive(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span>Fornecedor ativo para emissão de novos Pedidos de Compra</span>
                </label>
              )}

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingSupplier}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#C8102E] hover:bg-[#A60D26] transition-colors disabled:opacity-50 rounded-lg shadow-xs cursor-pointer whitespace-nowrap"
                >
                  {isSavingSupplier ? 'Salvando...' : editingSupplier ? 'Salvar Alterações' : 'Cadastrar Fornecedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: NOVO PEDIDO DE COMPRA (PC-YYYY-XXXX) */}
      {/* =================================================================== */}
      {isPoModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-[#111113] text-white flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-[#E3263E]" />
                  <span>Emitir Novo Pedido de Compra (PC)</span>
                </h2>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Conectado ao Estoque &amp; Tecidos, Ordens de Produção e previsão de Contas a Pagar no Financeiro
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPoModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitPo} className="p-6 overflow-y-auto space-y-5 text-xs">
              {poFormError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-medium">
                  {poFormError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fornecedor *</label>
                  <select
                    required
                    value={poSupplierId}
                    onChange={(e) => applySupplierDefaultsToPo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-medium"
                  >
                    <option value="">Selecione um fornecedor ativo...</option>
                    {activeSuppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.tradeName} ({SUPPLIER_CATEGORY_META[s.category]?.shortLabel} · {s.leadTimeDays}d entrega)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Vincular a uma OP (Opcional)</label>
                  <select
                    value={poRelatedOrderId}
                    onChange={(e) => setPoRelatedOrderId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800"
                  >
                    <option value="">Reposição geral de almoxarifado</option>
                    {orders
                      .filter((o) => o.stage !== 'entregue')
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.orderNumber} — {o.clientName} ({o.totalPieces} pçs)
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Entrega Prevista *</label>
                  <DateInputBR value={poExpectedDelivery} onChange={setPoExpectedDelivery} required />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Vencimento Contas a Pagar *</label>
                  <DateInputBR value={poDueDate} onChange={setPoDueDate} required />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Condição de Pagamento</label>
                  <input
                    type="text"
                    value={poPaymentTerms}
                    onChange={(e) => setPoPaymentTerms(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Forma de Pagamento</label>
                  <select
                    value={poPaymentMethod}
                    onChange={(e) => setPoPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="boleto">Boleto Bancário</option>
                    <option value="pix">PIX</option>
                    <option value="transferencia">Transferência</option>
                    <option value="cartao">Cartão</option>
                  </select>
                </div>
              </div>

              {/* Itens do Pedido */}
              <div className="space-y-2.5 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900">Insumos do Estoque a Comprar</h3>
                  <button
                    type="button"
                    onClick={handleAddPoLine}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Insumo</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {poLines.map((line, idx) => {
                    const invObj = inventory.find((it) => it.id === line.itemId);
                    const lineSub = (Number(line.quantity) || 0) * (Number(line.unitCost) || 0);
                    return (
                      <div
                        key={idx}
                        className="grid grid-cols-12 gap-2 items-center p-2.5 bg-slate-50 rounded-lg border border-slate-200"
                      >
                        <div className="col-span-12 sm:col-span-5">
                          <select
                            value={line.itemId}
                            onChange={(e) => handleUpdatePoLine(idx, { itemId: e.target.value })}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs"
                          >
                            {inventory.map((it) => (
                              <option key={it.id} value={it.id}>
                                {it.code} · {it.name} (Saldo: {it.currentStock} {it.unit})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <input
                            type="number"
                            min={0.01}
                            step="any"
                            value={line.quantity}
                            onChange={(e) => handleUpdatePoLine(idx, { quantity: Number(e.target.value) || 0 })}
                            className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white font-mono text-right"
                            placeholder="Qtd"
                          />
                          <div className="text-[10px] text-slate-400 text-right mt-0.5">{invObj?.unit || 'un'}</div>
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <CurrencyInput
                            value={line.unitCost}
                            onChange={(v) => handleUpdatePoLine(idx, { unitCost: v })}
                          />
                          <div className="text-[10px] text-slate-400 text-right mt-0.5">Custo unit.</div>
                        </div>
                        <div className="col-span-3 sm:col-span-2 text-right font-mono font-bold text-slate-900">
                          {formatCurrencyBRL(lineSub)}
                        </div>
                        <div className="col-span-1 text-right">
                          {poLines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemovePoLine(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Frete, Desconto, Status Inicial e Resumo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2 border-t border-slate-200">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Frete (R$)</label>
                  <CurrencyInput value={poFreightCost} onChange={setPoFreightCost} />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Desconto Negociado (R$)</label>
                  <CurrencyInput value={poDiscountAmount} onChange={setPoDiscountAmount} />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status Inicial do Pedido</label>
                  <select
                    value={poInitialStatus}
                    onChange={(e) => setPoInitialStatus(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="rascunho">Rascunho (aguardando revisão)</option>
                    <option value="enviado">Enviado ao Fornecedor</option>
                    <option value="confirmado">Confirmado (Em Trânsito)</option>
                  </select>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-blue-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={poAutoPayable || poInitialStatus === 'confirmado'}
                    disabled={poInitialStatus === 'confirmado'}
                    onChange={(e) => setPoAutoPayable(e.target.checked)}
                    className="rounded border-blue-300 text-blue-600"
                  />
                  <span>
                    Provisionar automaticamente em <strong>Contas a Pagar (Financeiro)</strong> com vencimento em{' '}
                    {formatDateBR(poDueDate)}
                  </span>
                </label>

                <div className="text-right shrink-0">
                  <div className="text-[10px] text-blue-700 font-semibold uppercase">Total do Pedido</div>
                  <div className="text-xl font-extrabold font-mono text-blue-950">{formatCurrencyBRL(poTotal)}</div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observações do Pedido</label>
                <textarea
                  rows={2}
                  value={poNotes}
                  onChange={(e) => setPoNotes(e.target.value)}
                  placeholder="Instruções de entrega, lote/cor específica, frete CIF/FOB..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPoModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingPo}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#C8102E] hover:bg-[#A60D26] transition-colors disabled:opacity-50 rounded-lg shadow-xs cursor-pointer whitespace-nowrap"
                >
                  {isSavingPo ? 'Emitindo...' : 'Emitir Pedido de Compra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 3: RECEBIMENTO FÍSICO NO ALMOXARIFADO (KARDEX + CUSTO + CP) */}
      {/* =================================================================== */}
      {receivingPo && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-emerald-900 text-white flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <PackageCheck className="w-5 h-5 text-emerald-300" />
                  <span>Recebimento Físico · {receivingPo.poNumber}</span>
                </h2>
                <p className="text-[11px] text-emerald-100 mt-0.5">
                  Fornecedor: {receivingPo.supplierName} — Gera entrada auditável no Kardex e sincroniza Contas a Pagar
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceivingPo(null)}
                className="p-1.5 text-emerald-200 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitReceive} className="p-6 overflow-y-auto space-y-4 text-xs">
              {receiveError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-medium">
                  {receiveError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Número da Nota Fiscal (NF-e / Recibo)</label>
                <input
                  type="text"
                  value={receiveInvoiceNumber}
                  onChange={(e) => setReceiveInvoiceNumber(e.target.value)}
                  placeholder="Ex: NF-e 0048192"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-900">Conferência de Quantidades Recebidas</div>
                {receivingPo.items.map((it) => {
                  const remaining = Math.max(0, Math.round((it.quantity - it.receivedQuantity) * 100) / 100);
                  return (
                    <div
                      key={it.id}
                      className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">
                          {it.itemCode} · {it.itemName}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          Pedido: {it.quantity} {it.unit} · Já recebido: {it.receivedQuantity} {it.unit} ·{' '}
                          <strong className="text-emerald-700">Pendente: {remaining} {it.unit}</strong>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-slate-600 font-medium">Receber agora:</label>
                        <input
                          type="number"
                          min={0}
                          max={remaining}
                          step="any"
                          disabled={remaining <= 0}
                          value={receiveQuantities[it.itemId] ?? 0}
                          onChange={(e) =>
                            setReceiveQuantities((prev) => ({
                              ...prev,
                              [it.itemId]: Number(e.target.value) || 0,
                            }))
                          }
                          className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-mono text-right font-bold"
                        />
                        <span className="text-[11px] font-mono text-slate-500">{it.unit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                <label className="flex items-center gap-2 text-emerald-950 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={receiveUpdateCost}
                    onChange={(e) => setReceiveUpdateCost(e.target.checked)}
                    className="rounded border-emerald-400 text-emerald-600"
                  />
                  <span>Recalcular Custo Médio Ponderado (CMP) dos insumos recebidos no Estoque</span>
                </label>
                <label className="flex items-center gap-2 text-emerald-950 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={receiveGeneratePayable}
                    onChange={(e) => setReceiveGeneratePayable(e.target.checked)}
                    className="rounded border-emerald-400 text-emerald-600"
                  />
                  <span>
                    {receivingPo.hasPayableCoverage
                      ? 'Efetivar provisão existente no Financeiro com a NF-e recebida'
                      : 'Gerar automaticamente Contas a Pagar no Financeiro (caso ainda não exista)'}
                  </span>
                </label>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observações da Conferência Física</label>
                <input
                  type="text"
                  value={receiveNotes}
                  onChange={(e) => setReceiveNotes(e.target.value)}
                  placeholder="Ex: Rolos conferidos sem avarias, armazenados na prateleira A1"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReceivingPo(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReceive}
                  className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg shadow-xs cursor-pointer"
                >
                  {isSubmittingReceive ? 'Registrando Entrada...' : 'Confirmar Recebimento no Estoque'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 4: DOSSIÊ 360° DO FORNECEDOR */}
      {/* =================================================================== */}
      {detailSupplierId && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-[#111113] text-white flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-base font-bold">
                  Dossiê 360° do Fornecedor{' '}
                  {supplierDetail?.supplier ? `· ${supplierDetail.supplier.tradeName}` : ''}
                </h2>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Visão integrada de Cadastro, Insumos no Estoque, Pedidos de Compra e Extrato Financeiro (CP)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailSupplierId(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {isLoadingDetail || !supplierDetail ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                  <span>Carregando dossiê completo do fornecedor...</span>
                </div>
              ) : (
                <>
                  {/* Resumo Financeiro & Cadastral */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                      <div className="font-bold text-slate-900 text-sm">{supplierDetail.supplier.companyName}</div>
                      <div className="text-slate-600">
                        <strong>CNPJ:</strong> {supplierDetail.supplier.cnpj || 'Não informado'} ·{' '}
                        <strong>IE:</strong> {supplierDetail.supplier.stateRegistration || '—'}
                      </div>
                      <div className="text-slate-600 flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          {supplierDetail.supplier.contactName} ({supplierDetail.supplier.phone})
                        </span>
                        {supplierDetail.supplier.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            {supplierDetail.supplier.email}
                          </span>
                        )}
                      </div>
                      <div className="text-slate-600">
                        <strong>PIX:</strong> {supplierDetail.supplier.pixKey || '—'} ·{' '}
                        <strong>Banco:</strong> {supplierDetail.supplier.bankDetails || '—'}
                      </div>
                      <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-slate-600">
                        <span>
                          <strong>Endereço:</strong>{' '}
                          {supplierDetail.supplier.address || `${supplierDetail.supplier.city}/${supplierDetail.supplier.state}`}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {canManageSuppliers && (
                            <button
                              type="button"
                              onClick={() => {
                                const supObj = supplierDetail.supplier;
                                setDetailSupplierId(null);
                                openSupplierModal(supObj);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-semibold text-[11px] cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Editar</span>
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={locatingSupplierId === supplierDetail.supplier.id}
                            onClick={() => handleShareSupplierLocation(supplierDetail.supplier)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-rose-50 text-[#C8102E] border border-rose-200 rounded-lg font-semibold text-[11px] cursor-pointer disabled:opacity-60"
                          >
                            {locatingSupplierId === supplierDetail.supplier.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Navigation className="w-3 h-3" />
                            )}
                            <span>Mapa / Rota</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200">
                        <div className="text-[10px] font-semibold text-blue-800 uppercase">Total Comprado</div>
                        <div className="text-lg font-extrabold font-mono text-blue-950 mt-1">
                          {formatCurrencyBRL(supplierDetail.metrics.totalPurchasedAmount)}
                        </div>
                        <div className="text-[10px] text-blue-700">
                          {supplierDetail.metrics.totalPurchaseOrders} pedido(s) emitidos
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
                        <div className="text-[10px] font-semibold text-emerald-800 uppercase">Já Pago</div>
                        <div className="text-lg font-extrabold font-mono text-emerald-950 mt-1">
                          {formatCurrencyBRL(supplierDetail.metrics.totalPaidAmount)}
                        </div>
                        <div className="text-[10px] text-emerald-700">Quitados no Financeiro</div>
                      </div>
                      <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200">
                        <div className="text-[10px] font-semibold text-amber-800 uppercase">Em Aberto (CP)</div>
                        <div className="text-lg font-extrabold font-mono text-amber-950 mt-1">
                          {formatCurrencyBRL(supplierDetail.metrics.totalPendingAmount)}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200">
                        <div className="text-[10px] font-semibold text-rose-800 uppercase">Vencido</div>
                        <div className="text-lg font-extrabold font-mono text-rose-950 mt-1">
                          {formatCurrencyBRL(supplierDetail.metrics.totalOverdueAmount)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Insumos Fornecidos */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-900">
                        Insumos Vinculados no Estoque ({supplierDetail.linkedItems.length})
                      </h3>
                    </div>
                    {supplierDetail.linkedItems.length === 0 ? (
                      <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-slate-500">
                        Nenhum insumo vinculado ainda. Ao receber um Pedido de Compra ou editar um item no Estoque, o vínculo é criado automaticamente.
                      </div>
                    ) : (
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                            <tr>
                              <th className="py-2 px-3">Código / Insumo</th>
                              <th className="py-2 px-3 text-right">Saldo Físico</th>
                              <th className="py-2 px-3 text-right">Mínimo</th>
                              <th className="py-2 px-3 text-right">Custo Médio</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {supplierDetail.linkedItems.map((it) => (
                              <tr key={it.id}>
                                <td className="py-2 px-3 font-semibold text-slate-800">
                                  <span className="font-mono text-[10px] text-slate-500 mr-1.5">{it.code}</span>
                                  {it.name}
                                </td>
                                <td
                                  className={`py-2 px-3 text-right font-mono font-bold ${
                                    it.physicalStock <= it.minStock ? 'text-rose-700' : 'text-slate-800'
                                  }`}
                                >
                                  {it.physicalStock} {it.unit}
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-slate-500">
                                  {it.minStock} {it.unit}
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-semibold text-slate-800">
                                  {formatCurrencyBRL(it.unitCostPrice)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Histórico de Pedidos de Compra */}
                  <div className="space-y-2">
                    <h3 className="font-bold text-slate-900">
                      Pedidos de Compra ({supplierDetail.purchaseOrders.length})
                    </h3>
                    {supplierDetail.purchaseOrders.length === 0 ? (
                      <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-slate-500">
                        Nenhum pedido de compra registrado para este fornecedor.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {supplierDetail.purchaseOrders.map((po) => {
                          const meta = PO_STATUS_META[po.status] || PO_STATUS_META.rascunho;
                          return (
                            <div
                              key={po.id}
                              className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 flex-wrap"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-slate-900">{po.poNumber}</span>
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.badgeClass}`}>
                                    {meta.label}
                                  </span>
                                  {po.invoiceNumber && (
                                    <span className="text-[10px] font-mono text-emerald-700">NF {po.invoiceNumber}</span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  Pedido {formatDateBR(po.orderDate)} · Entrega prevista {formatDateBR(po.expectedDeliveryDate)} ·{' '}
                                  {po.items.length} item(ns)
                                </div>
                              </div>
                              <div className="font-mono font-bold text-slate-900">
                                {formatCurrencyBRL(po.totalAmount)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Contas a Pagar (quando usuário tem finance:view) */}
                  {canViewFinance && (
                    <div className="space-y-2">
                      <h3 className="font-bold text-slate-900">
                        Lançamentos de Contas a Pagar ({supplierDetail.payables.length})
                      </h3>
                      {supplierDetail.payables.length === 0 ? (
                        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-slate-500">
                          Nenhum título de Contas a Pagar vinculado a este fornecedor.
                        </div>
                      ) : (
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                              <tr>
                                <th className="py-2 px-3">Título / Descrição</th>
                                <th className="py-2 px-3">Vencimento</th>
                                <th className="py-2 px-3">Status</th>
                                <th className="py-2 px-3 text-right">Valor</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {supplierDetail.payables.map((trx) => (
                                <tr key={trx.id}>
                                  <td className="py-2 px-3">
                                    <div className="font-semibold text-slate-800">{trx.description}</div>
                                    <div className="text-[10px] font-mono text-slate-500">
                                      {trx.transactionNumber} {trx.purchaseOrderNumber ? `· ${trx.purchaseOrderNumber}` : ''}
                                      {trx.isProvision ? ' · Provisão' : ''}
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 font-mono text-slate-700">{formatDateBR(trx.dueDate)}</td>
                                  <td className="py-2 px-3">
                                    <span
                                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                        trx.status === 'pago'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : trx.status === 'atrasado'
                                          ? 'bg-rose-100 text-rose-800'
                                          : trx.status === 'estornado'
                                          ? 'bg-slate-200 text-slate-600'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {trx.status}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                                    {formatCurrencyBRL(trx.amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {locationShareTarget && (
        <WhatsAppLocationShareModal
          location={locationShareTarget}
          onSendViaCentralWhatsApp={onSendViaCentralWhatsApp}
          onClose={() => setLocationShareTarget(null)}
        />
      )}
    </div>
  );
};
