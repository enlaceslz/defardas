-- ============================================================================
-- DE FARDAS ERP — Migration 0002: Seed Demo Data & Core Users
-- Popula usuários iniciais para autenticação e RBAC, e dados de teste segregados (is_demo = true)
-- ============================================================================

-- 1. USUÁRIOS DO SISTEMA COM PERFIS DIFERENCIADOS (RBAC)
INSERT INTO core.users (id, full_name, email, password_hash, role, is_active)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'Carlos Eduardo Silva', 'admin@defardas.com.br', '$2a$10$DEMO_HASH_ADMIN_DEFARDAS', 'admin', TRUE),
    ('22222222-2222-2222-2222-222222222222', 'Mariana Alencar', 'vendas@defardas.com.br', '$2a$10$DEMO_HASH_VENDAS_DEFARDAS', 'vendedor', TRUE),
    ('33333333-3333-3333-3333-333333333333', 'Raimundo Nonato (Mestre de Corte)', 'pcp@defardas.com.br', '$2a$10$DEMO_HASH_PCP_DEFARDAS', 'pcp_producao', TRUE),
    ('44444444-4444-4444-4444-444444444444', 'Juliana Rocha (Controladoria)', 'financeiro@defardas.com.br', '$2a$10$DEMO_HASH_FINANCEIRO_DEFARDAS', 'financeiro', TRUE),
    ('55555555-5555-5555-5555-555555555555', 'Roberto Mendes', 'gerente@defardas.com.br', '$2a$10$DEMO_HASH_GERENTE_DEFARDAS', 'gerente_comercial', TRUE),
    ('66666666-6666-6666-6666-666666666666', 'Patrícia Soares (Qualidade & Expedição)', 'qualidade@defardas.com.br', '$2a$10$DEMO_HASH_QUALIDADE_DEFARDAS', 'expedicao_qualidade', TRUE)
ON CONFLICT (email) DO UPDATE SET 
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;

-- 2. CLIENTES DE DEMONSTRAÇÃO (is_demo = true)
INSERT INTO crm.clients (id, code, company_name, trade_name, cnpj, state_registration, contact_name, phone, email, address, city, state, segment, standard_uniform_notes, total_orders_count, total_spent, is_demo)
VALUES
    ('c1111111-1111-1111-1111-111111111111', 'CLI-2026-0201', 'HOSPITAL GUARÁ MEDICINA INTEGRADA LTDA', 'Hospital Guará', '14.520.890/0001-33', '12.445.678-9', 'Dra. Camila Vasconcelos', '(98) 98841-2090', 'compras@hospitalguara.com.br', 'Av. dos Holandeses, 450 - Calhau', 'São Luís', 'MA', 'Hospitalar / Saúde', 'Jalecos Oxfordine anti-manchas e conjuntos scrub microfibra verde cirúrgico com bordado no peito.', 8, 38450.00, TRUE),
    ('c2222222-2222-2222-2222-222222222222', 'CLI-2026-0202', 'LOGÍSTICA PORTO GRANDE S/A', 'Porto Grande Log', '08.192.401/0001-12', '12.112.980-4', 'Marcos Aurélio Sousa', '(98) 98112-9944', 'marcos.suprimentos@portogrande.com.br', 'Av. dos Portugueses, s/n - Itaqui', 'São Luís', 'MA', 'Logística & Transporte Portuário', 'Calças operacionais em brim pesado com faixa refletiva 3M e camisas polo alta visibilidade laranja/cinza.', 14, 92100.00, TRUE),
    ('c3333333-3333-3333-3333-333333333333', 'CLI-2026-0203', 'COLÉGIO E FACULDADE SÃO LUÍS EDUCAÇÃO', 'Colégio São Luís', '04.301.992/0001-05', 'ISENTO', 'Profª Regina Coeli', '(98) 99120-3341', 'diretoria@colegiosaoluis.edu.br', 'Rua Grande, 820 - Centro Histórico', 'São Luís', 'MA', 'Educacional & Escolar', 'Polos em malha fria PV azul marinho com silk policromia no peito e costas.', 5, 24600.00, TRUE),
    ('c4444444-4444-4444-4444-444444444444', 'CLI-2026-0204', 'REDE DE SUPERMERCADOS ILHA MARANHENSE', 'Supermercados Ilha', '21.094.112/0001-78', '12.871.300-1', 'Antônio Carlos Meireles', '(98) 98776-5510', 'patrimonio@supermercadosilha.com.br', 'Av. Guajajaras, 1200 - São Cristóvão', 'São Luís', 'MA', 'Varejo & Supermercadista', 'Dólmãs e aventais para padaria/açougue e camisas polo em malha piquet para caixas e repositores.', 19, 114500.00, TRUE)
ON CONFLICT (cnpj) DO NOTHING;

-- 3. MATERIAIS DE ESTOQUE DE DEMONSTRAÇÃO (is_demo = true)
INSERT INTO estoque.items (id, code, name, category, unit, physical_stock, allocated_stock, in_partners_custody_stock, min_stock, unit_cost_price, supplier, location, last_restocked, is_demo)
VALUES
    ('m1111111-1111-1111-1111-111111111111', 'MAT-2026-0301', 'Malha Piquet PA 50/50 Azul Marinho', 'tecido', 'kg', 420.00, 150.00, 60.00, 100.00, 36.50, 'Malharia Santanense', 'Prateleira A1 - Rolo Master', CURRENT_DATE - INTERVAL '5 days', TRUE),
    ('m2222222-2222-2222-2222-222222222222', 'MAT-2026-0302', 'Brim Pesado 100% Algodão Cinza Chumbo', 'tecido', 'metros', 850.00, 320.00, 180.00, 200.00, 22.80, 'Cedro Têxtil Workwear', 'Prateleira B2 - Enfesto', CURRENT_DATE - INTERVAL '12 days', TRUE),
    ('m3333333-3333-3333-3333-333333333333', 'MAT-2026-0303', 'Faixa Refletiva 3M 50mm Alta Visibilidade', 'aviamento', 'metros', 1200.00, 400.00, 150.00, 300.00, 4.20, '3M do Brasil', 'Gaveteiro C4 - Aviamentos Especiais', CURRENT_DATE - INTERVAL '8 days', TRUE),
    ('m4444444-4444-4444-4444-444444444444', 'MAT-2026-0304', 'Gabardine Microfibra Branco Hospitalar', 'tecido', 'metros', 380.00, 95.00, 0.00, 80.00, 28.50, 'Tecelagem Santa Tereza', 'Prateleira A3 - Linha Saúde', CURRENT_DATE - INTERVAL '3 days', TRUE),
    ('m5555555-5555-5555-5555-555555555555', 'MAT-2026-0305', 'Linha de Costura 120 Resistente Chumbo', 'aviamento', 'cones', 65.00, 18.00, 12.00, 15.00, 14.90, 'Linhas Corrente S/A', 'Gaveteiro C1', CURRENT_DATE - INTERVAL '20 days', TRUE)
ON CONFLICT (code) DO NOTHING;

-- 4. LOG DE AUDITORIA DO SEED
INSERT INTO core.audit_logs (actor_name, actor_role, entity_name, entity_id, action, notes)
VALUES ('Sistema DE FARDAS', 'sistema', 'database', 'migration_0002', 'SEED_DEMO_DATA', 'População inicial de perfis, clientes modelo e materiais demonstrativos segregados com is_demo = TRUE.');
