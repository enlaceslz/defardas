# Auditoria e preparação para produção — DE FARDAS

Registro histórico; estado consolidado atual em [auditoria de 29/10/2026](AUDITORIA_PRODUCAO_2026-10-29.md). Os números e pendências abaixo correspondem à revisão original.

Data: 28/10/2026. Repositório: `enlaceslz/defardas`. Trabalho na branch `fix/production-audit`, PR #1.

**Parecer: núcleo transacional implementado e testado; liberação operacional ainda condicionada às integrações e à homologação descritas abaixo.** Não foi alterada a infraestrutura contratada nem o banco operacional.

## Correções implementadas

| Área | Comportamento atual |
|---|---|
| Banco e bootstrap | Produção exige PostgreSQL, aguarda conexão e verifica tabelas essenciais de migração antes de servir; health faz consulta real e não expõe contagens privadas |
| Autenticação | Produção não cria usuários demonstrativos; consultas de sessão verificam usuário ativo no banco a cada requisição, gravação e revogação aguardam confirmação |
| RBAC/CSRF | Mutações comerciais e aprovação de arte aplicam permissões; permissão desconhecida é negada; CSRF funciona montado em `/api`, sem isenções por prefixos parecidos |
| Webhooks e rate limit | Meta exige assinatura HMAC dos bytes originais; WA-AKG exige segredo; segredo ausente bloqueia ingestão; IP arbitrário em X-Forwarded-For não contorna rate limit |
| Transações | Conversão, financeiro, estoque, clientes e propostas executam em uma unidade de trabalho; repositórios e auditoria usam o mesmo cliente PostgreSQL; resposta JSON sai após COMMIT |
| Concorrência | Mutações ERP usam advisory lock transacional entre instâncias; lock é global nesta primeira versão para priorizar integridade; futura granularidade deve ser medida com testes de concorrência |
| Conversão | Uma OP por item, com vínculo ao item e preservação da grade; sinal e saldo por proposta; conversões simultâneas retornam o mesmo conjunto de OPs; falha parcial desfaz tudo |
| Numeração | Contadores persistentes transacionais, inicializados a partir dos sufixos existentes, sem fallback local em produção |
| Financeiro | Títulos de pedido só nascem na conversão; baixa confere valor/vínculo com proposta, é idempotente, atualiza todas as OPs; pagamento e aprovação não avançam corte automaticamente; saldo liquidado marca quitação |
| Estoque | Item, movimento e auditoria confirmam juntos; concorrência não permite remessa acima do saldo; saldo inicial gera evento; ajustes são deltas assinados e edição rejeita saldo desatualizado |
| Cadastro e exclusão | Cliente é realmente persistido/excluído, campos editáveis têm allowlist; vínculos e histórico impedem exclusões inconsistentes; não existe exclusão fictícia por totalOrdersCount=-1 |
| Auditoria | Eventos críticos são persistidos no PostgreSQL na transação da operação; consulta limitada a administradores |
| Interface | CRUD principal chama API e recarrega fonte autoritativa; formulários aguardam sucesso, mantêm dados em erro e bloqueiam duplo envio; OPs/títulos/comprovantes não são gerados aleatoriamente no navegador |
| Sessão no navegador | Dados privados não são gravados em localStorage; caches legados são removidos; troca de usuário limpa estado e bloqueia renderização de dados de outra sessão |
| Identidade e valores | Número exibido e UUID interno separados; adaptadores preservam zero, resolvem custo por item e não inventam contatos/preços; ficha impressa reflete gates reais |
| Perfil e emissão de OP | Perfil institucional persiste no servidor com edição por admin; emissão passa pela proposta aprovada; editor de OP altera planejamento sem liberar gates ou modificar item aprovado |
| Demonstração | Login de produção não mostra ajudante de credenciais; novas propostas começam sem custos/grades/prazos demonstrativos ou cláusulas comerciais inventadas |
| WhatsApp | HTTP 4xx/5xx, timeout e ausência de configuração resultam em failed; QR/reconexão simulados não operam em produção |
| Build/runtime | Lock npm sincronizado; Docker respeita `.npmrc`, usa npm ci, remove dependências de desenvolvimento, exclui `.env*`/backups do contexto e executa com usuário sem privilégios |
| Operação | Migração usa runner Node/Drizzle disponível na imagem; administrador é provisionado por variáveis de ambiente, sem senha padrão; desligamento fecha HTTP e pool |
| Backup | Dump sem TTY, arquivo temporário, permissão restrita, teste gzip e checksum; restore exige checksum, falha em erro SQL e aplica uma transação única |

## Evidências

- 21 testes locais passaram: 15 de segurança/HTTP e 6 de componentes/adaptadores/isolamento de cache.
- 10 testes com PostgreSQL 16 real passaram na CI: gravação dos itens/custos, 8 conversões simultâneas, gate por API e constraint SQL, repetição de baixa, quitação do saldo, rollback por falha injetada no segundo título, concorrência de estoque, auditoria persistente, perfil institucional e provisionamento CLI sem substituição de conta.
- Backup e restauração em outro banco descartável passaram na CI, com conferência de existência de OPs restauradas.
- `npm run lint`, `npm run build`, `git diff --check` e sintaxe Bash passaram localmente.
- Bundle JS principal ficou em aproximadamente 464 kB minificado / 119 kB gzip, abaixo do aviso anterior de 500 kB; não houve reescrita visual das telas principais.
- A CI construiu e iniciou a imagem de produção, verificou HTTP/health e testou desligamento com sucesso (execução 40735127236). Consulte também a execução do commit final no PR.
- `compile_applet`, referido no AGENTS.md, não está disponível; foi usado `npm run build`, o build real do projeto.
- Testes de componentes usam JSDOM. Isso não equivale a homologação visual completa em navegador, celular ou impressão física.

## Migrações e compatibilidade

A trilha oficial usada pelo runtime é `drizzle/` e seu journal. Os arquivos históricos de `migrations/` não devem ser aplicados junto com ela.

Novas migrações adicionam vínculo da OP ao item, contadores, unicidade de conversão/títulos, checks de quantidade/valor/gate e perfil institucional. Os contadores usam o maior sufixo numérico existente; não fazem reset anual.

**Em banco existente:** fazer backup, ensaiar em uma cópia e verificar duplicidades, títulos com valor zero/negativo, OPs sem gate e conversões antigas incompletas. As constraints podem recusar dados inconsistentes. Nenhum dado histórico é apagado/corrigido silenciosamente pela migração. OPs antigas sem quote_item_id continuam representando seu histórico; a migração não adivinha a distribuição de itens de conversões anteriores.

A alteração de metadata da OP não altera grade, modelo, valor negociado, financeiro ou aprovação da arte. A ação Nova OP leva ao fluxo de proposta comercial para evitar produção sem origem/preço homologado. Cancelamento/estorno de pedidos já convertidos precisa de fluxo de negócio definido; exclusão isolada é bloqueada.

## Pendências para liberação operacional

1. **Anexos privados/S3:** o upload completo e a validação de posse do arquivo ainda não estão implementados. A baixa exige autenticação bancária e URL HTTPS real, mas HTTPS sozinho não prova que o arquivo está no armazenamento privado contratado. Integrar upload privado, assinatura temporária, validação de MIME/tamanho e vínculo de evidência antes de operar dados reais.
2. **Recuperação de senha e administração da equipe:** tokens agora são persistidos como hash, com troca/revogação/auditoria atômicas e recuperação administrativa via CLI. O endpoint público retorna 503 em produção até haver entrega real de e-mail e interface de redefinição. Existe provisionamento inicial de admin por CLI, sem contas padrão; completar o gerenciamento seguro dos demais usuários.
3. **WhatsApp operacional:** WA-AKG no Compose é um placeholder que não executa servidor. Substituir por serviço homologado, implementar QR/reconexão reais, deduplicação de entrada e recibos de entrega. Meta precisa de credenciais e ensaio do contrato do provedor. Nenhuma mensagem foi enviada durante a auditoria.
4. **Importação de backup legado:** endpoint de localStorage permanece bloqueado em produção. A interface não relata mais restauração fictícia. Restauração operacional suportada nesta entrega é o backup PostgreSQL testado; migração de JSON antigo precisa de normalização e validação específicas.
5. **RBAC de leitura e privacidade:** as permissões de mutação existentes foram preservadas/aplicadas. Homologar com a diretoria quais perfis podem ler custos, financeiro e dados pessoais; autenticação sozinha não é uma matriz de visibilidade completa. Não foram inventadas políticas de comissão, desconto ou estorno.
6. **Infraestrutura real:** faltam ensaio no servidor contratado, configuração de HTTPS/domínio e trust proxy conforme topologia, TLS do PostgreSQL remoto, acesso privado ao bucket, retenção/armazenamento externo de backups e alertas. A configuração Vercel atual publica SPA, não o ERP completo.
7. **Homologação funcional/visual:** executar a jornada real com todos os perfis, artes/comprovantes reais, impressão e aparelhos usados na empresa, incluindo perda de rede, reinício e duas instâncias. Não considerar badges de teste na interface como evidência independente de produção.
8. **Escala e ferramentas:** listagens ainda precisam de paginação. O N+1 de itens em QuoteRepository foi removido por JOIN em uma única consulta. O lock global limita throughput; medir antes de granularizar. O audit npm original reportou quatro ocorrências moderadas na cadeia de desenvolvimento drizzle-kit/esbuild; não foi feito downgrade incompatível. Ferramentas de desenvolvimento saem da imagem final, mas devem continuar avaliadas no ambiente de engenharia.

## Como prosseguir

1. Aplicar o PR em homologação, configurar PostgreSQL e executar `npm run db:migrate` (nunca combinar com SQL histórico).
2. Provisionar admin com `ADMIN_EMAIL`, `ADMIN_NAME` e `ADMIN_PASSWORD` no ambiente e executar `npm run admin:create`; não versionar esses valores.
3. Configurar os dados reais da empresa na tela Configurações.
4. Concluir os itens 1–5 acima e ensaiar a operação na infraestrutura contratada.
5. Só liberar produção após registrar evidências e resolver os bloqueios; não foi executado merge ou deploy automaticamente.

Continuação: ver [auditoria de autenticação e consultas](AUDITORIA_CONTINUACAO_2026-10-28.md) para alterações posteriores e suas evidências.
