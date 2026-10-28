#!/usr/bin/env bash
set -euo pipefail
umask 077
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$(dirname "$SCRIPT_DIR")/backups}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-defardas-postgres}"
POSTGRES_USER="${POSTGRES_USER:-defardas_user}"
POSTGRES_DB="${POSTGRES_DB:-defardas_db}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
[[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || { echo 'RETENTION_DAYS inválido.' >&2; exit 1; }
command -v sha256sum >/dev/null || { echo 'sha256sum é obrigatório.' >&2; exit 1; }
mkdir -p "$BACKUP_DIR"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"
TEMP_FILE="$(mktemp "$BACKUP_DIR/.backup-XXXXXXXX")"
trap 'rm -f "$TEMP_FILE"' EXIT
BACKUP_FILE="$BACKUP_DIR/defardas_db_$(date +'%Y%m%d_%H%M%S')_${TEMP_FILE##*-}.sql.gz"
if command -v docker >/dev/null && [[ "$(docker inspect --format '{{.State.Running}}' "$POSTGRES_CONTAINER" 2>/dev/null || true)" == true ]]; then
  # Sem TTY: preserva bytes do dump e não injeta CRLF.
  docker exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner | gzip > "$TEMP_FILE"
else
  : "${DATABASE_URL:?Defina DATABASE_URL ou disponibilize o container PostgreSQL}"
  pg_dump "$DATABASE_URL" --clean --if-exists --no-owner | gzip > "$TEMP_FILE"
fi
gzip -t "$TEMP_FILE"
mv "$TEMP_FILE" "$BACKUP_FILE"
(
  cd "$BACKUP_DIR"
  sha256sum "$(basename "$BACKUP_FILE")" > "$(basename "$BACKUP_FILE").sha256"
)
find "$BACKUP_DIR" -type f -name 'defardas_db_*.sql.gz*' -mtime +"$RETENTION_DAYS" -delete
echo "Backup validado: $BACKUP_FILE"
