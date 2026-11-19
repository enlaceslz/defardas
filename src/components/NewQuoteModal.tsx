import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  FileText,
  AlertTriangle,
  ShieldCheck,
  Lock,
  Loader2,
  Sparkles,
} from 'lucide-react';
import {
  Quote,
  Client,
  QuoteItem,
  SizeGrid,
  UniformCategory,
  CostBreakdown,
  CommercialStatus,
} from '../types/erp';
import { initialPublicCatalog } from '../data/initialData';
import { getTotalFromSizeGrid, formatCurrencyBRL } from '../utils/formatters';
import { useAuth } from '../api/authContext';
import { CurrencyInput, DateInputBR, PhoneInputBR } from './FormInputs';
import { maskPhoneBR } from '../utils/masks';

interface NewQuoteModalProps {
  clients: Client[];
  existingQuote?: Quote | null;
  initialClientId?: string | null;
  onClose: () => void;
  onSaveQuote: (quote: Quote, isEdit: boolean) => Promise<boolean>;
}

const CATEGORY_OPTIONS: Array<{ value: UniformCategory; label: string }> = [
  { value: 'polos', label: 'Camisas Polo' },
  { value: 'camisetas', label: 'Camisetas Corporativas' },
  { value: 'jalecos', label: 'Jalecos & Aventais' },
  { value: 'calcas', label: 'Calças Operacionais' },
  { value: 'coletes', label: 'Coletes Refletivos' },
  { value: 'linha_social', label: 'Linha Social' },
  { value: 'linha_hospitalar', label: 'Linha Hospitalar / Scrubs' },
  { value: 'aventais_batas', label: 'Aventais & Batas' },
  { value: 'macacoes', label: 'Macacões Industriais' },
  { value: 'operacional', label: 'Operacional / NR-10' },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

function recalculateBreakdown(
  cb: CostBreakdown,
  field: keyof CostBreakdown,
  value: number | string | boolean,
  prevBreakdown: CostBreakdown
): CostBreakdown {
  const next: CostBreakdown = { ...cb, [field]: value };

  const directSum = round2(
    Math.max(0, Number(next.materialUnitCost || 0)) +
      Math.max(0, Number(next.outsourcedSewingUnitCost || 0)) +
      Math.max(0, Number(next.customizationUnitCost || 0)) +
      Math.max(0, Number(next.freightPerUnit || 0))
  );
  const lossPct = Math.min(50, Math.max(0, Number(next.technicalLossPercentage || 0)));
  const markupPct = Math.min(1000, Math.max(0, Number(next.markupPercentage || 0)));

  const calculatedBaseCost = round2(directSum * (1 + lossPct / 100));
  const suggestedUnitPrice = round2(calculatedBaseCost * (1 + markupPct / 100));

  const isCostOrMarkupField = [
    'materialUnitCost',
    'outsourcedSewingUnitCost',
    'customizationUnitCost',
    'freightPerUnit',
    'technicalLossPercentage',
    'markupPercentage',
  ].includes(field);

  const wasMatchingSuggested =
    Math.abs((prevBreakdown.negotiatedUnitPrice ?? 0) - (prevBreakdown.suggestedUnitPrice ?? 0)) < 0.01;

  const negotiatedPrice =
    field === 'negotiatedUnitPrice'
      ? round2(Math.max(0, Number(value)))
      : isCostOrMarkupField && wasMatchingSuggested
      ? suggestedUnitPrice
      : round2(Math.max(0, Number(next.negotiatedUnitPrice ?? suggestedUnitPrice)));

  const isBelow = negotiatedPrice < suggestedUnitPrice;
  const discountAmount = Math.max(0, round2(suggestedUnitPrice - negotiatedPrice));
  const discountPercentage =
    suggestedUnitPrice > 0 ? Math.round((discountAmount / suggestedUnitPrice) * 10000) / 100 : 0;

  // Margem estimada separada sobre receita (Adendo B.2.1): (Preço - Custo) / Preço * 100
  const estimatedMarginPercentage =
    negotiatedPrice > 0
      ? Math.round(((negotiatedPrice - calculatedBaseCost) / negotiatedPrice) * 10000) / 100
      : 0;

  return {
    ...next,
    technicalLossPercentage: lossPct,
    markupPercentage: markupPct,
    calculatedBaseCost,
    suggestedUnitPrice,
    negotiatedUnitPrice: negotiatedPrice,
    discountPercentage,
    belowSuggestedAuthorized: isBelow ? Boolean(next.belowSuggestedAuthorized) : false,
    authorizerName: isBelow && next.belowSuggestedAuthorized ? next.authorizerName : undefined,
    estimatedMarginPercentage,
  };
}

function buildDefaultItem(): QuoteItem {
  const sizes: SizeGrid = { pp: 0, p: 20, m: 50, g: 40, gg: 15, xg: 5, exg: 0, sobMedida: 0 };
  const totalQuantity = getTotalFromSizeGrid(sizes);
  const unitFinalPrice = 64.26;
  return {
    id: `item-${Date.now()}`,
    modelName: 'Camisa Polo Corporativa Piquet',
    category: 'polos',
    fabricName: 'Malha Piquet PA 50/50',
    fabricColor: 'Azul Marinho / Vivos Brancos',
    sizes,
    totalQuantity,
    costBreakdown: {
      materialUnitCost: 22.0,
      outsourcedSewingUnitCost: 12.0,
      customizationUnitCost: 6.5,
      freightPerUnit: 1.5,
      technicalLossPercentage: 2.0,
      calculatedBaseCost: 42.84,
      markupPercentage: 50.0,
      suggestedUnitPrice: 64.26,
      negotiatedUnitPrice: 64.26,
      discountPercentage: 0,
      belowSuggestedAuthorized: false,
      estimatedMarginPercentage: 33.33,
    },
    unitFinalPrice,
    totalPrice: round2(unitFinalPrice * totalQuantity),
    customizations: [
      {
        id: 'c-1',
        type: 'bordado_peito',
        description: 'Bordado logomarca alta definição no peito',
        location: 'Peito Esquerdo',
        unitCost: 6.5,
      },
    ],
  };
}

export const NewQuoteModal: React.FC<NewQuoteModalProps> = ({
  clients,
  existingQuote = null,
  initialClientId = null,
  onClose,
  onSaveQuote,
}) => {
  const { user } = useAuth();
  const isEdit = Boolean(existingQuote);

  const initialClient = existingQuote
    ? clients.find((c) => c.id === existingQuote.clientId) || clients[0] || null
    : initialClientId
      ? clients.find((c) => c.id === initialClientId) || clients[0] || null
      : clients[0] || null;

  const todayIso = new Date().toISOString().split('T')[0];
  const defaultValidIso = new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0];

  const [selectedClient, setSelectedClient] = useState<Client | null>(initialClient);
  const [sellerName] = useState(existingQuote?.sellerName || user?.fullName || 'Equipe Comercial');
  const [issueDate] = useState(existingQuote?.date || todayIso);
  const [validUntil, setValidUntil] = useState(existingQuote?.validUntil || defaultValidIso);
  const [commercialStatus, setCommercialStatus] = useState<CommercialStatus>(
    existingQuote && existingQuote.status !== 'convertido_em_pedido'
      ? existingQuote.status
      : 'enviado'
  );

  // Regra do PRD: Entrada percentual fixa em 50% (Adendo A.3.2)
  const entryPercentage = 50;
  const [paymentTerms, setPaymentTerms] = useState(
    existingQuote?.paymentTerms || '50% Sinal (Liberação de Corte) + 50% na Entrega das Peças'
  );
  const [productionLeadDays, setProductionLeadDays] = useState(existingQuote?.productionLeadDays || 16);
  const [artApproved, setArtApproved] = useState(Boolean(existingQuote?.artApproved));
  const [whatsAppContact, setWhatsAppContact] = useState(
    maskPhoneBR(existingQuote?.whatsAppProof?.contactId || existingQuote?.clientPhone || initialClient?.phone || '')
  );
  const [notes, setNotes] = useState(
    existingQuote?.notes ??
      'Proposta inclui prova de tamanho e amostra física de cor antes do corte. Frete CIF incluso para São Luís e região metropolitana.'
  );
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [items, setItems] = useState<QuoteItem[]>(() =>
    existingQuote && existingQuote.items.length > 0
      ? existingQuote.items.map((it) => ({
          ...it,
          sizes: { ...it.sizes },
          costBreakdown: { ...it.costBreakdown },
          customizations: [...(it.customizations || [])],
        }))
      : [buildDefaultItem()]
  );

  const handleClientSelect = (cId: string) => {
    const found = clients.find((c) => c.id === cId) || null;
    setSelectedClient(found);
    if (found?.phone) {
      setWhatsAppContact(maskPhoneBR(found.phone));
    }
  };

  const handleAddItem = (catalogPresetId?: string) => {
    const preset = catalogPresetId
      ? initialPublicCatalog.find((p) => p.id === catalogPresetId)
      : null;

    const sizes: SizeGrid = { pp: 0, p: 15, m: 40, g: 35, gg: 10, xg: 0, exg: 0, sobMedida: 0 };
    const totalQuantity = getTotalFromSizeGrid(sizes);

    const materialUnitCost = 42.0;
    const outsourcedSewingUnitCost = 18.0;
    const customizationUnitCost = 11.0;
    const freightPerUnit = 2.0;
    const technicalLossPercentage = 3.0;
    const directSum = round2(
      materialUnitCost + outsourcedSewingUnitCost + customizationUnitCost + freightPerUnit
    );
    const calculatedBaseCost = round2(directSum * (1 + technicalLossPercentage / 100));
    const markupPercentage = 45.0;
    const suggestedUnitPrice = round2(calculatedBaseCost * (1 + markupPercentage / 100));
    const estimatedMarginPercentage =
      suggestedUnitPrice > 0
        ? Math.round(((suggestedUnitPrice - calculatedBaseCost) / suggestedUnitPrice) * 10000) / 100
        : 0;

    const newItem: QuoteItem = {
      id: `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      modelName: preset?.title || 'Calça Operacional Brim com Faixa 3M',
      category: preset?.category || 'calcas',
      fabricName: preset?.recommendedFabrics?.[0] || 'Brim Pesado 100% Algodão Santanense',
      fabricColor: 'Cinza Chumbo',
      sizes,
      totalQuantity,
      costBreakdown: {
        materialUnitCost,
        outsourcedSewingUnitCost,
        customizationUnitCost,
        freightPerUnit,
        technicalLossPercentage,
        calculatedBaseCost,
        markupPercentage,
        suggestedUnitPrice,
        negotiatedUnitPrice: suggestedUnitPrice,
        discountPercentage: 0,
        belowSuggestedAuthorized: false,
        estimatedMarginPercentage,
      },
      unitFinalPrice: suggestedUnitPrice,
      totalPrice: round2(suggestedUnitPrice * totalQuantity),
      customizations: [],
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleItemFieldChange = (
    itemIndex: number,
    field: 'modelName' | 'fabricName' | 'fabricColor' | 'category',
    value: string
  ) => {
    setItems((prev) =>
      prev.map((item, i) => (i === itemIndex ? { ...item, [field]: value } : item))
    );
  };

  const handleItemSizeChange = (itemIndex: number, sizeKey: keyof SizeGrid, value: number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== itemIndex) return item;
        const newSizes = { ...item.sizes, [sizeKey]: Math.max(0, Math.floor(value)) };
        const newTotalQty = getTotalFromSizeGrid(newSizes);
        return {
          ...item,
          sizes: newSizes,
          totalQuantity: newTotalQty,
          totalPrice: round2(item.unitFinalPrice * newTotalQty),
        };
      })
    );
  };

  const updateItemCostComponent = (
    itemIndex: number,
    field: keyof CostBreakdown,
    value: number | string | boolean
  ) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== itemIndex) return item;
        const updatedBreakdown = recalculateBreakdown(
          item.costBreakdown,
          field,
          value,
          item.costBreakdown
        );
        return {
          ...item,
          costBreakdown: updatedBreakdown,
          unitFinalPrice: updatedBreakdown.negotiatedUnitPrice,
          totalPrice: round2(updatedBreakdown.negotiatedUnitPrice * item.totalQuantity),
        };
      })
    );
  };

  const suggestedTotal = round2(
    items.reduce((sum, item) => sum + item.costBreakdown.suggestedUnitPrice * item.totalQuantity, 0)
  );
  const totalBaseCost = round2(
    items.reduce((sum, item) => sum + item.costBreakdown.calculatedBaseCost * item.totalQuantity, 0)
  );
  const totalAmount = round2(items.reduce((sum, item) => sum + item.totalPrice, 0));
  const entryAmount = round2((totalAmount * entryPercentage) / 100);
  const balanceDue = round2(totalAmount - entryAmount);
  const overallMargin =
    totalAmount > 0 ? Math.round(((totalAmount - totalBaseCost) / totalAmount) * 10000) / 100 : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError('');

    if (!selectedClient) {
      setFormError('Selecione um cliente B2B para a proposta.');
      return;
    }

    if (validUntil < issueDate) {
      setFormError('A data de validade da proposta não pode ser anterior à data de emissão.');
      return;
    }

    if (!Number.isFinite(productionLeadDays) || productionLeadDays < 1 || productionLeadDays > 365) {
      setFormError('O prazo de fabricação deve estar entre 1 e 365 dias úteis.');
      return;
    }

    if (items.length === 0) {
      setFormError('Adicione ao menos um item à proposta comercial.');
      return;
    }

    const invalidQuantityItem = items.find((it) => !it.totalQuantity || it.totalQuantity <= 0);
    if (invalidQuantityItem) {
      setFormError(
        `Quantidade inválida no item "${invalidQuantityItem.modelName}". Informe ao menos 1 peça na grade de tamanhos.`
      );
      return;
    }

    const invalidPriceItem = items.find(
      (it) => !it.costBreakdown.negotiatedUnitPrice || it.costBreakdown.negotiatedUnitPrice <= 0
    );
    if (invalidPriceItem) {
      setFormError(
        `Preço negociado inválido no item "${invalidPriceItem.modelName}". O valor unitário deve ser maior que zero.`
      );
      return;
    }

    // Validação item a item da alçada (Adendo B.2.5)
    const unauthorizedItem = items.find(
      (it) =>
        it.costBreakdown.negotiatedUnitPrice < it.costBreakdown.suggestedUnitPrice &&
        !it.costBreakdown.belowSuggestedAuthorized
    );

    if (unauthorizedItem) {
      setFormError(
        `Alçada Violada: O item "${unauthorizedItem.modelName}" está com preço negociado (${formatCurrencyBRL(
          unauthorizedItem.costBreakdown.negotiatedUnitPrice
        )}) abaixo do sugerido (${formatCurrencyBRL(
          unauthorizedItem.costBreakdown.suggestedUnitPrice
        )}). Exige autorização formal de Administrador conforme PRD v1.6 Adendo B.2.5.`
      );
      return;
    }

    const discountAmount = Math.max(0, round2(suggestedTotal - totalAmount));
    const discountPercentage =
      suggestedTotal > 0 ? Math.round((discountAmount / suggestedTotal) * 10000) / 100 : 0;

    const payloadQuote: Quote = {
      id: existingQuote?.id || `ORC-DRAFT-${Date.now()}`,
      quoteNumber: existingQuote?.quoteNumber,
      version: existingQuote ? (existingQuote.version || 1) + 1 : 1,
      clientId: selectedClient.id,
      clientName: selectedClient.companyName || selectedClient.tradeName,
      clientCnpj: selectedClient.cnpj,
      clientContact: selectedClient.contactName,
      clientPhone: selectedClient.phone,
      clientEmail: selectedClient.email,
      sellerName,
      date: issueDate,
      validUntil,
      items,
      subtotal: totalAmount,
      discountPercentage,
      totalAmount,
      entryPercentage,
      entryAmount,
      balanceDueAtDelivery: balanceDue,
      paymentTerms: paymentTerms.trim() || '50% Sinal (Liberação de Corte) + 50% na Entrega',
      productionLeadDays: Math.floor(productionLeadDays),
      status: commercialStatus,
      whatsAppProof: {
        contactId: whatsAppContact,
        timestamp: new Date().toISOString(),
        notes: `Contato WhatsApp registrado: ${whatsAppContact}.`,
        manualConfirmation: true,
      },
      artApproved,
      notes: notes.trim(),
    };

    setIsSubmitting(true);
    try {
      const ok = await onSaveQuote(payloadQuote, isEdit);
      if (ok) {
        onClose();
      } else {
        setFormError(
          'O servidor rejeitou o salvamento da proposta. Verifique o aviso no topo e ajuste os dados antes de tentar novamente.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-base font-bold">
                {isEdit
                  ? `Revisar Proposta ${existingQuote?.quoteNumber || ''} (v${(existingQuote?.version || 1) + 1})`
                  : 'Motor de Orçamentos & Formação de Preço (PRD v1.6)'}
              </h2>
              <p className="text-[11px] text-slate-400">
                Markup Percentual sobre Custo-Base (Adendo B.2.1) · Margem Gerencial Calculada Separadamente
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[82vh] overflow-y-auto text-xs">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg font-medium flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Client, WhatsApp, Validade e Status */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Cliente B2B *</label>
              <select
                value={selectedClient?.id || ''}
                onChange={(e) => handleClientSelect(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName || c.tradeName} ({c.segment}) — CNPJ: {c.cnpj}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                WhatsApp para Aceite *
              </label>
              <PhoneInputBR
                value={whatsAppContact}
                onChange={setWhatsAppContact}
                required
                placeholder="(98) 98135-4130"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Válido Até *</label>
              <DateInputBR value={validUntil} onChange={setValidUntil} required />
            </div>
          </div>

          {/* Items Section with Pricing Engine */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <div>
                <span className="font-bold text-slate-900 text-sm">
                  Composição de Custos & Markup dos Fardamentos
                </span>
                <p className="text-slate-500 text-[11px]">
                  Fórmula: Custo-base = (Materiais + Costura + Personalização + Frete) × (1 + Perdas%)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddItem(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">+ Adicionar do Catálogo...</option>
                  {initialPublicCatalog.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.title} ({cat.recommendedFabrics[0] || cat.category})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleAddItem()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Item Avulso</span>
                </button>
              </div>
            </div>

            <div className="space-y-5">
              {items.map((item, index) => {
                const cb = item.costBreakdown;
                const isBelowSuggested = cb.negotiatedUnitPrice < cb.suggestedUnitPrice;
                const isBelowBaseCost =
                  cb.calculatedBaseCost > 0 && cb.negotiatedUnitPrice < cb.calculatedBaseCost;

                return (
                  <div
                    key={item.id}
                    className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4"
                  >
                    {/* Item Title, Category, Fabric, Color */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 flex-1">
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">
                            Item {index + 1} — Modelo / Descrição
                          </label>
                          <input
                            type="text"
                            required
                            value={item.modelName}
                            onChange={(e) => handleItemFieldChange(index, 'modelName', e.target.value)}
                            className="w-full mt-0.5 px-2.5 py-1.5 border border-slate-300 rounded-lg font-bold text-slate-900 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">
                            Categoria
                          </label>
                          <select
                            value={item.category}
                            onChange={(e) => handleItemFieldChange(index, 'category', e.target.value)}
                            className="w-full mt-0.5 px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800"
                          >
                            {CATEGORY_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">
                            Cor Principal
                          </label>
                          <input
                            type="text"
                            value={item.fabricColor}
                            onChange={(e) => handleItemFieldChange(index, 'fabricColor', e.target.value)}
                            className="w-full mt-0.5 px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800"
                          />
                        </div>
                        <div className="sm:col-span-4">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">
                            Especificação do Tecido
                          </label>
                          <input
                            type="text"
                            value={item.fabricName}
                            onChange={(e) => handleItemFieldChange(index, 'fabricName', e.target.value)}
                            className="w-full mt-0.5 px-2.5 py-1 border border-slate-300 rounded-lg bg-white text-slate-700"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between lg:flex-col lg:items-end gap-2 shrink-0">
                        <div className="font-mono text-slate-700 text-right">
                          <span className="text-[11px] block">
                            Lote: <strong className="text-blue-700">{item.totalQuantity} pçs</strong>
                          </span>
                          <strong className="text-sm text-slate-900">
                            {formatCurrencyBRL(item.totalPrice)}
                          </strong>
                        </div>
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="inline-flex items-center gap-1 text-[11px] text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-md cursor-pointer"
                            title="Remover item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remover</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Size Grid */}
                    <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700 uppercase">
                          Grade de Tamanhos (Unidades)
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">
                          Soma da grade: <strong className="text-slate-900">{item.totalQuantity} pçs</strong>
                        </span>
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                        {(['pp', 'p', 'm', 'g', 'gg', 'xg', 'exg', 'sobMedida'] as (keyof SizeGrid)[]).map(
                          (sz) => (
                            <div key={sz} className="text-center">
                              <label className="block font-bold text-slate-500 uppercase text-[10px]">
                                {sz === 'sobMedida' ? 'SM' : sz}
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={item.sizes[sz]}
                                onChange={(e) =>
                                  handleItemSizeChange(index, sz, parseInt(e.target.value, 10) || 0)
                                }
                                className="w-full px-1.5 py-1 text-center font-mono font-semibold border border-slate-200 rounded text-xs"
                              />
                            </div>
                          )
                        )}
                      </div>
                    </div>

                    {/* PRD Component Breakdown (Transparent Costing) */}
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 p-3 bg-white rounded-lg border border-slate-200">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500">
                          Tecido & Aviamentos (R$/un)
                        </label>
                        <CurrencyInput
                          compact
                          value={cb.materialUnitCost}
                          onChange={(val) => updateItemCostComponent(index, 'materialUnitCost', val)}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500">
                          Costura Facção (R$/un)
                        </label>
                        <CurrencyInput
                          compact
                          value={cb.outsourcedSewingUnitCost}
                          onChange={(val) =>
                            updateItemCostComponent(index, 'outsourcedSewingUnitCost', val)
                          }
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500">
                          Bordado / Silk (R$/un)
                        </label>
                        <CurrencyInput
                          compact
                          value={cb.customizationUnitCost}
                          onChange={(val) =>
                            updateItemCostComponent(index, 'customizationUnitCost', val)
                          }
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500">
                          Frete Rateado (R$/un)
                        </label>
                        <CurrencyInput
                          compact
                          value={cb.freightPerUnit}
                          onChange={(val) => updateItemCostComponent(index, 'freightPerUnit', val)}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500">
                          Perdas Técnicas (%)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="50"
                          step="0.5"
                          value={cb.technicalLossPercentage}
                          onChange={(e) =>
                            updateItemCostComponent(
                              index,
                              'technicalLossPercentage',
                              Math.min(50, Math.max(0, parseFloat(e.target.value) || 0))
                            )
                          }
                          className="w-full px-2 py-1 border border-slate-300 rounded font-mono font-semibold text-xs mt-1"
                        />
                      </div>

                      <div className="bg-slate-100 p-2 rounded flex flex-col justify-center">
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">
                          Custo-Base Direto
                        </span>
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          {formatCurrencyBRL(cb.calculatedBaseCost)}
                        </span>
                      </div>
                    </div>

                    {/* Markup vs Preço Negociado vs Margem */}
                    <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
                      <div>
                        <label className="block text-[10px] font-bold text-blue-900 uppercase">
                          Markup sobre Custo (k %)
                        </label>
                        <div className="flex items-center gap-1.5 mt-1">
                          <input
                            type="number"
                            min="0"
                            max="1000"
                            step="1"
                            value={cb.markupPercentage}
                            onChange={(e) =>
                              updateItemCostComponent(
                                index,
                                'markupPercentage',
                                Math.max(0, parseFloat(e.target.value) || 0)
                              )
                            }
                            className="w-20 px-2 py-1 border border-blue-300 rounded bg-white font-mono font-bold text-xs"
                          />
                          <span className="font-bold text-blue-900">%</span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] text-blue-900 font-semibold block uppercase">
                          Preço Sugerido (Adendo B.2.1)
                        </span>
                        <span className="font-mono font-bold text-slate-900 text-sm block mt-1">
                          {formatCurrencyBRL(cb.suggestedUnitPrice)}
                        </span>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-blue-900 uppercase">
                          Preço Negociado Final (R$)
                        </label>
                        <CurrencyInput
                          compact
                          value={cb.negotiatedUnitPrice}
                          onChange={(val) =>
                            updateItemCostComponent(index, 'negotiatedUnitPrice', val)
                          }
                          className="mt-1"
                        />
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-600 block">
                          Margem Estimada (Receita)
                        </span>
                        <span
                          className={`font-mono font-bold text-sm block mt-0.5 ${
                            cb.estimatedMarginPercentage < 0
                              ? 'text-rose-700'
                              : cb.estimatedMarginPercentage < 15
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {cb.estimatedMarginPercentage.toFixed(2)}%
                        </span>
                        {cb.discountPercentage > 0 && (
                          <span className="text-[10px] font-mono text-amber-700 block">
                            Desc.: -{cb.discountPercentage.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Alerta de Margem Negativa (Abaixo do Custo-Base) */}
                    {isBelowBaseCost && (
                      <div className="p-2.5 bg-rose-50 border border-rose-300 rounded-lg text-rose-800 text-[11px] flex items-center gap-2 font-semibold">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>
                          Atenção: Preço negociado ({formatCurrencyBRL(cb.negotiatedUnitPrice)}) está
                          ABAIXO do custo-base ({formatCurrencyBRL(cb.calculatedBaseCost)}), gerando
                          margem negativa ({cb.estimatedMarginPercentage.toFixed(2)}%).
                        </span>
                      </div>
                    )}

                    {/* Preço Abaixo do Sugerido: Alçada & Autorização Auditável (Adendo B.2.5) */}
                    {isBelowSuggested && (
                      <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <div className="text-[11px]">
                            <strong>Preço abaixo do sugerido!</strong> Sugerido:{' '}
                            {formatCurrencyBRL(cb.suggestedUnitPrice)} | Praticado:{' '}
                            {formatCurrencyBRL(cb.negotiatedUnitPrice)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {user?.role === 'admin' ? (
                            <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-xs bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-md border border-amber-300 transition-colors">
                              <input
                                type="checkbox"
                                checked={cb.belowSuggestedAuthorized}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  updateItemCostComponent(index, 'belowSuggestedAuthorized', checked);
                                  updateItemCostComponent(
                                    index,
                                    'authorizerName',
                                    checked ? `${user?.fullName || 'Admin'} (Administrador)` : ''
                                  );
                                }}
                                className="rounded text-blue-600 focus:ring-blue-500"
                              />
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                              <span>
                                {cb.belowSuggestedAuthorized
                                  ? `Autorizado por ${cb.authorizerName}`
                                  : 'Autorizar como Administrador'}
                              </span>
                            </label>
                          ) : (
                            <div className="flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded border border-rose-200">
                              <Lock className="w-3 h-3 text-rose-600" />
                              <span>
                                Alçada restrita a Administrador ({user?.role || 'não autenticado'})
                              </span>
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

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Sinal (PRD A.3.2)</label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value="50.00%"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-700 font-mono font-bold cursor-not-allowed"
                    />
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Prazo (dias úteis)</label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    required
                    value={productionLeadDays}
                    onChange={(e) =>
                      setProductionLeadDays(Math.max(1, parseInt(e.target.value, 10) || 1))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status Inicial</label>
                  <select
                    value={commercialStatus}
                    onChange={(e) => setCommercialStatus(e.target.value as CommercialStatus)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white text-slate-800"
                  >
                    <option value="rascunho">Rascunho</option>
                    <option value="enviado">Enviado</option>
                    <option value="em_negociacao">Em Negociação</option>
                    <option value="aprovado">Aprovado</option>
                  </select>
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

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Observações Comerciais (exibidas na proposta impressa)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs"
                  placeholder="Ex.: Inclui grade de provas, amostra física e frete CIF São Luís..."
                />
              </div>

              <label className="flex items-center gap-2 p-2.5 bg-white border border-slate-200 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={artApproved}
                  onChange={(e) => setArtApproved(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-slate-700 font-medium text-[11px]">
                  <strong>Arte / Layout Personalizado já Aprovado</strong> (Pré-condição do Gate A.3.2)
                </span>
              </label>
            </div>

            {/* Totalizer */}
            <div className="flex flex-col justify-between p-4 bg-white rounded-lg border border-slate-200 space-y-3">
              <div className="space-y-2 font-mono text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Custo-Base Total Estimado:</span>
                  <span>{formatCurrencyBRL(totalBaseCost)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Preço Sugerido Total (Markup):</span>
                  <span>{formatCurrencyBRL(suggestedTotal)}</span>
                </div>
                {suggestedTotal > totalAmount && (
                  <div className="flex justify-between text-amber-700 font-semibold">
                    <span>Desconto Concedido:</span>
                    <span>-{formatCurrencyBRL(round2(suggestedTotal - totalAmount))}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600 pt-1 border-t border-slate-100">
                  <span>Margem Gerencial Ponderada:</span>
                  <span
                    className={`font-bold ${
                      overallMargin < 0 ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {overallMargin.toFixed(2)}%
                  </span>
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
              disabled={isSubmitting}
              className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-500 transition-colors shadow-sm cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>
                {isEdit
                  ? `Salvar Revisão (v${(existingQuote?.version || 1) + 1})`
                  : 'Salvar & Emitir Proposta (Versão 1)'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
