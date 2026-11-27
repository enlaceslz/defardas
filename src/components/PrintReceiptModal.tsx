import React from 'react';
import { X, Printer, CheckCircle2, ShieldCheck } from 'lucide-react';
import { CompanyProfile, FinancialTransaction } from '../types/erp';
import { formatCurrencyBRL, formatDateBR } from '../utils/formatters';
import { DEFAULT_BRAND_LOGO_URL } from '../data/initialData';

interface PrintReceiptModalProps {
  transaction: FinancialTransaction;
  profile: CompanyProfile;
  onClose: () => void;
}

const PAYMENT_METHOD_LABELS: Record<FinancialTransaction['paymentMethod'], string> = {
  pix: 'PIX Instantâneo',
  boleto: 'Boleto Bancário',
  transferencia: 'Transferência Bancária (TED / DOC)',
  cartao: 'Cartão de Crédito / Débito',
};

const SUBTYPE_LABELS: Record<FinancialTransaction['subType'], string> = {
  entrada_pedido: 'Sinal de Entrada (50% — Liberação Fabril)',
  saldo_entrega: 'Saldo Final na Entrega do Pedido',
  compra_tecido: 'Aquisição de Tecidos / Aviamentos',
  servico_terceirizado: 'Prestação de Serviço de Facção / Bordado',
  despesa_geral: 'Despesa Operacional Geral',
};

export const PrintReceiptModal: React.FC<PrintReceiptModalProps> = ({
  transaction,
  profile,
  onClose,
}) => {
  const isReceber = transaction.type === 'receber';
  const receiptCode = `REC-${transaction.transactionNumber || transaction.id.slice(0, 8).toUpperCase()}`;
  const issuedAt = new Date().toLocaleDateString('pt-BR');
  const settlementDate = transaction.paidDate ? formatDateBR(transaction.paidDate) : issuedAt;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200">
        {/* Toolbar (hidden on print) */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#111113] text-white no-print">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">
              {isReceber ? 'Recibo Oficial de Recebimento' : 'Recibo / Comprovante de Pagamento'}
            </span>
            <span className="text-xs text-zinc-400 font-mono">[{receiptCode}]</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Salvar PDF (Ctrl+P)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              aria-label="Fechar recibo"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Body */}
        <div className="p-8 sm:p-10 space-y-6 text-slate-900 bg-white print-page text-sm">
          {/* Letterhead with Logo */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between border-b-2 border-[#111113] pb-5 gap-4">
            <div className="flex items-start gap-4">
              <div className="shrink-0 flex items-center justify-center bg-white border border-zinc-200 rounded-lg p-2 max-w-[140px] max-h-[72px]">
                <img
                  src={profile.logoUrl || DEFAULT_BRAND_LOGO_URL}
                  alt={`Logomarca ${profile.tradeName}`}
                  className="max-h-14 max-w-[124px] w-auto object-contain"
                />
              </div>
              <div>
                <div className="text-xl font-black tracking-tight text-slate-900">
                  {profile.tradeName}
                </div>
                <div className="text-xs text-slate-600 font-mono mt-0.5">
                  {profile.name} · CNPJ: {profile.cnpj} {profile.ie ? `· I.E.: ${profile.ie}` : ''}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {profile.address}
                  {profile.neighborhood ? ` - ${profile.neighborhood}` : ''}, {profile.city}/{profile.state} · CEP:{' '}
                  {profile.cep}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Telefone/WhatsApp: {profile.phone} · E-mail: {profile.email}
                </div>
              </div>
            </div>

            <div className="text-left sm:text-right shrink-0">
              <div className="text-xs uppercase font-bold text-slate-500 tracking-wider">
                {isReceber ? 'Recibo de Quitação' : 'Comprovante de Pagamento'}
              </div>
              <div className="text-xl font-black font-mono text-[#C8102E] mt-0.5">
                {receiptCode}
              </div>
              <div className="text-xs text-slate-600 mt-1 font-mono">
                Data da Liquidação: <span className="font-bold text-slate-900">{settlementDate}</span>
              </div>
            </div>
          </div>

          {/* Highlighted Amount Box */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 border-2 border-slate-200 rounded-xl p-5">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700">
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {transaction.status === 'pago'
                    ? 'Título Liquidado & Conferido'
                    : `Status: ${transaction.status.toUpperCase()}`}
                </span>
              </div>
              <div className="text-xs text-slate-600">
                Natureza:{' '}
                <span className="font-semibold text-slate-900">
                  {SUBTYPE_LABELS[transaction.subType] || transaction.subType}
                </span>
              </div>
              {transaction.referenceId && (
                <div className="text-xs text-slate-600">
                  Referência / Ordem de Produção:{' '}
                  <span className="font-mono font-bold text-blue-700">{transaction.referenceId}</span>
                </div>
              )}
            </div>

            <div className="text-left sm:text-right">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Valor {isReceber ? 'Recebido' : 'Pago'}
              </div>
              <div className="text-3xl font-black font-mono text-slate-900">
                {formatCurrencyBRL(transaction.amount)}
              </div>
            </div>
          </div>

          {/* Declaration Text */}
          <div className="border border-slate-200 rounded-xl p-5 space-y-3 leading-relaxed text-xs sm:text-sm text-slate-800">
            {isReceber ? (
              <p>
                Declaramos para os devidos fins que <strong>{profile.name}</strong> (CNPJ{' '}
                <span className="font-mono">{profile.cnpj}</span>) recebeu a importância de{' '}
                <strong className="font-mono">{formatCurrencyBRL(transaction.amount)}</strong>, liquidada via{' '}
                <strong>{PAYMENT_METHOD_LABELS[transaction.paymentMethod] || transaction.paymentMethod}</strong> em{' '}
                <strong className="font-mono">{settlementDate}</strong>, referente a:{' '}
                <strong>{transaction.description}</strong>
                {transaction.referenceId ? (
                  <>
                    {' '}
                    (vínculo operacional <span className="font-mono font-semibold">{transaction.referenceId}</span>)
                  </>
                ) : null}
                , dando plena e irrevogável quitação da parcela descrita neste instrumento.
              </p>
            ) : (
              <p>
                Declaramos para fins de controle financeiro e auditoria que <strong>{profile.name}</strong> (CNPJ{' '}
                <span className="font-mono">{profile.cnpj}</span>) efetuou o pagamento da importância de{' '}
                <strong className="font-mono">{formatCurrencyBRL(transaction.amount)}</strong>, via{' '}
                <strong>{PAYMENT_METHOD_LABELS[transaction.paymentMethod] || transaction.paymentMethod}</strong> em{' '}
                <strong className="font-mono">{settlementDate}</strong>, referente a:{' '}
                <strong>{transaction.description}</strong>
                {transaction.referenceId ? (
                  <>
                    {' '}
                    (vínculo operacional <span className="font-mono font-semibold">{transaction.referenceId}</span>)
                  </>
                ) : null}
                .
              </p>
            )}
          </div>

          {/* Audit & Banking Evidence Details */}
          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <div className="bg-slate-100 px-4 py-2 font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>Dados de Autenticação Bancária & Trilha de Auditoria</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 p-4">
              <div>
                <span className="text-slate-500 block">Nº do Título no ERP:</span>
                <span className="font-mono font-bold text-slate-900">
                  {transaction.transactionNumber || transaction.id}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Categoria Contábil:</span>
                <span className="font-semibold text-slate-900">{transaction.category}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Forma de Pagamento:</span>
                <span className="font-semibold text-slate-900">
                  {PAYMENT_METHOD_LABELS[transaction.paymentMethod] || transaction.paymentMethod}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Autenticação / Comprovante Bancário:</span>
                <span className="font-mono font-bold text-slate-900 break-all">
                  {transaction.receiptVoucherNumber || 'Não informado'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Data de Vencimento Original:</span>
                <span className="font-mono text-slate-800">{formatDateBR(transaction.dueDate)}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Conferido / Liquidado por:</span>
                <span className="font-semibold text-slate-900">
                  {transaction.confirmedByName || 'Controladoria Financeira'}
                </span>
              </div>
              {transaction.confirmationNotes && (
                <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                  <span className="text-slate-500 block">Observações de Conferência:</span>
                  <span className="text-slate-800">{transaction.confirmationNotes}</span>
                </div>
              )}
            </div>
          </div>

          {/* Place, Date & Signatures */}
          <div className="pt-4 space-y-8 text-xs">
            <div className="text-right text-slate-600 font-medium">
              {profile.city} — {profile.state}, {issuedAt}.
            </div>

            <div className="grid grid-cols-2 gap-12 text-center pt-6">
              <div>
                <div className="border-t border-slate-400 pt-2 font-bold text-slate-900">
                  {profile.name}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  CNPJ: {profile.cnpj} · Departamento Financeiro
                </div>
              </div>
              <div>
                <div className="border-t border-slate-400 pt-2 font-bold text-slate-900">
                  {isReceber ? 'Pagador / Cliente Responsável' : 'Favorecido / Parceiro Recebedor'}
                </div>
                <div className="text-[11px] text-slate-500">Assinatura / CPF ou CNPJ</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
