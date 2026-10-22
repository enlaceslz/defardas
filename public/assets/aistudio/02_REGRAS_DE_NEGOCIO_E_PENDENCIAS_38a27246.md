# 02 REGRAS DE NEGOCIO E PENDENCIAS

**Prioridade:** P0 — leitura obrigatória antes de implementar regras comerciais

**Fonte:** conteúdo reorganizado do PRD_DE_FARDAS_v1.6.md e dos seus adendos.

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


---

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

