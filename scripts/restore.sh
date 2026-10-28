#!/usr/bin/env bash
# ==============================================================================
# DE FARDAS ERP — Script de Restauração Segura do Banco PostgreSQL
# Verifica integridade sha256 e restaura dados de backup homologado
# ==============================================================================

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Uso: $0 <caminho_do_arquivo.sql.gz> [--force]"
  echo "Exemplo: $0 backups/defardas_db_20261025_120000.sql.gz"
  exit 1
fi

BACKUP_FILE="$1"
FORCE="${2:-}"

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-defardas-postgres}"
POSTGRES_USER="${POSTGRES_USER:-defardas_user}"
POSTGRES_DB="${POSTGRES_DB:-defardas_db}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Arquivo de backup não encontrado: ${BACKUP_FILE}"
  exit 1
fi

echo "=================================================================="
echo " [DE FARDAS ERP] Restauração do Banco PostgreSQL"
echo " Arquivo de Origem: ${BACKUP_FILE}"
echo " Banco Destino:     ${POSTGRES_DB}"
echo "=================================================================="

# 1. Verificação de Checksum SHA-256 se o arquivo .sha256 existir
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
if [ -f "$CHECKSUM_FILE" ]; then
  echo "🔍 Verificando integridade do backup..."
  if command -v sha256sum > /dev/null; then
    sha256sum -c "$CHECKSUM_FILE"
  elif command -v shasum > /dev/null; then
    shasum -a 256 -c "$CHECKSUM_FILE"
  fi
  echo "✅ Checksum validado com sucesso!"
fi

# 2. Confirmação do operador
if [ "$FORCE" != "--force" ]; then
  read -r -p "⚠️ ATENÇÃO: Esta operação sobrescreverá os dados existentes no banco '${POSTGRES_DB}'. Continuar? (s/N): " CONFIRM
  if [[ ! "$CONFIRM" =~ ^[sS]$ ]]; then
    echo "Operação cancelada pelo usuário."
    exit 0
  fi
fi

# 3. Execução da restauração
echo "🚀 Restaurando banco de dados a partir de ${BACKUP_FILE}..."
if docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
  # Terminar conexões ativas antes da restauração
  docker exec -i "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${POSTGRES_DB}' AND pid <> pg_backend_pid();" || true

  gunzip -c "${BACKUP_FILE}" | docker exec -i "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"
else
  gunzip -c "${BACKUP_FILE}" | psql "${DATABASE_URL}"
fi

echo "=================================================================="
echo "✅ Restauração concluída com sucesso no DE FARDAS ERP!"
echo "=================================================================="
