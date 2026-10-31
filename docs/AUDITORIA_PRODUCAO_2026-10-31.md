# Revisão de produção — 31/10/2026

**Parecer: operação real ainda condicionada aos bloqueios P0 abaixo.**

## Escopo e evidência

Releitura do startup HTTP, montagem das rotas, autenticação das mutações, configuração S3 declarada, limitador e status consolidado. Não é revisão exaustiva de todo o código nem ensaio do ambiente contratado. Sem acesso ao banco real, deploy, migração operacional ou mensagens externas.

Base incremental: PR #58, commit 24fd4d83. Sua CI foi consultada e está aprovada: https://github.com/enlaceslz/defardas/actions/runs/41211266091. As branches de correção não comprovam integração em main ou implantação.

## Achados e tratamento

| Prioridade | Evidência | Tratamento / aceite |
|---|---|---|
| P1 corrigido | PORT usava parseInt e aceitava valores como 3000abc | Parser exige decimal canônico entre 1 e 65535; ausência usa 3000, vazio/fração/zero/overflow falham com mensagem fixa sem ecoar configuração. Teste cobre fronteiras e formatos inválidos. |
| P0 aberto | .env.example declara S3 não implementado; runtime sem fluxo de upload privado | Implementar armazenamento contratado, vínculo e autorização por arquivo, tamanho/MIME e acesso temporário. Não considerar URL HTTPS prova de posse ou autenticidade. |
| P0 aberto | Listagens de clientes, propostas, OPs, financeiro e estoque exigem autenticação, mas não matriz de leitura por perfil | Homologar matriz com responsáveis e aplicá-la ao backend e SPA. Não inventar alçadas de leitura. |
| P0 aberto | Host contratado não foi acessado nesta revisão | Ensaiar HTTPS/proxy/TLS PostgreSQL, segredos, volumes, monitoramento e recuperação em cópia isolada. Registrar responsáveis e RPO/RTO. |
| P1 aberto | Rate limit usa memória e IP visto pelo Express; trust proxy depende da topologia | Definir proxy confiável e testar IP real sem aceitar X-Forwarded-For arbitrário; limitação distribuída se houver múltiplas instâncias. |
| P1 aberto | Cadeia de PRs incrementais ainda requer integração/homologação | Consolidar commit de release em homologação, executar migrações/clientes API e registrar evidências. Não implantar branches avulsas como se fossem release integrado. |

## Verificação desta entrega

140 testes locais, tipagem, build e diff-check aprovados. CI desta entrega ainda pendente, incluindo PostgreSQL, backup/restauração e Docker. Não foi repetida auditoria de dependências nesta rodada; resultados antigos não são revalidados por esta nota. Testes JSDOM não homologam navegador, impressão ou dispositivos reais.

Mudança de compatibilidade: PORT explícito com espaços, zeros iniciais, zero, fração ou sufixos passa a impedir startup. Configurações existentes devem usar valor canônico, por exemplo 3000 ou 3300. Sem migração de banco ou nova regra comercial.

## Ordem de execução

1. Consolidar cadeia em homologação e registrar commit/migrações/clientes.
2. Resolver armazenamento privado e matriz de leitura com infraestrutura e responsáveis.
3. Ensaiar host, restauração e jornadas críticas; documentar falhas/reenvios e impressão.
4. Decidir liberação operacional com evidências e escopo aceito; manter estorno, comissão e fiscal sem automação não homologada.

Ver [status consolidado](DEVELOPMENT_STATUS.md), [auditoria anterior](AUDITORIA_PRODUCAO_2026-10-29.md) e [implantação](DOCKER_DEPLOY.md).


## Continuação: configuração explícita de proxy

Implementada TRUST_PROXY_CIDRS opcional, desativada por padrão e restrita a IP/CIDR literal sem /0, booleano ou contagem de saltos. O runtime agora permite configurar a topologia sem alterar código. Testes HTTP verificam confiança desativada e parada da cadeia no primeiro endereço não confiável. Validação local: 142 testes, tipagem e build aprovados. CI desta continuação pendente. O achado de proxy continua dependendo de ensaio no host; não foi homologada topologia nem implementado rate limit distribuído. Demais bloqueios P0 permanecem.
