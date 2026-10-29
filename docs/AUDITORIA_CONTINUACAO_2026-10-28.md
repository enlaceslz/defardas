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


## Continuação: intenção de envio persistida antes da rede

Base: PR #8, commit `3166f574`. CI 40807697447 aprovada, incluindo testes PostgreSQL, backup/restauração e Docker.

Achado: envio era disparado antes de persistir histórico/auditoria; falha podia deixar mensagem externa sem registro e permitir retransmissão por repetição da requisição. O envio agora confirma intenção pendente e auditoria numa transação, chama transporte fora do lock e confirma resultado/prévia/auditoria em outra transação. Se a fase final falhar, a intenção permanece pendente para reconciliação. Não há pretensão de transação distribuída com o provedor.

Chave UUID obrigatória na rota operacional, combinada com identidade autenticada para o ID interno. Repetição compatível retorna estado existente sem novo disparo; conflito retorna 409. A interface conserva chave no rascunho durante a vida do componente e preserva texto pendente. Recarregar perde a chave em memória, conforme runbook; sem gravação privada em localStorage. Removido identificador externo inventado para novos envios. Auditoria recebe identidade/perfil da sessão.

Validação local: 58 testes, tipagem, build Vite e diff-check passaram; cinco novos testes locais cobrem repetição/conflito, registro anterior à rede, ausência de lock no transporte, rollback inicial/final, identidade HTTP e preservação/reutilização da chave na UI. Dois testes PostgreSQL adicionados cobrem as mesmas fases com pool de uma conexão, concorrência e preservação de não lidas; execução depende da CI deste commit. Nenhuma mensagem externa ou migração nova. `compile_applet` indisponível; build Vite utilizado. Bundle JS 464,64 kB / 119,48 kB gzip.

Pendências: reconciliação operacional de pendentes, captura do ID real/recibos, outbox/worker, política de leitura por perfil, S3/e-mail, provisionamento e homologação. Não garante entrega única se o cliente perder/trocar a chave. Nenhum deploy ou alteração de conta/banco operacional.


## Continuação: reconciliação administrativa sem retransmissão

Base: PR #9, commit `78c8f3c0`; CI 40808530472 e 40808544472 aprovadas.

Pendentes não tinham procedimento de resolução. Adicionado `npm run whatsapp:reconcile`, exclusivo do host/PostgreSQL: exige operador, motivo, referência de evidência, UUID interno e resultado `sent`/`failed`. Aceitação exige identificador real do provedor; falha não aceita ID de aceitação. O procedimento registra declaração operacional e não comprova evidência externamente. Não transmite mensagens, não automatiza consulta ao provedor e não altera estados delivered/read.

Estado, ID externo, prévia elegível e auditoria confirmam na mesma transação. Repetição idêntica não duplica evento; alteração de estado final/inbound é rejeitada. Preserva mensagem mais recente/não lidas. Finalização tardia do envio original consulta o estado sob o mesmo lock e não sobrescreve reconciliação.

Validação local: 60 testes, tipagem, build Vite e diff-check aprovados. Dois novos testes locais validam contrato e exigência de banco. Três testes PostgreSQL adicionados exercitam CLI/saída sem conteúdo, idempotência, conflito, rejeição de entrada, rollback por auditoria, prévia mais recente e corrida com transporte em andamento. PostgreSQL/Docker dependem da CI deste commit. Sem migração nova, mensagem externa, deploy ou alteração operacional. `compile_applet` indisponível; build Vite utilizado. Bundle permanece 464,64 kB / 119,48 kB gzip.

Recibos e consulta real ao provedor, reenvio autorizado, worker/outbox, RBAC de leitura, S3/e-mail, provisão e homologação continuam pendentes. Evidência de timeout sozinha não autoriza classificar falha.

Ajuste final do mesmo escopo: erro de rede/timeout e HTTP 5xx mantêm pending para reconciliação, com auditoria WHATSAPP_SEND_UNCONFIRMED; HTTP 4xx mantém failed. Testes de transporte atualizados para distinguir resultado incerto de rejeição.


## Continuação de 29/10/2026: integridade do CRM público e atribuição comercial

Base: PR #10, commit `4b5b6200`; CI 40809343383 e 40809348032 aprovadas.

Achados: captura aceitava campos fora dos limites do banco e transformava quantidade ausente/inválida/zero em 50; patch aceitava estado arbitrário e não auditava; vendedor atribuído era omitido no INSERT/UPDATE/mapeamento PostgreSQL apesar da resposta anunciar sucesso.

Correções: validação de campos/categoria e quantidade inteira positiva dentro do tipo SQL antes de alocar número; sem quantidade/observação inventada no backend. Alteração exige estado reconhecido/responsável válido e ativo dos perfis comerciais existentes; conversão sem proposta vinculada é rejeitada. Atribuição agora persiste e é lida. Auditoria da alteração confirma junto com o dado, repetição idêntica não duplica evento, captura/alteração usam UUID como referência dos novos eventos. Não muda política comercial nem limpa dados históricos.

Validação local: 63 testes, tipagem, build Vite e diff-check aprovados. Três novos testes HTTP cobrem normalização, quantidade sem fallback, limites/tipos, campos privados ignorados, estados inválidos, conversão fictícia, atribuição e rollback/idempotência. Dois testes PostgreSQL adicionados cobrem contador/captura em falha de auditoria e atribuição/remoção recarregada com rollback e trilha de eventos; execução depende da CI deste commit. Bundle permanece 464,64 kB / 119,48 kB gzip. `compile_applet` indisponível; build Vite utilizado.

Nenhuma migração nova, operação em banco real, deploy ou mensagem externa. Pendências: controles de abuso distribuídos no portal, leitura por perfil, conversão lead→proposta e interface/homologação do CRM; demais frentes S3/e-mail/WhatsApp permanecem abertas. Esta revisão não constitui liberação de produção.


## Continuação de 29/10/2026: privacidade dos diagnósticos operacionais

Base: PR #11, commit `c4f6f141`; CI 40810298577 aprovada.

Achados: middleware global imprimia objeto de erro completo, incluindo corpo de JSON inválido/SQL/cause; catch de inicialização expunha erros encadeados; falhas de conexão/usuário/senha/sessões e alguns CLIs também podiam serializar exceções ou suas mensagens arbitrárias. Dados não necessariamente apareciam na resposta HTTP, mas podiam persistir nos logs.

Correção: logger operacional com campos fixos, UUID gerado no servidor e código de lista fechada; sem serialização de erros/requests. Middleware global extraído e preserva classificação HTTP existente, com X-Diagnostic-Id para correlação. Se a resposta já começou, fecha conexão sem repassar exceção bruta ao handler padrão. Aplicado aos caminhos de startup, banco/autenticação e três CLIs identificados. Validações controladas continuam legíveis; falta de banco em produção segue bloqueando inicialização com código fixo. Sem mudanças comerciais ou banco/schema.

Validação local: 66 testes, tipagem, build Vite e diff-check aprovados. Três novos testes verificam projeção de erro/código desconhecido, requisições HTTP reais com JSON inválido/limite/SQL/headers/query/credenciais e CLIs com URL inválida contendo segredo fictício; nenhum valor sensível da fixture apareceu nas saídas. Teste de startup atualizado para código fixo, preservando exit 1. PostgreSQL, backup e Docker deste commit dependem da CI. `compile_applet` indisponível; build Vite utilizado. Bundle permanece 464,64 kB / 119,48 kB gzip.

Escopo: caminhos de erro tratados pela aplicação nesta entrega. Não é avaliação integral de todos os logs, dependências ou infraestrutura; logs de proxy/PostgreSQL/provedor e política de retenção permanecem operacionais. Não houve inspeção/remoção de logs reais, migração, mensagem externa, deploy ou alteração de conta operacional. RBAC de leitura, S3/e-mail, integrações e homologação continuam pendentes.


## Continuação de 29/10/2026: precisão e histórico de estoque

Base: PR #12, commit `6db5ea31`; CI 40810976920 aprovada.

Achados: API aceitava quantidades/saldos/custos com precisão superior a numeric(10,2), causando divergência por arredondamento entre resposta e persistência; histórico usava ON CONFLICT DO NOTHING e podia confirmar saldo sem gravar movimento em colisão. Cadastro/leitura inventavam fornecedor homologado e localização para valores ausentes; leitura perdia operatorId.

Correções: validação da capacidade/escala existentes nas entradas e normalização dos resultados calculados, com rejeição de estouro de saldo final; inserção estrita de movimentos também na demonstração, revertendo operação em colisão. Textos opcionais validados nos limites SQL e sem rótulos fictícios. Mapeamento preserva operador. Não há mudança de regra comercial, unidade ou schema e não há limpeza de histórico.

Validação local: 68 testes, tipagem, build Vite e diff-check aprovados. Dois novos testes HTTP cobrem soma decimal, entradas de precisão excessiva, metadados, edição inválida, estouro e rollback por colisão. Dois testes PostgreSQL adicionados cobrem equivalência resposta/banco, leitura do operador e saldo/histórico/auditoria preservados em conflito; execução depende da CI. `compile_applet` indisponível; build Vite utilizado. Bundle permanece 464,64 kB / 119,48 kB gzip.

Nenhuma migração, mensagem externa, operação no banco real ou deploy. Repetição de requisição de estoque ainda precisa de idempotência própria; esta entrega protege colisões do histórico. Política de precisão ampliada, custódia detalhada por facção/OP, leitura por perfil e homologação continuam pendentes, junto das demais integrações.

A CI inicial encontrou conflito encapsulado pelo Drizzle retornando HTTP 500 em vez de 409. A classificação agora busca exclusivamente códigos da lista fechada em até três níveis de causa, sem serializar conteúdo. A suíte PostgreSQL passa a montar o handler real da aplicação; teste HTTP de privacidade cobre erro encapsulado. Uma execução inicial também falhou no transporte de resultados do runner Node 22 (desserialização), sem asserção de domínio; isso não foi tratado como aprovação.


## Continuação de 29/10/2026: repetição segura de movimentos de estoque

Base: PR #13, commit `c4e32892`; CI 40812058558 aprovada.

Implementada chave UUID de repetição em POST /api/inventory/movements operacional, combinada com usuário autenticado para gerar ID interno. Repetição compatível devolve evento original (200/replayed) sem executar saldo/contador/auditoria; alteração de dados na mesma chave retorna 409. Falha reverte chave e dados na transação existente. Primeira confirmação segue 201. O replay devolve item atual, não snapshot antigo de saldo. Sem migração/schema novo.

Contrato inclui item/OP normalizados, tipo, quantidade, motivo e documento. Permissões permanecem obrigatórias; ajuste mantém sua alçada atual antes do replay. Cliente API aceita chave explícita e gera nova quando omitida; consumidores precisam preservá-la em retries, sem promessa de deduplicar chaves distintas. Nenhum retry automático ou localStorage privado introduzido.

Validação local: 70 testes, tipagem, build Vite e diff-check aprovados. Dois novos testes HTTP exercitam oito requisições simultâneas, conflito e rollback/retry. Dois testes PostgreSQL adicionados verificam exatamente um movimento/incremento/evento, chave ausente/inválida, conflito, saldo atual em replay e rollback de contador/chave; dependem da CI deste commit. Bundle JS 464,70 kB / 119,49 kB gzip. compile_applet indisponível; build Vite utilizado.

Nenhuma operação em banco real, migração, mensagem externa ou deploy. O escopo não cobre idempotência de cadastro/edição de item ou consumidores que descartem a chave. Custódia detalhada por parceiro/OP, RBAC de leitura, S3/e-mail, demais integrações e homologação continuam pendentes.


## Continuação de 29/10/2026: precisão, autoria e mensagens do financeiro

Base: PR #14, commit bc0f6ba8; CI 40812698663 aprovada.

Achados: cadastro manual arredondava valor sem validação de escala/capacidade, podia classificar despesa como Venda de Uniformes por fallback e aceitar metadados fora do schema. Leitura omitia confirmedById. Confirmação de saldo com OP vinculada anunciava sinal de 50% confirmado. Validação de evidência só verificava prefixo HTTPS.

Correções: valor manual estrito conforme numeric(12,2), metadados textuais com limites e sem categoria fictícia; vínculos de produção não são copiados no título manual. Mapeamento preserva autoria. Retorno da baixa distingue entrada/saldo sem percentual presumido e sem liberação automática de corte. URL precisa ser absoluta HTTPS, válida e sem credenciais, sem alegar verificação de arquivo/propriedade ou realizar rede.

Validação local: 72 testes, tipagem, build Vite e diff-check aprovados. Dois novos testes HTTP cobrem valor/metadados, URL, rollback de auditoria e replay de confirmação. Dois testes PostgreSQL adicionados verificam contador preservado em valor inválido, persistência/autoria e baixa de saldo antes da entrada sem falsa confirmação de sinal/corte; dependem da CI deste commit. Após ajuste final da validação de URL, a suíte afetada e tipagem passaram novamente. Bundle permanece 464,70 kB / 119,49 kB gzip. compile_applet indisponível; build Vite utilizado.

Sem migração, operação em banco real, mensagem externa ou deploy. Arquivo privado/evidência autoritativa S3, idempotência de criação manual de título, estornos com política homologada, RBAC de leitura e homologação/integrações seguem pendentes.
