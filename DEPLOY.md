# DEPLOY.md — Guia de Implantação e Operação de Produção

**Aplicação:** DE FARDAS ERP & Portal Comercial  
**Cliente:** DE FARDAS CONFECÇÕES & UNIFORMES LTDA — São Luís, MA  
**Ambiente:** Infraestrutura dedicada contratada para a cliente  

---

## 1. Pré-Requisitos de Infraestrutura

Para a execução e sustentação do sistema em ambiente de produção, certifique-se de que o servidor atende aos seguintes requisitos mínimos:

- **Sistema Operacional:** Linux Ubuntu 22.04 LTS ou Debian 12 (x86_64).
- **Node.js:** Versão 20.x LTS ou superior.
- **Gerenciador de Pacotes:** `npm` v10+ ou `bun`.
- **Banco de Dados:** PostgreSQL 15+ ou 16+ administrado na infraestrutura própria (acesso via rede privada, nunca exposto diretamente à internet).
- **Armazenamento de Objetos:** Bucket privado compatível com S3 (MinIO, AWS S3 ou Cloudflare R2) para arquivamento de artes, PDFs de orçamentos e comprovantes de pagamento.
- **Proxy Reverso / Web Server:** Nginx ou Caddy com terminação TLS/SSL (certificado Let's Encrypt / Certbot).
- **Recursos Recomendados:**
  - CPU: 2 vCPUs
  - Memória RAM: 4 GB
  - Armazenamento: 40 GB SSD (com expansão conforme volume de anexos)

---

## 2. Configuração de Variáveis de Ambiente

Crie o arquivo `.env` na raiz do projeto com base no modelo `.env.example`:

```bash
# Ambiente
NODE_ENV=production
PORT=3000

# URL Canônica da Aplicação
APP_URL=https://erp.defardas.com.br

# Banco de Dados Transacional (PostgreSQL Próprio)
DATABASE_URL=postgresql://defardas_user:SENHA_FORTE@127.0.0.1:5432/defardas_db?sslmode=prefer

# Armazenamento de Arquivos Privados (S3-Compatible)
S3_ENDPOINT=https://s3.defardas.com.br
S3_REGION=us-east-1
S3_BUCKET_NAME=defardas-private-docs
S3_ACCESS_KEY_ID=CHAVE_DE_ACESSO_S3
S3_SECRET_ACCESS_KEY=CHAVE_SECRETA_S3
S3_FORCE_PATH_STYLE=true

# Segurança, Sessão e Webhooks WhatsApp
SESSION_SECRET=CHAVE_CRIPTOGRAFICA_MINIMO_32_CARACTERES
META_WA_TOKEN=EAAG...
META_WA_PHONE_NUMBER_ID=
META_WA_WEBHOOK_VERIFY_TOKEN=TOKEN_VERIFICACAO_META
META_WA_APP_SECRET=SEGREDO_HMAC_APP_META
WA_AKG_ENDPOINT=http://127.0.0.1:8080
WA_AKG_API_KEY=CHAVE_SECRETA_WA_AKG

# Inteligência e Assistência IA (Opcional - Chave Gemini API)
GEMINI_API_KEY=AIzaSy...
```

> **Atenção:** Nunca versione o arquivo `.env` no controle de versão (Git). Mantenha as chaves sob privilégio mínimo.

---

## 3. Passo a Passo de Compilação e Deploy

### 3.1. Clonagem e Instalação de Dependências
```bash
# Clonar repositório oficial
git clone https://github.com/enlaceslz/defardas.git /var/www/defardas-erp
cd /var/www/defardas-erp

# Instalar dependências
npm ci
```

### 3.2. Migrações do Banco (Drizzle ORM) e Validação Estática
Antes de iniciar o servidor, aplique as migrações no PostgreSQL e valide a tipagem:
```bash
npm run db:migrate
npm run lint
```

### 3.3. Compilação do Frontend / Fullstack
```bash
npm run build
```
O comando gerará os artefatos otimizados e minificados no diretório `dist/`. Para implantação containerizada (recomendada), consulte [`docs/DOCKER_DEPLOY.md`](./docs/DOCKER_DEPLOY.md).

### 3.4. Inicialização com Gerenciador de Processos (PM2)
Recomenda-se utilizar o PM2 para garantir reinicialização automática e monitoramento:
```bash
# Instalar PM2 globalmente (caso não tenha)
npm install -g pm2

# Iniciar aplicação
pm2 start npm --name "defardas-erp" -- run start

# Configurar PM2 para iniciar no boot do sistema
pm2 startup
pm2 save
```

---

## 4. Configuração do Proxy Reverso (Nginx)

Exemplo de configuração para `/etc/nginx/sites-available/defardas.conf`:

```nginx
server {
    listen 80;
    server_name erp.defardas.com.br;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name erp.defardas.com.br;

    ssl_certificate /etc/letsencrypt/live/erp.defardas.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/erp.defardas.com.br/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Headers de Segurança
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    root /var/www/defardas-erp/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy para rotas de API backend (quando ativadas)
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Cache de assets estáticos (CSS, JS, Imagens)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, no-transform";
    }
}
```

---

## 5. Rotina de Backup e Recuperação de Desastres

Conforme os critérios de aceite do PRD (Seção 6 e 10), o backup deve ser automatizado e testado periodicamente:

### 5.1. Script de Backup Diário do PostgreSQL (`backup_db.sh`)
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/defardas/db"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
mkdir -p $BACKUP_DIR

# Dump comprimido do banco
pg_dump -U defardas_user -h 127.0.0.1 -F c defardas_db > "$BACKUP_DIR/defardas_db_$TIMESTAMP.dump"

# Sincronizar com bucket de backup secundário
aws s3 cp "$BACKUP_DIR/defardas_db_$TIMESTAMP.dump" s3://defardas-backups/db/ --endpoint-url https://s3.defardas.com.br

# Manter apenas os últimos 14 dias localmente
find $BACKUP_DIR -type f -name "*.dump" -mtime +14 -delete
```

### 5.2. Procedimento de Restauração de Teste
```bash
# Restaurar em base de homologação/teste
createdb -U defardas_user -h 127.0.0.1 defardas_db_teste
pg_restore -U defardas_user -h 127.0.0.1 -d defardas_db_teste "/var/backups/defardas/db/defardas_db_20261022.dump"
```

---

## 6. Checklist de Homologação Pré-Go-Live

Antes de liberar o acesso geral aos operadores da fábrica:
- [ ] Conexão segura HTTPS com certificado SSL válido A+ (Qualys SSL Labs) e `trust proxy` preservado.
- [ ] `NODE_ENV=production` ativo (confirmar que `/api/auth/dev-credentials` retorna `404` e `GET /api/health` responde `200`).
- [ ] Banco de dados PostgreSQL com migrações Drizzle aplicadas (`npm run db:migrate`) e acesso restrito à rede interna.
- [ ] `META_WA_APP_SECRET` e/ou `WA_AKG_API_KEY` configurados para verificação criptográfica de webhooks.
- [ ] Backup automático (`scripts/backup.sh`) configurado via cron e teste de restauração (`scripts/restore.sh`) concluído.
- [ ] Contas reais de usuários criadas com perfis RBAC específicos (Administrador, Gerente Comercial, Vendas, PCP, Financeiro, Qualidade/Expedição).
- [ ] Dados da empresa em *Configurações* conferidos com CNPJ e endereço de São Luís - MA.
