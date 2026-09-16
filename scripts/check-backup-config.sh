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
echo "R2 backup configuration: all required values present"
