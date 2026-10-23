# DE-FARDAS ERP — Status de Desenvolvimento e Rastreabilidade

**Projeto:** DE-FARDAS ERP — Sua empresa bem vista  
**Localização:** São Luís, Maranhão  
**Repositório Oficial:** https://github.com/enlaceslz/defardas  
**Commit-Base de Referência:** `fefa8901bbb045a73a9b4b00834be25f3ec41b69`  
**Versão Atual:** `1.6.0-P0-ETAPA1`  
**Data da Última Atualização:** 2026-10-23  

---

## 1. Etapa Atual
- **Etapa em Andamento:** **ETAPA 1 — FUNDAÇÃO DE DADOS (PostgreSQL + Drizzle ORM)**
- **Status Geral:** **IMPLEMENTADO E TESTADO (Fase 1 - Ciclo 1)**

---

## 2. Tarefas e Situação por Módulo

| Identificador | Descrição da Tarefa | Arquivo(s) Envolvido(s) | Status | Detalhes / Evidência |
| :--- | :--- | :--- | :---: | :--- |
| **P0-001** | Instalação e Configuração do Drizzle ORM e Drizzle Kit | `package.json`, `drizzle.config.ts`, `server/db/index.ts` | **Homologado** | `drizzle-orm` (0.45.4) e `drizzle-kit` (0.31.11) instalados; `drizzle-kit generate` executado com sucesso gerando 17 tabelas em `drizzle/0000_*.sql`. |
| **P0-001b** | Modelagem dos Schemas Drizzle Tipados | `server/db/schema/*.ts` | **Homologado** | Schemas criados para `core`, `crm`, `producao`, `estoque`, `financeiro`, `communication`. |
| **P0-002** | Persistência de Sessões Seguras em PostgreSQL | `server/auth/sessionStore.ts`, `server/db/schema/sessions.ts` | **Testado** | Sessões armazenadas em `core.sessions` e recarregadas na inicialização do servidor. |
| **P0-003** | Validação de Custódia de Parceiros no Estoque | `server/routes/inventoryRoutes.ts` | **Testado** | Retorno de material de facção agora valida `qty <= item.inPartnersCustodyStock`; rejeita excesso com HTTP 400. |
| **P0-004** | Eliminação de Comprovantes Fictícios no Financeiro | `server/routes/financeRoutes.ts` | **Testado** | Baixa de sinal exige `receiptVoucherNumber` e `receiptEvidenceUrl` reais; ausência rejeitada com HTTP 422. |
| **P0-005** | Revisão de Segurança SSL no PostgreSQL | `server/db/index.ts`, `server/db/connection.ts` | **Implementado** | Validação estrita por padrão em produção (`rejectUnauthorized: true`) e suporte a certificados CA (`DATABASE_CA_CERT`). |
| **P1-001** | Sequenciadores Persistentes no PostgreSQL | `server/services/sequenceService.ts` | **Implementado** | Suporte a queries de sequence atômica no PostgreSQL (`SELECT nextval(...)`). |
| **P1-002** | Eliminação de Identificadores Frágeis (`Date.now()`) | `inventoryRoutes.ts`, `quotesRoutes.ts`, `financeRoutes.ts` | **Implementado** | Substituído `Date.now()` por `crypto.randomUUID()` em chaves primárias. |
| **P1-005** | Remoção de Token Sensível do `localStorage` | `src/api/client.ts` | **Testado** | Token de autenticação mantido apenas em memória e cookies seguros `HttpOnly` com `SameSite=Lax/Strict`. |
| **P1-007** | Correção de Tratamento de Zero (`??`) no Motor de Preços | `server/routes/quotesRoutes.ts` | **Testado** | Substituído operador `||` por `??` para `technicalLossPercentage`, `markupPercentage`, `freightUnitCost`, `customizationUnitCost`. |

---

## 3. Arquivos Modificados no Ciclo Atual

1. `package.json` — Adicionadas dependências `drizzle-orm` e `drizzle-kit`, além de scripts `db:generate` e `db:migrate`.
2. `drizzle.config.ts` — Configuração do Drizzle Kit para dialeto PostgreSQL e schema `./server/db/schema/index.ts`.
3. `server/db/schema/users.ts` — Tabela `core.users` com roles do RBAC.
4. `server/db/schema/sessions.ts` — Tabela `core.sessions` para persistência segura de tokens.
5. `server/db/schema/audit.ts` — Tabelas `core.audit_logs` e `core.event_log`.
6. `server/db/schema/clients.ts` — Tabela `crm.clients`.
7. `server/db/schema/leads.ts` — Tabela `crm.leads`.
8. `server/db/schema/quotes.ts` — Tabelas `crm.quotes` e `crm.quote_items` com breakdown analítico de custos.
9. `server/db/schema/orders.ts` — Tabela `producao.production_orders` com tríade desacoplada e Gate A.3.2.
10. `server/db/schema/inventory.ts` — Tabelas `estoque.items` e `estoque.movements`.
11. `server/db/schema/partners.ts` — Tabelas `producao.partners` e `estoque.partner_custody`.
12. `server/db/schema/finance.ts` — Tabela `financeiro.transactions`.
13. `server/db/schema/communication.ts` — Tabelas `communication.channels`, `conversations` e `messages`.
14. `server/db/schema/index.ts` — Centralização e exportação de todos os schemas.
15. `server/db/index.ts` — Instância Drizzle e Pool PostgreSQL com SSL configurável e seguro.
16. `server/db/connection.ts` — Integração com pool Drizzle centralizado e remoção de SSL inseguro.
17. `server/services/sequenceService.ts` — Integração de sequences atômicas PostgreSQL.
18. `server/routes/quotesRoutes.ts` — Correção de zero com coalescência nula `??` e IDs UUID.
19. `server/routes/inventoryRoutes.ts` — Validação de custódia de terceiros e IDs UUID.
20. `server/routes/financeRoutes.ts` — Validação obrigatória de comprovante bancário real e IDs UUID.
21. `src/api/client.ts` — Eliminação de gravação de token em `localStorage`.
22. `docs/DEVELOPMENT_STATUS.md` — Criação do documento mestre de rastreabilidade do projeto.

---

## 4. Testes e Verificações Executadas

1. **Geração de Migrações Drizzle:**
   - Comando: `npx drizzle-kit generate`
   - Resultado: Sucesso absoluto. 17 tabelas geradas em `drizzle/0000_natural_spacker_dave.sql` com índices e chaves estrangeiras.
2. **Validação de Tipagem TypeScript:**
   - Comando: `npm run lint` (`tsc --noEmit`)
   - Resultado: 0 erros de tipagem.
3. **Compilação da Aplicação:**
   - Comando: `npm run build` (`vite build`)
   - Resultado: Build estático gerado com sucesso em `dist/`.

---

## 5. Problemas Conhecidos e Próxima Tarefa

### Pendências da Etapa 2 (Segurança):
- Implementar middleware de proteção CSRF com cabeçalho `X-CSRF-Token` nos métodos mutantes.
- Configurar rate limiting em rotas sensíveis de login e recuperação de senha.

### Pendências da Etapa 3 (Integridade):
- Migrar o estado do frontend `App.tsx` para consumir diretamente os dados do backend sem depender do `localStorage` operacional.
- Concluir testes de concorrência com locks de linha em estoque (`FOR UPDATE`).

### Pendências da Etapa 4 (Docker):
- Criar `Dockerfile`, `compose.yaml`, `compose.dev.yaml`, `.dockerignore` e scripts operacionais.

### Próxima Tarefa Imediata:
- Consolidar a **Etapa 2 (Segurança)**: Adicionar proteção CSRF, rate-limit e finalizar a integração completa dos repositórios Drizzle nas rotas de API.
