import React, { useState } from 'react';
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
  Building2,
  TrendingUp,
  Percent,
  Layers,
  PieChart as PieIcon,
  BarChart3,
  ArrowUpRight,
  Filter
} from 'lucide-react';
import { ProductionOrder, Quote, InventoryItem, OperationalStage, UniformCategory } from '../types/erp';
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
  // Active filter tab for dashboard views
  const [dashboardTab, setDashboardTab] = useState<'all' | 'production' | 'commercial'>('all');

  // Core calculations
  const activeOrders = orders.filter((o) => o.stage !== 'entregue');
  const blockedOrders = orders.filter((o) => !o.canStartProduction && o.stage !== 'entregue');
  const totalPiecesInProduction = activeOrders.reduce((sum, o) => sum + o.totalPieces, 0);

  const lowStockItems = inventory.filter((item) => item.currentStock <= item.minStock);

  const pendingQuotes = quotes.filter((q) => q.status === 'enviado' || q.status === 'aprovado');
  const totalPendingQuotesAmount = pendingQuotes.reduce((sum, q) => sum + q.totalAmount, 0);
  const totalClosedQuotes = quotes.filter((q) => q.status === 'convertido_em_pedido' || q.status === 'aprovado').length;
  const conversionRate = quotes.length > 0 ? Math.round((totalClosedQuotes / quotes.length) * 100) : 75;

  // Capacity calculations (Company profile default: 5.000 pieces/month)
  const monthlyCapacity = 5000;
  const capacityUsedPercent = Math.min(100, Math.round((totalPiecesInProduction / monthlyCapacity) * 100));
  const capacityRemaining = Math.max(0, monthlyCapacity - totalPiecesInProduction);

  // Stage piece counts & order counts
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

  // Category distribution analysis
  const categoryStats: Record<string, { count: number; pieces: number; totalValue: number; color: string }> = {
    operacional: { count: 0, pieces: 0, totalValue: 0, color: 'bg-blue-500' },
    administrativo: { count: 0, pieces: 0, totalValue: 0, color: 'bg-indigo-500' },
    saude_branca: { count: 0, pieces: 0, totalValue: 0, color: 'bg-teal-500' },
    escolar: { count: 0, pieces: 0, totalValue: 0, color: 'bg-amber-500' },
    camisaria: { count: 0, pieces: 0, totalValue: 0, color: 'bg-purple-500' },
    seguranca_epi: { count: 0, pieces: 0, totalValue: 0, color: 'bg-rose-500' },
    outros: { count: 0, pieces: 0, totalValue: 0, color: 'bg-slate-500' },
  };

  const getCategoryGroup = (cat: UniformCategory): string => {
    if (['linha_operacional_pesada', 'brim_industrial'].includes(cat)) return 'operacional';
    if (['administrativo_executivo', 'social_alfaiataria'].includes(cat)) return 'administrativo';
    if (['linha_hospitalar_saude'].includes(cat)) return 'saude_branca';
    if (['linha_escolar'].includes(cat)) return 'escolar';
    if (['camisaria_fina_polo'].includes(cat)) return 'camisaria';
    if (['nr10_retardante_chama'].includes(cat)) return 'seguranca_epi';
    return 'outros';
  };

  orders.forEach((o) => {
    const grp = getCategoryGroup(o.category);
    const unitPrice = o.costBreakdown?.negotiatedUnitPrice || o.costBreakdown?.suggestedUnitPrice || 65;
    if (categoryStats[grp]) {
      categoryStats[grp].count += 1;
      categoryStats[grp].pieces += o.totalPieces;
      categoryStats[grp].totalValue += (unitPrice * o.totalPieces);
    }
  });

  const categoryLabels: Record<string, string> = {
    operacional: 'Operacional & Brim',
    administrativo: 'Administrativo & Social',
    saude_branca: 'Saúde & Hospitalar',
    escolar: 'Linha Escolar',
    camisaria: 'Polos & Camisaria',
    seguranca_epi: 'EPIs & NR-10',
    outros: 'Demais Linhas',
  };

  // Pricing analysis: Average Base Cost vs Suggested Price vs Negotiated Price
  let sumBaseCost = 0;
  let sumSuggestedPrice = 0;
  let sumNegotiatedPrice = 0;
  let pricedCount = 0;

  orders.forEach((o) => {
    if (o.costBreakdown && o.costBreakdown.calculatedBaseCost > 0) {
      sumBaseCost += o.costBreakdown.calculatedBaseCost;
      sumSuggestedPrice += o.costBreakdown.suggestedUnitPrice;
      sumNegotiatedPrice += (o.costBreakdown.negotiatedUnitPrice || o.costBreakdown.suggestedUnitPrice);
      pricedCount += 1;
    }
  });

  const avgBaseCost = pricedCount > 0 ? (sumBaseCost / pricedCount) : 48.50;
  const avgSuggestedPrice = pricedCount > 0 ? (sumSuggestedPrice / pricedCount) : 77.60;
  const avgNegotiatedPrice = pricedCount > 0 ? (sumNegotiatedPrice / pricedCount) : 76.20;
  const avgEstimatedMargin = avgNegotiatedPrice > 0 
    ? Math.round(((avgNegotiatedPrice - avgBaseCost) / avgNegotiatedPrice) * 100) 
    : 36;

  // Upcoming priority orders
  const sortedUpcomingOrders = [...activeOrders].sort((a, b) => 
    new Date(a.targetDeliveryDate).getTime() - new Date(b.targetDeliveryDate).getTime()
  );

  return (
    <div className="space-y-7">
      
      {/* Top Header Bar & View Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="text-xs font-medium text-slate-500 flex items-center gap-2">
            <span>DE FARDAS</span>
            <span aria-hidden="true" className="text-slate-300">/</span>
            <span>São Luís — Maranhão</span>
            <span aria-hidden="true" className="text-slate-300">/</span>
            <span className="text-slate-800 font-semibold">Painel Executivo da Fábrica</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Gestão Integrada de Produção & Vendas
          </h1>
        </div>

        {/* Action Controls & View Tabs */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Segmented Filter Buttons */}
          <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-lg text-xs font-medium text-slate-600">
            <button
              onClick={() => setDashboardTab('all')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                dashboardTab === 'all' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'hover:text-slate-900'
              }`}
            >
              Visão 360°
            </button>
            <button
              onClick={() => setDashboardTab('production')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                dashboardTab === 'production' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'hover:text-slate-900'
              }`}
            >
              PCP & Fábrica
            </button>
            <button
              onClick={() => setDashboardTab('commercial')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                dashboardTab === 'commercial' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'hover:text-slate-900'
              }`}
            >
              Comercial
            </button>
          </div>

          <button
            onClick={onOpenNewQuoteModal}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>+ Orçamento</span>
          </button>
          <button
            onClick={onOpenNewOrderModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Nova OP</span>
          </button>
        </div>
      </div>

      {/* PRD Gate Alert Banner if any orders are blocked */}
      {blockedOrders.length > 0 && (
        <div className="p-4 bg-gradient-to-r from-rose-50 to-amber-50/50 border border-rose-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-100 flex items-center justify-center shrink-0 text-rose-700">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-rose-900 block text-sm">
                {blockedOrders.length} {blockedOrders.length === 1 ? 'Ordem Aguardando Liberação' : 'Ordens Aguardando Liberação'} (Portão PRD A.3.2)
              </span>
              <span className="text-slate-600">
                A liberação para corte exige <strong>50% de entrada confirmada</strong> e <strong>aprovação formal do layout da arte</strong>.
              </span>
            </div>
          </div>
          <button
            onClick={() => onSelectTab('orders')}
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg shrink-0 cursor-pointer transition-colors shadow-xs"
          >
            Liberar no Kanban &rarr;
          </button>
        </div>
      )}

      {/* 4 Core KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Peças em Produção */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all group">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Peças em Confecção</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Factory className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tracking-tight">
            {totalPiecesInProduction.toLocaleString('pt-BR')} <span className="text-xs font-normal text-slate-500">pçs</span>
          </div>
          {/* Micro progress line */}
          <div className="mt-3 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div className="bg-blue-600 h-full rounded-full" style={{ width: `${Math.min(100, (activeOrders.length / 15) * 100)}%` }} />
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between font-mono">
            <span>{activeOrders.length} OPs ativas</span>
            <span className="text-blue-700 font-semibold">{totalPiecesInProduction > 0 ? `${Math.round(totalPiecesInProduction / Math.max(1, activeOrders.length))} pçs/méd` : '0'}</span>
          </div>
        </div>

        {/* Card 2: Carteira de Orçamentos */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all group">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Propostas Comerciais</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tracking-tight">
            {formatCurrencyBRL(totalPendingQuotesAmount)}
          </div>
          {/* Micro progress line */}
          <div className="mt-3 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${conversionRate}%` }} />
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between font-mono">
            <span>{pendingQuotes.length} orçamentos ativos</span>
            <span className="text-emerald-700 font-semibold">{conversionRate}% conv.</span>
          </div>
        </div>

        {/* Card 3: Capacidade Utilizada */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all group">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Ocupação da Fábrica</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tracking-tight">
            {capacityUsedPercent}% <span className="text-xs font-normal text-slate-500">da capacidade</span>
          </div>
          {/* Micro progress line */}
          <div className="mt-3 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full ${capacityUsedPercent > 85 ? 'bg-amber-500' : 'bg-indigo-600'}`}
              style={{ width: `${capacityUsedPercent}%` }} 
            />
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between font-mono">
            <span>{capacityRemaining.toLocaleString('pt-BR')} pçs livres</span>
            <span className="text-indigo-700 font-semibold">{monthlyCapacity.toLocaleString('pt-BR')} total</span>
          </div>
        </div>

        {/* Card 4: Insumos Críticos */}
        <div 
          onClick={() => onSelectTab('inventory')}
          className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs cursor-pointer hover:border-amber-300 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Estoque no Ponto de Pedido</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform ${
              lowStockItems.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
            }`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tracking-tight">
            {lowStockItems.length} <span className="text-xs font-normal text-slate-500">tecidos em alerta</span>
          </div>
          {/* Micro progress line */}
          <div className="mt-3 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full ${lowStockItems.length > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(100, lowStockItems.length * 25)}%` }} 
            />
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between font-mono">
            {lowStockItems.length > 0 ? (
              <span className="text-amber-700 font-semibold">Repor estoque agora &rarr;</span>
            ) : (
              <span className="text-emerald-700 font-semibold">Tecidoteca regular</span>
            )}
            <span>{inventory.length} itens</span>
          </div>
        </div>

      </div>

      {/* Visual Charts Row: Operational Cells + Category Distribution */}
      {(dashboardTab === 'all' || dashboardTab === 'production') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Chart 1: Visual Distribution across Factory Cells (2 cols) */}
          <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-600" />
                  Carga Operacional por Célula Fabril
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Volume de peças distribuído nas etapas internas e parceiros terceirizados
                </p>
              </div>
              <span className="text-xs font-mono font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
                Capacidade: 5.000 pçs/mês
              </span>
            </div>

            {/* Interactive Visual Bar Chart */}
            <div className="space-y-4 pt-1">
              {[
                { 
                  stage: 'corte', 
                  label: '1. Corte & Enfesto (Mesa)', 
                  pieces: stageCounts.corte.piecesCount, 
                  orders: stageCounts.corte.ordersCount, 
                  color: 'bg-amber-500', 
                  trackColor: 'bg-amber-50',
                  partner: 'Próprio'
                },
                { 
                  stage: 'bordado_silk', 
                  label: '2. Bordado & Silk-Screen', 
                  pieces: stageCounts.bordado_silk.piecesCount, 
                  orders: stageCounts.bordado_silk.ordersCount, 
                  color: 'bg-indigo-600', 
                  trackColor: 'bg-indigo-50',
                  partner: 'Parceiro Homologado'
                },
                { 
                  stage: 'costura', 
                  label: '3. Costura & Montagem', 
                  pieces: stageCounts.costura.piecesCount, 
                  orders: stageCounts.costura.ordersCount, 
                  color: 'bg-blue-600', 
                  trackColor: 'bg-blue-50',
                  partner: 'Facções Externas'
                },
                { 
                  stage: 'conferencia_qualidade', 
                  label: '4. Inspeção de Qualidade', 
                  pieces: stageCounts.conferencia_qualidade.piecesCount, 
                  orders: stageCounts.conferencia_qualidade.ordersCount, 
                  color: 'bg-purple-600', 
                  trackColor: 'bg-purple-50',
                  partner: 'Interno'
                },
                { 
                  stage: 'expedicao', 
                  label: '5. Embalagem & Expedição', 
                  pieces: stageCounts.expedicao.piecesCount, 
                  orders: stageCounts.expedicao.ordersCount, 
                  color: 'bg-emerald-600', 
                  trackColor: 'bg-emerald-50',
                  partner: 'Pronto para Entrega'
                },
              ].map((cell) => {
                const maxPiecesInCells = Math.max(1, ...[
                  stageCounts.corte.piecesCount,
                  stageCounts.bordado_silk.piecesCount,
                  stageCounts.costura.piecesCount,
                  stageCounts.conferencia_qualidade.piecesCount,
                  stageCounts.expedicao.piecesCount
                ]);
                const percent = Math.min(100, Math.round((cell.pieces / maxPiecesInCells) * 100));

                return (
                  <div key={cell.stage} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{cell.label}</span>
                        <span className="text-[10px] text-slate-400 font-mono px-1.5 py-0.2 bg-slate-100 rounded">
                          {cell.partner}
                        </span>
                      </div>
                      <div className="font-mono text-xs font-semibold text-slate-900 flex items-center gap-2">
                        <span>{cell.pieces.toLocaleString('pt-BR')} peças</span>
                        <span className="text-slate-400 font-normal">({cell.orders} OPs)</span>
                      </div>
                    </div>
                    {/* Visual Horizontal Bar */}
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                      <div 
                        className={`h-full ${cell.color} rounded-full transition-all duration-500`}
                        style={{ width: `${Math.max(5, percent)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Insight */}
            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg flex items-center justify-between text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Nenhuma célula em sobrecarga. Gargalo máximo atual em <strong>Costura</strong>.</span>
              </div>
              <button
                onClick={() => onSelectTab('orders')}
                className="font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                Abrir PCP &rarr;
              </button>
            </div>
          </div>

          {/* Chart 2: Category Distribution Breakdown (1 col) */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <PieIcon className="w-4 h-4 text-indigo-600" />
                  Mix por Linha de Uniforme
                </h2>
                <span className="text-[11px] font-mono text-slate-500">10 Categorias</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Participação de volume por segmento fabril
              </p>

              {/* Segmented Donut / Stacked Bar */}
              <div className="mt-4 pt-2 space-y-3">
                {Object.entries(categoryStats).map(([key, data]) => {
                  const sharePercent = totalPiecesInProduction > 0 
                    ? Math.round((data.pieces / totalPiecesInProduction) * 100) 
                    : 15;
                  
                  if (data.pieces === 0 && sharePercent === 0) return null;

                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${data.color}`} />
                          <span className="text-slate-700 font-medium">{categoryLabels[key] || key}</span>
                        </div>
                        <div className="font-mono text-xs font-semibold text-slate-900">
                          {sharePercent}% <span className="text-slate-400 font-normal">({data.pieces} pçs)</span>
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${data.color} rounded-full`} style={{ width: `${Math.max(4, sharePercent)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Total Value Summary Box */}
            <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-lg text-xs space-y-1 mt-4">
              <div className="text-indigo-900 font-semibold flex items-center justify-between">
                <span>Total em Produção:</span>
                <span className="font-mono font-bold text-indigo-950">
                  {formatCurrencyBRL(orders.reduce((sum, o) => sum + ((o.costBreakdown?.negotiatedUnitPrice || o.costBreakdown?.suggestedUnitPrice || 65) * o.totalPieces), 0))}
                </span>
              </div>
              <div className="text-[11px] text-indigo-700">
                Segmentos líderes: <strong>Operacional</strong> e <strong>Administrativo</strong>.
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Pricing & Commercial Health (Visible on 'all' or 'commercial') */}
      {(dashboardTab === 'all' || dashboardTab === 'commercial') && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Percent className="w-4 h-4 text-emerald-600" />
                Desempenho do Motor de Precificação & Markup (PRD Adendo B.2.1)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Custo-Base Transparente vs. Preço Sugerido com Markup Oficial ($k\%$) vs. Preço Negociado
              </p>
            </div>
            <button
              onClick={() => onSelectTab('quotes')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer self-start sm:self-auto"
            >
              <span>Ver todos os orçamentos</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            
            {/* Metric Column 1: Custo-Base Médio */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
              <span className="text-xs font-medium text-slate-500">Custo-Base Médio por Peça</span>
              <div className="text-2xl font-bold font-mono text-slate-900">
                {formatCurrencyBRL(avgBaseCost)}
              </div>
              <div className="text-[11px] text-slate-500">
                Inclui tecidos, aviamentos, facção terceirizada e perda técnica (3%).
              </div>
            </div>

            {/* Metric Column 2: Preço Sugerido */}
            <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200/90 space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-blue-900">
                <span>Preço Sugerido (Markup k=60%)</span>
                <span className="font-mono text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">Oficial</span>
              </div>
              <div className="text-2xl font-bold font-mono text-blue-950">
                {formatCurrencyBRL(avgSuggestedPrice)}
              </div>
              <div className="text-[11px] text-blue-800">
                Fórmula: Custo-Base × (1 + 60/100).
              </div>
            </div>

            {/* Metric Column 3: Preço Médio Negociado & Margem Efetiva */}
            <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200/90 space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-emerald-900">
                <span>Preço Médio Praticado</span>
                <span className="font-mono text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
                  {avgEstimatedMargin}% Margem
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-950">
                {formatCurrencyBRL(avgNegotiatedPrice)}
              </div>
              <div className="text-[11px] text-emerald-800">
                Margem gerencial estimada saudável e dentro da diretriz DE FARDAS.
              </div>
            </div>

          </div>
        </div>
      )}

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

        {/* Pipeline Steps with Modern Styling */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-1">
          
          <div 
            onClick={() => onSelectTab('orders')} 
            className="p-4 rounded-xl bg-gradient-to-b from-amber-50/70 to-amber-50/30 border border-amber-200/90 hover:border-amber-300 hover:shadow-xs transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-amber-900">
              <span>1. Corte & Enfesto</span>
              <Scissors className="w-4 h-4 text-amber-700 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-3 text-xl font-bold text-slate-900 font-mono">
              {stageCounts.corte.piecesCount.toLocaleString('pt-BR')} <span className="text-xs font-normal text-slate-500">peças</span>
            </div>
            <div className="mt-1 text-[11px] text-amber-800">
              {stageCounts.corte.ordersCount} OPs em mesa
            </div>
          </div>

          <div 
            onClick={() => onSelectTab('orders')} 
            className="p-4 rounded-xl bg-gradient-to-b from-indigo-50/70 to-indigo-50/30 border border-indigo-200/90 hover:border-indigo-300 hover:shadow-xs transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-indigo-900">
              <span>2. Bordado & Silk</span>
              <Sparkles className="w-4 h-4 text-indigo-700 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-3 text-xl font-bold text-slate-900 font-mono">
              {stageCounts.bordado_silk.piecesCount.toLocaleString('pt-BR')} <span className="text-xs font-normal text-slate-500">peças</span>
            </div>
            <div className="mt-1 text-[11px] text-indigo-800">
              {stageCounts.bordado_silk.ordersCount} OPs com parceiro
            </div>
          </div>

          <div 
            onClick={() => onSelectTab('orders')} 
            className="p-4 rounded-xl bg-gradient-to-b from-blue-50/70 to-blue-50/30 border border-blue-200/90 hover:border-blue-300 hover:shadow-xs transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
              <span>3. Costura & Montagem</span>
              <Shirt className="w-4 h-4 text-blue-700 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-3 text-xl font-bold text-slate-900 font-mono">
              {stageCounts.costura.piecesCount.toLocaleString('pt-BR')} <span className="text-xs font-normal text-slate-500">peças</span>
            </div>
            <div className="mt-1 text-[11px] text-blue-800">
              {stageCounts.costura.ordersCount} OPs em facção
            </div>
          </div>

          <div 
            onClick={() => onSelectTab('orders')} 
            className="p-4 rounded-xl bg-gradient-to-b from-purple-50/70 to-purple-50/30 border border-purple-200/90 hover:border-purple-300 hover:shadow-xs transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-purple-900">
              <span>4. Inspeção Qualidade</span>
              <CheckCircle2 className="w-4 h-4 text-purple-700 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-3 text-xl font-bold text-slate-900 font-mono">
              {stageCounts.conferencia_qualidade.piecesCount.toLocaleString('pt-BR')} <span className="text-xs font-normal text-slate-500">peças</span>
            </div>
            <div className="mt-1 text-[11px] text-purple-800">
              {stageCounts.conferencia_qualidade.ordersCount} OPs em revisão
            </div>
          </div>

          <div 
            onClick={() => onSelectTab('orders')} 
            className="p-4 rounded-xl bg-gradient-to-b from-emerald-50/70 to-emerald-50/30 border border-emerald-200/90 hover:border-emerald-300 hover:shadow-xs transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-900">
              <span>5. Embalagem & Envio</span>
              <Truck className="w-4 h-4 text-emerald-700 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-3 text-xl font-bold text-slate-900 font-mono">
              {stageCounts.expedicao.piecesCount.toLocaleString('pt-BR')} <span className="text-xs font-normal text-slate-500">peças</span>
            </div>
            <div className="mt-1 text-[11px] text-emerald-800">
              {stageCounts.expedicao.ordersCount} OPs prontas
            </div>
          </div>

        </div>
      </div>

      {/* Upcoming Priority Orders Table */}
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
            Ver todas ({activeOrders.length}) &rarr;
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/60">
                <th className="py-2.5 px-3">Código OP</th>
                <th className="py-2.5 px-3">Cliente / Modelo</th>
                <th className="py-2.5 px-3 text-right">Qtd</th>
                <th className="py-2.5 px-3">Etapa Operacional</th>
                <th className="py-2.5 px-3">Portão PRD</th>
                <th className="py-2.5 px-3">Previsão</th>
                <th className="py-2.5 px-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedUpcomingOrders.slice(0, 5).map((order) => {
                const priority = getPriorityBadge(order.priority);
                return (
                  <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-slate-900">
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
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
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
