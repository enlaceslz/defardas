# Guia de Deploy na Vercel via GitHub — DE FARDAS ERP

Este documento fornece o passo a passo completo para publicar o **DE FARDAS ERP** (frontend Vite SPA + backend Express Serverless `/api/*` + PostgreSQL gerenciado) na **Vercel** com deploy contínuo via GitHub.

> **Nota de Produção:** Para operação completa com WA-AKG (WhatsApp QR Code) e Redis dedicados em container isolado, consulte também `docs/DOCKER_DEPLOY.md`. Na Vercel, o frontend e toda a API `/api/*` (incluindo autenticação, CRM, Orçamentos, PCP, Estoque, Financeiro e Meta WhatsApp Cloud API) operam nativamente via Serverless Function.

---

## 1. Arquitetura Configurada para Vercel

O repositório está configurado para operar **Full-Stack** na Vercel:
- `api/index.ts`: Entry point da **Vercel Serverless Function** (Node.js) que expõe a aplicação Express de `server/app.ts` para todas as rotas `/api/*`.
- `vercel.json`:
  - `functions["api/index.ts"].maxDuration`: `30` segundos.
  - `rewrites`:
    - `/api/(.*)` → `/api` (encaminha `GET`, `POST`, `PUT`, `PATCH`, `DELETE` para a API Express, evitando o erro `HTTP 405 Method Not Allowed`).
    - `/((?!api/).*)` → `/index.html` (fallback SPA apenas para rotas do frontend).
- `server/db/connection.ts` e `server/auth/sessionStore.ts`: Sincronizam `db.ensureReady()` em *cold starts* e aguardam a persistência das sessões em `core.sessions` no PostgreSQL antes de responder ao cliente.

---

## 2. Pré-requisito Obrigatório em Produção: PostgreSQL

Em ambiente `NODE_ENV=production` (padrão da Vercel), os seeds locais e o fallback em memória são **desativados por política de segurança** (`AGENTS.md` §4.2.5).

1. Provisione um banco **PostgreSQL 16+** gerenciado (ex.: Neon, Supabase, Railway, RDS ou PostgreSQL próprio da DE FARDAS acessível via SSL).
2. Aplique as migrações Drizzle ORM contra o banco de produção:
   ```bash
   DATABASE_URL="postgresql://usuario:senha@host:5432/defardas_erp?sslmode=require" npm run db:migrate
   ```
3. Crie o usuário administrador inicial em `core.users` com hash `bcrypt` (12 rounds) executando o CLI seguro do repositório:
   ```bash
   DATABASE_URL="postgresql://usuario:senha@host:5432/defardas_erp?sslmode=require" npm run db:create-admin
   ```
   *(Suporta modo interativo com senha oculta ou flags `--name`, `--email`, `--password`, `--role` e `--reset`.)*

---

## 3. Passo a Passo para Deploy na Vercel

### Passo 1: Conferir as Configurações de Build
A Vercel detectará automaticamente o `vercel.json` e o `package.json`:

| Campo | Valor Esperado |
|---|---|
| **Framework Preset** | `Vite` |
| **Root Directory** | `./` |
| **Install Command** | `npm install --legacy-peer-deps` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |

### Passo 2: Configurar Variáveis de Ambiente na Vercel
Em **Project Settings → Environment Variables**, configure:

- **Obrigatórias:**
  - `DATABASE_URL`: String de conexão PostgreSQL de produção (ex.: `postgresql://...?sslmode=require`).
  - `DATABASE_SSL_MODE`: `require` (ou `verify-full` se fornecer `DATABASE_CA_CERT`).
  - `DATABASE_POOL_MAX`: `5` (recomendado para funções serverless; padrão automático quando `VERCEL=1`).
- **Opcionais (conforme integrações habilitadas):**
  - `S3_ENDPOINT`, `S3_BUCKET_NAME`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_FORCE_PATH_STYLE` (storage privado de artes e comprovantes).
  - `META_WA_TOKEN`, `META_WA_PHONE_NUMBER_ID`, `META_WA_BUSINESS_ACCOUNT_ID`, `META_WA_WEBHOOK_VERIFY_TOKEN`, `META_WA_APP_SECRET` (WhatsApp Business Cloud API oficial).
  - `WA_AKG_ENDPOINT`, `WA_AKG_API_KEY` (caso conecte a uma instância externa do WA-AKG).
  - `GEMINI_API_KEY` (caso habilite recursos server-side de inteligência gerencial).

### Passo 3: Publicar (Deploy)
Faça `git push` para a branch `main` ou clique em **Redeploy** no painel da Vercel.

---

## 4. Validação Pós-Deploy

Após o deploy concluir em `https://defardas.vercel.app`:

1. **Diagnóstico da API (`/api/health`):**
   - Acesse `GET https://defardas.vercel.app/api/health`.
   - Verifique `"runtime": "vercel-serverless"` e `"database.connectedToRemote": true`.
2. **Autenticação (`POST /api/auth/login`):**
   - Realize login com um usuário cadastrado em `core.users`.
   - Se `DATABASE_URL` não estiver configurada, a API retornará `HTTP 503 DATABASE_UNAVAILABLE` com orientação clara (nunca `HTTP 405`).
3. **Portal Público (`POST /api/leads`):**
   - Envie uma solicitação de orçamento na vitrine pública e confirme o registro em CRM → Leads.
4. **Navegação SPA:**
   - Recarregue a página (`F5`) em rotas internas do ERP e confirme que não há erro 404.

