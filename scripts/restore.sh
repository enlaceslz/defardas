#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $# -ge 1 ]] || { echo "Uso: $0 arquivo.sql.gz [--force]" >&2; exit 1; }
BACKUP_FILE="$1"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-defardas-postgres}"
POSTGRES_USER="${POSTGRES_USER:-defardas_user}"
POSTGRES_DB="${POSTGRES_DB:-defardas_db}"
[[ -f "$BACKUP_FILE" && -f "$BACKUP_FILE.sha256" ]] || { echo 'Backup e checksum .sha256 são obrigatórios.' >&2; exit 1; }
command -v sha256sum >/dev/null || { echo 'sha256sum é obrigatório.' >&2; exit 1; }
(
  cd "$(dirname "$BACKUP_FILE")"
  sha256sum -c "$(basename "$BACKUP_FILE").sha256"
)
gzip -t "$BACKUP_FILE"
if [[ "${2:-}" != --force ]]; then
  read -r -p "Sobrescrever banco $POSTGRES_DB? Pare a aplicação antes de continuar. (s/N): " CONFIRM
  [[ "$CONFIRM" =~ ^[sS]$ ]] || exit 0
fi
# Uma transação e erro fatal: nunca relata sucesso depois de SQL parcialmente aplicado.
if command -v docker >/dev/null && [[ "$(docker inspect --format '{{.State.Running}}' "$POSTGRES_CONTAINER" 2>/dev/null || true)" == true ]]; then
  gunzip -c "$BACKUP_FILE" | docker exec -i "$POSTGRES_CONTAINER" psql --no-psqlrc -v ON_ERROR_STOP=1 --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"
else
  : "${DATABASE_URL:?Defina DATABASE_URL ou disponibilize o container PostgreSQL}"
  gunzip -c "$BACKUP_FILE" | psql --no-psqlrc -v ON_ERROR_STOP=1 --single-transaction "$DATABASE_URL"
fi
echo "Restauração confirmada: $POSTGRES_DB"
