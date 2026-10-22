-- ============================================================================
-- DE FARDAS ERP — Migration 0001: Initial Schema
-- Normativo: PRD v1.6 e Adendos B.2.1, B.2.2, A.3.2
-- Schemas: core, crm, producao, estoque, financeiro
-- ============================================================================

-- Habilitar extensão para geração de UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. CRIAÇÃO DOS ESQUEMAS MODULARES
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS producao;
CREATE SCHEMA IF NOT EXISTS estoque;
CREATE SCHEMA IF NOT EXISTS financeiro;

-- 2. CORE: SEQUENCIADORES ATÔMICOS (Numeração Segura e Sequencial)
CREATE SEQUENCE IF NOT EXISTS core.seq_quote_number START 1001 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS core.seq_order_number START 101 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS core.seq_client_number START 201 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS core.seq_finance_number START 5001 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS core.seq_inventory_number START 301 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS core.seq_lead_number START 101 INCREMENT 1;

-- 3. CORE: USUÁRIOS E CONTROLE DE ACESSO BASEADO EM FUNÇÃO (RBAC)
CREATE TABLE IF NOT EXISTS core.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN (
        'admin', 
        'gerente_comercial', 
        'vendedor', 
        'pcp_producao', 
        'financeiro', 
        'expedicao_qualidade'
    )),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS core.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES core.users(id),
    actor_name VARCHAR(120) NOT NULL,
    actor_role VARCHAR(40) NOT NULL,
    entity_name VARCHAR(60) NOT NULL,
    entity_id VARCHAR(60) NOT NULL,
    action VARCHAR(40) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE', 'GATE_BYPASS_ATTEMPT', 'AUTHORIZE_DISCOUNT', 'DOWNPAYMENT_CONFIRMED'
    old_data JSONB,
    new_data JSONB,
    notes TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON core.audit_logs(entity_name, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON core.audit_logs(created_at DESC);

-- 4. CRM: CLIENTES, LEADS E PROPOSTAS COMERCIAIS
CREATE TABLE IF NOT EXISTS crm.clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) UNIQUE NOT NULL, -- Ex: CLI-2026-0201
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
    standard_uniform_notes TEXT,
    total_orders_count INT NOT NULL DEFAULT 0,
    total_spent NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm.leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_number VARCHAR(30) UNIQUE NOT NULL, -- Ex: LEAD-2026-0101
    client_name VARCHAR(120) NOT NULL,
    company_name VARCHAR(150) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    email VARCHAR(150) NOT NULL,
    category VARCHAR(40) NOT NULL,
    estimated_quantity INT NOT NULL CHECK (estimated_quantity > 0),
    notes TEXT,
    origin VARCHAR(40) NOT NULL DEFAULT 'portal_publico',
    status VARCHAR(30) NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'em_contato', 'convertido_em_proposta', 'desqualificado')),
    converted_quote_id UUID,
    assigned_seller_id UUID REFERENCES core.users(id),
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm.quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_number VARCHAR(30) UNIQUE NOT NULL, -- Ex: ORC-2026-1001
    version INT NOT NULL DEFAULT 1,
    client_id UUID NOT NULL REFERENCES crm.clients(id) ON DELETE RESTRICT,
    seller_id UUID REFERENCES core.users(id),
    seller_name VARCHAR(100) NOT NULL,
    
    -- Status Comercial Desacoplado (Regra B.2.2)
    commercial_status VARCHAR(30) NOT NULL DEFAULT 'rascunho' CHECK (
        commercial_status IN ('rascunho', 'enviado', 'em_negociacao', 'aprovado', 'recusado', 'cancelado', 'convertido_em_pedido')
    ),
    
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE NOT NULL,
    
    -- Totais e Motor de Precificação
    total_base_cost NUMERIC(12,2) NOT NULL CHECK (total_base_cost >= 0),
    markup_percentage NUMERIC(6,2) NOT NULL CHECK (markup_percentage >= 0),
    suggested_total_amount NUMERIC(12,2) NOT NULL CHECK (suggested_total_amount >= 0),
    negotiated_total_amount NUMERIC(12,2) NOT NULL CHECK (negotiated_total_amount >= 0),
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    estimated_margin_percentage NUMERIC(6,2) NOT NULL,
    
    -- Autorização de Desconto Auditável (Sem nomes fictícios)
    below_suggested_authorized BOOLEAN NOT NULL DEFAULT FALSE,
    authorized_by_id UUID REFERENCES core.users(id),
    authorized_by_name VARCHAR(120),
    authorization_date TIMESTAMP WITH TIME ZONE,
    authorization_notes TEXT,
    
    -- Portão Comercial Obrigatório: 50% de Sinal Fixado (Regra A.3.2)
    entry_percentage NUMERIC(5,2) NOT NULL DEFAULT 50.00 CHECK (entry_percentage = 50.00),
    entry_amount NUMERIC(12,2) NOT NULL CHECK (entry_amount >= 0),
    balance_amount NUMERIC(12,2) NOT NULL CHECK (balance_amount >= 0),
    payment_terms TEXT NOT NULL DEFAULT '50% Sinal (Liberação de Corte) + 50% na Entrega',
    production_lead_days INT NOT NULL DEFAULT 16,
    
    -- Aceite Formal de Arte
    art_approved BOOLEAN NOT NULL DEFAULT FALSE,
    art_approved_by VARCHAR(100),
    art_approval_date TIMESTAMP WITH TIME ZONE,
    art_file_url TEXT,
    art_notes TEXT,
    
    -- Rastreabilidade de Aceite por WhatsApp / Formal
    acceptance_channel VARCHAR(30) DEFAULT 'whatsapp' CHECK (acceptance_channel IN ('whatsapp', 'email', 'presencial')),
    acceptance_notes TEXT,
    acceptance_timestamp TIMESTAMP WITH TIME ZONE,
    
    notes TEXT,
    converted_order_id UUID,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE, -- Imutável após aprovação/conversão
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Restrição de Alçada em Banco: Preço < Sugerido exige autorização explícita com responsável
    CONSTRAINT chk_discount_authorization CHECK (
        (negotiated_total_amount >= suggested_total_amount) OR 
        (below_suggested_authorized = TRUE AND authorized_by_id IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS crm.quote_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_id UUID NOT NULL REFERENCES crm.quotes(id) ON DELETE CASCADE,
    category VARCHAR(40) NOT NULL,
    model_name VARCHAR(150) NOT NULL,
    fabric_name VARCHAR(100) NOT NULL,
    fabric_color VARCHAR(60) NOT NULL,
    sizes JSONB NOT NULL, -- Ex: {"pp": 0, "p": 20, "m": 50, "g": 40, "gg": 15, "xg": 5}
    total_quantity INT NOT NULL CHECK (total_quantity > 0),
    
    -- Decomposição Transparente de Custo-Base Unitário (PRD Adendo B.2.1)
    material_unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    outsourced_sewing_unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    customization_unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    freight_unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    technical_loss_percentage NUMERIC(5,2) NOT NULL DEFAULT 2.00,
    calculated_base_unit_cost NUMERIC(10,2) NOT NULL,
    markup_percentage NUMERIC(6,2) NOT NULL,
    suggested_unit_price NUMERIC(10,2) NOT NULL,
    negotiated_unit_price NUMERIC(10,2) NOT NULL,
    total_item_price NUMERIC(12,2) NOT NULL,
    customizations JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_quotes_client ON crm.quotes(client_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON crm.quotes(commercial_status);

-- 5. PCP & PRODUÇÃO: ORDENS DE PRODUÇÃO E PORTÕES FABRIS
CREATE TABLE IF NOT EXISTS producao.production_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(30) UNIQUE NOT NULL, -- Ex: OP-2026-0101
    quote_id UUID REFERENCES crm.quotes(id) ON DELETE RESTRICT,
    quote_version INT NOT NULL DEFAULT 1,
    idempotency_key VARCHAR(120) UNIQUE NOT NULL, -- Previne duplicação de OPs em requisições repetidas
    client_id UUID NOT NULL REFERENCES crm.clients(id) ON DELETE RESTRICT,
    client_name VARCHAR(150) NOT NULL,
    item_title VARCHAR(150) NOT NULL,
    category VARCHAR(40) NOT NULL,
    fabric_name VARCHAR(100) NOT NULL,
    fabric_color VARCHAR(60) NOT NULL,
    sizes JSONB NOT NULL,
    total_pieces INT NOT NULL CHECK (total_pieces > 0),
    customizations JSONB DEFAULT '[]'::jsonb,
    
    -- Tríade de Estados Desacoplados (Regra B.2.2 do PRD)
    commercial_status VARCHAR(30) NOT NULL DEFAULT 'aprovado' CHECK (
        commercial_status IN ('rascunho', 'enviado', 'em_negociacao', 'aprovado', 'recusado', 'cancelado', 'convertido_em_pedido')
    ),
    financial_status VARCHAR(30) NOT NULL DEFAULT 'entrada_pendente' CHECK (
        financial_status IN ('entrada_pendente', 'entrada_confirmada', 'saldo_em_aberto', 'quitado')
    ),
    stage VARCHAR(30) NOT NULL DEFAULT 'aguardando_liberacao' CHECK (
        stage IN (
            'aguardando_liberacao', 
            'corte', 
            'bordado_silk', 
            'costura', 
            'conferencia_qualidade', 
            'retrabalho', 
            'expedicao', 
            'entregue'
        )
    ),
    
    -- Portão Rígido de Liberação Fabril (Gate A.3.2)
    art_approved BOOLEAN NOT NULL DEFAULT FALSE,
    art_approval_date TIMESTAMP WITH TIME ZONE,
    art_approved_by VARCHAR(100),
    
    entry_payment_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    entry_receipt_url TEXT,
    entry_receipt_reference VARCHAR(80),
    entry_verified_by_id UUID REFERENCES core.users(id),
    entry_verification_date TIMESTAMP WITH TIME ZONE,
    
    priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'alta', 'urgente')),
    creation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    target_delivery_date DATE NOT NULL,
    completion_date DATE,
    
    outsourced_partner VARCHAR(100),
    partner_cost_per_piece NUMERIC(10,2) DEFAULT 0.00,
    technical_notes TEXT,
    assigned_team VARCHAR(100) DEFAULT 'Mesa de Corte & Facção Terceirizada',
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Invariante do Banco: Bloqueio rigoroso de transição para corte ou etapas posteriores
    CONSTRAINT chk_gate_liberacao_corte CHECK (
        stage = 'aguardando_liberacao' OR (art_approved = TRUE AND entry_payment_confirmed = TRUE)
    )
);

CREATE INDEX IF NOT EXISTS idx_orders_client ON producao.production_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_stage ON producao.production_orders(stage);
CREATE INDEX IF NOT EXISTS idx_orders_idempotency ON producao.production_orders(idempotency_key);

-- 6. FINANCEIRO: TÍTULOS A RECEBER E PAGAR COM AUDITORIA DE COMPROVANTES
CREATE TABLE IF NOT EXISTS financeiro.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_number VARCHAR(30) UNIQUE NOT NULL, -- Ex: FIN-2026-5001
    production_order_id UUID REFERENCES producao.production_orders(id) ON DELETE SET NULL,
    quote_id UUID REFERENCES crm.quotes(id) ON DELETE SET NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('receber', 'pagar')),
    sub_type VARCHAR(40) NOT NULL CHECK (sub_type IN (
        'entrada_pedido', 'saldo_entrega', 'compra_tecido', 'servico_terceirizado', 'despesa_geral'
    )),
    description TEXT NOT NULL,
    category VARCHAR(60) NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    due_date DATE NOT NULL,
    paid_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'atrasado', 'estornado')),
    payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN ('pix', 'boleto', 'transferencia', 'cartao')),
    reference_id VARCHAR(60), -- Código do pedido ou OP vinculado
    
    -- Comprovação e Auditoria Real (Sem comprovantes fictícios)
    receipt_evidence_url TEXT,
    receipt_voucher_number VARCHAR(80),
    confirmed_by_id UUID REFERENCES core.users(id),
    confirmed_by_name VARCHAR(120),
    confirmation_notes TEXT,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_finance_status ON financeiro.transactions(status);
CREATE INDEX IF NOT EXISTS idx_finance_due_date ON financeiro.transactions(due_date);
CREATE INDEX IF NOT EXISTS idx_finance_order ON financeiro.transactions(production_order_id);

-- 7. ESTOQUE: MATERIAIS, SALDO POR EVENTOS E CUSTÓDIA DE FACÇÕES
CREATE TABLE IF NOT EXISTS estoque.items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(30) UNIQUE NOT NULL, -- Ex: MAT-2026-0301
    name VARCHAR(150) NOT NULL,
    category VARCHAR(40) NOT NULL CHECK (category IN ('tecido', 'aviamento', 'insumo_personalizacao', 'pronta_entrega')),
    unit VARCHAR(20) NOT NULL CHECK (unit IN ('metros', 'kg', 'rolos', 'unidades', 'cones', 'pecas')),
    physical_stock NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (physical_stock >= 0),
    allocated_stock NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (allocated_stock >= 0),
    in_partners_custody_stock NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (in_partners_custody_stock >= 0),
    min_stock NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (min_stock >= 0),
    unit_cost_price NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (unit_cost_price >= 0),
    supplier VARCHAR(120),
    location VARCHAR(80) DEFAULT 'Almoxarifado Central - Galpão 01',
    last_restocked DATE,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS estoque.movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    movement_number VARCHAR(30) UNIQUE NOT NULL, -- Ex: MOV-2026-0101
    item_id UUID NOT NULL REFERENCES estoque.items(id) ON DELETE RESTRICT,
    production_order_id UUID REFERENCES producao.production_orders(id) ON DELETE SET NULL,
    type VARCHAR(40) NOT NULL CHECK (type IN (
        'entrada_compra', 'saida_corte', 'remessa_parceiro', 
        'retorno_parceiro', 'perda_tecnica', 'ajuste_inventario'
    )),
    quantity NUMERIC(10,2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    reason TEXT NOT NULL,
    reference_doc VARCHAR(80),
    operator_id UUID REFERENCES core.users(id),
    operator_name VARCHAR(120) NOT NULL,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON estoque.movements(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_order ON estoque.movements(production_order_id);
