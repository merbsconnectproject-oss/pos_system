# Radiance POS for Ubuntu

This package runs Radiance POS natively on Ubuntu. It does not use Wine or
Bottles. The web interface and API run together on `127.0.0.1:8080`, PostgreSQL
runs as the Ubuntu-managed database service, and Radiance POS runs as a
restricted `systemd` service.

## Install

```bash
sudo apt install ./Radiance-POS_0.1.0_amd64.deb
sudo radiance-pos-setup
```

The setup wizard creates the first owner, outlet and terminal. It removes the
owner password and PIN from the configuration as soon as the account is safely
stored in PostgreSQL.

Open **Radiance POS** from Ubuntu's Applications menu or run:

```bash
radiance-pos
```

## Status and troubleshooting

```bash
systemctl status radiance-pos
sudo radiance-pos-diagnostics
journalctl -u radiance-pos -f
```

Application data and local backups live in `/var/lib/radiance-pos`. Runtime
configuration is in `/etc/radiance-pos/pos.env`. Removing or upgrading the
package does not delete the PostgreSQL database or these directories.

## Build

From `pos-api` with Java 25, Node.js and `dpkg-deb` installed:

```bash
./packaging/linux/build-deb.sh 0.1.0
```

The build verifies the frontend and backend, embeds the frontend in the Spring
Boot JAR, creates a private Java runtime and writes the package plus its SHA-256
file to `dist/`.
