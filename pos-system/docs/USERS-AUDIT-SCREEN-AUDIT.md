# Users, Audit, and Global States Audit

Source of truth: `SCREEN-INVENTORY.md` sections J and L, `PRD (1).md` FR-USER/FR-AUDIT/FR-SYNC, and `CHECKLIST.md` Phases 9 and 10.

## Implemented

- User accounts, add/edit/deactivate flows, outlet assignment, password reset, roles, permission matrix, and per-user capability visibility are available in Settings.
- Audit log is read-only, searchable, filterable by action and outlet, and opens a full entry detail modal.
- Permission-denied state includes a clear explanation and dashboard return path.
- Global page-not-found and server-error states remain available.
- Offline banner is global, non-blocking, and reacts to browser connectivity changes.

## Remaining hardening

Server-side authorisation, append-only audit persistence with before/after/IP fields, hashed credentials, rate limits, and durable offline queue replay remain backend work.
