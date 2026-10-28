# Auditoria de preparação para produção — DE FARDAS

Data: 28/10/2026. Base examinada: `43e7da05a341cb232584ad5b0d262eb1ff193c18` (`main`).

**Parecer: NÃO LIBERAR para operação real.** O build funciona, mas existem fluxos demonstrativos e lacunas de persistência que podem produzir divergências comerciais e financeiras. Esta entrega corrige uma primeira camada de segurança; não equivale à homologação de produção.

## Escopo e limitações

Revisão estática de frontend React, API Express, autenticação, repositórios Drizzle/PostgreSQL, migrações, Docker/Compose, configuração Vercel e backup/restauração. Foram executados testes HTTP locais de segurança, tipagem, build e auditoria npm.

Não foram fornecidos acesso ao PostgreSQL contratado, credenciais S3, ambiente de homologação, provedor WhatsApp operacional, SMTP ou domínio/reverse proxy. Docker e psql não estão disponíveis neste ambiente. Não foram executadas migrações em banco real, restauração de backup, testes do container nem testes de ponta a ponta no navegador. `compile_applet`, requerido no AGENTS.md, não está disponível; foi executado `npm run build`, o comando real de produção do repositório.

## Correções nesta branch

| Achado | Correção |
|---|---|
| Contas de demonstração eram criadas inclusive em produção; busca sem resultado podia retornar conta local com senha conhecida | Seed de usuários desabilitado em produção, consulta autoritativa e propagação de falhas do PostgreSQL |
| Produção iniciava sem PostgreSQL e podia confirmar operações somente em memória | Bootstrap aguarda inicialização; ausência/falha da conexão impede inicialização; repositórios aguardam readiness e propagam erros em produção; caches não recebem escritas de produção |
| Sessões eram gravadas/removidas sem aguardar confirmação e validadas por cache local | Persistência aguardada, lookup por sessão ativa e usuário ativo no banco em cada requisição, revogação aguardada e compartilhada entre instâncias |
| Exceções CSRF não funcionavam com middleware montado em `/api` | Comparação de caminhos completos, métodos restritos a POST e sem isenção por prefixos semelhantes |
| Criação/status/conversão de proposta e aprovação de arte não aplicavam permissões existentes | Aplicação da matriz de permissões; permissões inexistentes negadas por padrão |
| Etapa/status arbitrários e desbloqueio de proposta convertida | Validação de enums, bloqueio de alteração de status de proposta convertida e conferência do gate para qualquer destino fabril |
| ID de proposta incompatível com coluna UUID | Geração com `crypto.randomUUID()` |
| Rate limiter aceitava `X-Forwarded-For` arbitrário | Usa `req.ip` conforme política de proxy do Express (não confiável por padrão) |
| Webhooks de mensagens sem autenticação; token Meta com fallback público | HMAC SHA-256 sobre bytes originais no webhook Meta, segredo dedicado no WA-AKG, ausência de configuração retorna erro |
| Importação escrevia apenas em Maps e devolvia sucesso em produção | Endpoint retorna 501 em produção até existir importação transacional persistente |
| QR/reconexão simulados informavam conexão operacional | Produção não gera QR fictício nem confirma reconexão com temporizador |
| WhatsApp ignorava HTTP 4xx/5xx e podia marcar envio sem provedor | Valida HTTP, aplica timeout e registra status failed para falha/ausência de configuração |
| Captura pública podia devolver ficha privada de cliente existente por telefone/nome | Resposta contém apenas identificador do lead; não cria cadastro fiscal com CNPJ fictício nem consulta carteira privada no POST público |
| Erros assíncronos Express 4 sem tratamento central | Ponte express-async-errors e resposta JSON genérica; rotas API inexistentes retornam 404 JSON |
| Healthcheck sempre saudável e expunha contagens internas | SELECT 1 real, 503 quando indisponível, sem contagens privadas |
| Lock npm divergente, senha PostgreSQL padrão no Compose | Lock regenerado, Docker usa npm ci, senha obrigatória e SSL explicitamente desabilitado só para banco interno do Compose |
| Avanço e aprovação na UI ignoravam falhas HTTP; coleções vazias não limpavam estado | UI respeita erros nessas ações, preserva UUID separado do número de exibição e aceita respostas vazias; aprovação de arte não avança etapa automaticamente |
| Ausência de CI executável | Workflow com instalação, tipagem, testes de segurança e build |

## Bloqueios remanescentes e critérios de aceite

### P0 — persistência e consistência

1. **Frontend ainda tem fluxos locais.** `src/App.tsx`: handlers de criação/edição/exclusão de OP, proposta, cliente, inventário e títulos alteram `state`/localStorage sem persistência completa. Conversão cria OPs/títulos locais aleatórios enquanto chama API sem conferir resultado. Pagamento cria nomes de comprovante fictícios e muda estado mesmo quando a API exige URL real e rejeita a baixa. Confirmação de entrada pode ocorrer só no navegador.
   - Aceite: todas as ações usam endpoints reais e só atualizam tela após sucesso; erro não altera estado; repetir, recarregar e abrir em outro navegador mantém o mesmo dado; comprovante real privado e autorização exigidos.
2. **Conversão não é atômica nem segura sob concorrência.** `server/routes/quotesRoutes.ts`: lookup, INSERT de OP, dois títulos e UPDATE da proposta acontecem separadamente. A chave canônica corrigida evita variar a chave por cabeçalho, mas não resolve corrida nem recuperação após gravação parcial. A OP agrega quantidade de todos os itens e usa descrição/grade somente do primeiro.
   - Aceite: transação PostgreSQL com bloqueio de proposta, constraints de identidade da conversão e dos títulos; rollback integral sob falha; chamadas simultâneas retornam o mesmo resultado; modelagem de todos os itens/grades preservada e homologada.
3. **Numeração persistente não está efetivamente conectada aos fluxos.** `server/services/sequenceService.ts` tem métodos Async, mas rotas usam contadores locais síncronos. O journal Drizzle não cria as sequences referenciadas. Reinício/múltiplas instâncias podem colidir.
   - Aceite: migração de sequences/contadores inicializados conforme dados existentes e uso exclusivamente persistente na produção, sem fallback local em erro.
4. **Baixa financeira e gate da OP não são uma transação.** `server/routes/financeRoutes.ts` salva título e OP separadamente; não há reconciliação integral do valor efetivamente recebido, saldo final ou prevenção de vínculo indevido por payload na criação de título.
   - Aceite: transação, validação de valor/vínculo, repetição segura e testes negativos (título errado/valor insuficiente/falha entre etapas). Políticas de alçada/reembolso não devem ser inventadas.
5. **Estoque sujeito a perda de atualização e eventos incompletos.** `server/routes/inventoryRoutes.ts` lê saldo e salva item/movimento em operações distintas; ajuste faz sobrescrita do saldo e perda usa clamp em zero.
   - Aceite: eventos compensatórios, lock/UPDATE condicional, saldo e evento na mesma transação; teste concorrente e rastreabilidade por OP/facção. Homologar semântica de ajustes e perdas.
6. **Auditoria só em memória.** `server/services/auditService.ts` mantém no máximo 500 eventos e os perde no reinício, embora exista schema de auditoria.
   - Aceite: gravação persistente e eventos críticos na mesma transação da ação, com ator e evidências verificáveis, acesso restrito e retenção definida.
7. **Isolamento de dados no navegador incompleto.** `src/App.tsx` inicializa estado de localStorage, conserva dados quando respostas falham e não demonstra isolamento por usuário/logout. Custos/contatos têm defaults demonstrativos que podem substituir dados reais ausentes.
   - Aceite: estado limpo por sessão, sem cache privado compartilhado, tratamento explícito de erro e ausência de dados fictícios em telas/documentos reais; RBAC de leitura homologado por perfil.

### P1 — implantação e integrações

8. **S3 e comprovação documental:** variáveis existem, mas não há fluxo completo de upload privado/validação/URLs assinadas, necessário para artes, comprovantes e fichas.
9. **WA-AKG:** Compose inicia `node:20-alpine` com `tail -f /dev/null`; não existe servidor real. Provisionar imagem/serviço homologado; validar QR, reconexão, deduplicação por ID externo e callback autenticado. Meta também precisa de testes de retorno e recibos de entrega. Não ativar canais falsamente como conectados.
10. **Recuperação e provisionamento de usuários:** recuperação gera token em memória e não envia e-mail. Sem seed de produção, é necessário provisionar administrador de forma controlada no PostgreSQL (senha própria com bcrypt), implantar entrega de e-mail e token persistente de uso único. Nunca reativar conta padrão como atalho.
11. **Vercel atual hospeda apenas SPA:** `vercel.json` reescreve tudo para index.html e não hospeda Express/PostgreSQL. Para ERP completo usar runtime Node persistente/container com API na mesma origem, ou desenhar/provar outro arranjo. Não interpretar publicação estática como ERP operacional.
12. **Migrações concorrentes:** há SQL em `migrations/` e journal Drizzle em `drizzle/`. Definir uma trilha oficial, testar banco vazio e upgrade com dados reais em cópia de homologação, incluindo constraints, FKs, índices e sequences. Não executar seed demo em produção.
13. **Backup/restauração:** scripts existem, mas precisam de ensaio. Remover TTY no pg_dump, gravar arquivo temporário com permissões restritas e renomear só após sucesso; usar ON_ERROR_STOP na restauração, verificar integridade e provar recuperação em banco isolado. Não testar restauração sobre o banco operacional.
14. **Operação:** comprovar HTTPS, política de trust proxy conforme topologia real (sem aceitar origem forjada), desligamento gracioso, logs/redação de dados sensíveis, alertas, disponibilidade do banco, orçamento de conexões e monitoramento externo. Para PostgreSQL remoto usar TLS verificado; Compose usa rede interna sem TLS por escolha explícita.
15. **Validação de entrada e leitura:** expandir schemas de request para datas, montantes finitos, quantidades, IDs e enums de todas as rotas. Homologar quais perfis podem listar financeiro/custos/dados pessoais; autenticação sozinha não define segregação de leitura. Aplicar limitação ao formulário público e webhooks, com política de proxy validada.

### P2 — desempenho e manutenção

16. `QuoteRepository.findAll()` faz N+1 para itens, sem paginação; demais listagens também não têm limites. Implementar paginação/consultas agrupadas e índices guiados por EXPLAIN em volume representativo.
17. Bundle inicial JavaScript ~516 kB minificado (~131 kB gzip) na verificação local. Dividir módulos por tela com lazy loading depois de estabilizar persistência.
18. `npm audit` após atualização do lock: quatro ocorrências moderadas na cadeia de ferramentas `drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild` (advisory GHSA-67mh-4wv8-2f99). Sem ocorrências altas/críticas reportadas nessa execução. A correção automática sugerida regride drizzle-kit para 0.18.1; não foi aplicada por incompatibilidade potencial. Reavaliar versão/toolchain e remover ferramentas de desenvolvimento da imagem final após compilar servidor/migrador adequadamente. Ausência de alerta npm não prova ausência de vulnerabilidades.

## Validação da entrega

- Instalação limpa com `npm ci --ignore-scripts --no-audit --no-fund` concluída após atualização do lock. Scripts de dependências não foram executados nesse comando.
- `npm run lint`: sem erros.
- `npm test`: suíte HTTP local de segurança, autenticação, RBAC, CSRF, webhooks, rate limit, falha de bootstrap e propagação de falhas de persistência. Dependências PostgreSQL das duas simulações de falha são substituídas explicitamente, sem banco real.
- `npm run build`: concluído; aviso de tamanho de bundle registrado acima.
- `git diff --check`: sem erros.
- CI adicionada, mas sua execução remota deve ser conferida no GitHub após abertura do PR.

## Sequência recomendada para conclusão

1. Corrigir fonte de verdade do frontend e transações de conversão/financeiro/estoque; adicionar testes com PostgreSQL descartável de homologação.
2. Persistir auditoria, numeradores, recuperação de conta e importação; padronizar migrações e provisionar usuário inicial.
3. Integrar armazenamento privado e provedores reais; homologar regras comerciais pendentes com a diretoria, preservando markup, tríade de estados e gate fabril.
4. Executar jornada completa com perfis reais em homologação: lead → cliente → proposta com vários itens → aprovação → conversão concorrente → comprovante → corte → produção → entrega → saldo → auditoria. Incluir falhas de rede, reinício e duas instâncias.
5. Provar instalação/upgrade, backup e restauração; revisar evidências, corrigir bloqueios e só então liberar produção.

Nenhuma implantação, migração de banco operacional, envio de WhatsApp ou integração externa foi executada nesta auditoria.
