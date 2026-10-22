# 05 CRM CLIENTES E FLUXO COMERCIAL

**Prioridade:** P1 — depende da fundação e dos critérios do motor de preço

**Fonte:** conteúdo reorganizado do PRD_DE_FARDAS_v1.6.md e dos seus adendos.

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


---

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


---

### A.3.2. Pedido e liberação para produção

1. O pedido deve referenciar a versão exata do orçamento aprovado.
2. A produção só pode ser liberada depois da confirmação do recebimento da entrada e da aprovação da arte, quando houver personalização.
3. A liberação também deve verificar material necessário, prazo e ordens/serviços externos planejados. Bloqueios adicionais por disponibilidade de materiais devem ser confirmados pelo negócio antes de se tornarem regra rígida.
4. Estados comerciais, financeiros e operacionais devem ser separados. “Aprovado”, “entrada recebida”, “liberado para produção”, “produção concluída”, “pronto para entrega”, “entregue” e “financeiramente quitado” não são sinônimos.
5. O prazo padrão por produto é a referência inicial. Uma exceção deve exigir prazo revisado e registrar responsável, motivo e comunicação ao cliente.
6. A regra geral é entrega integral. Entrega parcial deve ser exceção explicitamente autorizada, com quantidades, comprovantes, saldo de itens e efeito financeiro registrados.
7. Cancelamento exige análise dos materiais comprados/reservados, remessas a parceiros, serviços executados, valores recebidos e valores a devolver/cobrar. Não apagar movimentos anteriores; registrar estornos e ajustes compensatórios.


---

### P1 — CRM e pedido comercial

- Cadastro empresarial, contatos e histórico.
- Captação e registro de oportunidades originadas principalmente no WhatsApp; outros canais permanecem possíveis.
- Conversão idempotente de orçamento aprovado em pedido.
- Revisão pós-aprovação com impacto documentado em preço e prazo.
- Controle de permissões e auditoria.


---

### Pedido e produção terceirizada

9. A aprovação converte o orçamento em um único pedido mesmo se a operação for repetida.
10. O pedido não é liberado para produção antes da confirmação da entrada e da aprovação da arte, quando aplicável.
11. Cada ordem de serviço identifica parceiro, serviço, quantidade por peça/variante, preço acordado, material enviado e prazo.
12. O material em poder de terceiro é rastreável e não desaparece do controle de materiais antes de consumo/perda registrados.
13. O retorno de parceiro permite registrar quantidades recebidas, aprovadas, rejeitadas, perdidas e retrabalhadas.
14. A conferência final registra responsável, resultado e ocorrências; retrabalho mantém referência à ocorrência original.
15. O custo previsto pode ser comparado ao valor contratado, aceito, cobrado e realizado.
16. A entrega integral registra comprovante e responsável. Uma entrega parcial, quando autorizada como exceção, mantém saldo pendente e histórico.

