# Migrações e Integridade do Banco de Dados — DE FARDAS ERP

Este diretório contém as migrações versionadas para o banco de dados **PostgreSQL próprio** da DE FARDAS, conforme os requisitos normativos do PRD v1.6 e Adendos B.2.1, B.2.2 e A.3.2.

---

## 1. Estrutura de Schemas

- **`core`**: Usuários (`core.users`), controle de acesso RBAC, sequências numéricas atômicas e trilha de auditoria (`core.audit_logs`).
- **`crm`**: Carteira de clientes (`crm.clients`), captação centralizada de leads (`crm.leads`), orçamentos versionados (`crm.quotes`) e itens detalhados com custo-base (`crm.quote_items`).
- **`producao`**: Ordens de Produção (`producao.production_orders`) com validação do Portão de Liberação Fabril (Gate A.3.2) em nível de constraint.
- **`financeiro`**: Títulos a receber e a pagar (`financeiro.transactions`) com auditoria de comprovantes de pagamento de entrada (sinal 50%).
- **`estoque`**: Materiais de almoxarifado (`estoque.items`) e movimentações (`estoque.movements`) distinguindo estoque próprio, reservado para OPs e em poder de facções parceiras.

---

## 2. Invariantes do Banco de Dados (Constraints)

1. **Portão de Liberação para Corte (Gate A.3.2):**
   ```sql
   CONSTRAINT chk_gate_liberacao_corte CHECK (
       stage = 'aguardando_liberacao' OR (art_approved = TRUE AND entry_payment_confirmed = TRUE)
   )
   ```
2. **Sinal de 50% Fixado:**
   ```sql
   CONSTRAINT chk_entry_percentage CHECK (entry_percentage = 50.00)
   ```
3. **Autorização de Desconto Auditável:**
   ```sql
   CONSTRAINT chk_discount_authorization CHECK (
       (negotiated_total_amount >= suggested_total_amount) OR 
       (below_suggested_authorized = TRUE AND authorized_by_id IS NOT NULL)
   )
   ```
4. **Idempotência de Conversão:**
   ```sql
   idempotency_key VARCHAR(120) UNIQUE NOT NULL
   ```

---

## 3. Como Executar as Migrações em Produção

```bash
# Execução direta com psql
psql "$DATABASE_URL" -f migrations/0001_initial_schema.sql
psql "$DATABASE_URL" -f migrations/0002_seed_demo_data.sql
```

Ou através do script de migração do backend Node.js (`server/db/connection.ts`), que aplica automaticamente as migrações pendentes de forma segura e não destrutiva.
