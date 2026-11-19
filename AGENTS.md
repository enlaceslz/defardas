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

### 4.1. Arquitetura Homologada e Fronteiras
- **Frontend:** React 19 SPA com TypeScript, Vite, Tailwind CSS v4, Lucide React e Motion.
- **Navegação e Isolamento:** Menu lateral (Sidebar) persistente no ERP interno; Portal Público desautenticado isolado sem montagem da navegação interna. Proibido uso de `window.alert`, `window.confirm` e `window.open` (usar notificações Toast e modais in-app).
- **Backend:** Node.js + TypeScript + Express (`server.ts`) com rotas modulares em `server/routes/*`, serviços de domínio em `server/services/*` e repositórios tipados em `server/repositories/*`.
- **Banco de Produção (Fonte Única de Verdade):** PostgreSQL próprio da DE FARDAS com **Drizzle ORM** e migrações via **Drizzle Kit** (`drizzle/`), estruturado nos schemas `core`, `crm`, `producao`, `estoque`, `financeiro` e `communication`. Proibido introduzir Prisma, Sequelize ou TypeORM no domínio do ERP.
- **Armazenamento Privado:** Provedor compatível com S3 para artes, fichas técnicas e comprovantes bancários com evidência auditável (`receiptEvidenceUrl`).
- **Comunicação Omnichannel:** Central WhatsApp nativa multiprovedor suportando **Meta WhatsApp Business Cloud API** e **WA-AKG (QR Code)** em container Docker isolado.
- **Infraestrutura:** Docker multi-stage (`Dockerfile`) + Docker Compose (`compose.yaml` / `compose.dev.yaml`) com PostgreSQL 16, Redis 7, ERP e WA-AKG, além de scripts de backup/restore (`scripts/backup.sh`, `scripts/restore.sh`).

### 4.2. Invariantes de Segurança Obrigatórios
1. **Autenticação e Sessões:** Senhas com `bcrypt` (12 rounds); sessões CSPRNG persistidas em `core.sessions` com cookie `HttpOnly` + `SameSite=Lax`. Cabeçalhos forjados pelo cliente (`x-user-role`, `x-user-id`) devem ser sempre ignorados.
2. **Proteção CSRF:** Double-Submit Cookie (`X-CSRF-Token` comparado com `crypto.timingSafeEqual`) obrigatório em todas as mutações (`POST`, `PUT`, `PATCH`, `DELETE`), avaliando `${req.baseUrl}${req.path}`. Apenas `POST /api/leads`, autenticação inicial e webhooks validados são isentos.
3. **RBAC e Allowlist:** Toda rota interna exige `requireAuth` e `requirePermission(...)` compatível com a matriz em `server/auth/rbac.ts`. Rotas `PUT`/`PATCH` devem usar *allowlist* explícita de campos editáveis (sem *mass assignment* e sem permitir bypass do Gate A.3.2).
4. **Webhooks Assinados:** Webhooks da Meta Cloud API exigem verificação HMAC-SHA256 (`X-Hub-Signature-256` sobre `rawBody`) quando `META_WA_APP_SECRET` estiver definido; webhooks WA-AKG exigem validação `timingSafeEqual` via `WA_AKG_API_KEY`.
5. **Blindagem de Produção:** Em `NODE_ENV=production`, seeds de desenvolvimento, endpoint `/api/auth/dev-credentials` e fallback em memória são terminantemente desativados. Nunca embutir senhas ou credenciais de teste no bundle do frontend.
6. **Identificadores Canônicos:** Todas as chaves primárias e eventos de auditoria utilizam `crypto.randomUUID()`. Códigos legíveis (`OP-2026-XXXX`, `ORC-2026-XXXX`, `FIN-2026-XXXX`, `CLI-XXXX`) são gerados por sequenciadores PostgreSQL (`sequenceService`) e mantidos separados do UUID.

### 4.3. Fluxo de Trabalho do Agente (Verificação Obrigatória)
Ao executar modificações no código:
1. Faça a leitura prévia do arquivo antes de editar e preserve a identidade visual própria da DE FARDAS.
2. Não introduza estilos CSS inline nem frameworks CSS conflitantes com Tailwind v4.
3. Garanta que todos os botões, modais e abas tenham handlers reais integrados à API (proibido *dead clicks* ou *mock stubs*).
4. Execute `npm run lint` (`tsc --noEmit`) para validar tipagem estática com 0 erros.
5. Execute `npm run build` (`compile_applet`) e valide as rotas afetadas antes de concluir a entrega.

---

## 5. Matriz de Autorizações e Alçadas (Pendente vs. Proposto)

- **Alçada de Preço:** A proposta técnica do PRD (Adendo B.2.5) estabelece que qualquer preço negociado abaixo do sugerido exige autorização explícita de Administrador com registro do responsável (`authorizerName`), validada no backend (`HTTP 403 DISCOUNT_REQUIRES_ADMIN_APPROVAL`). A eventual extensão dessa alçada ao gerente comercial continua pendente de decisão formal da diretoria da DE FARDAS.
- **Comissões:** A estrutura de dados suporta cálculo de comissões, mas a ativação do cálculo automático deve permanecer desativada até assinatura da política oficial (base bruta vs. líquida de frete e regras de cancelamento).
- **Emissão Fiscal:** Nenhuma emissão de documento fiscal (NF-e/NFS-e) deve ser automatizada em produção sem prévia homologação técnica e validação formal do contador da empresa.

