# Continuação da auditoria — 28/10/2026

Base inspecionada: `5955081`, branch `fix/production-audit`, PR #1. Esta entrega é incremental sobre essa frente, que ainda não foi integrada à `main`. O código atual é React/TypeScript/Express/PostgreSQL; o instalador PHP mencionado em contexto antigo não corresponde a este repositório.

## Achados e correções

| Prioridade | Achado confirmado | Correção |
|---|---|---|
| Alta | Recuperação consumia token antes da persistência e revogação; falhas podiam deixar senha/sessões inconsistentes | Transação única para senha, sessões, todos os tokens e auditoria; falha preserva estado anterior |
| Alta | Tokens em memória desapareciam em reinício e não funcionavam entre instâncias | Tabela PostgreSQL, hash SHA-256, expiração e unicidade por usuário; nova emissão invalida anterior |
| Alta | Login em trânsito podia emitir sessão após redefinição da senha | Revalidar hash/conta ativa dentro do mesmo lock transacional antes do INSERT de sessão |
| Alta | Sessão e auditoria de login eram confirmadas separadamente | Ambas usam o mesmo cliente transacional; cookie emitido após COMMIT |
| Média | API de recuperação informava sucesso sem entregar instruções em produção | Retorno explícito 503 sem emissão; recuperação de conta ativa disponível ao operador por CLI |
| Média | Senha demonstrativa literal no código e no preenchimento do login | Senha aleatória por processo (ou ERP_DEV_PASSWORD); UI consulta apenas o endpoint de desenvolvimento |
| Média | bcrypt aceita só os primeiros 72 bytes de senha | Validação central rejeita excesso em UTF-8, inclusive caracteres multibyte |
| Média | Listagem comercial consultava itens uma vez por proposta | JOIN único, agrupamento por UUID e ordenação estável; preserva propostas sem itens |

O comando `user:reset-password` exige DATABASE_URL, RESET_USER_EMAIL e RESET_USER_PASSWORD. Não envia mensagens, não imprime credenciais e não muda perfil/ativação. O acesso ao host já permite provisionar administradores; esse comando tem o mesmo nível de privilégio e precisa do controle operacional correspondente.

## Validação

- Tipagem e 26 testes locais passaram, incluindo concorrência de token, expiração, conta inativa, revogação e login antigo em trânsito.
- Build Vite passou. `compile_applet` não está disponível neste ambiente; o build real é `npm run build`.
- Os 19 testes PostgreSQL passaram na CI com pool de uma conexão, detectando uso indevido de conexões fora da transação.
- CI completa aprovada no commit `2ad5bb9`: [execução 40746889582](https://github.com/enlaceslz/defardas/actions/runs/40746889582), incluindo backup/restauração com rejeição de arquivo alterado, build/start da imagem de produção, HTTP/health e desligamento. A execução por pull request também passou ([40746909657](https://github.com/enlaceslz/defardas/actions/runs/40746909657)). GitGuardian aprovou o commit sem novos segredos detectados.
- Testes novos incluem hash persistido/consumo por outra instância, concorrência com único vencedor, invalidação/expiração, rollback por falha na revogação, CLI, indisponibilidade pública, consulta única, login em trânsito e rollback por falha da auditoria de login.
- Nenhuma migração, troca de senha ou operação foi executada no banco operacional. Não foi feita homologação visual; a entrega altera backend, consulta, scripts e preenchimento de credenciais locais no login.

## Pendências preservadas

Entrega de e-mail/interface pública de redefinição, anexos privados S3, gestão completa da equipe, política de leitura por perfil, WhatsApp real, importação legada, paginação e homologação de infraestrutura continuam pendentes. Rate limit permanece por processo; proteção distribuída precisa acompanhar a implantação com múltiplas instâncias. O lock global foi preservado para integridade e ainda precisa de medição.

O alerta histórico do GitGuardian no PR #1 refere-se a uma senha literal antiga em compose.yaml. A configuração atual exige POSTGRES_PASSWORD externo, mas isso não comprova rotação de qualquer instalação que tenha usado o valor anterior. Não houve reescrita de histórico ou alteração de credenciais reais.

Esta revisão focou autenticação, recuperação e listagem de propostas; não constitui aprovação irrestrita de produção nem auditoria exaustiva de todos os módulos.


## Nova revisão incremental da comunicação

Base: `aeb9db5`, PR #4 (`feat/team-access-operations`); os PRs #1–#4 permanecem abertos e encadeados. Revisão focada nas rotas de comunicação e no serviço WhatsApp.

- Corrigido isolamento incompleto: homologação com DATABASE_URL podia obter QR ilustrativo e reconexão simulada, incluindo escrita de status fictício. Ambos agora usam o mesmo predicado da demonstração local.
- Bloqueados templates automáticos fora da demonstração local: o endpoint aceitava dados arbitrários do cliente e podia afirmar sinal confirmado e corte liberado sem verificar baixa/arte. Responde 501 antes de efeitos. Integração com registros autoritativos permanece pendente.
- Teste HTTP cobre banco configurado com NODE_ENV ausente/development/test/staging/production e staging/production sem banco; verifica ausência de QR fictício, escrita de canal e envio de template. QR local permanece disponível.
- Validação desta revisão: 37 testes locais, `npm run lint`, `npm run build` e `git diff --check` passaram. Bundle JS produzido: 463,90 kB (119,11 kB gzip). `compile_applet` não está disponível. PostgreSQL/Docker não foram executados localmente nesta revisão; resultados históricos não são evidência deste commit.
- Sem migração, implantação, mensagem externa ou alteração de conta operacional. Nenhuma aprovação de produção: S3, e-mail, matriz de leitura, WhatsApp (recibos/deduplicação/transações), importação e homologação seguem pendentes.


## Continuação: interface e exposição de canais

Base: PR #5, commit `d1f126e`. As execuções 40805837119 e 40805822522 passaram, incluindo PostgreSQL, backup/restauração e imagem Docker.

Achados corrigidos nesta continuação:

- A interface contornava a ausência de QR com imagem gerada por serviço externo. Agora consulta o endpoint de QR e apresenta indisponibilidade/reconexão com erro explícito.
- A listagem e a resposta demonstrativa de reconexão serializavam a entidade do canal inteira. Agora usam lista explícita de campos públicos de apresentação, sem `config` e sem QR. O acesso ao endpoint próprio de pareamento mantém a autorização existente; matriz de leitura por perfil segue pendente.
- Envio apagava o rascunho antes de obter resposta e podia inserir objeto de erro no histórico. Agora preserva texto em falha, bloqueia submissões concorrentes e exige resposta 201 com identificador e estado diferente de falha para limpar o compositor.
- Histórico mostrava duplo check inclusive em falha. Agora exibe o estado registrado sem converter aceitação do provedor em recibo de entrega.
- Atalhos enviavam imediatamente textos que presumiam chave PIX/CNPJ e corte liberado por aprovação. Agora preparam rascunho para revisão, sem essas afirmações.
- Rascunhos são separados por conversa; respostas atrasadas de histórico não substituem a seleção atual. Polling não redefine seleção existente para o primeiro contato.

Validação: testes HTTP de projeção de canal e testes JSDOM de falha/sucesso, duplo envio, QR/reconexão, atalhos e troca de conversa. Sem envio real, deploy ou alteração de banco operacional. JSDOM não substitui homologação visual. Recibos/deduplicação/transações WhatsApp continuam pendentes.

Resultado local final desta continuação: 43 testes, tipagem, build e diff-check aprovados; bundle JS 464,42 kB / 119,39 kB gzip. PostgreSQL/Docker deste commit serão validados pela CI. `compile_applet` indisponível; utilizado build Vite.


## Continuação: contrato do envio manual

Base: PR #6, commit `3e12af1`. CI principal 40806391787 aprovada, incluindo PostgreSQL, backup/restauração e Docker.

O serviço aceitava corpo arbitrário e mídia/tipo de mensagem, mas os dois transportes enviavam exclusivamente texto. Agora valida e normaliza texto (até 4.000 caracteres), rejeita mídia/tipos sem suporte antes de I/O e exige canal ativo/conectado e credenciais configuradas. Conversa ausente retorna 404; canal indisponível/configuração ausente retorna 503. Não foram adicionados novos serviços ou regras comerciais.

Erros de rede eram copiados para `errorMessage` e console e erros de persistência chegavam à resposta HTTP. Agora detalhes internos não são retornados nessa rota e falhas de transporte usam texto genérico; auditoria informa tentativa/estado em vez de afirmar envio quando houve falha. O identificador externo sintético e a falta de recibos reais ainda são limitações conhecidas.

Validação local: 48 testes, tipagem, build Vite e diff-check passaram. Cinco novos testes cobrem contratos inválidos, mídia, canal/credenciais, erro sensível, HTTP rejeitado, normalização e status HTTP seguros. Transportes substituídos por fixtures; nenhuma mensagem externa. `compile_applet` indisponível. CI deste commit ainda precisa validar PostgreSQL/Docker; nenhuma migração ou implantação realizada. Bundle JS permanece 464,42 kB / 119,39 kB gzip.


## Continuação: recepção transacional e isolamento por canal

Base: PR #7, commit `256e038`. CI principal 40806863361 aprovada.

Achados: webhooks usavam IDs demonstrativos incompatíveis com UUIDs persistentes; consulta por telefone ignorava canal; identificação externa não era obrigatória nem deduplicada; conversa/mensagem/auditoria eram gravadas separadamente. Reentregas podiam duplicar histórico e não lidas, e falha deixava dados parciais.

Correções: mapeamento explícito por `META_WA_CHANNEL_ID`/`WA_AKG_CHANNEL_ID`, verificação de provedor/ativação e telefone Meta, ID externo obrigatório e transação com o lock global existente. Duplicidade é consultada por canal/ID antes das escritas; conversa é segregada por canal/telefone. Migração `0005_conscious_jasper_sitwell` adiciona dois índices únicos sem apagar ou corrigir histórico automaticamente; verificação de duplicidades documentada no runbook.

Validação local: 53 testes, tipagem, build Vite e diff-check passaram. Quatro novos testes de serviço cobrem oito reentregas simultâneas, separação entre canais, rollback em auditoria/mensagem, reentrega e ID ausente. Teste HTTP com assinatura Meta/segredo WA-AKG cobre mapeamento explícito, provedor incompatível e telefone Meta divergente. Dois testes PostgreSQL foram adicionados para deduplicação concorrente, constraints SQL e rollback integral inclusive de contador existente; sua execução depende da CI deste commit. Bundle permanece 464,42 kB / 119,39 kB gzip. `compile_applet` indisponível; build Vite utilizado.

Nenhuma migração no banco operacional, mensagem externa, implantação ou reconciliação de dados reais foi executada. O lock global prioriza integridade e requer medição. Mídias, recibos reais, transação/outbox de saída, provisão de canais, RBAC de leitura, S3/e-mail e homologação de infraestrutura continuam pendentes. Uma auditoria integral do produto ainda não foi concluída.
