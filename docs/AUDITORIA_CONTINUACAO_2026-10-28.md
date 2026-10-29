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
