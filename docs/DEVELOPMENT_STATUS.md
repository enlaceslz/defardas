# DE-FARDAS ERP — Status de Desenvolvimento e Rastreabilidade

**Projeto:** DE-FARDAS ERP — Sua empresa bem vista  
**Localização:** São Luís, Maranhão  
**Repositório Oficial:** https://github.com/enlaceslz/defardas  
**Commit-Base de Referência:** `fefa8901bbb045a73a9b4b00834be25f3ec41b69`  
**Versão Atual:** `1.6.0-P0-ETAPA4`  
**Data da Última Atualização:** 2026-10-25  

---

## 1. Etapa Atual
- **Etapa Concluída:** **ETAPA 1 (Fundação Drizzle), ETAPA 2 (Segurança & Repositórios) e ETAPA 4 (Infraestrutura Docker)**
- **Status Geral:** **IMPLEMENTADO, TESTADO E HOMOLOGADO**

---

## 2. Matriz de Tarefas e Situação por Módulo

| Identificador | Descrição da Tarefa | Arquivo(s) Envolvido(s) | Status | Detalhes / Evidência |
| :--- | :--- | :--- | :---: | :--- |
| **P0-001** | Instalação e Configuração do Drizzle ORM e Drizzle Kit | `package.json`, `drizzle.config.ts`, `server/db/index.ts` | **Homologado** | `drizzle-orm` (0.45.4) e `drizzle-kit` (0.31.11) instalados; 17 tabelas geradas em `drizzle/0000_*.sql`. |
| **P0-001b** | Modelagem dos Schemas Drizzle Tipados | `server/db/schema/*.ts` | **Homologado** | Schemas criados para `core`, `crm`, `producao`, `estoque`, `financeiro`, `communication`. |
| **P0-002** | Persistência de Sessões Seguras em PostgreSQL | `server/auth/sessionStore.ts`, `server/db/schema/sessions.ts` | **Homologado** | Sessões armazenadas em `core.sessions` e recarregadas na inicialização do servidor. |
| **P0-003** | Validação de Custódia de Parceiros no Estoque | `server/routes/inventoryRoutes.ts`, `server/repositories/inventoryRepository.ts` | **Homologado** | Retorno de material de facção valida `qty <= item.inPartnersCustodyStock`; rejeita excesso com HTTP 400. |
| **P0-004** | Eliminação de Comprovantes Fictícios no Financeiro | `server/routes/financeRoutes.ts`, `server/repositories/financeRepository.ts` | **Homologado** | Baixa de sinal exige `receiptVoucherNumber` e `receiptEvidenceUrl` reais; ausência rejeitada com HTTP 422. |
| **P0-005** | Revisão de Segurança SSL no PostgreSQL | `server/db/index.ts`, `server/db/connection.ts` | **Homologado** | Validação estrita por padrão em produção (`rejectUnauthorized: true`) e suporte a certificados CA (`DATABASE_CA_CERT`). |
| **P1-001** | Sequenciadores Persistentes no PostgreSQL | `server/services/sequenceService.ts` | **Homologado** | Suporte a queries de sequence atômica no PostgreSQL (`SELECT nextval(...)`). |
| **P1-002** | Eliminação de Identificadores Frágeis (`Date.now()`) | Todas as rotas em `server/routes/*.ts` | **Homologado** | Substituído `Date.now()` por `crypto.randomUUID()` em todas as chaves primárias e transações. |
| **P1-005** | Remoção de Token Sensível do `localStorage` | `src/api/client.ts` | **Homologado** | Token de autenticação mantido apenas em memória e cookies seguros `HttpOnly` com `SameSite=Lax/Strict`. |
| **P1-007** | Correção de Tratamento de Zero (`??`) no Motor de Preços | `server/routes/quotesRoutes.ts` | **Homologado** | Substituído operador `||` por `??` para `technicalLossPercentage`, `markupPercentage`, `freightUnitCost`, `customizationUnitCost`. |
| **SEC-001** | Proteção CSRF com Double Submit Cookie e timingSafeEqual | `server/middleware/csrf.ts`, `server.ts`, `src/api/client.ts` | **Homologado** | Header `X-CSRF-Token` obrigatório para `POST`, `PUT`, `PATCH`, `DELETE`. Endpoint `/api/auth/csrf-token`. |
| **SEC-002** | Rate Limiting em Rotas Sensíveis de Autenticação | `server/middleware/rateLimiter.ts`, `server/routes/authRoutes.ts` | **Homologado** | Rate limiting sliding-window em `/api/auth/login` (10 req/min) e `/api/auth/recover-password` (5 req/15min) com HTTP 429 e `Retry-After`. |
| **REP-001** | Repositórios Tipados Drizzle ORM | `server/repositories/*.ts` | **Homologado** | Criados repositórios para Clientes, Leads, Propostas, Ordens de Produção, Finanças e Estoque integrados às rotas. |
| **DOC-001** | Dockerfile Multi-Stage e Docker Compose de Produção | `Dockerfile`, `compose.yaml`, `compose.dev.yaml`, `.dockerignore` | **Homologado** | Imagens Node 22-alpine, usuário desprivilegiado `defardas:defardas`, PostgreSQL 16, Redis 7 e WA-AKG isolado. |
| **DOC-002** | Scripts Operacionais de Backup e Restore | `scripts/backup.sh`, `scripts/restore.sh`, `docs/DOCKER_DEPLOY.md` | **Homologado** | Backup pg_dump com compressão gzip, sha256 checksum e política de retenção de 30 dias. Script de restauração com verificação de integridade. |
| **WA-001** | Central WhatsApp Multiprovedor (Meta Cloud + WA-AKG) | `server/routes/communicationRoutes.ts`, `server/services/whatsappService.ts`, `src/components/WhatsAppOmnichannelView.tsx` | **Homologado** | Atendimento omnichannel nativo, envio/recebimento de mensagens, webhooks, modal de QR Code e templates para Gate A.3.2. |
| **SYNC-001** | Desacoplamento do LocalStorage & Estado Autoritativo | `src/App.tsx`, `src/api/client.ts` | **Homologado** | Sincronização direta com o backend ao logar; validação e bloqueio visual do Gate A.3.2 em avanço de etapas de OP. |

---

## 3. Arquivos Modificados e Criados

1. `server/middleware/csrf.ts` — Middleware de proteção CSRF com `timingSafeEqual`.
2. `server/middleware/rateLimiter.ts` — Middleware de rate limiting com registro em auditoria.
3. `server/routes/authRoutes.ts` — Adicionados rate limiters em `/login` e `/recover-password`, e endpoint `GET /csrf-token`.
4. `server.ts` — Montagem da proteção CSRF antes das rotas da API.
5. `src/api/client.ts` — Gestão automática de CSRF token e injeção do cabeçalho `X-CSRF-Token`.
6. `server/repositories/clientRepository.ts` — Repositório Drizzle de clientes.
7. `server/repositories/leadRepository.ts` — Repositório Drizzle de leads.
8. `server/repositories/quoteRepository.ts` — Repositório Drizzle de propostas comerciais e itens.
9. `server/repositories/orderRepository.ts` — Repositório Drizzle de ordens de produção (PCP).
10. `server/repositories/financeRepository.ts` — Repositório Drizzle de lançamentos financeiros.
11. `server/repositories/inventoryRepository.ts` — Repositório Drizzle de estoque e movimentações.
12. `server/repositories/index.ts` — Centralização de exportação dos repositórios.
13. `server/routes/clientsRoutes.ts` — Migrado para repositórios assíncronos e UUID.
14. `server/routes/leadsRoutes.ts` — Migrado para repositórios assíncronos e UUID.
15. `server/routes/quotesRoutes.ts` — Migrado para repositórios assíncronos e UUID.
16. `server/routes/ordersRoutes.ts` — Migrado para repositórios assíncronos e UUID.
17. `server/routes/financeRoutes.ts` — Migrado para repositórios assíncronos e UUID.
18. `server/routes/inventoryRoutes.ts` — Migrado para repositórios assíncronos e UUID.
19. `Dockerfile` — Multi-stage build com Node 22-alpine e usuário não-privilegiado.
20. `compose.yaml` — Orquestração de produção com PostgreSQL, Redis, ERP e WA-AKG.
21. `compose.dev.yaml` — Orquestração de desenvolvimento local.
22. `.dockerignore` — Otimização de contexto Docker.
23. `scripts/backup.sh` — Script automatizado de backup com SHA-256 e rotação de 30 dias.
24. `scripts/restore.sh` — Script de restauração com checagem de checksum e cancelamento de conexões ativas.
25. `docs/DOCKER_DEPLOY.md` — Manual operacional completo de implantação, migrações e recuperação de desastres.
26. `.env.example` — Variáveis de ambiente documentadas e sincronizadas.
27. `server/repositories/communicationRepository.ts` — Repositório Drizzle para canais WhatsApp, conversas e mensagens.
28. `server/services/whatsappService.ts` — Serviço de envio e recebimento via Meta WhatsApp Cloud API e container WA-AKG.
29. `server/routes/communicationRoutes.ts` — Rotas Express para gestão de canais, mensagens, conversas e webhooks.
30. `src/components/WhatsAppOmnichannelView.tsx` — Painel omnichannel com multi-atendimento, modal de QR Code e templates.
31. `src/App.tsx` — Desacoplamento de LocalStorage e sincronização direta com as APIs do PostgreSQL.
32. `docs/DEVELOPMENT_STATUS.md` — Atualização contínua de status e evidências de homologação.

---

## 4. Testes e Verificações Executadas

1. **Tipagem e Análise Estática (TypeScript):**
   - Comando: `npm run lint` (`tsc --noEmit`)
   - Resultado: **0 erros**.
2. **Compilação de Produção (Vite Build):**
   - Comando: `npm run build` (`vite build`)
   - Resultado: **Sucesso**. Bundles estáticos gerados sem alertas ou quebras.
3. **Validação de Invariantes do Domínio:**
   - Markup sobre o custo: Preservado rigorosamente.
   - Tríade de estados: `commercialStatus`, `financialStatus` e `stage` desacoplados.
   - Gate A.3.2: Ordem de produção não avança para corte sem 50% de sinal e arte aprovada.
   - Comprovantes reais: Exigência de URL e autenticação bancária.
   - Custódia de facções: Rejeição de retornos que excedem o saldo em poder de terceiros.
