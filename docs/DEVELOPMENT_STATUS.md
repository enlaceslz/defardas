# DE FARDAS — status de desenvolvimento e prontidão

Atualizado em 29/10/2026. Repositório: `enlaceslz/defardas`.

**Situação: núcleo transacional testado; produção ainda não liberada.** Este documento substitui a declaração anterior de “IMPLEMENTADO, TESTADO E HOMOLOGADO”, que não correspondia às integrações e evidências disponíveis.

As correções estão em PRs incrementais. A revisão parte do PR #23 (`4701bea2`), cuja CI passou na segunda tentativa: https://github.com/enlaceslz/defardas/actions/runs/40897687115. PR aberto, build aprovado e homologação operacional são estados diferentes. Não houve merge, deploy, migração no banco real ou envio externo nesta revisão.

| Área | Evidência e situação atual |
|---|---|
| Persistência | PostgreSQL obrigatório em produção; sem fallback operacional para memória; transações compartilham cliente e lock. Memória é demonstração local sem banco configurado. |
| Identidade | Sessões verificadas no banco, senhas bcrypt, troca de senha e revogação transacionais. Provisionamento e gestão de equipe por CLI disponíveis. E-mail de recuperação segue indisponível em produção. |
| Comercial | Markup sobre custo, decomposição por item e validação da capacidade SQL. Conversão gera uma OP por item e sinal/saldo sem duplicação em repetição. |
| Produção | Corte exige arte e entrada confirmadas; aprovação repetida conserva metadados. Repetir etapa atual preserva conclusão; transição real exige revisão da leitura. Não há chave durável para reprodução de comandos antigos. |
| Financeiro/estoque | Precisão validada, mutações e auditoria transacionais, idempotência nos cadastros financeiros e movimentos operacionais. Comprovante com URL válida não é evidência autenticada. |
| Auditoria | Logs persistentes e acesso administrativo. Bloqueio do gate é auditado após rollback; existe janela de queda entre as duas transações. |
| Interface | API autoritativa, formulários aguardam resultado e mantêm rascunho em falha; testes de componentes em JSDOM não homologam celular/impressão reais. |
| WhatsApp | Ingestão autenticada/deduplicada, intenção antes da rede, tratamento de estado incerto e reconciliação CLI. Recibos reais, QR/reconexão e contrato do provedor ainda dependem de desenvolvimento/homologação. |
| Arquivos | Upload privado S3, posse, MIME/tamanho e vínculo de evidência ainda não implementados. Variáveis S3 não ativam integração. |
| Deploy | Imagem com usuário sem privilégios, migração CLI e backup/restauração testados em CI. Compose padrão sem provedor fictício; Redis opcional e sem uso pelo runtime atual. Servidor contratado ainda não ensaiado. |
| Governança | Matriz de leitura por perfil, cancelamento/estorno, retenção, comissão e alçada definitiva precisam de decisões/homologação. Não automatizar fiscal/comissão sem política válida. |

Na base do PR #23, 87 testes locais passaram; CI validou tipagem, build, PostgreSQL, backup/restauração e imagem. A revisão atual passou 88 testes locais, tipagem e build; acrescenta teste de endpoint WA-AKG obrigatório, validação do Compose e healthcheck interno em porta customizada. Auditoria npm: quatro alertas moderados em ferramentas de desenvolvimento e zero com --omit=dev. Seu resultado deve ser conferido na CI do novo PR, sem substituir o registro histórico da base.

Próximos passos e bloqueios: [nova auditoria de produção](AUDITORIA_PRODUCAO_2026-10-29.md). Procedimentos: [guia Docker](DOCKER_DEPLOY.md) e [operação transacional](OPERACAO_TRANSACIONAL.md). Histórico detalhado: [continuação da auditoria](AUDITORIA_CONTINUACAO_2026-10-28.md).

Continuação de configuração PostgreSQL: 92 testes locais, tipagem e build aprovados; modos SSL/pool e conflitos de URL são validados antes da conexão, preservando CA e verificação de certificado. Ver auditoria/guia para compatibilidade e evidência de CI do PR correspondente. Handshake no ambiente contratado permanece pendente.

Continuação de privacidade: 94 testes locais, tipagem e build aprovados. Bloqueios de acesso e rate limit usam modelo de rota do servidor, evitando URL/query/valores privados e contadores separados por variação de caixa. Persistência do evento é coberta por teste PostgreSQL adicional na CI do novo PR. Histórico, proxy e rate limit entre processos seguem fora dessa correção.

Continuação de prazos: 97 testes locais, tipagem e build aprovados. Cabeçalho é validado antes do número; prazo e data representável são conferidos também na conversão. Ano zero é recusado. Nenhuma regra de prazo comercial/calendário útil foi criada; ver operação transacional e CI do PR correspondente para evidências e limites.

Continuação financeira: 99 testes locais, tipagem e build aprovados. Conversão exige duas parcelas positivas e coerentes com percentual/total dos itens antes de gravar; leitura não disfarça percentual histórico. Não altera preço comercial ou arredondamento existente. Evidência PostgreSQL/Docker deve ser conferida na CI do PR correspondente.

Continuação do replay: 100 testes locais, tipagem e build aprovados. Histórico de conversão parcial não recebe falso sucesso; proposta, OPs e recebíveis precisam ter vínculos consistentes. Reenvio íntegro conserva pagamento e auditoria. Consultar o runbook e a CI do PR correspondente para limites e evidências; reconciliação histórica automática não foi implementada.

Continuação de concorrência: 103 testes locais, tipagem e build aprovados. Migração 0006 adiciona revisão por OP; avanço de etapa exige revisão lida e recusa ação antiga. UI recarrega conflito sem repetir a operação. Schema/trigger e contratos de clientes devem ser atualizados em manutenção; confirmar CI do PR correspondente. Outras escritas não recebem CAS nesta entrega.
