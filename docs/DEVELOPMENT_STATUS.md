# DE FARDAS — status de desenvolvimento e prontidão

Atualizado em 31/10/2026. Repositório: `enlaceslz/defardas`.

**Situação: núcleo transacional testado; produção ainda não liberada.** Este documento substitui a declaração anterior de “IMPLEMENTADO, TESTADO E HOMOLOGADO”, que não correspondia às integrações e evidências disponíveis.

As correções estão em PRs incrementais. Última entrega funcional validada: [PR #57](https://github.com/enlaceslz/defardas/pull/57), commit publicado `b6c2f0b2`, com 139 testes locais, tipagem e build aprovados. [CI completa](https://github.com/enlaceslz/defardas/actions/runs/41208885465) aprovada: Compose, testes, build, PostgreSQL, backup/restauração e Docker. O PR #57 permanece aberto e sem merge na consulta de 31/10; essa branch não comprova integração na branch principal ou implantação. Os números abaixo referentes a bases anteriores são históricos.

**Próxima etapa de produção:** consolidar a sequência incremental em homologação e resolver os três bloqueios P0 antes de liberar dados reais: armazenamento privado/evidências, matriz de leitura por perfil homologada e ensaio no servidor contratado. Correções de formulário não eliminam esses bloqueios.

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

## Consolidação até o PR #57

| Frente | Correções validadas e limites |
|---|---|
| Concorrência de OP | Migração 0006 com revisão/trigger; edição, mudança de etapa e primeira aprovação exigem revisão da leitura. Replay de aprovação conserva metadados. Atualizar clientes da API em conjunto. |
| Integridade financeira | Baixa exige vínculos e estrutura de conversão coerentes; rejeição não libera OP. Reenvio de título pago preserva confirmação. URL válida ainda não autentica comprovante. |
| Estoque | UUID/vínculo de OP antes do movimento; histórico/custódia bloqueiam exclusão com consulta de existência; SPA conserva saldo observado no ajuste. Não há revisão completa do item ou solução ABA. |
| Proposta | Motor puro compartilhado e runtime Docker alinhados; margem/parcelas em centavos; validade representável e limite de 100 itens na SPA. Sem novo prazo comercial ou alteração do markup. |
| Interface | Formulários sem valores fictícios, limites alinhados à API e bloqueio de duplo envio do perfil. JSDOM não substitui homologação em navegador/dispositivo real. |
| Comunicação | Chaves incertas por texto/conversa, respostas antigas descartadas, histórico mesclado e QR com tratamento de falha. Estado de chaves não sobrevive à desmontagem; provedor real permanece pendente. |

## Critérios para avançar à liberação

1. Integrar a cadeia de PRs em ambiente de homologação e registrar o commit consolidado. Conferir migrações, clientes próprios da API e configuração; não usar CI de uma branch incremental como prova da versão implantada.
2. Implementar e ensaiar armazenamento privado no provedor contratado: autorização por arquivo, vínculo de arte/comprovante, tamanho/MIME e URLs temporárias. Credenciais reais não entram no repositório.
3. Homologar a matriz de leitura com os responsáveis e aplicá-la ao backend e carregamento da SPA. Não presumir alçadas por perfil.
4. Ensaiar no host contratado HTTPS/proxy/TLS do PostgreSQL, persistência, segredos, monitoramento, backup externo e recuperação em cópia isolada; registrar responsáveis e metas RPO/RTO.
5. Homologar jornadas com comercial, financeiro e produção, incluindo falhas/reenvios, impressão e dispositivos usados pela equipe. Decidir escopo operacional e pendências aceitas formalmente.

Sem acesso/evidência do host ou decisões de negócio, esses critérios continuam abertos. Nenhuma homologação ou liberação é inferida da quantidade de testes.

## Registros históricos de validação

Na base do PR #23, 87 testes locais passaram; CI validou tipagem, build, PostgreSQL, backup/restauração e imagem. A revisão atual passou 88 testes locais, tipagem e build; acrescenta teste de endpoint WA-AKG obrigatório, validação do Compose e healthcheck interno em porta customizada. Auditoria npm: quatro alertas moderados em ferramentas de desenvolvimento e zero com --omit=dev. Seu resultado deve ser conferido na CI do novo PR, sem substituir o registro histórico da base.

Próximos passos e bloqueios: [nova auditoria de produção](AUDITORIA_PRODUCAO_2026-10-29.md). Procedimentos: [guia Docker](DOCKER_DEPLOY.md) e [operação transacional](OPERACAO_TRANSACIONAL.md). Histórico detalhado: [continuação da auditoria](AUDITORIA_CONTINUACAO_2026-10-28.md).

Continuação de configuração PostgreSQL: 92 testes locais, tipagem e build aprovados; modos SSL/pool e conflitos de URL são validados antes da conexão, preservando CA e verificação de certificado. Ver auditoria/guia para compatibilidade e evidência de CI do PR correspondente. Handshake no ambiente contratado permanece pendente.

Continuação de privacidade: 94 testes locais, tipagem e build aprovados. Bloqueios de acesso e rate limit usam modelo de rota do servidor, evitando URL/query/valores privados e contadores separados por variação de caixa. Persistência do evento é coberta por teste PostgreSQL adicional na CI do novo PR. Histórico, proxy e rate limit entre processos seguem fora dessa correção.

Continuação de prazos: 97 testes locais, tipagem e build aprovados. Cabeçalho é validado antes do número; prazo e data representável são conferidos também na conversão. Ano zero é recusado. Nenhuma regra de prazo comercial/calendário útil foi criada; ver operação transacional e CI do PR correspondente para evidências e limites.

Continuação financeira: 99 testes locais, tipagem e build aprovados. Conversão exige duas parcelas positivas e coerentes com percentual/total dos itens antes de gravar; leitura não disfarça percentual histórico. Não altera preço comercial ou arredondamento existente. Evidência PostgreSQL/Docker deve ser conferida na CI do PR correspondente.

Continuação do replay: 100 testes locais, tipagem e build aprovados. Histórico de conversão parcial não recebe falso sucesso; proposta, OPs e recebíveis precisam ter vínculos consistentes. Reenvio íntegro conserva pagamento e auditoria. Consultar o runbook e a CI do PR correspondente para limites e evidências; reconciliação histórica automática não foi implementada.

Continuação de concorrência: 103 testes locais, tipagem e build aprovados. Migração 0006 adiciona revisão por OP; avanço de etapa exige revisão lida e recusa ação antiga. UI recarrega conflito sem repetir a operação. Schema/trigger e contratos de clientes devem ser atualizados em manutenção; confirmar CI do PR correspondente. Outras escritas não recebem CAS nesta entrega.


Nova revisão de 31/10: [achados e critérios de produção](AUDITORIA_PRODUCAO_2026-10-31.md). CI do PR #58 aprovada; startup passa a validar PORT sem coerção parcial. Bloqueios P0 continuam abertos.
