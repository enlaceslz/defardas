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
| PROD-06 / P1 | Reenvio da etapa atual é seguro; após outra transição ainda falta chave durável/versão | Implementar precondição/versionamento ou comandos persistidos com testes de concorrência e reenvio atrasado |
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
