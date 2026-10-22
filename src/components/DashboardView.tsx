import React from 'react';
import { 
  Factory, 
  DollarSign, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  ChevronRight, 
  Scissors, 
  Sparkles, 
  Truck, 
  Plus, 
  FileText, 
  Boxes, 
  Shirt, 
  Calendar,
  ShieldAlert,
  ShieldCheck,
  Building2
} from 'lucide-react';
import { ProductionOrder, Quote, InventoryItem, OperationalStage } from '../types/erp';
import { formatCurrencyBRL, formatDateBR, getStageLabel, getPriorityBadge } from '../utils/formatters';

interface DashboardViewProps {
  orders: ProductionOrder[];
  quotes: Quote[];
  inventory: InventoryItem[];
  onSelectTab: (tab: string) => void;
  onOpenNewOrderModal: () => void;
  onOpenNewQuoteModal: () => void;
  onSelectOrderForTicket: (order: ProductionOrder) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  orders,
  quotes,
  inventory,
  onSelectTab,
  onOpenNewOrderModal,
  onOpenNewQuoteModal,
  onSelectOrderForTicket,
}) => {
  // Calculations
  const activeOrders = orders.filter((o) => o.stage !== 'entregue');
  const blockedOrders = orders.filter((o) => !o.canStartProduction && o.stage !== 'entregue');
  const totalPiecesInProduction = activeOrders.reduce((sum, o) => sum + o.totalPieces, 0);

  const lowStockItems = inventory.filter((item) => item.currentStock <= item.minStock);

  const pendingQuotes = quotes.filter((q) => q.status === 'enviado' || q.status === 'aprovado');
  const totalPendingQuotesAmount = pendingQuotes.reduce((sum, q) => sum + q.totalAmount, 0);

  // Stage piece counts
  const stageCounts: Record<OperationalStage, { ordersCount: number; piecesCount: number }> = {
    aguardando_liberacao: { ordersCount: 0, piecesCount: 0 },
    corte: { ordersCount: 0, piecesCount: 0 },
    bordado_silk: { ordersCount: 0, piecesCount: 0 },
    costura: { ordersCount: 0, piecesCount: 0 },
    conferencia_qualidade: { ordersCount: 0, piecesCount: 0 },
    retrabalho: { ordersCount: 0, piecesCount: 0 },
    expedicao: { ordersCount: 0, piecesCount: 0 },
    entregue: { ordersCount: 0, piecesCount: 0 },
  };

  orders.forEach((o) => {
    if (stageCounts[o.stage]) {
      stageCounts[o.stage].ordersCount += 1;
      stageCounts[o.stage].piecesCount += o.totalPieces;
    }
  });

  const sortedUpcomingOrders = [...activeOrders].sort((a, b) => 
    new Date(a.targetDeliveryDate).getTime() - new Date(b.targetDeliveryDate).getTime()
  );

  return (
    <div className="space-y-8">
      {/* Top Breadcrumb & Quick Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="text-xs font-medium text-slate-500 flex items-center gap-2">
            <span>DE FARDAS</span>
            <span aria-hidden="true">/</span>
            <span>São Luís — MA</span>
            <span aria-hidden="true">/</span>
            <span className="text-slate-800 font-semibold">Painel Geral da Fábrica (PRD v1.6)</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Visão Geral Operacional & Comercial
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenNewQuoteModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>+ Novo Orçamento</span>
          </button>
          <button
            onClick={onOpenNewOrderModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Nova Ordem de Produção</span>
          </button>
        </div>
      </div>

      {/* PRD Gate Alert Banner if any orders are blocked */}
      {blockedOrders.length > 0 && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <span className="font-bold text-rose-900 block">
                {blockedOrders.length} {blockedOrders.length === 1 ? 'Ordem de Produção Bloqueada' : 'Ordens de Produção Bloqueadas'} (PRD A.3.2)
              </span>
              <span className="text-rose-700">
                A produção no chão de fábrica só inicia após a confirmação do sinal de 50% e aprovação formal da arte.
              </span>
            </div>
          </div>
          <button
            onClick={() => onSelectTab('orders')}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg shrink-0 cursor-pointer"
          >
            Ver Bloqueios
          </button>
        </div>
      )}

      {/* 4 Core KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Peças em Produção */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Peças em Confecção Ativa</span>
            <Factory className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tracking-tight">
            {totalPiecesInProduction.toLocaleString('pt-BR')} <span className="text-sm font-normal text-slate-500">peças</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
            <span className="text-blue-700 font-semibold font-mono">{activeOrders.length}</span>
            <span>ordens ativas nas células</span>
          </div>
        </div>

        {/* Card 2: Carteira de Orçamentos */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Propostas Comerciais Ativas</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tracking-tight">
            {formatCurrencyBRL(totalPendingQuotesAmount)}
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
            <span className="text-emerald-700 font-semibold font-mono">{pendingQuotes.length}</span>
            <span>em negociação ou sinal pendente</span>
          </div>
        </div>

        {/* Card 3: Pontualidade */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Pontualidade de Entrega</span>
            <Clock className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tracking-tight">
            98.5%
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Padrão homologado cumprido</span>
          </div>
        </div>

        {/* Card 4: Insumos Críticos */}
        <div 
          onClick={() => onSelectTab('inventory')}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs cursor-pointer hover:border-amber-300 transition-colors"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Tecidos no Ponto de Pedido</span>
            <AlertTriangle className={`w-4 h-4 ${lowStockItems.length > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tracking-tight">
            {lowStockItems.length} <span className="text-sm font-normal text-slate-500">alertas</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            {lowStockItems.length > 0 ? (
              <span className="text-amber-700 font-medium">Repor rolos de tecido &rarr;</span>
            ) : (
              <span className="text-emerald-700 font-medium">Almoxarifado abastecido</span>
            )}
          </div>
        </div>

      </div>

      {/* Production Pipeline: Visual Flow across PRD stages */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Pipeline de Produção e Terceirização (PCP)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Etapas com rastreabilidade de facções e conferência final de qualidade DE FARDAS
            </p>
          </div>
          <button
            onClick={() => onSelectTab('orders')}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer self-start sm:self-auto"
          >
            <span>Ver quadro Kanban completo</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Pipeline Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-2">
          
          <div 
            onClick={() => onSelectTab('orders')} 
            className="p-4 rounded-lg bg-amber-50/60 border border-amber-200/80 hover:bg-amber-50 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-amber-900">
              <span>1. Corte & Enfesto</span>
              <Scissors className="w-3.5 h-3.5 text-amber-700" />
            </div>
            <div className="mt-3 text-xl font-bold text-slate-900 font-mono">
              {stageCounts.corte.piecesCount.toLocaleString('pt-BR')} <span className="text-xs font-medium text-slate-500">peças</span>
            </div>
            <div className="mt-1 text-[11px] text-amber-800">
              {stageCounts.corte.ordersCount} OPs em mesa
            </div>
          </div>

          <div 
            onClick={() => onSelectTab('orders')} 
            className="p-4 rounded-lg bg-indigo-50/60 border border-indigo-200/80 hover:bg-indigo-50 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-indigo-900">
              <span>2. Bordado & Silk</span>
              <Sparkles className="w-3.5 h-3.5 text-indigo-700" />
            </div>
            <div className="mt-3 text-xl font-bold text-slate-900 font-mono">
              {stageCounts.bordado_silk.piecesCount.toLocaleString('pt-BR')} <span className="text-xs font-medium text-slate-500">peças</span>
            </div>
            <div className="mt-1 text-[11px] text-indigo-800">
              {stageCounts.bordado_silk.ordersCount} OPs com parceiro
            </div>
          </div>

          <div 
            onClick={() => onSelectTab('orders')} 
            className="p-4 rounded-lg bg-blue-50/60 border border-blue-200/80 hover:bg-blue-50 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
              <span>3. Costura & Montagem</span>
              <Shirt className="w-3.5 h-3.5 text-blue-700" />
            </div>
            <div className="mt-3 text-xl font-bold text-slate-900 font-mono">
              {stageCounts.costura.piecesCount.toLocaleString('pt-BR')} <span className="text-xs font-medium text-slate-500">peças</span>
            </div>
            <div className="mt-1 text-[11px] text-blue-800">
              {stageCounts.costura.ordersCount} OPs em facção
            </div>
          </div>

          <div 
            onClick={() => onSelectTab('orders')} 
            className="p-4 rounded-lg bg-purple-50/60 border border-purple-200/80 hover:bg-purple-50 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-purple-900">
              <span>4. Inspeção Qualidade</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-700" />
            </div>
            <div className="mt-3 text-xl font-bold text-slate-900 font-mono">
              {stageCounts.conferencia_qualidade.piecesCount.toLocaleString('pt-BR')} <span className="text-xs font-medium text-slate-500">peças</span>
            </div>
            <div className="mt-1 text-[11px] text-purple-800">
              {stageCounts.conferencia_qualidade.ordersCount} OPs em revisão
            </div>
          </div>

          <div 
            onClick={() => onSelectTab('orders')} 
            className="p-4 rounded-lg bg-emerald-50/60 border border-emerald-200/80 hover:bg-emerald-50 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-900">
              <span>5. Embalagem & Envio</span>
              <Truck className="w-3.5 h-3.5 text-emerald-700" />
            </div>
            <div className="mt-3 text-xl font-bold text-slate-900 font-mono">
              {stageCounts.expedicao.piecesCount.toLocaleString('pt-BR')} <span className="text-xs font-medium text-slate-500">peças</span>
            </div>
            <div className="mt-1 text-[11px] text-emerald-800">
              {stageCounts.expedicao.ordersCount} OPs prontas
            </div>
          </div>

        </div>
      </div>

      {/* Upcoming Priority Orders */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Fila de Produção & Entregas da Semana
            </h2>
            <p className="text-xs text-slate-500">
              Ordenadas pela data de entrega compromissada com o cliente
            </p>
          </div>
          <button
            onClick={() => onSelectTab('orders')}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
          >
            Ver todas ({activeOrders.length})
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                <th className="py-2.5 px-3">Código OP</th>
                <th className="py-2.5 px-3">Cliente / Modelo</th>
                <th className="py-2.5 px-3 text-right">Qtd</th>
                <th className="py-2.5 px-3">Etapa Operacional</th>
                <th className="py-2.5 px-3">Sinal / Arte</th>
                <th className="py-2.5 px-3">Previsão</th>
                <th className="py-2.5 px-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedUpcomingOrders.slice(0, 5).map((order) => {
                const priority = getPriorityBadge(order.priority);
                return (
                  <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3 font-mono font-medium text-slate-900">
                      {order.id}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-800">{order.clientName}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-xs">{order.itemTitle}</div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                      {order.totalPieces} pçs
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                        {getStageLabel(order.stage)}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {order.canStartProduction ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          Liberado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          <ShieldAlert className="w-3 h-3" />
                          Bloqueado
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700">
                      {formatDateBR(order.targetDeliveryDate)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => onSelectOrderForTicket(order)}
                        className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors cursor-pointer"
                      >
                        Ficha Técnica
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
