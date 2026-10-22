import React, { useState } from 'react';
import { X, Plus, Trash2, Calculator, FileText, CheckCircle, AlertTriangle, ShieldCheck, Lock } from 'lucide-react';
import { Quote, Client, QuoteItem, SizeGrid, CustomizationItem, UniformCategory, CostBreakdown } from '../types/erp';
import { initialPublicCatalog } from '../data/initialData';
import { getTotalFromSizeGrid, formatCurrencyBRL } from '../utils/formatters';
import { useAuth } from '../api/authContext';

interface NewQuoteModalProps {
  clients: Client[];
  onClose: () => void;
  onSaveQuote: (quote: Quote) => void;
}

export const NewQuoteModal: React.FC<NewQuoteModalProps> = ({
  clients,
  onClose,
  onSaveQuote,
}) => {
  const { user } = useAuth();
  const [selectedClient, setSelectedClient] = useState<Client | null>(clients[0] || null);
  const [sellerName, setSellerName] = useState(user.fullName || 'Mariana Alencar (Comercial)');
  const [validUntilDays, setValidUntilDays] = useState(15);
  
  // Regra do PRD: Entrada percentual fixa em 50% (Adendo A.3.2)
  const entryPercentage = 50;
  const [paymentTerms, setPaymentTerms] = useState('50% Sinal (Liberação de Corte) + 50% na Entrega das Peças');
  const [productionLeadDays, setProductionLeadDays] = useState(16);
  const [artApproved, setArtApproved] = useState(false);
  const [whatsAppContact, setWhatsAppContact] = useState(clients[0]?.phone || '(98) 98135-4130');
  const [notes, setNotes] = useState('Proposta inclui prova de tamanho e amostra física de cor antes do corte. Frete CIF incluso para São Luís e região metropolitana.');

  // Items list with PRD Cost Decomposition
  const [items, setItems] = useState<QuoteItem[]>([
    {
      id: 'item-1',
      modelName: 'Camisa Polo Corporativa Piquet',
      category: 'polos',
      fabricName: 'Malha Piquet PA 50/50',
      fabricColor: 'Azul Marinho / Vivos Brancos',
      sizes: { pp: 0, p: 20, m: 50, g: 40, gg: 15, xg: 5, exg: 0, sobMedida: 0 },
      totalQuantity: 130,
      costBreakdown: {
        materialUnitCost: 22.00,
        outsourcedSewingUnitCost: 12.00,
        customizationUnitCost: 6.50,
        freightPerUnit: 1.50,
        technicalLossPercentage: 2.0,
        calculatedBaseCost: 42.84,
        markupPercentage: 50.0, // Markup sobre custo (Regra B.2.1)
        suggestedUnitPrice: 64.26,
        negotiatedUnitPrice: 64.26,
        discountPercentage: 0,
        belowSuggestedAuthorized: false,
        estimatedMarginPercentage: 33.3,
      },
      unitFinalPrice: 64.26,
      totalPrice: 64.26 * 130,
      customizations: [
        {
          id: 'c-1',
          type: 'bordado_peito',
          description: 'Bordado logomarca alta definição no peito',
          location: 'Peito Esquerdo',
          unitCost: 6.50,
        }
      ],
    }
  ]);

  const handleClientSelect = (cId: string) => {
    const found = clients.find((c) => c.id === cId) || null;
    setSelectedClient(found);
    if (found) {
      setWhatsAppContact(found.phone);
    }
  };

  const handleAddItem = () => {
    const newItem: QuoteItem = {
      id: `item-${Date.now()}`,
      modelName: 'Calça Operacional Brim com Faixa 3M',
      category: 'calcas',
      fabricName: 'Brim Pesado 100% Algodão Santanense',
      fabricColor: 'Cinza Chumbo',
      sizes: { pp: 0, p: 15, m: 40, g: 35, gg: 10, xg: 0, exg: 0, sobMedida: 0 },
      totalQuantity: 100,
      costBreakdown: {
        materialUnitCost: 42.00,
        outsourcedSewingUnitCost: 18.00,
        customizationUnitCost: 11.00,
        freightPerUnit: 2.00,
        technicalLossPercentage: 3.0,
        calculatedBaseCost: 75.19,
        markupPercentage: 45.0,
        suggestedUnitPrice: 109.03,
        negotiatedUnitPrice: 109.00,
        discountPercentage: 0,
        belowSuggestedAuthorized: false,
        estimatedMarginPercentage: 31.0,
      },
      unitFinalPrice: 109.00,
      totalPrice: 109.00 * 100,
      customizations: [
        {
          id: `c-faixa-${Date.now()}`,
          type: 'faixa_refletiva',
          description: 'Faixa refletiva 3M 50mm tórax e pernas',
          location: 'Pernas',
          unitCost: 11.00,
        }
      ],
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleItemSizeChange = (itemIndex: number, sizeKey: keyof SizeGrid, value: number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== itemIndex) return item;
        const newSizes = { ...item.sizes, [sizeKey]: Math.max(0, value) };
        const newTotalQty = getTotalFromSizeGrid(newSizes);
        return {
          ...item,
          sizes: newSizes,
          totalQuantity: newTotalQty,
          totalPrice: item.unitFinalPrice * newTotalQty,
        };
      })
    );
  };

  // Pricing Engine recalculation (PRD Formula)
  const updateItemCostComponent = (
    itemIndex: number,
    field: keyof CostBreakdown,
    value: number | string | boolean
  ) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== itemIndex) return item;
        const cb = { ...item.costBreakdown, [field]: value };

        // Recalculate base cost: (Materials + Sewing + Customization + Freight) * (1 + Loss/100)
        const directSum = Number(cb.materialUnitCost || 0) + 
                          Number(cb.outsourcedSewingUnitCost || 0) + 
                          Number(cb.customizationUnitCost || 0) + 
                          Number(cb.freightPerUnit || 0);
        const lossFactor = 1 + (Number(cb.technicalLossPercentage || 0) / 100);
        const calculatedBaseCost = Math.round(directSum * lossFactor * 100) / 100;

        // Formula-base do PRD: Preço sugerido = Custo-base * (1 + Markup/100)
        const markupFactor = 1 + (Number(cb.markupPercentage || 0) / 100);
        const suggestedUnitPrice = Math.round(calculatedBaseCost * markupFactor * 100) / 100;

        // Negotiated price
        const negotiatedPrice = field === 'negotiatedUnitPrice' ? Number(value) : (cb.negotiatedUnitPrice || suggestedUnitPrice);
        
        // Authorization check if below suggested
        const isBelow = negotiatedPrice < suggestedUnitPrice;

        // Margem estimada calculada separadamente: (Preço - Custo) / Preço * 100
        const estimatedMargin = negotiatedPrice > 0 ? Math.round(((negotiatedPrice - calculatedBaseCost) / negotiatedPrice) * 1000) / 10 : 0;

        const updatedBreakdown: CostBreakdown = {
          ...cb,
          calculatedBaseCost,
          suggestedUnitPrice,
          negotiatedUnitPrice: negotiatedPrice,
          belowSuggestedAuthorized: isBelow ? cb.belowSuggestedAuthorized : false,
          estimatedMarginPercentage: estimatedMargin,
        };

        return {
          ...item,
          costBreakdown: updatedBreakdown,
          unitFinalPrice: negotiatedPrice,
          totalPrice: negotiatedPrice * item.totalQuantity,
        };
      })
    );
  };

  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const totalAmount = subtotal;
  const entryAmount = (totalAmount * entryPercentage) / 100;
  const balanceDue = totalAmount - entryAmount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedClient) {
      alert('Selecione um cliente para a proposta.');
      return;
    }

    if (items.length === 0) {
      alert('Adicione ao menos um item à proposta comercial.');
      return;
    }

    // Check if any item has price below suggested without authorization
    const unauthorizedItem = items.find(
      (it) => it.costBreakdown.negotiatedUnitPrice < it.costBreakdown.suggestedUnitPrice && !it.costBreakdown.belowSuggestedAuthorized
    );

    if (unauthorizedItem) {
      alert(`Alçada Violada: O item "${unauthorizedItem.modelName}" está com preço negociado (R$ ${unauthorizedItem.costBreakdown.negotiatedUnitPrice.toFixed(2)}) abaixo do sugerido (R$ ${unauthorizedItem.costBreakdown.suggestedUnitPrice.toFixed(2)}). Requer autorização formal de Administrador conforme o PRD v1.6 Adendo B.2.5.`);
      return;
    }

    const today = new Date();
    const validUntilDate = new Date(today.getTime() + validUntilDays * 86400000);
    const seqNum = Math.floor(1000 + Math.random() * 900);

    const newQuote: Quote = {
      id: `ORC-${today.getFullYear()}-${seqNum}`,
      version: 1,
      clientId: selectedClient.id,
      clientName: selectedClient.companyName || selectedClient.tradeName,
      clientCnpj: selectedClient.cnpj,
      clientContact: selectedClient.contactName,
      clientPhone: selectedClient.phone,
      clientEmail: selectedClient.email,
      sellerName,
      date: today.toISOString().split('T')[0],
      validUntil: validUntilDate.toISOString().split('T')[0],
      items,
      subtotal,
      discountPercentage: 0,
      totalAmount,
      entryPercentage,
      entryAmount,
      balanceDueAtDelivery: balanceDue,
      paymentTerms,
      productionLeadDays,
      status: 'enviado',
      whatsAppProof: {
        contactId: whatsAppContact,
        timestamp: new Date().toISOString(),
        notes: `Enviado para ${whatsAppContact} com confirmação de recebimento.`,
        manualConfirmation: true,
      },
      artApproved,
      notes,
    };

    onSaveQuote(newQuote);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-base font-bold">
                Motor de Orçamentos & Formação de Preço (PRD v1.6)
              </h2>
              <p className="text-[11px] text-slate-400">
                Markup Percentual sobre Custo-Base · Cálculo Separado de Margem Estimada
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[82vh] overflow-y-auto text-xs">
          
          {/* Client & Salesperson selection */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Cliente B2B *
              </label>
              <select
                value={selectedClient?.id || ''}
                onChange={(e) => handleClientSelect(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.tradeName} ({c.segment}) - CNPJ: {c.cnpj}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Contato WhatsApp para Aceite (PRD) *
              </label>
              <input
                type="text"
                required
                value={whatsAppContact}
                onChange={(e) => setWhatsAppContact(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-mono"
                placeholder="(98) 98135-4130"
              />
            </div>
          </div>

          {/* Items Section with Pricing Engine */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div>
                <span className="font-bold text-slate-900 text-sm">
                  Composição de Custos & Markup dos Fardamentos
                </span>
                <p className="text-slate-500 text-[11px]">
                  Fórmula: Custo-base = (Materiais + Costura + Personalização + Frete) × (1 + Perdas%)
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Adicionar Item</span>
              </button>
            </div>

            <div className="space-y-5">
              {items.map((item, index) => {
                const cb = item.costBreakdown;
                const isBelow = cb.negotiatedUnitPrice < cb.suggestedUnitPrice;

                return (
                  <div key={item.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                    
                    {/* Item Title and Remove */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-xs">Item {index + 1}:</span>
                        <input
                          type="text"
                          value={item.modelName}
                          onChange={(e) => {
                            const val = e.target.value;
                            setItems((prev) =>
                              prev.map((it, i) => (i === index ? { ...it, modelName: val } : it))
                            );
                          }}
                          className="px-2.5 py-1 border border-slate-300 rounded-lg font-bold text-slate-900 bg-white"
                        />
                        <span className="text-slate-500 text-[11px]">({item.fabricName})</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="font-mono text-slate-700">
                          Total: <strong className="text-blue-700">{item.totalQuantity} pçs</strong> ·{' '}
                          <strong className="text-slate-900">{formatCurrencyBRL(item.totalPrice)}</strong>
                        </div>
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Size Grid */}
                    <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                      <div className="text-[11px] font-bold text-slate-700 uppercase">
                        Grade de Tamanhos (Unidades)
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                        {(['pp', 'p', 'm', 'g', 'gg', 'xg', 'exg', 'sobMedida'] as (keyof SizeGrid)[]).map((sz) => (
                          <div key={sz} className="text-center">
                            <label className="block font-bold text-slate-500 uppercase text-[10px]">
                              {sz === 'sobMedida' ? 'SM' : sz}
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={item.sizes[sz]}
                              onChange={(e) => handleItemSizeChange(index, sz, parseInt(e.target.value) || 0)}
                              className="w-full px-1.5 py-1 text-center font-mono font-semibold border border-slate-200 rounded text-xs"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* PRD Component Breakdown (Transparent Costing) */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3 bg-white rounded-lg border border-slate-200">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500">
                          Tecido & Aviamentos (R$/un)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          value={cb.materialUnitCost}
                          onChange={(e) => updateItemCostComponent(index, 'materialUnitCost', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 border border-slate-300 rounded font-mono font-semibold text-xs mt-1"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500">
                          Costura Terceirizada (R$/un)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          value={cb.outsourcedSewingUnitCost}
                          onChange={(e) => updateItemCostComponent(index, 'outsourcedSewingUnitCost', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 border border-slate-300 rounded font-mono font-semibold text-xs mt-1"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500">
                          Personalização (Bord/Silk)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          value={cb.customizationUnitCost}
                          onChange={(e) => updateItemCostComponent(index, 'customizationUnitCost', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 border border-slate-300 rounded font-mono font-semibold text-xs mt-1"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500">
                          Perdas Técnicas (%)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          value={cb.technicalLossPercentage}
                          onChange={(e) => updateItemCostComponent(index, 'technicalLossPercentage', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 border border-slate-300 rounded font-mono font-semibold text-xs mt-1"
                        />
                      </div>

                      <div className="bg-slate-100 p-2 rounded flex flex-col justify-center">
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">Custo-Base Direto</span>
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          {formatCurrencyBRL(cb.calculatedBaseCost)}
                        </span>
                      </div>
                    </div>

                    {/* Markup vs Preço Negociado vs Margem */}
                    <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
                      <div>
                        <label className="block text-[10px] font-bold text-blue-900 uppercase">
                          Markup Aplicado (k %)
                        </label>
                        <div className="flex items-center gap-1.5 mt-1">
                          <input
                            type="number"
                            step="1"
                            value={cb.markupPercentage}
                            onChange={(e) => updateItemCostComponent(index, 'markupPercentage', parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 border border-blue-300 rounded bg-white font-mono font-bold text-xs"
                          />
                          <span className="font-bold text-blue-900">%</span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] text-blue-900 font-semibold block uppercase">
                          Preço Sugerido (Fórmula PRD)
                        </span>
                        <span className="font-mono font-bold text-slate-900 text-sm block mt-1">
                          {formatCurrencyBRL(cb.suggestedUnitPrice)}
                        </span>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-blue-900 uppercase">
                          Preço Negociado Final (R$)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          value={cb.negotiatedUnitPrice}
                          onChange={(e) => updateItemCostComponent(index, 'negotiatedUnitPrice', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 border border-blue-300 rounded bg-white font-mono font-bold text-xs mt-1"
                        />
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-600 block">
                          Margem Estimada (Receita)
                        </span>
                        <span className="font-mono font-bold text-emerald-700 text-sm block mt-0.5">
                          {cb.estimatedMarginPercentage}%
                        </span>
                      </div>
                    </div>

                    {/* Preço Abaixo do Sugerido: Alçada & Autorização Auditável (Adendo B.2.5) */}
                    {isBelow && (
                      <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <div className="text-[11px]">
                            <strong>Preço abaixo do sugerido!</strong> Sugerido: {formatCurrencyBRL(cb.suggestedUnitPrice)} | Praticado: {formatCurrencyBRL(cb.negotiatedUnitPrice)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {user.role === 'admin' ? (
                            <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-xs bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-md border border-amber-300 transition-colors">
                              <input
                                type="checkbox"
                                checked={cb.belowSuggestedAuthorized}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  updateItemCostComponent(index, 'belowSuggestedAuthorized', checked);
                                  updateItemCostComponent(index, 'authorizerName', checked ? `${user.fullName} (Administrador)` : '');
                                }}
                                className="rounded text-blue-600 focus:ring-blue-500"
                              />
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                              <span>{cb.belowSuggestedAuthorized ? `Autorizado por ${cb.authorizerName}` : 'Autorizar como Administrador'}</span>
                            </label>
                          ) : (
                            <div className="flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded border border-rose-200">
                              <Lock className="w-3 h-3 text-rose-600" />
                              <span>Alçada restrita a Administrador ({user.role})</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          </div>

          {/* Commercial Terms according to PRD */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 uppercase text-xs">
                  Condições Comerciais Homologadas
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  Entrada Fixa + Saldo na Entrega
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-semibold text-slate-700">
                      Sinal de Entrada (%)
                    </label>
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200">
                      Fixado 50% (PRD A.3.2)
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value="50.00%"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-700 font-mono font-bold cursor-not-allowed"
                    />
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3" />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Prazo de Fabricação (dias)
                  </label>
                  <input
                    type="number"
                    value={productionLeadDays}
                    onChange={(e) => setProductionLeadDays(parseInt(e.target.value) || 16)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Texto da Condição de Pagamento
                </label>
                <input
                  type="text"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>

              {/* Pre-condition: Layout approval */}
              <label className="flex items-center gap-2 p-2.5 bg-white border border-slate-200 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={artApproved}
                  onChange={(e) => setArtApproved(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-slate-700 font-medium text-[11px]">
                  <strong>Arte / Layout Personalizado já Aprovado</strong> (Pré-condição de liberação do corte no PRD)
                </span>
              </label>
            </div>

            {/* Totalizer */}
            <div className="flex flex-col justify-between p-4 bg-white rounded-lg border border-slate-200 space-y-3">
              <div className="space-y-2 font-mono text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal Geral dos Itens:</span>
                  <span className="font-bold">{formatCurrencyBRL(subtotal)}</span>
                </div>
                <div className="flex justify-between text-blue-700 font-semibold pt-1 border-t border-slate-100">
                  <span>Sinal de Entrada ({entryPercentage}%):</span>
                  <span>{formatCurrencyBRL(entryAmount)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Saldo a Pagar na Entrega:</span>
                  <span>{formatCurrencyBRL(balanceDue)}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900 uppercase">Total da Proposta:</span>
                <span className="text-2xl font-black font-mono text-blue-700">
                  {formatCurrencyBRL(totalAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-500 transition-colors shadow-sm cursor-pointer"
            >
              Salvar & Emitir Proposta (Versão 1)
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
