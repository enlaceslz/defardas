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


## Continuação de 29/10/2026: cadastro financeiro sem duplicação por reenvio

Base: PR #15, commit 2920139b; CI 40813460125 aprovada.

Cadastro manual agora exige chave UUID operacional, combinada com identidade autenticada e fingerprint de dados normalizados. Repetição compatível retorna título atual sem novo contador/evento; conflito retorna 409. Rollback preserva chave disponível. Registro concluído em core.event_log (FINANCE_MANUAL_CREATED/completed, somente fingerprint/entityId) sobrevive à exclusão do título, impedindo recriação por replay antigo (410). Não há migração ou schema novo. Retenção deve preservar esses registros, que não são tarefas de outbox.

Tela/API conservam chave para o mesmo rascunho em falha e bloqueiam duplo envio. Nova intenção, alterações ou recarga/remontagem usam outra chave; não há promessa entre chaves diferentes nem localStorage/retry automático. Baixa/conversão e regras de exclusão permanecem no fluxo existente.

Validação local: 75 testes, tipagem, build Vite e diff-check aprovados. Dois testes HTTP novos cobrem oito requisições concorrentes, conflito, preservação de título pago, rollback e exclusão com replay bloqueado. Teste de componente cobre chave preservada na falha e submissão simultânea. Dois testes PostgreSQL adicionados cobrem contador/título/auditoria únicos, registro persistido mínimo, rollback e registro sobrevivendo à exclusão; dependem da CI. Verificação de backup/restauração ampliada para comparar os IDs/payloads desses registros de chave. Bundle JS 464,94 kB / 119,59 kB gzip. compile_applet indisponível; build Vite utilizado.

Sem operação em banco real, migração, mensagem externa ou deploy. A CI deve validar também as mudanças do workflow. Retenção operacional, S3/evidência real, estornos homologados, RBAC de leitura e demais integrações/homologação continuam pendentes.


## Continuação de 29/10/2026: exclusão sem perda silenciosa de vínculos

Base: PR #16, commit a7edab82; CI 40814350648/40814364906 aprovadas.

Achados: exclusão de cliente verificava só propostas/OPs, podendo anular vínculo de conversa por FK SET NULL. Proposta sem OP podia ser excluída mesmo com título (SET NULL) ou lead convertido (sem FK), deixando referência órfã. Validação de segmento permitia 80 caracteres para coluna de 60; corpo ausente causava falha interna em vez de validação.

Correções: consultas de existência para bloquear clientes com proposta/OP/conversa e propostas com OP/título/lead, preservando lock/transação e autorização existentes. Substituída leitura integral de coleções no guard de clientes. Exclusão livre continua auditada e reversível em falha. Segmento alinhado ao SQL e corpo ausente tratado como entrada inválida. Sem nova política comercial, migração ou limpeza/reconciliação histórica.

Validação local: 77 testes, tipagem, build Vite e diff-check aprovados. Dois novos testes HTTP cobrem vínculos de atendimento/lead/financeiro, limites e rollback de exclusão. Dois testes PostgreSQL adicionados verificam vínculos preservados, exclusão livre e rollback inclusive dos itens da proposta; dependem da CI deste commit. Bundle permanece 464,94 kB / 119,59 kB gzip. compile_applet indisponível; build Vite utilizado.

Sem operação em banco real, migração, mensagem externa ou deploy. SQL administrativo direto não é coberto pelos guards da API. Retenção/anonimização/arquivamento, correção de relações históricas já quebradas, RBAC de leitura e integrações/homologação seguem pendentes.


## Continuação de 29/10/2026: preservar histórico ao excluir OP

Base: PR #17, commit 7f1c8d40; CI 40815086395 aprovada.

Achado: OP avulsa aguardando liberação, sem entrada confirmada, podia ser excluída mesmo com aprovação de arte, comprovante, título financeiro, movimento de estoque, custódia em facção ou referência converted_order_id. FKs SET NULL perderiam o vínculo e converted_order_id poderia ficar órfão.

Correção: guard de exclusão inclui aprovação/evidências e quoteItemId, além de EXISTS para os quatro vínculos no PostgreSQL dentro da transação/lock existentes. Memória cobre financeiro/movimentos/proposta; custódia não possui repositório em memória. Mantidos permissão, auditoria e rollback da exclusão livre. Sem migração ou política nova de cancelamento/estorno/retencão.

Validação: 78 testes locais, tipagem, build Vite e diff-check aprovados. Teste HTTP cobre metadados, vínculos, exclusão livre e rollback. Teste PostgreSQL adicional verifica cada relação independentemente, conservação das referências e rollback; execução depende da CI. Bundle 464,94 kB / 119,59 kB gzip. compile_applet indisponível; build Vite utilizado. Sem banco real, mensagem externa ou deploy. SQL direto e referências históricas já quebradas permanecem fora desta correção.

## Continuação de 29/10/2026: custo e equipe consistentes na edição de OP

Base: PR #18, commit 7e4916c8; CI 40864560399 aprovada.

Achados: custo de facção aceitava valor arbitrariamente grande e mais de duas casas decimais; PostgreSQL numeric(10,2) poderia arredondar silenciosamente ou falhar por overflow, divergindo da memória. O repositório substituía equipe vazia por um nome padrão, inclusive em conversão que explicitamente usa vazio.

Correções: PUT rejeita entradas fora do contrato numeric(10,2), trata corpo ausente como validação e preserva centavos. Formulário explicita teto. Repositório conserva equipe vazia e lê NULL como vazio, sem atribuição inventada. Nenhuma alteração de schema, política comercial ou limpeza de nomes históricos. Aprovação de arte e transições operacionais não foram modificadas.

Validação local: 79 testes, tipagem, build Vite e diff-check aprovados. Teste HTTP cobre negativo, casas excedentes, overflow, string, corpo ausente, zero, centavos, teto e rollback. Teste PostgreSQL adicional verifica recarga da equipe na conversão/edição, valores persistidos e ausência de mutações/auditoria após falha; depende da CI. Bundle 464,96 kB / 119,60 kB gzip. compile_applet indisponível; build Vite utilizado. Sem banco real, mensagem externa, merge ou deploy.

## Continuação de 29/10/2026: reenvio seguro da aprovação de arte

Base: PR #19, commit a5257166; CI 40865229363 aprovada.

Achado: repetir approve-art sobrescrevia responsável/data, repetia notas técnicas e adicionava auditoria, inclusive depois de a OP já estar aprovada. Falha de rede seguida de retry alterava a confirmação original.

Correção: se a OP já está aprovada, retorna a confirmação atual com alreadyApproved=true sem salvar/auditar novamente. Os dados novos de um reenvio não substituem os originais; a ação não é um fluxo de revisão/revogação de arte. Primeira confirmação mantém validação de nome, corpo ausente recebe 400, e auditoria/OP confirmam na mesma transação/lock. Sem migração, liberação automática do corte ou alteração financeira.

Validação local: 81 testes, tipagem, build Vite e diff-check aprovados. Dois testes HTTP e dois PostgreSQL adicionados cobrem oito chamadas concorrentes com uma confirmação/auditoria, replay com nome/arquivo diferente ou sem corpo, conservação dos metadados/notas/etapa, validação, rollback e retry. PostgreSQL depende da CI. Bundle permanece 464,96 kB / 119,60 kB gzip. compile_applet indisponível; build Vite usado. Sem banco real, mensagem externa, merge ou deploy. Evidência externa de aceite, S3 privado, revisão/revogação e reparo de metadados históricos seguem pendentes.

## Continuação de 29/10/2026: preservar data de conclusão no reenvio da etapa atual

Base: PR #20, commit ff2763be; CI 40865822620 aprovada.

Achado: solicitar novamente a etapa atual regravava updatedAt, adicionava ADVANCE_STAGE sem mudança real e, em entregue, substituía a data de conclusão pela data do reenvio.

Correção: após validação do destino e dos portões, etapa igual retorna alreadyAtStage=true sem salvar/auditar. Corpo ausente recebe 400. Transição real mantém rollback, autorização e regras de gate. Não inventa sequência de etapas ou reabertura. Sem chave durável de comando: reenvio após outra transição continua sujeito ao contrato anterior e exige controle de concorrência futuro. Não repara datas históricas.

Validação local: 83 testes, tipagem, build Vite e diff-check aprovados. Dois testes HTTP e dois PostgreSQL verificam oito chamadas concorrentes com uma auditoria, entrega histórica preservada, espera sem alteração, entradas inválidas, portões e rollback de transição. PostgreSQL depende da CI. Bundle permanece 464,96 kB / 119,60 kB gzip. compile_applet indisponível; build Vite usado. Sem migração, banco real, mensagem externa, merge ou deploy.

## Continuação de 29/10/2026: auditoria de bloqueio após rollback

Base: PR #21, commit 234b2e45; CI 40867369728 aprovada.

Achado: a rota inseria GATE_BYPASS_ATTEMPT na mesma transação encerrada por resposta 422; atomic revertia o evento no PostgreSQL. Memória mantinha a auditoria fora dos snapshots, mascarando a divergência.

Correção: rejeição auditada explícita desfaz a UoW de negócio antes de iniciar uma UoW independente de auditoria, e só responde 422 depois do commit do evento. Falha de auditoria retorna erro seguro e mantém a OP bloqueada. Rejeições comuns e transições válidas mantêm o fluxo existente. Snapshot do evento é capturado na tentativa original. Não confirma escritas rejeitadas para preservar o log. Sem migração, alteração de portões ou política comercial.

Validação local: 85 testes, tipagem, build Vite e diff-check aprovados. Teste da infraestrutura prova rollback antes do callback, rollback da segunda UoW em falha e rejeição comum inalterada. Teste HTTP cobre evento, OP intacta e falha de auditoria. Dois testes PostgreSQL adicionais cobrem quatro bloqueios concorrentes persistidos, falha de auditoria, escrita real revertida antes do log e rollback de log inserido seguido de falha; dependem da CI com pool de uma conexão. Endpoint de injeção existe somente no app de testes. Bundle permanece 464,96 kB / 119,60 kB gzip. compile_applet indisponível; build Vite usado.

Sem banco real, mensagem externa, merge ou deploy. Existe janela de falha entre rollback e auditoria; não há outbox/retry automático nem promessa de registro em queda do processo/banco. Eventos anteriormente perdidos não são reconstruídos. Cada tentativa bloqueada é um evento independente.

## Continuação de 29/10/2026: precisão e capacidade SQL na criação de propostas

Base: PR #22, commit 62a6f81d; CI 40868755168 aprovada.

A revisão confirmou bloqueio da mudança de status de proposta convertida. Achado na criação: custos/percentuais/preço negociado aceitavam valores com precisão maior que as colunas; valores derivados, somatórios e quantidade inteira podiam exceder o schema. Memória aceitava resultados que o PostgreSQL arredondaria ou rejeitaria.

Correção: validação técnica dos campos numeric de custo/preço/percentuais e dos resultados calculados/totais antes de reservar número. Grade total limitada à coluna integer. Corpo ausente/item nulo recebem 400. Motor de markup e arredondamento dos derivados, sinal e alçada existente não mudam; margem negativa representável continua aceita. Sem schema/migração nem política comercial nova.

Validação local: 87 testes, tipagem, build Vite e diff-check aprovados. Dois testes HTTP cobrem precisão/overflow de componentes, percentuais, preço, derivados, somatório e grade; comprovam ausência de reserva de número/mutação e preservação da fórmula decimal/margem negativa. Dois testes PostgreSQL adicionais verificam entradas inválidas sem contador/gravação e recarga de decomposição, percentuais e totais; dependem da CI. Bundle permanece 464,96 kB / 119,60 kB gzip. compile_applet indisponível; build Vite usado. Sem banco real, mensagem externa, merge ou deploy. Valores históricos já arredondados e demais contratos não são reconciliados/homologados por esta entrega.

## Nova revisão de 29/10/2026: documentação e preparação do deploy

Base: PR #23, commit 4701bea2; CI 40897687115 aprovada após reexecução de falha interna do runner Node. Revisados bootstrap, auth/RBAC, banco, Compose, Docker, CI, scripts operacionais, comunicação e documentos de status/deploy. Novo parecer consolidado em AUDITORIA_PRODUCAO_2026-10-29.md, com bloqueios, evidências e sequência de liberação; não confundir testes com homologação operacional.

Corrigidos guia de migração inicial, alegações de Redis/WA-AKG/zero downtime e status geral obsoleto. Compose usa loopback por padrão, Redis opcional e remove placeholder WA-AKG. Endpoint real passa a ser obrigatório antes de persistir/enviar mensagens WA-AKG. Healthcheck respeita PORT e CI verifica status healthy em porta customizada, além de validar Compose. Volumes históricos não são apagados. Compatibilidade de proxy/bind e endpoint deve ser revista no destino.

Validação local: 88 testes, tipagem e build aprovados; YAML verificado com parser. Docker/PostgreSQL dependem da CI ampliada. Auditoria npm encontrou quatro alertas moderados na cadeia de desenvolvimento Drizzle/esbuild e zero alertas com --omit=dev; nenhum downgrade automático aplicado. compile_applet indisponível; build Vite utilizado. Sem schema/migração real, mensagem externa, merge ou deploy. Novos documentos substituem instruções obsoletas; auditoria anterior permanece histórica.

A primeira execução desta revisão revelou fixtures PostgreSQL que dependiam do endpoint WA-AKG removido. Foram corrigidas para usar endpoint explícito com fetch interceptado; a espera do transporte agora propaga rejeição anterior à rede. Adicionado teste PostgreSQL de endpoint ausente sem nova intenção/requisição. Nenhum provedor externo é chamado nesses testes.
