import React, { useState } from 'react';
import { 
  Boxes, 
  Search, 
  Plus, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowDownRight, 
  ArrowUpRight, 
  Trash2, 
  Edit3, 
  Package,
  Layers,
  X
} from 'lucide-react';
import { InventoryItem, InventoryCategory } from '../types/erp';
import { formatCurrencyBRL } from '../utils/formatters';
import { CurrencyInput } from './FormInputs';

type StockMovementType =
  | 'entrada_compra'
  | 'saida_corte'
  | 'remessa_parceiro'
  | 'retorno_parceiro'
  | 'perda_tecnica'
  | 'ajuste_inventario';

interface InventoryViewProps {
  inventory: InventoryItem[];
  onSaveItem: (item: InventoryItem) => void;
  onDeleteItem: (itemId: string) => void;
  onCreateStockMovement?: (payload: {
    itemId: string;
    type: StockMovementType;
    quantity: number;
    reason: string;
    referenceDoc?: string;
  }) => Promise<boolean>;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  inventory,
  onSaveItem,
  onDeleteItem,
  onCreateStockMovement,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  // Modal for new/edit item
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  // Auditable Stock Movement Modal (PRD §3.2)
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);
  const [movementType, setMovementType] = useState<StockMovementType>('entrada_compra');
  const [movementQty, setMovementQty] = useState<number>(10);
  const [movementReason, setMovementReason] = useState('');
  const [movementRefDoc, setMovementRefDoc] = useState('');
  const [movementError, setMovementError] = useState('');
  const [isSubmittingMovement, setIsSubmittingMovement] = useState(false);

  // Form states
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<InventoryCategory>('tecido');
  const [unit, setUnit] = useState<InventoryItem['unit']>('metros');
  const [currentStock, setCurrentStock] = useState(100);
  const [minStock, setMinStock] = useState(50);
  const [costPrice, setCostPrice] = useState(20);
  const [supplier, setSupplier] = useState('');
  const [location, setLocation] = useState('Almoxarifado Central');

  const openNewModal = () => {
    setEditingItem(null);
    setCode(`TEC-${Math.floor(100 + Math.random() * 900)}`);
    setName('');
    setCategory('tecido');
    setUnit('metros');
    setCurrentStock(200);
    setMinStock(100);
    setCostPrice(25.00);
    setSupplier('Santanense / Cedro Têxtil');
    setLocation('Prateleira A-01');
    setIsModalOpen(true);
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingItem(item);
    setCode(item.code);
    setName(item.name);
    setCategory(item.category);
    setUnit(item.unit);
    setCurrentStock(item.currentStock);
    setMinStock(item.minStock);
    setCostPrice(item.costPrice);
    setSupplier(item.supplier);
    setLocation(item.location);
    setIsModalOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const itemToSave: InventoryItem = {
      id: editingItem?.id || `inv-${Date.now()}`,
      code,
      name,
      category,
      unit,
      currentStock,
      allocatedStock: editingItem?.allocatedStock || 0,
      inPartnersCustodyStock: editingItem?.inPartnersCustodyStock || 0,
      minStock,
      costPrice,
      supplier,
      location,
      lastRestocked: new Date().toISOString().split('T')[0],
    };
    onSaveItem(itemToSave);
    setIsModalOpen(false);
  };

  const openMovementModal = (item: InventoryItem) => {
    setMovementItem(item);
    setMovementType('entrada_compra');
    setMovementQty(10);
    setMovementReason('');
    setMovementRefDoc('');
    setMovementError('');
  };

  const handleMovementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movementItem || !onCreateStockMovement) return;
    if (!movementReason || movementReason.trim().length < 5) {
      setMovementError('Informe uma justificativa auditável com ao menos 5 caracteres.');
      return;
    }
    if (movementType !== 'ajuste_inventario' && movementQty <= 0) {
      setMovementError('A quantidade deve ser maior que zero.');
      return;
    }
    if (movementType === 'ajuste_inventario' && movementQty < 0) {
      setMovementError('O saldo alvo do inventário não pode ser negativo.');
      return;
    }
    setMovementError('');
    setIsSubmittingMovement(true);
    const ok = await onCreateStockMovement({
      itemId: movementItem.id,
      type: movementType,
      quantity: movementQty,
      reason: movementReason.trim(),
      referenceDoc: movementRefDoc.trim() || undefined,
    });
    setIsSubmittingMovement(false);
    if (ok) {
      setMovementItem(null);
    }
  };

  // Filter items
  const filteredItems = inventory.filter((item) => {
    const matchesSearch = 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.supplier.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    const matchesLowStock = !onlyLowStock || item.currentStock <= item.minStock;

    return matchesSearch && matchesCategory && matchesLowStock;
  });

  const totalInventoryValuation = inventory.reduce(
    (sum, item) => sum + item.currentStock * item.costPrice,
    0
  );

  const lowStockCount = inventory.filter((item) => item.currentStock <= item.minStock).length;

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
            Controle de Estoque & Matéria-Prima
          </h1>
        </div>

        <button
          onClick={openNewModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 shadow-sm transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>+ Cadastrar Tecido / Insumo</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-slate-500 font-medium">Patrimônio em Estoque</div>
          <div className="text-xl font-bold font-mono text-slate-900 mt-1">
            {formatCurrencyBRL(totalInventoryValuation)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {inventory.length} matérias-primas e insumos cadastrados
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-slate-500 font-medium">Alertas de Reposição (Ponto de Pedido)</div>
          <div className="text-xl font-bold font-mono text-amber-600 mt-1">
            {lowStockCount} itens críticos
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Abaixo da margem mínima de segurança
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-slate-500 font-medium">Metragem Total de Rolos Têxteis</div>
          <div className="text-xl font-bold font-mono text-blue-700 mt-1">
            {inventory
              .filter((i) => i.unit === 'metros')
              .reduce((s, i) => s + i.currentStock, 0)
              .toLocaleString('pt-BR')}{' '}
            <span className="text-xs font-normal text-slate-500">metros lineares</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Prontos para enfesto e corte
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex-1 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome, código ou fornecedor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="all">Todas as Categorias</option>
            <option value="tecido">Tecidos (Rolos)</option>
            <option value="aviamento">Aviamentos (Zíperes, Linhas, Faixas 3M)</option>
            <option value="insumo_personalizacao">Insumos de Estampa/Bordado</option>
            <option value="pronta_entrega">Uniformes Pronta-Entrega</option>
          </select>

          <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium px-2 py-1">
            <input
              type="checkbox"
              checked={onlyLowStock}
              onChange={(e) => setOnlyLowStock(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span>Apenas estoque crítico</span>
          </label>
        </div>

        <div className="text-slate-500 font-medium">
          Exibindo <span className="font-mono font-bold text-slate-800">{filteredItems.length}</span> itens
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
                <th className="py-3 px-4 text-right">Valor Físico</th>
                <th className="py-3 px-4">Fornecedor / Local</th>
                <th className="py-3 px-4 text-right">Movimentação / Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-400">
                    Nenhum item encontrado no almoxarifado.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isCritical = item.currentStock <= item.minStock;

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
                            Abaixo do mínimo
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 capitalize text-slate-600">
                        {item.category.replace('_', ' ')}
                      </td>
                      <td className="py-3 px-4 text-center font-mono">
                        <span className={`font-bold text-sm ${isCritical ? 'text-amber-700' : 'text-slate-900'}`}>
                          {item.currentStock.toLocaleString('pt-BR')}
                        </span>{' '}
                        <span className="text-[11px] text-slate-500">{item.unit}</span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-blue-700 font-semibold">
                        {(item.allocatedStock || 0).toLocaleString('pt-BR')} <span className="text-[10px] font-normal text-slate-400">{item.unit}</span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono">
                        <span className={`font-semibold ${(item.inPartnersCustodyStock || 0) > 0 ? 'text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded' : 'text-slate-400'}`}>
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
                        {formatCurrencyBRL(item.currentStock * item.costPrice)}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        <div>{item.supplier}</div>
                        <div className="text-[11px] text-slate-400">{item.location}</div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {onCreateStockMovement && (
                            <button
                              onClick={() => openMovementModal(item)}
                              className="px-2 py-1 text-[11px] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-blue-700 font-semibold cursor-pointer"
                              title="Registrar movimentação auditada (Compra, Corte, Remessa/Retorno Facção, Perda ou Ajuste)"
                            >
                              Movimentar
                            </button>
                          )}
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

      {/* Item Modal (Create/Edit) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Código do Insumo</label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Categoria</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="tecido">Tecido (Rolo)</option>
                    <option value="aviamento">Aviamento</option>
                    <option value="insumo_personalizacao">Insumo Estamparia/Bordado</option>
                    <option value="pronta_entrega">Pronta Entrega</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição Completa</label>
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
                  <label className="block font-semibold text-slate-700 mb-1">Unidade</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
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
                    {editingItem ? 'Saldo Físico (via Movimentação)' : 'Saldo Inicial'}
                  </label>
                  <input
                    type="number"
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
                    value={minStock}
                    onChange={(e) => setMinStock(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Custo Unitário (R$)</label>
                  <CurrencyInput
                    value={costPrice}
                    onChange={setCostPrice}
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fornecedor Principal</label>
                  <input
                    type="text"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                    placeholder="Ex: Santanense, Cedro, 3M"
                  />
                </div>
              </div>

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
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-500 cursor-pointer"
                >
                  Salvar
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
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
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
              <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-center">
                <div>
                  <span className="block text-[10px] text-slate-500">Físico Próprio</span>
                  <strong className="text-sm text-slate-900">{movementItem.currentStock} {movementItem.unit}</strong>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500">Alocado (OPs)</span>
                  <strong className="text-sm text-blue-700">{movementItem.allocatedStock || 0} {movementItem.unit}</strong>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500">Em Facções</span>
                  <strong className="text-sm text-indigo-700">{movementItem.inPartnersCustodyStock || 0} {movementItem.unit}</strong>
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
                    onChange={(e) => setMovementType(e.target.value as StockMovementType)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                  >
                    <option value="entrada_compra">Entrada de Compra (Fornecedor)</option>
                    <option value="saida_corte">Saída para Mesa de Corte</option>
                    <option value="remessa_parceiro">Remessa para Facção (Custódia 3º)</option>
                    <option value="retorno_parceiro">Retorno de Facção (Devolução)</option>
                    <option value="perda_tecnica">Perda Técnica / Retalho</option>
                    <option value="ajuste_inventario">Ajuste Compensatório de Inventário</option>
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

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Documento / Referência (NF, Romaneio ou OP)</label>
                <input
                  type="text"
                  value={movementRefDoc}
                  onChange={(e) => setMovementRefDoc(e.target.value)}
                  placeholder="Ex: NF-49201, ROM-FAC-08 ou OP-2026-001"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Motivo / Justificativa Auditável *</label>
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
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingMovement}
                  className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-500 disabled:opacity-60 cursor-pointer"
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
