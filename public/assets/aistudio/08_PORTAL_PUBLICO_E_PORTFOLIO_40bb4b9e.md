# 08 PORTAL PUBLICO E PORTFOLIO

**Prioridade:** P4 — pode avançar em paralelo apenas após confirmar conteúdo público

**Fonte:** conteúdo reorganizado do PRD_DE_FARDAS_v1.6.md e dos seus adendos.

# DE FARDAS — PRD v1.6 (base consolidada + decisões técnicas e ambiente de desenvolvimento)

## Plataforma Integrada de Gestão Comercial, Produção, Financeiro e Portfólio Digital

**Status:** revisão documental v1.6; decisões técnicas de banco, hospedagem, arquivos, escopo do MVP e ambiente de desenvolvimento registradas. Pendências comerciais/fiscais permanecem separadas e não devem ser inferidas.\
**Data:** outubro de 2026\
**Cliente:** DE FARDAS --- São Luís, Maranhão\
**Objetivo desta revisão:** consolidar decisões técnicas e orientar a implementação assistida pelo Google Gemini no Google AI Studio, mantendo separadas as regras comerciais confirmadas e as pendências ainda não aprovadas.

------------------------------------------------------------------------

## 1. Visão do produto

A DE FARDAS terá uma plataforma integrada para acompanhar o ciclo
comercial e operacional de uniformes profissionais: captação do cliente,
orçamento, aprovação, compra de materiais, produção própria ou
terceirizada, controle de qualidade, entrega, recebimentos, pagamentos e
análise gerencial.

A plataforma terá três ambientes:

1.  **Portal público:** site institucional, portfólio administrável e
    solicitação de orçamento.
2.  **Gestão interna (ERP + CRM):** cadastros, vendas, materiais,
    compras, parceiros, produção e financeiro.
3.  **Inteligência gerencial:** indicadores, alertas, relatórios e
    consultas assistidas por IA sob controle de permissões.

A primeira implantação será para a operação da própria DE FARDAS. A
arquitetura deve evitar bloqueios artificiais à expansão futura, sem
implementar prematuramente uma plataforma SaaS complexa.

## 2. Contexto empresarial e portfólio inicial

O portfólio PDF fornecido informa que a DE FARDAS foi fundada em 2015 e
apresenta as seguintes categorias:

-   Camisas e camisetas
-   Polos
-   Jalecos
-   Calças
-   Coletes
-   Linha social
-   Linha hospitalar
-   Aventais e batas
-   Uniformes de copeira
-   Macacões
-   Outros produtos e acessórios

O material descreve variações de modelos, tecidos e tamanhos por
categoria. Essas informações deverão ser cadastráveis no painel
administrativo, sem alteração de código para cada produto.

**Dados publicados no portfólio fornecido:** Av. Cel. Colares Moreira,
100, Renascença, São Luís--MA; telefone (98) 98135-4130; horário
indicado de segunda a sexta, das 08h às 18h, e sábado, das 08h às 12h.

Antes de publicar o site, confirmar com o cliente se endereço, telefone,
horário, textos institucionais, marcas de clientes e imagens continuam
autorizados e atualizados.


---

### 5.1 Portal público e CMS

-   Página institucional responsiva.
-   Portfólio por categoria, produto, modelo e aplicação.
-   Fotos, descrição, tecidos, cores, tamanhos e personalizações
    configuráveis.
-   Formulário de solicitação de orçamento.
-   Botões de contato e WhatsApp.
-   SEO básico, metadados, perguntas frequentes e depoimentos.
-   Área administrativa com permissões para editar conteúdo.
-   Registro da origem do lead e consentimento quando aplicável.

Os produtos sob encomenda não precisam exibir preço fixo. A chamada
principal será "Solicitar orçamento".

