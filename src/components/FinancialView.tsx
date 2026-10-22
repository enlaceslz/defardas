import React, { useState } from 'react';
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight, 
  Plus, 
  Search, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Trash2, 
  Calendar,
  X 
} from 'lucide-react';
import { FinancialTransaction } from '../types/erp';
import { formatCurrencyBRL, formatDateBR } from '../utils/formatters';

interface FinancialViewProps {
  transactions: FinancialTransaction[];
  onSaveTransaction: (trx: FinancialTransaction) => void;
  onDeleteTransaction: (trxId: string) => void;
  onToggleStatus: (trxId: string) => void;
}

export const FinancialView: React.FC<FinancialViewProps> = ({
  transactions,
  onSaveTransaction,
  onDeleteTransaction,
  onToggleStatus,
}) => {
  const [typeFilter, setTypeFilter] = useState<'all' | 'receber' | 'pagar'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pendente' | 'pago'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [type, setType] = useState<'receber' | 'pagar'>('receber');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Venda de Uniformes');
  const [amount, setAmount] = useState(1500);
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<FinancialTransaction['paymentMethod']>('boleto');

  const filtered = transactions.filter((t) => {
    const matchesType = typeFilter === 'all' || t.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesSearch = 
      t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesStatus && matchesSearch;
  });

  const totalReceivablesPending = transactions
    .filter((t) => t.type === 'receber' && t.status === 'pendente')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalPayablesPending = transactions
    .filter((t) => t.type === 'pagar' && t.status === 'pendente')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalReceived = transactions
    .filter((t) => t.type === 'receber' && t.status === 'pago')
    .reduce((sum, t) => sum + t.amount, 0);

  const projectedBalance = totalReceivablesPending - totalPayablesPending;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newTrx: FinancialTransaction = {
      id: `fin-${Date.now()}`,
      type,
      subType: type === 'receber' ? 'entrada_pedido' : 'compra_tecido',
      description,
      category,
      amount,
      dueDate,
      status: 'pendente',
      paymentMethod,
    };
    onSaveTransaction(newTrx);
    setIsModalOpen(false);
    setDescription('');
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

        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 shadow-sm transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>+ Novo Lançamento</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-slate-500 font-medium flex items-center gap-1.5">
            <ArrowUpRight className="w-4 h-4 text-emerald-600" />
            <span>A Receber (Faturamento Aberto)</span>
          </div>
          <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
            {formatCurrencyBRL(totalReceivablesPending)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Vendas faturadas a compensar
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-slate-500 font-medium flex items-center gap-1.5">
            <ArrowDownRight className="w-4 h-4 text-rose-600" />
            <span>A Pagar (Tecidos & Custos)</span>
          </div>
          <div className="text-xl font-bold font-mono text-rose-700 mt-1">
            {formatCurrencyBRL(totalPayablesPending)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Fornecedores e manutenção pendente
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-slate-500 font-medium flex items-center gap-1.5">
            <Wallet className="w-4 h-4 text-blue-600" />
            <span>Saldo Líquido Projetado</span>
          </div>
          <div className={`text-xl font-bold font-mono mt-1 ${projectedBalance >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>
            {formatCurrencyBRL(projectedBalance)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Previsão líquida de fechamento
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-slate-500 font-medium flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>Total Liquidado / Recebido</span>
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 mt-1">
            {formatCurrencyBRL(totalReceived)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Compensações do mês
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
              placeholder="Buscar por descrição ou categoria..."
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
            <option value="pendente">Pendente</option>
            <option value="pago">Liquidado / Pago</option>
          </select>
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
                <th className="py-3 px-4">Descrição do Lançamento</th>
                <th className="py-3 px-4">Categoria</th>
                <th className="py-3 px-4">Vencimento</th>
                <th className="py-3 px-4">Forma</th>
                <th className="py-3 px-4 text-right">Valor (R$)</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((t) => {
                const isReceber = t.type === 'receber';
                const isPaid = t.status === 'pago';

                return (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
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
                      <div className="font-bold text-slate-900">{t.description}</div>
                      {t.referenceId && (
                        <div className="text-[11px] text-slate-400 font-mono">Ref: {t.referenceId}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{t.category}</td>
                    <td className="py-3 px-4 font-mono text-slate-700">
                      {formatDateBR(t.dueDate)}
                    </td>
                    <td className="py-3 px-4 uppercase text-slate-500 font-mono text-[11px]">
                      {t.paymentMethod}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-sm">
                      <span className={isReceber ? 'text-emerald-700' : 'text-slate-900'}>
                        {formatCurrencyBRL(t.amount)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => onToggleStatus(t.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                          isPaid
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                        }`}
                        title="Clique para alternar status (Pendente / Pago)"
                      >
                        {isPaid ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        <span>{isPaid ? 'Liquidado' : 'Pendente'}</span>
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => onDeleteTransaction(t.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                        title="Excluir lançamento"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Transaction Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
              <h3 className="text-base font-bold">Novo Lançamento Financeiro</h3>
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
                  <label className="block font-semibold text-slate-700 mb-1">Tipo</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="receber">A Receber (Entrada)</option>
                    <option value="pagar">A Pagar (Saída)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição</label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  placeholder="Ex: Faturamento 50% Jalecos Hospital São Lucas"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Categoria</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                    placeholder="Ex: Tecidos, Vendas, Folha"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Data de Vencimento</label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Forma de Pagamento</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="boleto">Boleto Bancário</option>
                  <option value="pix">PIX Instantâneo</option>
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
                  className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-500 cursor-pointer"
                >
                  Lançar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
