import React from 'react';
import { X, Printer, CheckCircle2, Scissors, Shirt, Sparkles, Truck, ShieldCheck } from 'lucide-react';
import { ProductionOrder, CompanyProfile } from '../types/erp';
import { formatDateBR, getStageLabel } from '../utils/formatters';

interface PrintOrderTicketModalProps {
  order: ProductionOrder;
  profile: CompanyProfile;
  onClose: () => void;
}

export const PrintOrderTicketModal: React.FC<PrintOrderTicketModalProps> = ({
  order,
  profile,
  onClose,
}) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200">
        
        {/* Modal Toolbar (hidden when printing) */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white no-print">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">Ficha de Produção Fabril & Roteiro de Qualidade</span>
            <span className="text-xs text-slate-400 font-mono">[{order.id}]</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Ficha (Ctrl+P)</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Ticket Area */}
        <div className="p-8 space-y-6 text-slate-900 bg-white print-page text-sm">
          
          {/* Header */}
          <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
            <div>
              <div className="text-xl font-black tracking-tight text-slate-900">
                {profile.tradeName}
              </div>
              <div className="text-xs text-slate-600 font-mono mt-0.5">
                {profile.name} · CNPJ: {profile.cnpj}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {profile.address} - {profile.neighborhood}, {profile.city}/{profile.state} · Tel: {profile.phone}
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs uppercase font-bold text-slate-500 tracking-wider">
                Ordem de Produção (PCP)
              </div>
              <div className="text-2xl font-black font-mono text-blue-700">
                {order.id}
              </div>
              <div className="text-xs text-slate-600 mt-0.5 font-mono">
                Emissão: {formatDateBR(order.creationDate)}
              </div>
            </div>
          </div>

          {/* Client & Deadlines */}
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
            <div>
              <span className="font-semibold text-slate-700 block">Cliente Solicitante:</span>
              <span className="text-slate-900 font-bold text-sm block">{order.clientName}</span>
              {order.quoteId && (
                <span className="text-slate-500 font-mono">Orçamento Base: {order.quoteId} (v{order.quoteVersion || 1})</span>
              )}
            </div>
            <div className="space-y-1 text-right">
              <div>
                <span className="text-slate-500">Prazo Prometido de Entrega: </span>
                <span className="font-mono font-bold text-rose-700 text-sm">{formatDateBR(order.targetDeliveryDate)}</span>
              </div>
              <div>
                <span className="text-slate-500">Parceiro / Facção: </span>
                <span className="font-semibold text-slate-800">{order.outsourcedPartner || 'Produção Interna'}</span>
              </div>
              <div>
                <span className="text-slate-500">Portões de Liberação: </span>
                <span className="font-semibold text-emerald-700">Sinal Confirmado · Arte Aprovada</span>
              </div>
            </div>
          </div>

          {/* Garment Details */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-100 px-4 py-2 font-bold text-xs uppercase tracking-wider text-slate-700 border-b border-slate-200">
              1. Identificação do Modelo & Consumo Têxtil
            </div>
            <div className="p-4 grid grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block">Modelo do Fardamento:</span>
                <span className="font-bold text-slate-900 text-sm">{order.itemTitle}</span>
                <span className="text-slate-500 block capitalize mt-0.5">Categoria: {order.category}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Tecido / Especificação:</span>
                <span className="font-medium text-slate-900">{order.fabricName}</span>
                <span className="text-slate-600 block mt-0.5">Cor: {order.fabricColor}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Total de Peças do Lote:</span>
                <span className="font-mono font-bold text-blue-700 text-base">
                  {order.totalPieces} peças
                </span>
                <span className="text-slate-500 block text-[11px] mt-0.5 font-mono">
                  Remessa de Tecido: ~{Math.round(order.totalPieces * 1.4)}m
                </span>
              </div>
            </div>
          </div>

          {/* Size Grid Breakdown */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-100 px-4 py-2 font-bold text-xs uppercase tracking-wider text-slate-700 border-b border-slate-200 flex justify-between">
              <span>2. Grade de Tamanhos & Quantidades</span>
              <span className="font-mono text-blue-700">Total: {order.totalPieces} Peças</span>
            </div>
            <div className="p-3 overflow-x-auto">
              <table className="w-full text-center text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50">
                    <th className="py-2 px-3">PP</th>
                    <th className="py-2 px-3">P</th>
                    <th className="py-2 px-3">M</th>
                    <th className="py-2 px-3">G</th>
                    <th className="py-2 px-3">GG</th>
                    <th className="py-2 px-3">XG</th>
                    <th className="py-2 px-3">EXG</th>
                    <th className="py-2 px-3">Sob Medida</th>
                    <th className="py-2 px-3 font-bold text-slate-900 bg-slate-100">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="font-mono text-sm font-semibold text-slate-800">
                    <td className="py-2.5 px-3">{order.sizes.pp}</td>
                    <td className="py-2.5 px-3">{order.sizes.p}</td>
                    <td className="py-2.5 px-3">{order.sizes.m}</td>
                    <td className="py-2.5 px-3">{order.sizes.g}</td>
                    <td className="py-2.5 px-3">{order.sizes.gg}</td>
                    <td className="py-2.5 px-3">{order.sizes.xg}</td>
                    <td className="py-2.5 px-3">{order.sizes.exg}</td>
                    <td className="py-2.5 px-3">{order.sizes.sobMedida}</td>
                    <td className="py-2.5 px-3 font-bold text-blue-700 bg-blue-50 text-base">
                      {order.totalPieces}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Customization Details */}
          {order.customizations && order.customizations.length > 0 && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-100 px-4 py-2 font-bold text-xs uppercase tracking-wider text-slate-700 border-b border-slate-200">
                3. Personalizações, Bordados & Estamparia (Tajima / Silk)
              </div>
              <div className="p-3 divide-y divide-slate-100 text-xs">
                {order.customizations.map((c, index) => (
                  <div key={c.id || index} className="py-2 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900 uppercase">[{c.type.replace('_', ' ')}]</span>
                      <span className="ml-2 text-slate-700">{c.description}</span>
                    </div>
                    <div className="text-slate-600 font-medium">
                      Posição: <span className="font-semibold text-slate-900">{c.location}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Technical Notes */}
          {order.technicalNotes && (
            <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-lg text-xs space-y-1">
              <span className="font-bold text-amber-900 uppercase">Instruções Técnicas & Normas de Costura:</span>
              <p className="text-amber-950 leading-relaxed font-mono text-[12px]">
                {order.technicalNotes}
              </p>
            </div>
          )}

          {/* Quality Routing Sign-Off Table (PRD B.2.3 & 5.8) */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-100 px-4 py-2 font-bold text-xs uppercase tracking-wider text-slate-700 border-b border-slate-200 flex justify-between">
              <span>4. Roteiro de Controle & Conferência de Qualidade Final (DE FARDAS)</span>
              <span className="text-[11px] text-slate-500 font-normal">Aprovação obrigatória antes da liberação de pagamento ao parceiro</span>
            </div>
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                  <th className="py-2 px-3">Etapa</th>
                  <th className="py-2 px-3">Data</th>
                  <th className="py-2 px-3">Responsável / Facção</th>
                  <th className="py-2 px-3">Qtd Aprovada</th>
                  <th className="py-2 px-3">Perdas/Defeito</th>
                  <th className="py-2 px-3">Visto / Assinatura</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="py-3 px-3 font-semibold text-slate-800">1. Corte & Enfesto</td>
                  <td className="py-3 px-3 font-mono text-slate-400">____/____/2026</td>
                  <td className="py-3 px-3 font-mono text-slate-400">DE FARDAS Mesa 1</td>
                  <td className="py-3 px-3 font-mono text-slate-400">____ pçs</td>
                  <td className="py-3 px-3 font-mono text-slate-400">____ m</td>
                  <td className="py-3 px-3 font-mono text-slate-400">__________________</td>
                </tr>
                <tr>
                  <td className="py-3 px-3 font-semibold text-slate-800">2. Bordado / Silk (Parceiro)</td>
                  <td className="py-3 px-3 font-mono text-slate-400">____/____/2026</td>
                  <td className="py-3 px-3 font-mono text-slate-400">Bordados São Luís</td>
                  <td className="py-3 px-3 font-mono text-slate-400">____ pçs</td>
                  <td className="py-3 px-3 font-mono text-slate-400">____ pçs</td>
                  <td className="py-3 px-3 font-mono text-slate-400">__________________</td>
                </tr>
                <tr>
                  <td className="py-3 px-3 font-semibold text-slate-800">3. Costura & Montagem</td>
                  <td className="py-3 px-3 font-mono text-slate-400">____/____/2026</td>
                  <td className="py-3 px-3 font-mono text-slate-400">Facção Externa</td>
                  <td className="py-3 px-3 font-mono text-slate-400">____ pçs</td>
                  <td className="py-3 px-3 font-mono text-slate-400">____ pçs</td>
                  <td className="py-3 px-3 font-mono text-slate-400">__________________</td>
                </tr>
                <tr>
                  <td className="py-3 px-3 font-semibold text-slate-800">4. Inspeção Final DE FARDAS</td>
                  <td className="py-3 px-3 font-mono text-slate-400">____/____/2026</td>
                  <td className="py-3 px-3 font-mono text-slate-400">Controle Qualidade</td>
                  <td className="py-3 px-3 font-mono text-slate-400">____ pçs</td>
                  <td className="py-3 px-3 font-mono text-slate-400">____ pçs</td>
                  <td className="py-3 px-3 font-mono text-slate-400">__________________</td>
                </tr>
                <tr>
                  <td className="py-3 px-3 font-semibold text-slate-800">5. Embalagem & Expedição</td>
                  <td className="py-3 px-3 font-mono text-slate-400">____/____/2026</td>
                  <td className="py-3 px-3 font-mono text-slate-400">Almoxarifado Envio</td>
                  <td className="py-3 px-3 font-mono text-slate-400">____ pçs</td>
                  <td className="py-3 px-3 font-mono text-slate-400">-</td>
                  <td className="py-3 px-3 font-mono text-slate-400">__________________</td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>

      </div>
    </div>
  );
};
