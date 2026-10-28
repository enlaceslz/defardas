#!/usr/bin/env bash
# ==============================================================================
# DE FARDAS ERP — Script Automatizado de Backup do Banco PostgreSQL
# Executa dump completo com compressão gzip, checksum sha256 e rotação
# ==============================================================================

set -euo pipefail

# Diretório base do script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${PROJECT_ROOT}/backups"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
BACKUP_FILE="${BACKUP_DIR}/defardas_db_${TIMESTAMP}.sql.gz"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Credenciais e conexão (obtidas do ambiente ou defaults do container)
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-defardas-postgres}"
POSTGRES_USER="${POSTGRES_USER:-defardas_user}"
POSTGRES_DB="${POSTGRES_DB:-defardas_db}"

mkdir -p "$BACKUP_DIR"

echo "=================================================================="
echo " [DE FARDAS ERP] Iniciando rotina de backup do PostgreSQL"
echo " Data/Hora: $(date +'%Y-%m-%d %H:%M:%S')"
echo " Destino:   ${BACKUP_FILE}"
echo "=================================================================="

# 1. Executar pg_dump compactado
if docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
  echo "📦 Executando pg_dump via container Docker '${POSTGRES_CONTAINER}'..."
  docker exec -t "${POSTGRES_CONTAINER}" pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists --no-owner | gzip > "${BACKUP_FILE}"
else
  echo "📦 Container '${POSTGRES_CONTAINER}' não encontrado. Tentando pg_dump local/remoto..."
  pg_dump "${DATABASE_URL}" --clean --if-exists --no-owner | gzip > "${BACKUP_FILE}"
fi

# 2. Gerar hash SHA-256 para verificação de integridade
if command -v sha256sum > /dev/null; then
  sha256sum "${BACKUP_FILE}" > "${CHECKSUM_FILE}"
elif command -v shasum > /dev/null; then
  shasum -a 256 "${BACKUP_FILE}" > "${CHECKSUM_FILE}"
fi

FILE_SIZE="$(du -h "${BACKUP_FILE}" | cut -f1)"
echo "✅ Backup concluído com sucesso!"
echo "   Arquivo:  ${BACKUP_FILE} (${FILE_SIZE})"
echo "   Checksum: ${CHECKSUM_FILE}"

# 3. Rotação de backups antigos
echo "🧹 Aplicando política de retenção de ${RETENTION_DAYS} dias..."
find "$BACKUP_DIR" -type f -name "defardas_db_*.sql.gz*" -mtime +"${RETENTION_DAYS}" -exec rm -f {} +
echo "✅ Limpeza concluída. Backups anteriores preservados com sucesso."
