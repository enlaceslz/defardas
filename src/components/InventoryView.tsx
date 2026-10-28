import { useSubmission } from '../api/useSubmission';
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
import { formatCurrencyBRL, formatDateBR } from '../utils/formatters';

interface InventoryViewProps {
  inventory: InventoryItem[];
  onSaveItem: (item: InventoryItem) => Promise<boolean>;
  onDeleteItem: (itemId: string) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  inventory,
  onSaveItem,
  onDeleteItem,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  // Modal for new/edit item
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

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

  const { submit, isSaving } = useSubmission();
  const handleFormSubmit = async (e: React.FormEvent) => {
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
    if (!(await submit(() => onSaveItem(itemToSave)))) return;
    setIsModalOpen(false);
  };

  // Adjust stock count quickly
  const handleQuickStockAdjustment = async (item: InventoryItem, delta: number) => {
    const updated: InventoryItem = {
      ...item,
      currentStock: Math.max(0, item.currentStock + delta),
      lastRestocked: new Date().toISOString().split('T')[0],
    };
    await submit(() => onSaveItem(updated));
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
                <th className="py-3 px-4 text-center">Saldo Atual</th>
                <th className="py-3 px-4 text-center">Estoque Mínimo</th>
                <th className="py-3 px-4 text-right">Custo Unitário</th>
                <th className="py-3 px-4 text-right">Valor Total</th>
                <th className="py-3 px-4">Fornecedor / Local</th>
                <th className="py-3 px-4 text-right">Ajuste Rápido / Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
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
                      <td className="py-3 px-4 text-center font-mono text-slate-500">
                        {item.minStock.toLocaleString('pt-BR')} {item.unit}
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
                          <button
                            onClick={() => handleQuickStockAdjustment(item, -10)}
                            className="px-1.5 py-0.5 text-[11px] bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-mono cursor-pointer"
                            title="Subtrair 10 unidades (Baixa)"
                          >
                            -10
                          </button>
                          <button
                            onClick={() => handleQuickStockAdjustment(item, 50)}
                            className="px-1.5 py-0.5 text-[11px] bg-blue-50 hover:bg-blue-100 rounded text-blue-700 font-mono font-semibold cursor-pointer"
                            title="Adicionar 50 unidades (Entrada de Rolo)"
                          >
                            +50
                          </button>
                          <button
                            onClick={() => openEditModal(item)}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                            title="Editar item"
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
                  <label className="block font-semibold text-slate-700 mb-1">Saldo Atual</label>
                  <input
                    type="number"
                    value={currentStock}
                    onChange={(e) => setCurrentStock(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
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
                  <input
                    type="number"
                    step="0.01"
                    value={costPrice}
                    onChange={(e) => setCostPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
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
                  disabled={isSaving}
                  className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-500 cursor-pointer"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
