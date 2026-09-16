#!/usr/bin/env bash
# NFR-6 · NFR-7: put a backup back.
#
# The requirement says "documented and tested restore". This is the documented
# half; the tested half is BackupRestoreTest, which dumps a real database,
# destroys it, restores it with the same commands used here, and checks the
# sales are still there.
#
#   ./restore.sh backups/pos-20260914-153000.dump
#   ./restore.sh --list
#
# Recovery time objective is four hours (NFR-7). This takes minutes on a shop's
# database; the rest of that budget is getting to the shop with a machine.

set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-pos_system}"
DB_USER="${DB_USERNAME:-giftedlabs}"
BACKUP_DIR="${POS_BACKUP_DIRECTORY:-backups}"

export PGPASSWORD="${DB_PASSWORD:-}"

if [ "${1:-}" = "--list" ] || [ $# -eq 0 ]; then
  echo "Backups in $BACKUP_DIR, newest first:"
  ls -1t "$BACKUP_DIR"/pos-*.dump 2>/dev/null | head -20 || echo "  (none)"
  echo
  echo "Restore one with:  ./restore.sh $BACKUP_DIR/pos-YYYYMMDD-HHMMSS.dump"
  exit 0
fi

DUMP="$1"
[ -f "$DUMP" ] || { echo "No such backup: $DUMP" >&2; exit 1; }

# Off-site objects are POSENC1 AES-256-GCM envelopes. Decrypt to a protected
# temporary file; never modify or replace the encrypted source object.
DECRYPTED=""
if [[ "$DUMP" == *.dump.enc ]]; then
  DECRYPTED="$(mktemp --tmpdir "pos-restore.XXXXXX.dump")"
  trap 'rm -f "$DECRYPTED"' EXIT
  python3 scripts/decrypt-backup.py "$DUMP" "$DECRYPTED"
  DUMP="$DECRYPTED"
fi

cat <<WARNING

  About to restore $DUMP into $DB_NAME on $DB_HOST:$DB_PORT.

  Everything currently in that database will be replaced. Any sale rung up
  since that backup was taken will be gone — check the timestamp above against
  when the trouble started before continuing.

  Stop the POS server first. A running server will hold connections open and
  the restore will fail halfway, which is worse than not starting.

WARNING
read -r -p "Type the database name to continue: " CONFIRM
[ "$CONFIRM" = "$DB_NAME" ] || { echo "Stopped. Nothing was changed." >&2; exit 1; }

# A copy of what is there now, before replacing it. If the restore turns out to
# be the wrong backup, this is the only way back.
SAFETY="$BACKUP_DIR/pre-restore-$(date -u +%Y%m%d-%H%M%S).dump"
echo "Saving the current database to $SAFETY first..."
pg_dump --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" \
        --dbname="$DB_NAME" --format=custom --no-password --file="$SAFETY"

echo "Restoring..."
# --clean --if-exists drops what is there before writing; --single-transaction
# means a failure halfway leaves the old database untouched rather than half
# replaced.
pg_restore --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" \
           --dbname="$DB_NAME" --clean --if-exists --single-transaction \
           --no-password "$DUMP"

echo "Recording the restore in the backup history..."
psql --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" \
     --no-password --quiet -c \
     "INSERT INTO backup_run (id, kind, started_at, finished_at, outcome, file_name, stored_local, destination)
      VALUES (gen_random_uuid(), 'RESTORE', now(), now(), 'SUCCEEDED', '$(basename "$DUMP")', true, 'restored from $DUMP');"

cat <<DONE

  Restored. Start the POS server again.

  Two things to check before trading:
    * the last receipt number in the sales list — selling resumes after it
    * the open shifts, if any were open when the backup was taken

DONE
