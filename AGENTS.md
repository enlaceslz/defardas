# AGENTS.md — Diretrizes para Agentes de Desenvolvimento e IA

**Projeto:** DE FARDAS — Plataforma Integrada de Gestão Comercial, Produção, Suprimentos, Financeiro e Portfólio Digital  
**Localização da Empresa:** São Luís, Maranhão  
**Documento Normativo de Referência:** `PRD_DE_FARDAS_v1.6.md` e seus Adendos (v1.2, v1.3, v1.4, v1.6)  
**Versão da Base de Código:** `1.6.2` (Auditada em 2026-11-26)  

---

## 1. Princípios Inegociáveis (Core Invariants)

Qualquer agente ou engenheiro que trabalhe nesta base de código **DEVE** seguir estritamente as regras abaixo:

1. **Nunca Inventar Regras Comerciais:** Não crie valores de markup, percentual de sinal, regras de comissão, limites de desconto, prazos, taxas ou políticas de reembolso que não tenham sido expressamente validados e documentados.
2. **Markup sobre Custo $\neq$ Margem sobre Receita:**  
   A regra respondida e homologada pela DE FARDAS (Adendo B.2.1) é **markup percentual sobre o custo**:
   $$\text{Preço Sugerido} = \text{Custo-base} \times \left(1 + \frac{k}{100}\right)$$
   A fórmula antiga de margem sobre receita existente no texto histórico da seção 5.6 do PRD **NÃO** deve ser utilizada como motor de preços principal. A margem gerencial estimada sobre a receita é calculada separadamente:
   $$\text{Margem Estimada (\%)} = \frac{\text{Preço Negociado} - \text{Custo-base}}{\text{Preço Negociado}} \times 100$$
   Sempre utilize o operador nullish coalescing (`??`) em campos numéricos onde `0` é valor válido (frete, perda técnica, customização, markup).
3. **Tríade de Estados Desacoplados (Regra B.2.2):**  
   Nunca unifique status comercial, financeiro e operacional em uma única variável:
   - `commercialStatus`: `'rascunho' | 'enviado' | 'em_negociacao' | 'aprovado' | 'recusado' | 'cancelado' | 'convertido_em_pedido'`
   - `financialStatus`: `'entrada_pendente' | 'entrada_confirmada' | 'saldo_em_aberto' | 'quitado'`
   - `stage`: `'aguardando_liberacao' | 'corte' | 'bordado_silk' | 'costura' | 'conferencia_qualidade' | 'retrabalho' | 'expedicao' | 'entregue'`
4. **Aprovação Comercial Desacoplada da Aprovação de Arte:**  
   O cliente pode **aprovar comercialmente o orçamento e solicitar revisão de arte** simultaneamente (`artStatus`: `'pendente' | 'enviada_para_cliente' | 'revisao_solicitada' | 'aprovada'`). Cada revisão de proposta incrementa `version` mantendo histórico (`versionHistory`), e cada arquivo/revisão de arte é versionado (`artVersions`). A OP pode ser criada, mas permanece retida no Gate A.3.2 até a aprovação formal da arte final.
5. **Portões Rígidos de Liberação Fabril (Gate A.3.2):**  
   Uma Ordem de Produção (OP) **não pode avançar para o corte** enquanto:
   - O sinal de entrada (padrão 50%) não for confirmado no Financeiro com comprovante bancário real e evidência auditável (`entryPaymentConfirmed === false`, rejeitando comprovantes fictícios/genéricos via `HTTP 422`).
   - A arte/layout personalizado não tiver sido formalmente aprovada pelo cliente (`artApproved === false`).
   - Uma OP **não pode ser marcada como `quitado`** ao liquidar o saldo de entrega enquanto `entryPaymentConfirmed === false`.
6. **Idempotência em Conversões e Lançamentos:**  
   A conversão de Proposta Comercial (`Quote`) em Ordem de Produção (`ProductionOrder`) — incluindo bloqueio de criação manual duplicada de OP para `quoteId` já convertido (`HTTP 409 QUOTE_ALREADY_CONVERTED`), a geração de títulos financeiros (`entrada_pedido` / `saldo_entrega`), a geração de Contas a Pagar e recebimento físico de Pedidos de Compra (`PC`, com trava contra recebimentos simultâneos `HTTP 409 PO_RECEIPT_IN_PROGRESS`) e o recebimento de webhooks WhatsApp (`externalId`) devem ser estritamente idempotentes — repetições nunca podem duplicar ordens, títulos, movimentações de estoque ou mensagens.
7. **Separação Estrita entre Parceiros/Facções e Fornecedores de Insumos:**  
   - **Parceiros & Facções (`FAC-YYYY-XXXX`):** prestadores de serviço terceirizado (costura, bordado, silk, corte, acabamento), com **custódia de tecidos remetidos** (preservando `allocatedStock <= physicalStock`) e **provisão/previsão de pagamento por OP/cliente** (com isolamento RBAC de títulos financeiros no Dossiê 360°).
   - **Fornecedores & Compras (`FOR-YYYY-XXXX` / `PC-YYYY-XXXX`):** fornecedores de matéria-prima (tecidos, aviamentos, insumos, embalagens, manutenção), com **Pedidos de Compra**, recebimento parcial/total (proibido em status `rascunho`, `HTTP 409 PO_NOT_SENT`) integrando **Kardex + Custo Médio Ponderado (CMP)**, geração idempotente de **Contas a Pagar** e bloqueio de cancelamento quando houver título já liquidado (`HTTP 409 PO_HAS_PAID_PAYABLE`).
8. **Segregação, Privacidade & Mapas Abertos:**  
   Os dados da DE FARDAS são privados e segregados. Nunca embutir credenciais, telefones de fallback fictícios, dados pessoais ou senhas no código versionado ou no bundle frontend. Para endereçamento e mapas, utilizar exclusivamente **OpenStreetMap / Nominatim + Leaflet** (proibido habilitar ou depender de Google Maps API).

---

## 2. Três Ambientes do Produto

```
┌────────────────────────────────────────────────────────────────┐
│                      DE FARDAS PLATFORM                        │
├────────────────────┬────────────────────────┬──────────────────┤
│ 1. PORTAL PÚBLICO  │ 2. ERP + CRM INTERNO   │ 3. INTELIGÊNCIA  │
│    & PORTFÓLIO     │                        │    & ALERTAS     │
│ - Vitrine Digital  │ - CRM & Leads          │ - KPIs Produção  │
│ - 10 Categorias    │ - Orçamentos & Artes   │ - Margem Real    │
│ - Solicitar Cotação│ - PCP, Kanban & Prazos │ - Central de     │
│ - Lead no CRM      │ - Estoque, Kardex & CMP│   Notificações   │
│ - WhatsApp Dinâmico│ - Fornecedores & PCs   │ - Previsão Caixa │
│                    │ - Parceiros & Facções  │   (Facções/PCs)  │
│                    │ - Financeiro 50/50     │ - Auditoria      │
│                    │ - Central WhatsApp     │   Imutável       │
└────────────────────┴────────────────────────┴──────────────────┘
```

---

## 3. Modelo de Domínio e Entidades Chave

### 3.1. Custo-Base Transparente (`CostBreakdown`) & Versionamento de Propostas
O custo-base de cada item discrimina:
- `materialUnitCost`: Consumo de tecidos e aviamentos (zíperes, linhas, botões).
- `outsourcedSewingUnitCost`: Mão de obra da facção terceirizada por peça.
- `customizationUnitCost`: Bordados e silk-screen por peça.
- `freightPerUnit`: Frete e entrega rateados.
- `technicalLossPercentage`: Perda técnica estimada (ex.: 2% a 3%).
- `calculatedBaseCost`: Somatório direto acrescido da perda técnica.
- `markupPercentage`: Percentual $k\%$ de acréscimo.
- `suggestedUnitPrice`: Preço sugerido resultante.
- `negotiatedUnitPrice`: Preço final praticado na proposta.
- `belowSuggestedAuthorized`: Booleano indicando autorização explícita de Administrador caso $\text{Negociado} < \text{Sugerido}$.

Propostas mantêm histórico de versões (`version`, `versionHistory`) e versionamento de arte (`artStatus`, `artVersionNumber`, `artVersions`, `artRevisionNotes`) validados por `server/services/artworkValidation.ts`. Exclusões de OPs não iniciadas e sem títulos liquidados liberam automaticamente a proposta vinculada (`convertedOrderId`, `isLocked`) para evitar referências órfãs.

### 3.2. Estoque, Kardex, Custo Médio Ponderado (CMP) e Custódia de Terceiros
- Cada insumo distingue **Saldo Físico Próprio**, **Saldo Alocado para OPs** e **Saldo em Poder de Terceiros (Facções)**, além de vínculo estruturado com fornecedor padrão (`supplierId`), mantendo o invariante `allocatedStock <= physicalStock` tanto no Estoque quanto nas remessas de custódia em Parceiros.
- Materiais enviados para facções permanecem sob custódia rastreada (`PartnerCustody`) até confirmação de devolução, consumo ou perda; retornos acima do saldo em custódia são bloqueados (`HTTP 400`).
- Ajustes de inventário ocorrem exclusivamente via eventos compensatórios auditáveis no Kardex — nunca por sobrescrita cega de saldo.
- Entradas via **Recebimento de Pedido de Compra** recalculam automaticamente o **Custo Médio Ponderado (CMP)** no servidor, aplicam trava contra concorrência (`PO_RECEIPT_IN_PROGRESS`) e bloqueiam recebimento acima da quantidade pedida ou em pedidos ainda em `rascunho`.

### 3.3. Fornecedores & Pedidos de Compra (`FOR-YYYY-XXXX` / `PC-YYYY-XXXX`)
- Ciclo de vida do Pedido de Compra: `rascunho` → `enviado` → `confirmado` → `recebido_parcial` / `recebido_total` (ou `cancelado`). Recebimentos são permitidos apenas a partir de `enviado`/`confirmado`/`recebido_parcial` (`HTTP 409 PO_NOT_SENT` para rascunho).
- Recebimentos lançam entradas automáticas no Estoque/Kardex com CMP e podem efetivar/gerar o título correspondente em Contas a Pagar (`compra_tecido`) de forma idempotente.
- Cancelamento de PC com título financeiro já pago (`status === 'pago'`) é bloqueado (`HTTP 409 PO_HAS_PAID_PAYABLE`), exigindo estorno explícito prévio no Financeiro.
- O Dossiê 360° do Fornecedor (`GET /api/suppliers/:id`) aplica isolamento RBAC para ocultar títulos financeiros de perfis sem alçada financeira.
- Exclusão de fornecedores com insumos vinculados, PCs abertos ou títulos ativos é bloqueada no servidor (`HTTP 409`).

### 3.4. Parceiros & Facções (`FAC-YYYY-XXXX`)
- Gestão de oficinas e terceirizados (`costura`, `bordado`, `silk_screen`, `corte_externo`, `acabamento`) com controle de custódia de materiais e previsão/provisão financeira (`server/services/partnerFinanceService.ts`).
- Acompanhamento consolidado de valores **já pagos**, **provisionados/pendentes**, **em atraso** e **saldo restante** por parceiro, com referência explícita de serviço, OP e cliente vinculada ao Financeiro.
- O Dossiê 360° do Parceiro (`GET /api/partners/:id`) aplica isolamento RBAC para ocultar `payables` de perfis sem `finance:view`.

### 3.5. Cronograma por Etapa (PCP) & Central de Notificações
- Cada OP possui cronograma detalhado por etapa (`stageSchedule`, gerenciado por `server/services/productionScheduleService.ts`) com datas planejadas/realizadas, responsável, observações e recálculo proporcional até a data prometida de entrega (`targetDeliveryDate`).
- O motor centralizado de notificações (`server/services/notificationService.ts` → `GET /api/notifications`) consolida alertas acionáveis de: etapas de OP em atraso ou alerta, entregas vencendo/atrasadas, bloqueios do Gate A.3.2, tecidos abaixo do mínimo (filtrado por `inventory:view`), Pedidos de Compra com entrega atrasada (filtrado por `suppliers:view`), propostas vencendo (filtrado por `quotes:view`) e títulos financeiros vencendo/atrasados (filtrado por `finance:view`).

### 3.6. Central WhatsApp Omnichannel (Multiprovedor)
- Suporte nativo a **Meta WhatsApp Business Cloud API** e **WA-AKG (QR Code)** via `server/services/whatsappService.ts` e `server/routes/communicationRoutes.ts`.
- **Diagnóstico Honesto:** canais exibem status real (`live` vs. `sandbox`), variáveis de ambiente pendentes e sondagem efetiva de reconexão (proibido simular reconexão falsa ou exibir selo fixo "Ativo" sem env vars).
- **Normalização & Vínculo:** telefones brasileiros normalizados para DDI `55` (`remoteJid`), com vínculo automático a **Clientes CRM**, **Leads**, **Parceiros/Facções** (`parceiro_faccao`) e **Fornecedores** (`fornecedor_insumos`).
- **6 Templates ERP Homologados (`/api/communication/send-template`):** `quote_ready`, `downpayment_confirmed`, `art_approval`, `order_stage_update`, `purchase_order` e `payment_reminder`.
- **Handoff & Não Lidas:** abertura de conversas a partir de qualquer módulo seleciona diretamente a conversa na Central WhatsApp; badge da Sidebar sincronizado via `GET /api/communication/unread-summary`.

### 3.7. Endereçamento Estruturado, Mapas (OpenStreetMap/Leaflet) & Compartilhamento de Rota WhatsApp
- **Sem Google Maps:** Toda geocodificação e exibição de mapa utiliza exclusivamente **Leaflet + OpenStreetMap / Nominatim** (`server/routes/lookupRoutes.ts`, `server/services/addressMetadataService.ts` e `src/components/StructuredAddressFieldset.tsx`).
- **Localização por CEP + Número:** Formulários de Clientes, Fornecedores e Parceiros/Facções resolvem logradouro, bairro, cidade, UF e coordenadas geográficas (`latitude`, `longitude`) a partir do CEP e número, com ajuste fino de pino no mapa interativo.
- **Compartilhamento de Endereço & Rota via WhatsApp (`server/routes/locationsRoutes.ts`, `server/services/locationShareService.ts`, `src/components/WhatsAppLocationShareModal.tsx`):**
  - Gera link público somente leitura auditável com token CSPRNG (`/api/locations/share/:token` → `#/localizacao/:token`) contendo dados completos do endereço, coordenadas e botões para abrir o mapa traçando rota até o destino.
  - Suporta **compartilhamento livre via WhatsApp sem exigir digitação de telefone** (`https://api.whatsapp.com/send?text=...`), envio direcionado para um número específico, cópia rápida de mensagem/link e envio pela Central WhatsApp interna.

### 3.8. Central de Relatórios & Links Compartilháveis
- Geração e revogação de snapshots somente leitura com token CSPRNG e expiração configurável (`server/routes/reportsRoutes.ts`, `server/services/reportShareService.ts`), respeitando rigorosamente o RBAC por domínio (`comercial`, `financeiro`, `parceiros`, `fornecedores`, `executivo`, `producao`, `estoque`).

---

## 4. Diretrizes de Implementação Técnica

### 4.1. Arquitetura Homologada e Fronteiras
- **Frontend:** React 19 SPA com TypeScript estrito, Vite 8 (`allowedHosts: true` em dev para compatibilidade com previews remotos), Tailwind CSS v4, Leaflet (OpenStreetMap), Lucide React, Motion e PWA (`vite-plugin-pwa`).
- **Navegação e Isolamento:** Menu lateral (`Sidebar`) persistente no ERP interno; Portal Público desautenticado e rotas públicas de visualização somente leitura (`#/localizacao/:token`, `#/relatorio/:token`) isoladas sem montagem da navegação interna. Proibido uso de `window.alert`, `window.confirm` e `window.open` (usar notificações Toast, links `<a target="_blank">` quando aplicável e modais in-app).
- **Backend:** Node.js + TypeScript + Express (`server.ts` / `api/index.ts` compartilhando `server/app.ts`) com:
  - **16 rotas modulares** em `server/routes/*` (`auth`, `quotes`, `orders`, `finance`, `inventory`, `leads`, `clients`, `communication`, `audit`, `migration`, `lookups`, `partners`, `suppliers`, `notifications`, `locations`, `reports`).
  - **11 serviços de domínio** em `server/services/*` (`pricingEngine`, `artworkValidation`, `productionScheduleService`, `partnerFinanceService`, `notificationService`, `whatsappService`, `sequenceService`, `auditService`, `addressMetadataService`, `locationShareService`, `reportShareService`).
  - **9 repositórios tipados** em `server/repositories/*` (exportados via `index.ts`).
- **Banco de Produção (Fonte Única de Verdade):** PostgreSQL próprio da DE FARDAS com **Drizzle ORM** e migrações via **Drizzle Kit** (`drizzle/`), estruturado nos schemas `core`, `crm`, `producao`, `estoque`, `financeiro` e `communication`. Proibido introduzir Prisma, Sequelize ou TypeORM no domínio do ERP.
- **Armazenamento Privado:** Provedor compatível com S3 para artes, fichas técnicas e comprovantes bancários com evidência auditável (`receiptEvidenceUrl`).
- **Infraestrutura:** Docker multi-stage (`Dockerfile`) + Docker Compose (`compose.yaml` / `compose.dev.yaml`) com PostgreSQL 16, Redis 7, ERP e WA-AKG, Vercel Full-Stack Serverless (`api/index.ts` + `vercel.json`) e scripts de backup/restore SHA-256 (`scripts/backup.sh`, `scripts/restore.sh`).

### 4.2. Invariantes de Segurança Obrigatórios
1. **Autenticação e Sessões:** Senhas com `bcrypt` (12 rounds); sessões CSPRNG persistidas em `core.sessions` com cookie `HttpOnly` (`Secure; SameSite=None` quando atrás de proxy HTTPS / iframe, `SameSite=Lax` em HTTP local). Cabeçalhos forjados pelo cliente (`x-user-role`, `x-user-id`) devem ser sempre ignorados.
2. **Proteção CSRF:** Double-Submit Cookie (`X-CSRF-Token` comparado com `crypto.timingSafeEqual`) obrigatório em todas as mutações (`POST`, `PUT`, `PATCH`, `DELETE`), avaliando `${req.baseUrl}${req.path}`. Apenas `POST /api/leads`, autenticação inicial e webhooks validados são isentos.
3. **RBAC e Allowlist:** Toda rota interna exige `requireAuth` e `requirePermission(...)` compatível com a matriz em `server/auth/rbac.ts` (incluindo `partners:*`, `suppliers:*` e `communication:*`). Rotas `PUT`/`PATCH` devem usar *allowlist* explícita de campos editáveis (sem *mass assignment* e sem permitir bypass do Gate A.3.2).
4. **Webhooks Assinados & Anti-SSRF/XSS (WhatsApp):**
   - Webhooks da Meta Cloud API exigem verificação HMAC-SHA256 (`X-Hub-Signature-256` sobre `rawBody` com `META_WA_APP_SECRET`, obrigatório em produção) e resposta `text/plain` no challenge `GET /webhooks/meta` com `timingSafeEqual` (sem token hardcoded).
   - Webhooks WA-AKG exigem validação `timingSafeEqual` via `WA_AKG_API_KEY` (obrigatório em produção).
   - Toda `mediaUrl` enviada ou recebida passa por validação anti-SSRF (`isSafeWhatsAppMediaUrl`), bloqueando loopback, RFC-1918, `.local`/`.internal` e metadados de nuvem (`169.254.169.254`).
   - Chaves sensíveis de configuração de canal são sanitizadas (`sanitizeChannelConfig`) antes de qualquer resposta HTTP.
5. **Blindagem de Produção:** Em `NODE_ENV=production`, seeds de desenvolvimento, endpoint `/api/auth/dev-credentials` e fallback em memória são terminantemente desativados. Nunca embutir senhas ou credenciais de teste no bundle do frontend.
6. **Identificadores Canônicos:** Todas as chaves primárias (incluindo canais, conversas e mensagens WhatsApp) e eventos de auditoria utilizam `crypto.randomUUID()`. Códigos legíveis (`OP-YYYY-XXXX`, `ORC-YYYY-XXXX`, `FIN-YYYY-XXXX`, `CLI-XXXX`, `FAC-YYYY-XXXX`, `FOR-YYYY-XXXX`, `PC-YYYY-XXXX`) são gerados por sequenciadores PostgreSQL (`sequenceService`) e mantidos separados do UUID.

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
