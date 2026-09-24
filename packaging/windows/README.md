# Radiance POS for Windows

The Windows package is a single offline x64 installer for a counter PC. It
contains the React UI inside the Spring Boot JAR, a private Java 25 runtime,
PostgreSQL 18, and WinSW. The installed application binds only to
`127.0.0.1`; no shop-LAN firewall exception is created.

## What setup does

1. Requires an administrator and installs under `Program Files`.
2. Collects and validates the first owner, password, approval PIN, outlet and
   terminal. Off-site S3-compatible backup is optional during setup.
3. Initializes a private PostgreSQL cluster on port `54329`, reachable only on
   loopback, and registers it as `RadiancePosPostgreSQL`.
4. Creates the application database and a random application-only credential.
5. Registers `RadiancePos` as a delayed, restart-on-failure Windows service
   running as `LocalService`.
6. Applies all Flyway migrations, creates the first owner/outlet/terminal and
   waits for `/actuator/health` to report `UP`.
7. Removes the plaintext bootstrap password and PIN, restarts the application,
   and verifies health again before opening the POS.
8. Adds Start-menu entries for opening, repairing and diagnosing the install.
   The POS opens through Edge or Chrome's installed-app mode as a dedicated,
   maximized Radiance POS window without an address bar or browser tabs.

Runtime data is under `%ProgramData%\GiftedLabs\Radiance POS`. ACLs separate
the PostgreSQL administrator secret from the lower-privilege application
service. Uninstall removes binaries and both services but deliberately retains
the database and backups.

## Build the installer

Run from an x64 Windows build machine with JDK 25, Node 22 and Inno Setup 6:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\packaging\windows\build-installer.ps1 -Version 0.1.0
```

The frontend is expected in the sibling `pos-system` directory. Override it
with `-FrontendRoot`. For reproducible/offline builds, pre-download PostgreSQL
and WinSW and pass `-PostgresArchive`, `-PostgresSha256`, `-WinSwPath` and
`-WinSwSha256`; release builds should always pin both dependency hashes. Output is written to
`dist\Radiance-POS-Setup-<version>-x64.exe` with a SHA-256 sidecar.

The build runs the frontend checks and backend suite, builds the Vite-only web
output, embeds it in the JAR, checks that `static/index.html` is present, creates
a private runtime with `jlink`, and compiles the installer. It also refuses to
ship a tool script that does not parse, and writes `VERSION.txt` next to the
application — version, commit and build time — so a support call can start with
what is actually installed rather than with a guess.

## How the shortcuts run

Every Start-menu and desktop entry goes through `tools\launch.vbs` rather than
`powershell.exe` directly, because PowerShell applies `-WindowStyle Hidden` only
after the host already owns a console, so each launch drew a black window first.

```
wscript launch.vbs [/elevate] [/show] <tool.ps1> [arguments...]
```

- `/elevate` raises the UAC prompt itself, so setup and restore never depend on
  somebody remembering to right-click and choose *Run as administrator*.
- `/show` keeps the console visible, used where an unseen error is worse than an
  unwanted window.

A tool that has already shown the operator a dialog exits **64**. The shim
reports every other non-zero exit itself, so a failure before a tool's own error
handling — a blocked execution policy, a host that will not start — still
reaches the counter instead of leaving an icon that appears to do nothing.

## Interactive install

Run the installer as an administrator. Setup opens the first-run wizard at the
end. If onboarding is cancelled or interrupted, use **Configure or repair
Radiance POS** from the Start menu; existing sales data is reused.

The following are never sent elsewhere by setup:

- owner password and PIN (removed after their Argon2 hashes are stored);
- generated database credentials;
- optional bucket credentials.

## Silent install

Copy `onboarding.example.json`, replace every example credential, restrict the
file's ACL, then run:

```powershell
.\Radiance-POS-Setup-0.1.0-x64.exe /VERYSILENT /SUPPRESSMSGBOXES `
  /ONBOARDING=C:\secure\radiance-onboarding.json
```

A fresh silent install is rejected without `/ONBOARDING`. Delete the response
file after setup. Upgrades do not need it and preserve the database/config.

## Upgrade and recovery behavior

- Re-running a newer installer stops the app, replaces binaries, keeps
  ProgramData and starts it again. Flyway performs forward-only migrations.
- A failed first run leaves the bootstrap configuration available for a retry;
  it is sanitized only after a healthy start.
- **Restore a Radiance POS backup** first saves the current database, decrypts
  `.dump.enc` objects when necessary, restores in one transaction, and restarts
  and health-checks the application.
- **Diagnostics** writes the installed version and commit, service state,
  health, disk space and the latest log tail to a text file on the current
  user's desktop. It does not copy secrets.
- Local backups are written every 15 minutes. Cloud Sync's trading-upload
  interval is independently configurable in Settings from 15 minutes to 24
  hours. Disk-loss protection requires
  off-site backup; configure it during onboarding or later in Settings.
- Uninstall never deletes the database. Once a restorable backup has been
  verified, an administrator may explicitly remove the retained ProgramData
  directory.

## Signing and release

Production installers should be Authenticode-signed after building and before
publication. Publish the `.sha256` file alongside the installer. The CI workflow
produces an unsigned artifact for testing; a signing certificate is intentionally
not stored in the repository.
