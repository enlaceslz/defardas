# DE FARDAS — nova revisão de prontidão para produção

Data: 29/10/2026. Escopo: código, configuração e documentação da sequência incremental até o PR #23 (`4701bea2`) e correções desta revisão. Não foi acessado o servidor contratado nem o banco operacional. Não houve merge, deploy, migração real ou comunicação externa.

**Parecer: ainda não liberar para operação real.** O núcleo possui testes de integridade; integrações de evidência privada, governança de leitura e operação no ambiente contratado ainda impedem uma declaração de prontidão geral. CI aprovada não é homologação comercial, financeira ou de infraestrutura.

## Achados corrigidos nesta revisão

| Achado | Impacto | Correção |
|---|---|---|
| DEVELOPMENT_STATUS declarava homologação geral | Poderia orientar liberação sem evidência | Status reescrito com situação por área, base testada e bloqueios explícitos |
| Guia iniciava app antes de migrar e usava drizzle-kit ausente na imagem | Instalação inicial falha: bootstrap exige schema | Guia usa build, PostgreSQL, container temporário com `npm run db:migrate`, admin e só depois app |
| Serviço WA-AKG era apenas `tail -f /dev/null`, com chave padrão | Infraestrutura aparentava integração funcional sem servidor | Placeholder removido do Compose; nenhum volume histórico é apagado |
| Envio WA-AKG inventava endpoint de container | Com chave definida, ausência de endpoint virava tentativa de transporte incerta | Endpoint explícito obrigatório antes de gravar intenção/rede; teste novo de configuração ausente |
| Redis obrigatório sem consumidor no runtime | Custo e dependência operacional desnecessários | Perfil `optional-cache`, sem dependência do app; documentação não atribui sessões/filas ao Redis |
| Porta HTTP publicada em todas as interfaces por padrão | Exposição direta fora do proxy planejado | Bind padrão em loopback, configurável por APP_BIND_ADDRESS conforme topologia |
| HEALTHCHECK usava 3000 fixo e CI só testava curl externo | Imagem com PORT customizado podia servir e ficar unhealthy | Probe usa PORT e timeout; CI exige health interno healthy em PORT=3300 |
| Guia prometia zero downtime e encerramento automático de conexões no restore | Procedimento operacional incorreto | Manutenção explícita, ensaio de migração/recuperação e responsabilidade de parar escritores |

Mudanças de compatibilidade: proxy em outro container/host precisa de bind/rede configurados; WA-AKG precisa de endpoint real; Redis não inicia por padrão. Containers antigos não são removidos automaticamente e volumes continuam preservados; revisar órfãos manualmente sem apagar sessões/credenciais. A revisão não fornece um provedor substituto nem um worker Redis.

## Bloqueios e trabalho restante

| ID / prioridade | Evidência no projeto | Próxima entrega e critério de aceite |
|---|---|---|
| PROD-01 / P0 | Não há upload privado S3 nem verificação de posse; URL HTTPS é validação sintática | Implementar armazenamento contratado, acesso assinado temporário, tamanho/MIME, autorização por arquivo, vínculo de arte/comprovante e teste de acesso indevido |
| PROD-02 / P0 | Listagens de custos/financeiro/dados pessoais não possuem matriz de leitura homologada por perfil | Diretoria define matriz; backend e carregamento da SPA passam a aplicá-la, com testes de negação. Não inventar alçadas |
| PROD-03 / P0 | Nenhum ensaio no host real; CI é ambiente descartável | Validar DNS/HTTPS/proxy/TLS remoto, permissões e persistência de volumes, segredos, monitoramento e recuperação em cópia isolada. Definir responsáveis, RPO/RTO e cópia externa de backups |
| PROD-04 / P1 | E-mail de recuperação retorna 503; recuperação administrativa CLI existe | Homologar provedor de entrega e interface de redefinição, ou registrar procedimento administrativo operacional aceito. Não afirmar envio inexistente |
| PROD-05 / P1 | QR/reconexão/recibos de entrega não homologados; reconciliação CLI cobre envio incerto | Homologar provedor e contrato; ensaiar timeout, duplicação de webhook e recibos reais antes de ativar o canal. Mensagem aceita não equivale a entregue |
| PROD-06 / em validação | Revisão persistida e precondição implementadas para mudança de etapa; chave durável não implementada | Confirmar CI e ensaio da migração 0006/clientes; outros editores não recebem CAS nesta entrega |
| PROD-07 / P1 | Cancelamento/estorno, revisão de arte, retenção/anonimização e alçada definitiva têm decisões pendentes | Homologar regras e trilha compensatória antes de habilitar automações; manter comissão e emissão fiscal sem ativação automática |
| PROD-08 / P1 | Lock global, listagens sem paginação e rate limit em memória | Medir carga/topologia real, paginar e definir limitação distribuída se houver múltiplas instâncias; não declarar capacidade sem ensaio |
| PROD-09 / P1 | Importação JSON antiga é bloqueada em operação | Só migrar dados legados por normalização, ensaio e conferência financeira/comercial; restauração operacional é PostgreSQL |
| PROD-10 / P1 | Quatro alertas moderados de ferramentas Drizzle/esbuild na auditoria npm | Tratar cadeia de desenvolvimento sem aplicar downgrade incompatível sugerido automaticamente. Repetir auditoria no release e no runtime final |

P0 identifica condição para operação com dados reais; P1 pode depender do escopo efetivamente liberado e de procedimento formal aceito. Desativar uma integração não a torna homologada. Este documento não autoriza exceções ou aprova políticas empresariais.

## Evidências e limites

- Base PR #23: 87 testes locais; CI completa aprovada na segunda tentativa, incluindo PostgreSQL, backup/restauração e imagem: https://github.com/enlaceslz/defardas/actions/runs/40897687115. A primeira tentativa teve erro interno de desserialização no executor Node; reexecução do mesmo commit passou. A instabilidade do runner precisa continuar monitorada.
- Nesta revisão: 88 testes locais, tipagem e build Vite aprovados; YAML do Compose/workflow lido com parser. Novo teste bloqueia endpoint WA-AKG ausente/vazio antes de persistir intenção ou transmitir.
- CI ampliada para validar a configuração real do Compose e o HEALTHCHECK interno em porta customizada, além das verificações já existentes. Conferir resultado do PR desta revisão para a evidência do commit final; Docker/PostgreSQL não foram executados localmente nesta sessão.
- Auditoria npm completa nesta sessão encontrou 4 alertas moderados em drizzle-kit, esbuild e cadeia esbuild-kit, sem high/critical. Sugestão automática aponta downgrade de drizzle-kit; não foi aplicada. `npm audit --omit=dev` retornou zero alertas nesta sessão. Isso é um retrato da base de advisories consultada, não auditoria das bibliotecas do sistema operacional da imagem; repetir no release.
- Não houve migração de schema nem alteração de valores comerciais. O bundle continua em aproximadamente 464,96 kB / 119,60 kB gzip. `compile_applet` não está disponível; foi usado `npm run build`.
- Testes de interface usam JSDOM. Falta jornada real com todos os perfis, dispositivos da empresa, impressão, artes/comprovantes e falhas de rede/reinício.

## Sequência de liberação

1. Revisar e integrar a sequência de PRs em homologação; registrar commit, migrações e evidências. As branches auditadas não representam alterações já presentes em main/produção.
2. Resolver PROD-01 a PROD-03 e definir o escopo dos módulos com pendências P1, sem liberar operação apoiada em simulações.
3. Executar o [guia Docker revisado](DOCKER_DEPLOY.md), ensaiar restauração e migração em cópia e registrar recuperação/rollback compatíveis com o schema.
4. Homologar jornada com usuários reais e responsáveis comercial, financeiro, produção e infraestrutura; registrar resultado e pendências aceitas.
5. Só então decidir a liberação operacional. Não usar a antiga declaração de homologação como autorização.

Ver [status consolidado](DEVELOPMENT_STATUS.md), [operação transacional](OPERACAO_TRANSACIONAL.md) e [histórico de correções](AUDITORIA_CONTINUACAO_2026-10-28.md).

A primeira execução desta revisão revelou fixtures PostgreSQL que dependiam do endpoint WA-AKG removido. Foram corrigidas para usar endpoint explícito com fetch interceptado; a espera do transporte agora propaga rejeição anterior à rede. Adicionado teste PostgreSQL de endpoint ausente sem nova intenção/requisição. Nenhum provedor externo é chamado nesses testes.

## Continuação: configuração TLS do banco

Após o PR #24, a revisão identificou modo SSL desconhecido caindo em disable e opções SSL da URL sobrescrevendo a política do pool/CA no driver instalado. Parser de configuração agora recusa conflitos, preserva CA, não permite enfraquecer verify-full e valida tamanho do pool sem parseInt permissivo. Configuração inválida termina com diagnóstico seguro antes de conectar. URL com parâmetros SSL incompatíveis exige ajuste de ambiente; ver o guia Docker.

Validação local passa a 92 testes, com inspeção das opções efetivas do driver e teste de processo sem vazamento. Esta entrega não comprova handshake TLS com o banco contratado; PROD-03 e os demais bloqueios continuam vigentes. Última CI de base aprovada: PR #24, execuções 40900379159/40900369819; conferir a CI do novo PR para o commit final.

## Continuação: auditoria de acesso e rate limit

Após o PR #25, foram encontrados URLs completos em eventos de bloqueio e contadores separados por caixa do caminho. Os middlewares passam a usar o template definido no servidor, com marcador fixo antes de resolver a rota; query, valores do caminho, corpo e credenciais não compõem esses eventos. Rate limit usa template+IP e mantém seus limites/janelas. Validação local passa a 94 testes; conferir a CI do PR correspondente para persistência PostgreSQL e imagem.

Isso não limpa histórico que possa conter URLs privadas nem configura logs do proxy. Avaliar retenção/acesso a auditoria no ambiente real; rate limit distribuído, RBAC de leitura e demais bloqueios continuam pendentes. A última CI de base aprovada é 40943845858, do PR #25.

## Continuação: limites técnicos de prazo e data

Após o PR #26, foram corrigidos prazo que excedia integer/Date e aceitação de ano zero. Criação valida o cabeçalho antes da numeração; conversão confere prazo novamente antes de criar OP/título. Erros recebem 400 sem efeitos parciais, inclusive em fixture histórica inválida. Datas mantêm o formato AAAA-MM-DD (0001–9999), dias corridos de 24h e comportamento UTC anterior; isso não homologa calendário ou prazo comercial.

Validação local passa a 97 testes, com bissexto, viradas e limites de representação; teste PostgreSQL adicional confere preservação de contador/estado e repetição de conversão. Conferir CI do novo PR. Última CI de base: 40945106280, PR #26. Nenhum dado real foi corrigido/migrado; bloqueios operacionais anteriores permanecem.

## Continuação: coerência das parcelas na conversão

Após o PR #27, a conversão passou a conferir total dos itens, percentual armazenado e duas parcelas positivas/coerentes antes de gravar. Propostas zero/de um centavo não geram título zero; divergências históricas recebem conflito sem correção automática. A leitura agora conserva percentual real, enquanto novas propostas continuam exigindo 50. Arredondamento de centavos e markup não mudam, e não foi definido mínimo comercial.

Validação local passa a 99 testes; dois testes PostgreSQL adicionais verificam persistência, contadores e divergência histórica. Conferir CI do novo PR; última CI de base aprovada: 40947222300, PR #27. Bloqueios de produção documentados permanecem e nenhum dado real foi alterado.

## Continuação: integridade do replay de conversão

Após o PR #28, o replay deixa de usar existência de uma OP como prova de conclusão. São conferidos vínculos de proposta/itens/versões e os dois recebíveis; histórico incompleto retorna conflito sem recriação ou reparo. Replay íntegro devolve títulos atuais e preserva baixa/auditoria. Consulta financeira é limitada à proposta.

Validação local passa a 100 testes; dois testes PostgreSQL novos cobrem oito divergências estruturais e reenvio após baixa real de sinal. Conferir CI do novo PR; última CI de base: 40959659799, PR #28. A mudança não reconcilia automaticamente dados antigos, evidências ou todos os estados operacionais/financeiros. Bloqueios operacionais anteriores permanecem.

## Continuação: proteção contra mudança de etapa atrasada

Após o PR #29, a OP recebe revision persistida e incrementada por trigger na migração 0006. Transição exige expectedRevision da leitura e recusa tela desatualizada com conflito; lock de linha mantém comparação e gravação na mesma transação. UI recarrega conflito sem reenviar intenção. No-op ainda conserva estado/gates, sem reescrita. Outros editores incrementam revisão, mas não passam a exigir CAS.

Validação local passa a 103 testes; testes PostgreSQL novos cobrem trigger, concorrência e rollback. Conferir CI do novo PR. Migração e frontend devem ser implantados juntos, após ensaio em cópia; startup exige coluna nova. Última CI de base: 40960567134, PR #29. Não foi migrado banco real nem implementada chave durável de comandos; demais bloqueios operacionais permanecem.


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
