import React, { useMemo, useState } from 'react';
import {
  Handshake,
  Plus,
  Search,
  Scissors,
  Sparkles,
  Layers,
  CheckCircle2,
  Package,
  Phone,
  Mail,
  MapPin,
  Clock,
  Star,
  Pencil,
  Trash2,
  X,
  ArrowUpRight,
  ArrowDownLeft,
  Factory,
  Wallet,
  MessageSquare,
  ShieldAlert,
  KeyRound,
  AlertTriangle,
  Eye,
  Loader2,
} from 'lucide-react';
import {
  Partner,
  PartnerCustody,
  PartnerDetailResponse,
  PartnerServiceCategory,
  InventoryItem,
  ProductionOrder,
  FinancialTransaction,
} from '../types/erp';
import { formatCurrencyBRL, formatDateBR, getStageLabel } from '../utils/formatters';
import {
  CnpjLookupInput,
  CepLookupInput,
  PhoneInputBR,
  CurrencyInput,
  DateInputBR,
  CnpjAutoFillData,
  CepAutoFillData,
} from './FormInputs';
import { useAuth } from '../api/authContext';
import { api } from '../api/client';

interface PartnersViewProps {
  partners: Partner[];
  custodyList: PartnerCustody[];
  inventory: InventoryItem[];
  orders: ProductionOrder[];
  onSavePartner: (payload: Partial<Partner>, existingId?: string) => Promise<boolean>;
  onDeletePartner: (partnerId: string) => void;
  onDispatchCustody: (
    partnerId: string,
    payload: {
      itemId: string;
      productionOrderId?: string;
      sentQuantity: number;
      notes?: string;
    }
  ) => Promise<boolean>;
  onReturnCustody: (
    custodyId: string,
    payload: {
      returnedQuantity: number;
      lostQuantity: number;
      returnToPhysicalStock: boolean;
      notes?: string;
    }
  ) => Promise<boolean>;
  onCreateServicePayable: (trx: FinancialTransaction) => Promise<void>;
  onOpenWhatsApp: (partner: Partner) => Promise<void>;
  onNavigateTab: (tab: string) => void;
}

export const PARTNER_CATEGORY_META: Record<
  PartnerServiceCategory,
  {
    label: string;
    shortLabel: string;
    description: string;
    badgeClass: string;
  }
> = {
  costura: {
    label: 'Facção de Costura',
    shortLabel: 'Costura',
    description: 'Montagem, fechamento, overloque, galoneira e travete em escala.',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  bordado: {
    label: 'Bordado Computadorizado',
    shortLabel: 'Bordado',
    description: 'Aplicação de brasões, logomarcas e nomes em matrizes computadorizadas.',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  silk_screen: {
    label: 'Silk-Screen & Estamparia',
    shortLabel: 'Silk-Screen',
    description: 'Serigrafia 1 cor, policromia, sublimação e aplicação de faixas refletivas.',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  acabamento: {
    label: 'Acabamento & Revisão',
    shortLabel: 'Acabamento',
    description: 'Caseado, prega de botões, limpeza de fios, passadoria e embalagem final.',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  corte_externo: {
    label: 'Corte Externo & Enfesto',
    shortLabel: 'Corte Externo',
    description: 'Risco CAD, enfesto automatizado e corte de lotes de alta tiragem.',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
  },
};

const CUSTODY_STATUS_META: Record<
  PartnerCustody['status'],
  { label: string; badgeClass: string }
> = {
  em_custodia: {
    label: 'Em Custódia',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  devolvido_parcial: {
    label: 'Baixa Parcial',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  devolvido_total: {
    label: 'Baixado Total',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  avaria_registrada: {
    label: 'Baixado c/ Perda',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

export const PartnersView: React.FC<PartnersViewProps> = ({
  partners,
  custodyList,
  inventory,
  orders,
  onSavePartner,
  onDeletePartner,
  onDispatchCustody,
  onReturnCustody,
  onCreateServicePayable,
  onOpenWhatsApp,
  onNavigateTab,
}) => {
  const { user } = useAuth();
  const role = user?.role || '';

  const canManage = ['admin', 'gerente_comercial', 'pcp_producao'].includes(role);
  const canManageCustody = ['admin', 'pcp_producao', 'expedicao_qualidade'].includes(role);
  const canDelete = role === 'admin';
  const canCreatePayable = ['admin', 'financeiro'].includes(role);
  const canWhatsApp = ['admin', 'gerente_comercial', 'vendedor', 'financeiro'].includes(role);

  const [activeSection, setActiveSection] = useState<'partners' | 'custody'>('partners');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | PartnerServiceCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [custodyFilter, setCustodyFilter] = useState<'open' | 'all'>('open');

  // Create / Edit Partner Modal
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [cnpjCpf, setCnpjCpf] = useState('');
  const [partnerType, setPartnerType] = useState<PartnerServiceCategory>('costura');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [cep, setCep] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('São Luís');
  const [stateUf, setStateUf] = useState('MA');
  const [capacityPiecesPerMonth, setCapacityPiecesPerMonth] = useState('1000');
  const [defaultCostPerPiece, setDefaultCostPerPiece] = useState<number>(12.0);
  const [leadTimeDays, setLeadTimeDays] = useState<number>(5);
  const [pixKey, setPixKey] = useState('');
  const [rating, setRating] = useState<number>(5);
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState<boolean>(true);

  // 360° Partner Detail Modal
  const [detailData, setDetailData] = useState<PartnerDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<'orders' | 'custody' | 'finance'>('orders');

  // Custody Dispatch Modal
  const [dispatchPartner, setDispatchPartner] = useState<Partner | null>(null);
  const [dispatchItemId, setDispatchItemId] = useState('');
  const [dispatchOrderId, setDispatchOrderId] = useState('');
  const [dispatchQty, setDispatchQty] = useState<string>('');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [dispatchSubmitting, setDispatchSubmitting] = useState(false);
  const [dispatchError, setDispatchError] = useState('');

  // Custody Return / Settlement Modal
  const [returnTarget, setReturnTarget] = useState<PartnerCustody | null>(null);
  const [returnMode, setReturnMode] = useState<'consumed' | 'stock_return'>('consumed');
  const [returnQty, setReturnQty] = useState<string>('');
  const [lossQty, setLossQty] = useState<string>('0');
  const [returnNotes, setReturnNotes] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnError, setReturnError] = useState('');

  // Quick Service Payable Modal
  const [payablePartner, setPayablePartner] = useState<Partner | null>(null);
  const [payableOrderId, setPayableOrderId] = useState('');
  const [payableDescription, setPayableDescription] = useState('');
  const [payableAmount, setPayableAmount] = useState<number>(0);
  const [payableDueDate, setPayableDueDate] = useState(
    new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0]
  );
  const [payableMethod, setPayableMethod] = useState<'pix' | 'transferencia' | 'boleto'>('pix');
  const [payableSubmitting, setPayableSubmitting] = useState(false);

  // KPIs
  const kpis = useMemo(() => {
    const activePartners = partners.filter((p) => p.active);
    const totalCapacity = activePartners.reduce(
      (sum, p) => sum + (parseInt(p.capacityPiecesPerMonth || '0', 10) || 0),
      0
    );
    const activeOutsourcedOrders = partners.reduce(
      (sum, p) => sum + (p.metrics?.activeOrdersCount || 0),
      0
    );
    const totalPiecesAssigned = partners.reduce(
      (sum, p) => sum + (p.metrics?.totalPiecesAssigned || 0),
      0
    );
    const openCustodies = custodyList.filter(
      (c) => c.status === 'em_custodia' || c.status === 'devolvido_parcial'
    );
    const totalOpenCustodyQty = openCustodies.reduce((sum, c) => sum + (c.pendingQuantity || 0), 0);
    const pendingPayables = partners.reduce(
      (sum, p) => sum + (p.metrics?.pendingPayablesAmount || 0),
      0
    );
    const paidServices = partners.reduce((sum, p) => sum + (p.metrics?.paidServicesAmount || 0), 0);

    return {
      activeCount: activePartners.length,
      totalCount: partners.length,
      totalCapacity,
      activeOutsourcedOrders,
      totalPiecesAssigned,
      openCustodyCount: openCustodies.length,
      totalOpenCustodyQty: Math.round(totalOpenCustodyQty * 100) / 100,
      pendingPayables,
      paidServices,
    };
  }, [partners, custodyList]);

  const filteredPartners = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return partners.filter((p) => {
      if (categoryFilter !== 'all' && p.partnerType !== categoryFilter) return false;
      if (statusFilter === 'active' && !p.active) return false;
      if (statusFilter === 'inactive' && p.active) return false;
      if (!q) return true;
      return (
        p.tradeName.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.cnpjCpf || '').toLowerCase().includes(q) ||
        (p.city || '').toLowerCase().includes(q) ||
        (p.notes || '').toLowerCase().includes(q)
      );
    });
  }, [partners, searchTerm, categoryFilter, statusFilter]);

  const filteredCustody = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return custodyList.filter((c) => {
      if (custodyFilter === 'open' && c.status !== 'em_custodia' && c.status !== 'devolvido_parcial') {
        return false;
      }
      if (!q) return true;
      return (
        (c.partnerName || '').toLowerCase().includes(q) ||
        (c.itemName || '').toLowerCase().includes(q) ||
        (c.orderNumber || '').toLowerCase().includes(q) ||
        (c.notes || '').toLowerCase().includes(q)
      );
    });
  }, [custodyList, custodyFilter, searchTerm]);

  const openCreateModal = () => {
    setEditingPartner(null);
    setName('');
    setTradeName('');
    setCnpjCpf('');
    setPartnerType('costura');
    setPhone('');
    setEmail('');
    setCep('');
    setAddress('');
    setCity('São Luís');
    setStateUf('MA');
    setCapacityPiecesPerMonth('1000');
    setDefaultCostPerPiece(12.0);
    setLeadTimeDays(5);
    setPixKey('');
    setRating(5);
    setNotes('');
    setActive(true);
    setFormError('');
    setIsFormOpen(true);
  };

  const openEditModal = (partner: Partner) => {
    setEditingPartner(partner);
    setName(partner.name);
    setTradeName(partner.tradeName);
    setCnpjCpf(partner.cnpjCpf || '');
    setPartnerType(partner.partnerType);
    setPhone(partner.phone);
    setEmail(partner.email || '');
    setCep(partner.cep || '');
    setAddress(partner.address || '');
    setCity(partner.city || 'São Luís');
    setStateUf(partner.state || 'MA');
    setCapacityPiecesPerMonth(partner.capacityPiecesPerMonth || '');
    setDefaultCostPerPiece(partner.defaultCostPerPiece || 0);
    setLeadTimeDays(partner.leadTimeDays || 5);
    setPixKey(partner.pixKey || '');
    setRating(partner.rating ?? 5);
    setNotes(partner.notes || '');
    setActive(partner.active);
    setFormError('');
    setIsFormOpen(true);
  };

  const handleCnpjFound = (data: CnpjAutoFillData) => {
    if (data.companyName) setName(data.companyName);
    if (data.tradeName || data.companyName) setTradeName(data.tradeName || data.companyName);
    if (data.phone) setPhone(data.phone);
    if (data.email) setEmail(data.email);
    if (data.cep) setCep(data.cep);
    if (data.addressLine) setAddress(data.addressLine);
    if (data.city) setCity(data.city);
    if (data.state) setStateUf(data.state);
    if (!pixKey && data.cnpj) setPixKey(data.cnpj);
  };

  const handleCepFound = (data: CepAutoFillData) => {
    const line = [data.street, data.neighborhood].filter(Boolean).join(', ');
    if (line) setAddress(line);
    if (data.city) setCity(data.city);
    if (data.state) setStateUf(data.state);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!name.trim()) {
      setFormError('Informe a Razão Social ou Nome completo do parceiro.');
      return;
    }
    if (phone.replace(/\D/g, '').length < 10) {
      setFormError('Informe um telefone/WhatsApp válido com DDD.');
      return;
    }

    setFormSaving(true);
    const ok = await onSavePartner(
      {
        name: name.trim(),
        tradeName: (tradeName.trim() || name.trim()),
        cnpjCpf: cnpjCpf.trim() || undefined,
        partnerType,
        phone: phone.trim(),
        email: email.trim() || undefined,
        cep: cep.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || 'São Luís',
        state: stateUf.trim().toUpperCase() || 'MA',
        capacityPiecesPerMonth: capacityPiecesPerMonth.replace(/\D/g, '') || undefined,
        defaultCostPerPiece,
        leadTimeDays,
        pixKey: pixKey.trim() || undefined,
        rating,
        notes: notes.trim() || undefined,
        active,
      },
      editingPartner?.id
    );
    setFormSaving(false);

    if (ok) {
      setIsFormOpen(false);
      if (detailData && editingPartner && detailData.partner.id === editingPartner.id) {
        loadPartnerDetail(editingPartner.id);
      }
    }
  };

  const loadPartnerDetail = async (partnerId: string) => {
    setDetailLoading(true);
    setDetailTab('orders');
    const res = await api.getPartnerDetail(partnerId);
    setDetailLoading(false);
    if (res.status === 200 && res.data) {
      setDetailData(res.data);
    }
  };

  const openDispatchModal = (partner: Partner) => {
    const firstWithStock = inventory.find((i) => i.currentStock > 0) || inventory[0];
    setDispatchPartner(partner);
    setDispatchItemId(firstWithStock?.id || '');
    setDispatchOrderId('');
    setDispatchQty('');
    setDispatchNotes('');
    setDispatchError('');
  };

  const handleDispatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchPartner) return;
    setDispatchError('');

    const qty = Number(dispatchQty.replace(',', '.'));
    const selectedItem = inventory.find((i) => i.id === dispatchItemId);
    if (!selectedItem) {
      setDispatchError('Selecione um insumo do almoxarifado.');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setDispatchError('Informe uma quantidade maior que zero.');
      return;
    }
    if (qty > selectedItem.currentStock) {
      setDispatchError(
        `Saldo físico insuficiente: disponível ${selectedItem.currentStock} ${selectedItem.unit}.`
      );
      return;
    }

    setDispatchSubmitting(true);
    const ok = await onDispatchCustody(dispatchPartner.id, {
      itemId: selectedItem.id,
      productionOrderId: dispatchOrderId || undefined,
      sentQuantity: qty,
      notes: dispatchNotes.trim() || undefined,
    });
    setDispatchSubmitting(false);

    if (ok) {
      const targetId = dispatchPartner.id;
      setDispatchPartner(null);
      if (detailData?.partner.id === targetId) {
        loadPartnerDetail(targetId);
      }
    }
  };

  const openReturnModal = (custody: PartnerCustody) => {
    setReturnTarget(custody);
    setReturnMode('consumed');
    setReturnQty(String(custody.pendingQuantity));
    setLossQty('0');
    setReturnNotes('');
    setReturnError('');
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnTarget) return;
    setReturnError('');

    const ret = Math.max(0, Number(returnQty.replace(',', '.')) || 0);
    const loss = Math.max(0, Number(lossQty.replace(',', '.')) || 0);

    if (ret + loss <= 0) {
      setReturnError('Informe uma quantidade baixada ou perda técnica maior que zero.');
      return;
    }
    if (Math.round((ret + loss) * 100) > Math.round(returnTarget.pendingQuantity * 100)) {
      setReturnError(
        `Total (${ret + loss} ${returnTarget.unit}) excede o saldo pendente (${returnTarget.pendingQuantity} ${returnTarget.unit}).`
      );
      return;
    }

    setReturnSubmitting(true);
    const ok = await onReturnCustody(returnTarget.id, {
      returnedQuantity: ret,
      lostQuantity: loss,
      returnToPhysicalStock: returnMode === 'stock_return',
      notes: returnNotes.trim() || undefined,
    });
    setReturnSubmitting(false);

    if (ok) {
      const pId = returnTarget.partnerId;
      setReturnTarget(null);
      if (detailData?.partner.id === pId) {
        loadPartnerDetail(pId);
      }
    }
  };

  const openPayableModal = (partner: Partner, preselectedOrder?: ProductionOrder) => {
    setPayablePartner(partner);
    setPayableOrderId(preselectedOrder?.id || '');
    const estAmount = preselectedOrder
      ? Math.round(
          preselectedOrder.totalPieces *
            (preselectedOrder.partnerCostPerPiece || partner.defaultCostPerPiece || 0) *
            100
        ) / 100
      : 0;
    setPayableAmount(estAmount);
    setPayableDescription(
      `Serviço ${PARTNER_CATEGORY_META[partner.partnerType].shortLabel} — ${partner.tradeName}${
        preselectedOrder ? ` (${preselectedOrder.orderNumber || preselectedOrder.id})` : ''
      }`
    );
    setPayableDueDate(new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0]);
    setPayableMethod(partner.pixKey ? 'pix' : 'transferencia');
  };

  const handlePayableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payablePartner || payableAmount <= 0) return;

    const linkedOrder = orders.find((o) => o.id === payableOrderId);
    setPayableSubmitting(true);
    await onCreateServicePayable({
      id: `fin-partner-${Date.now()}`,
      type: 'pagar',
      subType: 'servico_terceirizado',
      description: payableDescription.trim(),
      category: `Terceirização · ${PARTNER_CATEGORY_META[payablePartner.partnerType].shortLabel}`,
      amount: payableAmount,
      dueDate: payableDueDate,
      status: 'pendente',
      paymentMethod: payableMethod,
      productionOrderId: linkedOrder?.id,
      referenceId: linkedOrder?.orderNumber || payablePartner.code,
    });
    setPayableSubmitting(false);

    const pId = payablePartner.id;
    setPayablePartner(null);
    if (detailData?.partner.id === pId) {
      loadPartnerDetail(pId);
    }
  };

  const activeOrdersForSelect = useMemo(
    () => orders.filter((o) => o.stage !== 'entregue'),
    [orders]
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Parceiros &amp; Terceirizados (Facções)
            </h1>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
              PRD 5.8
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Rede homologada de costura, bordado, silk-screen, acabamento e corte externo com custódia rastreada e integração direta ao PCP, Estoque e Financeiro.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex bg-slate-200/70 p-1 rounded-lg text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveSection('partners')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                activeSection === 'partners'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rede de Parceiros ({partners.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('custody')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSection === 'custody'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Custódia de Materiais</span>
              {kpis.openCustodyCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-indigo-600 text-white">
                  {kpis.openCustodyCount}
                </span>
              )}
            </button>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Parceiro</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Parceiros Homologados</span>
            <Handshake className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {kpis.activeCount}
            </span>
            <span className="text-xs text-slate-400">ativos de {kpis.totalCount}</span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500">
            Capacidade somada:{' '}
            <strong className="text-slate-700 font-mono">
              {kpis.totalCapacity.toLocaleString('pt-BR')} pçs/mês
            </strong>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>OPs em Terceirização (PCP)</span>
            <Factory className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {kpis.activeOutsourcedOrders}
            </span>
            <span className="text-xs text-slate-400">ordens ativas</span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500">
            Volume alocado:{' '}
            <strong className="text-emerald-700 font-mono">
              {kpis.totalPiecesAssigned.toLocaleString('pt-BR')} peças
            </strong>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Custódia de Terceiros</span>
            <Package className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {kpis.openCustodyCount}
            </span>
            <span className="text-xs text-slate-400">remessas em aberto</span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500">
            Saldo pendente rastreado:{' '}
            <strong className="text-indigo-700 font-mono">{kpis.totalOpenCustodyQty} unid.</strong>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Serviços Terceirizados</span>
            <Wallet className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {formatCurrencyBRL(kpis.pendingPayables)}
            </span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500">
            A pagar · Já quitado:{' '}
            <strong className="text-emerald-700 font-mono">
              {formatCurrencyBRL(kpis.paidServices)}
            </strong>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              activeSection === 'partners'
                ? 'Buscar por nome, código FAC, CNPJ, cidade ou especialidade...'
                : 'Buscar remessa por parceiro, tecido ou número da OP...'
            }
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        {activeSection === 'partners' ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                  categoryFilter === 'all'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Todas ({partners.length})
              </button>
              {(Object.keys(PARTNER_CATEGORY_META) as PartnerServiceCategory[]).map((cat) => {
                const count = partners.filter((p) => p.partnerType === cat).length;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                      categoryFilter === cat
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {PARTNER_CATEGORY_META[cat].shortLabel} ({count})
                  </button>
                );
              })}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="px-2.5 py-1.5 text-[11px] font-semibold border border-slate-300 rounded-lg bg-white text-slate-700"
            >
              <option value="active">Somente Ativos</option>
              <option value="inactive">Inativos</option>
              <option value="all">Todos</option>
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCustodyFilter('open')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                custodyFilter === 'open'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Em Custódia / Parciais
            </button>
            <button
              type="button"
              onClick={() => setCustodyFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                custodyFilter === 'all'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Histórico Completo ({custodyList.length})
            </button>
          </div>
        )}
      </div>

      {/* SECTION 1: PARTNERS GRID */}
      {activeSection === 'partners' && (
        <>
          {filteredPartners.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
              <Handshake className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">
                Nenhum parceiro encontrado com os filtros atuais.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Cadastre facções de costura, bordado, silk-screen, acabamento ou corte externo para vincular às OPs.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredPartners.map((partner) => {
                const catMeta = PARTNER_CATEGORY_META[partner.partnerType] || PARTNER_CATEGORY_META.costura;
                const metrics = partner.metrics;
                return (
                  <div
                    key={partner.id}
                    className={`bg-white rounded-xl border shadow-2xs overflow-hidden transition-all hover:shadow-md ${
                      partner.active ? 'border-slate-200' : 'border-slate-200 opacity-75'
                    }`}
                  >
                    <div className="p-4 space-y-3">
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              {partner.code}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded border ${catMeta.badgeClass}`}
                            >
                              {catMeta.label}
                            </span>
                            {!partner.active && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                                Inativo
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-bold text-slate-900 mt-1.5 truncate">
                            {partner.tradeName}
                          </h3>
                          <p className="text-[11px] text-slate-500 truncate">
                            {partner.name}
                            {partner.cnpjCpf ? ` · ${partner.cnpjCpf}` : ''}
                          </p>
                        </div>

                        {/* Rating Badge */}
                        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 shrink-0">
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                          <span className="text-xs font-mono font-bold text-amber-900">
                            {Number(partner.rating || 0).toFixed(1)}
                          </span>
                        </div>
                      </div>

                      {/* Contact & Commercial Parameters */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-[11px]">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Custo Padrão</span>
                          <strong className="font-mono text-slate-900">
                            {formatCurrencyBRL(partner.defaultCostPerPiece)}/pç
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Prazo Médio</span>
                          <strong className="font-mono text-slate-900">
                            {partner.leadTimeDays} dias
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Capacidade/Mês</span>
                          <strong className="font-mono text-slate-900">
                            {partner.capacityPiecesPerMonth
                              ? `${Number(partner.capacityPiecesPerMonth).toLocaleString('pt-BR')} pçs`
                              : 'Sob demanda'}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Chave PIX</span>
                          <strong className="font-mono text-slate-700 truncate block" title={partner.pixKey || 'Não informada'}>
                            {partner.pixKey || '—'}
                          </strong>
                        </div>
                      </div>

                      {/* Contact Info Line */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {partner.phone}
                        </span>
                        {partner.email && (
                          <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                            <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{partner.email}</span>
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          {partner.city}/{partner.state}
                        </span>
                      </div>

                      {/* Cross-Module Integration Counters */}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-[11px]">
                        <div className="p-2 rounded-lg bg-blue-50/50 border border-blue-100">
                          <span className="text-[10px] text-blue-700 font-semibold block">PCP · OPs</span>
                          <span className="font-mono font-bold text-slate-900">
                            {metrics?.activeOrdersCount || 0} ativas
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {(metrics?.totalPiecesAssigned || 0).toLocaleString('pt-BR')} pçs
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-indigo-50/50 border border-indigo-100">
                          <span className="text-[10px] text-indigo-700 font-semibold block">Estoque · Custódia</span>
                          <span className="font-mono font-bold text-slate-900">
                            {metrics?.openCustodyCount || 0} remessas
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {metrics?.openCustodyQty || 0} unid. em posse
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-emerald-50/50 border border-emerald-100">
                          <span className="text-[10px] text-emerald-700 font-semibold block">Financeiro</span>
                          <span className="font-mono font-bold text-slate-900">
                            {formatCurrencyBRL(metrics?.pendingPayablesAmount || 0)}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            a pagar · pago {formatCurrencyBRL(metrics?.paidServicesAmount || 0)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => loadPartnerDetail(partner.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg transition-colors cursor-pointer text-[11px]"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Visão 360°</span>
                        </button>

                        {canManageCustody && partner.active && (
                          <button
                            type="button"
                            onClick={() => openDispatchModal(partner)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold rounded-lg transition-colors cursor-pointer text-[11px]"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            <span>Remessa</span>
                          </button>
                        )}

                        {canCreatePayable && (
                          <button
                            type="button"
                            onClick={() => openPayableModal(partner)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold rounded-lg transition-colors cursor-pointer text-[11px]"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            <span>Pagar Serviço</span>
                          </button>
                        )}

                        {canWhatsApp && (
                          <button
                            type="button"
                            onClick={() => onOpenWhatsApp(partner)}
                            title="Abrir conversa na Central WhatsApp"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-slate-200 hover:border-emerald-300 font-semibold rounded-lg transition-colors cursor-pointer text-[11px]"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">WhatsApp</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => openEditModal(partner)}
                            title="Editar cadastro do parceiro"
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => onDeletePartner(partner.id)}
                            title="Excluir parceiro (bloqueado se houver custódia ou OP ativa)"
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
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
        </>
      )}

      {/* SECTION 2: CUSTODY LEDGER TABLE */}
      {activeSection === 'custody' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Rastreabilidade de Materiais em Poder de Terceiros (estoque.partner_custody)
              </h2>
              <p className="text-[11px] text-slate-500">
                Cada remessa transfere automaticamente o saldo de Estoque Físico para Em Poder de Terceiros com evento compensatório auditável.
              </p>
            </div>
          </div>

          {filteredCustody.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              Nenhuma remessa sob custódia encontrada para o filtro selecionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                    <th className="px-4 py-2.5">Data</th>
                    <th className="px-4 py-2.5">Parceiro</th>
                    <th className="px-4 py-2.5">Material / Tecido</th>
                    <th className="px-4 py-2.5">OP Vinculada</th>
                    <th className="px-4 py-2.5 text-right">Remetido</th>
                    <th className="px-4 py-2.5 text-right">Baixado</th>
                    <th className="px-4 py-2.5 text-right">Perda</th>
                    <th className="px-4 py-2.5 text-right">Saldo em Posse</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCustody.map((c) => {
                    const st = CUSTODY_STATUS_META[c.status] || CUSTODY_STATUS_META.em_custodia;
                    const isOpen = c.pendingQuantity > 0;
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                          {formatDateBR(c.sentDate)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{c.partnerName}</div>
                          <div className="text-[10px] font-mono text-slate-400">{c.partnerCode}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{c.itemName}</div>
                          <div className="text-[10px] font-mono text-slate-400">{c.itemCode}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-blue-700 font-semibold whitespace-nowrap">
                          {c.orderNumber || 'Avulsa'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700 whitespace-nowrap">
                          {c.sentQuantity} {c.unit}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-700 whitespace-nowrap">
                          {c.returnedQuantity} {c.unit}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-rose-600 whitespace-nowrap">
                          {c.lostQuantity} {c.unit}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-indigo-700 whitespace-nowrap">
                          {c.pendingQuantity} {c.unit}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${st.badgeClass}`}
                          >
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {isOpen && canManageCustody ? (
                            <button
                              type="button"
                              onClick={() => openReturnModal(c)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold rounded-lg cursor-pointer"
                            >
                              <ArrowDownLeft className="w-3 h-3" />
                              <span>Dar Baixa</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-medium">Encerrada</span>
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

      {/* MODAL 1: CREATE / EDIT PARTNER */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <Handshake className="w-5 h-5 text-blue-400" />
                <h2 className="text-base font-bold">
                  {editingPartner
                    ? `Editar Parceiro [${editingPartner.code}]`
                    : 'Homologar Novo Parceiro / Terceirizado'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto text-xs">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* CNPJ + Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    CNPJ (busca automática Receita) ou CPF
                  </label>
                  <CnpjLookupInput
                    value={cnpjCpf}
                    onChange={setCnpjCpf}
                    onCnpjFound={handleCnpjFound}
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Categoria de Serviço *
                  </label>
                  <select
                    value={partnerType}
                    onChange={(e) => setPartnerType(e.target.value as PartnerServiceCategory)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {(Object.keys(PARTNER_CATEGORY_META) as PartnerServiceCategory[]).map((cat) => (
                      <option key={cat} value={cat}>
                        {PARTNER_CATEGORY_META[cat].label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {PARTNER_CATEGORY_META[partnerType].description}
                  </p>
                </div>
              </div>

              {/* Names */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Razão Social / Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Facção Têxtil Maranhense Ltda"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nome Fantasia / Apelido Operacional *
                  </label>
                  <input
                    type="text"
                    required
                    value={tradeName}
                    onChange={(e) => setTradeName(e.target.value)}
                    placeholder="Ex: Facção Têxtil Maranhense"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Contact + PIX */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    WhatsApp / Telefone *
                  </label>
                  <PhoneInputBR value={phone} onChange={setPhone} required />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contato@faccao.com.br"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Chave PIX (Pagamentos)
                  </label>
                  <input
                    type="text"
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    placeholder="CNPJ, celular ou e-mail PIX"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Operational Parameters */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Custo Padrão (R$/pç)
                  </label>
                  <CurrencyInput
                    value={defaultCostPerPiece}
                    onChange={setDefaultCostPerPiece}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Capacidade (pçs/mês)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={capacityPiecesPerMonth}
                    onChange={(e) => setCapacityPiecesPerMonth(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Prazo Médio (dias)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={leadTimeDays}
                    onChange={(e) => setLeadTimeDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Avaliação Qualidade (0–5)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="5"
                    value={rating}
                    onChange={(e) =>
                      setRating(Math.min(5, Math.max(0, parseFloat(e.target.value) || 0)))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900 bg-white"
                  />
                </div>
              </div>

              {/* Address with CEP Lookup */}
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">CEP</label>
                  <CepLookupInput value={cep} onChange={setCep} onCepFound={handleCepFound} />
                </div>
                <div className="sm:col-span-4">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Endereço / Oficina
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Rua, número e bairro"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="block font-semibold text-slate-700 mb-1">Cidade</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">UF</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={stateUf}
                    onChange={(e) => setStateUf(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Especialidades, Maquinário &amp; Observações Técnicas
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Especialista em brim pesado, 14 máquinas retas/overloque/travete..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-semibold text-slate-700">
                  Parceiro ativo e habilitado para receber OPs e remessas de material
                </span>
              </label>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold rounded-lg cursor-pointer inline-flex items-center gap-1.5"
                >
                  {formSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingPartner ? 'Salvar Alterações' : 'Cadastrar Parceiro'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: 360° PARTNER DETAIL */}
      {(detailLoading || detailData) && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200">
            {detailLoading && !detailData ? (
              <div className="p-12 text-center">
                <Loader2 className="w-7 h-7 text-blue-600 animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-500">Carregando visão 360° do parceiro...</p>
              </div>
            ) : (
              detailData && (
                <>
                  <div className="px-6 py-4 bg-slate-900 text-white flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          {detailData.partner.code}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                          {PARTNER_CATEGORY_META[detailData.partner.partnerType].label}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-300">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {Number(detailData.partner.rating || 0).toFixed(1)}
                        </span>
                      </div>
                      <h2 className="text-base font-bold mt-1">{detailData.partner.tradeName}</h2>
                      <p className="text-[11px] text-slate-400">
                        {detailData.partner.name} · {detailData.partner.phone}
                        {detailData.partner.pixKey ? ` · PIX: ${detailData.partner.pixKey}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetailData(null)}
                      className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Quick Actions Strip */}
                  <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDetailTab('orders')}
                        className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                          detailTab === 'orders'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Ordens de Produção ({detailData.orders.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDetailTab('custody')}
                        className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                          detailTab === 'custody'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Custódia de Materiais ({detailData.custody.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDetailTab('finance')}
                        className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                          detailTab === 'finance'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Financeiro ({detailData.payables.length})
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {canManageCustody && detailData.partner.active && (
                        <button
                          type="button"
                          onClick={() => openDispatchModal(detailData.partner)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold rounded-lg cursor-pointer"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          <span>Enviar Material</span>
                        </button>
                      )}
                      {canCreatePayable && (
                        <button
                          type="button"
                          onClick={() => openPayableModal(detailData.partner)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold rounded-lg cursor-pointer"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          <span>Lançar Pagamento</span>
                        </button>
                      )}
                      {canWhatsApp && (
                        <button
                          type="button"
                          onClick={() => {
                            const p = detailData.partner;
                            setDetailData(null);
                            onOpenWhatsApp(p);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-slate-300 font-semibold rounded-lg cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tab Body */}
                  <div className="p-6 max-h-[60vh] overflow-y-auto text-xs space-y-4">
                    {detailData.partner.notes && (
                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">
                        <strong className="text-slate-800">Notas técnicas: </strong>
                        {detailData.partner.notes}
                      </div>
                    )}

                    {/* TAB: ORDERS */}
                    {detailTab === 'orders' && (
                      <div className="space-y-2.5">
                        {detailData.orders.length === 0 ? (
                          <p className="text-center py-8 text-slate-500">
                            Nenhuma Ordem de Produção vinculada a este parceiro ainda.
                          </p>
                        ) : (
                          detailData.orders.map((op) => {
                            const unitLabor =
                              op.partnerCostPerPiece ?? detailData.partner.defaultCostPerPiece ?? 0;
                            const estTotal = Math.round(op.totalPieces * unitLabor * 100) / 100;
                            return (
                              <div
                                key={op.id}
                                className="p-3.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50"
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-blue-700">
                                      {op.orderNumber || op.id}
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[10px]">
                                      {getStageLabel(op.stage)}
                                    </span>
                                  </div>
                                  <div className="font-semibold text-slate-900 mt-1">
                                    {op.itemTitle} — <span className="text-slate-500">{op.clientName}</span>
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    {op.totalPieces} peças · Entrega prometida: {formatDateBR(op.targetDeliveryDate)}
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                  <div className="text-right">
                                    <span className="text-[10px] text-slate-400 block">Serviço Estimado</span>
                                    <strong className="font-mono text-slate-900">
                                      {formatCurrencyBRL(estTotal)}
                                    </strong>
                                    <span className="text-[10px] text-slate-500 block font-mono">
                                      ({formatCurrencyBRL(unitLabor)}/pç)
                                    </span>
                                  </div>
                                  {canCreatePayable && (
                                    <button
                                      type="button"
                                      onClick={() => openPayableModal(detailData.partner, op)}
                                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold text-[11px] cursor-pointer"
                                    >
                                      Gerar Pagamento
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}

                    {/* TAB: CUSTODY */}
                    {detailTab === 'custody' && (
                      <div className="space-y-2.5">
                        {detailData.custody.length === 0 ? (
                          <p className="text-center py-8 text-slate-500">
                            Nenhuma remessa de tecido ou aviamento registrada para este parceiro.
                          </p>
                        ) : (
                          detailData.custody.map((c) => {
                            const st = CUSTODY_STATUS_META[c.status] || CUSTODY_STATUS_META.em_custodia;
                            return (
                              <div
                                key={c.id}
                                className="p-3.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-slate-900">{c.itemName}</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${st.badgeClass}`}>
                                      {st.label}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-1">
                                    Enviado em {formatDateBR(c.sentDate)}
                                    {c.orderNumber ? ` · OP ${c.orderNumber}` : ''}
                                  </div>
                                  <div className="text-[11px] font-mono text-slate-600 mt-0.5">
                                    Remetido: {c.sentQuantity} {c.unit} · Baixado: {c.returnedQuantity} {c.unit} · Perda: {c.lostQuantity} {c.unit}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <div className="text-right">
                                    <span className="text-[10px] text-slate-400 block">Em Posse</span>
                                    <strong className="font-mono text-indigo-700 text-sm">
                                      {c.pendingQuantity} {c.unit}
                                    </strong>
                                  </div>
                                  {c.pendingQuantity > 0 && canManageCustody && (
                                    <button
                                      type="button"
                                      onClick={() => openReturnModal(c)}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold cursor-pointer"
                                    >
                                      <ArrowDownLeft className="w-3.5 h-3.5" />
                                      <span>Dar Baixa</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}

                    {/* TAB: FINANCE */}
                    {detailTab === 'finance' && (
                      <div className="space-y-2.5">
                        {detailData.payables.length === 0 ? (
                          <div className="text-center py-8 space-y-2">
                            <p className="text-slate-500">
                              Nenhum pagamento de serviço terceirizado lançado para este parceiro.
                            </p>
                            {canCreatePayable && (
                              <button
                                type="button"
                                onClick={() => openPayableModal(detailData.partner)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Lançar Pagamento de Serviço</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <>
                            {detailData.payables.map((f) => (
                              <div
                                key={f.id}
                                className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-3"
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-slate-700">
                                      {f.transactionNumber || f.id}
                                    </span>
                                    <span
                                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                        f.status === 'pago'
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : f.status === 'atrasado'
                                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                                      }`}
                                    >
                                      {f.status}
                                    </span>
                                  </div>
                                  <div className="font-semibold text-slate-900 mt-1">{f.description}</div>
                                  <div className="text-[11px] text-slate-500">
                                    Vencimento: {formatDateBR(f.dueDate)} · Meio: {f.paymentMethod.toUpperCase()}
                                    {f.paidDate ? ` · Pago em ${formatDateBR(f.paidDate)}` : ''}
                                  </div>
                                </div>
                                <strong className="font-mono text-sm text-slate-900 shrink-0">
                                  {formatCurrencyBRL(f.amount)}
                                </strong>
                              </div>
                            ))}
                            <div className="pt-2 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setDetailData(null);
                                  onNavigateTab('finance');
                                }}
                                className="text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
                              >
                                Abrir módulo Financeiro completo &rarr;
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}

      {/* MODAL 3: DISPATCH CUSTODY REMITTANCE */}
      {dispatchPartner && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-indigo-300" />
                <h3 className="text-sm font-bold">
                  Remessa de Material — {dispatchPartner.tradeName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDispatchPartner(null)}
                className="p-1 text-indigo-300 hover:text-white rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleDispatchSubmit} className="p-6 space-y-4 text-xs">
              {dispatchError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg font-medium">
                  {dispatchError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tecido / Aviamento do Almoxarifado *
                </label>
                <select
                  value={dispatchItemId}
                  onChange={(e) => setDispatchItemId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                >
                  {inventory.map((it) => (
                    <option key={it.id} value={it.id} disabled={it.currentStock <= 0}>
                      [{it.code}] {it.name} — Disponível: {it.currentStock} {it.unit}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Quantidade Remetida *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={dispatchQty}
                    onChange={(e) => setDispatchQty(e.target.value)}
                    placeholder="Ex: 45"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    OP Vinculada (opcional)
                  </label>
                  <select
                    value={dispatchOrderId}
                    onChange={(e) => setDispatchOrderId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                  >
                    <option value="">Sem vínculo de OP</option>
                    {activeOrdersForSelect.map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.orderNumber || op.id} — {op.clientName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Observações da Remessa
                </label>
                <textarea
                  rows={2}
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  placeholder="Ex: Lote cortado entregue ao motorista da facção, previsão de retorno sexta-feira."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-[11px] text-indigo-900">
                O saldo será automaticamente deduzido do <strong>Estoque Físico</strong> e transferido para{' '}
                <strong>Em Poder de Terceiros</strong> com registro compensatório auditável.
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDispatchPartner(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={dispatchSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold rounded-lg cursor-pointer"
                >
                  Confirmar Remessa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: CUSTODY RETURN / CONSUMPTION / LOSS */}
      {returnTarget && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold">Baixa de Custódia de Terceiro</h3>
              </div>
              <button
                type="button"
                onClick={() => setReturnTarget(null)}
                className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleReturnSubmit} className="p-6 space-y-4 text-xs">
              {returnError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg font-medium">
                  {returnError}
                </div>
              )}

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="font-bold text-slate-900">{returnTarget.itemName}</div>
                <div className="text-slate-600">
                  Parceiro: <strong>{returnTarget.partnerName}</strong>
                  {returnTarget.orderNumber ? ` · OP ${returnTarget.orderNumber}` : ''}
                </div>
                <div className="font-mono font-bold text-indigo-700">
                  Saldo pendente em posse: {returnTarget.pendingQuantity} {returnTarget.unit}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Natureza da Baixa *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReturnMode('consumed')}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer ${
                      returnMode === 'consumed'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    <strong className="block">Consumo em Peças Prontas</strong>
                    <span className="text-[10px]">
                      Material transformado em uniformes (não retorna ao almoxarifado).
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReturnMode('stock_return')}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer ${
                      returnMode === 'stock_return'
                        ? 'bg-blue-50 border-blue-400 text-blue-900'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    <strong className="block">Devolução de Sobra</strong>
                    <span className="text-[10px]">
                      Tecido/aviamento não usado retorna ao Estoque Físico.
                    </span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {returnMode === 'consumed' ? 'Qtd. Consumida' : 'Qtd. Devolvida'} ({returnTarget.unit})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={returnQty}
                    onChange={(e) => setReturnQty(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Perda Técnica / Avaria ({returnTarget.unit})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={lossQty}
                    onChange={(e) => setLossQty(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-rose-700"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Observações da Conferência
                </label>
                <textarea
                  rows={2}
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="Ex: Lote conferido na expedição com 2% de apara normal."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReturnTarget(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={returnSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold rounded-lg cursor-pointer"
                >
                  Confirmar Baixa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: QUICK SERVICE PAYABLE */}
      {payablePartner && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-emerald-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-300" />
                <h3 className="text-sm font-bold">
                  Lançar Pagamento — {payablePartner.tradeName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPayablePartner(null)}
                className="p-1 text-emerald-300 hover:text-white rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handlePayableSubmit} className="p-6 space-y-4 text-xs">
              {payablePartner.pixKey && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-900">
                  <KeyRound className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Chave PIX cadastrada: <strong className="font-mono">{payablePartner.pixKey}</strong>
                  </span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Vincular à Ordem de Produção (opcional)
                </label>
                <select
                  value={payableOrderId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setPayableOrderId(nextId);
                    const op = orders.find((o) => o.id === nextId);
                    if (op) {
                      const unit = op.partnerCostPerPiece ?? payablePartner.defaultCostPerPiece ?? 0;
                      setPayableAmount(Math.round(op.totalPieces * unit * 100) / 100);
                      setPayableDescription(
                        `Serviço ${PARTNER_CATEGORY_META[payablePartner.partnerType].shortLabel} — ${payablePartner.tradeName} (${op.orderNumber || op.id})`
                      );
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                >
                  <option value="">Serviço avulso / consolidado</option>
                  {orders.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.orderNumber || op.id} — {op.clientName} ({op.totalPieces} pçs)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Descrição do Título (Contas a Pagar) *
                </label>
                <input
                  type="text"
                  required
                  value={payableDescription}
                  onChange={(e) => setPayableDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Valor (R$) *</label>
                  <CurrencyInput value={payableAmount} onChange={setPayableAmount} required />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Vencimento *</label>
                  <DateInputBR value={payableDueDate} onChange={setPayableDueDate} required />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Forma</label>
                  <select
                    value={payableMethod}
                    onChange={(e) =>
                      setPayableMethod(e.target.value as 'pix' | 'transferencia' | 'boleto')
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                  >
                    <option value="pix">PIX</option>
                    <option value="transferencia">Transferência</option>
                    <option value="boleto">Boleto</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPayablePartner(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={payableSubmitting || payableAmount <= 0}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold rounded-lg cursor-pointer"
                >
                  Lançar no Financeiro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
