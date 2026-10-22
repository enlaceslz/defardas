import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Columns3, 
  Table as TableIcon, 
  ChevronRight, 
  ChevronLeft, 
  Printer, 
  Edit3, 
  Trash2, 
  Clock, 
  CheckCircle2, 
  Scissors, 
  Sparkles, 
  Shirt, 
  Truck, 
  AlertTriangle,
  ShieldAlert,
  CheckCircle,
  FileCheck
} from 'lucide-react';
import { ProductionOrder, OperationalStage, PriorityLevel, UniformCategory } from '../types/erp';
import { formatDateBR, getStageLabel, getPriorityBadge, getFinancialStatusBadge, formatCurrencyBRL } from '../utils/formatters';

interface ProductionOrdersViewProps {
  orders: ProductionOrder[];
  onOpenNewOrderModal: () => void;
  onEditOrder: (order: ProductionOrder) => void;
  onDeleteOrder: (orderId: string) => void;
  onUpdateOrderStage: (orderId: string, nextStage: OperationalStage) => void;
  onOpenPrintTicket: (order: ProductionOrder) => void;
  onConfirmEntryPayment?: (orderId: string) => void;
  onApproveArt?: (orderId: string) => void;
}

export const ProductionOrdersView: React.FC<ProductionOrdersViewProps> = ({
  orders,
  onOpenNewOrderModal,
  onEditOrder,
  onDeleteOrder,
  onUpdateOrderStage,
  onOpenPrintTicket,
  onConfirmEntryPayment,
  onApproveArt,
}) => {
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<string>('all');

  const stagesList: { id: OperationalStage; label: string; icon: any; color: string }[] = [
    { id: 'aguardando_liberacao', label: '0. Bloqueado (Entrada/Arte)', icon: ShieldAlert, color: 'border-t-rose-500' },
    { id: 'corte', label: '1. Corte & Enfesto', icon: Scissors, color: 'border-t-amber-500' },
    { id: 'bordado_silk', label: '2. Bordado & Silk (Parceiro)', icon: Sparkles, color: 'border-t-indigo-500' },
    { id: 'costura', label: '3. Costura & Montagem', icon: Shirt, color: 'border-t-blue-500' },
    { id: 'conferencia_qualidade', label: '4. Inspeção de Qualidade', icon: CheckCircle2, color: 'border-t-purple-500' },
    { id: 'expedicao', label: '5. Embalagem & Envio', icon: Truck, color: 'border-t-emerald-500' },
    { id: 'entregue', label: 'Concluído / Entregue', icon: CheckCircle2, color: 'border-t-slate-400' },
  ];

  const getNextStage = (current: OperationalStage): OperationalStage | null => {
    switch (current) {
      case 'aguardando_liberacao': return 'corte';
      case 'corte': return 'bordado_silk';
      case 'bordado_silk': return 'costura';
      case 'costura': return 'conferencia_qualidade';
      case 'conferencia_qualidade': return 'expedicao';
      case 'retrabalho': return 'costura';
      case 'expedicao': return 'entregue';
      default: return null;
    }
  };

  const getPrevStage = (current: OperationalStage): OperationalStage | null => {
    switch (current) {
      case 'corte': return 'aguardando_liberacao';
      case 'bordado_silk': return 'corte';
      case 'costura': return 'bordado_silk';
      case 'conferencia_qualidade': return 'costura';
      case 'retrabalho': return 'conferencia_qualidade';
      case 'expedicao': return 'conferencia_qualidade';
      case 'entregue': return 'expedicao';
      default: return null;
    }
  };

  // Filter orders
  const filteredOrders = orders.filter((order) => {
    const matchesSearch = 
      order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.itemTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.fabricName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesPriority = priorityFilter === 'all' || order.priority === priorityFilter;
    const matchesStage = stageFilter === 'all' || order.stage === stageFilter;

    return matchesSearch && matchesPriority && matchesStage;
  });

  const totalActivePieces = filteredOrders
    .filter((o) => o.stage !== 'entregue')
    .reduce((sum, o) => sum + o.totalPieces, 0);

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="text-xs font-medium text-slate-500 flex items-center gap-2">
            <span>DE FARDAS</span>
            <span aria-hidden="true">/</span>
            <span>Chão de Fábrica & PCP</span>
            <span aria-hidden="true">/</span>
            <span className="text-slate-800 font-semibold">Ordens de Produção (PRD v1.6)</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Planejamento & Controle da Produção (PCP)
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center p-1 bg-slate-200 rounded-lg">
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>Quadro Kanban</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Tabela</span>
            </button>
          </div>

          <button
            onClick={onOpenNewOrderModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Nova OP</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex-1 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por cliente, OP ou modelo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700"
          >
            <option value="all">Todas as Prioridades</option>
            <option value="urgente">Urgente</option>
            <option value="alta">Alta</option>
            <option value="normal">Normal</option>
          </select>
        </div>

        <div className="text-slate-500 text-xs shrink-0 self-end md:self-auto font-medium">
          Mostrando <span className="font-mono font-bold text-slate-800">{filteredOrders.length}</span> ordens ·{' '}
          <span className="font-mono font-bold text-blue-700">{totalActivePieces.toLocaleString('pt-BR')}</span> peças ativas
        </div>
      </div>

      {/* Kanban Board View */}
      {viewMode === 'kanban' ? (
        <div className="overflow-x-auto pb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-3 min-w-[1400px]">
            {stagesList.map((stg) => {
              const stageOrders = filteredOrders.filter((o) => o.stage === stg.id);
              const stagePieces = stageOrders.reduce((sum, o) => sum + o.totalPieces, 0);
              const StageIcon = stg.icon;

              return (
                <div
                  key={stg.id}
                  className="bg-slate-100/60 border border-slate-200/90 rounded-xl flex flex-col shadow-2xs overflow-hidden"
                >
                  {/* Column Header */}
                  <div className="p-3 border-b border-slate-200 bg-white/90 rounded-t-lg flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-xs text-slate-800">
                      <StageIcon className="w-4 h-4 text-slate-600 shrink-0" />
                      <span className="truncate">{stg.label}</span>
                    </div>
                    <div className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
                      {stageOrders.length}
                    </div>
                  </div>

                  <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200/60 text-[11px] text-slate-500 font-mono flex items-center justify-between">
                    <span>Volume Total:</span>
                    <span className="font-bold text-slate-800">{stagePieces.toLocaleString('pt-BR')} pçs</span>
                  </div>

                  {/* Orders Cards Container */}
                  <div className="p-2 space-y-3 flex-1 min-h-[350px]">
                    {stageOrders.length === 0 ? (
                      <div className="h-28 flex items-center justify-center text-slate-400 text-xs border border-dashed border-slate-300/80 rounded-lg text-center p-2">
                        Sem ordens nesta etapa
                      </div>
                    ) : (
                      stageOrders.map((order) => {
                        const nextStage = getNextStage(order.stage);
                        const prevStage = getPrevStage(order.stage);
                        const priorityInfo = getPriorityBadge(order.priority);
                        const financialInfo = getFinancialStatusBadge(order.financialStatus);

                        // PRD Gate check
                        const isBlocked = !order.canStartProduction;

                        return (
                          <div
                            key={order.id}
                            className={`bg-white p-3.5 rounded-lg border shadow-xs hover:border-blue-400 hover:shadow-sm transition-all space-y-2.5 text-xs ${
                              isBlocked ? 'border-rose-300/90 bg-rose-50/20' : 'border-slate-200/90'
                            }`}
                          >
                            {/* Card Top: Code + Priority */}
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-bold text-slate-900 text-[11px]">
                                {order.id}
                              </span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${priorityInfo.bg} ${priorityInfo.text}`}>
                                {priorityInfo.label}
                              </span>
                            </div>

                            {/* Client & Title */}
                            <div>
                              <div className="font-bold text-slate-900 leading-tight">
                                {order.clientName}
                              </div>
                              <div className="text-[11px] text-slate-600 font-medium mt-0.5">
                                {order.itemTitle}
                              </div>
                            </div>

                            {/* Gate Alerts (PRD Rules) */}
                            {isBlocked && (
                              <div className="p-2 bg-rose-50 border border-rose-200 rounded text-[10px] text-rose-900 space-y-1">
                                <div className="font-bold flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                                  <span>Produção Bloqueada:</span>
                                </div>
                                {!order.entryPaymentConfirmed && (
                                  <div className="text-rose-700 flex justify-between items-center">
                                    <span>• Aguarda confirmação do sinal</span>
                                    {onConfirmEntryPayment && (
                                      <button
                                        onClick={() => onConfirmEntryPayment(order.id)}
                                        className="text-[9px] font-bold underline cursor-pointer text-rose-900"
                                      >
                                        Confirmar Sinal
                                      </button>
                                    )}
                                  </div>
                                )}
                                {!order.artApproved && (
                                  <div className="text-rose-700 flex justify-between items-center">
                                    <span>• Aguarda aprovação da arte</span>
                                    {onApproveArt && (
                                      <button
                                        onClick={() => onApproveArt(order.id)}
                                        className="text-[9px] font-bold underline cursor-pointer text-rose-900"
                                      >
                                        Aprovar Arte
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Outsourced Partner Tag if in stage 2 or 3 */}
                            {order.outsourcedPartner && (
                              <div className="text-[10px] bg-slate-50 border border-slate-200 p-1 rounded text-slate-600 truncate">
                                <strong>Parceiro:</strong> {order.outsourcedPartner}
                              </div>
                            )}

                            {/* Sizes & Total */}
                            <div className="bg-slate-50 p-1.5 rounded text-[10px] font-mono text-slate-600 flex justify-between">
                              <span>Total: <strong className="text-blue-700 text-xs">{order.totalPieces} pçs</strong></span>
                              <span className="text-slate-500">{order.fabricName.split(' ')[0]}</span>
                            </div>

                            {/* Delivery Date */}
                            <div className="flex items-center justify-between text-[11px] pt-1 text-slate-500">
                              <span className="flex items-center gap-1 font-mono">
                                <Clock className="w-3 h-3 text-slate-400" />
                                {formatDateBR(order.targetDeliveryDate)}
                              </span>
                              <button
                                onClick={() => onOpenPrintTicket(order)}
                                className="text-slate-500 hover:text-blue-600 p-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Imprimir Ficha de Produção Fabril"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Action Buttons: Stage Advance & Edit */}
                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1">
                                {prevStage && (
                                  <button
                                    onClick={() => onUpdateOrderStage(order.id, prevStage)}
                                    className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded cursor-pointer"
                                    title="Voltar etapa anterior"
                                  >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => onEditOrder(order)}
                                  className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer"
                                  title="Editar Ordem"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => onDeleteOrder(order.id)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer"
                                  title="Excluir Ordem"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {nextStage && (
                                <button
                                  onClick={() => {
                                    if (order.stage === 'aguardando_liberacao' && isBlocked) {
                                      alert('Atenção: Conforme o PRD v1.6, a produção só pode ser liberada após confirmação do recebimento da entrada e aprovação da arte.');
                                      return;
                                    }
                                    onUpdateOrderStage(order.id, nextStage);
                                  }}
                                  disabled={order.stage === 'aguardando_liberacao' && isBlocked}
                                  className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
                                    order.stage === 'aguardando_liberacao' && isBlocked
                                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                      : 'text-white bg-blue-600 hover:bg-blue-500 cursor-pointer'
                                  }`}
                                >
                                  <span>Avançar</span>
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              )}
                            </div>

                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Table View */
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-3 px-4">Código OP</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Modelo</th>
                  <th className="py-3 px-4 text-center">Grade (Total)</th>
                  <th className="py-3 px-4">Etapa Operacional</th>
                  <th className="py-3 px-4">Financeiro</th>
                  <th className="py-3 px-4">Parceiro Terceirizado</th>
                  <th className="py-3 px-4">Entrega</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((order) => {
                  const nextStage = getNextStage(order.stage);
                  const isBlocked = !order.canStartProduction;

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {order.id}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{order.clientName}</div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {order.itemTitle}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-blue-700">
                        {order.totalPieces} pçs
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2.5 py-1 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                          {getStageLabel(order.stage)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${
                          order.entryPaymentConfirmed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {order.entryPaymentConfirmed ? 'Sinal 50% Confirmado' : 'Entrada Pendente'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {order.outsourcedPartner || 'Produção Interna'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {formatDateBR(order.targetDeliveryDate)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onOpenPrintTicket(order)}
                            className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors cursor-pointer"
                          >
                            Ficha
                          </button>
                          {nextStage && (
                            <button
                              onClick={() => onUpdateOrderStage(order.id, nextStage)}
                              disabled={order.stage === 'aguardando_liberacao' && isBlocked}
                              className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
                                order.stage === 'aguardando_liberacao' && isBlocked
                                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                  : 'text-white bg-blue-600 hover:bg-blue-500 cursor-pointer'
                              }`}
                            >
                              Avançar
                            </button>
                          )}
                          <button
                            onClick={() => onEditOrder(order)}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteOrder(order.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
