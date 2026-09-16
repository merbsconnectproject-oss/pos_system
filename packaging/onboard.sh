#!/usr/bin/env bash
set -euo pipefail
ENV_FILE=/etc/pos-api/pos.env
read -r -p "Owner username [admin]: " OWNER_USER
OWNER_USER=${OWNER_USER:-admin}
read -r -s -p "Owner password (min 8 characters): " OWNER_PASSWORD; echo
[ "${#OWNER_PASSWORD}" -ge 8 ] || { echo "Password must be at least 8 characters" >&2; exit 1; }
read -r -s -p "Owner PIN (optional): " OWNER_PIN; echo
read -r -p "Outlet code [RAD]: " OUTLET_CODE; OUTLET_CODE=${OUTLET_CODE:-RAD}
read -r -p "Outlet name [Radiance Lighting]: " OUTLET_NAME; OUTLET_NAME=${OUTLET_NAME:-Radiance Lighting}
install -d -m 750 /etc/pos-api
cat >"$ENV_FILE" <<EOF
SPRING_PROFILES_ACTIVE=counter
JDBC_DATABASE_URL=jdbc:postgresql://localhost:5432/pos_system
DB_USERNAME=giftedlabs
DB_PASSWORD=
POS_BOOTSTRAP_ADMIN_ENABLED=true
POS_BOOTSTRAP_ADMIN_USERNAME=$OWNER_USER
POS_BOOTSTRAP_ADMIN_PASSWORD=$OWNER_PASSWORD
POS_BOOTSTRAP_ADMIN_PIN=$OWNER_PIN
POS_BOOTSTRAP_OUTLET_CODE=$OUTLET_CODE
POS_BOOTSTRAP_OUTLET_NAME=$OUTLET_NAME
EOF
chmod 640 "$ENV_FILE"
echo "Onboarding configuration written to $ENV_FILE"
