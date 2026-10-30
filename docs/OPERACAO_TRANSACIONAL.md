# Operação do núcleo transacional

A branch de auditoria usa PostgreSQL como fonte de verdade. LocalStorage não é backup automático nem persistência de dados operacionais.

## Preparação

- Runtime Node 22 da imagem Docker; PostgreSQL próprio 16.
- `.env` fora do Git e fora da imagem. Definir DATABASE_URL e política SSL. O Compose usa rede interna sem TLS; banco remoto deve usar `DATABASE_SSL_MODE=verify-full` e, quando necessário, `DATABASE_CA_CERT`.
- Definir POSTGRES_PASSWORD ao usar o Compose. Não existem credenciais iniciais de produção.
- A publicação completa exige Express na mesma origem da SPA (container/runtime Node); a configuração estática Vercel não hospeda esta API.

## Instalação em homologação

```bash
npm ci
npm run lint
npm test
npm run build
npm run db:migrate
npm run admin:create
npm start
```

`admin:create` requer ADMIN_EMAIL, ADMIN_NAME e ADMIN_PASSWORD no ambiente. O script não imprime senha, não substitui usuário existente e não cria senha padrão. Remover ADMIN_PASSWORD do ambiente após provisionar. No container, os scripts Node de migração e provisionamento estão disponíveis com os mesmos comandos npm.

Antes de migrar banco existente, gerar backup e ensaiar em cópia. Unicidade/checks novos não corrigem histórico inconsistente automaticamente. Ler o relatório de auditoria para os casos de migração antiga.

## Jornada atual

1. Cadastrar cliente com dados reais.
2. Criar proposta: informar itens, tecido/cor, grades, custos, markup e prazos. O servidor recalcula os preços. Desconto abaixo do sugerido exige admin, conforme matriz já existente.
3. Registrar aprovação comercial e converter. Cada item gera uma OP; sinal/saldo são títulos da proposta. Repetições concorrentes retornam a conversão existente.
4. Confirmar sinal na tela Financeiro com autenticação bancária e comprovante real. A confirmação afeta todas as OPs da proposta; não avança etapas.
5. Aprovar a arte em cada OP com identificação de quem a aprovou; então avançar o gate pela ação própria.
6. Confirmar saldo no financeiro. Estoque e suas remessas/retornos precisam de eventos compensatórios; ajustes requerem motivo e saldo atualizado.

O upload privado completo ainda é pendência de liberação. Não usar URL fictícia para superar o campo de comprovante. Não utilizar o sistema com dados reais antes de concluir os bloqueios do relatório.

## Backup e recuperação

Executar `bash scripts/backup.sh` com acesso ao container ou DATABASE_URL e pg_dump compatível. BACKUP_DIR permite escolher destino; arquivos têm permissão restrita e checksum. Copiar para armazenamento externo controlado conforme política real da empresa.

Para restauração, parar a aplicação e restaurar primeiro em banco isolado: `bash scripts/restore.sh arquivo.sql.gz`. A confirmação interativa informa o banco. O modo `--force` é reservado a execução deliberada/automatizada; não contorna checksum nem ON_ERROR_STOP. Verificar dados e migrações antes de reabrir tráfego.

## Evidências de engenharia

A CI valida instalação, tipagem, 21 testes locais, 10 testes de PostgreSQL, backup/restauração e imagem de produção. Os bancos defardas_test/defardas_restore_test são descartáveis. O teste de concorrência usa um lock transacional global; ajustar somente com medições e testes de integridade.

## Recuperação administrativa de senha

Enquanto não houver entrega de e-mail homologada, `POST /api/auth/recover-password` responde 503 em produção, sem gerar token nem informar que enviou instruções. O endpoint de redefinição possui limitação de tentativas. A emissão pública não deve ser reativada apenas removendo esse bloqueio: requer entrega real, interface de redefinição e ensaio de segurança.

Para uma recuperação autorizada, o operador com acesso ao host pode executar `npm run user:reset-password` após carregar `RESET_USER_EMAIL` e `RESET_USER_PASSWORD` no ambiente. A conta deve estar ativa. Não passar a senha na linha de comando nem gravá-la no histórico; obtê-la por entrada oculta ou pelo mecanismo de segredos já usado na infraestrutura. Remover as variáveis do shell ao terminar. O script não imprime a senha, não altera perfil, não reativa conta e não cria usuário.

A migração `0004_small_mac_gargan` cria `core.password_reset_tokens`. Só o SHA-256 de tokens aleatórios é guardado; validade de uma hora, um token por usuário, substituição na nova emissão e consumo único. Troca de senha, revogação de todas as sessões/tokens e auditoria confirmam ou revertem juntas. O login revalida o hash antes de inserir a sessão na mesma transação, impedindo que uma tentativa em trânsito com a senha antiga sobreviva à redefinição.

A recuperação por CLI é uma operação privilegiada do host, equivalente ao provisionamento inicial: restringir esse acesso aos operadores responsáveis. O evento `PASSWORD_RESET_BY_OPERATOR` identifica o canal administrativo; a identidade individual do operador deve ser rastreada pelo controle de acesso ao host. Nenhuma recuperação de conta operacional foi executada nesta entrega.

## Isolamento da demonstração local

As rotas de credenciais demonstrativas, recuperação com token na resposta e simulação de perfis só ficam disponíveis sem `DATABASE_URL` e com `NODE_ENV` ausente, `development` ou `test`. Ambientes desconhecidos fecham esse acesso. Configurar um banco, mesmo local ou de homologação, desativa essas facilidades antes de consultar usuários ou emitir tokens/sessões.

A importação de localStorage também permanece indisponível nesses ambientes persistentes: responde 501, sem alterar memória nem anunciar gravação no PostgreSQL. O fluxo persistente de importação continua pendente. A recuperação administrativa por `user:reset-password` permanece disponível para o operador autorizado, conforme procedimento acima.

## Gestão administrativa da equipe

`npm run user:manage` executa operações privilegiadas pelo host, exclusivamente com `DATABASE_URL`. Não há nova rota pública. Exige `ERP_USER_ACTION` (`create` ou `update`), `ERP_USER_EMAIL`, `ERP_USER_OPERATOR` (identificação do operador) e `ERP_USER_REASON` (motivo). A identificação informada é um registro declaratório; o acesso ao host deve comprovar quem executou o comando.

Para criar uma conta ativa, carregar também `ERP_USER_NAME`, `ERP_USER_PASSWORD` e `ERP_USER_ROLE`. Os perfis aceitos são `admin`, `gerente_comercial`, `vendedor`, `pcp_producao`, `financeiro` e `expedicao_qualidade`. O e-mail é normalizado e conta existente nunca é substituída. Obter a senha por entrada oculta ou pelo mecanismo de segredos da infraestrutura; não passá-la na linha de comando, no histórico ou em arquivo versionado.

Para alterar acesso, usar `update` com `ERP_USER_ROLE` e/ou `ERP_USER_ACTIVE` exatamente `true` ou `false`. Limpar as variáveis de criação (nome e senha) antes da atualização. O comando não altera nome/e-mail/senha nem exclui histórico. Mudança efetiva de perfil ou ativação revoga todas as sessões e tokens de recuperação; reativar não restaura sessões antigas. Repetir o estado já aplicado não revoga novas sessões nem duplica auditoria. O último administrador ativo não pode ser desativado ou perder esse perfil por este procedimento, inclusive em chamadas concorrentes.

Cadastro/alteração, revogações e auditoria confirmam na mesma transação. Falha de auditoria reverte tudo. O retorno não exibe senha/hash/token; a auditoria registra operador, motivo e estados de acesso anterior/novo. Remover as variáveis `ERP_USER_*` do shell ao terminar. A tela administrativa de equipe ainda está pendente; esta entrega fornece o procedimento operacional com proteção transacional. Não executar contra o banco operacional sem a autorização correspondente.


## Comunicação: limites operacionais

QR ilustrativo e reconexão simulada só estão disponíveis na demonstração local definida acima. Com banco configurado ou ambiente desconhecido, QR ausente responde 503 e reconexão responde 501, sem alterar canal nem agendar atualização fictícia. QR real já armazenado continua sendo retornado.

`POST /api/communication/send-template` responde 501 fora da demonstração local, antes de criar conversa ou enviar mensagem. O endpoint aceitava números/valores/comprovantes declarados pelo navegador e o texto afirmava liberação de corte sem conferir arte. Reativá-lo exige buscar proposta/OP/baixa no servidor, verificar os dois portões e confirmar o resultado do provedor. Envio manual e webhooks não foram alterados; recibos reais, deduplicação, RBAC de comunicação e atomicidade desse módulo continuam pendentes.


## Atendimento WhatsApp: confirmação na interface

A listagem de canais retorna somente campos de apresentação, sem `config` ou QR de pareamento. O QR é consultado pelo endpoint próprio; falha não gera imagem alternativa nem chama serviço externo de QR. A política de perfis para acessar comunicação e pareamento ainda requer homologação.

O compositor mantém rascunhos por conversa, bloqueia submissões simultâneas e só limpa o texto após resposta 201 com mensagem identificada e sem estado `failed`. Falha ou resultado incerto exige conferir o histórico antes de repetir: não há promessa de entrega única no provedor. O histórico distingue pendente, enviada ao provedor, entregue, lida e falha. Recibos autoritativos do provedor ainda estão pendentes.

Atalhos comerciais agora apenas preparam rascunho para revisão e envio manual. Não presumem chave PIX nem confirmam corte por resposta no WhatsApp. A baixa e a aprovação de arte continuam sendo registradas nos fluxos do ERP. Não confundir o texto do atendimento com comprovação de pagamento ou aprovação fabril.


## Envio de texto: limites e erros

O fluxo manual suporta somente texto não vazio de até 4.000 caracteres (limite técnico conservador da aplicação). Espaços nas extremidades são removidos antes de transmitir e registrar. `mediaUrl`, `mediaMimeType` ou `messageType` diferente de `text` são rejeitados com 400: o serviço não deve registrar anexo que não enviou.

Canal precisa estar ativo e com estado `connected`; Meta exige token e identificador de telefone e WA-AKG exige chave de API não vazia. Falhas de configuração/conexão conhecida retornam 503 antes de transmitir ou criar mensagem. Conversa ausente retorna 404. Exceções internas não são devolvidas ao navegador. Erros de transporte ficam registrados com texto genérico, sem detalhes de URL/credencial, e não geram auditoria afirmando envio concluído.

Timeout ou perda de resposta continuam podendo representar resultado incerto no provedor: conferir histórico antes de repetir. O estado `failed` indica ausência de confirmação neste fluxo, não comprovação de que o destinatário não recebeu. Recepção e envio ainda exigem transações/deduplicação e recibos autoritativos antes da homologação operacional completa.


## Recepção WhatsApp transacional e deduplicação

Configurar `META_WA_CHANNEL_ID` e `WA_AKG_CHANNEL_ID` com os UUIDs reais de `communication.channels` para cada webhook utilizado. O canal deve existir, estar ativo e ter o provedor correspondente. Não há escolha automática do primeiro canal. IDs demonstrativos só são usados sem banco na demonstração local. A assinatura/segredo de webhook continua obrigatória. Na Meta, `metadata.phone_number_id` precisa corresponder a `META_WA_PHONE_NUMBER_ID`; eventos de outro telefone são rejeitados.

Cada mensagem recebida exige identificador externo não vazio (até 100 caracteres). Dentro da mesma transação, o serviço consulta duplicidade por canal/ID, localiza a conversa por canal/telefone, grava mensagem, atualiza não lidas/prévia e registra auditoria. Reentrega retorna a mensagem já gravada sem novo contador ou evento. Falha reverte todas essas escritas; lote parcialmente recebido pode ser repetido pois mensagens já confirmadas são deduplicadas. O lock transacional global existente serializa concorrência entre processos; medir antes de otimizar.

A migração Drizzle `0005_conscious_jasper_sitwell` cria unicidade de conversa por `(channel_id, remote_jid)` e de mensagem por `(conversation_id, direction, external_id)`. Antes de aplicá-la, executar backup e ensaiar em cópia de homologação. Verificar duplicidades com:

```sql
SELECT channel_id, remote_jid, count(*) FROM communication.conversations
GROUP BY channel_id, remote_jid HAVING count(*) > 1;
SELECT conversation_id, direction, external_id, count(*) FROM communication.messages
WHERE external_id IS NOT NULL
GROUP BY conversation_id, direction, external_id HAVING count(*) > 1;
```

Se houver duplicidades, a criação de índices falha sem apagar/mesclar histórico. A reconciliação precisa preservar mensagens, vínculos e auditoria; não executar exclusão automática. A proteção do identificador por canal é aplicada pelo serviço sob lock; os índices fornecem proteção adicional por conversa. SQL administrativo direto não deve contornar esse procedimento.

Esta entrega não implementa download de mídias, recibos de saída, fila/outbox, entrega única ao provedor ou provisionamento de canais. A marcação `delivered` da entrada significa mensagem recebida pelo ERP; não representa recibo de entrega de mensagem enviada.


## Envio: intenção persistida e repetição segura

`POST /api/communication/conversations/:id/messages` exige `idempotency-key` UUID fora da demonstração local. A identidade autenticada e a chave determinam o ID da mensagem. Repetir mesma chave, contato e texto devolve o registro existente, inclusive `pending` ou `failed`, sem contatar novamente o provedor. Usar a chave para outro texto/conversa retorna 409. Identidade/perfil para auditoria vêm da sessão, não do corpo da requisição.

Antes da rede, uma transação grava mensagem `pending` e auditoria `WHATSAPP_SEND_REQUESTED`. Se essa transação falhar, nada é enviado. A chamada de rede ocorre depois do commit, sem manter lock/conexão. Outra transação grava o resultado, prévia da conversa e auditoria; se falhar, a intenção permanece pendente e não é retransmitida pela mesma chave. A conversa é recarregada para preservar não lidas recebidas durante o transporte.

A interface mantém a chave para repetir o mesmo rascunho na sessão do componente e não limpa texto em resultado pendente/falha. Recarregar a página perde essa chave em memória; conferir histórico antes de criar nova tentativa. Não há retry automático, worker/outbox ou entrega única garantida pelo provedor. `pending` pode significar que a rede não foi iniciada ou que o resultado não foi persistido; precisa de reconciliação operacional, ainda sem ferramenta automática. Não apagar pendentes para forçar envio.

O ID interno deixa de ser copiado como identificador externo fictício. Captura do ID real e recibos ainda estão pendentes; `sent` registra aceitação HTTP do transporte, não entrega ao destinatário. Mensagens anteriores mantêm seus dados históricos. Nenhuma migração nova é necessária nesta etapa.


## Reconciliação administrativa de envios pendentes

`npm run whatsapp:reconcile` é um procedimento privilegiado pelo host, com `DATABASE_URL`, sem rota pública e sem chamada ao provedor. Antes de usá-lo, interromper novos envios e conferir o resultado no provedor por meio operacional autorizado. Timeout ou ausência de recibo não provam falha: se o resultado continuar desconhecido, manter `pending`.

Localizar o ID interno do registro pendente por consulta controlada:

```sql
SELECT id, conversation_id, created_at, external_id
FROM communication.messages
WHERE direction='outbound' AND status='pending'
ORDER BY created_at LIMIT 100;
```

Carregar no ambiente `ERP_WA_MESSAGE_ID` (UUID interno), `ERP_WA_STATUS` (`sent` ou `failed`), `ERP_WA_OPERATOR`, `ERP_WA_REASON` e `ERP_WA_EVIDENCE` (referência do chamado/registro da verificação). Para `sent`, `ERP_WA_EXTERNAL_ID` é obrigatório e deve conter o ID real de aceitação obtido do provedor; não representa recibo de entrega/leitura. Para `failed`, deixar a variável de ID externo ausente e usar somente confirmação inequívoca da falha pelo provedor. O comando registra a declaração do operador; não consulta nem autentica a evidência externamente.

A identidade informada é declaratória e deve ser rastreada pelo controle de acesso ao host. Não colocar corpo de mensagem, telefone ou credenciais nas variáveis de motivo/evidência. Remover `ERP_WA_*` do shell ao terminar. O CLI não imprime conteúdo da mensagem nem erros internos de banco. Não executá-lo contra dados reais sem evidência operacional.

Alteração de estado/ID e auditoria `WHATSAPP_RECONCILED` confirmam na mesma transação. Falha reverte tudo; não há retransmissão. Só mensagens de saída pendentes podem mudar. Repetir estado/ID já aplicado não duplica auditoria. Estado final divergente é rejeitado. Aceitação pode atualizar a prévia somente se não houver mensagem mais recente; não lidas são preservadas. Resposta tardia do envio original respeita o estado já reconciliado. Recibos automáticos, consulta real ao provedor, ferramenta de reenvio autorizado e worker/outbox continuam pendentes.

Timeout/erro de transporte e resposta HTTP 5xx agora permanecem `pending`, com evento `WHATSAPP_SEND_UNCONFIRMED`. Resposta HTTP 4xx registra rejeição `failed`. Repetir a mesma chave nunca retransmite nenhum desses estados; o operador deve verificar o provedor antes de resolver um pendente.


## CRM: captura e atribuição de leads

A captura pública exige quantidade numérica inteira positiva, até o limite PostgreSQL integer (2.147.483.647), e não substitui ausência/erro por 50 peças. Isso valida a representação dos dados e não cria política de pedido mínimo. Contato, empresa, telefone e e-mail respeitam os limites do schema; categoria precisa existir no catálogo de tipos do ERP. E-mail não vazio exige formato válido. Observações são texto de até 10.000 caracteres. Campos são normalizados antes de alocar contador/gravar; estado e vendedor fornecidos pelo visitante são ignorados.

Atualização privada mantém RBAC comercial e só aceita os quatro estados existentes. Não pode marcar convertido sem proposta vinculada pelo fluxo comercial; a conversão lead→proposta continua pendente. Responsável exige UUID de conta ativa admin/gerente_comercial/vendedor, os perfis comerciais existentes; `sellerId: null` remove atribuição explicitamente. Não atribuir a usuário inativo ou de outro setor.

Atribuição é persistida em `assigned_seller_id` e devolvida na leitura. Estado/responsável e auditoria `LEAD_UPDATED` participam da mesma transação. Repetir estado/atribuição idênticos não grava novo evento. A captura `LEAD_CAPTURED` passa a referenciar UUID interno do lead, como as alterações; eventos antigos com número comercial permanecem históricos. Falha de auditoria reverte gravação e, no PostgreSQL, contador de captura.

Não há migração nova nesta correção. Proteção distribuída contra abuso da captura pública, política de leitura, conversão comercial completa e interface de gestão dos leads ainda exigem entrega/homologação.


## Diagnóstico operacional sem conteúdo privado

Falhas tratadas pelo middleware da API registram JSON com `event`, `context`, `incidentId` e `code`. O código pertence a uma lista fechada de SQL/rede/configuração; outros valores viram `UNCLASSIFIED`. Não são serializados mensagem arbitrária da exceção, stack, cause, consulta, parâmetros, corpo, query string, cookies ou headers. O middleware devolve `X-Diagnostic-Id` gerado no servidor para correlacionar a falha com o log, preservando mensagens HTTP genéricas e validações InputError controladas pela aplicação.

O mesmo diagnóstico é usado no catch de inicialização, conexão com banco, erros do repositório de usuários, comparação de senha, limpeza de sessões e falhas inesperadas dos CLIs `admin:create`, `db:migrate` e `user:reset-password`. Falta de DATABASE_URL em produção gera código `DATABASE_URL_MISSING` e mantém início abortado. Erros conhecidos de entrada dos CLIs continuam exibindo apenas mensagens controladas, sem valores fornecidos pelo operador.

Esses logs não substituem a trilha de auditoria transacional nem implementam monitoramento/retention. Ao investigar, usar o identificador, contexto e código; não reativar serialização completa de exceções em ambiente com dados reais. Revisar também logs do proxy, PostgreSQL, provedor e plataforma de hospedagem, que não são configurados por esta mudança. Nenhum histórico de log foi apagado ou analisado retroativamente.


## Estoque: precisão e conflito de movimentação

As rotas de cadastro/edição e movimentação usam a capacidade já definida pelo PostgreSQL `numeric(10,2)`: até 99.999.999,99 e duas casas decimais. Valores de entrada que exigiriam arredondamento ou excederiam essa capacidade são rejeitados. Ajuste aceita delta negativo dentro da capacidade, mantendo saldo final não negativo. Isso alinha o contrato ao schema existente; não define política comercial nem altera unidade/escala do banco.

Resultados de somas/subtrações são normalizados em duas casas antes de persistir/responder, evitando resíduos binários como `0.30000000000000004`. Estouro de saldo final reverte a operação. Se o negócio exigir mais precisão, será necessária evolução formal do schema e dos contratos; não truncar dados silenciosamente.

A gravação de movimentação é inserção estrita: colisão de UUID ou número comercial gera conflito e reverte saldo/evento/auditoria na transação existente. Não há mais `ON CONFLICT DO NOTHING` nesse histórico. O contrato de repetição da rota de movimentação é descrito abaixo; colisão de número comercial continua sendo erro de integridade. Não tentar reparar colisão descartando histórico.

Fornecedor/localização opcionais respeitam os limites SQL (120/80 caracteres), sem rótulos de homologação ou localização presumida no cadastro/leitura. Dados históricos já gravados não são reescritos. Motivo/documento da movimentação recebem validação de texto/limites; leitura do histórico preserva `operatorId`, antes omitido no mapeamento.

Conflitos SQL encapsulados pelo Drizzle são classificados por código permitido em até três níveis de causa; detalhes continuam privados. Colisão de unicidade responde 409 usando o mesmo middleware validado na suíte PostgreSQL.


## Movimentação de estoque: chave de repetição

`POST /api/inventory/movements` exige `idempotency-key` UUID fora da demonstração local sem banco. A identidade autenticada e a chave determinam o UUID interno do movimento, sem tabela/migração adicional. A consulta de repetição, alteração de saldo, contador, inserção do movimento e auditoria usam a mesma transação/lock global existente.

Primeira confirmação responde 201. Repetição da mesma chave com dados normalizados iguais (item, OP opcional, tipo, quantidade, motivo e documento) responde 200 com `replayed:true` e o evento original, sem novo saldo/contador/auditoria. O item na resposta é o saldo atual, podendo refletir operações posteriores; a movimentação continua sendo a original. Dados diferentes com a mesma chave respondem 409. Entrada inválida continua respondendo 400. Falha/rollback não consome a chave e permite retry compatível.

O cliente deve gerar uma chave por intenção e conservá-la ao reenviar após erro de rede. `api.createStockMovement(payload, chave)` aceita explicitamente a chave; omiti-la gera uma nova a cada chamada e não protege retries feitos como novas intenções. O cliente não faz retry automático. Não há cache privado em localStorage. Sem chave, somente demonstração local preserva o comportamento anterior.

O registro de movimento conserva a chave derivada enquanto o histórico existir; não há expiração automática. A proteção vale para essa rota, não para cadastro/edição de item, nem para consumidores que troquem a chave no reenvio. RBAC é aplicado também no replay. Não usar a remoção do histórico para forçar nova execução.


## Financeiro: contrato manual e retorno da liquidação

Cadastro manual exige valor numérico positivo, mínimo técnico de um centavo, com até duas casas e dentro da capacidade numeric(12,2) existente (9.999.999.999,99). Valor com precisão excessiva é rejeitado em vez de arredondado silenciosamente. Categoria/referência opcionais respeitam limites SQL de 60 caracteres e não recebem categoria de venda fictícia. Títulos de pedido continuam exclusivos do fluxo de conversão; cadastro manual não vincula produção/proposta.

A URL de evidência da baixa deve ser absoluta HTTPS, sintaticamente válida e sem usuário/senha embutidos. Query de assinatura é permitida. Essa validação não verifica existência, autenticidade, propriedade, conteúdo ou privacidade do arquivo e não realiza download; upload privado S3 e validação de evidência ainda estão pendentes. Não tratar URL válida como prova bancária automática.

Leitura da transação preserva confirmedById além do nome do operador. A mensagem de confirmação distingue entrada de saldo e não presume percentual fixo. Baixar saldo não anuncia sinal confirmado; continua sem liberar corte, que depende também dos portões existentes. Título já pago devolve sua confirmação original, sem substituir evidências ou duplicar auditoria. Erros de validação/auditoria mantêm a reversão transacional existente.


## Cadastro financeiro manual: repetição segura e exclusão

POST /api/finance/transactions operacional exige idempotency-key UUID. A chave e o usuário autenticado identificam uma intenção; conteúdo normalizado (tipo, subtipo, descrição, categoria, valor, vencimento, pagamento e referência) gera fingerprint SHA-256. Primeira confirmação retorna 201; replay igual retorna o título atual com 200, sem contador/título/auditoria novos. Conteúdo diferente na mesma chave retorna 409. Título já liquidado não volta a pendente no replay.

A confirmação da solicitação usa core.event_log existente, com event_type FINANCE_MANUAL_CREATED, status completed e payload limitado a fingerprint/entityId. É um registro de comando concluído, não tarefa pendente de outbox. Título, contador, registro de chave e auditoria confirmam na mesma transação. Rollback permite retry da chave.

O registro de chave não tem FK nem exclusão em cascata para o título: se um título manual pendente for excluído pelo procedimento existente, replay retorna 410 e não o recria. Não apagar esses registros por limpeza genérica de eventos concluídos; sua conservação é necessária à proteção contra reenvio. Não há expiração automática nesta entrega. Backup/restauração da CI compara também os IDs/payloads desses registros.

A tela conserva a chave ao reenviar os mesmos dados após falha e bloqueia submissão simultânea. Alterar dados, abrir novo formulário ou remontar/recarregar a tela gera outra intenção/chave. Conferir histórico se uma confirmação anterior for desconhecida. api.createTransaction(payload,chave) aceita chave explícita; omissão gera nova a cada chamada. Não há retry automático ou localStorage privado. Chaves diferentes não são deduplicadas.

A proteção é do cadastro manual, sem mudar conversão de propostas ou baixa. Formulário e snapshot de chave permanecem apenas na memória do componente. A política de retenção definitiva dos registros de chave precisa acompanhar a operação; não limpar indiscriminadamente core.event_log.


## Exclusão de cadastros com vínculos

A API de exclusão de clientes retorna 409 quando houver proposta, OP ou conversa vinculada. Conversa impede remoção mesmo sem proposta/produção, evitando perda silenciosa de client_id por SET NULL. Proposta bloqueada ou vinculada a OP, título financeiro ou lead convertido também retorna 409, preservando quote_id/converted_quote_id.

As verificações usam EXISTS no PostgreSQL, dentro da mesma transação/lock das exclusões. Cliente não carrega mais coleções completas de propostas e OPs para verificar histórico. Registros sem esses vínculos continuam no fluxo de exclusão já existente, com auditoria na mesma transação; falha de auditoria reverte remoção e dependências em cascata.

Não há remoção/desvinculação/anonimização automática nem alteração de FKs nesta entrega. SQL administrativo direto pode contornar a API e exige procedimento próprio. Definição de retenção/anonimização e eventual arquivamento permanecem pendentes; esta proteção preserva relações existentes, sem implementar política geral de eliminação de dados. O segmento do cliente é validado em até 60 caracteres, conforme schema; corpo ausente recebe validação de entrada em vez de falha interna.


### Exclusão de ordens de produção

OP só pode seguir o fluxo existente de exclusão quando estiver aguardando liberação, sem proposta/item vinculado, aprovação de arte, registros de confirmação/comprovante ou referências de financeiro, movimentos de estoque, custódias de facções e converted_order_id em propostas. Essas referências retornam 409 antes do DELETE, impedindo SET NULL e referências órfãs. Consulta EXISTS usa a mesma transação/lock; falha de auditoria reverte exclusão livre.

Custódias são verificadas no PostgreSQL; não há módulo de custódia em memória. Sem mudança de schema/FKs ou limpeza de relações históricas. A proteção aplica-se à API, não a SQL administrativo direto. Não define cancelamento, estorno, arquivamento ou retenção.

### Edição da ficha da OP: custo e equipe

PUT /api/orders/:id valida custo da facção no intervalo não negativo da coluna numeric(10,2), até 99.999.999,99 e com no máximo dois decimais. Rejeita 1.005 em vez de deixar o PostgreSQL arredondar; não define preço mínimo comercial. Campo ausente continua zero, como no contrato anterior. Corpo ausente resulta em 400. O formulário informa o mesmo teto.

Equipe vazia é persistida e recarregada vazia, inclusive em OP criada pela conversão. O repositório não atribui mais a equipe fictícia padrão quando o usuário não informou uma. NULL histórico é lido como vazio; nomes anteriormente gravados não são alterados automaticamente, e o default SQL não muda nesta entrega. Edição mantém autorização existente, portões separados e rollback em falha de auditoria.

### Aprovação de arte: reenvio preserva confirmação original

POST /api/orders/:id/approve-art confirma somente quando artApproved ainda é falso. Já aprovado retorna 200, alreadyApproved=true e a OP atual, sem trocar responsável, data, arquivo na auditoria, notas técnicas ou updatedAt, mesmo se o reenvio trouxer outro nome/arquivo ou não trouxer corpo. Não significa que os novos dados foram aceitos; a resposta devolve a confirmação existente. A rota continua exigindo permissão de aprovação.

A primeira confirmação exige nome válido; corpo ausente retorna 400. Aprovação e auditoria usam a mesma transação/lock, de modo que chamadas concorrentes criam uma confirmação e uma auditoria. Falha de auditoria reverte a OP e permite retry. A ação não confirma entrada nem muda etapa. Revisão/substituição de arte e revogação não são implementadas por esta rota; exigem fluxo explícito futuro. Não corrige metadados de aprovações históricas incompletas e não autentica o aceite externo, arquivo ou identidade do cliente. S3 privado e evidência verificável permanecem pendentes.

### Etapa atual: reenvio sem regravar datas

POST /api/orders/:id/advance-stage valida targetStage e os portões existentes antes de verificar se a OP já está nessa etapa. Mesmo destino retorna 200 com alreadyAtStage=true e a OP atual, sem alterar completionDate, updatedAt ou inserir ADVANCE_STAGE. Isso preserva a data de uma entrega feita em dia anterior. Corpo ausente recebe 400. Uma transição real continua alterando etapa/data e auditando na mesma transação; falha de auditoria reverte a alteração.

A proteção da etapa atual é complementada pela revisão obrigatória descrita abaixo, que bloqueia transições de leitura antiga. Não é chave durável de comando e não define nova ordem obrigatória de etapas ou política de reabertura. Nenhum portão é dispensado, inclusive em registros históricos inconsistentes. Não corrige datas/históricos já alterados por reenvios anteriores.

### Auditoria de tentativas bloqueadas pelo portão

O bloqueio de advance-stage usa rejeição auditada: a primeira UoW faz rollback, libera cliente/lock e então uma segunda UoW registra GATE_BYPASS_ATTEMPT. A resposta 422 só sai após essa auditoria confirmar. Os dados do evento são o snapshot observado na tentativa, não uma releitura posterior da OP. Chamadas bloqueadas distintas geram eventos distintos, inclusive reenvios; não há deduplicação de tentativas.

rejectWithAudit é mecanismo interno de atomic para rejeições 4xx explícitas. Seu callback deve apenas registrar a tentativa, nunca reaplicar a operação rejeitada. Rejeições comuns continuam fazendo rollback sem executar callback. Falha na segunda UoW também reverte sua escrita e passa ao tratamento seguro de erro; a OP não avança. Não é permitido confirmar a transação de negócio só para conservar auditoria.

As duas transações não formam uma confirmação única: queda do processo entre rollback e auditoria pode deixar uma tentativa sem evento e sem resposta confirmada; não há outbox/retry automático nessa entrega. Não garante registrar todas as tentativas em caso de falha do banco/processo e não recupera eventos perdidos no histórico. O segundo commit registra apenas a observação da tentativa bloqueada, sem garantir que os gates continuam iguais nesse instante.

### Precisão das propostas antes da persistência

Criação de proposta valida a capacidade das colunas existentes: componentes de custo e preços unitários numeric(10,2), perda técnica numeric(5,2), markup e margem numeric(6,2), totais numeric(12,2) e quantidade total do item até 2.147.483.647 (integer). Entradas exigem no máximo duas casas decimais; não são arredondadas silenciosamente pelo banco. Valores derivados usam o arredondamento já existente do motor e depois são conferidos contra a capacidade SQL, incluindo somatórios entre itens.

Validação ocorre antes da reserva do número para essas entradas inválidas. Corpo ausente e item nulo retornam 400. Fórmula de markup, sinal, autorização de desconto e políticas comerciais permanecem iguais. Margem negativa representável é aceita pela validação técnica; valores fora de numeric(6,2) exigem tratamento/schema próprio futuro, não truncamento. Não muda o schema nem reconcilia valores históricos já arredondados. Outros contratos da proposta, como prazos e integração externa, não recebem homologação por esta verificação.

### Configuração do pool sem enfraquecimento implícito de TLS

O pool valida DATABASE_SSL_MODE, DATABASE_POOL_MAX e o escape de certificado antes de criar conexões. TLS é definido por DATABASE_SSL_MODE/DATABASE_CA_CERT; query SSL da URL não pode sobrescrever a política. sslmode redundante compatível é retirado da URL antes do pg; demais opções SSL/compatibilidade ou conflitos impedem início. verify-full sempre verifica certificado, e disable é passado explicitamente ao driver para não herdar PGSSLMODE.

Há escape inseguro explícito somente em require, sem CA. Fora dele, TLS solicitado valida certificado também em desenvolvimento. Erros de configuração usam código seguro DATABASE_CONFIG_INVALID. Ver [guia Docker](DOCKER_DEPLOY.md) para compatibilidade e restrições; não equivale a handshake TLS homologado no host contratado e não muda o contrato libpq dos scripts Bash de backup.

### Privacidade da auditoria de acesso e chave do rate limit

Bloqueios requireAuth/requireRole registram somente método conhecido e template de rota definido no servidor. Não copiam originalUrl, query string, parâmetros de caminho, corpo, cookies ou Authorization para esses eventos. Antes da resolução da rota (como router.use(requireAuth)), usam protected-resource; esse marcador perde o detalhe do módulo/caminho para evitar gravar entrada arbitrária. Identidade autenticada, perfil e IP continuam no evento conforme o contrato de auditoria existente.

Rate limit usa template da rota e IP, não o caminho enviado pelo cliente. Variações de caixa aceitas pelo Express, query ou valores de parâmetros não abrem novos contadores para o mesmo template. Limites, janela, status 429 e Retry-After permanecem iguais. Registrar o limitador na rota; se usado antes de resolver rota, o marcador fixo compartilha contador entre requisições da instância. Uma mesma instância reutilizada em mounts com template idêntico também compartilha contador; usar instâncias distintas quando forem proteções distintas.

A proteção é desses middlewares. Não apaga logs históricos, não anonimiza eventos de negócio e não configura logs do proxy/provedor. Restringir acesso à auditoria e definir retenção/revisão de dados históricos antes da liberação. Rate limit continua em memória por processo; implantação com múltiplas instâncias ainda precisa de solução/topologia homologada.

### Prazos de produção e formato de data

Criação da proposta valida o cabeçalho antes de reservar número. Prazo deve ser inteiro positivo representável em integer e produzir data válida no formato AAAA-MM-DD suportado pela API (anos 0001 a 9999). O ano 0000 é recusado pelo validador de datas, pois PostgreSQL não o aceita nesse formato. Data explicitamente vazia não é substituída por hoje.

A conversão refaz a validação usando o instante da conversão, antes de numerar/gravar OPs ou títulos. Proposta histórica com prazo inválido recebe 400 sem efeitos parciais; não é corrigida automaticamente. Conversão já concluída e com vínculos íntegros devolve as ordens existentes pelo fluxo idempotente, sem recalcular suas datas.

O cálculo permanece dias corridos de 24h e usa o comportamento UTC existente. Não impõe máximo comercial de prazo, calendário de dias úteis, feriados, nova política de validade ou reabertura. O limite é técnico de representação, e datas históricas não são alteradas. A data de criação/prazo contratual definitivo e calendário fabril ainda dependem de homologação de negócio.

### Coerência financeira antes da conversão

Antes de numerar/gravar OPs e títulos, a conversão exige total, sinal e saldo positivos, em centavos e dentro da capacidade numeric(12,2); total deve coincidir com a soma dos totais dos itens. Percentual armazenado deve ser 50, sinal deve coincidir com metade arredondada pelo cálculo existente e saldo deve ser o restante. Divergência retorna 409/QUOTE_FINANCIAL_CONFLICT, sem alterar proposta, OP, título ou contador.

A leitura conserva o percentual efetivamente armazenado; não o substitui silenciosamente por 50. O tipo da entidade permite representar histórico divergente, mas a criação continua exigindo 50 e a conversão bloqueia divergência. Não há saneamento automático de proposta histórica nem fluxo novo de revisão/estorno.

Uma proposta zerada ou de um centavo não permite gerar os dois títulos positivos exigidos pela constraint existente e é bloqueada na conversão. Isso não cria preço mínimo comercial ou altera a aceitação de rascunhos. Totais ímpares em centavos mantêm o arredondamento anterior: três centavos geram dois de sinal e um de saldo. Não muda markup, comissão, percentual ou política de cobrança. Conversão já concluída e com vínculos íntegros continua no replay, sem recalcular títulos ou reconciliar histórico.

### Integridade estrutural do replay de conversão

A existência de uma OP isolada não confirma conversão completa. Ao encontrar OP, recebível de sinal/saldo ou metadado de conversão, a API confere proposta bloqueada/convertida, ponteiro principal válido, uma OP por item da versão atual com cliente/quantidade compatíveis e dois recebíveis únicos (entrada/saldo), positivos, vinculados às OPs e com valores iguais aos da proposta. Recebíveis são consultados por quote_id, sem carregar o financeiro inteiro. Outros tipos de lançamento não são tratados como títulos da conversão.

Divergência retorna 409/QUOTE_CONVERSION_INCOMPLETE sem reservar números, reconstruir registros ou alterar estados/auditoria. Inclui OP antiga sem quote_item_id, título ausente/desvinculado, versão divergente ou títulos sem OPs. Exige reconciliação histórica específica; não tentar recriar silenciosamente parte de uma conversão.

Replay íntegro retorna OP principal apontada pela proposta, conjunto de OPs e financeTransactions atuais. Título já pago conserva status/evidência; não volta a pendente e a auditoria de conversão não se repete. Etapas, datas, pagamentos e demais estados não são recalculados. Essa verificação estrutural não autentica evidências nem substitui reconciliação financeira/operacional completa, política de estorno ou correção de dados históricos.

### Revisão obrigatória na mudança de etapa da OP

Migração 0006_order_revision adiciona revision inteiro com valor inicial 1 e trigger BEFORE UPDATE que incrementa a revisão a cada atualização da OP, inclusive metadados, aprovação, financeiro e SQL direto com trigger ativo. Rollback reverte também o incremento. Leitura e respostas de gravação expõem a revisão efetiva. Não usar updatedAt como token: timestamps podem coincidir ou perder precisão no transporte.

POST /api/orders/:id/advance-stage exige expectedRevision inteiro positivo obtido na leitura. Ausência/tipo inválido retorna 400. Para destino diferente da etapa atual, revisão divergente retorna 409/ORDER_REVISION_CONFLICT sem alteração/auditoria de avanço. A leitura de mutação mantém FOR UPDATE na linha até commit/rollback, além da UoW existente. Duas etapas diferentes com a mesma revisão têm um vencedor; ação antiga não volta a aplicar após ciclo de ida/volta.

Os gates continuam obrigatórios. Mesmo destino, após validar token e gates, devolve a OP atual como alreadyAtStage sem escrever, mesmo que a revisão recebida seja antiga; isso não aplica transição. A revisão não é uma chave durável de comando e não reproduz uma resposta histórica. Não define sequência comercial de etapas, reabertura, estorno ou política nova de produção. Outros editores não recebem precondição de escrita por esta entrega, mas suas gravações invalidam revisões antigas da mudança de etapa.

A interface envia a revisão que exibiu; em conflito recarrega os dados e informa falha, sem repetir a ação automaticamente. Revisão ausente na tela também exige nova leitura antes de outra ação. Atualizar clientes da API para enviar o novo campo; não buscar uma revisão nova e repetir silenciosamente uma intenção antiga.

Para destino diferente da etapa atual, o conflito de revisão é verificado antes dos gates. Isso permite à interface recarregar uma leitura antiga mesmo quando os gates atuais não permitem avanço. Com revisão atual, os gates continuam retornando 422 e registrando a tentativa bloqueada. No-op continua verificando gates antes de devolver estado atual. Nenhum desses caminhos aplica transição automaticamente.

### Revisão na edição da ficha

PUT /api/orders/:id também exige expectedRevision inteiro positivo da leitura. O repositório mantém lock de linha; revisão antiga retorna 409/ORDER_REVISION_CONFLICT antes de modificar campos. A interface envia a revisão do formulário, recarrega dados no conflito e conserva o formulário sem reenviar. Fechar e reabrir permite revisar a ficha atual. Não substituir o token por revisão recém-consultada para aplicar silenciosamente campos antigos. Clientes próprios precisam enviar o novo campo; usa a migração 0006 existente.


### Continuação: caractere nulo nos campos textuais

O validador compartilhado `text` recusa U+0000 com HTTP 400 antes da persistência, tanto em campos obrigatórios quanto opcionais. PostgreSQL não aceita esse caractere em text/varchar. O conteúdo não é truncado nem saneado silenciosamente; acentos, emoji, quebras de linha e tabulações continuam aceitos nos limites existentes. A regra alcança os campos que passam por esse validador; não constitui validação de todos os payloads JSON nem migração de histórico.

Validação local: 106 testes, tipagem e build aprovados. Novo cenário PostgreSQL verifica rejeição de criação/edição sem alterar cadastro ou auditoria e persistência de Unicode válido; execução pela CI ainda pendente. Sem migração nova; bloqueios de produção anteriores permanecem.


### Continuação: estrutura das personalizações da proposta

A criação de propostas valida a lista de personalizações antes de reservar numeração. Cada entrada precisa ser um objeto com identificador não vazio, tipo previsto por CustomizationItem e custo numérico finito não negativo; descrição, posição e parceiro passam pelo validador textual. Campos textuais opcionais ausentes são normalizados para vazio; parceiro ausente permanece omitido. Lista ausente continua sendo vazia; null, objetos no lugar da lista e entradas malformadas recebem HTTP 400. Campos extras não são persistidos.

A mudança impede novos registros que quebravam a impressão ao acessar type.replace ou renderizar objetos. Personalizações válidas são persistidas na proposta e copiadas para a OP. O detalhamento não substitui customizationUnitCost no motor de preços nem define nova regra de custeio. Dados históricos não são saneados automaticamente; armazenamento privado e aprovação de evidências continuam pendentes.

Validação local: 108 testes, tipagem e build aprovados. Novo teste PostgreSQL cobre preservação de contador, proposta e auditoria na rejeição, além da recarga da personalização na proposta e na OP. CI desta continuação ainda pendente. Sem migração nova ou alteração em produção.


### Continuação: limite bcrypt também na autenticação

A comparação de senhas recusa entradas maiores que 72 bytes em UTF-8 antes de chamar bcrypt, alinhando login ao limite já aplicado na criação e redefinição. Antes, uma senha de exatamente 72 bytes podia autenticar mesmo acrescida de um sufixo ignorado pela biblioteca. A senha exata permanece válida, inclusive quando contém caracteres multibyte. Login com entrada excedente retorna a resposta genérica de credenciais inválidas (401), registra falha e não cria sessão/cookie. Não há truncamento ou normalização da senha.

Não são aplicados retroativamente os critérios de força na comparação, nem alterados hashes ou sessões existentes. Contas históricas criadas por ferramentas externas com senhas acima do limite precisam de redefinição pelo procedimento administrativo existente; não presumir que o excedente fazia parte do segredo verificado por bcrypt.

Validação local: 110 testes, tipagem, build e diff-check aprovados. Novo cenário PostgreSQL verifica rejeição sem sessão, evento de falha, preservação do hash e sucesso com a credencial exata. CI desta continuação pendente. PR #34 teve CI completa aprovada em https://github.com/enlaceslz/defardas/actions/runs/40967384070. Sem migração nova, alteração de credenciais reais ou liberação dos bloqueios de produção.


### Continuação: rollback do perfil institucional

O perfil no modo local passa a integrar as coleções da unidade transacional. Falha da auditoria reverte primeira gravação e edição, evitando erro HTTP com configuração já modificada. PostgreSQL mantém a gravação e auditoria na mesma transação, agora com teste explícito de rollback. Corpo ausente recebe 400 por validação de campos obrigatórios. Não muda visibilidade pública, campos ou regras do perfil.

Validação local: 111 testes, tipagem, build e diff-check aprovados; CI desta continuação pendente. Teste PostgreSQL confere perfil, timestamp e contagem da auditoria após falha. Sem migração nova ou alteração em produção. CI anterior aprovada no PR #35: https://github.com/enlaceslz/defardas/actions/runs/40968022232. Bloqueios operacionais anteriores permanecem.


### Continuação: entradas de autenticação

Login, recuperação e redefinição tratam corpo ausente como entrada inválida (400), sem erro de desestruturação. Login e recuperação validam e-mail com o validador textual compartilhado e limite de 150 caracteres do cadastro, rejeitando U+0000 e valores vazios após trim antes de consultar usuários. E-mail é normalizado por trim/lowercase, como já ocorria na busca do repositório; não se altera a senha. Respostas de validação não ecoam o valor recebido. Limites de requisições permanecem aplicáveis, inclusive a entradas inválidas.

Validação local: 112 testes, tipagem, build e diff-check aprovados; teste PostgreSQL acrescentado para preservação de sessões, tokens e auditoria nas rejeições. CI desta continuação pendente. CI anterior: PR #36, https://github.com/enlaceslz/defardas/actions/runs/40968720112. Sem migração nova ou alteração em produção; entrega de recuperação por e-mail e demais bloqueios operacionais continuam pendentes.


### Continuação: parâmetros da consulta de auditoria

GET /api/audit/logs exige entityName e entityId juntos quando há filtro. Ambos devem ser strings não vazias de até 60 caracteres, compatíveis com a trilha armazenada. Filtro parcial, array, objeto, repetição de parâmetros ou U+0000 retorna 400 antes do serviço; não amplia silenciosamente a busca para a lista geral. Sem filtros, a consulta geral continua disponível apenas a administradores autorizados.

limit ausente mantém 100; quando informado, precisa ser uma string decimal canônica entre 1 e 500. Zero, negativos, frações, notação exponencial, zeros iniciais e valores acima do máximo passam a receber 400 em vez de coerção/clamp. Clientes próprios precisam respeitar esse contrato; as chamadas existentes da SPA usam 10/30/50 e permanecem compatíveis.

Validação local: 113 testes, tipagem, build e diff-check aprovados. Novo cenário PostgreSQL confere rejeições e isolamento do filtro; CI desta continuação pendente. CI anterior: PR #37, https://github.com/enlaceslz/defardas/actions/runs/40969398612. Sem migração nova, mudança de permissões ou deploy; bloqueios operacionais permanecem.


### Continuação: vínculo da movimentação com OP

POST /api/inventory/movements valida itemId e productionOrderId opcional no formato UUID canônico, aceitando caixa alta e normalizando para minúsculas. Formato inválido recebe 400 antes de consultas por identificador. Para nova movimentação, OP informada precisa existir: ausência recebe 404 antes de alterar saldo ou reservar número. Evita vínculo órfão no modo local e alinha a entrada à FK existente no PostgreSQL.

A OP permanece opcional e não há nova restrição por etapa ou tipo de movimento. Replay íntegro continua devolvendo movimentação e saldo atuais sem nova gravação. Não corrige vínculos históricos nem implementa custódia por parceiro.

Validação local: 114 testes, tipagem, build e diff-check aprovados. Cenário PostgreSQL confere saldo, timestamp, movimentos, contador e auditoria intactos nas rejeições, além de vínculo válido com UUID em maiúsculas. CI desta continuação pendente. CI anterior: PR #38, https://github.com/enlaceslz/defardas/actions/runs/40969900914. Sem migração nova ou deploy; bloqueios operacionais permanecem.


### Continuação: vínculos obrigatórios na baixa de títulos de pedido

Nova baixa de entrada_pedido/saldo_entrega exige quoteId com proposta existente e productionOrderId pertencente às OPs dessa proposta. Ausência ou divergência retorna 409 antes de marcar pago, atualizar OP ou auditar sucesso. Valor precisa ser finito, positivo, representável em centavos e exatamente igual à parcela da proposta; não se arredonda valor histórico para passar na comparação.

Títulos manuais continuam com fluxo independente. Replay de título já pago permanece leitura da confirmação anterior, sem nova baixa. A checagem não substitui a reconciliação integral da conversão (todos os itens e títulos), nem valida autenticidade do comprovante. Dados históricos não são reparados automaticamente.

Validação local: 115 testes, tipagem, build e diff-check aprovados. Cenário PostgreSQL remove separadamente os vínculos e confere título, OPs e auditoria intactos, depois valida baixa com vínculos restaurados. CI desta continuação pendente. CI anterior: PR #39, https://github.com/enlaceslz/defardas/actions/runs/40970398395. Sem migração nova, merge ou deploy; bloqueios operacionais permanecem.


### Continuação: integridade estrutural antes da baixa

Novas baixas de entrada_pedido/saldo_entrega reutilizam o critério estrutural do replay de conversão: proposta convertida/bloqueada, vínculo principal, uma OP por item e versão/cliente/quantidade compatíveis, mais os dois recebíveis únicos com vínculos e valores coerentes. Divergência retorna 409/QUOTE_CONVERSION_INCOMPLETE antes de pagar ou liberar OP. O helper compartilhado evita divergência entre os fluxos. Consultas financeiras passam a usar quote_id, sem carregar o financeiro inteiro.

Replay de título já pago permanece leitura da confirmação anterior. A validação não repara histórico, autentica comprovante ou redefine política de estorno; estados operacionais e financeiros além desses vínculos não são reconciliados automaticamente. Fixtures históricas incompletas exigem análise antes de nova baixa.

Validação local: 116 testes, tipagem, build e diff-check aprovados. Testes HTTP cobrem quatro divergências; PostgreSQL cobre versão de OP e saldo ausente do conjunto, com preservação integral de títulos/OPs/auditoria. CI desta continuação pendente. CI anterior: PR #40, https://github.com/enlaceslz/defardas/actions/runs/40970984858. Sem migração nova ou deploy; bloqueios operacionais permanecem.


### Continuação 30/10: revisão na primeira aprovação de arte

POST /api/orders/:id/approve-art exige expectedRevision inteiro positivo da leitura quando ainda não há aprovação. Lock de linha mantém comparação e gravação na mesma transação. Revisão antiga recebe 409/ORDER_REVISION_CONFLICT antes de alterar aprovação, notas, revisão ou auditoria. A SPA envia a revisão exibida e recarrega conflito sem repetir a aprovação. Clientes próprios precisam enviar o campo; usa a migração 0006 existente.

Aprovação já registrada continua retornando alreadyApproved com os dados originais, inclusive com revisão antiga ou corpo ausente. Não se trata de nova aprovação ou substituição do responsável. Isso protege a leitura da ficha, mas não cria versionamento de arquivos, revogação de arte ou prova de autorização do cliente; armazenamento privado e evidência permanecem pendentes.

Validação local: 117 testes, tipagem, build e diff-check aprovados. Cenário PostgreSQL cobre conflito sem gravações e aprovações concorrentes com único incremento de revisão. CI desta continuação pendente. CI anterior: PR #41, https://github.com/enlaceslz/defardas/actions/runs/41032493651. Sem migração nova, merge ou deploy.


### Continuação 30/10: histórico na exclusão de material

Exclusão de item verifica existência de movimentos e custódias por item_id com EXISTS, sem carregar/ordenar todo o histórico de movimentações. Custódias encerradas também impedem remoção, mesmo sem saldo atual. A FK PostgreSQL já preservava esses vínculos; a API agora responde explicitamente 409 com a regra de saldo/histórico antes da tentativa de DELETE.

No modo local, a consulta percorre movimentos até encontrar o vínculo; custódias continuam disponíveis apenas no PostgreSQL, sem criar módulo fictício local. Item livre mantém exclusão auditada e rollback se a auditoria falhar. Não apaga histórico, altera saldos ou cria regra de descarte. Não há alegação de capacidade sem ensaio de carga.

Validação local: 118 testes, tipagem, build e diff-check aprovados. Teste PostgreSQL cobre custódia devolvida_total com saldo zero, preservação do item/vínculo/auditoria e exclusão de fixture livre, sem listar todos os movimentos. CI desta continuação pendente. CI anterior: PR #42, https://github.com/enlaceslz/defardas/actions/runs/41033356198. Sem migração nova, merge ou deploy.


### Continuação 30/10: saldo observado no ajuste pela SPA

O formulário de estoque envia expectedPhysicalStock capturado ao abrir a ficha; atalhos capturam o saldo exibido ao iniciar a ação. App não substitui essa precondição pelo saldo mais recente do estado global durante o salvamento. Uma recarga da lista enquanto o formulário está aberto não autoriza silenciosamente um ajuste antigo. Em 409, recarrega dados sem repetir automaticamente a alteração.

O contrato e a comparação do backend permanecem: quando saldo desejado difere do saldo atual, expectedPhysicalStock precisa coincidir com o observado no banco. Não é uma revisão completa do item e não resolve mudanças de metadados ou saldo que sai e volta ao mesmo valor (ABA). Formulário que recebe falha permanece aberto; fechar/reabrir permite revisar os dados atuais. Sem chave durável para esse comando ou alteração das regras de ajuste compensatório.

Validação local: 121 testes, tipagem, build e diff-check aprovados. Testes de interface cobrem recarga com formulário aberto e atalho; HTTP/PostgreSQL conferem conflito sem alterar metadados, saldo, movimentos e auditoria, seguido de gravação com precondição atual. CI desta continuação pendente. CI anterior: PR #43, https://github.com/enlaceslz/defardas/actions/runs/41035146812. Sem migração nova, merge ou deploy.


### Continuação 30/10: cadastro de material sem valores demonstrativos

Novo material na SPA inicia saldo, mínimo e custo em zero, fornecedor/localização vazios. Removidos os valores demonstrativos 200/100/25 e os textos de fornecedor/prateleira que podiam ser enviados como reais. Código não é editável e informa geração ao salvar, conforme numeração já atribuída pela API. Edição conserva os dados existentes.

Saldo, mínimo e custo usam step=0.01, min=0, max=99999999.99 e required; descrição, fornecedor e localização respeitam limites 150/120/80. Labels dos campos estão associados aos inputs. Isso alinha a validação nativa à API sem criar mínimo comercial; backend continua autoritativo. Não altera itens existentes ou numeração do servidor.

Validação local: 122 testes, tipagem, build e diff-check aprovados. Teste de interface verifica valores iniciais, código somente leitura, campos opcionais vazios e validade decimal/negativa/overflow no navegador simulado. CI desta continuação pendente. CI anterior: PR #44, https://github.com/enlaceslz/defardas/actions/runs/41035938245. Sem migração nova, merge ou deploy.


### Continuação 30/10: cadastro de clientes sem localização presumida

Novo cliente inicia cidade, UF e segmento vazios. Cidade e UF são inputs separados; apagar um campo não reinsere São Paulo/SP nem altera o outro. Edição conserva os valores carregados. Não se infere localização pela sede da empresa nem se corrige cadastro histórico automaticamente.

Campos textuais respeitam maxLength da API (razão/fantasia/e-mail 150, documento 20, inscrição 30, contato 100, telefone 30, endereço 200, cidade 80, UF 2, segmento 60, observações 10000). Contato e telefone passam a ser obrigatórios no formulário como já eram no servidor. Labels dos inputs associados; não são criadas novas regras de CPF/CNPJ, validação de UF ou segmento comercial.

Validação local: 123 testes, tipagem, build e diff-check aprovados. Teste de UI confere campos opcionais vazios, limites e obrigatoriedade, sem presumir valores no envio. CI desta continuação pendente. CI anterior: PR #45, https://github.com/enlaceslz/defardas/actions/runs/41036642989. Sem migração nova, merge ou deploy.


### Continuação 30/10: envio e confirmação do perfil institucional

A tela de configurações reutiliza useSubmission para bloquear envios simultâneos do perfil e tratar exceção sem anunciar sucesso. Botão fica desabilitado durante a tentativa. A mensagem de sucesso anterior é removida ao iniciar novo envio e só reaparece após confirmação positiva. Timeout é cancelado na desmontagem/limpeza do efeito.

Proteção é por instância da tela; não constitui idempotência persistida nem revisão contra formulários de outras abas. Não altera transação do backend, conteúdo público ou regras do perfil.

Validação local: 125 testes, tipagem, build e diff-check aprovados. Novos testes UI cobrem envio simultâneo, confirmação, falha após sucesso e exceção com liberação do formulário. CI desta continuação pendente. CI anterior: PR #46, https://github.com/enlaceslz/defardas/actions/runs/41057295276. Sem migração nova, merge ou deploy.


### Continuação 30/10: chaves de mensagens ao alternar textos

A SPA mantém tentativas não confirmadas por conversa e texto normalizado (trim), em vez de substituir pela última tentativa. Alternar A→B→A após falhas reutiliza a chave original de A. Sucesso confirmado encerra somente a tentativa daquele texto; B continua com sua chave, e um novo envio intencional de A após sucesso recebe outra chave.

Estado permanece apenas em memória durante a montagem da tela. Recarregar/desmontar perde as chaves; conferir histórico/reconciliar antes de repetir envio incerto. Não persiste rascunhos, envia automaticamente mensagens, resolve entrega do provedor ou deduplica textos parecidos. A proteção do servidor continua baseada na chave, não no corpo.

Validação local: 126 testes, tipagem, build e diff-check aprovados. Novo teste UI cobre alternância, normalização de espaços, sucesso seletivo e nova intenção após confirmação; testes de idempotência backend existentes continuam aplicáveis. CI desta continuação pendente. CI anterior: PR #47, https://github.com/enlaceslz/defardas/actions/runs/41058340780. Sem migração nova, mensagens externas, merge ou deploy.


### Continuação 30/10: histórico atrasado na conversa ativa

Carregamento inicial do histórico é mesclado por ID com mensagens já observadas na conversa durante a espera. Uma resposta iniciada antes do envio não remove a confirmação recebida nesse intervalo nem duplica o ID se ele também vier na consulta. Na colisão, conserva o estado local observado durante a espera. Cancelamento ao trocar conversa permanece ativo.

Exceção inesperada da consulta informa erro genérico e encerra o indicador de carregamento, sem detalhes do provedor. Não altera banco, mensagens externas, recibos do provedor ou implementa sincronização contínua/paginação/ordenação causal. Não constitui reconciliação de estados entregue/lido fora desse carregamento.

Validação local: 128 testes, tipagem, build e diff-check aprovados. Testes UI cobrem resposta atrasada com e sem ID recém-confirmado e rejeição inesperada sem exposição de detalhes. CI desta continuação pendente. CI anterior: PR #48, https://github.com/enlaceslz/defardas/actions/runs/41061332440. Sem migração nova, mensagens externas, merge ou deploy.
