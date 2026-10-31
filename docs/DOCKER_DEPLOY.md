# DE FARDAS — implantação e operação Docker

Revisão de 29/10/2026. Procedimento para ensaio em homologação; não representa autorização ou evidência de implantação no servidor contratado. Ver [bloqueios de produção](AUDITORIA_PRODUCAO_2026-10-29.md).

## Topologia e requisitos

O Compose padrão inicia `defardas-app` e `defardas-postgres` (PostgreSQL 16 próprio). A aplicação usa Node 22, usuário UID 1001 e sessões no PostgreSQL. Redis só inicia com `--profile optional-cache`; o runtime atual não o usa para sessões/cache/filas. Não há serviço WA-AKG fictício: um provedor real precisa ser provisionado e homologado separadamente. Volumes históricos não são apagados por esta alteração.

Docker Engine e Compose v2 com suporte a `env_file.required` (2.24 ou superior), Bash, gzip e sha256sum são necessários. Validar versões e compatibilidade no servidor de destino. O guia anterior citava Compose 2.20, incompatível com essa opção do arquivo.

A porta do ERP é publicada somente em `127.0.0.1:${PORT:-3000}` por padrão. Configurar proxy HTTPS na topologia contratada; se o proxy for outro container/host, ajustar `APP_BIND_ADDRESS` e redes/firewall deliberadamente. Não assumir zero downtime, alta disponibilidade ou rate limiting distribuído. O proxy não deve expor PostgreSQL/Redis e trust proxy precisa ser definido conforme a topologia real; o código atual não confia em X-Forwarded-For arbitrário.

## Instalação inicial em banco novo

Somente na primeira instalação, sem substituir um `.env` existente:

```bash
cp .env.example .env
chmod 600 .env
```

Preencher `POSTGRES_PASSWORD`, usuário/banco e configuração institucional real. O Compose monta a URL interna usando `POSTGRES_*`; não usa `DATABASE_URL` do arquivo para escolher outro servidor. Usar senha aleatória compatível com URL (por exemplo hexadecimal de alta entropia); caracteres reservados exigem tratamento de codificação da URL na configuração. Nunca versionar `.env` nem imprimir a configuração expandida com segredos em logs/tickets. Para PostgreSQL remoto contratado, preparar variante do Compose com URL/TLS/CA e dependências adequadas, ensaiando-a separadamente.

`DATABASE_SSL_MODE=disable` no Compose vale para o PostgreSQL da rede interna local. Não copiar esse modo para banco remoto sem avaliar a rede/TLS. S3 e Gemini não são ativados por simplesmente preencher variáveis. Deixar WA-AKG sem endpoint/chave enquanto não houver serviço real; envio sem configuração é bloqueado.

A aplicação exige schema migrado para iniciar. Construir a imagem e executar o runner de migração em container temporário antes de subir a aplicação:

```bash
docker compose config --quiet
docker compose build defardas-app
docker compose up -d --wait defardas-postgres
docker compose run --rm --no-deps defardas-app npm run db:migrate
```

Usar somente `drizzle/` e seu journal. Não aplicar junto os arquivos SQL históricos de `migrations/`. A imagem final não contém drizzle-kit; não usar `npx drizzle-kit migrate` nem depender de `exec` em uma aplicação que ainda não consegue iniciar.

Provisionar o primeiro administrador com `ADMIN_EMAIL`, `ADMIN_NAME` e `ADMIN_PASSWORD` exportados temporariamente no shell, sem inserir senha literal no histórico:

```bash
docker compose run --rm --no-deps -e ADMIN_EMAIL -e ADMIN_NAME -e ADMIN_PASSWORD defardas-app npm run admin:create
unset ADMIN_EMAIL ADMIN_NAME ADMIN_PASSWORD
docker compose up -d --no-deps --wait defardas-app
docker compose ps
curl --fail --max-time 5 http://127.0.0.1:3000/api/health
```

Ajustar a porta do curl se PORT for diferente. O provisionamento recusa e-mail existente; não substitui conta. Gestão dos demais acessos usa `npm run user:manage` conforme [operação transacional](OPERACAO_TRANSACIONAL.md). Conferir login, perfis, dados da empresa e jornada funcional em HTTPS antes de qualquer liberação. Não existe senha operacional padrão.

## Atualização e recuperação

Escolher um commit/release revisado e aprovado, evitando atualizar produção por `git pull` sem revisão. Ensaiar migrações em cópia restaurada do banco e conferir constraints, duplicidades e dados antigos. Registrar backup, commit anterior e plano de recuperação. Neste modelo, programar manutenção; não há garantia de zero downtime.

1. Fazer backup e validar restauração em banco isolado.
2. Construir a imagem do commit escolhido, interromper tráfego/escritas e parar a aplicação.
3. Executar `docker compose run --rm --no-deps defardas-app npm run db:migrate` com o banco ativo.
4. Subir a aplicação, conferir healthcheck interno, HTTPS, login e jornada comercial/financeira/produção.
5. Se falhar, manter tráfego interrompido e aplicar o plano ensaiado. Voltar somente a imagem não desfaz migração nem garante compatibilidade com schema/dados novos.

## Backup e restauração

```bash
BACKUP_DIR=/caminho/privado/backups bash scripts/backup.sh
```

Scripts usam container `defardas-postgres` e nomes padrão de usuário/banco, ou `DATABASE_URL` e ferramentas PostgreSQL locais quando o container não está disponível. Exportar `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_CONTAINER` se personalizados; o script não carrega `.env` automaticamente. Diretório deve ter acesso restrito. O padrão `RETENTION_DAYS=30` é configuração do script, não política empresarial homologada. Definir retenção, cópia externa, criptografia, alertas e responsáveis na operação.

Para restaurar, primeiro parar aplicação e demais escritores, confirmar o banco de destino e preservar evidência do estado anterior:

```bash
POSTGRES_DB=defardas_restore_test bash scripts/restore.sh /caminho/privado/backup.sql.gz
```

Banco de destino deve existir e ter acesso adequado. O comando é destrutivo nesse destino e pede confirmação. `--force` dispensa a pergunta e é usado somente no ensaio automatizado autorizado. SHA-256 valida bytes contra o checksum acompanhante; não prova autenticidade se ambos forem substituídos. Restore usa uma transação e falha em erro SQL; não encerra conexões nem para a aplicação automaticamente. Não usar `docker compose down -v`: apaga volumes.

A CI comprova Compose válido, imagem construída/iniciada, health interno com PORT=3300, HTTP, desligamento e backup/restauração em banco descartável. Isso não comprova DNS, certificados, volumes, cópia externa ou capacidade no servidor real.

## Configuração TLS do PostgreSQL

DATABASE_SSL_MODE aceita apenas `disable`, `require` e `verify-full`; modo desconhecido/vazio impede inicialização. Em produção, ausência usa `require` com validação de certificado. Quando TLS é solicitado, certificados são validados também fora de produção. DATABASE_CA_CERT recebe o conteúdo PEM da CA, não caminho de arquivo. `verify-full` não admite desativar validação.

O ambiente da aplicação controla TLS. Preferir DATABASE_URL sem parâmetros SSL. `sslmode` redundante na URL só é aceito uma vez e com o mesmo modo efetivo; é removido antes de entregar a URL ao driver, preservando a configuração de CA. `ssl`, `sslcert`, `sslkey`, `sslrootcert`, `sslnegotiation`, `uselibpqcompat` e outros parâmetros com prefixo ssl são rejeitados. Certificado de cliente/mTLS por URL não é suportado neste contrato. Configurações existentes com essas opções precisam ser revistas antes da atualização.

DATABASE_ALLOW_INSECURE_SSL é booleano textual `true`/`false`; `true` só é aceito em `require`, sem CA, e desabilita verificação de certificado explicitamente. Não usar esse escape para homologar PostgreSQL remoto; preferir `verify-full` com CA/certificado corretos. TLS desativado não admite CA ou escape inseguro conflitantes e não herda PGSSLMODE do processo. O Compose local mantém disable explícito para a rede interna.

DATABASE_POOL_MAX deve ser inteiro positivo em formato decimal; padrão 20, sem aceitar sufixos como `20abc`, zero ou frações. Configuração inválida encerra o processo antes da conexão e registra DATABASE_CONFIG_INVALID, sem imprimir URL, CA ou valores recebidos. Corrigir ambiente e reiniciar; nunca divulgar credenciais em diagnóstico. Essas verificações não substituem ensaio de certificado, hostname e conectividade no destino real. Scripts Bash de pg_dump/psql usam ferramentas libpq e seu próprio contrato de TLS; não recebem automaticamente a configuração Node.

## Atualização com revisão da OP (migração 0006)

Executar 0006_order_revision pelo runner oficial antes de iniciar esta versão. A migração adiciona coluna revision com valor inicial 1 para OPs existentes e trigger de incremento em atualizações. Journal e snapshot Drizzle acompanham a coluna; o bloco SQL customizado da função/trigger precisa ser preservado. Não altera etapa, pagamentos ou datas históricas. Ensaiar em cópia restaurada e programar manutenção para locks da alteração de schema.

Bootstrap passa a verificar a coluna antes de servir. A API de avanço de etapa exige expectedRevision; atualizar frontend e clientes próprios em conjunto. Cliente antigo sem campo recebe 400; conflito exige releitura e decisão do usuário. Não é atualização transparente por rolling deploy entre contratos diferentes. Restauração/rollback deve preservar schema/trigger e evidência da migração; não remover coluna/trigger em banco real sem plano ensaiado. CI deve validar migração, concorrência, backup/restauração e imagem antes da implantação.

A verificação de restauração da CI compara também IDs/revisões das OPs e executa um UPDATE de notas sem mudança de conteúdo no banco restaurado descartável, exigindo revision anterior + 1. Isso testa a presença funcional do trigger após restore; não executa escrita no banco de origem ou no ambiente real.


PORT explícito deve ser inteiro decimal canônico de 1 a 65535, sem espaços, zeros iniciais ou sufixos. Ausência usa 3000; valor inválido impede startup. Ajustar também proxy, publicação e healthcheck à porta escolhida.
