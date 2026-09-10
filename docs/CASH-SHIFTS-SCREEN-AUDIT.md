# Cash and Shifts Screen Audit

Source of truth: `SCREEN-INVENTORY.md` section H, `PRD (1).md` FR-CASH, and `CHECKLIST.md` Phase 5.

## Implemented in this stage

- `H-01` Shift list: current shift table with outlet, cashier, open/closed state, expected/count cash, and variance colour.
- `H-02` Shift detail foundation: current drawer summary and close-out figures are available from the cash hub; detailed sale history remains linked to the existing receipt history workflow.
- `H-03` End of day: payment-method reconciliation, outlet scope, print action, and close-out status.
- `H-04` Cash movement entry point: surfaced from the movement tab and reserved for the existing movement/audit write path.
- `H-05` Cash movement list: outlet, direction, amount, reason, and user columns.
- `H-06` Variance explanation: blind count and note submission are available in the end-of-day tab and use the existing shift close handler.
- `H-07` Open shifts: existing dashboard panel remains in place.
- `H-08` No-shifts state: explicit empty state in the movement workflow.
- `H-09` Expenses: existing Expenses & P&L screen remains available under Finance & Accounting.

## Navigation

Added one top-level `Cash Control` sidebar item. Shift list, end of day, and cash movements are horizontal tabs to keep the sidebar compact. Existing `Cashier Shifts` and `Expenses & P&L` entries were retained.

## Remaining hardening

Persisted multi-shift history, cash movement creation, receipt-photo expenses, and permission enforcement still require backend/data-layer work beyond the current in-memory demo state.
