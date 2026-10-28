# ==============================================================================
# DE FARDAS ERP — Multi-Stage Production Dockerfile
# Plataforma Integrada de Gestão Empresarial, PCP e Portfólio Digital
# ==============================================================================

# ------------------------------------------------------------------------------
# Estágio 1: Build da Aplicação Frontend e Dependências
# ------------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Instalar dependências para build nativo caso necessário
RUN apk add --no-cache python3 make g++

# Copiar manifestos de dependências
COPY package.json package-lock.json .npmrc ./

# Instalar todas as dependências (incluindo devDependencies para build)
RUN npm ci

# Copiar código-fonte completo
COPY . .

# Compilar frontend com Vite
RUN npm run build && npm prune --omit=dev --ignore-scripts

# ------------------------------------------------------------------------------
# Estágio 2: Runner de Produção Leve e Seguro
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# Instalar curl para execução de healthchecks e ferramentas mínimas
RUN apk add --no-cache curl tzdata \
    && cp /usr/share/zoneinfo/America/Fortaleza /etc/localtime \
    && echo "America/Fortaleza" > /etc/timezone

# Definir variáveis de ambiente de produção
ENV NODE_ENV=production
ENV PORT=3000

# Criar usuário não-privilegiado para execução segura
RUN addgroup -S -g 1001 defardas && \
    adduser -S -u 1001 -G defardas defardas

# Copiar apenas os arquivos necessários da compilação e runtime
COPY --from=builder --chown=defardas:defardas /app/package.json ./
COPY --from=builder --chown=defardas:defardas /app/node_modules ./node_modules
COPY --from=builder --chown=defardas:defardas /app/dist ./dist
COPY --from=builder --chown=defardas:defardas /app/scripts ./scripts
COPY --from=builder --chown=defardas:defardas /app/server ./server
COPY --from=builder --chown=defardas:defardas /app/server.ts ./server.ts
COPY --from=builder --chown=defardas:defardas /app/drizzle ./drizzle
COPY --from=builder --chown=defardas:defardas /app/drizzle.config.ts ./drizzle.config.ts

# Criar diretórios de uploads e cache com permissões adequadas
RUN mkdir -p /app/uploads /app/logs && \
    chown -R defardas:defardas /app/uploads /app/logs

# Utilizar o usuário desprivilegiado
USER defardas

# Expor a porta do ERP
EXPOSE 3000

# Healthcheck interno do container
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Comando padrão de inicialização do servidor de produção
CMD ["npm", "run", "start"]
