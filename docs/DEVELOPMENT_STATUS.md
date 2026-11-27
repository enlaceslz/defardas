# DE-FARDAS ERP — Status de Desenvolvimento e Rastreabilidade

**Projeto:** DE-FARDAS ERP — Sua empresa bem vista  
**Localização:** São Luís, Maranhão  
**Repositório Oficial:** https://github.com/enlaceslz/defardas  
**Versão Atual:** `1.6.2-AUDITED`  
**Data da Última Atualização:** 2026-11-26  

---

## 1. Etapa Atual
- **Etapas Concluídas:** Fundação Drizzle ORM, Segurança & Repositórios, Infraestrutura Docker/Vercel, Auditoria Geral V7 e Ciclos de Expansão & Auditoria por Módulo (**Estoque/Kardex**, **Orçamentos/Versionamento/Artes**, **Parceiros & Facções**, **Notificações & Prazos por Etapa**, **Fornecedores & Pedidos de Compra**, **Hardening Omnichannel WhatsApp**, **Endereçamento com Mapa OpenStreetMap/Leaflet & Compartilhamento de Rota WhatsApp**, **Central de Relatórios Compartilháveis** e **Auditoria Integral de Regras de Negócio V14**).
- **Status Geral:** **IMPLEMENTADO, AUDITADO, TESTADO E HOMOLOGADO**

---

## 2. Matriz de Entregas e Situação por Módulo

| Identificador | Descrição da Entrega / Auditoria | Arquivo(s) Envolvido(s) | Status | Detalhes / Evidência |
| :--- | :--- | :--- | :---: | :--- |
| **P0-001** | Instalação e Configuração do Drizzle ORM e Drizzle Kit | `package.json`, `drizzle.config.ts`, `server/db/index.ts`, `server/db/schema/*.ts` | **Homologado** | Schemas tipados em `core`, `crm`, `producao`, `estoque`, `financeiro`, `communication` (incluindo `partners` e `suppliers`). |
| **P0-002** | Persistência de Sessões Seguras em PostgreSQL | `server/auth/sessionStore.ts`, `server/db/schema/sessions.ts` | **Homologado** | Sessões CSPRNG armazenadas em `core.sessions` com suporte a cold starts serverless e cookies `HttpOnly`. |
| **P0-003** | Auditoria de Estoque, Tecidoteca, Kardex & Custódia | `server/routes/inventoryRoutes.ts`, `server/repositories/inventoryRepository.ts`, `src/components/InventoryView.tsx` | **Homologado** | 3 saldos (Físico Próprio, Alocado OPs, Em Poder de Terceiros), Kardex auditável, bloqueio de devolução acima da custódia (`HTTP 400`), vínculo com fornecedor e reposição 1-clique. |
| **P0-004** | Financeiro 50/50 Auditável & Estorno Compensatório | `server/routes/financeRoutes.ts`, `server/repositories/financeRepository.ts`, `src/components/FinancialView.tsx` | **Homologado** | Quitação exige `receiptVoucherNumber` e `receiptEvidenceUrl` reais (`HTTP 422`), bloqueio de duplicidade (`HTTP 409`), estorno auditável (Admin) e recibos/relatórios A4. |
| **P0-005** | Segurança SSL no PostgreSQL & Blindagem de Produção | `server/db/index.ts`, `server/db/connection.ts`, `server/db/userRepository.ts` | **Homologado** | `rejectUnauthorized: true` por padrão em produção, suporte a `DATABASE_CA_CERT` e bloqueio de seeds/dev-credentials quando `NODE_ENV=production`. |
| **SEC-001** | Proteção CSRF Double-Submit & Rate Limiting | `server/middleware/csrf.ts`, `server/middleware/rateLimiter.ts`, `server/routes/authRoutes.ts`, `src/api/client.ts` | **Homologado** | `X-CSRF-Token` comparado com `crypto.timingSafeEqual`, rate limit (`HTTP 429`), cookies `Secure; SameSite=None` atrás de proxy HTTPS e `SameSite=Lax` em HTTP local. |
| **QUOTE-001** | Versionamento de Propostas & Aprovação Comercial vs. Arte | `server/routes/quotesRoutes.ts`, `server/services/artworkValidation.ts`, `server/services/pricingEngine.ts`, `src/components/QuotesView.tsx` | **Homologado** | Histórico de versões de proposta (`version`), armazenamento versionado de artes (`artworkVersions`), fluxo "Aprovou orçamento + pediu revisão na arte" e preservação rigorosa do Gate A.3.2. |
| **PART-001** | Módulo Parceiros & Facções com Custódia e Previsão Financeira | `server/routes/partnersRoutes.ts`, `server/repositories/partnerRepository.ts`, `server/services/partnerFinanceService.ts`, `server/db/schema/partners.ts`, `src/components/PartnersView.tsx` | **Homologado** | Cadastro `FAC-YYYY-XXXX`, remessa/retorno de custódia, valores já pagos vs. restantes/provisionados por serviço/OP/cliente e integração com Contas a Pagar. |
| **SCHED-001** | Cronograma por Etapa (PCP) & Motor de Notificações | `server/services/productionScheduleService.ts`, `server/services/notificationService.ts`, `server/routes/notificationsRoutes.ts`, `src/components/OrderScheduleModal.tsx`, `src/components/Header.tsx` | **Homologado** | Prazos planejados/realizados em 6 etapas fabris, recálculo proporcional até a entrega, linha do tempo na `ProductionOrdersView` e sineta de notificações RBAC cobrindo OPs, Gate, Estoque, PCs, Financeiro e Custódia. |
| **SUPP-001** | Módulo Fornecedores & Pedidos de Compra com CMP | `server/routes/suppliersRoutes.ts`, `server/repositories/supplierRepository.ts`, `server/db/schema/suppliers.ts`, `src/components/SuppliersView.tsx` | **Homologado** | Cadastro `FOR-YYYY-XXXX` (auto-CNPJ/CEP), Pedidos de Compra `PC-YYYY-XXXX`, recebimento parcial/total integrando Estoque/Kardex + Custo Médio Ponderado (CMP), CP idempotente, dossiê 360° com isolamento RBAC e WhatsApp. |
| **WA-002** | Revisão & Hardening Omnichannel WhatsApp | `server/services/whatsappService.ts`, `server/routes/communicationRoutes.ts`, `src/components/WhatsAppOmnichannelView.tsx`, `src/components/PublicPortalView.tsx`, `src/components/Sidebar.tsx`, `src/App.tsx` | **Homologado** | Proteção anti-SSRF em `mediaUrl`, anti-XSS em webhook challenge, webhooks assinados (HMAC-SHA256 / API Key) idempotentes com ACK de leitura, UUIDs canônicos, diagnóstico honesto Live/Sandbox, 6 templates ERP em 1 clique, handoff de conversas, contexto ERP no chat, badge de não lidas na Sidebar e `wa.me` dinâmico no Portal Público. |
| **GEO-001** | Endereçamento Estruturado, Mapa Interativo & Rota via WhatsApp | `server/routes/locationsRoutes.ts`, `server/routes/lookupRoutes.ts`, `server/services/locationShareService.ts`, `server/services/addressMetadataService.ts`, `src/components/StructuredAddressFieldset.tsx`, `src/components/WhatsAppLocationShareModal.tsx`, `src/components/PublicLocationView.tsx` | **Homologado** | Geocodificação CEP + número via OpenStreetMap/Nominatim + Leaflet (sem Google Maps) em Clientes, Fornecedores e Parceiros; compartilhamento de endereço/coordenadas via WhatsApp sem obrigatoriedade de digitar número e página pública de rota (`#/localizacao/:token`). |
| **REP-001** | Central de Relatórios Gerenciais & Links Compartilháveis | `server/routes/reportsRoutes.ts`, `server/services/reportShareService.ts`, `src/components/ReportsView.tsx`, `src/components/PublicReportView.tsx` | **Homologado** | Relatórios A4 e snapshots públicos somente leitura com token CSPRNG, expiração, revogação e isolamento RBAC por domínio. |
| **INFRA-001** | Docker Compose, Vercel Serverless, PWA & Preview Vite 8 | `Dockerfile`, `compose.yaml`, `api/index.ts`, `vercel.json`, `vite.config.ts`, `server.ts`, `scripts/backup.sh`, `scripts/restore.sh` | **Homologado** | Build multi-stage, backup/restore SHA-256, deploy Vercel Full-Stack (`/api/*`), manifesto PWA, `allowedHosts: true` no Vite 8 e deduplicação de cookie CSRF em proxy HTTPS. |

---

## 3. Auditoria Geral V7 + Revisões Modulares (Resumo de Remediações)

### 3.1. Auditoria Geral V7 (Fundação & Segurança)
| ID | Severidade | Achado Identificado & Correção Aplicada |
| :--- | :---: | :--- |
| **AUD-V7-01** | Crítico | **CSRF `EXEMPT_PATHS`:** corrigido com `${req.baseUrl}${req.path}` e isenção restrita a `POST /api/leads`, login/recuperação e webhooks validados. |
| **AUD-V7-02** | Crítico | **Assinatura de Webhooks WhatsApp:** validação HMAC-SHA256 (`X-Hub-Signature-256` sobre `rawBody`) para Meta Cloud API e `timingSafeEqual` via `WA_AKG_API_KEY` para WA-AKG. |
| **AUD-V7-03** | Crítico | **Blindagem de Produção:** removidas senhas hardcoded do bundle frontend e desativados seeds/dev-credentials/memória em `NODE_ENV=production`. |
| **AUD-V7-04** | Crítico | **Gate A.3.2:** removidos atalhos manuais de liberação no PCP; quitação de sinal ocorre exclusivamente no Financeiro com comprovante real. |
| **AUD-V7-05** | Alto | **RBAC & Allowlist:** `requirePermission` aplicado em todas as rotas internas e allowlist explícita em `PUT`/`PATCH` contra *mass assignment*. |
| **AUD-V7-06** | Alto | **UUIDs Canônicos & Sequenciadores:** chaves primárias via `crypto.randomUUID()` e códigos legíveis (`OP-`, `ORC-`, `FIN-`, `CLI-`, `FAC-`, `FOR-`, `PC-`) via `sequenceService`. |
| **AUD-V7-07** | Alto | **Motor de Preços:** preservado Markup sobre Custo (`??` para zeros válidos) e bloqueio server-side de desconto abaixo do sugerido para não-administradores (`HTTP 403`). |

### 3.2. Revisões e Auditorias Subsequentes (V8–V14)
| ID | Módulo | Melhorias e Correções Validadas |
| :--- | :--- | :--- |
| **AUD-V8** | **Estoque & Tecidos** | Auditoria dos 3 saldos, Kardex por movimentação, bloqueio de exclusão com custódia ativa e integração estruturada com fornecedores e compras. |
| **AUD-V9** | **Orçamentos & Artes** | Versionamento completo de propostas e artes; aprovação comercial desacoplada da revisão de arte com histórico auditável e trava automática no Gate A.3.2. |
| **AUD-V10** | **Parceiros & Prazos** | Controle financeiro de facções (pago vs. restante/provisionado por serviço/OP/cliente), cronograma em 6 etapas por OP e Central de Notificações unificada. |
| **AUD-V11** | **Fornecedores & Compras** | Módulo completo de Fornecedores (`FOR-`) e Pedidos de Compra (`PC-`) com recebimento parcial/total, CMP automático no Estoque, CP idempotente e dossiê 360° com isolamento RBAC. |
| **AUD-V12** | **WhatsApp & Preview** | Removido fallback fixo de telefone em orçamentos e `wa.me` hardcoded no Portal Público; adicionados anti-SSRF em `mediaUrl`, anti-XSS no challenge Meta, diagnóstico honesto Live/Sandbox, reconexão real, 6 templates ERP integrados em Orçamentos/OPs/Financeiro/PCs, handoff direto de conversas, badge de não lidas na Sidebar e correção de preview (`allowedHosts: true` + cookies `Secure; SameSite=None` sob HTTPS). |
| **AUD-V13** | **Mapas, Rotas & Compartilhamento** | Endereçamento estruturado por CEP + número com mapa interativo **OpenStreetMap/Leaflet** em Clientes, Fornecedores e Parceiros (sem Google Maps); compartilhamento de endereço e coordenadas via link WhatsApp sem exigir digitação prévia de telefone, abrindo mapa com traçado de rota para o destinatário. |
| **AUD-V14** | **Auditoria Integral de Regras de Negócio** | Bloqueio de recebimento físico em PC `rascunho` (`HTTP 409 PO_NOT_SENT`), trava de concorrência em recebimento de PC (`PO_RECEIPT_IN_PROGRESS`), bloqueio de cancelamento de PC com título pago (`HTTP 409 PO_HAS_PAID_PAYABLE`), validação ampliada contra comprovantes bancários fictícios (`HTTP 422`), exigência de sinal 50% confirmado antes de marcar OP como `quitado`, idempotência reforçada na criação dos títulos 50/50, bloqueio de `quoteId` duplicado em OP manual (`HTTP 409 QUOTE_ALREADY_CONVERTED`), liberação da proposta vinculada ao excluir OP não iniciada, preservação de `allocatedStock <= physicalStock` em custódia de parceiros, verificação de `clientId` na exclusão de clientes, isolamento RBAC de `payables` no Dossiê 360° de Parceiros e filtro `inventory:view` em alertas de estoque baixo. |

---

## 4. Evidências de Verificação Contínua

1. **Análise Estática TypeScript (`npm run lint` / `tsc --noEmit`):** **0 erros**.
2. **Build de Produção (`npm run build` / `vite build`):** **Sucesso**.
3. **Validação E2E HTTP ao Vivo (`/api/*`):**
   - `GET /api/health` → `200`, contagens sincronizadas de todos os 9 domínios (`clients`, `leads`, `quotes`, `orders`, `finance`, `inventory`, `partners`, `suppliers`, `purchaseOrders`).
   - Isolamento RBAC (`401`/`403`) e anti-CSRF (`403` sem `X-CSRF-Token`) validados em todos os módulos.
   - Suíte automatizada de **27+ asserções de regras de negócio** aprovada (markup sobre custo com zeros válidos, alçada exclusiva de Administrador `403`, aprovação comercial desacoplada da revisão de arte, conversão idempotente, bloqueio de `quoteId` duplicado, Gate A.3.2 `422`, rejeição de comprovante fictício `422`, proteção de `quitado` sem sinal 50%, bloqueio de recebimento em PC rascunho `409`, bloqueio de sobre-recebimento `400`, bloqueio de cancelamento de PC com título pago `409`, bloqueio de retorno acima da custódia `400`, invariante `allocatedStock <= physicalStock`, isolamento RBAC em Dossiês 360° e Notificações).
   - Fluxos de compartilhamento de endereço/rota via WhatsApp (Clientes, Fornecedores e Parceiros) validados com geocodificação OpenStreetMap/Nominatim e página pública `#/localizacao/:token`.
   - Suíte completa de WhatsApp validada (bloqueio SSRF `169.254.169.254`/`127.0.0.1`, webhooks Meta idempotentes + ACK `read`, auto-tag `fornecedor_insumos`/`parceiro_faccao`, `/unread-summary` e disparo dos 6 templates ERP).
   - Preview externo validado com `HTTP 200 OK` no host remoto e emissão única de cookie CSRF `Secure; SameSite=None`.
