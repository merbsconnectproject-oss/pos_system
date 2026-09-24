# Radiance POS backend

Local-first Spring Boot backend for the Radiance/Inco point-of-sale system.

## Windows counter installer

The complete Windows packaging and first-run flow is documented in
[`packaging/windows/README.md`](packaging/windows/README.md). It produces one
offline x64 installer containing the web UI, Java runtime, PostgreSQL, services,
onboarding, diagnostics, upgrade handling and data-preserving uninstall.

```powershell
.\packaging\windows\build-installer.ps1 -Version 0.1.0
```

## Ubuntu counter installer

The Ubuntu package runs natively without Wine or Bottles. It bundles Java 25,
installs PostgreSQL, registers a hardened `systemd` service, and adds a desktop
launcher. Build and install it with:

```bash
./packaging/linux/build-deb.sh 0.1.0
sudo apt install ./dist/Radiance-POS_0.1.0_amd64.deb
sudo radiance-pos-setup
```

See [`packaging/linux/README.md`](packaging/linux/README.md) for operation and
troubleshooting commands.

## Development

Run `./mvnw test` for the full backend suite or `./run.sh` for the local counter
profile. See `AGENTS.md` for the project rules and `PROGRESS.md` for delivery
status.

### If a migration fails with "permission denied for schema public"

The suites will not catch this: Testcontainers builds the schema from nothing as
the owner of everything, so it never tests what the application role is
*allowed* to do against a database it did not create.

It means your local `pos_system` is owned by a different role from the one
`./run.sh` connects as — most often because the Ubuntu `.deb` was installed on
the same machine and took the database (see
`packaging/linux/README.md`). Since PostgreSQL 15 `CREATE` on `public` follows
the database owner, so the old role keeps its tables and loses the right to
create anything new.

Check it, and grant it back:

```bash
psql -h localhost -U giftedlabs -d pos_system \
  -tAc "select has_schema_privilege('giftedlabs','public','CREATE')"

sudo -u postgres psql -d pos_system \
  -c "GRANT CREATE ON SCHEMA public TO giftedlabs"
```

Without the grant the application still runs — it only needs to be able to
alter the tables it owns — but the next migration that adds a table or an index
will fail.
