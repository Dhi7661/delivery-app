#!/usr/bin/env bash
# ==============================================================================
# PlukIt Database Restore Script (F21)
# Restores a specified or latest .sql backup into PostgreSQL using psql.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"

BACKUP_FILE="${1:-}"
FORCE="${2:-}"

if [ -z "$BACKUP_FILE" ]; then
  BACKUP_FILE=$(find "$BACKUP_DIR" -name "db_backup_*.sql" -type f | sort -r | head -n 1)
  if [ -z "$BACKUP_FILE" ]; then
    echo "Error: No backup files found in $BACKUP_DIR" >&2
    exit 1
  fi
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

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

echo "[RESTORE] Target backup file: $BACKUP_FILE"
echo "[RESTORE] Target database: $DATABASE_URL"

if [ "$FORCE" != "--force" ] && [ "$FORCE" != "-f" ]; then
  read -p "CAUTION: This will overwrite data in database. Type 'YES' to proceed: " CONFIRM
  if [ "$CONFIRM" != "YES" ]; then
    echo "[RESTORE] Aborted by user."
    exit 0
  fi
fi

echo "[RESTORE] Restoring database..."
psql "$DATABASE_URL" -f "$BACKUP_FILE"

echo "[RESTORE] SUCCESS: Database restored successfully from $BACKUP_FILE."
