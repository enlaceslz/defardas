<div align="center">

# 🏭 DE FARDAS ERP — Plataforma Integrada de Gestão Industrial & Portal Comercial

### *"Sua empresa bem vista"*

[![React](https://img.shields.io/badge/React-19-149ECA?style=for-the-badge&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Express](https://img.shields.io/badge/Node.js-Express_API-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black)](https://orm.drizzle.team/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](./docs/DOCKER_DEPLOY.md)
[![Vercel](https://img.shields.io/badge/Vercel-Serverless_Ready-000000?style=for-the-badge&logo=vercel&logoColor=white)](./VERCEL.md)

**DE FARDAS CONFECÇÕES & UNIFORMES LTDA** · Fundada em 2015 · São Luís, Maranhão  
Av. Cel. Colares Moreira, 100 — Renascença · Tel/WhatsApp: `(98) 98135-4130`  
Referência Normativa: **PRD v1.6 e Adendos Homologados (B.2.1, B.2.2, B.2.5, A.3.2)**

</div>

---

## 📑 Sumário

1. [Visão Geral & Ecossistema](#-1-visão-geral--ecossistema)
2. [Arquitetura Técnica & Topologia](#-2-arquitetura-técnica--topologia)
3. [Estrutura do Repositório](#-3-estrutura-do-repositório)
4. [Módulos & Regras de Negócio (PRD v1.6)](#-4-módulos--regras-de-negócio-prd-v16)
5. [Segurança, RBAC & Governança](#-5-segurança-rbac--governança)
6. [Como Executar Localmente](#-6-como-executar-localmente)
7. [Implantação em Produção (Docker & Vercel)](#-7-implantação-em-produção-docker--vercel)
8. [Scripts NPM & Comandos Úteis](#-8-scripts-npm--comandos-úteis)
9. [Mapa da Documentação](#-9-mapa-da-documentação)

---

## 🎯 1. Visão Geral & Ecossistema

O **DE FARDAS ERP** gerencia de ponta a ponta o ciclo comercial, produtivo, logístico e financeiro de confecção de uniformes profissionais, corporativos, escolares, operacionais e hospitalares — integrando três ambientes em uma única aplicação:

```mermaid
flowchart LR
    subgraph PUB["🌐 1. Portal Público & Portfólio"]
        P1["Vitrine Digital (10 Categorias)"]
        P2["Solicitação de Orçamento"]
        P3["Atendimento WhatsApp"]
    end

    subgraph ERP["🏭 2. ERP + CRM Interno"]
        E1["CRM & Carteira B2B"]
        E2["Orçamentos (Markup Transparente)"]
        E3["PCP Kanban & Gate A.3.2"]
        E4["Tecidoteca & Custódia de Facções"]
        E5["Financeiro 50/50 Auditável"]
        E6["Central WhatsApp Omnichannel"]
    end

    subgraph BI["📊 3. Inteligência Gerencial"]
        B1["KPIs de Produção & OTD"]
        B2["Margem Real vs. Sugerida"]
        B3["Alertas de Insumos & Auditoria"]
    end

    PUB -- "POST /api/leads" --> E1
    E1 --> E2
    E2 -- "Conversão Idempotente" --> E3
    E2 --> E5
    E5 -- "Sinal 50% + Comprovante" --> E3
    E4 <--> E3
    E6 <--> E1
    ERP --> BI
```

---

## 🏗️ 2. Arquitetura Técnica & Topologia

A aplicação foi estruturada para operar de forma unificada tanto em **servidor dedicado / Docker Compose** quanto em **Vercel Full-Stack Serverless**, compartilhando exatamente a mesma factory Express (`server/app.ts`) sem duplicação de código e com o **PostgreSQL** como fonte única de verdade.

```mermaid
flowchart TB
    Client["🖥️ Navegador / SPA React 19 + Vite + Tailwind v4"]

    subgraph Runtime["⚡ Camada de Execução Backend (Express Modular)"]
        AppFactory["server/app.ts — createApiApp()<br/>CSRF Double-Submit · Auth RBAC · 10 Routers /api/*"]
        NodeSrv["server.ts<br/>(Local Dev + Docker Produção)"]
        VercelFn["api/index.ts<br/>(Vercel Serverless Function)"]
        NodeSrv --> AppFactory
        VercelFn --> AppFactory
    end

    subgraph Data["🗄️ Persistência & Integrações"]
        PG[("PostgreSQL 16 + Drizzle ORM<br/>Schemas: core, crm, producao,<br/>estoque, financeiro, communication")]
        Redis[("Redis 7<br/>Cache / Filas")]
        S3[("Storage S3 Privado<br/>Artes, Fichas e Comprovantes")]
        WA["WhatsApp Multiprovedor<br/>Meta Cloud API (HMAC) + WA-AKG (QR)"]
    end

    Client -- "HTTPS /api/* + HttpOnly Cookie + X-CSRF-Token" --> Runtime
    AppFactory --> PG
    AppFactory --> S3
    AppFactory --> WA
    NodeSrv -.-> Redis
```

### Stack Tecnológica

| Camada | Tecnologia | Função Principal |
| :--- | :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide React, Motion | Interface nativa DE FARDAS (Portal Público isolado + ERP Interno com impressão A4) |
| **Backend** | Node.js 22, Express 4, TypeScript (`tsx`) | API REST modular (`/api/*`), regras de domínio, RBAC, CSRF e webhooks |
| **Banco & ORM** | PostgreSQL 16, Drizzle ORM, Drizzle Kit | Fonte única de verdade com 6 schemas dedicados e sequenciadores SQL |
| **Autenticação** | `bcryptjs` (12 rounds), Sessões CSPRNG (`core.sessions`) | Cookies `HttpOnly` + `SameSite=Lax`, suporte a Bearer Token e auditoria |
| **Comunicação** | Meta WhatsApp Business Cloud API + WA-AKG (Docker) | Atendimento omnichannel nativo sem iframes externos |
| **Storage** | S3-compatible privado (`S3_*`) | Evidências de comprovantes bancários (`receiptEvidenceUrl`) e artes aprovadas |
| **Infraestrutura** | Docker multi-stage, Docker Compose, Vercel Serverless | Deploy reproduzível com backups SHA-256 ou publicação contínua via GitHub |

---

## 📂 3. Estrutura do Repositório

```text
defardas/
├── api/
│   └── index.ts                  # Entry point Vercel Serverless Function (/api/*)
├── server/
│   ├── app.ts                    # Factory Express compartilhada (middlewares + 10 routers)
│   ├── auth/                     # RBAC (6 perfis), bcrypt (PasswordService) e SessionStore
│   ├── db/
│   │   ├── index.ts              # Pool PostgreSQL (SSL estrito) + instância Drizzle ORM
│   │   ├── connection.ts         # DatabaseManager com ensureReady() (cold-start safe)
│   │   ├── userRepository.ts     # Persistência de usuários em core.users
│   │   └── schema/               # Schemas Drizzle: core, crm, producao, estoque, financeiro, communication
│   ├── middleware/               # CSRF Double-Submit Cookie e Rate Limiter (HTTP 429)
│   ├── repositories/             # Repositórios tipados por módulo
│   ├── routes/                   # Rotas REST: auth, quotes, orders, finance, inventory, leads, clients, communication, audit, migration
│   └── services/                 # Serviços de domínio (pricing, sequenceService, auditService, S3, WhatsApp)
├── src/
│   ├── api/                      # ApiClient (CSRF/Bearer) e AuthContext
│   ├── components/               # Telas do ERP (PCP, Orçamentos, Financeiro, Estoque, CRM, WhatsApp, Portal Público, Impressão A4)
│   ├── data/                     # Catálogo institucional e configurações de categorias
│   └── types/                    # Tipagens TypeScript de domínio
├── scripts/
│   ├── create-admin.ts           # CLI seguro para provisionar/redefinir usuários em core.users
│   ├── backup.sh                 # Backup PostgreSQL com checksum SHA-256
│   └── restore.sh                # Restauração auditada com verificação de integridade
├── drizzle/ & migrations/        # Migrações SQL versionadas (Drizzle Kit)
├── docs/                         # Documentação técnica (DOCKER_DEPLOY.md, DEVELOPMENT_STATUS.md)
├── server.ts                     # Servidor Full-Stack local/Docker (Express + Vite/dist)
├── compose.yaml                  # Stack de produção (PostgreSQL 16 + Redis 7 + ERP + WA-AKG)
├── vercel.json                   # Rewrites SPA + Serverless Function (/api/* -> /api)
├── AGENTS.md                     # Diretrizes normativas e invariantes do PRD v1.6
└── VERCEL.md                     # Guia passo a passo de deploy Full-Stack na Vercel
```

---

## 🧩 4. Módulos & Regras de Negócio (PRD v1.6)

### 4.1. Portal Público & Portfólio Digital
- Vitrine institucional desautenticada e isolada da navegação interna do ERP.
- **10 categorias homologadas** de fardamentos (*Polos Corporativas, Linha Hospitalar & Jalecos, Calças Operacionais & Brim Pesado, Camisetas Dry-Fit & Algodão, Aventais & Batas Gourmet, Macacões Industriais, Coletes e Linha Social*, entre outras).
- Formulário *"Solicitar Orçamento"* integrado diretamente ao endpoint público `POST /api/leads` (alimentando o CRM) e ao WhatsApp institucional `(98) 98135-4130`.

### 4.2. Motor de Orçamentos & Precificação Transparente (Adendo B.2.1 & B.2.5)
- **Fórmula Homologada (Markup sobre Custo):**
  $$\text{Preço Sugerido} = \text{Custo-base} \times \left(1 + \frac{\text{Markup } k\%}{100}\right)$$
- **Margem Gerencial Estimada (exibida separadamente):**
  $$\text{Margem Estimada (\%)} = \frac{\text{Preço Negociado} - \text{Custo-base}}{\text{Preço Negociado}} \times 100$$
- **Decomposição Transparente (`CostBreakdown`):** tecidos/aviamentos + costura terceirizada + bordado/silk + frete rateado + perda técnica estimada.
- **Alçada de Desconto:** qualquer preço negociado abaixo do sugerido exige aprovação explícita de **Administrador** (validada no backend via `HTTP 403 DISCOUNT_REQUIRES_ADMIN_APPROVAL`).
- **Condição Padrão & Idempotência:** 50% de sinal (liberação de corte) + 50% na entrega; conversão de proposta em Ordem de Produção (OP) 100% **idempotente** (cliques repetidos nunca duplicam OPs nem lançamentos financeiros).
- **Proposta Comercial A4:** geração formatada para impressão/PDF.

### 4.3. PCP — Tríade Desacoplada & Portão de Liberação Fabril (Gate A.3.2)

O sistema separa estritamente `commercialStatus`, `financialStatus` e `stage` operacional. Uma OP **nunca avança para Corte** sem atender simultaneamente aos dois critérios do **Gate A.3.2** (validados no servidor via `HTTP 422`):

```mermaid
flowchart LR
    OP["📋 OP Criada<br/>aguardando_liberacao"] --> G1{"💰 Sinal 50%<br/>Confirmado com<br/>Comprovante?"}
    G1 -- "Não (HTTP 422)" --> BLK["🔒 Bloqueada<br/>Aguardando Liberação"]
    G1 -- "Sim" --> G2{"🎨 Arte/Layout<br/>Aprovada pelo<br/>Cliente?"}
    G2 -- "Não (HTTP 422)" --> BLK
    G2 -- "Sim" --> S1["✂️ 1. Corte & Enfesto"]
    S1 --> S2["🧵 2. Bordado & Silk"]
    S2 --> S3["🪡 3. Costura & Facção"]
    S3 --> S4["🔍 4. Inspeção Qualidade"]
    S4 -- "Ajuste" --> RW["♻️ Retrabalho"]
    RW --> S4
    S4 -- "Aprovada" --> S5["📦 5. Expedição & Romaneio"]
    S5 --> S6["✅ 6. Entregue"]
```

- **Ficha Fabril Imprimível (A4):** exibe grade completa de tamanhos (`PP` ao `Sob Medida`), especificações de personalização, status real do Gate A.3.2 e quadro de vistos de qualidade.

### 4.4. Almoxarifado, Tecidoteca & Custódia de Terceiros (Facções)
Controle rigoroso de rolos têxteis e aviamentos com **3 saldos obrigatórios por item**:

| Saldo | Descrição | Regra de Integridade |
| :--- | :--- | :--- |
| **Físico Próprio** | Estoque disponível no galpão DE FARDAS | Alterado apenas por eventos auditáveis (nunca sobrescrita cega) |
| **Alocado para OPs** | Reservado para ordens ativas na mesa de corte | Impede comprometimento duplo de rolos |
| **Em Poder de Terceiros** | Materiais remetidos a facções de costura/bordado | Bloqueia devolução acima da custódia (`HTTP 400`) e impede exclusão do insumo |

### 4.5. Financeiro Auditável (50/50) & Central WhatsApp Multiprovedor
- **Financeiro:** contas a receber vinculadas a `Sinal (50%)` e `Saldo na Entrega (50%)`, quitação obrigatória com número de comprovante + evidência S3 (`receiptEvidenceUrl`) e proteção contra baixa duplicada (`HTTP 409`).
- **Central WhatsApp Nativa:** atendimento omnichannel integrado ao CRM com suporte simultâneo à **Meta WhatsApp Business Cloud API** (webhooks validados via HMAC-SHA256 `X-Hub-Signature-256`) e ao **WA-AKG por QR Code** em container isolado (validação `timingSafeEqual` via `WA_AKG_API_KEY`).

---

## 🔐 5. Segurança, RBAC & Governança

### Matriz de Perfis (RBAC)

| Perfil (`role`) | Responsabilidade Principal | Alçadas Exclusivas / Restrições |
| :--- | :--- | :--- |
| **`admin`** | Diretoria & Governança | Alçada total, autorização de descontos abaixo do sugerido, auditoria e migração |
| **`gerente_comercial`** | Gerência de Vendas | Gestão da carteira B2B, orçamentos, canais WhatsApp e aprovação de artes |
| **`vendedor`** | Comercial & Atendimento | Propostas comerciais, clientes, leads e envio de templates WhatsApp |
| **`pcp_producao`** | PCP & Mestre de Corte | Avanço de etapas no Kanban fabril, estoque, remessa/retorno de facções |
| **`financeiro`** | Controladoria & Caixa | Confirmação de sinal 50% com comprovante, lançamentos e conciliação |
| **`expedicao_qualidade`** | Qualidade & Logística | Conferência final de peças, retrabalho, expedição e registro de entrega |

### Controles de Segurança Ativos
- **Autenticação & Sessões:** `bcrypt` (12 salt rounds), tokens CSPRNG de 256 bits persistidos em `core.sessions`, cookies `HttpOnly` + `SameSite=Lax` e rejeição total de cabeçalhos forjados (`x-user-role`, `x-user-id`).
- **Proteção CSRF:** Double-Submit Cookie (`X-CSRF-Token` verificado com `crypto.timingSafeEqual`) em todas as rotas mutativas (`POST`, `PUT`, `PATCH`, `DELETE`).
- **Rate Limiting & Allowlist:** limitação de taxa em login/recuperação de senha (`HTTP 429` + `Retry-After`) e *allowlist* explícita de campos em atualizações (prevenção de *mass assignment* e bypass do Gate A.3.2).
- **Blindagem de Produção (`NODE_ENV=production`):** desativa automaticamente seeds de demonstração, fallback em memória e o endpoint `/api/auth/dev-credentials` (`HTTP 404`).
- **Rastreabilidade:** chaves primárias `UUID` (`crypto.randomUUID()`), códigos legíveis por sequenciadores SQL (`OP-2026-XXXX`, `ORC-2026-XXXX`, `FIN-2026-XXXX`, `CLI-XXXX`) e trilha persistente em `core.audit_logs`.

---

## 💻 6. Como Executar Localmente

### Pré-requisitos
- **Node.js 20+** (recomendado 22 LTS) e **npm 10+**
- **PostgreSQL 16+** *(opcional em desenvolvimento local; obrigatório em produção)*

### Passo a passo

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env

# 3. Aplicar migrações Drizzle ORM (quando conectado ao PostgreSQL)
npm run db:migrate

# 4. Iniciar aplicação Full-Stack (Frontend Vite + API Express na porta 3000)
npm run dev
```

Acesse **`http://localhost:3000`**.

### Contas de Teste (Apenas Desenvolvimento)

Quando `NODE_ENV !== 'production'`, a tela de login exibe o painel **Perfis Pré-Cadastrados (Ambiente de Desenvolvimento)** com preenchimento rápido (senha padrão: `DeFardas@2026!` ou `ERP_DEV_PASSWORD`):

| Perfil | E-mail Corporativo (Dev) | Nome |
| :--- | :--- | :--- |
| Administrador | `admin@defardas.com.br` | Carlos Eduardo Silva |
| Gerente Comercial | `gerente@defardas.com.br` | Roberto Mendes |
| Vendedor | `vendas@defardas.com.br` | Mariana Alencar |
| PCP & Produção | `pcp@defardas.com.br` | Raimundo Nonato |
| Financeiro | `financeiro@defardas.com.br` | Juliana Rocha |
| Qualidade & Expedição | `qualidade@defardas.com.br` | Patrícia Soares |

---

## 🚀 7. Implantação em Produção (Docker & Vercel)

### Opção A — Docker Compose (Recomendada para Operação Fabril Completa)
Inclui **PostgreSQL 16**, **Redis 7**, **DE FARDAS ERP** e container isolado **WA-AKG (WhatsApp QR Code)**:

```bash
# 1. Configure .env com credenciais reais de produção (DATABASE_URL, S3, META_WA_*, WA_AKG_*)
cp .env.example .env

# 2. Suba a stack completa com build multi-stage
docker compose up -d --build

# 3. Aplique as migrações Drizzle ORM no PostgreSQL
docker compose exec defardas-app npm run db:migrate

# 4. Provisione o primeiro administrador de produção (modo interativo seguro)
docker compose exec -it defardas-app npm run db:create-admin
```

> 📘 Guia detalhado de operação, TLS/Nginx e backups SHA-256: [`docs/DOCKER_DEPLOY.md`](./docs/DOCKER_DEPLOY.md)

### Opção B — Vercel (Full-Stack Serverless + PostgreSQL Gerenciado)
O repositório conta com `api/index.ts` e `vercel.json` configurados para servir tanto o frontend Vite (`dist/`) quanto toda a API Express (`/api/*`) sem erro `HTTP 405`.

1. Conecte o repositório GitHub na Vercel e configure as variáveis de ambiente obrigatórias:
   - `DATABASE_URL` (PostgreSQL 16+ gerenciado com SSL)
   - `DATABASE_SSL_MODE=require`
2. Execute as migrações e crie o primeiro administrador contra o banco de produção:
   ```bash
   DATABASE_URL="postgresql://usuario:senha@host:5432/defardas_erp?sslmode=require" npm run db:migrate
   DATABASE_URL="postgresql://usuario:senha@host:5432/defardas_erp?sslmode=require" npm run db:create-admin
   ```
3. Valide após o deploy acessando `GET https://seu-dominio.vercel.app/api/health` (`"runtime": "vercel-serverless"` e `"connectedToRemote": true`).

> 📘 Guia completo da Vercel: [`VERCEL.md`](./VERCEL.md)

---

## 🛠️ 8. Scripts NPM & Comandos Úteis

| Comando | Descrição |
| :--- | :--- |
| `npm run dev` | Inicia o servidor Full-Stack Express + Vite em modo desenvolvimento (porta `3000`) |
| `npm run start` | Executa o servidor Express em modo produção servindo o bundle de `dist/` |
| `npm run build` | Compila o frontend de produção com Vite (`dist/`) |
| `npm run lint` | Executa verificação estática estrita TypeScript (`tsc --noEmit`) |
| `npm run db:generate` | Gera novos arquivos de migração SQL a partir dos schemas Drizzle |
| `npm run db:migrate` | Aplica as migrações versionadas no banco PostgreSQL (`DATABASE_URL`) |
| `npm run db:create-admin` | CLI seguro para criar ou redefinir (`--reset`) usuários corporativos em `core.users` |
| `npm run clean` | Remove artefatos temporários de build (`dist/`) |

---

## 📚 9. Mapa da Documentação

| Documento | Conteúdo |
| :--- | :--- |
| [`AGENTS.md`](./AGENTS.md) | Princípios inegociáveis do PRD v1.6, arquitetura homologada e invariantes de segurança |
| [`VERCEL.md`](./VERCEL.md) | Deploy Full-Stack na Vercel (`api/index.ts` + `vercel.json` + PostgreSQL gerenciado) |
| [`docs/DOCKER_DEPLOY.md`](./docs/DOCKER_DEPLOY.md) | Implantação com Docker Compose, migrações, monitoramento e backup/restore SHA-256 |
| [`docs/DEVELOPMENT_STATUS.md`](./docs/DEVELOPMENT_STATUS.md) | Matriz de entregas, rastreabilidade de módulos e histórico da Auditoria Geral V7 |
| [`DEPLOY.md`](./DEPLOY.md) | Guia de publicação em VPS/servidor Linux dedicado e checklist de homologação |

---

<div align="center">
  <sub>© 2015–2026 <strong>DE FARDAS Confecções & Uniformes LTDA</strong> · São Luís, Maranhão · Todos os direitos reservados.</sub>
</div>
