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

## Development

Run `./mvnw test` for the full backend suite or `./run.sh` for the local counter
profile. See `AGENTS.md` for the project rules and `PROGRESS.md` for delivery
status.
