# 01 FUNDACAO ARQUITETURA BANCO E SEGURANCA

**Prioridade:** P0 — executar antes dos módulos funcionais

**Fonte:** conteúdo reorganizado do PRD_DE_FARDAS_v1.6.md e dos seus adendos.

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


---

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


---

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


---

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


---

## B.7. Segurança, privacidade e operação — critérios para produção

Antes do go-live, demonstrar: permissões testadas no backend; proteção de arquivos privados; gestão de segredos fora do repositório; migrações reversíveis ou plano de recuperação; backup restaurado em ambiente de teste; logs sem credenciais; alertas de falha em jobs/integrações; política de retenção; procedimento de incidente; ambiente de homologação separado da produção. A aplicabilidade das obrigações da LGPD deve ser revisada no contexto real de dados tratados.

## B.8. Decisão de prontidão

**Pode avançar:** levantamento técnico do repositório, desenho de domínio, protótipo de precificação, arquitetura modular, matriz inicial de permissões e casos de teste.

**Não liberar sem aprovação:** cálculo comercial definitivo; exceções de desconto; percentual de entrada; comissão automática; regras finais de pagamento a parceiros; relatórios rotulados como lucro líquido; emissão fiscal; integrações automatizadas que prometam comprovação de aceite sem teste real.

A revisão v1.3 não afirma que código foi auditado, que integrações funcionam ou que as regras pendentes foram aprovadas. É uma revisão documental e de consistência de requisitos.

------------------------------------------------------------------------

