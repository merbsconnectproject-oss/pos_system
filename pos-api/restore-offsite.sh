#!/usr/bin/env bash
# NFR-6/NFR-7: retrieve an R2 copy, then use the same guarded restore path.
# Requires AWS CLI v2 (R2 speaks its S3 API). Credentials are read from the
# environment, never echoed or written to the database.
#
#   POS_BACKUP_OFFSITE_ENDPOINT=https://<account>.r2.cloudflarestorage.com \
#   POS_BACKUP_OFFSITE_BUCKET=pos-backups \
#   AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
#   ./restore-offsite.sh pos-20260915-120000.dump

set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a

OBJECT="${1:-}"
[ -n "$OBJECT" ] || { echo "Usage: $0 pos-YYYYMMDD-HHMMSS.dump" >&2; exit 2; }

: "${POS_BACKUP_OFFSITE_ENDPOINT:?Set POS_BACKUP_OFFSITE_ENDPOINT to the R2 S3 endpoint}"
: "${POS_BACKUP_OFFSITE_BUCKET:?Set POS_BACKUP_OFFSITE_BUCKET}"
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-${POS_BACKUP_OFFSITE_ACCESS_KEY_ID:-}}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-${POS_BACKUP_OFFSITE_SECRET_ACCESS_KEY:-}}"
: "${AWS_ACCESS_KEY_ID:?Set POS_BACKUP_OFFSITE_ACCESS_KEY_ID (R2 access key)}"
: "${AWS_SECRET_ACCESS_KEY:?Set POS_BACKUP_OFFSITE_SECRET_ACCESS_KEY (R2 secret)}"

PREFIX="${POS_BACKUP_OFFSITE_PREFIX:-}"
PREFIX="${PREFIX#/}"
PREFIX="${PREFIX%/}"
KEY="${PREFIX:+$PREFIX/}$OBJECT"
DEST="${POS_BACKUP_DIRECTORY:-backups}/$OBJECT"
mkdir -p "$(dirname "$DEST")"

echo "Downloading s3://${POS_BACKUP_OFFSITE_BUCKET}/$KEY ..."
aws s3 cp "s3://${POS_BACKUP_OFFSITE_BUCKET}/$KEY" "$DEST" \
  --endpoint-url "$POS_BACKUP_OFFSITE_ENDPOINT" --only-show-errors

[ -s "$DEST" ] || { echo "Downloaded backup is empty" >&2; exit 1; }
echo "Downloaded $(wc -c < "$DEST") bytes. Handing off to the guarded restore script."
exec ./restore.sh "$DEST"
