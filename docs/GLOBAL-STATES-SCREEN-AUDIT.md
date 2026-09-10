# Global States and Patterns Audit

Source of truth: `SCREEN-INVENTORY.md` section L and `CHECKLIST.md` Phases 9 and 10.

## Implemented or represented

- Loading/error/empty/no-result states exist across the principal list views.
- Global offline banner reacts to `online`/`offline` browser events.
- Permission-denied and page-not-found states are available in the shell.
- Destructive flows use existing confirmation/approval modals.
- Settings and other forms provide saving feedback through confirmation toasts.
- Outlet scope is shown through the global header and shared filters.
- Horizontal tab hubs preserve compact navigation while retaining feature access.

## Remaining hardening

Standardising pagination, bulk-selection bars, unsaved-change guards, toast undo semantics, and a durable sync queue should be completed alongside the server/API layer.
