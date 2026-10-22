# 09 RELATORIOS IA FISCAL E INTEGRACOES FUTURAS

**Prioridade:** P5 — adiar integrações avançadas; não bloquear o MVP operacional

**Fonte:** conteúdo reorganizado do PRD_DE_FARDAS_v1.6.md e dos seus adendos.

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


---

### Fora da primeira entrega, salvo decisão explícita

- Emissão fiscal automatizada antes de levantamento e homologação.
- Integração bancária automática, cobrança automática ou conciliação bancária completa.
- Estoque avançado de múltiplos depósitos, reposição automática e planejamento industrial avançado.
- Portal externo de parceiros e IA capaz de executar alterações financeiras.

## A.5. Critérios de aceite atualizados


---

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

