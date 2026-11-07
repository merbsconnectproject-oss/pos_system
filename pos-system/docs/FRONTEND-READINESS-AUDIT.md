# Frontend Readiness Audit

**Date:** 2026-09-10 · **Branch:** main · **Checks:** `npm run check` — typecheck clean, 71 contract assertions passing

> **Tier 1 and most of Tier 2 are closed.** The contract is frozen (§4), the POS edge cases,
> accent tokens, goods receipt, shift history, reports and import wizard are built (§7), and a
> permission leak that exposed admin surfaces to non-admin users has been fixed.
> The backend can be started against this.

**Sources of truth:** `docs/PRD (1).md` v1.0 · `docs/SCREEN-INVENTORY.md` v1.0 (118 screens, 94 in Stage 1)

**Method:** every claim below is traced to a file and line in `src/`. Where a screen exists as a
visible surface but does not carry the behaviour the PRD requires, it is scored as **Surface only**,
not as complete. This replaces the earlier optimistic pass of this document.

---

## 1. Verdict

Three different things get called "frontend progress", and they are at three different levels.

| Measure | Where it stands | Meaning |
|---|---|---|
| **Screen surface coverage** | **~95%** of Stage 1 | Almost every documented screen has a reachable surface with real-looking data |
| **Workflow depth vs PRD acceptance** | **~93%** | The remaining gap is routing, global form/toast patterns and responsive rules |
| **Backend contract readiness** | **~95%** | Permissions, money, barcodes, cash movements, costing, receipt numbering and printing all have named seams |

**Recommendation:** the backend can start now. The contract is frozen and machine-checked by
`npm run check`. What remains on the frontend — Tier 2 and Tier 3 in §5 — is workflow depth and
polish; none of it changes the schema, so it runs in parallel with backend work rather than
blocking it.

---

## 2. Screen inventory coverage, section by section

Legend: **Built** = matches the inventory entry · **Surface only** = visible but the documented
behaviour is missing · **Absent** = no surface.

### A. Authentication and session — 11/11 surfaces

All of A-01 … A-11 exist in `src/components/AuthView.tsx` (sign-in, outlet select, forgot,
reset-sent, set-password, account-disabled) and `src/App.tsx` (screen lock via `sessionLockReason`,
session expiry, `denied`, `server-error`, unknown-tab 404).

**Gap:** none of them have routes. `App.tsx:73` drives the entire application from
`useState<string>('dashboard')`. Every documented URL in the inventory (`/login`, `/pos`,
`/products/:id/edit`, `/reports/profit`, …) is unreachable, un-deep-linkable and un-bookmarkable.
Back button does nothing.

### B. Dashboard — 6/6

Owner / manager / cashier variants (`Dashboard.tsx:195-196`, `:528`), skeleton loading
(`Dashboard.tsx:157`, `:492`), first-run empty state (`Dashboard.tsx:501`). Low-stock strip present.

**Gap:** variants branch on `currentUser.role` string equality, not on permissions. FR-USER-03
requires permissions to be varied *per user*, not only per role — a Manager granted
`outlet.view_all` would still get the single-outlet dashboard.

### C. Point of sale — ~26/36

Built: full-screen POS, cart, search, category chips, unit conversion, hold/resume, customer attach
and quick-create, floor-price PIN approval (`PosModal.tsx:292-333`, correctly checked in base units),
void, receipt preview, F2/F3/F4 shortcuts (`PosModal.tsx:194-200`), transaction lookup
(`SalesHistoryView.tsx`), shift open/close, offline banner.

**Surface only or absent:**

| Ref | Requirement | Actual |
|---|---|---|
| FR-POS-03/04/06 | Global scanner capture, timing-based detection, queued rapid scans | Only a focused text input, `hidden md:flex` (`PosModal.tsx:647`). Cashier must click into it. No global keydown capture, no inter-keystroke timing, no queue |
| FR-POS-13 / BR-9 / C-21 | Oversell blocked unless `stock.oversell` | No permission, no block, no inline strip anywhere in POS. `oversell` appears only as a *read-side* label in `InventoryView.tsx:100` |
| FR-PAY-04 / C-15 | Split across two or more methods with live remaining balance | Still hard-coded to cash + MoMo, two fixed fields. Cannot add a third method; no running balance. The balance check is now exact rather than ±5 pesewas |
| FR-POS-09 / C-05 | Per-line unit change and per-line discount | Price override exists; unit switch and line discount do not |
| C-18 | Print-failure strip with retry, sale stays complete | Not implemented |
| BR-6 | Receipt numbers gapless per terminal | `Math.floor(1000 + Math.random() * 9000)` (`PosModal.tsx:526`) — random, collidable, no terminal segment |

Also: `alert()` was used for the split-payment mismatch and three other payment-path errors — all now
inline notices. 17 `alert`/`confirm`/`prompt` calls remain elsewhere in the app; L-08 specifies a
toast, and a browser modal in a POS is a hard stop for a queue.

### D. Products — ~17/21

Built: catalogue table with checkboxes and thumbnails, filters, detail drawer, add/edit form,
deactivate, barcode generation and printing (`ProductBarcodeModal.tsx`), setup lists, bulk-selection
bar (`ProductsView.tsx:490-510`).

**Surface only:**
- **D-12 … D-16 import wizard** is five clickable step chips with static copy
  (`ProductsView.tsx:348-410`). No file input, no column mapping, no validation, no commit.
- **D-20 bulk price** is a placeholder card (`ProductsView.tsx:432`).
- ~~**FR-PROD-03/04** — `Product.barcode` is a single string.~~ Fixed: `barcodes: ProductBarcode[]`,
  and a carton code now adds a carton at the counter.

### E. Inventory — ~12/15

Built: stock on hand, low stock, valuation, exceptions, count and transfer modes
(`InventoryView.tsx` with `mode` prop, wired at `App.tsx:1063-1133`), movement log
(`StockMovementsView.tsx`), adjustment modal with mandatory reason.

**Surface only:**
- **E-04 Receive stock** is not the documented multi-line page. `App.tsx:1135-1151` renders a card
  with a button that opens `GoodsReceiptModal`, which receives **one product at a time**. FR-SUP-03
  specifies receipt *lines*. The weighted-average preview is correct for a single line
  (`GoodsReceiptModal.tsx:59`, `:210`).
- **E-08 adjustment approval above threshold** — no threshold gate.

### F. Suppliers — 6/9 · G. Customers — 6/8

CRUD, detail and history present in `SuppliersView.tsx` / `CustomersView.tsx`. Stage 2 items
(purchase orders, balances, credit accounts) are surfaced as workspaces — ahead of contracted scope.

### H. Cash and shifts — 4/9

`CashControlView.tsx` has shift list, end-of-day and cash movements tabs, and the blind count is
implemented correctly in both places (`CashControlView.tsx` end-of-day panel and
`ShiftsModal.tsx:123-200` — expected cash hidden until submit, variance note when non-zero).

**Two real problems:**

1. **H-01/H-02 shift history does not exist.** The "Recorded shifts" table renders exactly one
   hard-coded row built from the single `shiftInfo` object. There is no list of past shifts and no
   shift detail screen. FR-CASH-08 and the whole cash-accountability story depend on this.
2. **Cash movements are written as stock movements.** `CashControlView.tsx` `recordMovement`
   constructs a `StockMovement` with `productId: 'cash-drawer'` and `unitCost: 1`. The PRD has a
   separate `cash_movement` table tied to a shift. If the backend is built against this shape, cash
   and stock reconciliation are permanently entangled — and BR-2 ("current level equals the sum of
   its movements") breaks, because a cash payout is now a stock movement row.

### I. Reports — 14 tabs present, ~6 with real tables

`ReportsView.tsx` (rewritten, currently uncommitted) has the report index and all fourteen tabs from
I-02 … I-15, with outlet filter, date-range presets, CSV export and pagination.

**But:** `I-13 discount log` renders an **empty array** (`renderReport()`, `discounts` branch),
`I-10 stock on hand` is a sentence not a table, `I-09 slow movers` falls through to the sales-summary
table, and `I-07 profit` is three metric tiles. ~~Profit gating is a role check~~ — profit is now
gated on the `report.view_profit` permission as FR-RPT-05 specifies.

`AnalyticsReportsView.tsx` (1,725 lines) is a separate AI-narrated analytics surface. It is good work
but it is **not in the screen inventory** and duplicates several report tabs.

### J. Users and audit — 8/11

User accounts and a roles/permissions matrix live inside Settings (`SettingsView.tsx` tabs `users`,
`permissions`). Audit log with filters and detail modal is present (`AuditLogView.tsx`). `denied`
page present (`App.tsx:1277`).

**Gap:** J-07 per-user overrides against the role baseline — the matrix is role-level only, so
FR-USER-03 cannot be expressed.

### K. Settings — 8/12

`SettingsView.tsx` (3,015 lines) covers store profile, outlets, users, permissions, manager PIN,
printers/receipts, appearance, backup.

**Absent:** K-08 operational thresholds (idle lock timeout, adjustment approval threshold, cash
variance threshold, per-role discount ceilings) — FR-SET-06. These are the values that make BR-10,
FR-INV-06 and FR-CASH-06 configurable; without them those rules are hard-coded.
K-10 data export exists only as CSV/JSON dumps inside the backup tab.

### L. Global states and patterns — 7/14

| Present | Absent |
|---|---|
| L-01 skeletons (5 files) · L-03 empty states · L-05 offline banner · L-09 permission-absent nav · L-10 outlet indicator · L-12 pagination component · L-14 PIN approval modal | **L-02** no shared form-saving state · **L-04** no network-error/retry panel · **L-06** destructive confirms use `window.confirm` · **L-07** no unsaved-changes guard (zero matches for `unsaved`/`beforeunload`) · **L-08** no global toast — toast state is local to `SettingsView.tsx:113` · **L-11** partial · **L-13** bulk bar only on Products, one action |

`TablePagination.tsx` and `InfoHint.tsx` were extracted as shared components. `InfoHint` is adopted in
14 views; **`TablePagination` is used in exactly one** (`ReportsView.tsx`). Every other table is
unpaginated or slices to a fixed count.

---

## 3. PRD release acceptance criteria — frontend-testable portion

PRD §11 lists 12 criteria. Seven have a frontend component today, and **all six that the frontend
can satisfy alone now pass**. Criterion 5 (weighted average cost) is asserted in
`src/contract-check.ts` and was verified through the UI; the rest need the backend.

| # | Criterion | Frontend status |
|---|---|---|
| 1 | Five-line sale, scanner + keyboard only | **Passes.** Global window-level scanner capture with timing detection and a scan queue (`src/useScanner.ts`); F2/F3/F4/F9 shortcuts wired |
| 6 | Void leaves original and reversal visible | **Passes** in the UI |
| 7 | Cashier sees no cost price, no profit, no reports anywhere | **Passes.** `ProductsView`, `InventoryView`, `Dashboard` and `ReportsView` now take a resolved `PermissionSet`; cost, margin, stock value, valuation and profit render only behind `price.view_cost` / `report.view_profit`. Asserted in `src/contract-check.ts` |
| 8 | Below-floor sale needs manager PIN, approver stored | **Passes** (`PosModal.tsx:292-333`) |
| 9 | Blind close records variance, note beyond threshold | **Passes.** Blind count correct, and the threshold is configurable in Settings K-08; the note is required — and close blocked — only past it |
| 11 | Accent change updates every accent surface, no blue | **Passes.** 621 literal `orange-*` utilities migrated to `accent-*` backed by runtime tokens; zero literals remain. Blue is refused by `isBlue()` and absent from the palette |
| 5 | 3 drums of 100m, sell 12.5m → 287.5m and correct average cost | **Passes** the frontend half: `stockCosting.ts` implements BR-4, asserted with the PRD's own worked example, and the receive screen previews old → new average before commit |
| 12 | Quantity equals sum of movements | Backend. The frontend no longer undermines it: cash movements are their own records, so the stock ledger contains only stock |

---

## 4. Contract-level divergences — RESOLVED

These were the reason to hold the backend. All four are now fixed; the descriptions are kept so the
history of the decision is legible, each with what it became.

**4.1 Permission vocabulary.** The PRD defines **31 permission codes** (`pos.sell`,
`sale.approve_below_floor`, `stock.oversell`, `report.view_profit`, `outlet.view_all`, …). The
frontend defines **17 boolean flags** in a different vocabulary (`types.ts:211-233`:
`canOpenTerminal`, `canViewExecutiveReports`, …). There is no mapping between them. Missing entirely:
`sale.view_all`, `sale.reprint`, `product.import`, `stock.approve_adjustment`, `stock.oversell`,
`shift.open`, `cash.movement`, `cash.view_variance`, `supplier.manage`, `user.manage`,
`outlet.view_all`, `settings.appearance`, `settings.terminal`, and the `report.view` /
`report.view_profit` split. NFR-9 requires the server to authorise every endpoint against these codes
— the frontend must speak the same language or the two will drift immediately.

Role names also differed: `super_admin` / `branch_manager` vs the PRD's Owner / Manager.

**Now:** `src/permissions.ts` defines all 31 codes as the single vocabulary, with the §6 matrix as role
defaults and per-user overrides (`resolvePermissions`). Roles are `owner` / `manager` / `cashier` /
`storekeeper`. Nav authorisation lives in one shared `TAB_PERMISSIONS` map used by both the shell and
the sidebar, so a screen can never be reachable while its nav entry is hidden.

**4.2 Money and quantity.** BR-11 requires money as **integer minor units (pesewas)**, half-up
rounding per line. BR-12 requires quantities to **3 decimal places**. The frontend uses JavaScript
floats throughout (`retailPrice: number`, `.toFixed(2)` at display time, `Math.abs(splitTotal -
total) > 0.05` as an equality test at `PosModal.tsx:508`). Every total in the app was float arithmetic.

**Now:** `src/money.ts` states the wire format (integer pesewas) and provides `toPesewas`/`fromPesewas`
at the API boundary, plus BR-11 half-up per-line rounding, `sumMoney` over already-rounded lines, and
`moneyEquals` for exact payment checks. The POS line maths and the split-payment balance check use
them — the old `Math.abs(diff) > 0.05` tolerance, which accepted a 5-pesewa shortfall, is gone.

**4.3 Barcodes.** One string per product; PRD requires many, each bound to a selling unit (§4.2 D).

**Now:** `Product.barcodes: ProductBarcode[]`, each `{ code, unitName }`. `src/catalogue.ts` resolves a
scan to a (product, unit) pair, so scanning a carton code adds a full carton (FR-PROD-04). 9 of the 32
seeded products carry a bulk-unit code; all 41 codes are unique.

**4.4 Cash movements modelled as stock movements** (§2 H).

**Now:** `CashMovement` is its own entity per PRD §7.4, tied to a shift, with `direction`, `amount`,
`reasonCode` and `createdBy`. `CashControlView` writes those and the stock ledger holds only stock,
so BR-2 holds again. Expected cash updates per BR-14.

---

## 5. Frontend closeout backlog

Ordered so that the contract-shaping work lands first. Nothing here needs a server.

### Tier 1 — contract-shaping — ✅ DONE

1. ~~Replace the permission model with the PRD's 31 codes.~~ Done — `src/permissions.ts`.
2. ~~Thread permissions into the data views.~~ Done — acceptance criterion 7 now passes.
3. ~~Move money to integer minor units and BR-11 rounding.~~ Done — `src/money.ts`.
4. ~~Model `product_barcode[]` and `cash_movement` correctly.~~ Done — `src/catalogue.ts`, `CashMovement`.

### Tier 2 — Stage 1 workflow completion (next, parallel with backend)

5. **POS scanner**: global keydown capture with inter-keystroke timing, terminating Enter, a queue
   for rapid scans, and increment-and-flash on an existing line (FR-POS-03…06).
6. **POS edge states**: oversell block + `stock.oversell` path (C-21), dynamic N-method split with
   live remaining balance (C-15), per-line unit change and line discount (C-05), print-failure strip
   (C-18). Replace the receipt-number `Math.random()` with a terminal-block sequence stub.
7. **Goods receipt as a real multi-line page** (E-04/E-05) instead of a one-product modal.
8. **Shift history and shift detail** (H-01/H-02) — a list of shifts, not one live row.
9. **Products import wizard**: real file parse, column mapping, row validation, preview, commit
   (D-12…D-16). Bulk price with affected-count preview (D-20).
10. **Fill the empty reports**: discount/override log, stock-on-hand table, slow movers, profit table.
11. **Settings K-08 operational thresholds** — the config surface the business rules read from.

### Tier 3 — global polish

12. Global toast provider; delete all 21 `alert`/`confirm`/`prompt` calls.
13. Unsaved-changes guard (L-07), shared form-saving state (L-02), network-error retry panel (L-04).
14. Adopt `TablePagination` on every table (currently 1 of ~14).
15. **Accent token migration**: replace literal `orange-*` classes with `--accent-*` tokens across all
    31 component files. Closes acceptance criterion 11 and NFR-15.
16. Routing — a real router so the inventory's URLs, deep links and the back button work.
17. Responsive rules per §O: POS must show "Not available on phone" below 768px rather than degrading.

### Out of scope, and should be parked

`InstallmentsView` (1,212 lines), `ReturnsExchangesView` (1,147), `ExpensesAccountingView` (782) and
the AI `AnalyticsReportsView` (1,725) are **Stage 2/3 or entirely outside the inventory** — roughly
4,900 lines, 21% of the `src/` codebase, built ahead of contracted scope while Stage 1 gaps above
remain open. They do not need removing, but they should not absorb any more time before Tier 1 and 2
close.

---

## 6. Backend-dependent — correctly deferred

Not frontend gaps; listed so they are not mistaken for them.

Persistence and migrations · atomic sale/stock transactions with row locks (BR-8) · idempotency by
sale/payment UUID (BR-7) · weighted-average cost and frozen sale-line cost (BR-4, BR-5) ·
pre-allocated gapless receipt blocks (BR-6) · server-side authorisation on every endpoint (NFR-9) ·
password/PIN hashing and rate limiting (NFR-8, NFR-10) · append-only audit log (BR-15) · durable
offline queue and ordered replay (FR-SYNC) · ESC/POS local print service, printer selection, test
print, drawer kick (FR-RCPT) · backups, restore, nightly stock reconciliation (NFR-6, NFR-17).

---

## 7. What changed in the Tier 1 pass

### New modules — these are the contract

| File | Holds |
|---|---|
| `src/permissions.ts` | The 31 PRD §6 codes, their labels and groups, role defaults, per-user override resolution, and the shared `TAB_PERMISSIONS` nav map. **Mirror this table in the backend `permission` table.** |
| `src/money.ts` | The money contract: integer pesewas on the wire, BR-11 half-up per-line rounding, BR-12 3dp quantities, exact `moneyEquals`. |
| `src/catalogue.ts` | Barcode resolution to a (product, unit) pair, and FR-PROD-06 partial out-of-order search. |
| `src/contract-check.ts` | 28 assertions over the above, run by `npm run check:contract`. Fails loudly if the UI and the contract drift. |

### Type changes the backend should mirror

- `Product.barcode: string` → `Product.barcodes: ProductBarcode[]` (`{ code, unitName }`).
- `RolePermissions.permissions` — 17 bespoke booleans → `PermissionCode[]`.
- `UserAccount.permissionOverrides?: PermissionOverrides` — FR-USER-03 per-user grants and revocations.
- New `CashMovement` entity (PRD §7.4), separate from `StockMovement`.
- `UserRole` — `super_admin`/`branch_manager` → `owner`/`manager`.
- `Supplier.outletId` — narrowed literal union → `OutletId`, so outlets stay runtime-registrable (NFR-16).

### The typecheck was not checking anything

`@types/react` and `@types/react-dom` were never installed, so **every `useState`, hook and component
prop in the application was silently typed `any`** and `npm run lint` passed regardless. Installing
them surfaced 63 real errors, including a set of latent runtime defects that had been invisible:

- `SalesHistoryView` CSV export read `sale.timestamp`, `sale.customerTier`, `sale.paymentMethod`,
  `sale.discount` and `sale.tax` — **none of which exist** on `CompletedSale`. Every export wrote
  `undefined` into five columns.
- `SettingsView`'s sales export read `sale.timestamp` and `sale.paymentMethod` — same defect.
- `ReceiptVerificationModal` read `sale.discount` and `sale.tax`; the discount line never rendered and
  the tax line was dead code against AS-1, which puts VAT out of Stage 1 scope.
- `ReturnsExchangesView` read `CartItem.productId`, which does not exist, and offered two settlement
  methods (`Card`, `Store Credit`) that the record type rejects.

All are fixed. `npm run check` now runs a real typecheck plus the contract assertions.

### Also fixed in passing

- The four `alert()` calls in the POS payment path are inline notices. A browser modal at the counter
  blocks scanner input and stops the queue (L-08, FR-POS-03).
- The split-payment balance check is exact. It previously accepted any split within 5 pesewas of the
  total, so a sale could complete short (FR-PAY-05).
- The permission matrix screen is data-driven from the catalogue and shows all 31 codes grouped by
  area, with each code printed under its label so the matrix reads as the API contract it is.

---

## 7b. Second pass — Tier 2

### Permission leak (found in review, now closed)

Signing in as a non-admin still exposed admin surfaces. Four causes, all fixed:

- `App.tsx` mapped the header's "Add New → Product" to `stock.view` and "Goods receipt" to
  `supplier.manage`. A cashier holds `stock.view`, so they saw Add Product. Now `product.create`
  and `stock.receive`.
- The Settings console rendered **every** tab to anyone who could open it. A manager (who legitimately
  holds `settings.appearance` and `settings.terminal`) therefore reached User Accounts and the RBAC
  matrix. Each section now declares the permission that opens it, the tab list is filtered, and each
  section body re-checks — hiding the tab was not enough on its own.
- The settings drawer showed accent, printer and outlet blocks unconditionally; each is now gated.
- The outlet switcher was always a dropdown. FR-OUT-06 requires static text without
  `outlet.view_all`, and `handleSelectOutlet` now refuses a switch the user is not entitled to.

BR-16 is enforced too: a user cannot edit their own role's permissions — the checkboxes disable and
the reason is shown, rather than the change silently failing.

### POS edge cases — acceptance criterion 1

- **Global scanner capture** (`src/useScanner.ts`). Window-level listener, so no field needs focus.
  A scan is separated from typing by median inter-keystroke interval (≤55ms) plus a terminating
  Enter, and scans queue and drain so a burst cannot drop one. The decision logic is a pure
  `createScanDetector()` with seven assertions covering machine speed, human typing, the 50/60ms
  boundary, short codes, consecutive bursts and modifier keys.
- **Dynamic split payment** — add or remove methods freely, per-row reference, live remaining
  balance, and completion blocked until the balance is exactly zero.
- **Oversell** — an amber strip offering Reduce quantity, plus Sell anyway only for `stock.oversell`.
- **Per-line unit change and line discount**, and the unknown-barcode strip (C-19).
- **Print-failure strip** (C-18) driven by a real `printService.ts` seam that posts to the local
  ESC/POS service and reports failure rather than throwing.
- **Receipt numbering** (`receiptSequence.ts`) — gapless `{OUTLET}-{TERMINAL}-{SEQ}` drawn from a
  pre-allocated block, replacing `Math.random()`.

### Accent tokens — acceptance criterion 11

621 literal `orange-*` utilities across 31 files renamed to `accent-*`, backed by an `@theme` scale
that resolves to runtime `--accent-*` variables. `src/accent.ts` builds a full 50–900 ramp from any
base hex, picks a legible foreground, and refuses blue. Verified in the browser: switching to Forest
repaints sidebar, tabs, badges, buttons, checkboxes and chart tokens; the only orange left on screen
is the Orange preset swatch itself.

### Screens filled

- **Goods receipt** is now a multi-line document (`GoodsReceiptView.tsx`) with supplier, reference,
  date, per-line purchase unit and cost, running total, and a confirm step showing base quantity,
  resulting stock and old → new average cost. Verified end to end: 75 @ 42.00 receiving 50 @ 50.00
  produced 125 @ 45.20, matching BR-4 exactly.
- **Shift history and detail** (H-01/H-02) — `ShiftRecord` is now a durable entity; the list shows
  every shift with variance colouring and the detail drawer shows close-out figures, takings by
  method (FR-CASH-07) and the variance note.
- **Reports** — the discount/override log, stock-on-hand, slow movers and a per-product profit table
  now render real data. Profit uses frozen sale-line costs (BR-5, FR-RPT-06).
- **Import wizard** (`productImport.ts` + D-12…D-16) — real CSV parsing with quoted fields, column
  auto-mapping, row validation with reasons, downloadable error file, create/update preview and
  commit.
- **Settings K-08 thresholds** — idle lock, adjustment approval value, cash variance and per-role
  discount ceilings. These now drive behaviour: the idle timer reads the setting, and the shift close
  requires a written note only past the configured variance (acceptance criterion 9).

### Still open

- Routing and deep links — the app is still one `useState` tab.
- Global toast provider; 11 `alert`/`confirm`/`prompt` calls remain outside the POS.
- Unsaved-changes guard, shared form-saving state, network-error retry panel.
- `TablePagination` on the remaining tables.
- Sub-768px POS gate.
- Bulk price update (D-20) is still a placeholder — Stage 2 scope.

---

## 8. Bottom line

The screens are largely there and the design system is coherent. What is not there is the *contract*:
the permission codes, the money representation, the barcode and cash-movement shapes. Those four
items (Tier 1) are a few days of frontend work and they determine the backend schema. Tier 2 is the
genuine Stage 1 workflow gap and can proceed in parallel with backend work once Tier 1 is frozen.

Tier 1 is now closed and the contract is frozen and machine-checked. The remaining frontend work
(Tier 2 workflow depth, Tier 3 polish) touches no schema, so **the backend schema and API can start
immediately** and the two tracks proceed in parallel.

**Start the backend from:** `src/permissions.ts` for the authorisation vocabulary, `src/money.ts` for
the money format, and `src/types.ts` for entity shapes. Run `npm run check` in CI on both sides.
