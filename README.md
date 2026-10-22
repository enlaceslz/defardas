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

### 2.4. Almoxarifado, Tecidoteca & Custódia de Terceiros
- Controle de rolos têxteis (Brim Santanense, Cedro, Gabardine, Malha PV, Dry-Fit).
- Gestão de estoque próprio vs. **estoque em poder de facções terceirizadas**.
- Ponto de pedido automatizado com alertas visuais de reposição.
- Registro de movimentações auditáveis (entradas por compra, saídas para corte e perdas técnicas).

### 2.5. Carteira de Clientes B2B & CRM
- Cadastro empresarial completo (Razão Social, Nome Fantasia, CNPJ, Contatos).
- Histórico de compras e especificações do fardamento padronizado de cada cliente corporativo.

### 2.6. Financeiro & Fluxo de Caixa
- Contas a Receber estruturadas em parcelas: *Sinal de Entrada (50%)* e *Saldo na Entrega*.
- Contas a Pagar: compras de matérias-primas e pagamentos a facções após execução e inspeção.
- Resumo em tempo real de saldo projetado e conciliação manual com comprovantes anexos.

---

## 3. Arquitetura e Tecnologias

- **Frontend:** React 19, TypeScript, Vite.
- **Estilização:** Tailwind CSS v4, seguindo tipografia estruturada (*Plus Jakarta Sans* e *DM Sans*) e numerais tabulares (*JetBrains Mono / tabular-nums*).
- **Ícones:** Lucide React.
- **Armazenamento de Estado:** Persistência em LocalStorage (`v2`) com exportação/importação JSON para backup e restauração de dados demonstrativos.
- **Layout:** Barra lateral (Sidebar) expansível/recolhível com navegação por agrupamentos operacionais e suporte a gaveta responsiva (mobile drawer).
- **Estilos de Impressão:** Folhas de estilo dedicadas (`@media print`) para fichas técnicas e propostas comerciais formatadas para folha A4.

---

## 4. Como Executar Localmente

```bash
# 1. Instalar as dependências
npm install

# 2. Iniciar servidor de desenvolvimento (porta 3000)
npm run dev

# 3. Executar validação de tipagem e integridade
npm run lint

# 4. Gerar build de produção
npm run build
```

---

## 5. Como Fazer Deploy na Vercel via GitHub

O projeto está totalmente configurado para deploy instantâneo na Vercel:
1. Conecte o repositório na [Vercel](https://vercel.com).
2. O arquivo `vercel.json` já configura o preset **Vite**, o comando `npm run build`, pasta `dist` e reescritas de rota SPA.
3. Consulte o guia detalhado em [`VERCEL.md`](./VERCEL.md).

---

## 6. Documentos Complementares

- `VERCEL.md`: Guia passo a passo de deploy na Vercel diretamente pelo GitHub com CI/CD automático.
- `AGENTS.md`: Diretrizes normativas e invariantes do PRD para desenvolvedores e agentes autônomos de IA.
- `DEPLOY.md`: Manual de infraestrutura, implantação em servidor dedicado Linux, configuração do PostgreSQL e rotinas de backup.
