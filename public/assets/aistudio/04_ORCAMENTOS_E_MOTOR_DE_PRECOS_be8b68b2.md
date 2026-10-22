# 04 ORCAMENTOS E MOTOR DE PRECOS

**Prioridade:** P0 — primeiro módulo funcional após a fundação

**Fonte:** conteúdo reorganizado do PRD_DE_FARDAS_v1.6.md e dos seus adendos.

## Bloqueio de negócio

A aprovação de orçamento deve preservar snapshot/versionamento e evitar criação duplicada de pedido. Não presumir percentuais, limites de desconto, regras de alçada ou condições de pagamento que não estejam expressamente aprovadas.

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


---

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


---

### P0 — Fundação de orçamento e preço confiável

- Modelo de produtos, variantes, tamanhos, tecidos, personalização e quantidades.
- Composição de custos por pedido/item.
- Markup percentual configurável e cálculo separado da margem estimada.
- Validação de custos e prevenção de dupla contagem.
- Preço sugerido, autorização de preço abaixo do sugerido, versões, validade configurável e PDF.
- Registro de aceite por WhatsApp e aprovação de arte.
- Testes automatizados de cálculos, descontos, arredondamento e versionamento.


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


---

### B.2.1. Precificação: markup não é margem

A regra comercial respondida é acréscimo percentual sobre o custo (markup). Portanto, para um custo-base `C` e markup percentual `k`:

`Preço sugerido = C × (1 + k/100)`

A fórmula de margem sobre receita (`Preço = custo / (1 - margem - taxas proporcionais)`) que aparece na seção histórica do PRD representa outro método de precificação. Ela não pode ser usada como fórmula principal do MVP sem decisão explícita. Pode permanecer apenas como cálculo gerencial separado, se aprovado.

Antes de ativar cálculo real, a DE FARDAS deve aprovar uma tabela de componentes que identifique, para cada componente: unidade (por peça, por lote ou percentual), base de cálculo, etapa em que entra, origem do valor, possibilidade de rateio e regra de arredondamento. Impostos, comissões, frete e perdas não podem ser incluídos simultaneamente no custo-base e novamente como acréscimos percentuais sem uma regra deliberada.

A aplicação deve apresentar pelo menos: custo estimado, markup aplicado, preço sugerido, desconto concedido, preço final e margem estimada resultante. Margem estimada não deve ser rotulada como lucro líquido contábil.


---

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


---

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

