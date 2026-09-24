#!/usr/bin/env bash
# Build a self-contained Ubuntu package containing the UI, API and Java runtime.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
BACKEND_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
FRONTEND_ROOT=${FRONTEND_ROOT:-"$(cd "$BACKEND_ROOT/../pos-system" && pwd)"}
VERSION=${1:-0.1.0}
SKIP_TESTS=${SKIP_TESTS:-false}
ARCH=$(dpkg --print-architecture)
STAGE=$(mktemp -d /tmp/radiance-pos-deb.XXXXXX)
WEB_OUTPUT=$(mktemp -d /tmp/radiance-pos-web.XXXXXX)

cleanup() {
  rm -rf -- "$STAGE" "$WEB_OUTPUT"
}
trap cleanup EXIT

require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required build command not found: $1" >&2
    exit 1
  }
}

for command in dpkg-deb java jar jlink npm; do require "$command"; done
[[ "$VERSION" =~ ^[0-9][0-9A-Za-z.+:~-]*$ ]] || {
  echo "Invalid Debian package version: $VERSION" >&2
  exit 1
}
[[ -f "$FRONTEND_ROOT/package-lock.json" ]] || {
  echo "Frontend checkout not found at $FRONTEND_ROOT" >&2
  exit 1
}

JAVA_HOME_DIR=${JAVA_HOME:-$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")}
[[ -d "$JAVA_HOME_DIR/jmods" ]] || {
  echo "Java modules were not found under $JAVA_HOME_DIR/jmods; build with a complete JDK 25." >&2
  exit 1
}
JAVA_MAJOR=$(java -version 2>&1 | sed -n '1s/.*version "\([0-9]*\).*/\1/p')
[[ "$JAVA_MAJOR" == 25 ]] || {
  echo "Java 25 is required to build this application (found Java ${JAVA_MAJOR:-unknown})." >&2
  exit 1
}

echo "Building Radiance POS $VERSION for Ubuntu $ARCH"
(
  cd "$FRONTEND_ROOT"
  npm ci
  if [[ "$SKIP_TESTS" != true ]]; then npm run check; fi
  ./node_modules/.bin/vite build --outDir "$WEB_OUTPUT" --emptyOutDir
)

MAVEN_ARGS=(-B clean package -Pbundled-frontend "-Dfrontend.dist=$WEB_OUTPUT")
if [[ "$SKIP_TESTS" == true ]]; then MAVEN_ARGS+=(-DskipTests); fi
(cd "$BACKEND_ROOT" && ./mvnw "${MAVEN_ARGS[@]}")

JAR=$(find "$BACKEND_ROOT/target" -maxdepth 1 -type f -name 'pos-api-*.jar' ! -name '*.original' -print -quit)
[[ -n "$JAR" ]] || { echo "The executable application JAR was not produced." >&2; exit 1; }
jar tf "$JAR" | grep -qx 'BOOT-INF/classes/static/index.html' || {
  echo "The package JAR does not contain the web interface." >&2
  exit 1
}

PKG="$STAGE/pkg"
install -d \
  "$PKG/DEBIAN" \
  "$PKG/opt/radiance-pos" \
  "$PKG/etc/radiance-pos" \
  "$PKG/var/lib/radiance-pos/backups" \
  "$PKG/usr/bin" \
  "$PKG/usr/lib/systemd/system" \
  "$PKG/usr/share/applications" \
  "$PKG/usr/share/icons/hicolor/scalable/apps" \
  "$PKG/usr/share/doc/radiance-pos"

install -m 640 "$JAR" "$PKG/opt/radiance-pos/radiance-pos.jar"
install -m 755 "$SCRIPT_DIR/radiance-pos-setup" "$PKG/usr/bin/radiance-pos-setup"
install -m 755 "$SCRIPT_DIR/radiance-pos" "$PKG/usr/bin/radiance-pos"
install -m 755 "$SCRIPT_DIR/radiance-pos-diagnostics" "$PKG/usr/bin/radiance-pos-diagnostics"
install -m 755 "$SCRIPT_DIR/radiance-pos-repair-database" "$PKG/usr/bin/radiance-pos-repair-database"
install -m 644 "$SCRIPT_DIR/radiance-pos.service" "$PKG/usr/lib/systemd/system/radiance-pos.service"
install -m 644 "$SCRIPT_DIR/radiance-pos.desktop" "$PKG/usr/share/applications/radiance-pos.desktop"
install -m 644 "$SCRIPT_DIR/radiance-pos.svg" "$PKG/usr/share/icons/hicolor/scalable/apps/radiance-pos.svg"
install -m 644 "$SCRIPT_DIR/README.md" "$PKG/usr/share/doc/radiance-pos/README.md"
if [[ -f "$BACKEND_ROOT/LICENSE" ]]; then
  install -m 644 "$BACKEND_ROOT/LICENSE" "$PKG/usr/share/doc/radiance-pos/copyright"
fi

echo "Creating the bundled Java runtime"
jlink \
  --module-path "$JAVA_HOME_DIR/jmods" \
  --add-modules ALL-MODULE-PATH \
  --bind-services \
  --strip-debug \
  --no-header-files \
  --no-man-pages \
  --compress=zip-6 \
  --output "$PKG/opt/radiance-pos/runtime"

cat >"$PKG/DEBIAN/control" <<EOF
Package: radiance-pos
Version: $VERSION
Section: misc
Priority: optional
Architecture: $ARCH
Maintainer: GiftedLabs
Depends: postgresql, postgresql-client, curl, xdg-utils
Recommends: libnotify-bin
Description: Radiance POS local-first counter application
 Includes the Radiance POS web interface, API and a private Java 25 runtime.
 PostgreSQL is installed as an Ubuntu service and application data remains local.
EOF

install -m 755 "$SCRIPT_DIR/maintainer/postinst" "$PKG/DEBIAN/postinst"
install -m 755 "$SCRIPT_DIR/maintainer/prerm" "$PKG/DEBIAN/prerm"
install -m 755 "$SCRIPT_DIR/maintainer/postrm" "$PKG/DEBIAN/postrm"

find "$PKG/opt/radiance-pos" -type d -exec chmod 755 {} +
install -d "$BACKEND_ROOT/dist"
OUTPUT="$BACKEND_ROOT/dist/Radiance-POS_${VERSION}_${ARCH}.deb"
dpkg-deb --root-owner-group --build "$PKG" "$OUTPUT"
(
  cd "$(dirname "$OUTPUT")"
  sha256sum "$(basename "$OUTPUT")" >"$(basename "$OUTPUT").sha256"
)

echo
echo "Built $OUTPUT"
echo "Install with: sudo apt install '$OUTPUT'"
echo "Then configure with: sudo radiance-pos-setup"
