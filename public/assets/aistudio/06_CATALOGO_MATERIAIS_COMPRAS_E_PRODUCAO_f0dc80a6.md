# 06 CATALOGO MATERIAIS COMPRAS E PRODUCAO

**Prioridade:** P2 — implementar após preço e fluxo comercial básicos

**Fonte:** conteúdo reorganizado do PRD_DE_FARDAS_v1.6.md e dos seus adendos.

## Bloqueio de negócio

Não inventar percentuais de entrada, comissão, prazos de pagamento ou fórmula de reembolso. Separar estado comercial, estado operacional e estado financeiro. Estornos devem preservar histórico; não apagar lançamentos baixados.

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


---

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


---

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


---

### P2 — Materiais por pedido e serviços terceirizados

- Necessidade de material por tamanho/variação.
- Compras vinculadas a pedidos e recebimento após conferência.
- Remessas/retornos de material em poder de parceiros.
- Ordens de serviço por peça, etapas, quantidades e prazos.
- Conferência final, ocorrências, perdas, retrabalho e custo previsto versus real.
- Prazo padrão por produto com exceções registradas.


---

### Compras, financeiro e cancelamentos

17. A compra só movimenta estoque após conferência da quantidade recebida; divergências são rastreáveis.
18. A necessidade de material considera tamanho/variação e perda estimada; perdas reais ficam registradas separadamente.
19. O recebimento manual exige valor e data, mantém comprovante e reduz o saldo somente pelo valor recebido.
20. A produção permanece bloqueada até a confirmação da entrada, sem aceitar apenas um valor previsto como pagamento.
21. O saldo é acompanhado para cobrança no momento da entrega, e qualquer condição excepcional é registrada.
22. Alertas de vencimento e inadimplência são calculados a partir de contas a receber; contatos de cobrança ficam no histórico.
23. Cancelar pedido com materiais comprados, materiais em poder de parceiro, serviço executado ou valores recebidos exige resumo de impacto e registro das decisões de devolução/cobrança.
24. Estornos e ajustes não apagam lançamentos originais; geram eventos compensatórios auditáveis.

