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
