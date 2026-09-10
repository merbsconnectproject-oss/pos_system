# Dashboard Screen Audit

Date: 2026-09-09

Source of truth:

- `docs/SCREEN-INVENTORY.md`, section B.
- `docs/PRD (1).md`, business objectives and dashboard/reporting requirements.
- `docs/CHECKLIST.md`, Phase 7 Reports and dashboard.

## Scope

This pass covers only `B. Dashboard`. Authentication was audited separately in `AUTHENTICATION-SCREEN-AUDIT.md`.

## Screen Conformance

| ID | Screen | Status | Implementation Notes |
|---|---|---|---|
| B-01 | Owner dashboard | Implemented | `super_admin` receives a whole-business dashboard with Both / per-outlet scope toggle, four filled stat tiles, four white cards, charts, low-stock list, recent sales, and top sellers. |
| B-02 | Manager dashboard | Implemented | `branch_manager` and `storekeeper` receive one-outlet operational dashboard with sales, profit, expected cash, low stock, open shift, pending approvals, recent sales, and operational lists. |
| B-03 | Cashier landing | Implemented | `cashier` receives a simplified selling-focused landing with continue/open shift action, own sales today, shift status, and expected cash. Profit and stock value are hidden. |
| B-04 | Dashboard loading | Implemented | `Dashboard` supports an `isLoading` state that renders grey tile and chart skeleton placeholders. |
| B-05 | First-run empty | Implemented | Empty data renders "No sales recorded yet" with links to products/import and open-shift action. |
| B-06 | Low stock alert strip | Implemented | Dismissible amber strip appears above dashboard tiles with count, first product, view-low-stock action, and receive-stock action. |

## Requirement Notes

- Owner view answers sales, estimated profit, expected cash, stock value, low stock, recent sales, and top sellers per `BO-1`.
- Cashier view intentionally hides profit and stock value per `B-03`.
- Manager view is branch-scoped from the authenticated outlet context.
- Charts are reused from the existing dashboard widgets to avoid introducing another chart system.

## Remaining Backend/Data Gaps

- Dashboard date filters are UI state only; they do not yet filter records by true date ranges.
- Open-shift count is based on the current local shift state, not a persisted multi-terminal shift table.
- Pending approvals are represented as operational placeholder rows until approval entities exist.
- Permission checks are role-based in the frontend; server-side permission enforcement remains a backend gap.
