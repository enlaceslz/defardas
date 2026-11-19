# DE FARDAS — Sistema Integrado de Gestão & Portal Comercial

> **DE FARDAS CONFECÇÕES & UNIFORMES LTDA**  
> Fundada em 2015 em São Luís, Maranhão  
> Av. Cel. Colares Moreira, 100 — Renascença — Tel/WhatsApp: `(98) 98135-4130`  
> Referência Técnica: **PRD v1.6 e Adendos Normativos**

---

## 1. Visão Geral

O **DE FARDAS ERP** é uma plataforma desenvolvida para gerenciar de ponta a ponta o ciclo comercial, produtivo e financeiro de uniformes profissionais, corporativos, escolares, operacionais e hospitalares.

A aplicação unifica três ambientes complementares:
1. **Portal Público & Portfólio Digital:** Vitrine institucional para captação de leads e visualização de modelos sob encomenda (10 categorias de fardamentos), com botão *"Solicitar Orçamento"* que alimenta a esteira comercial.
2. **ERP & CRM Interno:** Gestão de clientes B2B, motor de precificação por markup transparente, PCP (Planejamento e Controle da Produção) com portões de liberação, almoxarifado de tecidos com custódia de terceiros e controle financeiro de entrada vs. entrega.
3. **Inteligência Gerencial:** Painel com indicadores fabris em tempo real, capacidade instalada, taxas de pontualidade e relatórios analíticos auditáveis.

---

## 2. Principais Módulos do Sistema

### 2.1. Portal Público & Catálogo Online
- Catálogo navegável dividido nas categorias homologadas:
  - *Polos Corporativas*
  - *Linha Hospitalar & Jalecos*
  - *Calças Operacionais & Brim Pesado*
  - *Camisetas Dry-Fit & Algodão*
  - *Aventais & Batas Gourmet*
  - *Macacões Industriais*
  - *Coletes e Linha Social*
- Formulário de captação de orçamentos integrado ao CRM e ao WhatsApp institucional `(98) 98135-4130`.

### 2.2. Motor de Orçamentos & Precificação Transparente (PRD P0)
- **Fórmula Normativa de Markup:**  
  $$\text{Preço Sugerido} = \text{Custo-base} \times \left(1 + \frac{\text{Markup } k\%}{100}\right)$$
- **Decomposição Clara de Custo:** Tecidos/insumos + Mão de obra de costura terceirizada + Bordado/Silk + Frete + Perda técnica estimada.
- **Cálculo de Margem Gerencial:** Calculada e exibida separadamente da taxa de markup para evitar ilusão contábil.
- **Alçada de Preço:** Alerta visual e obrigatoriedade de registro de autorização caso o preço negociado seja inferior ao preço sugerido.
- **Condição Comercial Padronizada:** 50% de sinal no pedido (para liberação de corte) e 50% do saldo a pagar no ato da entrega.
- **Geração de Proposta Comercial Formal:** Documento em PDF/impressão com dados da empresa, cliente, grade de tamanhos e condições de faturamento.
- **Conversão Idempotente:** Transforma a proposta em OP sem duplicar pedidos em cliques repetidos.

### 2.3. PCP — Chão de Fábrica & Portões de Liberação (PRD P2)
- **Quadro Kanban de 7 Estágios:**
  1. *0. Bloqueado (Entrada / Arte)*: Ordens que aguardam comprovante do sinal de 50% ou aprovação de arte.
  2. *1. Corte & Enfesto*: Liberação na mesa de corte após validação dos portões.
  3. *2. Bordado & Silk (Parceiro)*: Remessa para matrizes Tajima ou serigrafia.
  4. *3. Costura & Montagem*: Chão de fábrica interno ou facções terceirizadas.
  5. *4. Inspeção de Qualidade*: Conferência obrigatória pela DE FARDAS antes do faturamento.
  6. *5. Embalagem & Envio*: Separação por grade, empacotamento e emissão de romaneio.
  7. *6. Concluído / Entregue*: Entrega com registro de protocolo e recebedor.
- **Ficha de Produção Fabril (Imprimível):** Roteiro de fábrica com grade detalhada de tamanhos (PP ao Sob Medida) e tabela de vistos de controle de qualidade por etapa.

### 2.4. Almoxarifado, Tecidoteca & Custódia de Terceiros (PRD §3.2)
- Controle de rolos têxteis e aviamentos (Brim Santanense, Cedro, Gabardine, Malha Piquet/PV, Dry-Fit, faixas refletivas 3M).
- Distinção obrigatória de 3 saldos por item: **Saldo Físico Próprio**, **Saldo Alocado para OPs** e **Saldo em Poder de Terceiros (Facções)**.
- Bloqueio automático de devolução acima da custódia registrada (`HTTP 400`) e impedimento de exclusão de insumos com saldo em facções.
- Registro exclusivo por eventos auditáveis (entrada de compra, saída para corte, remessa/retorno de facção, perda técnica e ajuste compensatório de inventário com justificativa obrigatória).

### 2.5. Carteira de Clientes B2B, Leads & CRM
- Cadastro empresarial completo (Razão Social, Nome Fantasia, CNPJ, contatos, endereço padrão São Luís/MA e especificações de fardamento).
- Captação pública de leads (`POST /api/leads`) integrada ao funil interno e conversão em clientes/orçamentos.

### 2.6. Financeiro & Fluxo de Caixa Auditável
- Contas a Receber estruturadas em **Sinal de Entrada (50%)** e **Saldo na Entrega (50%)**, além de Contas a Pagar para tecidos e facções.
- Quitação com exigência obrigatória de número/autenticação do comprovante bancário e evidência S3 (`receiptEvidenceUrl`).
- Proteção contra liquidação duplicada (`HTTP 409`) e transição automática do status financeiro da OP (`entrada_confirmada` → `quitado`) sem acoplamento com a etapa fabril.

### 2.7. Central WhatsApp Multiprovedor (Omnichannel Nativo)
- Atendimento comercial e operacional nativo dentro do ERP (sem iframes externos).
- Suporte simultâneo a **Meta WhatsApp Business Cloud API** (oficial, com verificação HMAC-SHA256 `X-Hub-Signature-256`) e **WA-AKG por QR Code** em container isolado (com validação de API Key via `timingSafeEqual`).
- Templates operacionais vinculados ao fluxo do Gate A.3.2 (solicitação de aprovação de arte e confirmação de sinal).

---

## 3. Arquitetura, Stack Técnica & Segurança

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4 e Lucide React.
- **Backend:** Node.js + Express (`server.ts`) com rotas modulares (`/api/*`), serviços de domínio e repositórios tipados.
- **Banco de Dados & ORM:** PostgreSQL 16 + **Drizzle ORM** + **Drizzle Kit**, estruturado nos schemas `core`, `crm`, `producao`, `estoque`, `financeiro` e `communication`, com sequenciadores SQL dedicados (`sequenceService`) e chaves primárias UUID (`crypto.randomUUID()`).
- **Segurança & Governança (Auditada V7):**
  - Senhas protegidas com `bcrypt` (12 salt rounds) e sessões CSPRNG persistidas em PostgreSQL (`core.sessions`) com cookie `HttpOnly` e `SameSite=Lax`.
  - Proteção **CSRF Double-Submit Cookie** (`X-CSRF-Token` + `timingSafeEqual`) em todas as mutações da API, com isenção estrita para `POST /api/leads`, autenticação e webhooks assinados.
  - **Rate Limiting** em login e recuperação de senha (`HTTP 429` + `Retry-After`).
  - **RBAC** com 6 perfis normativos (`admin`, `gerente_comercial`, `vendedor`, `pcp_producao`, `financeiro`, `expedicao_qualidade`) aplicado em todas as rotas administrativas e operacionais.
  - Cabeçalhos defensivos (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, remoção de `X-Powered-By`) e trilha de auditoria persistente em `core.audit_logs`.
  - Em `NODE_ENV=production`, seeds de demonstração, endpoint de credenciais de dev e fallback em memória são desativados automaticamente.
- **Infraestrutura & Containers:** Dockerfile multi-stage (Node 22-alpine, usuário não-privilegiado), `compose.yaml` (PostgreSQL 16, Redis 7, ERP e WA-AKG) e scripts de backup/restore com verificação SHA-256 (`scripts/backup.sh`, `scripts/restore.sh`).
- **Impressão A4:** Fichas técnicas de produção (com status real do Gate A.3.2) e propostas comerciais formatadas via `@media print`.

---

## 4. Perfis de Acesso & Ambiente de Desenvolvimento

Em ambiente local de desenvolvimento (`NODE_ENV !== 'production'`), o servidor disponibiliza perfis de teste RBAC consultados dinamicamente pela tela de login via `/api/auth/dev-credentials` (nunca embutidos no bundle de produção):

| Perfil | E-mail | Nome | Alçada / Responsabilidade |
| :--- | :--- | :--- | :--- |
| **Administrador** | `admin@defardas.com.br` | Carlos Eduardo Silva | Alçada total, aprovação de descontos, auditoria e migração |
| **Vendedor** | `vendas@defardas.com.br` | Mariana Alencar | Emissão de propostas comerciais e cadastro de clientes |
| **PCP & Produção** | `pcp@defardas.com.br` | Raimundo Nonato | Gestão da mesa de corte, chão de fábrica e estoque |
| **Financeiro** | `financeiro@defardas.com.br` | Juliana Rocha | Quitação de sinal (50%), conciliação e fluxo de caixa |
| **Gerente Comercial** | `gerente@defardas.com.br` | Roberto Mendes | Gestão de equipe de vendas e esteira de orçamentos |
| **Qualidade & Expedição** | `qualidade@defardas.com.br` | Patrícia Soares | Inspeção final, aprovação de peças e romaneio |

> **Nota de Segurança:** Em produção (`NODE_ENV=production`), o seed de desenvolvimento é bloqueado e `/api/auth/dev-credentials` retorna `404`. Crie os usuários reais diretamente no PostgreSQL com senhas fortes.

---

## 5. Como Executar Localmente

```bash
# 1. Instalar dependências
npm install

# 2. Copiar variáveis de ambiente e configurar PostgreSQL (opcional em dev)
cp .env.example .env

# 3. Gerar/aplicar migrações Drizzle (quando conectado ao PostgreSQL)
npm run db:migrate

# 4. Iniciar servidor de desenvolvimento (Frontend + API na porta 3000)
npm run dev

# 5. Executar análise estática TypeScript e build de produção
npm run lint
npm run build
```

---

## 6. Implantação em Produção (Docker Compose)

A topologia recomendada de produção utiliza Docker Compose com PostgreSQL 16, Redis 7, aplicação ERP e container isolado WA-AKG:

```bash
cp .env.example .env
# Preencha DATABASE_URL, META_WA_APP_SECRET, WA_AKG_API_KEY e credenciais S3
docker compose up -d --build
docker compose exec defardas-app npx drizzle-kit migrate
```

Consulte o manual completo de operação, monitoramento e backup/restore em [`docs/DOCKER_DEPLOY.md`](./docs/DOCKER_DEPLOY.md).

---

## 7. Documentos Complementares

- [`AGENTS.md`](./AGENTS.md): Diretrizes normativas, invariantes do PRD v1.6 e regras de segurança para engenharia e agentes de IA.
- [`docs/DEVELOPMENT_STATUS.md`](./docs/DEVELOPMENT_STATUS.md): Matriz de entregas, rastreabilidade de módulos e histórico da Auditoria Geral V7.
- [`docs/DOCKER_DEPLOY.md`](./docs/DOCKER_DEPLOY.md): Manual de implantação em containers, migrações Drizzle e rotina de backup/restore SHA-256.
- [`DEPLOY.md`](./DEPLOY.md) e [`VERCEL.md`](./VERCEL.md): Guias complementares de servidor dedicado e deploy estático.

