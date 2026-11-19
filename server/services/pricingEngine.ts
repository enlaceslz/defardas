/**
 * DE FARDAS ERP — Pricing & Markup Engine
 * Normativo: PRD v1.6 e Adendos B.2.1, A.3.1, B.2.5
 *
 * Regra Aprovada (Adendo B.2.1): MARKUP PERCENTUAL SOBRE CUSTO (k%):
 *   Custo-base = (Materiais + Costura + Personalização + Frete) × (1 + PerdaTécnica/100)
 *   Preço Sugerido = Custo-base × (1 + k/100)
 *
 * Margem Gerencial Estimada sobre a Receita (calculada separadamente):
 *   Margem (%) = ((Preço Negociado - Custo-base) / Preço Negociado) × 100
 */

export interface PricingInput {
  materialUnitCost: number;
  outsourcedSewingUnitCost: number;
  customizationUnitCost: number;
  freightUnitCost: number;
  technicalLossPercentage: number;
  markupPercentage: number;
  negotiatedUnitPrice?: number;
}

export interface PricingResult {
  directUnitCost: number;
  calculatedBaseUnitCost: number;
  suggestedUnitPrice: number;
  negotiatedUnitPrice: number;
  discountAmount: number;
  discountPercentage: number;
  isBelowSuggested: boolean;
  isBelowBaseCost: boolean;
  estimatedMarginPercentage: number;
}

export interface QuoteTotalsResult {
  totalBaseCost: number;
  suggestedTotalAmount: number;
  negotiatedTotalAmount: number;
  discountAmount: number;
  effectiveMarkupPercentage: number;
  estimatedMarginPercentage: number;
  entryPercentage: 50.00;
  entryAmount: number;
  balanceAmount: number;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseNonNegativeFinite(value: unknown, label: string): number {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`${label} deve ser um número válido maior ou igual a zero.`);
  }
  return num;
}

export class PricingEngine {
  /**
   * Calcula o preço unitário e a margem com arredondamento contábil em 2 casas decimais.
   */
  public static calculateItemPricing(input: PricingInput): PricingResult {
    const material = parseNonNegativeFinite(input.materialUnitCost, 'Custo de material');
    const sewing = parseNonNegativeFinite(input.outsourcedSewingUnitCost, 'Custo de costura terceirizada');
    const customization = parseNonNegativeFinite(input.customizationUnitCost, 'Custo de personalização');
    const freight = parseNonNegativeFinite(input.freightUnitCost, 'Custo de frete rateado');
    const lossPct = parseNonNegativeFinite(input.technicalLossPercentage, 'Percentual de perda técnica');
    const markupPct = parseNonNegativeFinite(input.markupPercentage, 'Percentual de markup');

    if (lossPct > 50) {
      throw new Error('O percentual de perda técnica não pode exceder 50%.');
    }
    if (markupPct > 1000) {
      throw new Error('O percentual de markup informado excede o limite operacional (1.000%).');
    }

    // 1. Custo direto
    const directUnitCost = roundMoney(material + sewing + customization + freight);

    // 2. Custo-base acrescido da perda técnica
    const lossMultiplier = 1 + lossPct / 100;
    const calculatedBaseUnitCost = roundMoney(directUnitCost * lossMultiplier);

    // 3. Preço sugerido: Custo-base * (1 + Markup/100) [Adendo B.2.1]
    const markupMultiplier = 1 + markupPct / 100;
    const suggestedUnitPrice = roundMoney(calculatedBaseUnitCost * markupMultiplier);

    // 4. Preço praticado/negociado
    let negotiatedUnitPrice = suggestedUnitPrice;
    if (input.negotiatedUnitPrice !== undefined && input.negotiatedUnitPrice !== null) {
      const parsedNegotiated = Number(input.negotiatedUnitPrice);
      if (!Number.isFinite(parsedNegotiated) || parsedNegotiated <= 0) {
        throw new Error('O preço unitário negociado deve ser um valor numérico maior que zero.');
      }
      negotiatedUnitPrice = roundMoney(parsedNegotiated);
    } else if (suggestedUnitPrice <= 0) {
      throw new Error('Informe os componentes de custo ou um preço unitário negociado maior que zero.');
    }

    // 5. Desconto em relação ao sugerido
    const discountAmount = Math.max(0, roundMoney(suggestedUnitPrice - negotiatedUnitPrice));
    const discountPercentage =
      suggestedUnitPrice > 0 ? Math.round((discountAmount / suggestedUnitPrice) * 10000) / 100 : 0;

    const isBelowSuggested = negotiatedUnitPrice < suggestedUnitPrice;
    const isBelowBaseCost = calculatedBaseUnitCost > 0 && negotiatedUnitPrice < calculatedBaseUnitCost;

    // 6. Margem Gerencial Estimada sobre a Receita: (Preço - Custo) / Preço * 100
    const estimatedMarginPercentage =
      negotiatedUnitPrice > 0
        ? Math.round(((negotiatedUnitPrice - calculatedBaseUnitCost) / negotiatedUnitPrice) * 10000) / 100
        : 0;

    return {
      directUnitCost,
      calculatedBaseUnitCost,
      suggestedUnitPrice,
      negotiatedUnitPrice,
      discountAmount,
      discountPercentage,
      isBelowSuggested,
      isBelowBaseCost,
      estimatedMarginPercentage,
    };
  }

  /**
   * Consolida totais financeiros, markup efetivo, margem ponderada e sinal fixo de 50%.
   */
  public static calculateQuoteTotals(
    items: Array<{
      calculatedBaseUnitCost: number;
      suggestedUnitPrice: number;
      negotiatedUnitPrice: number;
      totalItemPrice: number;
      totalQuantity: number;
      markupPercentage: number;
    }>
  ): QuoteTotalsResult {
    const totalBaseCost = roundMoney(
      items.reduce((sum, item) => sum + item.calculatedBaseUnitCost * item.totalQuantity, 0)
    );
    const suggestedTotalAmount = roundMoney(
      items.reduce((sum, item) => sum + item.suggestedUnitPrice * item.totalQuantity, 0)
    );
    const negotiatedTotalAmount = roundMoney(
      items.reduce((sum, item) => sum + item.totalItemPrice, 0)
    );
    const discountAmount = Math.max(0, roundMoney(suggestedTotalAmount - negotiatedTotalAmount));

    const effectiveMarkupPercentage =
      totalBaseCost > 0
        ? Math.round(((suggestedTotalAmount - totalBaseCost) / totalBaseCost) * 10000) / 100
        : items[0]?.markupPercentage ?? 50.0;

    const estimatedMarginPercentage =
      negotiatedTotalAmount > 0
        ? Math.round(((negotiatedTotalAmount - totalBaseCost) / negotiatedTotalAmount) * 10000) / 100
        : 0;

    const entryAmount = roundMoney(negotiatedTotalAmount * 0.5);
    const balanceAmount = roundMoney(negotiatedTotalAmount - entryAmount);

    return {
      totalBaseCost,
      suggestedTotalAmount,
      negotiatedTotalAmount,
      discountAmount,
      effectiveMarkupPercentage,
      estimatedMarginPercentage,
      entryPercentage: 50.00,
      entryAmount,
      balanceAmount,
    };
  }

  /**
   * Valida a condição do sinal de 50% fixado no PRD v1.6.
   * Não pode ser alterado sem autorização formal da diretoria da DE FARDAS.
   */
  public static validateEntryPercentage(percentage: number): boolean {
    const num = Number(percentage);
    return Number.isFinite(num) && Math.abs(num - 50.0) < 0.01;
  }
}
