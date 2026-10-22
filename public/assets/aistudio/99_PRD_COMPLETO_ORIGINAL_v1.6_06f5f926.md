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

## 3. Princípios de arquitetura

-   Preservar a separação entre CRM e domínio industrial/comercial
    próprio.
-   Reutilizar componentes existentes apenas após auditoria técnica e de
    segurança.
-   Manter uma fonte de verdade para clientes, pedidos, produtos e
    movimentações.
-   Usar transações para operações críticas de estoque, pedidos e
    financeiro.
-   Registrar auditoria das mutações importantes.
-   Não apagar histórico financeiro ou fiscal por exclusão de pedido.
-   Projetar permissões por função e escopo; não confiar apenas na
    interface.
-   Automatizar testes, migrações e backups desde a fundação.
-   Não permitir que IA execute operações financeiras, fiscais ou
    destrutivas sem autorização explícita e trilha de auditoria.
-   Evitar microserviços prematuros: preferir módulos bem separados
    dentro de uma aplicação, com workers quando houver necessidade real
    de processamento assíncrono.

## 4. DeskcommCRM: decisão preliminar

Repositório de referência: https://github.com/melgarafael/DeskcommCRM

A documentação pública descreve uma aplicação baseada em Next.js,
TypeScript, Supabase/PostgreSQL, RLS, canais de atendimento, WhatsApp,
automações, agentes de IA e workers. A licença declarada é MIT.

**Decisão preliminar:** avaliar o DeskcommCRM como base de CRM e
atendimento. Desenvolver os domínios específicos de uniformes em módulos
próprios. Não declarar o repositório aprovado para produção antes de
concluir a auditoria de código, dependências, migrações, autenticação,
permissões, integração, testes, implantação e estratégia de atualização.

Comparar duas alternativas na auditoria: 1. Extensão modular mantendo o
núcleo original tão intacto quanto possível. 2. Fork privado com
processo documentado de sincronização com o upstream.

Critérios para decidir: esforço de integração, acoplamento, manutenção,
segurança, capacidade de atualizar, experiência de uso e custo
operacional. Não decidir somente pelo número de funcionalidades
existentes.

## 5. Módulos funcionais

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

### 5.2 CRM e clientes

-   Pessoas físicas e jurídicas, contatos e responsáveis.
-   CPF/CNPJ e dados fiscais conforme necessidade e base legal.
-   Telefones, e-mails, endereços e histórico de relacionamento.
-   Leads do site, WhatsApp e cadastro manual.
-   Funil configurável, tarefas, lembretes e atividades.
-   Histórico de orçamentos, pedidos, documentos e conversas.
-   Identificação de clientes recorrentes e inativos.
-   Deduplicação assistida de contatos, sem mesclagem automática
    irreversível.

### 5.3 Catálogo, variantes e ficha técnica

Cada produto deverá poder ter modelos e variantes. A estrutura deve
comportar:

-   Categoria, modelo, descrição e status de publicação.
-   Tecidos e composição cadastrável.
-   Cores, tamanhos e grade de quantidades.
-   Personalizações: bordado, serigrafia, sublimação, faixas refletivas,
    etiquetas e outras.
-   Unidade de medida e regras de conversão quando aplicáveis.
-   Consumo previsto de tecido e aviamentos por peça ou variante.
-   Percentual ou quantidade de perda técnica.
-   Operações de produção e custo estimado por operação.
-   Versão da ficha técnica utilizada em cada orçamento/pedido.

A ficha técnica usada num pedido aprovado deve permanecer identificável
mesmo que o cadastro do produto seja alterado posteriormente.

### 5.4 Materiais e estoque

-   Tecidos, linhas, botões, zíperes, elásticos, etiquetas, embalagens e
    aviamentos.
-   Unidades como metro, quilograma, rolo e peça, com conversões
    explicitamente definidas.
-   Saldo disponível, reservado, comprometido e em poder de terceiros.
-   Lotes quando necessários, custo de entrada e custo médio.
-   Estoque mínimo e alertas de reposição.
-   Entradas, saídas, ajustes, inventário, perdas e devoluções.
-   Histórico imutável de movimentações; correções por movimento
    compensatório.
-   Reserva de materiais vinculada ao pedido/ordem de produção.
-   Conferência de material enviado e devolvido por parceiro.

Não permitir que simples edição de saldo substitua o registro de
movimentações.

### 5.5 Fornecedores e compras

-   Cadastro de fornecedores, materiais, contatos e prazos.
-   Cotações comparativas com histórico de preços.
-   Requisições e pedidos de compra.
-   Aprovação por perfil e limites configuráveis.
-   Recebimento total ou parcial e registro de divergências.
-   Atualização de estoque com base em recebimentos confirmados.
-   Geração de contas a pagar a partir de obrigações aprovadas.
-   Avaliação de prazo, qualidade e conformidade de entrega.

### 5.6 Orçamentos e precificação

O orçamento deve registrar versões, validade, itens, variantes, grade de
tamanhos, quantidades, personalização, prazo, frete, condições de
pagamento, descontos e observações.

Separar: - custo estimado no momento do orçamento; - preço proposto; -
margem estimada; - custo realizado posteriormente; - resultado gerencial
final do pedido.

Modelo conceitual:

`Custo estimado = materiais + mão de obra + personalização + embalagem + frete/despesas atribuíveis + perdas previstas`

Para margem desejada sobre a receita, quando `m` é a margem e `t`
representa tributos e despesas variáveis proporcionais à venda, sem
duplicar custos:

`Preço de venda = custo / (1 - m - t)`

Validar percentuais e impedir denominador nulo ou negativo. Descontos,
tributos, comissões e taxas devem ter regras explícitas de base de
cálculo. Exibir estimativas e premissas; não apresentar estimativa como
lucro contábil definitivo.

O orçamento aprovado deverá ser congelado como versão comercial e gerar
o pedido correspondente sem duplicidade em caso de repetição da ação.

### 5.7 Pedidos e fluxo operacional

Estados iniciais propostos, sujeitos a validação com a empresa:

`Rascunho → Orçamento enviado → Em negociação → Aprovado → Aguardando condição de início → Planejado → Em produção → Em conferência → Pronto para entrega → Entregue → Encerrado`

Estados excepcionais: `Cancelado`, `Suspenso`, `Aguardando material`,
`Aguardando cliente` e `Retrabalho`.

Cada transição deverá definir: - quem pode executá-la; - quais condições
precisam estar satisfeitas; - quais registros serão gerados; - quais
notificações serão disparadas; - como desfazer ou corrigir a operação
sem perder histórico.

A aprovação comercial não deverá disparar compra ou produção cegamente.
Antes de liberar a produção, validar condições comerciais acordadas,
disponibilidade de materiais, prazo, capacidade e necessidade de
adiantamento.

Suportar entregas parciais e aceite do cliente, se confirmados como
necessários.

### 5.8 Produção própria e terceirizada

-   Ordens de produção vinculadas ao pedido e à versão da ficha técnica.
-   Planejamento por etapa, quantidade, tamanho, responsável e prazo.
-   Corte, costura, bordado, serigrafia, sublimação, acabamento e
    conferência, conforme o processo real.
-   Registro de material enviado e devolvido.
-   Quantidade produzida, aprovada, rejeitada, perdida e retrabalhada.
-   Custo previsto versus realizado por operação.
-   Capacidade e desempenho de parceiros.
-   Comprovantes de entrega e devolução de lotes.
-   Pagamento de parceiros relacionado à produção efetivamente aceita,
    conforme contrato/regra comercial.
-   Histórico de alterações de prazo e justificativas.

### 5.9 Financeiro gerencial

-   Contas a pagar e receber.
-   Parcelas, pagamentos parciais, adiantamentos, vencimentos e baixas.
-   Comissões de vendedores com regra de cálculo e evento de
    elegibilidade configuráveis.
-   Obrigações com fornecedores e parceiros.
-   Fluxo de caixa previsto e realizado.
-   Conciliação bancária, se houver integração ou importação de
    extratos.
-   Custos atribuídos ao pedido e comparação entre previsto e realizado.
-   Relatórios gerenciais de margem e resultado por pedido, cliente e
    período.

**Limite de escopo:** relatórios gerenciais de resultado não equivalem,
por si só, à contabilidade oficial. Definir com o cliente e contador as
necessidades fiscais, contábeis e de integração antes de prometer
escrituração contábil completa.

Movimentações baixadas não devem ser apagadas. Estornos devem gerar
histórico rastreável.

### 5.10 Fiscal

O módulo fiscal deverá ser delimitado depois de confirmar regime
tributário, inscrições, operações e necessidades do cliente.

Avaliar separadamente: - NF-e para operações com mercadorias; - NFC-e se
houver operação de varejo que a exija; - NFS-e se houver serviços
sujeitos a esse documento e suporte adequado pelo município/provedor.

A emissão exige levantamento de certificado digital, ambiente de
homologação, regras tributárias, série/numeração, armazenamento de XML,
contingência quando aplicável, consulta de status, rejeições,
cancelamento e eventos fiscais.

Não tratar NF-e, NFC-e e NFS-e como um único motor. Não emitir
documentos reais antes da homologação e validação fiscal com o
responsável da empresa/contador.

### 5.11 Relatórios e IA

Indicadores propostos: - conversão de leads e orçamentos; - vendas e
ticket médio; - margem estimada e realizada; - atrasos e cumprimento de
prazo; - consumo, perdas e retrabalho; - desempenho de fornecedores e
parceiros; - contas vencidas e previsão de caixa; - recorrência e
inatividade de clientes.

A IA poderá responder perguntas em linguagem natural, resumir histórico
e sugerir alertas. O acesso deverá respeitar permissões do usuário.
Começar com consultas somente leitura, consultas estruturadas ou
ferramentas limitadas; não expor SQL irrestrito nem permitir alterações
financeiras/fiscais sem confirmação explícita e auditoria.

## 6. Segurança, privacidade e operação

-   Controle de acesso por função e, quando necessário, por escopo de
    dados.
-   Proteção contra acesso indevido a registros de outros
    usuários/organizações, conforme a arquitetura implantada.
-   Segredos fora do código e fora dos logs.
-   Certificados e credenciais protegidos por mecanismo adequado de
    criptografia e controle de acesso.
-   TLS em trânsito e criptografia apropriada para backups e dados
    sensíveis.
-   Registro de auditoria para alterações de preços, aprovações,
    estoque, pagamentos, permissões e emissão fiscal.
-   Política de retenção e descarte de dados conforme obrigações legais
    e operacionais.
-   Consentimento e transparência para captação de leads e comunicação
    quando aplicável.
-   Backups automatizados, teste periódico de restauração e plano de
    recuperação.
-   Logs sem exposição de tokens, certificados, dados financeiros
    desnecessários ou conteúdo pessoal excessivo.
-   Testes automatizados de autorização, integridade, duplicidade e
    concorrência.
-   Monitoramento de falhas em filas e integrações.

## 7. Modelo de dados conceitual

Entidades iniciais a validar durante o desenho do banco:

-   `users`, `roles`, `permissions`, `audit_events`
-   `customers`, `customer_contacts`, `addresses`, `leads`, `activities`
-   `product_categories`, `products`, `product_variants`, `materials`
-   `fabric_specs`, `bill_of_materials`, `size_grades`,
    `customization_options`
-   `suppliers`, `supplier_quotes`, `purchase_orders`,
    `purchase_receipts`
-   `inventory_locations`, `stock_movements`, `stock_reservations`
-   `quotes`, `quote_versions`, `quote_items`
-   `sales_orders`, `sales_order_items`, `deliveries`, `delivery_items`
-   `production_orders`, `production_steps`, `outsourced_batches`,
    `quality_checks`
-   `partners`, `partner_rates`, `partner_settlements`
-   `accounts_payable`, `accounts_receivable`, `payments`, `commissions`
-   `fiscal_documents`, `fiscal_events`, `stored_files`
-   `site_pages`, `portfolio_items`, `testimonials`, `lead_forms`
-   `integration_events`, `jobs`, `notifications`

Esta é uma lista conceitual, não um schema final. Chaves,
relacionamentos, constraints, índices, retenção, concorrência e regras
de acesso devem ser especificados antes das migrations.

## 8. Arquitetura técnica — decisões aprovadas e limites

### 8.1 Decisões técnicas aprovadas pelo responsável

- **Banco de dados:** PostgreSQL próprio, administrado na infraestrutura contratada para a DE FARDAS. Não assumir Supabase como banco gerenciado.
- **Hospedagem:** infraestrutura contratada para a cliente, segregada dos ambientes e dos dados de outros clientes da Enlace.
- **Arquivos:** armazenamento privado compatível com S3 para artes, documentos e demais arquivos necessários ao fluxo aprovado.
- **Escopo de entrega:** MVP do fluxo principal, com evolução por fases. Integrações fiscais e automações avançadas não entram automaticamente no MVP só por aparecerem no modelo conceitual.

### 8.2 Direção arquitetural

- Interface web responsiva/PWA, se confirmada como adequada na descoberta técnica.
- Backend modular com validação de entrada e regras de domínio centralizadas.
- PostgreSQL como fonte transacional principal; usar migrações versionadas, constraints, índices e transações conforme o modelo de dados aprovado.
- Autenticação e autorização integradas ao backend. A solução concreta será escolhida após a auditoria técnica, evitando duplicar cadastros de usuários ou autenticação se houver componente existente aproveitável.
- Processos assíncronos e filas apenas onde o fluxo demonstrar necessidade de retentativas, tarefas demoradas ou desacoplamento.
- Docker e pipeline de implantação são opções recomendadas para reprodutibilidade; a composição final depende da infraestrutura contratada e da auditoria do repositório.
- Adaptadores para integrações futuras, sem implementar integrações fiscais ou de mensageria por presunção.

### 8.3 Segurança, operação e recuperação

- Banco não deve ficar exposto diretamente à internet; restringir acesso por rede, credenciais e privilégio mínimo.
- Segredos fora do repositório e separados por ambiente; TLS nos acessos remotos.
- Arquivos privados por padrão. O backend verifica autorização antes de disponibilizar conteúdo; links assinados devem expirar e ter escopo limitado quando utilizados.
- Definir e testar rotina de backup e restauração do PostgreSQL e política de recuperação dos arquivos. Backup configurado sem teste de restauração não é evidência suficiente.
- Registrar eventos relevantes de auditoria, erros e tarefas assíncronas sem gravar senhas, tokens ou conteúdo sensível desnecessário nos logs.
- Responsabilidades por atualização, monitoramento, disponibilidade, incidentes, backup e restauração precisam ser acordadas com a contratada de infraestrutura; não se presume que esses serviços estejam incluídos no contrato.

### 8.5 Ambiente de desenvolvimento e diretrizes para o Gemini

- **Ambiente escolhido:** Google AI Studio. O desenvolvimento do projeto será realizado com Google Gemini nesse ambiente, conforme decisão explícita do responsável.
- **Separação de ambientes:** Google AI Studio é o ambiente de desenvolvimento assistido; não é, por essa decisão, a infraestrutura de produção da aplicação. A produção permanece na infraestrutura contratada para a DE FARDAS.
- **Implementação incremental:** o Gemini deve trabalhar em etapas pequenas e verificáveis. Antes de alterar arquivos existentes, deve inspecionar a estrutura do projeto, a documentação, as dependências, as migrações e os testes já existentes.
- **Fonte de verdade:** este PRD e as decisões comerciais explicitamente aprovadas são referências do projeto. Se houver contradição, lacuna ou requisito ambíguo, o Gemini deve registrar a dúvida e solicitar definição; não deve inventar valores, regras fiscais, permissões ou procedimentos.
- **Banco de dados:** não substituir PostgreSQL próprio por Supabase gerenciado ou outro banco sem autorização explícita. Não presumir que usar ferramentas do Google AI Studio implique usar Firebase, Cloud SQL ou qualquer serviço Google em produção.
- **Arquivos:** implementar a integração com armazenamento privado compatível com S3 por meio de configuração segura e abstração apropriada. Não embutir credenciais no código, no frontend ou no repositório.
- **Qualidade:** cada etapa deve incluir testes pertinentes, tratamento de erros e atualização da documentação. O Gemini deve informar quais comandos foram executados, quais resultados foram observados e quais verificações não puderam ser realizadas. Nunca declarar testes, auditorias ou integrações como concluídos sem evidência.
- **Segurança:** não expor segredos, dados reais da cliente ou credenciais em prompts, logs, exemplos públicos ou repositórios. Usar dados fictícios/anônimos em desenvolvimento sempre que possível.
- **Entrega:** manter código versionado, migrações reproduzíveis, instruções de configuração e implantação, arquivo de variáveis de ambiente de exemplo sem segredos, testes automatizados aplicáveis e procedimento de rollback.
- **Sem implantação implícita:** não publicar em produção, executar migrações destrutivas, apagar dados ou contratar serviços pagos sem autorização explícita.
- **Stack ainda não congelada:** o uso do Google AI Studio não define por si só framework frontend, framework backend, ORM, provedor de autenticação, fila, hospedagem ou fornecedor S3. Essas escolhas devem ser propostas com justificativa técnica e validadas antes de se tornarem decisões obrigatórias.

### 8.4 Limites da decisão

As escolhas acima definem direção técnica, não especificação completa de fornecedor, capacidade, orçamento, SLA, região de hospedagem, RPO/RTO, domínio, stack de frontend/backend ou provedor S3. Esses itens devem ser confirmados na descoberta e no contrato, sem bloquear o desenho conceitual do MVP. Não manter dois cadastros mestres de clientes nem duplicar autenticação sem necessidade.

## 9. Fases de implementação

### Fase 0 --- Auditoria e descoberta

-   Inspecionar repositório e documentação do DeskcommCRM.
-   Inventariar planilhas, arquivos comerciais e exemplos fiscais.
-   Mapear o processo real da empresa.
-   Validar regras de preço, comissão, estoque, produção e entrega.
-   Produzir mapa de gaps, riscos e decisão de arquitetura.

### Fase 1 --- Fundação

-   Estrutura de projeto e ambientes.
-   Autenticação e autorização.
-   Modelo inicial de dados, migrations e auditoria.
-   CI, testes, backup e documentação.
-   Cadastros mestres essenciais.

### Fase 2 --- Portal e comercial

-   Landing page e CMS.
-   Portfólio.
-   Captação de leads.
-   CRM e funil.
-   Orçamentos versionados e PDF.
-   Conversão controlada de orçamento em pedido.

### Fase 3 --- Operação

-   Materiais, estoque e reservas.
-   Compras e recebimentos.
-   Fichas técnicas e custo estimado.
-   Ordens de produção e parceiros.
-   Qualidade, retrabalho e entregas parciais.

### Fase 4 --- Financeiro e fiscal

-   Contas a pagar/receber, parcelas, baixas e comissões.
-   Resultado gerencial previsto versus realizado.
-   Homologação e integração fiscal definida com o contador.

### Fase 5 --- Inteligência e otimização

-   Dashboards e alertas.
-   IA em modo controlado e inicialmente somente leitura.
-   Integrações adicionais conforme retorno comprovado.

A ordem pode ser ajustada por dependências descobertas na Fase 0. Não
iniciar módulos fiscais ou industriais com regras ainda presumidas.

## 10. Critérios de aceite transversais

-   Nenhuma operação crítica deve depender exclusivamente de validação
    visual no frontend.
-   Repetir uma solicitação de criação não deve duplicar pedido,
    pagamento ou documento fiscal.
-   Alterações de status respeitam permissões e pré-condições.
-   Movimentações de estoque e financeiro mantêm trilha de auditoria.
-   Pedidos aprovados preservam as versões de orçamento e ficha técnica
    usadas.
-   Entregas parciais e pagamentos parciais são representados sem
    distorcer saldos.
-   A margem calculada mostra premissas e diferencia estimativa de
    resultado realizado.
-   Testes cobrem permissões, integridade, concorrência, erros e
    reprocessamento.
-   Backup e restauração são testados.
-   Integrações fiscais só são consideradas concluídas após homologação
    aplicável.
-   Documentação e instruções de implantação acompanham as mudanças.

## 11. Pendências que exigem confirmação

1.  **Repositório do projeto DE FARDAS:** existe um repositório próprio
    ou o desenvolvimento começará do zero? O link não foi informado
    neste documento.
2.  **Planilhas operacionais:** o PRD cita `ORÇAMENTO.xlsx`,
    `FUBICAR_V1.xlsx` e `ACOMPANHAMENTO JUNHO/JULHO`, mas esses arquivos
    não acompanham o material recebido nesta revisão. Precisam ser
    enviados para mapear fórmulas e processos reais.
3.  **Fiscal:** confirmar regime tributário, inscrições, contador
    responsável, tipos de operação e documentos realmente necessários.
4.  **Produção:** confirmar etapas próprias e terceirizadas, critérios
    de qualidade, perdas e regras de pagamento dos parceiros.
5.  **Comercial:** confirmar regras de sinal, validade de orçamento,
    descontos, comissões, prazo e entregas parciais.
6.  **Operação da infraestrutura:** as decisões de PostgreSQL próprio,
    hospedagem contratada para a cliente e armazenamento privado S3-compatível
    estão aprovadas. Ainda precisam ser definidos o fornecedor/contrato, domínio,
    responsabilidades operacionais, rotina de backup e orçamento operacional.
7.  **Identidade visual:** confirmar logotipo, paleta, fotos autorizadas
    e conteúdo institucional atualizado.

## 12. Diretriz para o agente de desenvolvimento

Antes de modificar código: 1. Ler as instruções e a documentação oficial
do repositório escolhido. 2. Fazer inventário da arquitetura, módulos,
migrations, integrações e testes. 3. Apresentar evidências, riscos,
lacunas e proposta de implementação. 4. Não apagar ou substituir
funcionalidades existentes sem justificativa e autorização. 5.
Implementar em lotes pequenos, com testes e documentação. 6. Não
inventar dados reais, regras fiscais, fórmulas de planilha ou
credenciais. 7. Não declarar concluído o que não foi testado. 8. Manter
todas as entregas e explicações em português.

------------------------------------------------------------------------

**Conclusão:** este PRD v1.1 é uma base revisada para descoberta e
implementação. Ele não substitui a auditoria do repositório, o
levantamento das planilhas nem a validação fiscal e operacional com a DE
FARDAS.


# ADENDO NORMATIVO — REVISÃO FUNCIONAL v1.2

**Data:** 19 de outubro de 2026  
**Finalidade:** consolidar respostas do levantamento funcional e atualizar prioridades, regras e critérios de aceite.  
**Precedência:** este adendo complementa o PRD v1.1. Quando houver conflito entre uma hipótese antiga e uma decisão respondida neste adendo, prevalece este adendo. Itens marcados como pendentes continuam sem definição definitiva.

## A.1. Nível de certeza das regras

Cada requisito deve ser classificado durante o desenvolvimento como:

- **Respondido:** declarado no levantamento funcional da DE FARDAS.
- **Proposta:** comportamento recomendado que precisa ser aceito pelo responsável do negócio antes de virar regra definitiva, quando afetar política comercial.
- **Pendente:** informação ainda não fornecida ou que exige validação contábil, fiscal, contratual ou operacional.

Não converter valores exemplificativos, padrões técnicos ou recomendações deste documento em política comercial confirmada sem validação.

## A.2. Decisões funcionais respondidas

### Comercial e orçamento

- O método informado para formação de preço é percentual de acréscimo sobre o custo (markup percentual).
- Os componentes de custo informados incluem tecidos e materiais, costura terceirizada, bordado, sublimação, pintura/estamparia, frete/motoboy/entrega, perdas/desperdícios, comissões de vendas e impostos/taxas.
- O preço pode variar conforme a composição do pedido.
- Descontos são concedidos somente por gerente ou administrador, conforme o levantamento.
- Preço negociado abaixo do preço sugerido exige autorização.
- A validade é configurada por orçamento.
- O cliente aprova por WhatsApp; o aceite deve ser registrado e vinculado à versão exata da proposta.
- A arte/layout personalizado precisa ser aprovado antes da produção.

### Produção e parceiros

- As etapas terceirizadas informadas são corte, costura completa, bordado, sublimação e pintura/estamparia.
- A DE FARDAS normalmente fornece os materiais aos parceiros.
- A cobrança dos serviços terceirizados é por peça.
- O acompanhamento precisa registrar etapas, quantidades e prazos.
- A conferência de qualidade ocorre ao final, pela DE FARDAS.
- Defeitos, perdas e divergências devem gerar ocorrência com responsável; o retrabalho deve poder ser solicitado ao parceiro e o custo da perda registrado.
- A regra informada é liberar o pagamento do parceiro após execução do serviço. O aceite e a validação da cobrança ainda devem ser definidos em conjunto com essa regra.
- A entrega ao cliente normalmente é integral; casos atípicos de entrega parcial podem ocorrer.

### Financeiro e recebimentos

- A condição comercial usual informada é entrada percentual fixa e saldo no momento da entrega.
- O percentual exato da entrada ainda não foi informado.
- A produção só começa após confirmação do recebimento da entrada.
- Pagamentos parciais são permitidos apenas em situações específicas ainda não definidas.
- O recebimento será registrado manualmente com comprovante, nesta etapa.
- O controle de inadimplência deve incluir alertas de vencimento, lista de clientes inadimplentes, notificações internas e histórico de contatos de cobrança.
- A comissão informada é percentual sobre o valor vendido; percentual, base exata, elegibilidade, cancelamentos e momento de reconhecimento continuam pendentes.
- O controle financeiro inicial precisa incluir despesas de compra de materiais. Outras despesas devem ser adicionadas quando aprovadas no escopo.

### Materiais e compras

- Materiais são comprados conforme cada pedido; não foi declarada uma política de estoque regular de tecidos.
- O controle de estoque deve abranger tecidos, linhas e aviamentos.
- O consumo deve variar conforme tamanho e outras variações do produto.
- O orçamento deve considerar margem estimada para perdas e, após execução, registrar perdas reais.
- Uma compra só é recebida no sistema após conferência da quantidade física recebida.
- Materiais enviados a terceiros exigem rastreabilidade detalhada.

### Clientes, entrega e acesso

- O público principal informado é empresarial.
- O canal de entrada atual informado é WhatsApp.
- O prazo de entrega usa prazo padrão por produto; a forma de tratar exceções precisa ser definida.
- A entrega exige comprovante e identificação do responsável.
- Alterações após aprovação do pedido devem gerar revisão e registrar impacto em preço e prazo.
- Cancelamentos devem registrar motivo e responsável, calcular valores a devolver/cobrar e identificar materiais e serviços já comprometidos, conforme contrato.
- Perfis informados: administrador, vendas, financeiro, compras, produção/acompanhamento de parceiros, atendimento e direção/gestão.
- Conforme resposta fornecida, alterações de preços, aprovação de descontos e cancelamentos ficam restritos ao administrador. Esta regra é mais restritiva que a resposta anterior sobre gerente ou administrador conceder descontos; ver pendência A.8 para resolver o conflito de alçadas.
- Documentos necessários: orçamento em PDF, pedido/ordem de serviço, comprovante de entrega, relatório financeiro e relatório de produção/parceiros.
- Obrigações fiscais precisam ser levantadas antes de definir escopo de emissão fiscal.
- Indicadores prioritários: orçamentos enviados/aprovados, vendas por período e vendedor, margem por pedido, pedidos atrasados, contas a receber/vencidas, custos de terceiros, despesas/resultado financeiro, desperdício e retrabalho.

## A.3. Regras funcionais propostas

### A.3.1. Motor de orçamento e precificação

1. Cada orçamento tem identificador, versão, cliente, responsável comercial, itens/variantes, grade de quantidades, componentes de custo, markup aplicado, preço sugerido, descontos, prazo, validade, condições de pagamento/entrega e arquivos de arte.
2. O custo deve ser discriminado por componente e por item, incluindo quando aplicável materiais consumidos, perdas previstas, serviços terceirizados por peça, personalização, frete/entrega, comissão, impostos e taxas.
3. O motor deve distinguir custo direto, despesa percentual sobre a receita e outros encargos. Um mesmo componente não pode ser contabilizado duas vezes.
4. Fórmula-base para o método informado: **preço sugerido = custo-base × (1 + percentual de markup/100)**. Esta fórmula pressupõe que o markup é um acréscimo percentual simples sobre o custo. O custo-base e a inclusão de tributos, comissões e demais itens precisam ser configurados e validados para evitar dupla contagem.
5. A margem estimada sobre a receita deve ser calculada separadamente do markup. O sistema não deve apresentar o percentual de markup como se fosse margem de lucro.
6. O preço pode variar pela composição do pedido, incluindo tamanho, tecido, cor, personalização, quantidade e operações terceirizadas, quando essas diferenças alterarem o custo ou a política de preço.
7. Um preço abaixo do sugerido requer autorização registrada. A regra de quem autoriza precisa ser resolvida conforme A.8.
8. A validade é configurada em cada orçamento; não haverá prazo padrão fixo até que o negócio o defina.
9. O aceite por WhatsApp deve guardar, sempre que tecnicamente possível, data/hora, identificador do contato, conteúdo ou evidência do aceite e a versão do orçamento aceita. Se a integração não permitir comprovação automática, o usuário registra manualmente a evidência.
10. Aprovação da arte é uma pré-condição de liberação da produção para pedidos personalizados. Registrar versão/arquivo aprovado, responsável e data.
11. Alterações depois do envio criam nova versão. A versão aprovada é imutável como registro comercial; alterações posteriores geram revisão e aprovação quando impactarem preço, quantidade, arte ou prazo.
12. A conversão de orçamento aprovado em pedido deve ser idempotente: repetir a ação não pode criar pedidos duplicados.

### A.3.2. Pedido e liberação para produção

1. O pedido deve referenciar a versão exata do orçamento aprovado.
2. A produção só pode ser liberada depois da confirmação do recebimento da entrada e da aprovação da arte, quando houver personalização.
3. A liberação também deve verificar material necessário, prazo e ordens/serviços externos planejados. Bloqueios adicionais por disponibilidade de materiais devem ser confirmados pelo negócio antes de se tornarem regra rígida.
4. Estados comerciais, financeiros e operacionais devem ser separados. “Aprovado”, “entrada recebida”, “liberado para produção”, “produção concluída”, “pronto para entrega”, “entregue” e “financeiramente quitado” não são sinônimos.
5. O prazo padrão por produto é a referência inicial. Uma exceção deve exigir prazo revisado e registrar responsável, motivo e comunicação ao cliente.
6. A regra geral é entrega integral. Entrega parcial deve ser exceção explicitamente autorizada, com quantidades, comprovantes, saldo de itens e efeito financeiro registrados.
7. Cancelamento exige análise dos materiais comprados/reservados, remessas a parceiros, serviços executados, valores recebidos e valores a devolver/cobrar. Não apagar movimentos anteriores; registrar estornos e ajustes compensatórios.

### A.3.3. Terceirização

1. O parceiro e a ordem de serviço devem identificar serviço, pedido relacionado, grade/tamanho, quantidade enviada, materiais enviados, data, prazo combinado, preço por peça e responsável.
2. A remessa de material a parceiro deve gerar movimentação identificável como “em poder de terceiro”, sem ser tratada automaticamente como consumo definitivo.
3. O retorno registra quantidades recebidas, aprovadas, rejeitadas, perdidas e enviadas para retrabalho.
4. A conferência de qualidade é feita pela DE FARDAS ao final, conforme regra respondida. O sistema registra resultado, responsável, data e ocorrências.
5. A solicitação de retrabalho deve referenciar a ocorrência e o lote/serviço original, preservando o histórico.
6. A cobrança por peça deve registrar quantidade contratada, executada, aceita e cobrada. A base exata de cobrança quando há rejeição, perda ou retrabalho precisa ser contratualmente definida.
7. A regra respondida diz que o pagamento ocorre após a execução. Proposta de controle: registrar execução, conferência e obrigação financeira em etapas separadas, sem presumir que o serviço concluído foi automaticamente pago. Validar se o pagamento depende também do aceite final e de prazo contratual.

### A.3.4. Materiais, compras e perdas

1. Cada pedido deve gerar necessidade prevista de materiais conforme produto, tamanho/variação e ficha técnica ou regra de consumo configurada.
2. Compras são vinculadas ao pedido que as originou, salvo quando a empresa autorizar aquisição compartilhada para mais de um pedido.
3. O recebimento de compra atualiza estoque somente após conferência física da quantidade; divergências devem ser registradas.
4. Controlar tecidos, linhas e aviamentos, unidades de medida e conversões necessárias.
5. Registrar quantidade comprada, reservada, disponível, enviada a parceiro, retornada, consumida, perdida e devolvida, conforme aplicável.
6. Perdas previstas entram no custo estimado; perdas reais são registradas separadamente para comparar estimado versus realizado.
7. Não permitir alteração direta de saldo sem movimento auditável. Correções devem gerar ajuste justificado.
8. Como a empresa compra conforme cada pedido, estoque mínimo e reposição automática ficam fora do comportamento obrigatório inicial, até confirmação de necessidade.

### A.3.5. Financeiro e comissões

1. A condição padrão informada é entrada percentual fixa e saldo na entrega, mas o percentual da entrada permanece configurável e pendente de definição.
2. A produção só inicia após confirmação da entrada. O sistema deve distinguir valor previsto, valor recebido, comprovante e saldo.
3. O saldo vence no momento da entrega conforme a condição comercial registrada. Qualquer prazo diferente deve ser autorizado e documentado.
4. Pagamentos parciais só podem ser usados quando a situação for autorizada segundo política ainda a definir; o sistema deve manter o saldo em aberto e registrar motivo/autor da exceção.
5. Recebimentos manuais exigem valor, data, método, responsável e comprovante ou justificativa para ausência do documento. Estornos devem preservar a transação original.
6. Alertas e lista de inadimplência devem usar títulos e vencimentos reais, não apenas o status do pedido. Contatos de cobrança devem ser registrados no histórico do cliente/pedido.
7. Comissão é percentual sobre valor vendido conforme resposta, mas não calcular definitivamente até que se definam percentual, base (bruto/líquido/descontos/frete/impostos), elegibilidade, vendedor responsável, rateios, cancelamentos e momento de reconhecimento.
8. No escopo financeiro inicial, registrar despesas de compra de materiais e contas a pagar relacionadas. Não apresentar esse escopo reduzido como contabilidade completa.

### A.3.6. Permissões e auditoria

1. Aplicar permissões no backend, não apenas ocultando botões na interface.
2. Perfis iniciais: administrador, vendas, financeiro, compras, produção/acompanhamento de parceiros, atendimento e direção/gestão.
3. Toda mudança de preço, desconto, autorização de exceção, cancelamento, ajuste de estoque, recebimento, estorno e alteração de prazo deve registrar autor, data/hora, motivo e valores anteriores/novos quando aplicável.
4. A alçada de gerente versus administrador deve ser resolvida antes da implementação definitiva de permissões de desconto.
5. Acesso a documentos e evidências de WhatsApp deve respeitar função e necessidade de acesso.

## A.4. Prioridades revisadas

### P0 — Fundação de orçamento e preço confiável

- Modelo de produtos, variantes, tamanhos, tecidos, personalização e quantidades.
- Composição de custos por pedido/item.
- Markup percentual configurável e cálculo separado da margem estimada.
- Validação de custos e prevenção de dupla contagem.
- Preço sugerido, autorização de preço abaixo do sugerido, versões, validade configurável e PDF.
- Registro de aceite por WhatsApp e aprovação de arte.
- Testes automatizados de cálculos, descontos, arredondamento e versionamento.

### P1 — CRM e pedido comercial

- Cadastro empresarial, contatos e histórico.
- Captação e registro de oportunidades originadas principalmente no WhatsApp; outros canais permanecem possíveis.
- Conversão idempotente de orçamento aprovado em pedido.
- Revisão pós-aprovação com impacto documentado em preço e prazo.
- Controle de permissões e auditoria.

### P2 — Materiais por pedido e serviços terceirizados

- Necessidade de material por tamanho/variação.
- Compras vinculadas a pedidos e recebimento após conferência.
- Remessas/retornos de material em poder de parceiros.
- Ordens de serviço por peça, etapas, quantidades e prazos.
- Conferência final, ocorrências, perdas, retrabalho e custo previsto versus real.
- Prazo padrão por produto com exceções registradas.

### P3 — Recebimentos e contas relacionadas à operação

- Entrada configurável, confirmação manual com comprovante e saldo na entrega.
- Exceções autorizadas para pagamentos parciais.
- Contas a receber, alertas, inadimplência e contatos de cobrança.
- Contas a pagar de compras de materiais e despesas/obrigações de parceiros no limite aprovado.
- Comissões preparadas estruturalmente, mas cálculo ativado após fechar a política.

### P4 — Entrega, relatórios gerenciais e melhoria contínua

- Comprovante e responsável pela entrega integral.
- Entregas parciais excepcionais com autorização e rastreabilidade.
- Indicadores de orçamentos, vendas, margem, atrasos, contas vencidas, custos de terceiros, despesas, perdas e retrabalho.
- Exportações e rastreabilidade dos números até os registros de origem.

### Fora da primeira entrega, salvo decisão explícita

- Emissão fiscal automatizada antes de levantamento e homologação.
- Integração bancária automática, cobrança automática ou conciliação bancária completa.
- Estoque avançado de múltiplos depósitos, reposição automática e planejamento industrial avançado.
- Portal externo de parceiros e IA capaz de executar alterações financeiras.

## A.5. Critérios de aceite atualizados

### Orçamento e precificação

1. Dado um pedido com várias peças, tamanhos, tecidos e personalizações, o sistema calcula os custos e totais conforme as regras configuradas e mostra os componentes do cálculo.
2. O cálculo aplica percentual de acréscimo sobre o custo sem confundi-lo com margem sobre a receita.
3. Comissão, tributos, taxas, frete e perdas são incluídos conforme a configuração definida e não são contados duas vezes.
4. O sistema identifica e exige autorização para preço abaixo do sugerido, registrando solicitante, autorizador, data e justificativa.
5. O orçamento permite validade própria, gera PDF correspondente à versão e mantém o histórico após alterações.
6. O aceite por WhatsApp fica associado à versão exata do orçamento, com evidência ou registro manual rastreável.
7. Um pedido personalizado não pode ser liberado para produção sem registro da aprovação da arte.
8. Alterar cadastro de produto ou custo depois da aprovação não altera o snapshot do orçamento/pedido já aprovado.

### Pedido e produção terceirizada

9. A aprovação converte o orçamento em um único pedido mesmo se a operação for repetida.
10. O pedido não é liberado para produção antes da confirmação da entrada e da aprovação da arte, quando aplicável.
11. Cada ordem de serviço identifica parceiro, serviço, quantidade por peça/variante, preço acordado, material enviado e prazo.
12. O material em poder de terceiro é rastreável e não desaparece do controle de materiais antes de consumo/perda registrados.
13. O retorno de parceiro permite registrar quantidades recebidas, aprovadas, rejeitadas, perdidas e retrabalhadas.
14. A conferência final registra responsável, resultado e ocorrências; retrabalho mantém referência à ocorrência original.
15. O custo previsto pode ser comparado ao valor contratado, aceito, cobrado e realizado.
16. A entrega integral registra comprovante e responsável. Uma entrega parcial, quando autorizada como exceção, mantém saldo pendente e histórico.

### Compras, financeiro e cancelamentos

17. A compra só movimenta estoque após conferência da quantidade recebida; divergências são rastreáveis.
18. A necessidade de material considera tamanho/variação e perda estimada; perdas reais ficam registradas separadamente.
19. O recebimento manual exige valor e data, mantém comprovante e reduz o saldo somente pelo valor recebido.
20. A produção permanece bloqueada até a confirmação da entrada, sem aceitar apenas um valor previsto como pagamento.
21. O saldo é acompanhado para cobrança no momento da entrega, e qualquer condição excepcional é registrada.
22. Alertas de vencimento e inadimplência são calculados a partir de contas a receber; contatos de cobrança ficam no histórico.
23. Cancelar pedido com materiais comprados, materiais em poder de parceiro, serviço executado ou valores recebidos exige resumo de impacto e registro das decisões de devolução/cobrança.
24. Estornos e ajustes não apagam lançamentos originais; geram eventos compensatórios auditáveis.

### Segurança, relatórios e operação

25. Cada perfil acessa apenas ações autorizadas no backend; tentativas não autorizadas são bloqueadas e registradas quando pertinente.
26. Alterações de preço, desconto, cancelamento, estoque, pagamento, prazo e permissão têm trilha de auditoria.
27. Os relatórios exibem orçamentos enviados/aprovados, vendas por período/vendedor, margem por pedido, pedidos atrasados, contas vencidas, custos de terceiros, despesas, perdas e retrabalho, quando os dados correspondentes estiverem implantados.
28. Cada KPI tem definição documentada, período, fonte e detalhamento até os registros que o compõem.
29. Backup e restauração são testados; testes automatizados cobrem autorização, duplicidade, cálculos, saldos e concorrência.
30. Nenhuma integração fiscal é declarada pronta antes de definição do escopo, homologação aplicável e validação pelo responsável fiscal.

## A.6. Pendências críticas a resolver antes de congelar regras

1. Percentual exato de entrada e se há exceções por cliente/pedido.
2. Definição precisa da base de custo para markup: quais itens são custo unitário, quais são percentuais sobre a receita e como tributos/comissões entram sem dupla contagem.
3. Política de arredondamento, preço mínimo e limites de desconto/preço abaixo do sugerido.
4. Conflito de alçada: resposta inicial permite gerente ou administrador conceder desconto, enquanto resposta posterior diz que somente administrador altera preços/aprova descontos/cancela pedidos. Confirmar se gerente pode autorizar descontos e/ou preços abaixo do sugerido.
5. Percentual de comissão e base exata do “valor vendido”; regra para desconto, cancelamento, devolução, vendedor compartilhado e momento de reconhecimento.
6. Se pagamento do parceiro depende apenas da execução ou também de conferência/aceite final, nota/documento e prazo contratual.
7. Como tratar peças rejeitadas, perdas, retrabalho e cobrança por peça pelo parceiro.
8. Padrão de prazo por produto, como calcular a data prometida e quem autoriza exceções.
9. Quem pode autorizar entrega parcial, recebimento parcial e exceções às condições de pagamento.
10. Política de cancelamento, reembolso e cobrança por estágio do pedido e compromissos com terceiros.
11. Como registrar evidência do aceite por WhatsApp e da aprovação de arte; se haverá integração ou registro manual inicial.
12. Regime tributário, obrigações fiscais, documentos necessários e validação com contador.
13. Repositório de desenvolvimento, infraestrutura/domínio, identidade visual e ambiente de hospedagem.
14. Se o escopo financeiro inicial deve incluir somente compras de materiais ou também despesas administrativas, frete, serviços de parceiros e comissões desde a primeira fase.

## A.7. Observações de consistência

- A resposta “desconto somente por gerente ou administrador” conflita com “somente administrador” para aprovação de descontos. Não implementar a alçada até resolver.
- A resposta “pagamento de parceiro após execução” não define se execução significa serviço realizado, serviço conferido/aceito ou serviço faturado. Manter esses eventos distintos.
- A comissão sobre “valor vendido” não deve ser calculada até definir a base monetária e o evento de elegibilidade.
- “Prazo padrão por produto” exige cadastro de prazo e regra para exceções; não significa que o sistema já conheça os prazos reais.
- “Entrada percentual fixa” não informa o percentual. Não presumir 50% nem outro valor.
- “Entrega integral” é regra geral respondida, com casos atípicos; manter exceção controlada, sem tornar a entrega parcial o fluxo padrão.
- Compra conforme pedido não elimina a necessidade de registrar materiais enviados a parceiros, retornos, sobras e perdas.
- Indicadores de despesas e resultado foram solicitados, mas o escopo financeiro inicial informado menciona compras de materiais. Definir quais outras despesas entram no MVP antes de prometer resultado financeiro completo.

## A.8. Diretriz de execução

Antes de desenvolver as regras comerciais definitivas, resolver as pendências críticas 1–8 e documentar as demais decisões por responsável e data. Implementar primeiro o motor de orçamento/preço com casos de teste aprovados pela DE FARDAS. Não usar planilhas ausentes como bloqueio para modelar os processos, mas também não afirmar que as fórmulas históricas foram reproduzidas sem evidência.

---

# ADENDO DE AUDITORIA E CORREÇÃO — PRD v1.3

**Data:** 19 de outubro de 2026  
**Status:** revisão sênior de negócio e produto; regras comerciais pendentes continuam sujeitas à aprovação da DE FARDAS.  
**Precedência:** este adendo prevalece sobre trechos anteriores incompatíveis, em especial fórmulas de precificação, estados de pedido, escopo financeiro e permissões. Não transforma hipóteses em decisões comerciais aprovadas.

## B.1. Parecer executivo

O PRD tem boa cobertura funcional e já identifica riscos importantes, mas ainda não deve ser tratado como especificação final pronta para desenvolvimento integral. A principal lacuna não é a quantidade de módulos: é a falta de fechamento de algumas regras que afetam diretamente preço, caixa, produção e responsabilidade operacional.

**Parecer:** aprovado para iniciar descoberta técnica, modelagem de domínio e protótipo/testes do motor de orçamento com casos validados; **não aprovado ainda para congelar todas as regras de negócio nem para iniciar emissão fiscal, cálculo definitivo de comissão ou automações financeiras**.

## B.2. Correções normativas de consistência

### B.2.1. Precificação: markup não é margem

A regra comercial respondida é acréscimo percentual sobre o custo (markup). Portanto, para um custo-base `C` e markup percentual `k`:

`Preço sugerido = C × (1 + k/100)`

A fórmula de margem sobre receita (`Preço = custo / (1 - margem - taxas proporcionais)`) que aparece na seção histórica do PRD representa outro método de precificação. Ela não pode ser usada como fórmula principal do MVP sem decisão explícita. Pode permanecer apenas como cálculo gerencial separado, se aprovado.

Antes de ativar cálculo real, a DE FARDAS deve aprovar uma tabela de componentes que identifique, para cada componente: unidade (por peça, por lote ou percentual), base de cálculo, etapa em que entra, origem do valor, possibilidade de rateio e regra de arredondamento. Impostos, comissões, frete e perdas não podem ser incluídos simultaneamente no custo-base e novamente como acréscimos percentuais sem uma regra deliberada.

A aplicação deve apresentar pelo menos: custo estimado, markup aplicado, preço sugerido, desconto concedido, preço final e margem estimada resultante. Margem estimada não deve ser rotulada como lucro líquido contábil.

### B.2.2. Separar estados comercial, financeiro e operacional

Não manter um único campo de status para representar todas as dimensões. O domínio deve separar, no mínimo:

- **Comercial:** rascunho, enviado, em negociação, aprovado, recusado, expirado, cancelado.
- **Financeiro do pedido:** entrada pendente, entrada parcialmente recebida (se autorizada), entrada confirmada, saldo em aberto, parcialmente recebido, quitado, estornado/ajustado conforme eventos financeiros.
- **Operação:** não liberado, aguardando material, planejado, em produção, em conferência, retrabalho, pronto para entrega, parcialmente entregue por exceção, entregue.

Esses rótulos são uma proposta de modelagem, não exigência de que todos apareçam na interface. As transições válidas precisam ser explicitadas. Exemplo: pedido comercial aprovado não significa que a entrada foi recebida nem que a produção está liberada.

### B.2.3. Produção terceirizada: execução, aceite e pagamento são eventos diferentes

A resposta recebida diz que o pagamento do parceiro é liberado após execução, mas também exige inspeção final e tratamento de defeitos. O sistema deve registrar separadamente serviço executado, serviço conferido/aceito, cobrança recebida, obrigação aprovada e pagamento realizado. A regra de elegibilidade para pagar peças rejeitadas, perdidas ou retrabalhadas precisa ser definida contratualmente; não assumir automaticamente que “executado” significa “aceito” nem que “aceito” significa “pago”.

### B.2.4. Financeiro inicial não equivale a resultado completo da empresa

O escopo inicial informado inclui despesas de compras de materiais, enquanto os indicadores desejados incluem despesas e resultado financeiro. Até que se definam despesas administrativas, serviços terceirizados, fretes, comissões, tributos e outros custos, os relatórios devem declarar claramente sua cobertura. Não exibir “lucro líquido” se o sistema não contabiliza todas as categorias necessárias.

### B.2.5. Autorizações e segregação de funções

Existe conflito real entre “gerente ou administrador concede descontos” e “somente administrador altera preços/aprova descontos/cancela pedidos”. Até aprovação de uma matriz de alçadas, a aplicação deve manter a política de desconto/preço abaixo do sugerido configurável e desativar qualquer exceção não definida. Não resolver esse conflito por interpretação do desenvolvedor.

### B.2.6. CRM e integração WhatsApp

O canal de entrada atual é WhatsApp, mas o PRD não deve presumir que haverá API oficial, captura automática de aceite ou sincronização completa de conversas na primeira versão. O MVP deve permitir registrar origem, contato, data/hora, responsável e evidência manual do aceite; integração automatizada fica condicionada à escolha do provedor, permissões, custos e testes. Evidências devem ter acesso restrito e política de retenção.

## B.3. Regras de domínio adicionais obrigatórias

1. **Versões congeladas:** orçamento aceito e ficha técnica usada no pedido precisam preservar valores, quantidades, componentes, arquivos e condições da versão aprovada. Atualizar o catálogo não pode alterar pedidos existentes.
2. **Mudança pós-aprovação:** toda alteração de quantidade, grade, arte, material, operação, prazo ou condição financeira gera revisão rastreável e, quando impactar preço/prazo/escopo, nova aprovação do cliente antes de executar a parte alterada.
3. **Idempotência e concorrência:** criação de pedido, baixa de recebimento, movimento de estoque e conversão de orçamento devem resistir a clique repetido, reenvio de requisição e processamento concorrente. Cada evento externo ou manual deve possuir identificador de deduplicação quando aplicável.
4. **Dinheiro:** valores monetários devem usar tipo decimal apropriado, moeda explícita e regra documentada de arredondamento. Não usar ponto flutuante binário para cálculo financeiro.
5. **Estoque por evento:** saldo é derivado de movimentos auditáveis. Material enviado a parceiro continua sendo ativo rastreável sob custódia externa, até ser consumido, perdido, devolvido ou ajustado com justificativa.
6. **Saldo financeiro:** o saldo a receber deve ser derivado dos títulos/parcelas e recebimentos confirmados, com estornos compensatórios. O status do pedido não deve ser a fonte de verdade do saldo.
7. **Cancelamento:** cancelar é uma transição controlada, não exclusão física. O sistema deve calcular impacto preliminar, exigir decisão autorizada e registrar reembolso/cobrança e compromissos com fornecedores/parceiros.
8. **Auditoria:** para ações críticas, guardar ator, data/hora, entidade, motivo, valores anteriores/novos quando aplicável, correlação da operação e resultado. Não gravar segredos nem conteúdo pessoal desnecessário nos logs.
9. **Documentos:** PDFs e comprovantes devem identificar pedido/orçamento e versão; arquivos aprovados devem ser armazenados de forma privada e com controle de acesso.
10. **Relatórios:** cada indicador deve ter definição, fórmula, período, critérios de inclusão/exclusão e drill-down para os registros de origem. “Vendas” deve especificar se significa pedidos aprovados, faturados, entregues ou recebidos.

## B.4. Matriz de risco e prioridade

| Prioridade | Risco | Consequência | Controle antes de produção |
|---|---|---|---|
| P0 | Fórmula de preço ambígua ou dupla contagem | Preço errado e perda financeira | Aprovar tabela de custos e casos de teste reais |
| P0 | Alçada de desconto contraditória | Descontos não autorizados | Aprovar matriz de permissões e limites |
| P0 | Entrada e regra de liberação indefinidas | Produção sem caixa ou bloqueio indevido | Definir percentual, exceções e evidência de recebimento |
| P0 | Orçamento/pedido duplicado | Duplicidade operacional e financeira | Idempotência e testes concorrentes |
| P1 | Material em poder de parceiro sem reconciliação | Perdas não explicadas | Remessa, retorno, consumo, perda e saldo por lote |
| P1 | Custo real incompleto | Margem gerencial enganosa | Cobertura explícita e previsto versus realizado |
| P1 | Comissão sem base definida | Pagamento incorreto a vendedores | Política assinada antes de ativar cálculo |
| P1 | Pagamento a parceiro sem regra de aceite | Disputas e pagamentos indevidos | Eventos separados e regra contratual |
| P2 | Escopo fiscal não validado | Documento fiscal incorreto ou atraso | Levantamento com contador e homologação |
| P2 | Integração WhatsApp presumida | Custo/limitação e evidência insuficiente | Começar com registro manual rastreável |

## B.5. Plano de execução recomendado

### Etapa 0 — Fechamento de regras críticas

Registrar responsável, resposta aprovada e data para: componentes de custo/markup; arredondamento e desconto; alçada; percentual de entrada e exceções; prazo por produto; pagamento de parceiros; regra de comissão; cobertura do financeiro inicial. Não é necessário bloquear o desenho técnico de tudo, mas é necessário bloquear a ativação de regras comerciais ainda indefinidas.

### Etapa 1 — Modelagem e protótipo do orçamento

Desenhar entidades, relações, eventos e snapshots antes de migrations definitivas. Implementar um protótipo do cálculo sem acoplá-lo prematuramente ao CRM. Testar com cenários aprovados pela DE FARDAS, incluindo pedido de várias peças/tamanhos, personalizações diferentes, custos por peça e por lote, frete, perdas, desconto e preço abaixo do sugerido.

### Etapa 2 — Fluxo comercial mínimo

Clientes/contatos, lead, orçamento versionado, PDF, registro de aceite e arte, autorização, conversão idempotente em pedido e histórico. WhatsApp pode começar como canal manual registrado.

### Etapa 3 — Execução e rastreabilidade

Compras vinculadas ao pedido, recebimento conferido, reserva/consumo de materiais, remessas a parceiros, retornos, inspeção, retrabalho, entrega e comprovante.

### Etapa 4 — Financeiro operacional

Contas a receber, entrada, saldo, comprovantes, contas a pagar relacionadas à operação, estornos e inadimplência. Ativar comissão somente depois de aprovada sua política.

### Etapa 5 — Fiscal e inteligência

Fiscal após escopo e homologação com contador. IA somente leitura inicialmente, com autorização por perfil, limites de consulta, rastreabilidade e sem acesso irrestrito ao banco.

## B.6. Casos de teste mínimos para o motor de preço

Antes de aprovar o cálculo, validar e registrar resultados esperados para:

- custo-base igual a zero, negativo ou incompleto;
- markup zero e markup positivo;
- custo por peça combinado com custo por lote;
- grade com quantidades diferentes por tamanho;
- serviço terceirizado cobrado por peça;
- perda estimada versus perda real;
- frete fixo rateado por quantidade ou valor, conforme regra aprovada;
- tributo/comissão percentual sem dupla contagem;
- desconto autorizado e não autorizado;
- preço abaixo do sugerido;
- arredondamento por item versus no total do pedido;
- alteração do custo depois do envio e depois da aprovação;
- nova versão do orçamento e repetição da conversão em pedido.

Nenhum número de exemplo neste documento constitui política comercial. Os valores esperados devem ser aprovados pela empresa.

## B.7. Segurança, privacidade e operação — critérios para produção

Antes do go-live, demonstrar: permissões testadas no backend; proteção de arquivos privados; gestão de segredos fora do repositório; migrações reversíveis ou plano de recuperação; backup restaurado em ambiente de teste; logs sem credenciais; alertas de falha em jobs/integrações; política de retenção; procedimento de incidente; ambiente de homologação separado da produção. A aplicabilidade das obrigações da LGPD deve ser revisada no contexto real de dados tratados.

## B.8. Decisão de prontidão

**Pode avançar:** levantamento técnico do repositório, desenho de domínio, protótipo de precificação, arquitetura modular, matriz inicial de permissões e casos de teste.

**Não liberar sem aprovação:** cálculo comercial definitivo; exceções de desconto; percentual de entrada; comissão automática; regras finais de pagamento a parceiros; relatórios rotulados como lucro líquido; emissão fiscal; integrações automatizadas que prometam comprovação de aceite sem teste real.

A revisão v1.3 não afirma que código foi auditado, que integrações funcionam ou que as regras pendentes foram aprovadas. É uma revisão documental e de consistência de requisitos.

------------------------------------------------------------------------

# ADENDO DE VALIDAÇÃO — PRD v1.4

**Data:** 19 de outubro de 2026  
**Motivo:** registro da conclusão do checklist de pendências informada pelo responsável pelo projeto.  
**Precedência:** este adendo complementa os anteriores. Não altera regras de negócio por inferência nem substitui o registro dos valores efetivamente aprovados.

## C.1. Estado da validação

O responsável informou que resolveu as pendências do checklist da DE FARDAS e solicitou validar as decisões e atualizar o PRD. O checklist interativo usado na conversa continha caixas de marcação para acompanhar o progresso, mas não capturava nem armazenava as respostas textuais de cada pergunta. Portanto, a conclusão do checklist fica registrada como declaração do responsável; os valores específicos das decisões não são inventados nem considerados automaticamente aprovados por este documento.

## C.2. Regras de negócio preservadas como já respondidas

- Formação de preço baseada em percentual de acréscimo sobre o custo (markup), não confundir com margem sobre receita.
- Composição do custo pode incluir materiais, serviços terceirizados, entrega/frete, perdas, comissões e tributos/taxas, com prevenção de dupla contagem.
- O preço pode variar conforme a composição do pedido.
- A arte/layout personalizado precisa ser aprovado antes de iniciar a produção.
- A produção depende da confirmação da entrada; o saldo é previsto para a entrega, conforme as regras comerciais aplicáveis.
- Clientes são predominantemente empresariais; WhatsApp é canal importante para leads e aceite.
- Materiais são comprados conforme a necessidade dos pedidos, com controle de tecidos, linhas e aviamentos.
- Etapas terceirizadas precisam registrar quantidades, materiais enviados/devolvidos, conferência, defeitos, retrabalho e responsabilidade.
- Entrega integral é o fluxo normal; entrega parcial é exceção controlada.
- Dados, credenciais e repositório da DE FARDAS devem permanecer segregados do ambiente de outros clientes da Enlace.

## C.3. Registro explícito necessário antes de ativar regras comerciais

Para que a implementação use exatamente as decisões aprovadas — e para que os testes tenham resultados esperados —, os valores definidos pelo responsável precisam ser transcritos para a tabela de decisões abaixo. O status “resolvido” não deve ser interpretado como um valor padrão pelo sistema.

| Decisão | Registro aprovado a preencher no documento de negócio | Estado documental |
|---|---|---|
| Percentual de markup | Percentual, se varia por produto/categoria e quem pode alterá-lo | Aguardando transcrição do valor aprovado |
| Composição do custo | Base de cada componente, unidade, rateio e regra para impostos/comissões | Aguardando transcrição da tabela aprovada |
| Arredondamento e preço mínimo | Regra de arredondamento, limite mínimo e tratamento de preço abaixo do sugerido | Aguardando transcrição da regra aprovada |
| Entrada do cliente | Percentual fixo e exceções autorizadas | Aguardando transcrição do percentual aprovado |
| Alçada de preço/desconto/cancelamento | Matriz final de perfis e limites | Aguardando transcrição da matriz aprovada |
| Comissão de vendas | Percentual, base, momento de elegibilidade e reversões | Aguardando transcrição da política aprovada |
| Pagamento a parceiros | Evento de aceite, documentos necessários e regra para defeitos/retrabalho | Aguardando transcrição da regra aprovada |
| Prazo de produção | Prazo por produto/etapa e autoridade para exceções | Aguardando transcrição da tabela aprovada |
| Cancelamento/reembolso | Regra por etapa e tratamento de custos já incorridos | Aguardando transcrição da política aprovada |
| Escopo financeiro do MVP | Categorias de receitas, custos e despesas incluídas | Aguardando transcrição do escopo aprovado |
| Fiscal | Regime, documentos aplicáveis e validação da contabilidade | Depende de confirmação documental/contábil |
| Repositório e infraestrutura | URL do repositório, ambiente, domínio e responsável operacional | Aguardando registro dos dados definidos |
| Planilhas de referência | Arquivos operacionais e fórmulas usadas atualmente, se existentes | Aguardando anexação/validação, se aplicável |

## C.4. Critério de prontidão após a transcrição

O PRD poderá ser marcado como **validado para desenvolvimento do MVP** quando:

1. Os itens de C.3 tiverem uma resposta explícita, um responsável e uma data, ou estiverem formalmente classificados como fora do MVP.
2. Os valores de preço, entrada, comissão e limites de desconto estiverem cobertos por casos de teste com resultados esperados aprovados.
3. A matriz de permissões e o fluxo de aprovação não tiverem contradições.
4. O escopo fiscal estiver separado do escopo operacional e validado com a contabilidade antes de qualquer emissão fiscal.
5. Repositório, infraestrutura, backups e segregação dos dados do cliente estiverem definidos.
6. O escopo do MVP e os critérios de aceite forem aprovados pelo responsável da DE FARDAS.

## C.5. Decisão de execução

A conclusão do checklist permite avançar com a organização técnica, o desenho do domínio e a preparação de testes. Não autoriza inferir números ou regras ausentes, nem declarar testadas integrações que ainda não foram executadas. O desenvolvimento deve consumir os parâmetros registrados em fonte única de configuração, com trilha de auditoria para alterações autorizadas.



------------------------------------------------------------------------

# ADENDO DE DECISÕES TÉCNICAS — PRD v1.6

**Data:** 19 de outubro de 2026  
**Motivo:** registrar as preferências técnicas explicitamente aprovadas e o ambiente de desenvolvimento escolhido pelo responsável.  
**Precedência:** este adendo atualiza decisões técnicas; não altera nem preenche regras comerciais, fiscais ou de produção sem confirmação explícita.

## D.1. Matriz de decisões

| Tema | Decisão aprovada | Consequência / cuidado |
|---|---|---|
| Banco de dados | PostgreSQL próprio | A operação deve cobrir atualizações, acesso restrito, monitoramento, backup e restauração. |
| Hospedagem | Infraestrutura contratada para a cliente | Manter segregação dos dados e credenciais da DE FARDAS; esclarecer responsabilidades contratuais e operacionais. |
| Arquivos | Armazenamento privado compatível com S3 | Acesso privado por padrão, autorização no backend, gestão de credenciais e links temporários quando aplicável. |
| Escopo | MVP do fluxo principal | Priorizar o fluxo ponta a ponta aprovado; adiar integrações e automações avançadas para fases posteriores, sem impedir evolução arquitetural. |

## D.2. Critérios técnicos mínimos do MVP

1. Banco de dados não exposto publicamente e acesso limitado por rede e privilégio mínimo.
2. Migrações versionadas e testadas antes de produção; constraints e transações para proteger consistência de pedidos, itens, pagamentos e movimentos de estoque, conforme o domínio validado.
3. Arquivos privados, com autorização verificada no backend e sem URLs públicas permanentes para documentos restritos.
4. Segredos fora do controle de versão; ambientes de desenvolvimento, homologação e produção segregados conforme a capacidade da infraestrutura contratada.
5. Backup de banco e arquivos com procedimento documentado e teste de restauração antes do go-live. Frequência, retenção e objetivos de recuperação dependem de decisão operacional/contratual, não definidos por este adendo.
6. Logs operacionais e de auditoria sem exposição de credenciais; alertas para falhas críticas compatíveis com o porte do MVP.
7. Documentar quem responde por provisionamento, atualizações, monitoramento, backups, incidentes e recuperação.

## D.3. Fora do escopo desta decisão

Estas escolhas não definem fornecedor de hospedagem ou S3, domínio, orçamento, SLA, região de armazenamento, RPO/RTO, stack definitiva de aplicação, provedor de autenticação, política comercial, percentuais, comissões, regras de desconto ou enquadramento fiscal. Esses pontos permanecem pendentes até serem confirmados por fonte apropriada.

## D.4. Efeito sobre o estado do PRD

As decisões técnicas de banco, hospedagem, armazenamento e abordagem de escopo estão registradas como aprovadas. O PRD **não fica automaticamente validado em sua totalidade para desenvolvimento de produção**: as pendências comerciais e fiscais listadas nas seções anteriores continuam sujeitas a registro explícito, teste e aprovação. A equipe pode avançar com desenho técnico do MVP e preparação da infraestrutura sem inventar valores ou comportamentos comerciais.


## D.5. Ambiente de desenvolvimento aprovado

| Tema | Decisão aprovada | Limite / orientação |
|---|---|---|
| Ambiente de desenvolvimento | Google AI Studio | Usar Google Gemini para desenvolver o projeto nesse ambiente. Isso não determina onde a aplicação será hospedada em produção. |
| Produção | Infraestrutura contratada para a DE FARDAS | Não presumir implantação no Google Cloud ou em outro provedor específico. |
| Processo de implementação | Incremental, com verificação por etapa | Inspecionar antes de alterar; testar; registrar evidências; atualizar documentação; não afirmar sucesso sem comprovação. |
| Lacunas do PRD | Não inferir requisitos | Registrar dúvidas e solicitar decisão; não criar regras comerciais, fiscais ou operacionais sem aprovação. |
| Tecnologias não decididas | Permanecem abertas | Frameworks, ORM, autenticação, filas e fornecedor de armazenamento não ficam definidos apenas pela escolha do Google AI Studio. |

A escolha do Google AI Studio atualiza o processo de desenvolvimento, não as regras de negócio nem as decisões de infraestrutura de produção. O Gemini deve tratar o PRD como especificação de referência, apontar conflitos e pendências e evitar mudanças destrutivas ou implantação em produção sem autorização explícita.
