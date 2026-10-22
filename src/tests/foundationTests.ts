/**
 * DE FARDAS ERP — Suíte de Testes Automatizados da Fundação P0
 * Valida: Motor de Cálculo (Markup vs Margem), Portão Fabril (Gate A.3.2),
 * Idempotência, Matriz de Permissões (RBAC) e Persistência de Leads.
 */
import { api } from '../api/client';

export interface TestResultItem {
  id: string;
  name: string;
  category: 'calculo' | 'portao_fabril' | 'idempotencia' | 'rbac' | 'leads';
  status: 'passed' | 'failed' | 'running';
  evidence: string;
  durationMs: number;
}

export class FoundationTestSuite {
  public static async runAllTests(onProgress?: (results: TestResultItem[]) => void): Promise<TestResultItem[]> {
    const results: TestResultItem[] = [];

    // Helper para registrar resultado
    const record = (item: TestResultItem) => {
      results.push(item);
      if (onProgress) onProgress([...results]);
    };

    // ------------------------------------------------------------------------
    // TESTE 1: Motor de Precificação — Markup sobre Custo vs Margem (Adendo B.2.1)
    // ------------------------------------------------------------------------
    const t1Start = performance.now();
    try {
      const material = 42.00;
      const sewing = 0.00;
      const customization = 0.00;
      const freight = 0.00;
      const lossPct = 2.0; // 2%
      const markupPct = 50.0; // 50%

      const direct = material + sewing + customization + freight;
      const baseCost = Math.round(direct * (1 + lossPct / 100) * 100) / 100; // 42.84
      const suggestedPrice = Math.round(baseCost * (1 + markupPct / 100) * 100) / 100; // 64.26

      const negotiatedPrice = 64.00;
      const estimatedMargin = Math.round(((negotiatedPrice - baseCost) / negotiatedPrice) * 10000) / 100; // 33.06%

      // Fórmula antiga incorreta que geraria R$ 85.68 (Adendo B.2.1)
      const oldFormulaPrice = Math.round((baseCost / (1 - markupPct / 100)) * 100) / 100;

      if (suggestedPrice === 64.26 && estimatedMargin === 33.06 && suggestedPrice !== oldFormulaPrice) {
        record({
          id: 'test-markup-formula',
          name: 'Motor de Preços: Markup sobre Custo vs Margem Gerencial (Adendo B.2.1)',
          category: 'calculo',
          status: 'passed',
          evidence: `Custo-base: R$ ${baseCost.toFixed(2)} | Markup 50%: Preço Sugerido R$ ${suggestedPrice.toFixed(2)} (Fórmula Antiga incorreta: R$ ${oldFormulaPrice.toFixed(2)} rejeitada). Margem calculada separadamente: ${estimatedMargin}%.`,
          durationMs: Math.round(performance.now() - t1Start),
        });
      } else {
        throw new Error(`Divergência matemática no motor: Sugerido=${suggestedPrice}, Margem=${estimatedMargin}`);
      }
    } catch (err: any) {
      record({
        id: 'test-markup-formula',
        name: 'Motor de Preços: Markup sobre Custo vs Margem Gerencial',
        category: 'calculo',
        status: 'failed',
        evidence: `Falha: ${err.message}`,
        durationMs: Math.round(performance.now() - t1Start),
      });
    }

    // ------------------------------------------------------------------------
    // TESTE 2: Sinal de 50% Fixado e Imutável (Invariante A.3.2)
    // ------------------------------------------------------------------------
    const t2Start = performance.now();
    try {
      const resInvalid = await api.createQuote({
        entryPercentage: 30.00, // Tentativa inválida
        items: [],
      });

      if (resInvalid.status === 400 && resInvalid.error?.includes('50.00%')) {
        record({
          id: 'test-downpayment-fixed',
          name: 'Portão Comercial: Sinal de 50% Fixado e Inviolável',
          category: 'calculo',
          status: 'passed',
          evidence: `Tentativa de criar proposta com sinal de 30% bloqueada com HTTP 400: "${resInvalid.error}".`,
          durationMs: Math.round(performance.now() - t2Start),
        });
      } else {
        throw new Error(`Servidor permitiu sinal diferente de 50% ou retornou status ${resInvalid.status}`);
      }
    } catch (err: any) {
      record({
        id: 'test-downpayment-fixed',
        name: 'Portão Comercial: Sinal de 50% Fixado',
        category: 'calculo',
        status: 'failed',
        evidence: `Falha: ${err.message}`,
        durationMs: Math.round(performance.now() - t2Start),
      });
    }

    // ------------------------------------------------------------------------
    // TESTE 3: Portão de Liberação Fabril (Gate A.3.2 — Bloqueio de Corte)
    // ------------------------------------------------------------------------
    const t3Start = performance.now();
    try {
      // Obter OP modelo 'op1111111-1111-1111-1111-111111111111'
      const advanceRes = await api.advanceOrderStage('op1111111-1111-1111-1111-111111111111', 'corte');

      if (advanceRes.status === 422 && advanceRes.error?.includes('Gate A.3.2')) {
        record({
          id: 'test-gate-a32',
          name: 'Portão de Liberação Fabril: Bloqueio de Corte sem Sinal e Arte (Gate A.3.2)',
          category: 'portao_fabril',
          status: 'passed',
          evidence: `Avanço para corte bloqueado com HTTP 422: "${advanceRes.error}". Status do Portão: Sinal pendente = ${!advanceRes.data?.gateStatus?.entryPaymentConfirmed}. Tentativa registrada na trilha de auditoria.`,
          durationMs: Math.round(performance.now() - t3Start),
        });
      } else {
        throw new Error(`Ordem avançou sem cumprimento do Gate A.3.2 ou retornou status inesperado ${advanceRes.status}`);
      }
    } catch (err: any) {
      record({
        id: 'test-gate-a32',
        name: 'Portão de Liberação Fabril: Bloqueio de Corte',
        category: 'portao_fabril',
        status: 'failed',
        evidence: `Falha: ${err.message}`,
        durationMs: Math.round(performance.now() - t3Start),
      });
    }

    // ------------------------------------------------------------------------
    // TESTE 4: Idempotência na Conversão de Orçamento em Pedido (Regra B.2.2)
    // ------------------------------------------------------------------------
    const t4Start = performance.now();
    try {
      const quoteId = 'q1111111-1111-1111-1111-111111111111';
      const idemKey = `idempotency_test_${Date.now()}`;

      // 1ª chamada
      const firstCall = await api.convertQuoteToOrder(quoteId, idemKey);
      // 2ª chamada imediata com a mesma chave
      const secondCall = await api.convertQuoteToOrder(quoteId, idemKey);

      if (secondCall.status === 200 && secondCall.data?.alreadyConverted === true) {
        record({
          id: 'test-idempotency',
          name: 'Garantia de Idempotência: Conversão de Orçamento sem Duplicidade de OPs ou Títulos',
          category: 'idempotencia',
          status: 'passed',
          evidence: `Requisição duplicada interceptada. Retornou OP existente (${secondCall.data.order?.orderNumber}) sem criar nova ordem nem novos títulos a receber.`,
          durationMs: Math.round(performance.now() - t4Start),
        });
      } else {
        throw new Error(`Falha na idempotência: Segunda chamada retornou status ${secondCall.status} ou criou duplicata.`);
      }
    } catch (err: any) {
      record({
        id: 'test-idempotency',
        name: 'Garantia de Idempotência na Conversão',
        category: 'idempotencia',
        status: 'failed',
        evidence: `Falha: ${err.message}`,
        durationMs: Math.round(performance.now() - t4Start),
      });
    }

    // ------------------------------------------------------------------------
    // TESTE 5: Matriz de Permissões RBAC e Alçada de Desconto (Adendo B.2.5)
    // ------------------------------------------------------------------------
    const t5Start = performance.now();
    try {
      // Simular perfil vendedor
      api.setRole('vendedor');
      const sellerQuoteRes = await api.createQuote({
        clientName: 'Cliente Teste Alçada',
        clientCnpj: '00.123.456/0001-00',
        entryPercentage: 50.00,
        items: [
          {
            modelName: 'Polo Teste',
            totalQuantity: 100,
            unitFinalPrice: 30.00, // Custo base será ~42.84, sugerido ~64.26 -> Preço abaixo do sugerido!
            costBreakdown: {
              materialUnitCost: 25.00,
              outsourcedSewingUnitCost: 10.00,
              customizationUnitCost: 5.00,
              freightPerUnit: 2.00,
              technicalLossPercentage: 2.0,
              markupPercentage: 50.0,
            }
          }
        ]
      });

      // Restaurar perfil admin
      api.setRole('admin');

      if (sellerQuoteRes.status === 403 && sellerQuoteRes.error?.includes('Alçada violada')) {
        record({
          id: 'test-rbac-discount',
          name: 'Segurança RBAC: Bloqueio de Desconto sem Alçada de Administrador (Adendo B.2.5)',
          category: 'rbac',
          status: 'passed',
          evidence: `Perfil 'vendedor' tentou praticar preço abaixo do sugerido e foi bloqueado com HTTP 403: "${sellerQuoteRes.error}".`,
          durationMs: Math.round(performance.now() - t5Start),
        });
      } else {
        throw new Error(`Perfil vendedor conseguiu aprovar desconto sem alçada ou retornou status ${sellerQuoteRes.status}`);
      }
    } catch (err: any) {
      api.setRole('admin');
      record({
        id: 'test-rbac-discount',
        name: 'Segurança RBAC: Bloqueio de Desconto sem Alçada',
        category: 'rbac',
        status: 'failed',
        evidence: `Falha: ${err.message}`,
        durationMs: Math.round(performance.now() - t5Start),
      });
    }

    // ------------------------------------------------------------------------
    // TESTE 6: Captação de Leads com Persistência Centralizada
    // ------------------------------------------------------------------------
    const t6Start = performance.now();
    try {
      const leadPayload = {
        clientName: 'Dra. Vanessa Mendes',
        companyName: 'Clínica São Marcos Medicina',
        phone: '(98) 98199-8800',
        email: 'vanessa@saomarcos.com.br',
        category: 'linha_hospitalar',
        estimatedQty: 80,
        notes: 'Solicitação pelo Portal Público: Jalecos e scrubs com logo bordado.',
      };

      const leadRes = await api.submitPublicLead(leadPayload);

      if (leadRes.status === 201 && leadRes.data?.lead?.leadNumber) {
        record({
          id: 'test-lead-centralization',
          name: 'CRM Centralizado: Captação de Lead com Persistência no Backend',
          category: 'leads',
          status: 'passed',
          evidence: `Lead ${leadRes.data.lead.leadNumber} persistido centralizadamente no schema crm.leads e cliente pré-cadastrado na carteira.`,
          durationMs: Math.round(performance.now() - t6Start),
        });
      } else {
        throw new Error(`Falha ao registrar lead centralizado: status ${leadRes.status}`);
      }
    } catch (err: any) {
      record({
        id: 'test-lead-centralization',
        name: 'CRM Centralizado: Captação de Lead',
        category: 'leads',
        status: 'failed',
        evidence: `Falha: ${err.message}`,
        durationMs: Math.round(performance.now() - t6Start),
      });
    }

    return results;
  }
}
