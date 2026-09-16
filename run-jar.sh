#!/usr/bin/env bash
# Run the packaged Ubuntu test build (requires Java 25 and PostgreSQL).
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a
export SPRING_PROFILES_ACTIVE="${1:-counter}"
echo "Starting pos-api [$SPRING_PROFILES_ACTIVE] on http://localhost:${PORT:-8080}"
exec java -jar pos-api.jar
