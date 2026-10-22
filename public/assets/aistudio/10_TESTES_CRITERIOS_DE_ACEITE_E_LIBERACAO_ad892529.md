# 10 TESTES CRITERIOS DE ACEITE E LIBERACAO

**Prioridade:** Transversal — aplicar a cada fase e antes de qualquer implantação

**Fonte:** conteúdo reorganizado do PRD_DE_FARDAS_v1.6.md e dos seus adendos.

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


---

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


---

## B.7. Segurança, privacidade e operação — critérios para produção

Antes do go-live, demonstrar: permissões testadas no backend; proteção de arquivos privados; gestão de segredos fora do repositório; migrações reversíveis ou plano de recuperação; backup restaurado em ambiente de teste; logs sem credenciais; alertas de falha em jobs/integrações; política de retenção; procedimento de incidente; ambiente de homologação separado da produção. A aplicabilidade das obrigações da LGPD deve ser revisada no contexto real de dados tratados.

## B.8. Decisão de prontidão

**Pode avançar:** levantamento técnico do repositório, desenho de domínio, protótipo de precificação, arquitetura modular, matriz inicial de permissões e casos de teste.

**Não liberar sem aprovação:** cálculo comercial definitivo; exceções de desconto; percentual de entrada; comissão automática; regras finais de pagamento a parceiros; relatórios rotulados como lucro líquido; emissão fiscal; integrações automatizadas que prometam comprovação de aceite sem teste real.

A revisão v1.3 não afirma que código foi auditado, que integrações funcionam ou que as regras pendentes foram aprovadas. É uma revisão documental e de consistência de requisitos.

------------------------------------------------------------------------


---

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

