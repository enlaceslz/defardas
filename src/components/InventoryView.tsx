import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  Search,
  Plus,
  AlertTriangle,
  Trash2,
  Edit3,
  X,
  History,
  ArrowDownLeft,
  ArrowUpRight,
  Truck,
  RotateCcw,
  SlidersHorizontal,
  RefreshCw,
  Scissors,
  ExternalLink,
  ShoppingCart,
} from 'lucide-react';
import { InventoryItem, InventoryCategory, ProductionOrder, InventoryMovement, Supplier } from '../types/erp';
import { formatCurrencyBRL, formatDateBR } from '../utils/formatters';
import { CurrencyInput } from './FormInputs';
import { useAuth } from '../api/authContext';
import { api } from '../api/client';

type StockMovementType =
  | 'entrada_compra'
  | 'saida_corte'
  | 'remessa_parceiro'
  | 'retorno_parceiro'
  | 'perda_tecnica'
  | 'ajuste_inventario';

const MOVEMENT_META: Record<
  StockMovementType,
  { label: string; badgeClass: string; direction: '+' | '-' | '±' }
> = {
  entrada_compra: {
    label: 'Entrada de Compra',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    direction: '+',
  },
  saida_corte: {
    label: 'Saída para Corte',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    direction: '-',
  },
  remessa_parceiro: {
    label: 'Remessa p/ Facção',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    direction: '-',
  },
  retorno_parceiro: {
    label: 'Retorno de Facção',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
    direction: '+',
  },
  perda_tecnica: {
    label: 'Perda Técnica / Retalho',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    direction: '-',
  },
  ajuste_inventario: {
    label: 'Ajuste Compensatório',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
    direction: '±',
  },
};

const CATEGORY_LABELS: Record<InventoryCategory, string> = {
  tecido: 'Tecido (Rolo)',
  aviamento: 'Aviamento',
  insumo_personalizacao: 'Estamparia / Bordado',
  pronta_entrega: 'Pronta-Entrega',
};

interface InventoryViewProps {
  inventory: InventoryItem[];
  orders?: ProductionOrder[];
  suppliers?: Supplier[];
  onSaveItem: (item: InventoryItem) => Promise<boolean>;
  onDeleteItem: (itemId: string) => void;
  onCreateStockMovement?: (payload: {
    itemId: string;
    productionOrderId?: string;
    type: StockMovementType;
    quantity: number;
    reason: string;
    referenceDoc?: string;
  }) => Promise<boolean>;
  onRequestPurchaseForItem?: (item: InventoryItem) => void;
  onNavigateTab?: (tab: string) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  inventory,
  orders = [],
  suppliers = [],
  onSaveItem,
  onDeleteItem,
  onCreateStockMovement,
  onRequestPurchaseForItem,
  onNavigateTab,
}) => {
  const { user } = useAuth();
  const role = user?.role || '';

  // RBAC estritamente espelhado em server/auth/rbac.ts
  const canManageItems = ['admin', 'pcp_producao'].includes(role);
  const canCreateMovement = ['admin', 'pcp_producao', 'financeiro'].includes(role);
  const canAdjustInventory = ['admin', 'pcp_producao'].includes(role);
  const canViewPartners = ['admin', 'gerente_comercial', 'pcp_producao', 'expedicao_qualidade', 'financeiro'].includes(role);
  const canViewSuppliers = ['admin', 'pcp_producao', 'financeiro', 'gerente_comercial'].includes(role);
  const canCreatePurchaseOrder = ['admin', 'pcp_producao', 'financeiro'].includes(role);

  const [activeTab, setActiveTab] = useState<'stock' | 'kardex'>('stock');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [quickFilter, setQuickFilter] = useState<'all' | 'critical' | 'custody'>('all');

  // Kardex state
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [isLoadingMovements, setIsLoadingMovements] = useState(false);
  const [kardexItemFilter, setKardexItemFilter] = useState<string>('all');
  const [kardexTypeFilter, setKardexTypeFilter] = useState<string>('all');
  const [kardexSearch, setKardexSearch] = useState('');

  // Modal for new/edit item
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [itemFormError, setItemFormError] = useState('');
  const [isSavingItem, setIsSavingItem] = useState(false);

  // Auditable Stock Movement Modal (PRD §3.2)
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);
  const [movementType, setMovementType] = useState<StockMovementType>('entrada_compra');
  const [movementQty, setMovementQty] = useState<number>(10);
  const [movementOrderId, setMovementOrderId] = useState<string>('');
  const [movementReason, setMovementReason] = useState('');
  const [movementRefDoc, setMovementRefDoc] = useState('');
  const [movementError, setMovementError] = useState('');
  const [isSubmittingMovement, setIsSubmittingMovement] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [category, setCategory] = useState<InventoryCategory>('tecido');
  const [unit, setUnit] = useState<InventoryItem['unit']>('metros');
  const [currentStock, setCurrentStock] = useState(100);
  const [minStock, setMinStock] = useState(50);
  const [costPrice, setCostPrice] = useState(20);
  const [supplierId, setSupplierId] = useState('');
  const [supplier, setSupplier] = useState('');
  const [location, setLocation] = useState('Almoxarifado Central');

  const loadMovements = useCallback(async () => {
    setIsLoadingMovements(true);
    try {
      const res = await api.getInventoryMovements();
      if (res.status === 200 && Array.isArray(res.data)) {
        setMovements(res.data);
      }
    } finally {
      setIsLoadingMovements(false);
    }
  }, []);

  useEffect(() => {
    loadMovements();
  }, [loadMovements, inventory]);

  const activeOrders = useMemo(
    () => orders.filter((o) => o.stage !== 'entregue'),
    [orders]
  );

  const openNewModal = () => {
    setEditingItem(null);
    setItemFormError('');
    setName('');
    setCategory('tecido');
    setUnit('metros');
    setCurrentStock(200);
    setMinStock(100);
    setCostPrice(25.0);
    const defaultSupplier = suppliers.find((s) => s.active);
    setSupplierId(defaultSupplier?.id || '');
    setSupplier(defaultSupplier?.tradeName || '');
    setLocation('Prateleira A-01');
    setIsModalOpen(true);
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingItem(item);
    setItemFormError('');
    setName(item.name);
    setCategory(item.category);
    setUnit(item.unit);
    setCurrentStock(item.currentStock);
    setMinStock(item.minStock);
    setCostPrice(item.costPrice);
    setSupplierId(item.supplierId || '');
    setSupplier(item.supplier);
    setLocation(item.location);
    setIsModalOpen(true);
  };

  const isEditingUnitLocked = useMemo(() => {
    if (!editingItem) return false;
    const hasBalance =
      editingItem.currentStock > 0 ||
      (editingItem.allocatedStock || 0) > 0 ||
      (editingItem.inPartnersCustodyStock || 0) > 0;
    const hasHistory = movements.some((m) => m.itemId === editingItem.id);
    return hasBalance || hasHistory;
  }, [editingItem, movements]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingItem) return;
    setItemFormError('');

    if (name.trim().length < 2) {
      setItemFormError('Informe a descrição completa do insumo (mínimo 2 caracteres).');
      return;
    }

    const itemToSave: InventoryItem = {
      id: editingItem?.id || `inv-${Date.now()}`,
      code: editingItem?.code || '',
      name: name.trim(),
      category,
      unit,
      currentStock,
      allocatedStock: editingItem?.allocatedStock || 0,
      inPartnersCustodyStock: editingItem?.inPartnersCustodyStock || 0,
      minStock,
      costPrice,
      supplierId: supplierId || undefined,
      supplier: supplier.trim() || 'Fornecedor Homologado',
      location: location.trim() || 'Almoxarifado Central',
      lastRestocked: editingItem?.lastRestocked || new Date().toISOString().split('T')[0],
    };

    setIsSavingItem(true);
    try {
      const ok = await onSaveItem(itemToSave);
      if (ok) {
        setIsModalOpen(false);
        await loadMovements();
      } else {
        setItemFormError('Não foi possível salvar o insumo. Verifique a notificação de erro acima.');
      }
    } finally {
      setIsSavingItem(false);
    }
  };

  const openMovementModal = (item: InventoryItem) => {
    setMovementItem(item);
    setMovementType('entrada_compra');
    setMovementQty(10);
    setMovementOrderId('');
    setMovementReason('');
    setMovementRefDoc('');
    setMovementError('');
  };

  const handleMovementTypeChange = (nextType: StockMovementType) => {
    setMovementType(nextType);
    setMovementError('');
    if (movementItem && nextType === 'ajuste_inventario') {
      setMovementQty(movementItem.currentStock);
    } else if (movementQty === 0) {
      setMovementQty(10);
    }
  };

  const handleMovementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movementItem || !onCreateStockMovement || isSubmittingMovement) return;
    if (!movementReason || movementReason.trim().length < 5) {
      setMovementError('Informe uma justificativa auditável com ao menos 5 caracteres.');
      return;
    }
    if (movementType !== 'ajuste_inventario' && movementQty <= 0) {
      setMovementError('A quantidade deve ser maior que zero.');
      return;
    }
    if (movementType === 'ajuste_inventario') {
      if (movementQty < 0) {
        setMovementError('O saldo alvo do inventário não pode ser negativo.');
        return;
      }
      if (Math.round((movementQty - movementItem.currentStock) * 100) / 100 === 0) {
        setMovementError('O saldo alvo informado é igual ao saldo físico atual.');
        return;
      }
    }
    setMovementError('');
    setIsSubmittingMovement(true);
    try {
      const ok = await onCreateStockMovement({
        itemId: movementItem.id,
        productionOrderId: movementOrderId || undefined,
        type: movementType,
        quantity: movementQty,
        reason: movementReason.trim(),
        referenceDoc: movementRefDoc.trim() || undefined,
      });
      if (ok) {
        setMovementItem(null);
        await loadMovements();
      }
    } finally {
      setIsSubmittingMovement(false);
    }
  };

  const openKardexForItem = (itemId: string) => {
    setKardexItemFilter(itemId);
    setKardexTypeFilter('all');
    setKardexSearch('');
    setActiveTab('kardex');
  };

  // KPIs (PRD §3.2: patrimônio inclui saldo próprio + saldo em poder de terceiros)
  const kpis = useMemo(() => {
    const physicalValuation = inventory.reduce((sum, i) => sum + i.currentStock * i.costPrice, 0);
    const custodyValuation = inventory.reduce(
      (sum, i) => sum + (i.inPartnersCustodyStock || 0) * i.costPrice,
      0
    );
    const lowStockCount = inventory.filter((i) => i.currentStock <= i.minStock).length;
    const custodyItemsCount = inventory.filter((i) => (i.inPartnersCustodyStock || 0) > 0).length;
    const physicalMeters = inventory
      .filter((i) => i.unit === 'metros')
      .reduce((s, i) => s + i.currentStock, 0);
    const custodyMeters = inventory
      .filter((i) => i.unit === 'metros')
      .reduce((s, i) => s + (i.inPartnersCustodyStock || 0), 0);

    return {
      totalValuation: physicalValuation + custodyValuation,
      physicalValuation,
      custodyValuation,
      lowStockCount,
      custodyItemsCount,
      physicalMeters,
      custodyMeters,
    };
  }, [inventory]);

  // Filter items
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return inventory.filter((item) => {
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.supplier.toLowerCase().includes(q) ||
        item.location.toLowerCase().includes(q);

      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const matchesQuick =
        quickFilter === 'all' ||
        (quickFilter === 'critical' && item.currentStock <= item.minStock) ||
        (quickFilter === 'custody' && (item.inPartnersCustodyStock || 0) > 0);

      return matchesSearch && matchesCategory && matchesQuick;
    });
  }, [inventory, searchQuery, categoryFilter, quickFilter]);

  // Filter Kardex movements
  const filteredMovements = useMemo(() => {
    const q = kardexSearch.trim().toLowerCase();
    return movements.filter((m) => {
      const matchesItem = kardexItemFilter === 'all' || m.itemId === kardexItemFilter;
      const matchesType = kardexTypeFilter === 'all' || m.type === kardexTypeFilter;
      const matchesSearch =
        !q ||
        (m.movementNumber || '').toLowerCase().includes(q) ||
        (m.itemCode || '').toLowerCase().includes(q) ||
        (m.itemName || '').toLowerCase().includes(q) ||
        (m.referenceDoc || '').toLowerCase().includes(q) ||
        (m.orderNumber || '').toLowerCase().includes(q) ||
        (m.reason || '').toLowerCase().includes(q) ||
        (m.operatorName || '').toLowerCase().includes(q);
      return matchesItem && matchesType && matchesSearch;
    });
  }, [movements, kardexItemFilter, kardexTypeFilter, kardexSearch]);

  const adjustmentDelta =
    movementItem && movementType === 'ajuste_inventario'
      ? Math.round((movementQty - movementItem.currentStock) * 100) / 100
      : 0;

  return (
    <div className="space-y-6">

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="text-xs font-medium text-slate-500 flex items-center gap-2">
            <span>DE FARDAS</span>
            <span aria-hidden="true">/</span>
            <span>Almoxarifado</span>
            <span aria-hidden="true">/</span>
            <span className="text-slate-800 font-semibold">Tecidos & Aviamentos</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Controle de Estoque, Tecidoteca & Kardex
          </h1>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {canViewSuppliers && onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('suppliers')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-cyan-800 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 transition-colors cursor-pointer"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Fornecedores & Compras</span>
              <ExternalLink className="w-3 h-3 opacity-70" />
            </button>
          )}

          {canViewPartners && onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('partners')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors cursor-pointer"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Custódia em Facções</span>
              <ExternalLink className="w-3 h-3 opacity-70" />
            </button>
          )}

          {canManageItems && (
            <button
              onClick={openNewModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#C8102E] rounded-lg hover:bg-[#A60D26] shadow-sm transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Tecido / Insumo</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards (4 interactive indicators) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <button
          type="button"
          onClick={() => {
            setActiveTab('stock');
            setQuickFilter('all');
          }}
          className={`text-left bg-white p-4 rounded-xl border transition-all cursor-pointer ${
            activeTab === 'stock' && quickFilter === 'all'
              ? 'border-blue-400 ring-1 ring-blue-100 shadow-xs'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-slate-500 font-medium">Patrimônio Total em Estoque</div>
          <div className="text-xl font-bold font-mono text-slate-900 mt-1">
            {formatCurrencyBRL(kpis.totalValuation)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Físico: <span className="font-mono font-semibold text-slate-700">{formatCurrencyBRL(kpis.physicalValuation)}</span>
            {kpis.custodyValuation > 0 && (
              <> · 3ºs: <span className="font-mono font-semibold text-indigo-700">{formatCurrencyBRL(kpis.custodyValuation)}</span></>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('stock');
            setQuickFilter((prev) => (prev === 'critical' ? 'all' : 'critical'));
          }}
          className={`text-left bg-white p-4 rounded-xl border transition-all cursor-pointer ${
            activeTab === 'stock' && quickFilter === 'critical'
              ? 'border-amber-400 ring-1 ring-amber-100 shadow-xs'
              : 'border-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="text-slate-500 font-medium">Alertas de Ponto de Pedido</div>
          <div className={`text-xl font-bold font-mono mt-1 ${kpis.lowStockCount > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
            {kpis.lowStockCount} {kpis.lowStockCount === 1 ? 'item crítico' : 'itens críticos'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {kpis.lowStockCount > 0 ? 'Abaixo da margem mínima' : 'Todos os itens acima do mínimo'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('stock');
            setQuickFilter((prev) => (prev === 'custody' ? 'all' : 'custody'));
          }}
          className={`text-left bg-white p-4 rounded-xl border transition-all cursor-pointer ${
            activeTab === 'stock' && quickFilter === 'custody'
              ? 'border-indigo-400 ring-1 ring-indigo-100 shadow-xs'
              : 'border-slate-200 hover:border-indigo-300'
          }`}
        >
          <div className="text-slate-500 font-medium">Em Poder de Terceiros (Facções)</div>
          <div className="text-xl font-bold font-mono text-indigo-700 mt-1">
            {formatCurrencyBRL(kpis.custodyValuation)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {kpis.custodyItemsCount} {kpis.custodyItemsCount === 1 ? 'insumo' : 'insumos'} sob custódia externa
          </div>
        </button>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-slate-500 font-medium">Metragem de Rolos Têxteis</div>
          <div className="text-xl font-bold font-mono text-blue-700 mt-1">
            {kpis.physicalMeters.toLocaleString('pt-BR')}{' '}
            <span className="text-xs font-normal text-slate-500">m físicos</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {kpis.custodyMeters > 0
              ? `+ ${kpis.custodyMeters.toLocaleString('pt-BR')} m em facções parceiras`
              : 'Prontos para enfesto e mesa de corte'}
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 gap-4 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('stock')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'stock'
                ? 'border-[#C8102E] text-[#C8102E]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Posição de Estoque ({inventory.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('kardex')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'kardex'
                ? 'border-[#C8102E] text-[#C8102E]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Extrato / Kardex Auditável ({movements.length})</span>
          </button>
        </div>

        {activeTab === 'kardex' && (
          <button
            type="button"
            onClick={loadMovements}
            disabled={isLoadingMovements}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg cursor-pointer mb-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMovements ? 'animate-spin' : ''}`} />
            <span>Atualizar Kardex</span>
          </button>
        )}
      </div>

      {/* TAB 1: POSIÇÃO DE ESTOQUE */}
      {activeTab === 'stock' ? (
        <>
          {/* Filters */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
            <div className="flex-1 flex flex-col sm:flex-row gap-2.5 flex-wrap">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome, código, fornecedor ou localização..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filtrar por categoria"
                className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="all">Todas as Categorias</option>
                <option value="tecido">Tecidos (Rolos)</option>
                <option value="aviamento">Aviamentos (Zíperes, Linhas, Faixas 3M)</option>
                <option value="insumo_personalizacao">Insumos de Estampa/Bordado</option>
                <option value="pronta_entrega">Uniformes Pronta-Entrega</option>
              </select>

              {(searchQuery || categoryFilter !== 'all' || quickFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setCategoryFilter('all');
                    setQuickFilter('all');
                  }}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 font-medium cursor-pointer"
                >
                  Limpar filtros
                </button>
              )}
            </div>

            <div className="text-slate-500 font-medium shrink-0">
              Exibindo <span className="font-mono font-bold text-slate-800">{filteredItems.length}</span> de{' '}
              <span className="font-mono font-bold text-slate-800">{inventory.length}</span> itens
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-3 px-4">Código</th>
                    <th className="py-3 px-4">Descrição do Insumo / Tecido</th>
                    <th className="py-3 px-4">Categoria</th>
                    <th className="py-3 px-4 text-center">Físico Próprio</th>
                    <th className="py-3 px-4 text-center">Alocado (OPs)</th>
                    <th className="py-3 px-4 text-center">Em Facções</th>
                    <th className="py-3 px-4 text-center">Mínimo</th>
                    <th className="py-3 px-4 text-right">Custo Unit.</th>
                    <th className="py-3 px-4 text-right">Valor Total</th>
                    <th className="py-3 px-4">Fornecedor / Local</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-10 text-center text-slate-400">
                        Nenhum item encontrado no almoxarifado com os filtros atuais.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const isCritical = item.currentStock <= item.minStock;
                      const freeStock = Math.max(0, Math.round((item.currentStock - (item.allocatedStock || 0)) * 100) / 100);
                      const totalItemValue = (item.currentStock + (item.inPartnersCustodyStock || 0)) * item.costPrice;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            {item.code}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{item.name}</div>
                            {isCritical && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium mt-0.5">
                                <AlertTriangle className="w-3 h-3" />
                                Abaixo do ponto de pedido
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {CATEGORY_LABELS[item.category] || item.category}
                          </td>
                          <td className="py-3 px-4 text-center font-mono">
                            <div>
                              <span className={`font-bold text-sm ${isCritical ? 'text-amber-700' : 'text-slate-900'}`}>
                                {item.currentStock.toLocaleString('pt-BR')}
                              </span>{' '}
                              <span className="text-[11px] text-slate-500">{item.unit}</span>
                            </div>
                            {(item.allocatedStock || 0) > 0 && (
                              <div className="text-[10px] text-slate-400">
                                Livre: {freeStock.toLocaleString('pt-BR')}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center font-mono text-blue-700 font-semibold">
                            {(item.allocatedStock || 0).toLocaleString('pt-BR')}{' '}
                            <span className="text-[10px] font-normal text-slate-400">{item.unit}</span>
                          </td>
                          <td className="py-3 px-4 text-center font-mono">
                            <span
                              className={`font-semibold ${
                                (item.inPartnersCustodyStock || 0) > 0
                                  ? 'text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded'
                                  : 'text-slate-400'
                              }`}
                            >
                              {(item.inPartnersCustodyStock || 0).toLocaleString('pt-BR')}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-mono text-slate-500">
                            {item.minStock.toLocaleString('pt-BR')}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-700">
                            {formatCurrencyBRL(item.costPrice)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                            {formatCurrencyBRL(totalItemValue)}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            <div>{item.supplier}</div>
                            <div className="text-[11px] text-slate-400">{item.location}</div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1 flex-wrap">
                              {canCreatePurchaseOrder && onRequestPurchaseForItem && (
                                <button
                                  type="button"
                                  onClick={() => onRequestPurchaseForItem(item)}
                                  className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded font-semibold cursor-pointer border transition-colors ${
                                    isCritical
                                      ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-800'
                                      : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700'
                                  }`}
                                  title="Emitir Pedido de Compra para repor este insumo"
                                >
                                  <ShoppingCart className="w-3 h-3" />
                                  <span>{isCritical ? 'Repor' : 'Comprar'}</span>
                                </button>
                              )}
                              <button
                                onClick={() => openKardexForItem(item.id)}
                                className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-medium cursor-pointer"
                                title="Ver extrato Kardex deste insumo"
                              >
                                Kardex
                              </button>
                              {canCreateMovement && onCreateStockMovement && (
                                <button
                                  onClick={() => openMovementModal(item)}
                                  className="px-2 py-1 text-[11px] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-blue-700 font-semibold cursor-pointer"
                                  title="Registrar movimentação auditada (Compra, Corte, Remessa/Retorno Facção, Perda ou Ajuste)"
                                >
                                  Movimentar
                                </button>
                              )}
                              {canManageItems && (
                                <>
                                  <button
                                    onClick={() => openEditModal(item)}
                                    className="p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                                    title="Editar cadastro do item"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => onDeleteItem(item.id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                                    title="Excluir item"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* TAB 2: EXTRATO / KARDEX AUDITÁVEL */
        <>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
            <div className="flex-1 flex flex-col sm:flex-row gap-2.5 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por MOV, NF, OP, motivo ou operador..."
                  value={kardexSearch}
                  onChange={(e) => setKardexSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <select
                value={kardexItemFilter}
                onChange={(e) => setKardexItemFilter(e.target.value)}
                aria-label="Filtrar Kardex por insumo"
                className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700"
              >
                <option value="all">Todos os Insumos</option>
                {inventory.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.code} — {it.name}
                  </option>
                ))}
              </select>

              <select
                value={kardexTypeFilter}
                onChange={(e) => setKardexTypeFilter(e.target.value)}
                aria-label="Filtrar Kardex por tipo de evento"
                className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700"
              >
                <option value="all">Todos os Tipos de Evento</option>
                <option value="entrada_compra">Entrada de Compra</option>
                <option value="saida_corte">Saída para Corte</option>
                <option value="remessa_parceiro">Remessa p/ Facção</option>
                <option value="retorno_parceiro">Retorno de Facção</option>
                <option value="perda_tecnica">Perda Técnica / Retalho</option>
                <option value="ajuste_inventario">Ajuste Compensatório</option>
              </select>

              {(kardexItemFilter !== 'all' || kardexTypeFilter !== 'all' || kardexSearch) && (
                <button
                  type="button"
                  onClick={() => {
                    setKardexItemFilter('all');
                    setKardexTypeFilter('all');
                    setKardexSearch('');
                  }}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 font-medium cursor-pointer"
                >
                  Limpar filtros
                </button>
              )}
            </div>

            <div className="text-slate-500 font-medium shrink-0">
              <span className="font-mono font-bold text-slate-800">{filteredMovements.length}</span> evento(s)
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-3 px-4">Protocolo</th>
                    <th className="py-3 px-4">Data</th>
                    <th className="py-3 px-4">Insumo</th>
                    <th className="py-3 px-4">Tipo de Evento</th>
                    <th className="py-3 px-4 text-right">Qtd</th>
                    <th className="py-3 px-4">Documento / OP</th>
                    <th className="py-3 px-4">Justificativa Auditável</th>
                    <th className="py-3 px-4">Operador</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400">
                        Nenhuma movimentação registrada no Kardex para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredMovements.map((mov) => {
                      const meta = MOVEMENT_META[mov.type] || {
                        label: mov.type,
                        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
                        direction: '±',
                      };
                      const DirIcon =
                        meta.direction === '+'
                          ? ArrowDownLeft
                          : meta.direction === '-'
                            ? ArrowUpRight
                            : SlidersHorizontal;

                      return (
                        <tr key={mov.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            {mov.movementNumber || mov.id.slice(0, 8)}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                            {formatDateBR(mov.date)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{mov.itemName || 'Insumo'}</div>
                            {mov.itemCode && (
                              <div className="font-mono text-[10px] text-slate-500">{mov.itemCode}</div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold ${meta.badgeClass}`}
                            >
                              <DirIcon className="w-3 h-3" />
                              <span>{meta.label}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                            {meta.direction === '+' ? '+' : meta.direction === '-' ? '-' : '±'}
                            {Number(mov.quantity).toLocaleString('pt-BR')}{' '}
                            <span className="text-[10px] font-normal text-slate-500">{mov.unit}</span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-700">
                            {mov.orderNumber && (
                              <span className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold mr-1">
                                {mov.orderNumber}
                              </span>
                            )}
                            <span>{mov.referenceDoc || (!mov.orderNumber ? '—' : '')}</span>
                          </td>
                          <td className="py-3 px-4 text-slate-700 max-w-xs">
                            <div className="line-clamp-2" title={mov.reason}>
                              {mov.reason}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                            {mov.operatorName}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Item Modal (Create/Edit) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 bg-[#111113] text-white">
              <h3 className="text-base font-bold">
                {editingItem ? `Editar Insumo [${editingItem.code}]` : 'Cadastrar Matéria-Prima no Estoque'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4 text-xs">
              {itemFormError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{itemFormError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Código Canônico</label>
                  <input
                    type="text"
                    readOnly
                    value={editingItem ? editingItem.code : 'Gerado automaticamente (MAT-2026-XXXX)'}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono bg-slate-100 text-slate-600 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Categoria *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as InventoryCategory)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                  >
                    <option value="tecido">Tecido (Rolo)</option>
                    <option value="aviamento">Aviamento</option>
                    <option value="insumo_personalizacao">Insumo Estamparia/Bordado</option>
                    <option value="pronta_entrega">Pronta Entrega</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição Completa *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  placeholder="Ex: Brim Pesado 100% Algodão 260g Santanense"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Unidade {isEditingUnitLocked ? '(Travada)' : '*'}
                  </label>
                  <select
                    value={unit}
                    disabled={isEditingUnitLocked}
                    onChange={(e) => setUnit(e.target.value as InventoryItem['unit'])}
                    title={
                      isEditingUnitLocked
                        ? 'Unidade bloqueada pois o insumo já possui saldo ou histórico no Kardex.'
                        : undefined
                    }
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg ${
                      isEditingUnitLocked ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white text-slate-900'
                    }`}
                  >
                    <option value="metros">Metros</option>
                    <option value="kg">Quilos (Kg)</option>
                    <option value="rolos">Rolos</option>
                    <option value="unidades">Unidades</option>
                    <option value="cones">Cones de Linha</option>
                    <option value="pecas">Peças</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {editingItem ? 'Saldo Físico (Kardex)' : 'Saldo Inicial'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={!!editingItem}
                    value={currentStock}
                    onChange={(e) => setCurrentStock(Math.max(0, parseFloat(e.target.value) || 0))}
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg font-mono ${
                      editingItem ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'text-slate-900'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Estoque Mínimo</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={minStock}
                    onChange={(e) => setMinStock(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
                  />
                </div>
              </div>

              {!editingItem && currentStock > 0 && (
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-900">
                  O saldo inicial de <strong>{currentStock} {unit}</strong> gerará automaticamente o evento de entrada inicial no <strong>Kardex Auditável</strong>.
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Custo Unitário (R$)</label>
                  <CurrencyInput value={costPrice} onChange={setCostPrice} />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fornecedor Homologado</label>
                  <select
                    value={supplierId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSupplierId(nextId);
                      const found = suppliers.find((s) => s.id === nextId);
                      if (found) {
                        setSupplier(found.tradeName);
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                  >
                    <option value="">Outro / Informar manualmente</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        [{s.code}] {s.tradeName} {!s.active ? '(Inativo)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {!supplierId && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nome do Fornecedor (Avulso)</label>
                  <input
                    type="text"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                    placeholder="Ex: Santanense, Cedro, 3M"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Localização no Galpão</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  placeholder="Ex: Rua A - Prateleira 02"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSavingItem}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingItem}
                  className="px-5 py-2 bg-[#C8102E] text-white font-semibold rounded-lg hover:bg-[#A60D26] transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
                >
                  {isSavingItem ? 'Salvando...' : editingItem ? 'Salvar Alterações' : 'Cadastrar Insumo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Auditable Stock Movement Modal (PRD §3.2) */}
      {movementItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 bg-[#111113] text-white">
              <div>
                <h3 className="text-base font-bold">Movimentação Auditada de Estoque</h3>
                <p className="text-[11px] text-slate-400 font-mono">
                  {movementItem.code} · {movementItem.name}
                </p>
              </div>
              <button
                onClick={() => setMovementItem(null)}
                className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleMovementSubmit} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-4 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-center">
                <div>
                  <span className="block text-[10px] text-slate-500">Físico</span>
                  <strong className="text-sm text-slate-900">{movementItem.currentStock}</strong>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500">Livre</span>
                  <strong className="text-sm text-emerald-700">
                    {Math.max(0, Math.round((movementItem.currentStock - (movementItem.allocatedStock || 0)) * 100) / 100)}
                  </strong>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500">Alocado</span>
                  <strong className="text-sm text-blue-700">{movementItem.allocatedStock || 0}</strong>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500">Em Facções</span>
                  <strong className="text-sm text-indigo-700">{movementItem.inPartnersCustodyStock || 0}</strong>
                </div>
              </div>

              {movementError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg font-medium">
                  {movementError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tipo de Evento *</label>
                  <select
                    value={movementType}
                    onChange={(e) => handleMovementTypeChange(e.target.value as StockMovementType)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                  >
                    <option value="entrada_compra">Entrada de Compra (Fornecedor)</option>
                    <option value="saida_corte">Saída para Mesa de Corte</option>
                    <option value="remessa_parceiro">Remessa para Facção (Custódia 3º)</option>
                    <option value="retorno_parceiro">Retorno de Facção (Devolução)</option>
                    <option value="perda_tecnica">Perda Técnica / Retalho</option>
                    {canAdjustInventory && (
                      <option value="ajuste_inventario">Ajuste Compensatório de Inventário</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {movementType === 'ajuste_inventario'
                      ? `Novo Saldo Físico (${movementItem.unit}) *`
                      : `Quantidade (${movementItem.unit}) *`}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={movementType === 'ajuste_inventario' ? '0' : '0.01'}
                    required
                    value={movementQty}
                    onChange={(e) => setMovementQty(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
                  />
                </div>
              </div>

              {movementType === 'ajuste_inventario' && (
                <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-[11px] flex items-center justify-between font-mono">
                  <span className="text-slate-600">Delta compensatório calculado:</span>
                  <strong
                    className={
                      adjustmentDelta > 0
                        ? 'text-emerald-700'
                        : adjustmentDelta < 0
                          ? 'text-rose-700'
                          : 'text-slate-500'
                    }
                  >
                    {adjustmentDelta > 0 ? '+' : ''}
                    {adjustmentDelta.toLocaleString('pt-BR')} {movementItem.unit}
                  </strong>
                </div>
              )}

              {['saida_corte', 'remessa_parceiro', 'retorno_parceiro'].includes(movementType) &&
                activeOrders.length > 0 && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Vincular a Ordem de Produção (Opcional)
                    </label>
                    <select
                      value={movementOrderId}
                      onChange={(e) => setMovementOrderId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                    >
                      <option value="">Sem vínculo direto com OP</option>
                      {activeOrders.map((ord) => (
                        <option key={ord.id} value={ord.id}>
                          {ord.orderNumber || ord.id} — {ord.clientName} ({ord.itemTitle})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Documento / Referência (NF, Romaneio ou OP)
                </label>
                <input
                  type="text"
                  value={movementRefDoc}
                  onChange={(e) => setMovementRefDoc(e.target.value)}
                  placeholder="Ex: NF-49201, ROM-FAC-08 ou OP-2026-0101"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Motivo / Justificativa Auditável *
                </label>
                <textarea
                  rows={2}
                  required
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  placeholder="Descreva a origem ou destino da movimentação (mínimo 5 caracteres)..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMovementItem(null)}
                  disabled={isSubmittingMovement}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingMovement}
                  className="px-5 py-2 bg-[#C8102E] text-white font-semibold rounded-lg hover:bg-[#A60D26] transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap"
                >
                  {isSubmittingMovement ? 'Registrando...' : 'Registrar Evento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
