# 03 AUDITORIA CORRECOES E CONFLITOS

**Prioridade:** P0 — leitura obrigatória para evitar contradições de implementação

**Fonte:** conteúdo reorganizado do PRD_DE_FARDAS_v1.6.md e dos seus adendos.

## Alerta de consistência obrigatório

O PRD consolidado contém uma fórmula de margem sobre receita na seção original 5.6, mas o adendo de auditoria B.2.1 determina que a regra respondida pela empresa é **markup percentual sobre o custo** e que markup não deve ser confundido com margem. Para implementação, prevalece a correção do adendo: não codificar a fórmula de margem como regra aprovada. O percentual exato, componentes e regras de arredondamento devem vir de uma decisão comercial registrada; enquanto ausentes, usar parâmetros não ativados ou dados de teste claramente identificados.

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

