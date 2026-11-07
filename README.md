# Radiance POS

| Folder | What it is |
|---|---|
| `pos-api/` | Spring Boot backend, PostgreSQL schema, and the Windows/Linux packaging |
| `pos-system/` | React + Vite counter UI, bundled into the backend for release builds |

## Builds

- **Backend** and **Frontend** workflows run each project's tests when its folder changes.
- **Windows package** builds the offline installers on every push to `main` or a `v*` tag,
  installs one on a clean runner, and uploads it beside `Install Radiance POS.cmd`.

## Installing on a counter PC

Download the `radiance-pos-windows-…` artifact, keep both files in one folder and
double-click **Install Radiance POS.cmd**. It works even when the Windows account has a
space in its name. See `pos-api/packaging/windows/README.md` for details.
