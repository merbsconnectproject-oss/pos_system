#!/usr/bin/env bash
# Run the POS locally against your Postgres.
#   ./run.sh            counter profile (the shop till)
#   ./run.sh consolidator   the owner's view
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a
export SPRING_PROFILES_ACTIVE="${1:-counter}"
echo "Starting pos-api [$SPRING_PROFILES_ACTIVE] on http://localhost:${PORT:-8080}"
exec ./mvnw -q spring-boot:run
