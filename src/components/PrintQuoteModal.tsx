import React from 'react';
import { X, Printer, CheckCircle, FileText, Download, ShieldCheck, MessageSquare } from 'lucide-react';
import { Quote, CompanyProfile } from '../types/erp';
import { formatCurrencyBRL, formatDateBR } from '../utils/formatters';

interface PrintQuoteModalProps {
  quote: Quote;
  profile: CompanyProfile;
  onClose: () => void;
  onApproveAndConvertToOrder?: (quote: Quote) => void;
}

export const PrintQuoteModal: React.FC<PrintQuoteModalProps> = ({
  quote,
  profile,
  onClose,
  onApproveAndConvertToOrder,
}) => {
  const handlePrint = () => {
    window.print();
  };

  const isConverted = quote.status === 'convertido_em_pedido';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200">
        
        {/* Modal Toolbar (hidden when printing) */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white no-print">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">Proposta Comercial Formal</span>
            <span className="text-xs text-slate-400 font-mono">[{quote.id} v{quote.version || 1}]</span>
          </div>
          <div className="flex items-center gap-3">
            {!isConverted && onApproveAndConvertToOrder && (
              <button
                onClick={() => onApproveAndConvertToOrder(quote)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Aprovar & Gerar OP (Idempotente)</span>
              </button>
            )}
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Salvar PDF (Ctrl+P)</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Proposal Content */}
        <div className="p-8 sm:p-10 space-y-6 text-slate-900 bg-white print-page text-sm">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between border-b-2 border-slate-900 pb-5 gap-4">
            <div>
              <div className="text-2xl font-black tracking-tight text-slate-900">
                {profile.tradeName}
              </div>
              <div className="text-xs text-slate-600 font-mono mt-0.5">
                {profile.name} · CNPJ: {profile.cnpj} · I.E.: {profile.ie}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {profile.address} - {profile.neighborhood}, {profile.city}/{profile.state} · CEP: {profile.cep}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Telefone/WhatsApp: {profile.phone} · E-mail: {profile.email}
              </div>
              <div className="text-[11px] text-blue-700 font-semibold mt-1">
                Fundada em {profile.foundedYear} · {profile.openingHours}
              </div>
            </div>

            <div className="text-left sm:text-right">
              <div className="text-xs uppercase font-bold text-slate-500 tracking-wider">
                Proposta Comercial de Fardamento
              </div>
              <div className="text-2xl font-black font-mono text-blue-700">
                {quote.id} <span className="text-xs text-slate-500">v{quote.version || 1}</span>
              </div>
              <div className="text-xs text-slate-600 mt-0.5 font-mono">
                Data: {formatDateBR(quote.date)} · Válido até: {formatDateBR(quote.validUntil)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Consultora Técnica: <span className="font-semibold text-slate-800">{quote.sellerName}</span>
              </div>
            </div>
          </div>

          {/* Client Info Block */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              Dados do Cliente Solicitante
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500">Razão Social:</span>
                <span className="font-bold text-slate-900 block">{quote.clientName}</span>
                <span className="text-slate-500 font-mono">CNPJ: {quote.clientCnpj}</span>
              </div>
              <div>
                <span className="text-slate-500">Contato / WhatsApp:</span>
                <span className="font-semibold text-slate-800 block">{quote.clientContact}</span>
                <span className="text-slate-600 block">{quote.clientPhone} · {quote.clientEmail}</span>
              </div>
            </div>
          </div>

          {/* Items Table with Transparent Cost & Pricing Breakdown */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Itens da Proposta & Especificações Técnicas
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-2.5 px-3">Item / Modelo</th>
                    <th className="py-2.5 px-3">Especificação do Tecido & Cor</th>
                    <th className="py-2.5 px-3">Grade de Tamanhos</th>
                    <th className="py-2.5 px-3 text-center">Markup</th>
                    <th className="py-2.5 px-3 text-right">Qtd</th>
                    <th className="py-2.5 px-3 text-right">Unitário</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {quote.items.map((item, idx) => (
                    <tr key={item.id || idx}>
                      <td className="py-3 px-3 align-top">
                        <div className="font-bold text-slate-900">{item.modelName}</div>
                        {item.customizations && item.customizations.length > 0 && (
                          <div className="text-[11px] text-slate-500 mt-1">
                            {item.customizations.map((c, i) => (
                              <div key={i}>• {c.description} ({c.location})</div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 align-top">
                        <div className="font-medium text-slate-800">{item.fabricName}</div>
                        <div className="text-slate-500 text-[11px]">Cor: {item.fabricColor}</div>
                      </td>
                      <td className="py-3 px-3 align-top font-mono text-[11px] text-slate-700">
                        <div className="flex flex-wrap gap-1.5">
                          {item.sizes.pp > 0 && <span>PP:{item.sizes.pp}</span>}
                          {item.sizes.p > 0 && <span>P:{item.sizes.p}</span>}
                          {item.sizes.m > 0 && <span>M:{item.sizes.m}</span>}
                          {item.sizes.g > 0 && <span>G:{item.sizes.g}</span>}
                          {item.sizes.gg > 0 && <span>GG:{item.sizes.gg}</span>}
                          {item.sizes.xg > 0 && <span>XG:{item.sizes.xg}</span>}
                          {item.sizes.exg > 0 && <span>EXG:{item.sizes.exg}</span>}
                          {item.sizes.sobMedida > 0 && <span>SM:{item.sizes.sobMedida}</span>}
                        </div>
                      </td>
                      <td className="py-3 px-3 align-top text-center font-mono text-slate-600">
                        {item.costBreakdown?.markupPercentage || 45}%
                      </td>
                      <td className="py-3 px-3 align-top text-right font-mono font-bold text-slate-900">
                        {item.totalQuantity} pçs
                      </td>
                      <td className="py-3 px-3 align-top text-right font-mono text-slate-800">
                        {formatCurrencyBRL(item.unitFinalPrice)}
                      </td>
                      <td className="py-3 px-3 align-top text-right font-mono font-bold text-slate-900">
                        {formatCurrencyBRL(item.totalPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pricing & Commercial Conditions Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
            
            <div className="space-y-3 text-xs text-slate-600 bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="font-bold uppercase text-slate-800">Condições Comerciais Normativas (PRD v1.6)</div>
              <div>
                <span className="font-semibold text-slate-700">Condição de Pagamento: </span>
                <span>{quote.paymentTerms}</span>
              </div>
              <div className="text-blue-900 font-semibold">
                <span>Sinal de Entrada ({quote.entryPercentage || 50}%): </span>
                <span className="font-mono font-bold">{formatCurrencyBRL(quote.entryAmount || (quote.totalAmount / 2))}</span>
                <span className="text-[11px] text-slate-500 block">Pré-requisito financeiro para liberação da mesa de corte</span>
              </div>
              <div>
                <span className="font-semibold text-slate-700">Saldo na Entrega: </span>
                <span className="font-mono font-bold">{formatCurrencyBRL(quote.balanceDueAtDelivery || (quote.totalAmount / 2))}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-700">Prazo de Confecção: </span>
                <span className="font-bold text-slate-900">{quote.productionLeadDays} dias úteis</span> (após sinal confirmado e aprovação de arte).
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex flex-col justify-between text-xs space-y-2">
              <div className="space-y-2 font-mono">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span>{formatCurrencyBRL(quote.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Frete CIF São Luís / MA:</span>
                  <span>Incluso</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-300 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900 uppercase">Valor Total da Proposta:</span>
                <span className="text-xl font-black font-mono text-blue-700">
                  {formatCurrencyBRL(quote.totalAmount)}
                </span>
              </div>
            </div>

          </div>

          {/* Acceptance Signature Lines */}
          <div className="pt-6 border-t border-slate-200 text-xs">
            <div className="grid grid-cols-2 gap-12 text-center pt-8">
              <div>
                <div className="border-t border-slate-400 pt-2 font-semibold text-slate-800">
                  DE FARDAS CONFECÇÕES & UNIFORMES LTDA
                </div>
                <div className="text-[11px] text-slate-500">Depto. Comercial / São Luís - MA</div>
              </div>
              <div>
                <div className="border-t border-slate-400 pt-2 font-semibold text-slate-800">
                  {quote.clientName}
                </div>
                <div className="text-[11px] text-slate-500">De Acordo / Assinatura do Cliente / Data: ___/___/2026</div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
