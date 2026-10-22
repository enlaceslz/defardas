# AGENTS.md — Diretrizes para Agentes de Desenvolvimento e IA

**Projeto:** DE FARDAS — Plataforma Integrada de Gestão Comercial, Produção, Financeiro e Portfólio Digital  
**Localização da Empresa:** São Luís, Maranhão  
**Documento Normativo de Referência:** `PRD_DE_FARDAS_v1.6.md` e seus Adendos (v1.2, v1.3, v1.4, v1.6)  
**Ambiente de Desenvolvimento:** Google AI Studio com Google Gemini  

---

## 1. Princípios Inegociáveis (Core Invariants)

Qualquer agente ou engenheiro que trabalhe nesta base de código **DEVE** seguir estritamente as regras abaixo:

1. **Nunca Inventar Regras Comerciais:** Não crie valores de markup, percentual de sinal, regras de comissão, limites de desconto, prazos, taxas ou políticas de reembolso que não tenham sido expressamente validados e documentados.
2. **Markup sobre Custo $\neq$ Margem sobre Receita:**  
   A regra respondida e homologada pela DE FARDAS (Adendo B.2.1) é **markup percentual sobre o custo**:
   $$\text{Preço Sugerido} = \text{Custo-base} \times \left(1 + \frac{k}{100}\right)$$
   A fórmula antiga de margem sobre receita existente no texto histórico da seção 5.6 do PRD **NÃO** deve ser utilizada como motor de preços principal. A margem gerencial estimada sobre a receita é calculada separadamente:
   $$\text{Margem Estimada (\%)} = \frac{\text{Preço Negociado} - \text{Custo-base}}{\text{Preço Negociado}} \times 100$$
3. **Tríade de Estados Desacoplados (Regra B.2.2):**  
   Nunca unifique status comercial, financeiro e operacional em uma única variável:
   - `commercialStatus`: `'rascunho' | 'enviado' | 'em_negociacao' | 'aprovado' | 'recusado' | 'cancelado' | 'convertido_em_pedido'`
   - `financialStatus`: `'entrada_pendente' | 'entrada_confirmada' | 'saldo_em_aberto' | 'quitado'`
   - `stage`: `'aguardando_liberacao' | 'corte' | 'bordado_silk' | 'costura' | 'conferencia_qualidade' | 'retrabalho' | 'expedicao' | 'entregue'`
4. **Portões Rígidos de Liberação Fabril (Gate A.3.2):**  
   Uma Ordem de Produção (OP) **não pode avançar para o corte** enquanto:
   - O sinal de entrada (padrão 50%) não for confirmado com registro de comprovante (`entryPaymentConfirmed === false`).
   - A arte/layout personalizado não tiver sido formalmente aprovada pelo cliente (`artApproved === false`).
5. **Idempotência em Conversões:**  
   A conversão de Proposta Comercial (`Quote`) em Ordem de Produção (`ProductionOrder`) e lançamentos financeiros deve ser idempotente: repetições do clique ou falhas parciais de rede **nunca** podem duplicar ordens no chão de fábrica nem títulos a receber.
6. **Segregação e Privacidade:**  
   Os dados da DE FARDAS são privados e segregados. Não embutir credenciais, dados pessoais ou senhas no código versionado.

---

## 2. Três Ambientes do Produto

O PRD especifica três ambientes integrados:

```
┌────────────────────────────────────────────────────────┐
│                   DE FARDAS PLATFORM                   │
├────────────────────┬──────────────────┬────────────────┤
│ 1. PORTAL PÚBLICO  │ 2. ERP + CRM     │ 3. INTELIGÊNCIA│
│    & PORTFÓLIO     │    INTERNO       │    GERENCIAL   │
│ - Vitrine Digital  │ - CRM & Leads    │ - KPIs Produção│
│ - 10 Categorias    │ - Orçamentos     │ - Margem Real  │
│ - Solicitar Cotação│ - PCP & Kanban   │ - Alertas Insum│
│ - Lead no CRM      │ - Estoque & Facç │ - Consultas IA │
│                    │ - Finanças       │   (Read-Only)  │
└────────────────────┴──────────────────┴────────────────┘
```

---

## 3. Modelo de Domínio e Entidades Chave

### 3.1. Custo-Base Transparente (`CostBreakdown`)
O custo-base de cada item deve discriminar:
- `materialUnitCost`: Consumo de tecidos e aviamentos (zíperes, linhas, botões).
- `outsourcedSewingUnitCost`: Mão de obra da facção terceirizada por peça.
- `customizationUnitCost`: Bordados e silk-screen por peça.
- `freightPerUnit`: Frete e entrega rateados.
- `technicalLossPercentage`: Perda técnica estimada (ex: 2% a 3%).
- `calculatedBaseCost`: Somatório direto acrescido da perda técnica.
- `markupPercentage`: Percentual $k\%$ de acréscimo.
- `suggestedUnitPrice`: Preço sugerido resultante.
- `negotiatedUnitPrice`: Preço final praticado na proposta.
- `belowSuggestedAuthorized`: Booleano indicando autorização caso $\text{Negociado} < \text{Sugerido}$.

### 3.2. Estoque e Rastreabilidade de Terceiros
- O estoque distingue **Saldo Físico Próprio**, **Saldo Alocado para OPs** e **Saldo em Poder de Terceiros (Facções)**.
- Materiais enviados para facções permanecem sob custódia rastreada até confirmação de consumo ou devolução.
- Ajustes de inventário devem ser registrados por eventos compensatórios, nunca por sobrescrita cega de saldo.

---

## 4. Diretrizes de Implementação Técnica

### 4.1. Stack Atual e Fronteiras
- **Frontend:** React 19 SPA com TypeScript, Tailwind CSS v4, Lucide React, Motion.
- **Top Bar Contract & Sidebar:** Menu lateral (Sidebar) persistente como navegação principal; top header contextual de zona única com breadcrumbs e botão de ação primária.
- **Persistência:** LocalStorage com versionamento schema `v2`, suporte a exportação/importação JSON de backup e restauração de dados demonstrativos.
- **Banco de Produção:** PostgreSQL próprio contratado para a DE FARDAS (não utilizar serviços de terceiros sem autorização).
- **Armazenamento:** Provedor S3-compatível para armazenamento privado de arquivos de artes, fichas e comprovantes com URLs assinadas temporárias.

### 4.2. Fluxo de Trabalho do Agente (Verificação Obrigatória)
Ao executar modificações no código:
1. Faça a leitura prévia do arquivo antes de editar.
2. Não introduza estilos CSS inline nem frameworks CSS conflitantes com Tailwind v4.
3. Garanta que todos os botões e abas tenham handlers reais e funcionais (proibido dead clicks ou mock stubs).
4. Execute `npm run lint` (`tsc --noEmit`) para validar tipagem estática e ausência de erros.
5. Execute `compile_applet` para assegurar que a compilação de produção não quebre.

---

## 5. Matriz de Autorizações e Alçadas (Pendente vs. Proposto)

- **Alçada de Preço:** A proposta técnica do PRD estabelece que qualquer preço abaixo do sugerido exige autorização explícita com registro do responsável (`authorizerName`). A resolução final de se apenas o administrador ou também o gerente comercial tem alçada de aprovação continua pendente de decisão formal da diretoria da DE FARDAS.
- **Comissões:** A estrutura de dados suporta cálculo de comissões, mas a ativação do cálculo automático deve permanecer desativada até assinatura da política oficial (base bruta vs. líquida de frete e regras de cancelamento).
- **Emissão Fiscal:** Nenhuma emissão de documento fiscal (NF-e/NFS-e) deve ser automatizada em produção sem prévia homologação técnica e validação formal do contador da empresa.
