import React, { useState } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Search,
  CheckCircle,
  Clock,
  AlertTriangle,
  Trash2,
  RotateCcw,
  FileCheck2,
  ShieldAlert,
  Lock,
  X,
  Printer,
  Receipt,
  Handshake,
  Truck,
  MessageSquare,
} from 'lucide-react';
import {
  Client,
  CompanyProfile,
  FinancialTransaction,
  Partner,
  PartnerFinancialForecastResponse,
  ProductionOrder,
  Supplier,
} from '../types/erp';
import { formatCurrencyBRL, formatDateBR } from '../utils/formatters';
import { useAuth } from '../api/authContext';
import { PrintReceiptModal } from './PrintReceiptModal';
import { PrintReportModal } from './PrintReportModal';
import { CurrencyInput, DateInputBR } from './FormInputs';

interface FinancialViewProps {
  profile: CompanyProfile;
  transactions: FinancialTransaction[];
  orders?: ProductionOrder[];
  clients?: Client[];
  partners?: Partner[];
  suppliers?: Supplier[];
  partnerForecast?: PartnerFinancialForecastResponse | null;
  onSaveTransaction: (trx: FinancialTransaction) => void;
  onDeleteTransaction: (trxId: string) => void;
  onConfirmPaymentWithVoucher?: (
    trxId: string,
    voucherNumber: string,
    evidenceUrl: string,
    notes: string,
    paymentMethod?: FinancialTransaction['paymentMethod']
  ) => Promise<boolean> | void;
  onReverseTransaction?: (trxId: string, reason: string) => Promise<boolean> | void;
  onSendTransactionWhatsApp?: (trx: FinancialTransaction) => Promise<void> | void;
  onSendViaCentralWhatsApp?: (
    phone: string,
    recipientName: string,
    message: string
  ) => Promise<void> | void;
  onNavigateTab?: (tab: string) => void;
}

const SUBTYPE_LABELS: Record<FinancialTransaction['subType'], string> = {
  entrada_pedido: 'Sinal de Entrada (50%)',
  saldo_entrega: 'Saldo na Entrega',
  compra_tecido: 'Compra de Tecido / Aviamento',
  servico_terceirizado: 'Serviço de Facção / Terceiro',
  despesa_geral: 'Despesa Operacional Geral',
};

export const FinancialView: React.FC<FinancialViewProps> = ({
  profile,
  transactions,
  orders = [],
  clients = [],
  partners = [],
  suppliers = [],
  partnerForecast,
  onSaveTransaction,
  onDeleteTransaction,
  onConfirmPaymentWithVoucher,
  onReverseTransaction,
  onSendTransactionWhatsApp,
  onSendViaCentralWhatsApp,
  onNavigateTab,
}) => {
  const { user } = useAuth();
  const role = user?.role || '';

  const canViewFinance = ['admin', 'financeiro', 'gerente_comercial'].includes(role);
  const canCreate = ['admin', 'financeiro'].includes(role);
  const canConfirm = ['admin', 'financeiro'].includes(role);
  const canReverse = role === 'admin';
  const canDelete = role === 'admin';
  const canUseWhatsApp = ['admin', 'gerente_comercial', 'vendedor', 'financeiro'].includes(role);

  const [typeFilter, setTypeFilter] = useState<'all' | 'receber' | 'pagar'>('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'pendente' | 'atrasado' | 'pago' | 'estornado' | 'sinais_pendentes' | 'parceiros_cp' | 'fornecedores_cp'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Voucher Confirmation Modal
  const [selectedTrxForVoucher, setSelectedTrxForVoucher] = useState<FinancialTransaction | null>(null);
  const [voucherNumber, setVoucherNumber] = useState('');
  const [receiptEvidenceUrl, setReceiptEvidenceUrl] = useState('');
  const [voucherNotes, setVoucherNotes] = useState('');
  const [settlementMethod, setSettlementMethod] = useState<FinancialTransaction['paymentMethod']>('pix');
  const [voucherError, setVoucherError] = useState('');
  const [isConfirmingVoucher, setIsConfirmingVoucher] = useState(false);

  // Receipt Audit Inspection Modal
  const [inspectedTrx, setInspectedTrx] = useState<FinancialTransaction | null>(null);

  // Printable Receipt & Financial Report Modals
  const [receiptTrx, setReceiptTrx] = useState<FinancialTransaction | null>(null);
  const [isFinancialReportOpen, setIsFinancialReportOpen] = useState(false);

  // Reversal Modal (Estorno Compensatório)
  const [reversingTrx, setReversingTrx] = useState<FinancialTransaction | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalError, setReversalError] = useState('');
  const [isReversing, setIsReversing] = useState(false);

  // New Transaction Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [type, setType] = useState<'receber' | 'pagar'>('receber');
  const [subType, setSubType] = useState<FinancialTransaction['subType']>('entrada_pedido');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Venda de Uniformes');
  const [amount, setAmount] = useState(1500);
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<FinancialTransaction['paymentMethod']>('pix');
  const [linkedOrderId, setLinkedOrderId] = useState('');
  const [linkedPartnerId, setLinkedPartnerId] = useState('');
  const [linkedSupplierId, setLinkedSupplierId] = useState('');
  const [serviceReference, setServiceReference] = useState('');
  const [isProvision, setIsProvision] = useState(true);
  const [newTrxError, setNewTrxError] = useState('');

  if (!canViewFinance) {
    return (
      <div className="max-w-2xl mx-auto mt-10 bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3 shadow-xs">
        <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Acesso Restrito à Controladoria & Financeiro</h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          O perfil atual (<strong className="font-mono">{role || 'não autenticado'}</strong>) não possui permissão{' '}
          <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">finance:view</span>. Para confirmar sinais de 50%
          (Gate A.3.2) ou consultar o fluxo de caixa corporativo, acione a equipe Financeira ou um Administrador.
        </p>
      </div>
    );
  }

  const todayISO = new Date().toISOString().split('T')[0];

  // Normalização visual de vencidos (garante consistência mesmo antes de sincronização)
  const normalizedTransactions = transactions.map((t) =>
    t.status === 'pendente' && t.dueDate && t.dueDate < todayISO ? { ...t, status: 'atrasado' as const } : t
  );

  const filtered = normalizedTransactions.filter((t) => {
    const q = searchQuery.toLowerCase();
    const matchesType = typeFilter === 'all' || t.type === typeFilter;
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'sinais_pendentes'
          ? t.type === 'receber' && t.subType === 'entrada_pedido' && (t.status === 'pendente' || t.status === 'atrasado')
          : statusFilter === 'parceiros_cp'
            ? t.type === 'pagar' && t.subType === 'servico_terceirizado'
            : statusFilter === 'fornecedores_cp'
              ? t.type === 'pagar' && (Boolean(t.supplierId) || t.subType === 'compra_tecido')
              : t.status === statusFilter;
    const matchesSearch =
      t.description.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      (t.transactionNumber || '').toLowerCase().includes(q) ||
      (t.referenceId || '').toLowerCase().includes(q) ||
      (t.partnerName || '').toLowerCase().includes(q) ||
      (t.supplierName || '').toLowerCase().includes(q) ||
      (t.purchaseOrderNumber || '').toLowerCase().includes(q) ||
      (t.clientName || '').toLowerCase().includes(q) ||
      (t.serviceReference || '').toLowerCase().includes(q) ||
      (t.receiptVoucherNumber || '').toLowerCase().includes(q);
    return matchesType && matchesStatus && matchesSearch;
  });

  // KPIs corretos (incluindo vencidos, diferenciando caixa realizado vs projetado, e excluindo estornados)
  const activeTransactions = normalizedTransactions.filter((t) => t.status !== 'estornado');

  const totalReceivablesOpen = activeTransactions
    .filter((t) => t.type === 'receber' && (t.status === 'pendente' || t.status === 'atrasado'))
    .reduce((sum, t) => sum + t.amount, 0);

  const totalReceivablesOverdue = activeTransactions
    .filter((t) => t.type === 'receber' && t.status === 'atrasado')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalPayablesOpen = activeTransactions
    .filter((t) => t.type === 'pagar' && (t.status === 'pendente' || t.status === 'atrasado'))
    .reduce((sum, t) => sum + t.amount, 0);

  const totalPayablesOverdue = activeTransactions
    .filter((t) => t.type === 'pagar' && t.status === 'atrasado')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalReceived = activeTransactions
    .filter((t) => t.type === 'receber' && t.status === 'pago')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalPaidOut = activeTransactions
    .filter((t) => t.type === 'pagar' && t.status === 'pago')
    .reduce((sum, t) => sum + t.amount, 0);

  const realizedCashBalance = totalReceived - totalPaidOut;
  const projectedFinalBalance = realizedCashBalance + totalReceivablesOpen - totalPayablesOpen;

  const pendingDownpayments = activeTransactions.filter(
    (t) => t.type === 'receber' && t.subType === 'entrada_pedido' && (t.status === 'pendente' || t.status === 'atrasado')
  );
  const pendingDownpaymentsAmount = pendingDownpayments.reduce((sum, t) => sum + t.amount, 0);

  const handleTypeChange = (nextType: 'receber' | 'pagar') => {
    setType(nextType);
    if (nextType === 'receber') {
      setSubType('entrada_pedido');
      setCategory('Venda de Uniformes');
    } else {
      setSubType('compra_tecido');
      setCategory('Tecidos & Aviamentos');
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setNewTrxError('');

    if (!description.trim() || description.trim().length < 3) {
      setNewTrxError('Informe uma descrição com pelo menos 3 caracteres.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setNewTrxError('O valor do lançamento deve ser maior que zero.');
      return;
    }

    const linkedOrder = linkedOrderId ? orders.find((o) => o.id === linkedOrderId) : undefined;
    const linkedPartner =
      type === 'pagar' && subType === 'servico_terceirizado' && linkedPartnerId
        ? partners.find((p) => p.id === linkedPartnerId)
        : undefined;
    const linkedSupplier =
      type === 'pagar' && subType === 'compra_tecido' && linkedSupplierId
        ? suppliers.find((s) => s.id === linkedSupplierId)
        : undefined;

    const newTrx: FinancialTransaction = {
      id: `fin-${Date.now()}`,
      type,
      subType,
      productionOrderId: linkedOrder?.id,
      referenceId: linkedOrder?.orderNumber || linkedPartner?.code || linkedSupplier?.code,
      partnerId: linkedPartner?.id,
      partnerName: linkedPartner?.tradeName,
      supplierId: linkedSupplier?.id,
      supplierName: linkedSupplier?.tradeName,
      clientId: linkedOrder?.clientId,
      clientName: linkedOrder?.clientName,
      serviceReference:
        type === 'pagar' && subType === 'servico_terceirizado'
          ? serviceReference.trim() || undefined
          : undefined,
      isProvision: type === 'pagar' && subType === 'servico_terceirizado' ? isProvision : false,
      description: description.trim(),
      category: category.trim() || (type === 'receber' ? 'Venda de Uniformes' : 'Custos Operacionais'),
      amount: Math.round(amount * 100) / 100,
      dueDate,
      status: 'pendente',
      paymentMethod,
    };
    onSaveTransaction(newTrx);
    setIsModalOpen(false);
    setDescription('');
    setLinkedOrderId('');
    setLinkedPartnerId('');
    setLinkedSupplierId('');
    setServiceReference('');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="text-xs font-medium text-slate-500 flex items-center gap-2">
            <span>DE FARDAS</span>
            <span aria-hidden="true">/</span>
            <span>Controladoria</span>
            <span aria-hidden="true">/</span>
            <span className="text-slate-800 font-semibold">Fluxo de Caixa & Finanças</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Contas a Pagar & Receber da Confecção
          </h1>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            type="button"
            onClick={() => setIsFinancialReportOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span>Imprimir Relatório</span>
          </button>

          {canCreate && (
            <button
              onClick={() => {
                setNewTrxError('');
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#C8102E] rounded-lg hover:bg-[#A60D26] shadow-sm transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>+ Novo Lançamento</span>
            </button>
          )}
        </div>
      </div>

      {/* Gate A.3.2 Pending Downpayments Callout */}
      {pendingDownpayments.length > 0 && (
        <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-blue-950">
                {pendingDownpayments.length}{' '}
                {pendingDownpayments.length === 1 ? 'sinal de 50% aguardando confirmação' : 'sinais de 50% aguardando confirmação'} (Gate A.3.2)
              </div>
              <div className="text-blue-800 mt-0.5">
                Total retido para liberação de corte:{' '}
                <strong className="font-mono">{formatCurrencyBRL(pendingDownpaymentsAmount)}</strong>. Confirme com
                comprovante bancário real para destravar as OPs no PCP.
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              setTypeFilter('receber');
              setStatusFilter(statusFilter === 'sinais_pendentes' ? 'all' : 'sinais_pendentes');
            }}
            className="px-3 py-1.5 bg-[#111113] hover:bg-[#1E1E22] text-white font-semibold rounded-lg shrink-0 cursor-pointer transition-colors whitespace-nowrap"
          >
            {statusFilter === 'sinais_pendentes' ? 'Mostrar Todos' : 'Filtrar Sinais 50%'}
          </button>
        </div>
      )}

      {/* Partner Services Provision & Payment Forecast Callout */}
      {partnerForecast &&
        (partnerForecast.summary.totalContracted > 0 ||
          partnerForecast.summary.totalPendingCP > 0 ||
          partnerForecast.summary.totalUnbilledProvision > 0) && (
          <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <Handshake className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-indigo-950 flex flex-wrap items-center gap-2">
                  <span>Provisão &amp; Previsão de Pagamentos a Parceiros (CP)</span>
                  {partnerForecast.summary.nextPaymentDate && (
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-white text-indigo-800 border border-indigo-200">
                      Próx. Previsão: {formatDateBR(partnerForecast.summary.nextPaymentDate)}
                    </span>
                  )}
                </div>
                <div className="text-indigo-900 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>
                    Já Pago:{' '}
                    <strong className="font-mono text-emerald-700">
                      {formatCurrencyBRL(partnerForecast.summary.totalPaid)}
                    </strong>
                  </span>
                  <span>
                    Restante CP Lançado:{' '}
                    <strong className="font-mono text-amber-800">
                      {formatCurrencyBRL(partnerForecast.summary.totalPendingCP)}
                    </strong>
                    {partnerForecast.summary.totalOverdueCP > 0 && (
                      <span className="text-rose-700 font-semibold">
                        {' '}({formatCurrencyBRL(partnerForecast.summary.totalOverdueCP)} venc.)
                      </span>
                    )}
                  </span>
                  <span>
                    A Provisionar (OPs sem CP):{' '}
                    <strong className="font-mono text-indigo-800">
                      {formatCurrencyBRL(partnerForecast.summary.totalUnbilledProvision)}
                    </strong>
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (statusFilter === 'parceiros_cp') {
                    setStatusFilter('all');
                    setTypeFilter('all');
                  } else {
                    setTypeFilter('pagar');
                    setStatusFilter('parceiros_cp');
                  }
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg cursor-pointer transition-colors"
              >
                {statusFilter === 'parceiros_cp' ? 'Mostrar Todos' : 'Filtrar Parceiros (CP)'}
              </button>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('partners')}
                  className="px-3 py-1.5 bg-white hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-semibold rounded-lg cursor-pointer transition-colors"
                >
                  Gerenciar Provisões &rarr;
                </button>
              )}
            </div>
          </div>
        )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-slate-500 font-medium flex items-center gap-1.5">
            <ArrowUpRight className="w-4 h-4 text-emerald-600" />
            <span>A Receber (Em Aberto)</span>
          </div>
          <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
            {formatCurrencyBRL(totalReceivablesOpen)}
          </div>
          <div className="text-[11px] mt-1">
            {totalReceivablesOverdue > 0 ? (
              <span className="text-rose-600 font-semibold">
                {formatCurrencyBRL(totalReceivablesOverdue)} vencido(s)
              </span>
            ) : (
              <span className="text-slate-400">Nenhum recebível em atraso</span>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-slate-500 font-medium flex items-center gap-1.5">
            <ArrowDownRight className="w-4 h-4 text-rose-600" />
            <span>A Pagar (Tecidos & Facções)</span>
          </div>
          <div className="text-xl font-bold font-mono text-rose-700 mt-1">
            {formatCurrencyBRL(totalPayablesOpen)}
          </div>
          <div className="text-[11px] mt-1">
            {totalPayablesOverdue > 0 ? (
              <span className="text-rose-600 font-semibold">
                {formatCurrencyBRL(totalPayablesOverdue)} vencido(s)
              </span>
            ) : (
              <span className="text-slate-400">Obrigações em dia</span>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-slate-500 font-medium flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>Caixa Realizado Líquido</span>
          </div>
          <div className={`text-xl font-bold font-mono mt-1 ${realizedCashBalance >= 0 ? 'text-slate-900' : 'text-rose-700'}`}>
            {formatCurrencyBRL(realizedCashBalance)}
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-1 flex items-center justify-between">
            <span className="text-emerald-700">+{formatCurrencyBRL(totalReceived)}</span>
            <span className="text-rose-600">−{formatCurrencyBRL(totalPaidOut)}</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-slate-500 font-medium flex items-center gap-1.5">
            <Wallet className="w-4 h-4 text-blue-600" />
            <span>Saldo Projetado Final</span>
          </div>
          <div className={`text-xl font-bold font-mono mt-1 ${projectedFinalBalance >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>
            {formatCurrencyBRL(projectedFinalBalance)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Caixa realizado + receber − pagar
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex-1 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por descrição, nº título, OP ou comprovante..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1 rounded text-xs font-medium cursor-pointer ${
                typeFilter === 'all' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setTypeFilter('receber')}
              className={`px-3 py-1 rounded text-xs font-medium cursor-pointer ${
                typeFilter === 'receber' ? 'bg-white text-emerald-700 shadow-xs font-semibold' : 'text-slate-600'
              }`}
            >
              A Receber
            </button>
            <button
              onClick={() => setTypeFilter('pagar')}
              className={`px-3 py-1 rounded text-xs font-medium cursor-pointer ${
                typeFilter === 'pagar' ? 'bg-white text-rose-700 shadow-xs font-semibold' : 'text-slate-600'
              }`}
            >
              A Pagar
            </button>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700"
          >
            <option value="all">Todos os Status</option>
            <option value="sinais_pendentes">Sinais 50% Pendentes (Gate A.3.2)</option>
            <option value="parceiros_cp">Serviços de Parceiros / Facções (CP)</option>
            <option value="fornecedores_cp">Fornecedores / Compras de Insumos (CP)</option>
            <option value="pendente">Pendente (A vencer)</option>
            <option value="atrasado">Atrasado (Vencido)</option>
            <option value="pago">Liquidado / Pago</option>
            <option value="estornado">Estornado (Auditoria)</option>
          </select>

          <button
            type="button"
            onClick={() => {
              if (statusFilter === 'fornecedores_cp') {
                setStatusFilter('all');
                setTypeFilter('all');
              } else {
                setTypeFilter('pagar');
                setStatusFilter('fornecedores_cp');
              }
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === 'fornecedores_cp'
                ? 'bg-cyan-600 text-white border-cyan-600'
                : 'bg-cyan-50 text-cyan-800 border-cyan-200 hover:bg-cyan-100'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Fornecedores (CP)</span>
          </button>
        </div>

        <div className="text-slate-500 font-medium">
          Mostrando <span className="font-mono font-bold text-slate-800">{filtered.length}</span> lançamentos
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4">Descrição / Vínculo</th>
                <th className="py-3 px-4">Natureza</th>
                <th className="py-3 px-4">Vencimento</th>
                <th className="py-3 px-4">Forma</th>
                <th className="py-3 px-4 text-right">Valor (R$)</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    Nenhum lançamento financeiro encontrado para os filtros aplicados.
                  </td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const isReceber = t.type === 'receber';
                  const isPaid = t.status === 'pago';
                  const isOverdue = t.status === 'atrasado';
                  const isReversed = t.status === 'estornado';

                  return (
                    <tr
                      key={t.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isReversed ? 'opacity-65 bg-slate-50/60' : isOverdue ? 'bg-rose-50/30' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        {isReceber ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            Receber
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                            <ArrowDownRight className="w-3.5 h-3.5" />
                            Pagar
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className={`font-bold text-slate-900 ${isReversed ? 'line-through text-slate-500' : ''}`}>
                          {t.description}
                        </div>
                        {t.serviceReference && (
                          <div className="text-[11px] text-slate-600 mt-0.5">
                            Serviço: {t.serviceReference}
                          </div>
                        )}
                        <div className="text-[11px] text-slate-400 font-mono flex flex-wrap items-center gap-1.5 mt-1">
                          <span>{t.transactionNumber || t.id}</span>
                          {t.isProvision && !isPaid && !isReversed && (
                            <span className="font-sans font-bold text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                              PROVISÃO CP
                            </span>
                          )}
                          {t.partnerName && (
                            <span className="font-sans font-semibold text-purple-800 bg-purple-50 px-1.5 rounded border border-purple-100">
                              Parceiro: {t.partnerName}
                            </span>
                          )}
                          {t.supplierName && (
                            <button
                              type="button"
                              onClick={() => onNavigateTab && onNavigateTab('suppliers')}
                              className="font-sans font-semibold text-cyan-800 bg-cyan-50 hover:bg-cyan-100 px-1.5 rounded border border-cyan-200 cursor-pointer"
                              title="Abrir módulo de Fornecedores & Compras"
                            >
                              Fornecedor: {t.supplierName}
                            </button>
                          )}
                          {t.purchaseOrderNumber && (
                            <button
                              type="button"
                              onClick={() => onNavigateTab && onNavigateTab('suppliers')}
                              className="font-mono font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 px-1.5 rounded border border-teal-200 cursor-pointer"
                              title="Ver Pedido de Compra vinculado"
                            >
                              {t.purchaseOrderNumber}
                            </button>
                          )}
                          {t.clientName && (
                            <span className="font-sans font-semibold text-slate-700 bg-slate-100 px-1.5 rounded border border-slate-200">
                              Cliente: {t.clientName}
                            </span>
                          )}
                          {(t.orderNumber || t.referenceId) && (
                            <span className="text-blue-700 bg-blue-50 px-1.5 rounded border border-blue-100">
                              Ref: {t.orderNumber || t.referenceId}
                            </span>
                          )}
                          {t.receiptVoucherNumber && (
                            <span className="text-emerald-700">Comprovante: {t.receiptVoucherNumber}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-700 font-medium">{SUBTYPE_LABELS[t.subType] || t.subType}</div>
                        <div className="text-[11px] text-slate-400">{t.category}</div>
                      </td>
                      <td className={`py-3 px-4 font-mono ${isOverdue ? 'text-rose-700 font-bold' : 'text-slate-700'}`}>
                        <div>{formatDateBR(t.dueDate)}</div>
                        {t.paidDate && (
                          <div className="text-[10px] text-emerald-700">Pago: {formatDateBR(t.paidDate)}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 uppercase text-slate-500 font-mono text-[11px]">
                        {t.paymentMethod}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm">
                        <span
                          className={
                            isReversed
                              ? 'line-through text-slate-400'
                              : isReceber
                                ? 'text-emerald-700'
                                : 'text-slate-900'
                          }
                        >
                          {formatCurrencyBRL(t.amount)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isPaid ? (
                          <button
                            type="button"
                            onClick={() => setInspectedTrx(t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 cursor-pointer transition-colors"
                            title="Clique para inspecionar comprovante e auditoria da baixa"
                          >
                            <CheckCircle className="w-3 h-3" />
                            <span>Liquidado</span>
                          </button>
                        ) : isReversed ? (
                          <button
                            type="button"
                            onClick={() => setInspectedTrx(t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer transition-colors"
                            title="Título estornado — clique para ver justificativa na trilha de auditoria"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Estornado</span>
                          </button>
                        ) : canConfirm ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTrxForVoucher(t);
                              setVoucherNumber('');
                              setReceiptEvidenceUrl('');
                              setVoucherNotes('');
                              setSettlementMethod(t.paymentMethod || 'pix');
                              setVoucherError('');
                            }}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                              isOverdue
                                ? 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                                : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                            }`}
                            title="Clique para anexar comprovante bancário e liquidar"
                          >
                            {isOverdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            <span>{isOverdue ? 'Atrasado · Baixar' : 'Pendente · Baixar'}</span>
                          </button>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold ${
                              isOverdue ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {isOverdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            <span>{isOverdue ? 'Atrasado' : 'Pendente'}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          {canUseWhatsApp &&
                            onSendTransactionWhatsApp &&
                            t.type === 'receber' &&
                            !isReversed &&
                            (!isPaid || t.subType === 'entrada_pedido') && (
                              <button
                                type="button"
                                onClick={() => onSendTransactionWhatsApp(t)}
                                className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded cursor-pointer"
                                title={
                                  isPaid
                                    ? 'Enviar confirmação de sinal recebido via WhatsApp'
                                    : 'Enviar lembrete de pagamento / PIX via WhatsApp'
                                }
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>
                            )}

                          {isPaid && (
                            <button
                              type="button"
                              onClick={() => setReceiptTrx(t)}
                              className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded cursor-pointer"
                              title="Emitir e imprimir recibo oficial"
                            >
                              <Receipt className="w-4 h-4" />
                            </button>
                          )}

                          {(isPaid || isReversed) && (
                            <button
                              type="button"
                              onClick={() => setInspectedTrx(t)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 rounded cursor-pointer"
                              title="Ver detalhes do comprovante e auditoria"
                            >
                              <FileCheck2 className="w-4 h-4" />
                            </button>
                          )}

                          {isPaid && canReverse && onReverseTransaction && (
                            <button
                              type="button"
                              onClick={() => {
                                setReversingTrx(t);
                                setReversalReason('');
                                setReversalError('');
                              }}
                              className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded cursor-pointer"
                              title="Estorno compensatório (Admin)"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}

                          {!isPaid && !isReversed && canDelete && (
                            <button
                              type="button"
                              onClick={() => onDeleteTransaction(t.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                              title="Excluir lançamento pendente"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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

      {/* New Transaction Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 bg-[#111113] text-white">
              <h3 className="text-base font-bold">Novo Lançamento Financeiro</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4 text-xs">
              {newTrxError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg font-medium">
                  {newTrxError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tipo *</label>
                  <select
                    value={type}
                    onChange={(e) => handleTypeChange(e.target.value as 'receber' | 'pagar')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="receber">A Receber (Entrada)</option>
                    <option value="pagar">A Pagar (Saída)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Valor (R$) *</label>
                  <CurrencyInput
                    required
                    min={0}
                    value={amount}
                    onChange={setAmount}
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Natureza / Subtipo *</label>
                <select
                  value={subType}
                  onChange={(e) => setSubType(e.target.value as FinancialTransaction['subType'])}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {type === 'receber' ? (
                    <>
                      <option value="entrada_pedido">Sinal de Entrada (50% - Gate A.3.2)</option>
                      <option value="saldo_entrega">Saldo na Entrega (50%)</option>
                    </>
                  ) : (
                    <>
                      <option value="compra_tecido">Compra de Tecido / Aviamentos</option>
                      <option value="servico_terceirizado">Serviço de Facção / Bordado Terceirizado</option>
                      <option value="despesa_geral">Despesa Operacional Geral</option>
                    </>
                  )}
                </select>
              </div>

              {type === 'pagar' && subType === 'compra_tecido' && suppliers.length > 0 && (
                <div className="p-3 bg-cyan-50/70 border border-cyan-200 rounded-lg space-y-2">
                  <label className="block font-semibold text-cyan-950">
                    Fornecedor de Matéria-Prima (Opcional)
                  </label>
                  <select
                    value={linkedSupplierId}
                    onChange={(e) => {
                      const sid = e.target.value;
                      setLinkedSupplierId(sid);
                      const sup = suppliers.find((s) => s.id === sid);
                      if (sup) {
                        setCategory(`Compra de Insumos (${sup.tradeName})`);
                        if (sup.pixKey) setPaymentMethod('pix');
                        if (!description.trim()) {
                          setDescription(`Compra de Insumos — ${sup.tradeName}`);
                        }
                      }
                    }}
                    className="w-full px-3 py-2 border border-cyan-200 rounded-lg bg-white text-slate-800"
                  >
                    <option value="">Selecione o fornecedor homologado</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        [{s.code}] {s.tradeName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {type === 'pagar' && subType === 'servico_terceirizado' && (
                <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-2.5">
                  <div>
                    <label className="block font-semibold text-indigo-950 mb-1">
                      Parceiro / Facção Terceirizada
                    </label>
                    <select
                      value={linkedPartnerId}
                      onChange={(e) => {
                        const pid = e.target.value;
                        setLinkedPartnerId(pid);
                        const p = partners.find((item) => item.id === pid);
                        if (p) {
                          setCategory(`Serviço Terceirizado (${p.tradeName})`);
                          if (p.pixKey) setPaymentMethod('pix');
                          const op = orders.find((o) => o.id === linkedOrderId);
                          if (!description.trim()) {
                            setDescription(
                              `Serviço Terceirizado (${p.tradeName})${op ? ` · ${op.orderNumber} · Cliente: ${op.clientName}` : ''}`
                            );
                          }
                        }
                      }}
                      className="w-full px-3 py-2 border border-indigo-200 rounded-lg bg-white text-slate-800"
                    >
                      <option value="">Selecione o parceiro (recomendado)</option>
                      {partners.map((p) => (
                        <option key={p.id} value={p.id}>
                          [{p.code}] {p.tradeName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-indigo-950 mb-1">
                      Referência do Serviço (Costura, Bordado, Silk, etc.)
                    </label>
                    <input
                      type="text"
                      value={serviceReference}
                      onChange={(e) => setServiceReference(e.target.value)}
                      placeholder="Ex: Facção de Costura — Camisas Polo (130 pçs)"
                      className="w-full px-3 py-2 border border-indigo-200 rounded-lg bg-white text-slate-900"
                    />
                  </div>

                  <label className="inline-flex items-center gap-2 cursor-pointer text-indigo-900">
                    <input
                      type="checkbox"
                      checked={isProvision}
                      onChange={(e) => setIsProvision(e.target.checked)}
                      className="rounded border-indigo-300 text-indigo-600"
                    />
                    <span className="font-semibold">Marcar como Provisão / Previsão de Pagamento (CP)</span>
                  </label>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição *</label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  placeholder="Ex: Pagamento Facção Costura Norte - Lote OP-2026-1001"
                />
              </div>

              {orders.length > 0 && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Vincular a Ordem de Produção / Cliente (Opcional)
                  </label>
                  <select
                    value={linkedOrderId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setLinkedOrderId(nextId);
                      const ord = orders.find((o) => o.id === nextId);
                      if (ord && type === 'pagar' && subType === 'servico_terceirizado') {
                        if (!serviceReference.trim()) {
                          setServiceReference(`${ord.itemTitle} (${ord.totalPieces} pçs)`);
                        }
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700"
                  >
                    <option value="">Sem vínculo direto com OP</option>
                    {orders.map((ord) => (
                      <option key={ord.id} value={ord.id}>
                        {ord.orderNumber || ord.id} — {ord.clientName} ({ord.itemTitle})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Categoria</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                    placeholder="Ex: Tecidos, Facções, Vendas"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Data de Vencimento *</label>
                  <DateInputBR
                    required
                    value={dueDate}
                    onChange={setDueDate}
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Forma de Pagamento</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as FinancialTransaction['paymentMethod'])}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="pix">PIX Instantâneo</option>
                  <option value="boleto">Boleto Bancário</option>
                  <option value="transferencia">Transferência TED / DOC</option>
                  <option value="cartao">Cartão de Crédito</option>
                </select>
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
                  className="px-5 py-2 bg-[#C8102E] text-white font-semibold rounded-lg hover:bg-[#A60D26] transition-colors cursor-pointer whitespace-nowrap"
                >
                  Lançar Título
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Quitação com Comprovante Bancário Auditável (PRD v1.6) */}
      {selectedTrxForVoucher && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 bg-[#111113] text-white">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-base font-bold">Liquidação com Comprovante</h3>
                  <p className="text-[11px] text-slate-400">Auditoria Financeira e Liberação de Sinal</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTrxForVoucher(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const cleanVoucher = voucherNumber.trim();
                const cleanUri = receiptEvidenceUrl.trim();
                if (cleanVoucher.length < 4) {
                  setVoucherError('Informe o código/autenticação real do comprovante bancário (mínimo 4 caracteres).');
                  return;
                }
                if (
                  !(
                    cleanUri.startsWith('https://') ||
                    cleanUri.startsWith('http://') ||
                    cleanUri.startsWith('s3://') ||
                    cleanUri.startsWith('/uploads/')
                  )
                ) {
                  setVoucherError('A evidência deve iniciar com https://, http://, s3:// ou /uploads/.');
                  return;
                }
                setVoucherError('');
                if (onConfirmPaymentWithVoucher) {
                  setIsConfirmingVoucher(true);
                  const result = await onConfirmPaymentWithVoucher(
                    selectedTrxForVoucher.id,
                    cleanVoucher,
                    cleanUri,
                    voucherNotes.trim(),
                    settlementMethod
                  );
                  setIsConfirmingVoucher(false);
                  if (result !== false) {
                    setSelectedTrxForVoucher(null);
                  }
                }
              }}
              className="p-6 space-y-4 text-xs"
            >
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-900">{selectedTrxForVoucher.description}</div>
                <div className="flex justify-between items-center text-slate-600 font-mono pt-1 border-t border-slate-200">
                  <span>Valor do Título:</span>
                  <span className="text-emerald-700 font-bold text-sm">
                    {formatCurrencyBRL(selectedTrxForVoucher.amount)}
                  </span>
                </div>
                {selectedTrxForVoucher.type === 'receber' && selectedTrxForVoucher.subType === 'entrada_pedido' && (
                  <div className="text-[11px] font-bold text-blue-700 pt-1">
                    ★ Este título é o sinal de 50%. A liquidação liberará o requisito financeiro do Portão Fabril (Gate A.3.2).
                  </div>
                )}
              </div>

              {voucherError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg font-medium">
                  {voucherError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Forma Efetiva da Liquidação</label>
                <select
                  value={settlementMethod}
                  onChange={(e) => setSettlementMethod(e.target.value as FinancialTransaction['paymentMethod'])}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                >
                  <option value="pix">PIX Instantâneo</option>
                  <option value="boleto">Boleto Bancário</option>
                  <option value="transferencia">Transferência TED / DOC</option>
                  <option value="cartao">Cartão de Crédito</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Número / Código do Comprovante Bancário *
                </label>
                <input
                  type="text"
                  required
                  value={voucherNumber}
                  onChange={(e) => setVoucherNumber(e.target.value)}
                  placeholder="Ex: AUT-PIX-849102 ou E2EID do extrato"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  URL ou Chave Privada (S3) da Evidência do Comprovante *
                </label>
                <input
                  type="text"
                  required
                  value={receiptEvidenceUrl}
                  onChange={(e) => setReceiptEvidenceUrl(e.target.value)}
                  placeholder="Ex: s3://defardas-docs/comprovantes/2026/pix-849102.pdf"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Notas de Conferência do Recebimento / Extrato
                </label>
                <textarea
                  rows={2}
                  value={voucherNotes}
                  onChange={(e) => setVoucherNotes(e.target.value)}
                  placeholder="Ex: Conferido no extrato bancário conta PJ DE FARDAS."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTrxForVoucher(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isConfirmingVoucher}
                  className="px-5 py-2 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-500 disabled:opacity-60 transition-colors shadow-xs cursor-pointer"
                >
                  {isConfirmingVoucher ? 'Validando...' : 'Confirmar e Liquidar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Inspeção do Comprovante & Trilha de Auditoria */}
      {inspectedTrx && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 bg-[#111113] text-white">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-[#E3263E]" />
                <div>
                  <h3 className="text-base font-bold">Evidência Financeira Auditável</h3>
                  <p className="text-[11px] text-slate-400 font-mono">{inspectedTrx.transactionNumber || inspectedTrx.id}</p>
                </div>
              </div>
              <button
                onClick={() => setInspectedTrx(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                <div className="font-bold text-slate-900">{inspectedTrx.description}</div>
                <div className="flex justify-between text-slate-600">
                  <span>Valor:</span>
                  <span className="font-mono font-bold text-slate-900">{formatCurrencyBRL(inspectedTrx.amount)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Status Atual:</span>
                  <span className="font-bold uppercase">{inspectedTrx.status}</span>
                </div>
                {inspectedTrx.paidDate && (
                  <div className="flex justify-between text-slate-600">
                    <span>Data da Liquidação:</span>
                    <span className="font-mono">{formatDateBR(inspectedTrx.paidDate)}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 block">Autenticação / Comprovante:</span>
                  <div className="font-mono font-bold text-slate-900 bg-slate-50 p-2 rounded border border-slate-200 break-all">
                    {inspectedTrx.receiptVoucherNumber || 'Não informado'}
                  </div>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 block">URI da Evidência (S3 / Storage):</span>
                  <div className="font-mono text-[11px] text-blue-800 bg-blue-50/60 p-2 rounded border border-blue-200 break-all">
                    {inspectedTrx.receiptEvidenceUrl || 'Não informada'}
                  </div>
                </div>
                {inspectedTrx.confirmedByName && (
                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 block">Conferido por:</span>
                    <div className="text-slate-800 font-medium">{inspectedTrx.confirmedByName}</div>
                  </div>
                )}
                {inspectedTrx.confirmationNotes && (
                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 block">Notas & Histórico de Estorno:</span>
                    <div className="text-slate-700 bg-slate-50 p-2 rounded border border-slate-200 leading-relaxed">
                      {inspectedTrx.confirmationNotes}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                {inspectedTrx.status === 'pago' && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = inspectedTrx;
                      setInspectedTrx(null);
                      setReceiptTrx(target);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-500 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Emitir Recibo</span>
                  </button>
                )}
                <button
                  onClick={() => setInspectedTrx(null)}
                  className="px-4 py-2 bg-[#111113] text-white font-semibold rounded-lg hover:bg-[#1E1E22] transition-colors cursor-pointer whitespace-nowrap"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Estorno Compensatório (Admin) */}
      {reversingTrx && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 bg-[#111113] text-white">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-base font-bold">Estorno Compensatório</h3>
                  <p className="text-[11px] text-slate-400 font-mono">{reversingTrx.transactionNumber || reversingTrx.id}</p>
                </div>
              </div>
              <button
                onClick={() => setReversingTrx(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (reversalReason.trim().length < 5) {
                  setReversalError('Informe a justificativa do estorno (mínimo 5 caracteres).');
                  return;
                }
                setReversalError('');
                if (onReverseTransaction) {
                  setIsReversing(true);
                  const ok = await onReverseTransaction(reversingTrx.id, reversalReason.trim());
                  setIsReversing(false);
                  if (ok !== false) {
                    setReversingTrx(null);
                  }
                }
              }}
              className="p-6 space-y-4 text-xs"
            >
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 leading-relaxed">
                <strong>Atenção:</strong> O título liquidado não é excluído — será marcado como{' '}
                <strong>ESTORNADO</strong> na trilha de auditoria. Se for um sinal de 50% vinculado a uma OP, o status
                financeiro e o Gate A.3.2 da OP serão recalculados automaticamente.
              </div>

              {reversalError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg font-medium">
                  {reversalError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Justificativa do Estorno *</label>
                <textarea
                  rows={3}
                  required
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="Ex: PIX devolvido pelo banco / baixa lançada no título incorreto."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReversingTrx(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isReversing}
                  className="px-5 py-2 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-500 disabled:opacity-60 cursor-pointer"
                >
                  {isReversing ? 'Estornando...' : 'Confirmar Estorno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Recibo Oficial Imprimível (com Logomarca da Empresa) */}
      {receiptTrx && (
        <PrintReceiptModal
          transaction={receiptTrx}
          profile={profile}
          onClose={() => setReceiptTrx(null)}
        />
      )}

      {/* Modal de Relatório Financeiro Imprimível (com Logomarca da Empresa) */}
      {isFinancialReportOpen && (
        <PrintReportModal
          mode="financial"
          profile={profile}
          transactions={filtered}
          clients={clients}
          partners={partners}
          suppliers={suppliers}
          filterSummary={`Tipo: ${typeFilter === 'all' ? 'Todos' : typeFilter === 'receber' ? 'A Receber' : 'A Pagar'} · Status: ${statusFilter}${searchQuery ? ` · Busca: "${searchQuery}"` : ''}`}
          generatedBy={user?.fullName}
          onSendViaCentralWhatsApp={onSendViaCentralWhatsApp}
          onClose={() => setIsFinancialReportOpen(false)}
        />
      )}
    </div>
  );
};
