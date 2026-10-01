#!/usr/bin/env bash
set -euo pipefail
[ -f .env ] && set -a && . ./.env && set +a
required=(POS_BACKUP_OFFSITE_ENDPOINT POS_BACKUP_OFFSITE_BUCKET POS_BACKUP_OFFSITE_ACCESS_KEY_ID POS_BACKUP_OFFSITE_SECRET_ACCESS_KEY POS_BACKUP_ENCRYPTION_KEY)
for name in "${required[@]}"; do
  value="${!name:-}"
  [ -n "$value" ] || { echo "Missing $name" >&2; exit 1; }
done
if [[ "$POS_BACKUP_ENCRYPTION_KEY" =~ ^[0-9A-Fa-f]{64}$ ]]; then
  echo "Backup encryption key: valid 256-bit hex"
else
  python3 - "$POS_BACKUP_ENCRYPTION_KEY" <<'PY'
import base64,sys
try:
    if len(base64.b64decode(sys.argv[1], validate=True)) != 32: raise ValueError
except Exception: raise SystemExit('POS_BACKUP_ENCRYPTION_KEY is not a 256-bit Base64 key')
print('Backup encryption key: valid 256-bit Base64')
PY
fi

# The sync key is separate from the backup key, and is the one that has to be
# identical on every computer in the business. Optional here only because an
# installation predating the split still falls back to the backup key.
if [ -n "${POS_SYNC_ENCRYPTION_KEY:-}" ]; then
  if [[ "$POS_SYNC_ENCRYPTION_KEY" =~ ^[0-9A-Fa-f]{64}$ ]]; then
    echo "Sync encryption key: valid 256-bit hex"
  else
    python3 - "$POS_SYNC_ENCRYPTION_KEY" <<'SYNCKEY'
import base64,sys
try:
    if len(base64.b64decode(sys.argv[1], validate=True)) != 32: raise ValueError
except Exception: raise SystemExit('POS_SYNC_ENCRYPTION_KEY is not a 256-bit Base64 key')
print('Sync encryption key: valid 256-bit Base64')
SYNCKEY
  fi
  if [ "$POS_SYNC_ENCRYPTION_KEY" = "$POS_BACKUP_ENCRYPTION_KEY" ]; then
    echo "Warning: the sync and backup keys are identical. Enrollment files hand the sync key to every outlet computer, which would also give each of them the means to decrypt this machine's database dumps." >&2
  fi
else
  echo "Note: POS_SYNC_ENCRYPTION_KEY is unset, so Cloud Sync falls back to the backup key. Set a separate one before enrolling an outlet computer."
fi

echo "R2 backup configuration: all required values present"
