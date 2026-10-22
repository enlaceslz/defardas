/**
 * DE FARDAS ERP — Pricing & Markup Engine
 * Normativo: PRD v1.6 e Adendos B.2.1, A.3.1
 * 
 * Regra Aprovada: MARKUP PERCENTUAL SOBRE CUSTO (k%):
 * Preço Sugerido = Custo-base * (1 + k/100)
 * 
 * Margem Gerencial Estimada sobre a Receita:
 * Margem (%) = ((Preço Negociado - Custo-base) / Preço Negociado) * 100
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
  estimatedMarginPercentage: number;
}

export class PricingEngine {
  /**
   * Calcula o preço unitário e a margem com arredondamento contábil em 2 casas decimais.
   */
  public static calculateItemPricing(input: PricingInput): PricingResult {
    const material = Number(input.materialUnitCost || 0);
    const sewing = Number(input.outsourcedSewingUnitCost || 0);
    const customization = Number(input.customizationUnitCost || 0);
    const freight = Number(input.freightUnitCost || 0);
    const lossPct = Math.max(0, Number(input.technicalLossPercentage || 0));
    const markupPct = Math.max(0, Number(input.markupPercentage || 0));

    // 1. Custo direto
    const directUnitCost = Math.round((material + sewing + customization + freight) * 100) / 100;

    // 2. Custo-base acrescido da perda técnica
    const lossMultiplier = 1 + (lossPct / 100);
    const calculatedBaseUnitCost = Math.round(directUnitCost * lossMultiplier * 100) / 100;

    // 3. Preço sugerido: Custo-base * (1 + Markup/100) [Adendo B.2.1]
    const markupMultiplier = 1 + (markupPct / 100);
    const suggestedUnitPrice = Math.round(calculatedBaseUnitCost * markupMultiplier * 100) / 100;

    // 4. Preço praticado/negociado
    const negotiatedUnitPrice = input.negotiatedUnitPrice !== undefined && input.negotiatedUnitPrice > 0
      ? Math.round(Number(input.negotiatedUnitPrice) * 100) / 100
      : suggestedUnitPrice;

    // 5. Desconto em relação ao sugerido
    const discountAmount = Math.max(0, Math.round((suggestedUnitPrice - negotiatedUnitPrice) * 100) / 100);
    const discountPercentage = suggestedUnitPrice > 0
      ? Math.round((discountAmount / suggestedUnitPrice) * 10000) / 100
      : 0;

    const isBelowSuggested = negotiatedUnitPrice < suggestedUnitPrice;

    // 6. Margem Gerencial Estimada sobre a Receita: (Preço - Custo) / Preço * 100
    const estimatedMarginPercentage = negotiatedUnitPrice > 0
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
      estimatedMarginPercentage,
    };
  }

  /**
   * Valida a condição do sinal de 50% fixado no PRD v1.6.
   * Não pode ser alterado sem autorização formal da diretoria da DE FARDAS.
   */
  public static validateEntryPercentage(percentage: number): boolean {
    return Math.abs(percentage - 50.0) < 0.01;
  }
}
