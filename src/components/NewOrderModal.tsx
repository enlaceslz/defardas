import React, { useState } from 'react';
import { X, Plus, Trash2, Shirt, Scissors, AlertTriangle, ShieldCheck } from 'lucide-react';
import { 
  ProductionOrder, 
  Client, 
  OperationalStage, 
  PriorityLevel, 
  UniformCategory, 
  SizeGrid, 
  CustomizationItem, 
  CostBreakdown 
} from '../types/erp';
import { getTotalFromSizeGrid } from '../utils/formatters';

interface NewOrderModalProps {
  clients: Client[];
  existingOrder?: ProductionOrder | null;
  onClose: () => void;
  onSaveOrder: (order: ProductionOrder) => void;
}

export const NewOrderModal: React.FC<NewOrderModalProps> = ({
  clients,
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
  const [stage, setStage] = useState<OperationalStage>(existingOrder?.stage || 'corte');
  const [priority, setPriority] = useState<PriorityLevel>(existingOrder?.priority || 'normal');
  const [targetDeliveryDate, setTargetDeliveryDate] = useState(
    existingOrder?.targetDeliveryDate || new Date(Date.now() + 16 * 86400000).toISOString().split('T')[0]
  );
  
  // Gates de Liberação do PRD
  const [entryPaymentConfirmed, setEntryPaymentConfirmed] = useState(existingOrder?.entryPaymentConfirmed ?? true);
  const [artApproved, setArtApproved] = useState(existingOrder?.artApproved ?? true);
  const [outsourcedPartner, setOutsourcedPartner] = useState(existingOrder?.outsourcedPartner || 'Facção Têxtil Maranhense');
  const [partnerCostPerPiece, setPartnerCostPerPiece] = useState(existingOrder?.partnerCostPerPiece || 18.00);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (totalPieces <= 0) {
      alert('Por favor informe ao menos 1 peça na grade de tamanhos.');
      return;
    }

    const orderId = existingOrder?.id || `OP-2026-${Math.floor(100 + Math.random() * 900)}`;

    const canStart = Boolean(entryPaymentConfirmed && artApproved);
    const effectiveStage = canStart ? stage : 'aguardando_liberacao';

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
      itemTitle,
      category,
      fabricName,
      fabricColor,
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
      artApprovalDate: artApproved ? new Date().toISOString().split('T')[0] : undefined,
      entryPaymentConfirmed,
      canStartProduction: canStart,
      outsourcedPartner,
      partnerCostPerPiece,
      priority,
      creationDate: existingOrder?.creationDate || new Date().toISOString().split('T')[0],
      targetDeliveryDate,
      technicalNotes,
      assignedTeam: existingOrder?.assignedTeam || 'Célula de Confecção / Parceiro Homologado',
    };

    onSaveOrder(savedOrder);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <Shirt className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold">
              {isEditing ? `Editar Ordem de Produção [${existingOrder?.id}]` : 'Emitir Nova Ordem de Produção (PCP)'}
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

          {/* PRD Gates: Confirmação de Sinal & Aprovação de Arte */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <span className="font-bold text-slate-900 text-xs uppercase flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>Portões de Liberação Fabril (Critérios Normativos A.3.2)</span>
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="flex items-center gap-2 p-2.5 bg-white border border-slate-200 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={entryPaymentConfirmed}
                  onChange={(e) => setEntryPaymentConfirmed(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <strong className="block text-slate-800">Sinal de Entrada Confirmado</strong>
                  <span className="text-[11px] text-slate-500">Comprovante de pagamento registrado</span>
                </div>
              </label>

              <label className="flex items-center gap-2 p-2.5 bg-white border border-slate-200 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={artApproved}
                  onChange={(e) => setArtApproved(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <strong className="block text-slate-800">Arte / Layout Aprovado</strong>
                  <span className="text-[11px] text-slate-500">Aceite formal do cliente arquivado</span>
                </div>
              </label>
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
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Parceiro Terceirizado / Facção (PRD 5.8)
              </label>
              <input
                type="text"
                value={outsourcedPartner}
                onChange={(e) => setOutsourcedPartner(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                placeholder="Ex: Facção Têxtil Maranhense"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Custo de Mão de Obra do Parceiro (R$/peça)
              </label>
              <input
                type="number"
                step="0.5"
                value={partnerCostPerPiece}
                onChange={(e) => setPartnerCostPerPiece(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-mono"
              />
            </div>
          </div>

          {/* Prazos e Prioridade */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Etapa Operacional
              </label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as OperationalStage)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
              >
                <option value="corte">1. Corte & Enfesto</option>
                <option value="bordado_silk">2. Bordado & Silk (Parceiro)</option>
                <option value="costura">3. Costura & Montagem</option>
                <option value="conferencia_qualidade">4. Inspeção de Qualidade</option>
                <option value="expedicao">5. Embalagem & Envio</option>
                <option value="entregue">Concluído / Entregue</option>
              </select>
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
              <input
                type="date"
                required
                value={targetDeliveryDate}
                onChange={(e) => setTargetDeliveryDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-mono"
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
              className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-500 cursor-pointer"
            >
              {isEditing ? 'Salvar Alterações da OP' : 'Emitir Ordem de Produção'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
