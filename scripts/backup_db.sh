#!/usr/bin/env bash
# ==============================================================================
# PlukIt Database Backup Script (F21)
# Creates a consistent PostgreSQL dump and applies rolling retention (7-30 days).
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${1:-$ROOT_DIR/backups}"
RETENTION_DAYS="${2:-14}"

mkdir -p "$BACKUP_DIR"

# Resolve DATABASE_URL
if [ -z "${DATABASE_URL:-}" ]; then
  if [ -f "$ROOT_DIR/server/.env" ]; then
    export $(grep -E '^DATABASE_URL=' "$ROOT_DIR/server/.env" | xargs)
  elif [ -f "$ROOT_DIR/.env" ]; then
    export $(grep -E '^DATABASE_URL=' "$ROOT_DIR/.env" | xargs)
  fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: DATABASE_URL is not set" >&2
  exit 1
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/db_backup_${TIMESTAMP}.sql"

echo "[BACKUP] Starting database backup to $BACKUP_FILE..."

# Parse connection params using node helper if pg_dump URI syntax is preferred
pg_dump "$DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  -f "$BACKUP_FILE"

FILE_SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
echo "[BACKUP] SUCCESS: Backup created: $BACKUP_FILE ($FILE_SIZE)"

# Rolling retention
echo "[BACKUP] Applying rolling retention (purging backups older than $RETENTION_DAYS days)..."
find "$BACKUP_DIR" -name "db_backup_*.sql" -type f -mtime +"$RETENTION_DAYS" -exec rm -f {} +
echo "[BACKUP] Done."
