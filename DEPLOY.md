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

# Segurança e Sessão
SESSION_SECRET=CHAVE_CRIPTOGRAFICA_MINIMO_32_CARACTERES
JWT_SECRET=CHAVE_JWT_ALEATORIA_LONGA

# Inteligência e Assistência IA (Opcional - Chave Gemini API)
GEMINI_API_KEY=AIzaSy...
```

> **Atenção:** Nunca versione o arquivo `.env` no controle de versão (Git). Mantenha as chaves sob privilégio mínimo.

---

## 3. Passo a Passo de Compilação e Deploy

### 3.1. Clonagem e Instalação de Dependências
```bash
# Clonar repositório privado
git clone git@github.com:defardas/defardas-erp.git /var/www/defardas-erp
cd /var/www/defardas-erp

# Instalar dependências de produção
npm ci
```

### 3.2. Validação e Testes Estáticos
Antes de gerar o build, execute a validação de tipagem e integridade:
```bash
npm run lint
```

### 3.3. Compilação do Frontend / Fullstack
```bash
npm run build
```
O comando gerará os artefatos otimizados e minificados no diretório `dist/`.

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
- [ ] Conexão segura HTTPS com certificado SSL válido A+ (Qualys SSL Labs).
- [ ] Banco de dados PostgreSQL com acesso restrito a `localhost` ou VPN interna.
- [ ] Backup automático via cron configurado e teste de restauração concluído com sucesso.
- [ ] Criação de contas de usuários com permissões específicas de perfil (Administrador, Vendas, PCP, Financeiro).
- [ ] Dados da empresa em *Configurações* conferidos com CNPJ e endereço de São Luís - MA.
