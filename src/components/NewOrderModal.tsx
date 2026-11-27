import React, { useState } from 'react';
import { X, Plus, Trash2, Shirt, Scissors, AlertTriangle, ShieldCheck } from 'lucide-react';
import { 
  ProductionOrder, 
  Client, 
  Partner,
  OperationalStage, 
  PriorityLevel, 
  UniformCategory, 
  SizeGrid, 
  CustomizationItem, 
  CostBreakdown 
} from '../types/erp';
import { getTotalFromSizeGrid, formatCurrencyBRL } from '../utils/formatters';
import { CurrencyInput, DateInputBR } from './FormInputs';

interface NewOrderModalProps {
  clients: Client[];
  partners?: Partner[];
  existingOrder?: ProductionOrder | null;
  onClose: () => void;
  onSaveOrder: (order: ProductionOrder) => Promise<boolean>;
}

const PARTNER_TYPE_SHORT: Record<string, string> = {
  costura: 'Facção Costura',
  bordado: 'Bordado',
  silk_screen: 'Silk-Screen',
  acabamento: 'Acabamento',
  corte_externo: 'Corte Externo',
};

export const NewOrderModal: React.FC<NewOrderModalProps> = ({
  clients,
  partners = [],
  existingOrder,
  onClose,
  onSaveOrder,
}) => {
  const isEditing = !!existingOrder;

  const [clientId, setClientId] = useState(existingOrder?.clientId || (clients[0]?.id || ''));
  const [clientName, setClientName] = useState(existingOrder?.clientName || (clients[0]?.tradeName || ''));
  const [itemTitle, setItemTitle] = useState(existingOrder?.itemTitle || 'Camisa Polo Corporativa Piquet');
  const [category, setCategory] = useState<UniformCategory>(existingOrder?.category || 'polos');
  const [fabricName, setFabricName] = useState(existingOrder?.fabricName || 'Malha Piquet PA 50/50');
  const [fabricColor, setFabricColor] = useState(existingOrder?.fabricColor || 'Azul Marinho / Vivos Brancos');
  const stage: OperationalStage = existingOrder?.stage || 'aguardando_liberacao';
  const [priority, setPriority] = useState<PriorityLevel>(existingOrder?.priority || 'normal');
  const [targetDeliveryDate, setTargetDeliveryDate] = useState(
    existingOrder?.targetDeliveryDate || new Date(Date.now() + 16 * 86400000).toISOString().split('T')[0]
  );
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Gates de Liberação do PRD (somente leitura: alterados via Financeiro com comprovante e Aprovação de Arte)
  const entryPaymentConfirmed = existingOrder?.entryPaymentConfirmed ?? false;
  const artApproved = existingOrder?.artApproved ?? false;
  const activePartners = partners.filter((p) => p.active);
  const initialPartner = existingOrder?.outsourcedPartner ?? (activePartners[0]?.tradeName || 'Facção Têxtil Maranhense');
  const [outsourcedPartner, setOutsourcedPartner] = useState(initialPartner);
  const [customPartnerMode, setCustomPartnerMode] = useState<boolean>(() => {
    if (!initialPartner || initialPartner === 'Produção Interna') return false;
    return activePartners.length > 0 && !activePartners.some((p) => p.tradeName === initialPartner || p.name === initialPartner);
  });
  const [partnerCostPerPiece, setPartnerCostPerPiece] = useState(
    existingOrder?.partnerCostPerPiece ?? (activePartners[0]?.defaultCostPerPiece || 18.00)
  );

  const [technicalNotes, setTechnicalNotes] = useState(
    existingOrder?.technicalNotes || 'Travetes reforçados nos bolsos. Linha pespasso 120 resistente.'
  );

  const [sizes, setSizes] = useState<SizeGrid>(
    existingOrder?.sizes || { pp: 0, p: 20, m: 50, g: 40, gg: 15, xg: 5, exg: 0, sobMedida: 0 }
  );

  const [customizations, setCustomizations] = useState<CustomizationItem[]>(
    existingOrder?.customizations || [
      {
        id: 'c-new-1',
        type: 'bordado_peito',
        description: 'Bordado Logomarca no peito esquerdo',
        location: 'Peito Esquerdo',
        unitCost: 6.50,
      }
    ]
  );

  const totalPieces = getTotalFromSizeGrid(sizes);

  const handleClientChange = (cId: string) => {
    setClientId(cId);
    const selected = clients.find((c) => c.id === cId);
    if (selected) {
      setClientName(selected.tradeName);
    }
  };

  const handleSizeChange = (key: keyof SizeGrid, val: number) => {
    setSizes((prev) => ({
      ...prev,
      [key]: Math.max(0, val),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError('');

    if (!clientId) {
      setFormError('Selecione um cliente cadastrado antes de emitir a Ordem de Produção.');
      return;
    }

    if (!itemTitle.trim()) {
      setFormError('Informe o título do item / modelo da peça.');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDeliveryDate)) {
      setFormError('Informe uma data prometida de entrega válida.');
      return;
    }

    if (totalPieces <= 0) {
      setFormError('Por favor informe ao menos 1 peça na grade de tamanhos.');
      return;
    }

    const orderId = existingOrder?.id || `OP-2026-${Math.floor(100 + Math.random() * 900)}`;

    const canStart = Boolean(entryPaymentConfirmed && artApproved);
    const effectiveStage: OperationalStage = isEditing && canStart ? stage : 'aguardando_liberacao';

    const defaultCostBreakdown: CostBreakdown = existingOrder?.costBreakdown || {
      materialUnitCost: 25.00,
      outsourcedSewingUnitCost: partnerCostPerPiece,
      customizationUnitCost: 6.50,
      freightPerUnit: 1.50,
      technicalLossPercentage: 2.0,
      calculatedBaseCost: Math.round((25 + partnerCostPerPiece + 6.5 + 1.5) * 1.02 * 100) / 100,
      markupPercentage: 45.0,
      suggestedUnitPrice: 75.00,
      negotiatedUnitPrice: 75.00,
      discountPercentage: 0,
      belowSuggestedAuthorized: false,
      estimatedMarginPercentage: 31.0,
    };

    const savedOrder: ProductionOrder = {
      id: orderId,
      quoteId: existingOrder?.quoteId,
      quoteVersion: existingOrder?.quoteVersion || 1,
      clientId,
      clientName,
      itemTitle: itemTitle.trim(),
      category,
      fabricName: fabricName.trim(),
      fabricColor: fabricColor.trim(),
      sizes,
      totalPieces,
      customizations,
      costBreakdown: defaultCostBreakdown,
      materials: existingOrder?.materials || [
        {
          id: 'mat-auto-1',
          materialName: fabricName,
          unit: 'metros',
          estimatedQuantity: Math.round(totalPieces * 1.4),
          allocatedInStock: Math.round(totalPieces * 1.4),
          sentToPartnerQuantity: Math.round(totalPieces * 1.4),
          returnedFromPartnerQuantity: 0,
          lostQuantity: 2,
        }
      ],
      commercialStatus: 'aprovado',
      financialStatus: entryPaymentConfirmed ? 'entrada_confirmada' : 'entrada_pendente',
      stage: effectiveStage,
      artApproved,
      artApprovalDate: artApproved ? existingOrder?.artApprovalDate : undefined,
      entryPaymentConfirmed,
      canStartProduction: canStart,
      outsourcedPartner: outsourcedPartner.trim(),
      partnerCostPerPiece,
      priority,
      creationDate: existingOrder?.creationDate || new Date().toISOString().split('T')[0],
      targetDeliveryDate,
      technicalNotes: technicalNotes.trim(),
      assignedTeam: existingOrder?.assignedTeam || 'Célula de Confecção / Parceiro Homologado',
    };

    setIsSubmitting(true);
    try {
      const ok = await onSaveOrder(savedOrder);
      if (ok) {
        onClose();
      } else {
        setFormError('Não foi possível salvar a Ordem de Produção. Verifique a notificação de erro acima e tente novamente.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#111113] text-white">
          <div className="flex items-center gap-2">
            <Shirt className="w-5 h-5 text-[#E3263E]" />
            <h2 className="text-base font-bold">
              {isEditing ? `Editar Ordem de Produção [${existingOrder?.orderNumber || existingOrder?.id}]` : 'Emitir Nova Ordem de Produção (PCP)'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto text-xs">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
          
          {/* Section 1: Cliente & Modelo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Cliente Solicitante *
              </label>
              <select
                value={clientId}
                onChange={(e) => handleClientChange(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.tradeName} ({c.segment})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Categoria do Fardamento (PRD v1.6)
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as UniformCategory)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 capitalize focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="polos">Polos Corporativas</option>
                <option value="linha_hospitalar">Linha Hospitalar / Jalecos</option>
                <option value="calcas">Calças Operacionais Brim</option>
                <option value="camisetas">Camisetas Dry-Fit / Algodão</option>
                <option value="coletes">Coletes Operacionais</option>
                <option value="linha_social">Linha Social</option>
                <option value="aventais_batas">Aventais & Batas</option>
                <option value="macacoes">Macacões Industriais</option>
                <option value="operacional">Operacional Pesado</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Título do Item / Peça *
              </label>
              <input
                type="text"
                required
                value={itemTitle}
                onChange={(e) => setItemTitle(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Ex: Conjunto Operacional Brim Pesado c/ Faixa 3M"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Cor / Especificação
              </label>
              <input
                type="text"
                value={fabricColor}
                onChange={(e) => setFabricColor(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Tecido Principal
            </label>
            <input
              type="text"
              value={fabricName}
              onChange={(e) => setFabricName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
              placeholder="Ex: Brim Pesado 100% Algodão Santanense"
            />
          </div>

          {/* PRD Gates: Status Auditável (Sem Bypass Manual) */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <span className="font-bold text-slate-900 text-xs uppercase flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>Portões de Liberação Fabril (Gate Normativo A.3.2)</span>
            </span>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Toda nova Ordem de Produção nasce em <strong>Aguardando Liberação</strong>. A confirmação do sinal (50%) exige comprovante bancário no módulo Financeiro e a aprovação da arte é registrada diretamente no PCP.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className={`p-2.5 rounded-lg border ${entryPaymentConfirmed ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                <strong className="block">Sinal de Entrada (50%)</strong>
                <span className="text-[11px]">
                  {entryPaymentConfirmed ? 'Confirmado com comprovante auditado' : 'Pendente de liquidação no Financeiro'}
                </span>
              </div>
              <div className={`p-2.5 rounded-lg border ${artApproved ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                <strong className="block">Arte / Layout Personalizado</strong>
                <span className="text-[11px]">
                  {artApproved ? 'Aprovada formalmente para produção' : 'Pendente de aprovação no quadro PCP'}
                </span>
              </div>
            </div>
          </div>

          {/* Grade de Tamanhos */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 text-xs uppercase">
                Grade de Tamanhos (Quantidades)
              </span>
              <span className="font-mono font-bold text-blue-700 text-sm">
                Total: {totalPieces} peças
              </span>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {(['pp', 'p', 'm', 'g', 'gg', 'xg', 'exg', 'sobMedida'] as (keyof SizeGrid)[]).map((sizeKey) => (
                <div key={sizeKey} className="text-center">
                  <label className="block font-bold text-slate-600 uppercase text-[10px] mb-1">
                    {sizeKey === 'sobMedida' ? 'SM' : sizeKey}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={sizes[sizeKey]}
                    onChange={(e) => handleSizeChange(sizeKey, parseInt(e.target.value) || 0)}
                    className="w-full px-2 py-1.5 text-center font-mono font-semibold border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Terceirização e Célula de Produção */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block font-semibold text-slate-700">
                Parceiro Terceirizado / Facção (PRD 5.8)
              </label>
              {activePartners.length > 0 ? (
                <>
                  <select
                    value={
                      customPartnerMode
                        ? '__custom__'
                        : outsourcedPartner === '' || outsourcedPartner === 'Produção Interna'
                          ? '__internal__'
                          : outsourcedPartner
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__internal__') {
                        setCustomPartnerMode(false);
                        setOutsourcedPartner('Produção Interna');
                        setPartnerCostPerPiece(0);
                      } else if (val === '__custom__') {
                        setCustomPartnerMode(true);
                        if (outsourcedPartner === 'Produção Interna') setOutsourcedPartner('');
                      } else {
                        setCustomPartnerMode(false);
                        setOutsourcedPartner(val);
                        const match = activePartners.find((p) => p.tradeName === val);
                        if (match && match.defaultCostPerPiece > 0) {
                          setPartnerCostPerPiece(match.defaultCostPerPiece);
                        }
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="__internal__">Produção Interna (Sem Facção Externa)</option>
                    {activePartners.map((p) => (
                      <option key={p.id} value={p.tradeName}>
                        {p.tradeName} — {PARTNER_TYPE_SHORT[p.partnerType] || p.partnerType}
                        {p.defaultCostPerPiece > 0 ? ` (${formatCurrencyBRL(p.defaultCostPerPiece)}/pç)` : ''}
                      </option>
                    ))}
                    <option value="__custom__">+ Outro parceiro (digitar manualmente)</option>
                  </select>
                  {customPartnerMode && (
                    <input
                      type="text"
                      value={outsourcedPartner}
                      onChange={(e) => setOutsourcedPartner(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                      placeholder="Nome da facção ou prestador terceirizado"
                    />
                  )}
                </>
              ) : (
                <input
                  type="text"
                  value={outsourcedPartner}
                  onChange={(e) => setOutsourcedPartner(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  placeholder="Ex: Facção Têxtil Maranhense"
                />
              )}
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Custo de Mão de Obra do Parceiro (R$/peça)
              </label>
              <CurrencyInput
                value={partnerCostPerPiece}
                onChange={setPartnerCostPerPiece}
              />
              {activePartners.length > 0 && !customPartnerMode && outsourcedPartner !== 'Produção Interna' && (
                <p className="text-[10px] text-slate-500 mt-1">
                  Valor preenchido automaticamente pelo cadastro do parceiro (editável por OP).
                </p>
              )}
            </div>
          </div>

          {/* Prazos e Prioridade */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Etapa Operacional (via Kanban)
              </label>
              <input
                type="text"
                readOnly
                value={stage === 'aguardando_liberacao' ? '0. Bloqueado (Aguardando Gate A.3.2)' : stage.replace('_', ' ')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-600 font-medium cursor-not-allowed capitalize"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Prioridade
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as PriorityLevel)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
              >
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Data Prometida de Entrega *
              </label>
              <DateInputBR
                required
                value={targetDeliveryDate}
                onChange={setTargetDeliveryDate}
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Orientações Técnicas de Confecção
            </label>
            <textarea
              rows={2}
              value={technicalNotes}
              onChange={(e) => setTechnicalNotes(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          {/* Submit */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-[#C8102E] text-white font-semibold rounded-lg hover:bg-[#A60D26] transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              {isSubmitting
                ? 'Salvando...'
                : isEditing
                  ? 'Salvar Alterações da OP'
                  : 'Emitir Ordem de Produção'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
