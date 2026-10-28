# Guia de Implantação e Operação Docker — DE FARDAS ERP

Este documento orienta a equipe de operações e engenharia sobre como compilar, implantar, executar migrações e realizar backups do sistema **DE FARDAS ERP** em servidores de produção.

---

## 1. Visão Geral da Arquitetura de Contêineres

O ambiente de contêineres é orquestrado através do `compose.yaml` com 4 serviços:

1. **`defardas-app`**:
   - Imagem construída a partir do `Dockerfile` multi-stage em Node 22-alpine.
   - Executa a aplicação React 19 compilada e o servidor Express com endpoints modulares.
   - Roda sob usuário não-privilegiado (`defardas:defardas`, UID 1001).
   - Possui healthcheck interno em `GET /api/health`.

2. **`defardas-postgres`**:
   - Imagem oficial `postgres:16-alpine`.
   - Banco de dados relacional próprio da DE FARDAS.
   - Volumes nomeados para persistência em disco: `defardas_postgres_data`.
   - Isolado na rede interna `defardas-internal`.

3. **`defardas-redis`**:
   - Imagem oficial `redis:7-alpine`.
   - Utilizado para sessões, cache e filas assíncronas com persistência AOF ativada.

4. **`defardas-wa-akg`**:
   - Container isolado para o serviço de automação WhatsApp via QR Code / Baileys.
   - Armazena credenciais e chaves criptográficas em volume dedicado `defardas_wa_akg_auth`.

---

## 2. Pré-Requisitos

- Servidor Linux (Ubuntu 22.04 LTS ou superior recomendado).
- Docker Engine v24.0+ e Docker Compose v2.20+.
- Portas 80/443 e 3000 liberadas conforme a topologia de proxy reverso (Nginx/Traefik).

---

## 3. Passo a Passo de Implantação

### 3.1. Configuração do Arquivo `.env`
Copie o template e preencha as credenciais seguras de produção:

```bash
cp .env.example .env
nano .env
```

Garanta que as seguintes variáveis estejam preenchidas:
- `POSTGRES_USER` e `POSTGRES_PASSWORD` (senhas fortes e aleatórias)
- `POSTGRES_DB=defardas_db`
- `DATABASE_URL` apontando para o contêiner `defardas-postgres`
- `S3_*` para armazenamento de artes e comprovantes
- `META_WA_*` ou `WA_AKG_*` para comunicação

### 3.2. Construção e Inicialização dos Contêineres
Suba todos os serviços em segundo plano:

```bash
docker compose up -d --build
```

Verifique o status de execução e healthchecks:

```bash
docker compose ps
docker compose logs -f defardas-app
```

### 3.3. Execução das Migrações Drizzle ORM
Com o banco ativo e saudável, execute as migrações:

```bash
docker compose exec defardas-app npx drizzle-kit migrate
```

Para inspecionar as tabelas criadas no banco:

```bash
docker compose exec defardas-postgres psql -U defardas_user -d defardas_db -c "\dn"
docker compose exec defardas-postgres psql -U defardas_user -d defardas_db -c "\dt core.*"
docker compose exec defardas-postgres psql -U defardas_user -d defardas_db -c "\dt crm.*"
docker compose exec defardas-postgres psql -U defardas_user -d defardas_db -c "\dt producao.*"
docker compose exec defardas-postgres psql -U defardas_user -d defardas_db -c "\dt estoque.*"
docker compose exec defardas-postgres psql -U defardas_user -d defardas_db -c "\dt financeiro.*"
```

---

## 4. Rotinas de Backup e Recuperação de Desastres

### 4.1. Backup Manual ou Agendado (Cron)
O script `scripts/backup.sh` executa `pg_dump` compactado com gzip, calcula o hash SHA-256 e descarta cópias com mais de 30 dias:

```bash
chmod +x scripts/backup.sh scripts/restore.sh
./scripts/backup.sh
```

Para automatizar no crontab diário às 03:00 AM:

```bash
0 3 * * * /caminho/para/defardas/scripts/backup.sh >> /var/log/defardas_backup.log 2>&1
```

### 4.2. Restauração de Dados
Para restaurar um backup homologado em caso de falha de hardware ou desastre:

```bash
./scripts/restore.sh backups/defardas_db_YYYYMMDD_HHMMSS.sql.gz
```

O script verifica automaticamente o checksum SHA-256 antes de aplicar as alterações no banco.

---

## 5. Atualização de Versões da Aplicação (Zero Downtime)

Para atualizar o código do ERP sem interrupção abrupta:

```bash
git pull origin main
docker compose build defardas-app
docker compose up -d --no-deps defardas-app
docker compose exec defardas-app npx drizzle-kit migrate
```
