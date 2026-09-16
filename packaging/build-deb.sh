#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
VERSION=${1:-0.1.0}
PKG=/tmp/pos-api-deb
rm -rf "$PKG"
mkdir -p "$PKG/DEBIAN" "$PKG/opt/pos-api" "$PKG/etc/pos-api" "$PKG/var/lib/pos-api" "$PKG/usr/lib/systemd/system"
cp "$ROOT/target/pos-api-0.0.1-SNAPSHOT.jar" "$PKG/opt/pos-api/pos-api.jar"
cp "$ROOT/packaging/pos-api.service" "$PKG/usr/lib/systemd/system/pos-api.service"
cp "$ROOT/packaging/onboard.sh" "$PKG/opt/pos-api/onboard.sh"
chmod 750 "$PKG/opt/pos-api/onboard.sh"
cat > "$PKG/DEBIAN/control" <<EOF
Package: pos-api
Version: $VERSION
Section: database
Priority: optional
Architecture: all
Maintainer: GiftedLabs
Depends: default-jre (>= 25), postgresql
Description: Radiance POS local-first backend
EOF
cat > "$PKG/DEBIAN/postinst" <<'EOF'
#!/usr/bin/env bash
set -e
getent group pos >/dev/null || groupadd --system pos
id pos >/dev/null 2>&1 || useradd --system --gid pos --home-dir /var/lib/pos-api --shell /usr/sbin/nologin pos
install -d -o pos -g pos -m 750 /var/lib/pos-api
if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='giftedlabs'" | grep -q 1; then
  runuser -u postgres -- createuser giftedlabs
fi
if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='pos_system'" | grep -q 1; then
  runuser -u postgres -- createdb -O giftedlabs pos_system
fi
if [ ! -f /etc/pos-api/pos.env ]; then
  /opt/pos-api/onboard.sh
fi
chown -R pos:pos /var/lib/pos-api /opt/pos-api
systemctl daemon-reload
systemctl enable pos-api.service
systemctl restart pos-api.service || systemctl start pos-api.service
EOF
chmod 755 "$PKG/DEBIAN/postinst"
mkdir -p "$ROOT/dist"
dpkg-deb --build "$PKG" "$ROOT/dist/pos-api_${VERSION}_all.deb"
echo "Built $ROOT/dist/pos-api_${VERSION}_all.deb"
