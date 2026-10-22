# DE FARDAS ERP — Auditoria da Fundação P0 & Arquitetura Empresarial

**Projeto:** DE FARDAS — Confecção de Uniformes Profissionais (São Luís, Maranhão)  
**Documentos Normativos de Referência:** PRD v1.6, Adendos Funcionais (v1.2, v1.3, v1.4), AGENTS.md  
**Escopo Desta Entrega:** Auditoria de Fundação P0, Modelagem PostgreSQL, Arquitetura de Segurança, Plano de Migração e Critérios de Aceite (Sem alterações de código destrutivas ou prematuras).

---

## Sumário Executivo e Decisões Críticas

> [!IMPORTANT]
> **Decisões Normativas Obrigatórias (Invariantes do PRD v1.6):**
> 1. **Markup sobre Custo $\neq$ Margem sobre Receita (Adendo B.2.1):** A precificação no motor é calculada estritamente como $\text{Preço Sugerido} = \text{Custo-base} \times (1 + k/100)$. A margem gerencial sobre a receita é calculada separadamente como indicador informativo: $\text{Margem Estimada (\%)} = \frac{\text{Preço Negociado} - \text{Custo-base}}{\text{Preço Negociado}} \times 100$.
> 2. **Portão Rígido de Liberação Fabril (Gate A.3.2):** Uma Ordem de Produção (OP) jamais pode transitar para `corte` sem que o sinal de 50% esteja com comprovante anexado e confirmado no financeiro (`entryPaymentConfirmed = true`) e a arte final formalmente aprovada pelo cliente (`artApproved = true`).
> 3. **Tríade de Estados Desacoplados (Regra B.2.2):** O status comercial (`commercialStatus`), financeiro (`financialStatus`) e operacional fabril (`stage`) são entidades distintas no banco de dados e nunca unificadas.
> 4. **Alçadas e Negação por Padrão (Adendo B.2.5):** Diante do conflito pendente entre "somente administrador concede descontos" e "gerente ou administrador", o sistema adota estritamente alçada restrita ao **Administrador** por padrão para qualquer preço negociado inferior ao preço sugerido.

---

## 1. Arquitetura Atual Comprovada (Auditoria da Base de Código)

A inspeção detalhada do código-fonte atual (`src/utils/storage.ts`, `src/App.tsx`, `src/components/*.tsx`) evidenciou os seguintes fatos arquiteturais:

### 1.1. Topologia e Persistência
- **Frontend SPA 100% Client-Side:** Aplicação React 19 + TypeScript + Vite 8.3 executando inteiramente no navegador.
- **Persistência Exclusiva em LocalStorage:** Todo o estado do ERP é armazenado em chaves locais sob o prefixo `defardas_*_v2` (`defardas_orders_v2`, `defardas_quotes_v2`, `defardas_clients_v2`, etc.).
- **Ciclo de Estado em Memória:** `App.tsx` lê o `localStorage` no carregamento via `useState(() => loadERPState())` e grava serializações síncronas completas (`JSON.stringify`) a cada mutação de estado via `useEffect`.

```
┌────────────────────────────────────────────────────────┐
│                   ESTADO ATUAL (AUDITORIA)             │
│                                                        │
│  [Navegador / Dispositivo do Usuário]                  │
│   ├── React 19 SPA (App.tsx)                          │
│   │    └── Estado monolítico em memória (useState)     │
│   │         ├── saveERPState() (useEffect síncrono)    │
│   │         └── loadERPState()                         │
│   └── LocalStorage (`defardas_*_v2`)                   │
│        └── Sem concorrência, sem ACID, sem backup      │
│                                                        │
│  [Portal Público / Captação de Leads]                  │
│   └── Salva lead apenas no localStorage do visitante!  │
│       O comercial interno NÃO recebe o lead centralizado│
└────────────────────────────────────────────────────────┘
```

### 1.2. Vulnerabilidades Críticas Identificadas
1. **Identificadores Aleatórios e de Alto Risco de Colisão:**
   - Criação de OPs: `id: orderSpecificId` com formato `OP-${ano}-${index}` ou `Date.now()`.
   - Criação de Orçamentos: `ORC-${Math.floor(930 + Math.random() * 60)}` (faixa de apenas 60 números aleatórios, garantindo colisão quase imediata em múltiplos acessos).
   - Clientes e Transações: `cli-${Date.now()}` e `fin-sinal-${Date.now()}`. Não há sequenciamento seguro, auditoria fiscal ou conformidade contábil.
2. **Captação de Leads Desconectada:**
   - No portal público (`PublicCatalogView.tsx`), a submissão de formulário dispara `handleRequestQuoteFromPortal` em `App.tsx`, que grava o cliente e orçamento apenas no `localStorage` do navegador do próprio visitante. Não há backend para centralizar o lead nem notificar o comercial.
3. **Ausência de Autenticação e RBAC (Controle de Acesso):**
   - Não há login, sessão de usuário ou validação de perfis. Qualquer operador pode acessar telas financeiras, alterar preços, simular autorizações ou excluir itens.
4. **Autorizações Fictícias no Frontend:**
   - Em `NewQuoteModal.tsx`, descontos abaixo do preço sugerido são marcados com `authorizerName: 'Carlos Eduardo (Gerente Comercial)'` de forma estática no código, sem qualquer registro de auditoria, autenticação do autorizador ou senha de confirmação.
5. **Portão de Liberação Fabril Frágil (Gate A.3.2):**
   - A trava para corte existe apenas como uma condicional visual no React (`ProductionOrdersView.tsx`), disparando `alert()` do navegador. No financeiro (`FinancialView.tsx`), a quitação de parcelas é um simples toggle booleano que nem sequer valida o comprovante de pagamento nem atualiza automaticamente o flag `entryPaymentConfirmed` da OP correspondente.
6. **Risco de Perda Total de Dados e Falta de Transacionalidade:**
   - Limpeza de cache, navegação anônima ou corrupção de dados no navegador provocam perda imediata de todos os lançamentos. Conversão de orçamento em OP não ocorre em bloco transacional atômico.

---

## 2. Arquitetura Proposta (Enterprise Full-Stack + PostgreSQL)

A arquitetura proposta moderniza a plataforma DE FARDAS para um padrão empresarial robusto, preservando integralmente os componentes React, a identidade visual e o design system moderno recém-construído:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                   ARQUITETURA PROPOSTA (DE FARDAS ERP)                   │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. CLIENT LAYER (React 19 + TypeScript + Tailwind CSS v4)                │
│    ├── Portal Público & Vitrine Digital (Lead Capture centralizado)      │
│    ├── ERP & PCP Industrial (Views de Orçamentos, OPs, Estoque, Finanças)│
│    └── API Client Layer (Axios/Fetch com interceptores JWT & Idempotência│
├──────────────────────────────────────────────────────────────────────────┤
│ 2. BACKEND LAYER (Node.js / Express Modular + TypeScript)                │
│    ├── Middlewares: Helmet, CORS, Rate Limit, Auth JWT, RBAC Guard       │
│    ├── Idempotency Engine: Registro de chaves idempotentes de transação  │
│    ├── Audit Interceptor: Log automático de todas as mutações no banco   │
│    └── Controladores de Domínio:                                         │
│        ├── /api/auth (Login, Logout, Sessões, MFA opcional)             │
│        ├── /api/comercial (Leads, Clientes, Orçamentos Versionados)      │
│        ├── /api/pcp (Ordens de Produção, Fichas Técnicas, Gate Checks)   │
│        ├── /api/materiais (Almoxarifado, Saldo de Terceiros / Facções)   │
│        ├── /api/financeiro (Títulos, Baixa com Comprovante, Conciliação) │
│        └── /api/migracao (Migração segura de dados locais existentes)    │
├──────────────────────────────────────────────────────────────────────────┤
│ 3. PERSISTENCE & DATA INTEGRITY LAYER                                    │
│    ├── PostgreSQL Próprio DE FARDAS (Conexão Pool com SSL/TLS)           │
│    │   ├── Schemas: core, crm, producao, estoque, financeiro             │
│    │   ├── Constraints: CHECK sinal 50%, CHECK portão de corte, FKs       │
│    │   ├── Sequences Atômicas: ORC-2026-XXXX, OP-2026-XXXX               │
│    │   └── Triggers de Auditoria e Imutabilidade de Versões Aprovadas    │
│    └── Armazenamento Privado S3-Compatível                               │
│        └── Upload de Comprovantes, Fichas e Artes com URLs Assinadas     │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.1. Princípios da Arquitetura Proposta
- **Separação de Camadas:** O frontend consome endpoints REST autenticados. Nenhuma regra crítica de negócio roda exclusivamente no navegador.
- **Idempotência Garantida:** Cada conversão de Proposta Comercial em OP envia um `idempotency_key = "convert_quote_{quote_id}_v{version}"`. O backend rejeita operações duplicadas e assegura que a OP e os títulos financeiros correspondentes sejam criados exatamente uma única vez.
- **Armazenamento Privado de Comprovantes:** Comprovantes de sinal de 50% e aprovações de arte exigem upload real para bucket S3-compatível com URL pré-assinada de expiração curta, gerando registro auditável na tabela `financeiro.payment_receipts`.

---

## 3. Modelo Inicial de Banco de Dados (PostgreSQL Schemas & DDL)

Para garantir integridade transacional, isolamento de escopo e facilidade de manutenção, o banco é estruturado em schemas específicos:

```
┌──────────────┐     ┌──────────────┐     ┌────────────────┐
│  core.users  │◄──┐ │  crm.clients │◄──┐ │ crm.leads      │
└──────────────┘   │ └──────────────┘   │ └────────────────┘
       ▲           │        ▲           │
       │           │        │           │
┌──────────────┐   │ ┌──────────────┐   │ ┌────────────────┐
│  core.audit  │   │ │  crm.quotes  │───┼─┤crm.quote_items │
└──────────────┘   │ └──────────────┘   │ └────────────────┘
                   │        ▲           │
                   │        │ 1:1       │
                   │ ┌────────────────┐ │
                   ├─┤producao.orders ├─┘
                   │ └────────────────┘
                   │   ▲            ▲
                   │   │            │
┌────────────────┐ │ ┌────────────┐ ┌────────────────────┐
│estoque.movim.  │─┴─┤estoque.item│ │fin.transactions   │
└────────────────┘   └────────────┘ └────────────────────┘
```

### 3.1. DDL Completo das Entidades Centrais

```sql
-- Habilitar extensão para UUIDs v4
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. SCHEMAS
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS producao;
CREATE SCHEMA IF NOT EXISTS estoque;
CREATE SCHEMA IF NOT EXISTS financeiro;

-- 2. SEQUÊNCIAS ATÔMICAS PARA IDENTIFICADORES SEGUROS
CREATE SEQUENCE IF NOT EXISTS core.seq_quote_number START 1001;
CREATE SEQUENCE IF NOT EXISTS core.seq_order_number START 101;
CREATE SEQUENCE IF NOT EXISTS core.seq_transaction_number START 5001;

-- 3. CORE: USUÁRIOS E CONTROLE DE ACESSO (RBAC)
CREATE TABLE core.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN (
        'admin', 'gerente_comercial', 'vendedor', 
        'pcp_producao', 'financeiro', 'expedicao_qualidade'
    )),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE core.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES core.users(id),
    actor_name VARCHAR(120) NOT NULL,
    entity_name VARCHAR(60) NOT NULL,
    entity_id VARCHAR(60) NOT NULL,
    action VARCHAR(30) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE', 'GATE_BYPASS_ATTEMPT', 'AUTHORIZE_DISCOUNT'
    old_data JSONB,
    new_data JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. CRM: CLIENTES, LEADS E PROPOSTAS COMERCIAIS
CREATE TABLE crm.clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) UNIQUE NOT NULL,
    company_name VARCHAR(150) NOT NULL,
    trade_name VARCHAR(150) NOT NULL,
    cnpj VARCHAR(20) UNIQUE NOT NULL,
    state_registration VARCHAR(30),
    contact_name VARCHAR(100) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    email VARCHAR(150) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(80) NOT NULL DEFAULT 'São Luís',
    state VARCHAR(2) NOT NULL DEFAULT 'MA',
    segment VARCHAR(60) NOT NULL,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE crm.quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_number VARCHAR(30) UNIQUE NOT NULL, -- Ex: ORC-2026-1001
    version INT NOT NULL DEFAULT 1,
    client_id UUID NOT NULL REFERENCES crm.clients(id),
    seller_id UUID REFERENCES core.users(id),
    commercial_status VARCHAR(30) NOT NULL DEFAULT 'rascunho' CHECK (
        commercial_status IN ('rascunho', 'enviado', 'em_negociacao', 'aprovado', 'recusado', 'cancelado', 'convertido_em_pedido')
    ),
    valid_until DATE NOT NULL,
    total_base_cost NUMERIC(12,2) NOT NULL CHECK (total_base_cost >= 0),
    markup_percentage NUMERIC(6,2) NOT NULL CHECK (markup_percentage >= 0),
    suggested_total_amount NUMERIC(12,2) NOT NULL,
    negotiated_total_amount NUMERIC(12,2) NOT NULL,
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    
    -- Autorização de desconto auditável
    below_suggested_authorized BOOLEAN NOT NULL DEFAULT FALSE,
    authorized_by_id UUID REFERENCES core.users(id),
    authorization_date TIMESTAMP WITH TIME ZONE,
    
    -- Portão comercial obrigatório: 50% de sinal fixado
    entry_percentage NUMERIC(5,2) NOT NULL DEFAULT 50.00 CHECK (entry_percentage = 50.00),
    entry_amount NUMERIC(12,2) NOT NULL,
    balance_amount NUMERIC(12,2) NOT NULL,
    production_lead_days INT NOT NULL DEFAULT 16,
    
    -- Aceite de Arte
    art_approved BOOLEAN NOT NULL DEFAULT FALSE,
    art_approved_by VARCHAR(100),
    art_approval_date TIMESTAMP WITH TIME ZONE,
    art_file_url TEXT,
    
    -- Rastreabilidade de aceite formal
    acceptance_evidence_channel VARCHAR(30) CHECK (acceptance_evidence_channel IN ('whatsapp', 'email', 'presencial')),
    acceptance_evidence_notes TEXT,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE, -- Imutável após aprovação
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_discount_authorization CHECK (
        (negotiated_total_amount >= suggested_total_amount) OR 
        (below_suggested_authorized = TRUE AND authorized_by_id IS NOT NULL)
    )
);

CREATE TABLE crm.quote_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_id UUID NOT NULL REFERENCES crm.quotes(id) ON DELETE CASCADE,
    category VARCHAR(40) NOT NULL,
    model_name VARCHAR(150) NOT NULL,
    fabric_name VARCHAR(100) NOT NULL,
    fabric_color VARCHAR(60) NOT NULL,
    sizes JSONB NOT NULL, -- { pp: 0, p: 10, m: 20, ... }
    total_quantity INT NOT NULL CHECK (total_quantity > 0),
    
    -- Composição de Custo Unitário Transparente (PRD Adendo B.2.1)
    material_unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
    outsourced_sewing_unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
    customization_unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
    freight_unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
    technical_loss_percentage NUMERIC(5,2) NOT NULL DEFAULT 2.00,
    calculated_base_unit_cost NUMERIC(10,2) NOT NULL,
    markup_percentage NUMERIC(6,2) NOT NULL,
    suggested_unit_price NUMERIC(10,2) NOT NULL,
    negotiated_unit_price NUMERIC(10,2) NOT NULL,
    total_item_price NUMERIC(12,2) NOT NULL
);

-- 5. PCP & PRODUÇÃO: ORDENS DE PRODUÇÃO E PORTÕES FABRIS
CREATE TABLE producao.production_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(30) UNIQUE NOT NULL, -- Ex: OP-2026-0101
    quote_id UUID REFERENCES crm.quotes(id),
    quote_version INT NOT NULL DEFAULT 1,
    idempotency_key VARCHAR(100) UNIQUE NOT NULL, -- Impede duplicação em cliques concorrentes
    client_id UUID NOT NULL REFERENCES crm.clients(id),
    item_title VARCHAR(150) NOT NULL,
    category VARCHAR(40) NOT NULL,
    total_pieces INT NOT NULL CHECK (total_pieces > 0),
    sizes JSONB NOT NULL,
    
    -- Tríade de Estados Desacoplados (Regra B.2.2)
    commercial_status VARCHAR(30) NOT NULL DEFAULT 'aprovado',
    financial_status VARCHAR(30) NOT NULL DEFAULT 'entrada_pendente' CHECK (
        financial_status IN ('entrada_pendente', 'entrada_confirmada', 'saldo_em_aberto', 'quitado')
    ),
    stage VARCHAR(30) NOT NULL DEFAULT 'aguardando_liberacao' CHECK (
        stage IN (
            'aguardando_liberacao', 'corte', 'bordado_silk', 
            'costura', 'conferencia_qualidade', 'retrabalho', 
            'expedicao', 'entregue'
        )
    ),
    
    -- Portão Rígido de Liberação Fabril (Gate A.3.2)
    art_approved BOOLEAN NOT NULL DEFAULT FALSE,
    entry_payment_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    entry_receipt_verified_by UUID REFERENCES core.users(id),
    entry_receipt_verification_date TIMESTAMP WITH TIME ZONE,
    
    target_delivery_date DATE NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'alta', 'urgente')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Invariante em Banco: Bloqueio absoluto do avanço sem cumprimento dos 2 gates
    CONSTRAINT chk_gate_liberacao_corte CHECK (
        stage = 'aguardando_liberacao' OR (art_approved = TRUE AND entry_payment_confirmed = TRUE)
    )
);

-- 6. FINANCEIRO: TÍTULOS E COMPROVANTES AUDITÁVEIS
CREATE TABLE financeiro.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_number VARCHAR(30) UNIQUE NOT NULL, -- Ex: FIN-2026-5001
    production_order_id UUID REFERENCES producao.production_orders(id),
    quote_id UUID REFERENCES crm.quotes(id),
    type VARCHAR(20) NOT NULL CHECK (type IN ('receber', 'pagar')),
    sub_type VARCHAR(40) NOT NULL CHECK (sub_type IN (
        'entrada_pedido', 'saldo_entrega', 'compra_tecido', 'servico_terceirizado', 'despesa_geral'
    )),
    description TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    due_date DATE NOT NULL,
    paid_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'atrasado', 'estornado')),
    payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN ('pix', 'boleto', 'transferencia', 'cartao')),
    
    -- Auditoria e Comprovação Real (Sem dados fictícios)
    receipt_file_url TEXT,
    receipt_hash VARCHAR(64),
    confirmed_by_id UUID REFERENCES core.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. ESTOQUE: SALDO POR EVENTOS COMPENSATÓRIOS E TERCEIROS
CREATE TABLE estoque.items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(30) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(40) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    physical_stock NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    allocated_stock NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    third_party_stock NUMERIC(10,2) NOT NULL DEFAULT 0.00, -- Em poder de facções
    min_stock NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    unit_cost_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    supplier VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE estoque.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES estoque.items(id),
    production_order_id UUID REFERENCES producao.production_orders(id),
    type VARCHAR(40) NOT NULL CHECK (type IN (
        'entrada_compra', 'reserva_op', 'saida_corte', 
        'remessa_faccao', 'retorno_faccao', 'perda_tecnica', 'ajuste_inventario'
    )),
    quantity NUMERIC(10,2) NOT NULL,
    unit_cost NUMERIC(10,2) NOT NULL,
    reason TEXT NOT NULL,
    operator_id UUID NOT NULL REFERENCES core.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. Mapeamento de Arquivos que Precisarão ser Alterados

| Arquivo / Diretório | Função Atual | Mudança Planejada |
|---|---|---|
| `package.json` | Apenas Vite/React SPA | Adicionar `express`, `pg`, `drizzle-orm`, `jsonwebtoken`, `bcryptjs`, `dotenv`, `@types/pg` |
| `server.ts` / `server/` *(Novo)* | Inexistente | Criar servidor Express modular com montagem de rotas `/api/*` e middlewares de segurança |
| `server/db/schema.ts` *(Novo)* | Inexistente | Modelos de tabelas, índices e constraints em TypeScript via Drizzle ORM integrado ao PostgreSQL |
| `server/routes/quotes.ts` *(Novo)* | Inexistente | Endpoints de orçamentos, cálculo transparente, autorização de desconto e conversão idempotente |
| `server/routes/orders.ts` *(Novo)* | Inexistente | Endpoints do PCP com validação rígida do Portão de Liberação Fabril (Gate A.3.2) |
| `server/routes/finance.ts` *(Novo)* | Inexistente | Lançamentos de contas a pagar/receber, liquidação de 50% com registro auditado de comprovante |
| `server/routes/leads.ts` *(Novo)* | Inexistente | Endpoint público centralizado para captação de leads vindos do Portal Público |
| `src/utils/storage.ts` | Salva direto no localStorage | Converter em adapter cliente com cache offline e sincronizador com o backend |
| `src/api/client.ts` *(Novo)* | Inexistente | Cliente HTTP centralizado com interceptores de autenticação JWT e chaves de idempotência |
| `src/App.tsx` | Estado monolítico em memória | Conectar chamadas aos hooks/APIs REST do backend, mantendo fallback de demonstração |
| `src/components/NewQuoteModal.tsx` | Gera autorização fictícia | Conectar ao modal de solicitação de aprovação real do Administrador |
| `src/components/ProductionOrdersView.tsx`| Validação visual de corte via alert() | Conectar ao gate check do backend e exibir modal de bloqueio normativo do PRD |
| `src/components/FinancialView.tsx` | Alterna status sem comprovante | Exigir upload/anexo de comprovante bancário antes da baixa de entrada do pedido |
| `src/components/PublicCatalogView.tsx` | Salva lead localmente | Enviar lead via POST `/api/leads` para o CRM central |

---

## 5. Plano Seguro de Migração de Dados Locais

Para assegurar **Zero Perda de Dados** e compatibilidade com a base de demonstração existente:

1. **Camada de Compatibilidade Dual (Online / Demonstração):**
   - O ERP identifica automaticamente se o backend PostgreSQL está conectado (`/api/health`).
   - Se conectado e autenticado, opera contra o banco de dados PostgreSQL corporativo.
   - Se desconectado ou em modo sandbox de demonstração, mantém a execução com os dados simulados existentes sem interrupção.
2. **Endpoint Idempotente de Importação:**
   - Criar endpoint `POST /api/migracao/importar-local-storage`.
   - O frontend envia o payload atual de `defardas_orders_v2`, `defardas_quotes_v2`, `defardas_clients_v2`, etc.
   - O backend valida a integridade referencial, remove duplicidades, atribui sequências oficiais mantendo a rastreabilidade original nos metadados (`imported_from_local_storage_id`) e executa um `INSERT ... ON CONFLICT DO NOTHING`.
3. **Backup JSON Automático Prévio:**
   - Antes de qualquer rotina de migração, a rotina dispara automaticamente o download do arquivo de backup JSON criptografado localmente (`exportERPStateAsJSON`).

---

## 6. Riscos Técnicos e Dependências

| Risco | Impacto | Estratégia de Mitigação |
|---|---|---|
| **Conexão com PostgreSQL Próprio** | Indisponibilidade de rede ou bloqueio de firewall | Utilizar pool de conexões com reconexão automática e modo resiliente com fallback informativo |
| **Concorrência em Conversões de Orçamento** | Criação duplicada de OPs no chão de fábrica | Constraint única em `idempotency_key` no banco e transação atômica serializável |
| **Alçadas Comerciais Pendentes** | Descontos indevidos aprovados por gerentes | Adotar alçada restrita ao **Administrador** por padrão até definição oficial da diretoria (Adendo B.2.5) |
| **Upload de Comprovantes Reais** | Arquivos confidenciais expostos | Bloqueio de acesso público via S3 privado com URLs assinadas temporárias de 15 minutos |
| **Cálculo de Comissão Automática** | Passivo financeiro com vendedores | Manter o cálculo automático desativado até assinatura formal da política comercial da DE FARDAS |

---

## 7. Testes Automatizados e Critérios de Aceite

A fundação P0 só será considerada pronta para a Fase 1 mediante aprovação nos seguintes testes verificáveis:

### 7.1. Suíte de Testes Obrigatórios
1. **Teste de Precificação (Markup sobre Custo):**
   - *Entrada:* Custo direto R$ 42,00 + Perda técnica 2% (R$ 0,84) = Custo-base R$ 42,84. Markup 50%.
   - *Esperado:* Preço Sugerido = R$ 42,84 × 1,50 = R$ 64,26.
   - *Margem Gerencial:* Preço praticado R$ 64,00 $\rightarrow$ Margem $= \frac{64,00 - 42,84}{64,00} \times 100 = 33,06\%$.
   - *Invariante:* Preço sugerido não pode ser calculado como $C / (1 - M)$.
2. **Teste do Portão de Liberação Fabril (Gate A.3.2):**
   - Tentativa de avançar OP de `aguardando_liberacao` para `corte` com `entry_payment_confirmed = false` ou `art_approved = false`.
   - *Resultado Esperado:* O banco de dados dispara violação de constraint (`chk_gate_liberacao_corte`) e o backend retorna HTTP 422 com mensagem de bloqueio normativo do PRD.
3. **Teste de Idempotência em Conversão:**
   - Envio concorrente ou consecutivo de 5 requisições de conversão para a mesma proposta comercial.
   - *Resultado Esperado:* Exatamente 1 OP criada e exatamente 2 lançamentos financeiros (sinal 50% + saldo 50%). As 4 requisições subsequentes retornam o registro existente com status 200/409 sem duplicidade.
4. **Teste de Alçada de Desconto:**
   - Tentativa de salvar proposta com `negotiated_total_amount < suggested_total_amount` por um usuário com perfil `vendedor`.
   - *Resultado Esperado:* HTTP 403 Forbidden com exigência de aprovação por `admin`.
5. **Teste de Centralização de Leads:**
   - Submissão de proposta pelo formulário do Portal Público.
   - *Resultado Esperado:* Registro persistido no schema `crm.leads` acessível pelo painel interno do ERP.

---

## Próximos Passos (Aguardando Aprovação Técnica)

Conforme instrução expressa da equipe da DE FARDAS: **Nenhuma alteração estrutural ou de código foi executada antecipadamente.**

Após a revisão e aprovação deste plano de fundação pelo responsável técnico:
1. Procederemos com a instalação dos pacotes backend e configuração do pool PostgreSQL seguro.
2. Criaremos as migrations do schema `core`, `crm`, `producao`, `estoque` e `financeiro`.
3. Implementaremos a camada de serviços e rotas com validação de idempotência e portões de segurança.
4. Conectaremos os componentes React existentes à API corporativa.
