# Settings Screen Audit

Source of truth: `SCREEN-INVENTORY.md` section K, `PRD (1).md` FR-SET, and `CHECKLIST.md` Phase 8.

## Implemented

- Settings index implemented as a compact horizontal module hub.
- Business profile and tax fields.
- Outlet list, outlet creation/editing, receipt prefix, footer, and staff assignment.
- User accounts, roles, permissions, and security/PIN policies.
- Receipt and printer configuration with 58mm/80mm preview, auto-print, and cashier visibility.
- Appearance preset/hex accent picker with live preview and reset-to-orange action.
- Backup JSON export and accounting CSV export.
- Save confirmation toasts are used across settings mutations.

## Remaining hardening

Real printer test output, scheduled backups/restore history, logo upload persistence, terminal inventory, and dedicated threshold/export/tax API routes require backend or hardware integration.
