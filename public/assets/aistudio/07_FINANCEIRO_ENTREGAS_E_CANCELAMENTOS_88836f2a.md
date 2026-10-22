# 07 FINANCEIRO ENTREGAS E CANCELAMENTOS

**Prioridade:** P3 — depois que pedidos e custos operacionais estiverem rastreáveis

**Fonte:** conteúdo reorganizado do PRD_DE_FARDAS_v1.6.md e dos seus adendos.

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


---

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


---

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

