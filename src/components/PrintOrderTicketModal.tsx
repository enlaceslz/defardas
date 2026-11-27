import React from 'react';
import { X, Printer, CheckCircle2, Scissors, Shirt, Sparkles, Truck, ShieldCheck } from 'lucide-react';
import { ProductionOrder, CompanyProfile } from '../types/erp';
import { formatDateBR, getStageLabel } from '../utils/formatters';
import { DEFAULT_BRAND_LOGO_URL } from '../data/initialData';

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
        <div className="flex items-center justify-between px-6 py-4 bg-[#111113] text-white no-print">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">Ficha de Produção Fabril & Roteiro de Qualidade</span>
            <span className="text-xs text-zinc-400 font-mono">[{order.orderNumber || order.id}]</span>
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
          <div className="flex items-start justify-between border-b-2 border-[#111113] pb-4 gap-4">
            <div className="flex items-start gap-3.5">
              <div className="shrink-0 flex items-center justify-center bg-white border border-zinc-200 rounded-lg p-1.5 max-w-[128px] max-h-[68px]">
                <img
                  src={profile.logoUrl || DEFAULT_BRAND_LOGO_URL}
                  alt={`Logomarca ${profile.tradeName}`}
                  className="max-h-12 max-w-[114px] w-auto object-contain"
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
                  {profile.neighborhood ? ` - ${profile.neighborhood}` : ''}, {profile.city}/{profile.state} · Tel: {profile.phone}
                </div>
                {profile.email && (
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    E-mail: {profile.email}
                  </div>
                )}
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs uppercase font-bold text-slate-500 tracking-wider">
                Ordem de Produção (PCP)
              </div>
              <div className="text-2xl font-black font-mono text-[#C8102E]">
                {order.orderNumber || order.id}
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
                <span className="text-slate-500">Portões de Liberação (A.3.2): </span>
                <span className={`font-semibold ${order.entryPaymentConfirmed && order.artApproved ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {order.entryPaymentConfirmed ? 'Sinal 50% Confirmado' : 'Sinal Pendente'} · {order.artApproved ? 'Arte Aprovada' : 'Arte Pendente'}
                </span>
              </div>
              {order.artApproved && order.artApprovedBy && (
                <div className="text-[11px] text-slate-500">
                  Arte aprovada por <strong className="text-slate-700">{order.artApprovedBy}</strong>
                  {order.artApprovalDate ? ` em ${formatDateBR(order.artApprovalDate)}` : ''}
                </div>
              )}
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

          {/* Approved Artwork Preview */}
          {(order.artFileUrl || order.artRevisionNotes) && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-100 px-4 py-2 font-bold text-xs uppercase tracking-wider text-slate-700 border-b border-slate-200 flex items-center justify-between">
                <span>
                  Arte / Layout de Personalização
                  {order.artVersionNumber ? ` (Arte v${order.artVersionNumber})` : ''}
                </span>
                <span
                  className={`text-[11px] font-bold ${
                    order.artApproved ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {order.artApproved
                    ? `Aprovada por ${order.artApprovedBy || 'Cliente'}`
                    : order.artStatus === 'revisao_solicitada'
                    ? 'REVISÃO DE ARTE PENDENTE (CORTE BLOQUEADO)'
                    : 'Aguardando Aprovação Formal'}
                </span>
              </div>
              <div className="p-3 flex items-center gap-4 text-xs">
                {order.artFileUrl && order.artFileUrl.startsWith('data:image/') && (
                  <img
                    src={order.artFileUrl}
                    alt={`Layout aprovado ${order.orderNumber || order.id}`}
                    className="max-h-32 max-w-[200px] object-contain border border-slate-200 rounded bg-slate-50 p-1"
                  />
                )}
                <div className="space-y-1 text-slate-700">
                  {order.artRevisionNotes && (
                    <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-950">
                      <strong>Ajuste solicitado na arte:</strong> {order.artRevisionNotes}
                    </div>
                  )}
                  {order.artFileUrl && !order.artFileUrl.startsWith('data:image/') && (
                    <div className="font-mono text-[11px] text-slate-600 break-all">
                      Arquivo/Referência: {order.artFileUrl.startsWith('data:application/pdf') ? 'Documento PDF armazenado no ERP' : order.artFileUrl}
                    </div>
                  )}
                </div>
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

          {/* Quality Routing Sign-Off Table (PRD B.2.3 & 5.8) com Prazos por Etapa */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-100 px-4 py-2 font-bold text-xs uppercase tracking-wider text-slate-700 border-b border-slate-200 flex justify-between">
              <span>4. Cronograma por Etapa & Controle de Qualidade Final (DE FARDAS)</span>
              <span className="text-[11px] text-slate-500 font-normal">Aprovação obrigatória antes da liberação de pagamento ao parceiro</span>
            </div>
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                  <th className="py-2 px-3">Etapa</th>
                  <th className="py-2 px-3">Prazo Previsto</th>
                  <th className="py-2 px-3">Conclusão Real</th>
                  <th className="py-2 px-3">Responsável / Facção</th>
                  <th className="py-2 px-3">Qtd Aprovada</th>
                  <th className="py-2 px-3">Perdas/Defeito</th>
                  <th className="py-2 px-3">Visto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(() => {
                  const scheduleByStage = new Map(
                    (order.deadlineSummary?.stages || order.stageSchedule || []).map((s) => [s.stage, s])
                  );
                  const rows = [
                    {
                      key: 'aguardando_liberacao',
                      label: '0. Liberação (Gate A.3.2)',
                      fallbackResp: 'Comercial / Financeiro',
                      lossPlaceholder: '-',
                    },
                    {
                      key: 'corte',
                      label: '1. Corte & Enfesto',
                      fallbackResp: order.assignedTeam || 'DE FARDAS · Corte',
                      lossPlaceholder: '____ m',
                    },
                    {
                      key: 'bordado_silk',
                      label: '2. Bordado / Silk (Parceiro)',
                      fallbackResp:
                        order.customizations?.find((c) => c.partnerName)?.partnerName ||
                        'Parceiro de Personalização',
                      lossPlaceholder: '____ pçs',
                    },
                    {
                      key: 'costura',
                      label: '3. Costura & Montagem',
                      fallbackResp: order.outsourcedPartner || 'Produção Interna DE FARDAS',
                      lossPlaceholder: '____ pçs',
                    },
                    {
                      key: 'conferencia_qualidade',
                      label: '4. Inspeção Final DE FARDAS',
                      fallbackResp: 'Controle de Qualidade',
                      lossPlaceholder: '____ pçs',
                    },
                    {
                      key: 'expedicao',
                      label: '5. Embalagem & Expedição',
                      fallbackResp: 'Expedição / Almoxarifado',
                      lossPlaceholder: '-',
                    },
                  ];
                  return rows.map((r) => {
                    const st = scheduleByStage.get(r.key as any);
                    return (
                      <tr key={r.key} className={st?.skipped ? 'opacity-50 bg-slate-50/50' : ''}>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{r.label}</td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">
                          {st?.skipped
                            ? 'N/A'
                            : st?.plannedEndDate
                              ? formatDateBR(st.plannedEndDate)
                              : '____/____/____'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">
                          {st?.skipped
                            ? '—'
                            : st?.actualEndDate
                              ? formatDateBR(st.actualEndDate)
                              : '____/____/____'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">
                          {st?.responsible || r.fallbackResp}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">
                          {st?.skipped ? '—' : '____ pçs'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">
                          {st?.skipped ? '—' : r.lossPlaceholder}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">____________</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>

        </div>

      </div>
    </div>
  );
};
