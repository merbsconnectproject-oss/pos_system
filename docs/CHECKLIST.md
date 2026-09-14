# Build Checklist — Stage 1

**Companion to** PRD v1.0 · SCREEN-INVENTORY.md v1.0 · DELIVERY-PLAN.md
**Updated** 2026-09-14 · reflects the codebase as it stands, verified rather than assumed.

Grouped by feature, not by delivery phase, so a feature can be judged complete in one place.
Every item carries its requirement ID (`FR-`), business rule (`BR-`) or screen ID so it ties back to
the spec. The phase-ordered original is kept at `CHECKLIST-phases-v1.md.bak`.

---

## How to read this

Each line carries **two boxes**: the first is the frontend, the second is the backend/API.

```
- [x][ ] Multiple barcodes per product — FR-PROD-03 · D-06
   ^  ^
   |  backend: not started
   frontend: done
```

| Mark | Meaning |
|---|---|
| `[x]` | Done and verified |
| `[~]` | Partial — works, but not to the requirement |
| `[ ]` | Not started |
| `[-]` | Deferred to Stage 2 or 3, not in this release |
| `[!]` | Blocked |

An item is **complete only when both boxes are `[x]`**. A feature is complete when every
non-deferred item in its section is complete, including its non-functional items.

---

## Progress at a glance

| Feature | Items | Frontend | Backend |
|---|---:|---:|---:|
| A · Authentication & session | 12 | 12 done | 11 done, 1 partial |
| B · Outlets | 7 | 6 done, 1 deferred | 6 done, 1 deferred |
| C · Product catalogue | 14 | 8 done, 3 partial, 1 open, 2 deferred | 10 done, 2 deferred, 2 open |
| D · Units & conversions | 7 | 6 done, 1 open | 6 done, 1 open |
| E · Pricing | 8 | 4 done, 2 partial, 2 open | 0 |
| F · Inventory | 12 | 9 done, 2 partial, 1 deferred | 0 |
| G · Point of sale | 20 | 15 done, 4 partial, 1 deferred | 0 |
| H · Payments | 9 | 6 done, 2 partial, 1 deferred | 0 |
| I · Receipts & printing | 10 | 5 done, 4 partial, 1 deferred | 0 |
| J · Shifts & cash | 9 | 8 done, 1 partial | 0 |
| K · Suppliers & goods receipt | 10 | 5 done, 2 partial, 3 deferred | 0 |
| L · Customers | 7 | 5 done, 1 partial, 1 deferred | 0 |
| M · Users, roles & permissions | 8 | 7 done, 1 partial | 0 |
| N · Audit | 5 | 1 done, 2 partial, 2 backend-only | 0 |
| O · Reports & dashboard | 7 | 4 done, 2 partial, 1 deferred | 0 |
| P · Settings | 8 | 5 done, 3 partial | 0 |
| Q · Connectivity & resilience | 8 | 0 done, 2 partial, 5 open, 1 deferred | 0 |
| R · Cross-cutting non-functional | 18 | 6 done, 4 partial, 8 backend | 0 |

**Frontend ≈ 95% of Stage 1 · Backend: A, B, C, D done · E–R not started · Contract frozen and machine-checked (`npm run check`)**

---

## A · Authentication & session — `FR-AUTH`

### Functional
- [x][x] Sign in with username or email and password — FR-AUTH-01 · `A-01`
- [x][x] Sign-in error state with attempts remaining — FR-AUTH-02 · `A-02`
- [x][x] 4–6 digit PIN for counter approvals and unlock — FR-AUTH-02
- [x][x] Outlet selection after sign-in; single-outlet users placed automatically — FR-AUTH-03 · `A-03`
- [x][x] Lock the POS without ending the shift; unlock with the shift owner's PIN — FR-AUTH-04 · `A-07`
- [x][~] Idle timeout locks rather than signs out when a shift is open — FR-AUTH-05 · `A-08` *(server branch written and tested; unreachable until J sets `OPEN_SHIFT`)*
- [x][x] Idle period configurable, not a constant — FR-AUTH-05 · `K-08`
- [x][x] Failed sign-in attempts rate limited and logged — FR-AUTH-06 *(server enforces; 429 with retry-after)*
- [x][x] Password reset by administrator — FR-AUTH-07 · `A-04` `A-05` `A-06`
- [x][x] Self-service reset by email where an address exists — FR-AUTH-07 *(Resend; needs a key and verified domain to send)*
- [x][x] Deactivated user sees a clear message and cannot sign in — FR-AUTH-08 · `A-09` *(also revoked mid-session)*
- [x][x] Not-found and server-error pages — `A-10` `A-11`

### Non-functional
- [ ][x] Passwords hashed with bcrypt or argon2; PINs hashed separately — NFR-8 *(Argon2id, separate encoders)*
- [ ][x] Rate limiting on authentication and approval endpoints — NFR-10 *(checked before any hash work)*
- [x][x] Locking and unlocking does not close the shift or clear the cart — US-AUTH-1 acceptance

---

## B · Outlets — `FR-OUT`

### Functional
- [x][x] Multiple outlets supported; configured at launch — FR-OUT-01
- [x][x] Per-outlet name, trading name, address, phone, receipt footer — FR-OUT-02 · `K-04`
- [~][~] Per-outlet logo override — FR-OUT-02 *(field stored; no upload)*
- [x][~] Every sale, payment, movement, shift, cash movement and receipt tagged to one outlet — FR-OUT-03 *(outlet_id on every table; the tables land with F and G)*
- [x][x] Active outlet selected in the header and persists across screens — FR-OUT-04 · `L-10`
- [x][x] `outlet.view_all` may select "All outlets"; transactional screens require one — FR-OUT-05
- [x][x] Without the permission, the outlet is static text, not a control — FR-OUT-06 *(server refuses the write)*
- [-][-] Stock transfer between outlets with in-transit state — FR-OUT-07 *(Stage 3)*

### Non-functional
- [x][x] Adding a third outlet is configuration only, no schema or code change — NFR-16
- [ ][x] With Outlet A selected, no Outlet B record appears on any list, report or search — FR-OUT acceptance *(scoped in OutletServiceImpl.visibleTo)*

---

## C · Product catalogue — `FR-PROD`

### Functional
- [x][ ] Product record: name, SKU, category, brand, supplier, base unit, prices, reorder level, image, active flag — FR-PROD-01 · `D-03` `D-04`
- [ ][x] SKU auto-generated with manual override — FR-PROD-02 *({OUTLET}-{CATEGORY}-{NNN})*
- [ ][x] SKU unique across the system — FR-PROD-02 *(unique index on upper(sku))*
- [x][x] Multiple barcodes per product — FR-PROD-03 · `D-06`
- [x][x] Each barcode bound to one selling unit, so a carton scan adds a carton — FR-PROD-04 *(a code naming an unsold unit is refused)*
- [ ][x] Barcode unique system-wide — FR-PROD-03
- [x][x] Categories and brands managed as lists — FR-PROD-05 · `D-09` `D-10` *(add, rename, retire; units of measure too — FR-UOM-01)*
- [x][x] Search matches name, SKU, barcode, brand, category; partial and out-of-order terms — FR-PROD-06
- [x][ ] Search results show stock at the active outlet — FR-PROD-07 *(blocked on F: stock is per outlet)*
- [x][x] Products deactivated, never deleted — FR-PROD-08 · BR-17 · `D-19`
- [~][~] Full cost and price history retained and viewable — FR-PROD-09 · `D-08` *(price history recorded append-only; cost history needs F)*
- [x][ ] Bulk import: template, upload, column mapping, row validation, error file, preview, commit — FR-PROD-10 · `D-12`…`D-16` *(endpoint not built; SKU blocks needed, see ProductServiceImpl.generateSku)*
- [~][-] Bulk price update by category, brand or supplier with affected-count preview — FR-PROD-11 · `D-20` *(Stage 2; filters render, apply not wired)*
- [-][-] Product variants under a parent — FR-PROD-12 · `D-21` *(Stage 2)*

### Non-functional
- [ ][ ] Four-term partial query returns the product in the top three in under 300 ms at 3,000 products — NFR-1 · FR-PROD acceptance *(indexed, not yet measured at volume)*
- [ ][x] Full-text or trigram index on name, SKU, description — PRD §7.5 *(pg_trgm GIN on name and sku)*
- [x][ ] Empty and no-results states — `D-17` `D-18` · `L-03` `L-11`

---

## D · Units & conversions — `FR-UOM`

### Functional
- [x][x] One base unit per product, the smallest sellable unit — FR-UOM-01
- [x][x] Additional selling units with a conversion factor to base — FR-UOM-02 · `D-05`
- [x][x] Cashier picks the unit at the counter; quantity and price convert — FR-UOM-03 · `C-04`
- [x][x] A selling unit may carry its own price, not a multiple — FR-UOM-04
- [x][~] Goods received in a purchase unit, converted to base on receipt — FR-UOM-05 *(conversion is here; receiving is F/K)*
- [x][x] Fractional quantities to 3 decimal places — FR-UOM-06 · BR-12
- [ ][ ] Conversion factor locked once stock or transactions exist — FR-UOM-07 *(blocked on F: nothing to check against yet)*

### Non-functional
- [x][ ] Receiving 3 drums of 100 m gives 300 m; selling 12.5 m leaves 287.5 m; selling a drum leaves 187.5 m — FR-UOM acceptance *(asserted in `contract-check.ts`)*

---

## E · Pricing — `FR-PRICE`

### Functional
- [x][ ] Cost, retail and trade price per product — FR-PRICE-01 · `D-07`
- [x][ ] Floor price below which approval is required — FR-PRICE-02 · BR-10
- [ ][ ] Per-outlet price override — FR-PRICE-03
- [x][ ] Customer type determines the price level automatically — FR-PRICE-04
- [~][ ] Customer-specific fixed discount or agreed price — FR-PRICE-05 *(field on the record, not applied at the counter)*
- [~][ ] Price changes versioned with effective date and user — FR-PRICE-06 *(history view is mock)*
- [x][ ] Cost and margin visible only with `price.view_cost` — FR-PRICE-07
- [ ][ ] Accounting margin and replacement margin shown side by side — FR-PRICE-08

### Non-functional
- [x][ ] Money held as integer minor units on the wire; half-up rounding per line — BR-11 *(`money.ts`, asserted)*
- [x][ ] Historical documents keep the price used at the time — BR-5 · FR-PRICE-06

---

## F · Inventory — `FR-INV`

### Functional
- [x][ ] Stock held per product per outlet; no global quantity — FR-INV-01 · BR-1
- [x][ ] Movement types: RECEIPT, SALE, SALE_VOID, ADJUSTMENT_IN/OUT, DAMAGE, LOSS, OPENING — FR-INV-02
- [x][ ] Every movement records outlet, product, delta, unit cost, reason, note, user, timestamp, source — FR-INV-03 · BR-2
- [x][ ] Movement history filterable by product, outlet, type, user and date — FR-INV-04 · `E-03`
- [x][ ] Manual adjustments require a reason code and `stock.adjust` — FR-INV-05 · `E-07`
- [~][ ] Adjustments above the value threshold require `stock.approve_adjustment` — FR-INV-06 · `E-08` *(threshold configurable; approval gate not wired)*
- [x][ ] Weighted average cost recalculated per outlet on every receipt — FR-INV-07 · BR-4
- [x][ ] Low stock flagged at or below reorder level, per outlet — FR-INV-08 · `E-10`
- [x][ ] Valuation at weighted average cost, per outlet and combined — FR-INV-09 · `E-11`
- [x][ ] Exceptions view: oversells, large adjustments, write-offs — FR-INV-10 · `E-12`
- [~][-] Stock count: generate sheet, enter counts, review variance, approve, post as one batch — FR-INV-11 · `E-14` *(Stage 2; entry works, does not post)*
- [-][-] Quarantine state for faulty goods — FR-INV-12 *(Stage 3)*

### Non-functional
- [ ][ ] For any product at any outlet, quantity equals the sum of its movement deltas — FR-INV acceptance · BR-2
- [ ][ ] Nightly reconciliation job proves it and reports drift — NFR-17
- [x][ ] Cash movements are not stock movements, so the stock ledger holds only stock — BR-2

---

## G · Point of sale — `FR-POS`

### Functional
- [x][ ] Runs full screen without the application sidebar — FR-POS-01 · `C-01`
- [x][ ] A shift must be open before selling; otherwise prompt to open one — FR-POS-02 · `C-30`
- [x][ ] Scanner input captured globally, whatever has focus — FR-POS-03
- [x][ ] Scan distinguished from typing by inter-keystroke timing and a terminating Enter — FR-POS-04
- [x][ ] Scanning a product already in the cart increments and flashes that line — FR-POS-05
- [x][ ] Rapid consecutive scans queued; none dropped — FR-POS-06
- [x][ ] Unrecognised barcode shows an inline strip, not a modal — FR-POS-07 · `C-19`
- [x][ ] A product with more than one selling unit prompts for the unit — FR-POS-08 · `C-04`
- [x][ ] Cart lines: quantity, unit change, price override, discount, remove — FR-POS-09 · `C-05`
- [~][ ] Line and cart discounts capped by the user's `sale.discount_max` — FR-POS-10 · `C-06` *(ceilings configurable in K-08; not yet read by the POS)*
- [x][ ] Price below floor triggers manager PIN; approver recorded on the sale — FR-POS-11 · BR-10 · `C-07` `C-08`
- [x][ ] Customer attached by phone search or created inline — FR-POS-12 · `C-09` `C-10`
- [x][ ] Selling beyond stock blocked unless `stock.oversell` — FR-POS-13 · BR-9 · `C-21`
- [x][ ] Sales held with an optional label and resumed — FR-POS-14 · `C-22` `C-23`
- [x][ ] Held sales do not reserve stock — FR-POS-15
- [~][ ] Shortcuts: F2 payment, F3 hold, F4 search, F9 lock, Esc clear, arrows navigate, Enter add — FR-POS-16 *(function keys done; arrow navigation of results not wired)*
- [~][ ] Touch targets at least 44 px — FR-POS-17 *(not audited)*
- [x][ ] Past transactions searchable by receipt, date, customer, amount or item — FR-POS-18 · `C-25`
- [x][ ] Void with a reason by `sale.void`; reversing movements written — FR-POS-19 · BR-3 · `C-27`
- [-][-] Returns and refunds against an original receipt — FR-POS-20 · `C-35` `C-36` *(Stage 2; built ahead of scope)*

### Non-functional
- [ ][ ] A five-line sale completes with scanner and keyboard only, no mouse — FR-POS acceptance · NFR-12
- [ ][ ] Adding a scanned line renders in under 100 ms — NFR-1
- [ ][ ] Sale completion including stock decrement and persistence under 1 s — NFR-2
- [ ][ ] Two terminals cannot sell the same last unit — BR-8 · release gate 4
- [x][ ] No blocking browser dialog in the payment path — `L-08`

---

## H · Payments — `FR-PAY`

### Functional
- [x][ ] Cash, mobile money, card and bank transfer — FR-PAY-01 · `C-11`
- [~][ ] Cash captures tendered and calculates change; denomination shortcuts offered — FR-PAY-02 · `C-12` *(tendered and change done; denomination buttons absent)*
- [x][ ] MoMo, card and transfer capture a reference and require explicit confirmation — FR-PAY-03 · `C-13` `C-14`
- [x][ ] Split payment across two or more methods with a live remaining balance — FR-PAY-04 · `C-15`
- [x][ ] Sale cannot complete until payments equal the total exactly — FR-PAY-05
- [~][ ] Overpayment permitted only for cash, where the excess is change — FR-PAY-06
- [ ][ ] Every payment carries a UUID; resubmission rejected — FR-PAY-07 · BR-7
- [x][ ] The payment modal is the only modal permitted to block scanner input — FR-PAY-08
- [-][-] Refund to the original method, cash refunds permission-restricted — FR-PAY-09 *(Stage 2)*

### Non-functional
- [ ][ ] The same payment submitted twice records exactly one payment and returns the original result — FR-PAY acceptance · release gate 3
- [x][ ] Money comparison is exact, never within a tolerance — BR-11

---

## I · Receipts & printing — `FR-RCPT`

### Functional
- [x][ ] The sale is committed and persisted before any print is attempted — FR-RCPT-01
- [~][ ] Printing via ESC/POS through a local print service; no browser print dialogue — FR-RCPT-02 *(seam and client written; the Windows service is not)*
- [x][ ] Supports 58 mm and 80 mm — FR-RCPT-03
- [x][ ] Receipt content per PRD §9 — FR-RCPT-04
- [x][ ] A print failure never blocks or reverses the sale; a retry is offered — FR-RCPT-05 · `C-18`
- [x][ ] Reprints permitted, marked `REPRINT`, and logged — FR-RCPT-06 · `C-17`
- [~][ ] Printing may be skipped per sale — FR-RCPT-07
- [~][ ] Printer selection, paper width and test print per terminal — FR-RCPT-08 · `K-07` *(settings render; test print is not real)*
- [x][ ] Receipt layout previewable at both widths — FR-RCPT-09 · `K-05`
- [-][-] Cash drawer kick on cash sales — FR-RCPT-10 *(Stage 3)*

### Non-functional
- [ ][ ] With the printer switched off the sale completes, the number is issued, stock decrements, and it prints on retry — FR-RCPT acceptance · release gate 2
- [ ][ ] Receipt begins printing within 1 s of completion — NFR-3
- [x][ ] Receipt numbers per outlet, gapless, never reused, `{OUTLET}-{TERMINAL}-{SEQ}` — BR-6

---

## J · Shifts & cash — `FR-CASH`

### Functional
- [x][ ] Shift opened with a declared float, tied to user, terminal and outlet — FR-CASH-01 · `C-29`
- [ ][ ] Only one open shift per user and per terminal — FR-CASH-02 · BR-13
- [x][ ] Cash movements during a shift, each with a reason — FR-CASH-03 · `H-04` `H-05`
- [x][ ] Shift close requires a blind count; expected cash hidden until submitted — FR-CASH-04 · `C-31`
- [x][ ] Variance calculated and recorded against the user, never absorbed — FR-CASH-05 · BR-14 · `C-32`
- [x][ ] Variance beyond the configured threshold requires a written explanation — FR-CASH-06 · `H-06`
- [x][ ] Non-cash takings listed by method at close for reconciliation — FR-CASH-07
- [~][ ] End-of-day report per cashier, per outlet and for the business — FR-CASH-08 · `H-03` *(per outlet done; per cashier thin)*
- [x][ ] A closed shift cannot be reopened; corrections are separate cash movements — FR-CASH-09
- [x][ ] Shift list and shift detail — `H-01` `H-02`

### Non-functional
- [ ][ ] A blind close records the variance against the cashier and demands a note past threshold — release gate 9
- [x][ ] Expected cash = float + cash sales − cash refunds − cash payouts — BR-14

---

## K · Suppliers & goods receipt — `FR-SUP`

### Functional
- [x][ ] Supplier records: name, contact, phone, email, address, terms, notes, active — FR-SUP-01 · `F-01`…`F-04`
- [x][ ] Goods received into a specific outlet, with or without a prior order — FR-SUP-02 · `E-04`
- [x][ ] Receipt lines capture product, quantity, purchase unit, unit cost and reference — FR-SUP-03
- [x][ ] Confirming writes stock movements and recalculates weighted average cost — FR-SUP-04 · BR-4
- [x][ ] The confirmation screen shows resulting stock and the new average cost before commit — FR-SUP-05 · `E-05`
- [~][ ] A confirmed receipt cannot be edited; it is reversed by a correcting document — FR-SUP-06 *(stated in the UI; no reversal document)*
- [~][ ] Purchase history per supplier and per product — FR-SUP-07 · `F-05` `F-06`
- [-][-] Purchase orders, partial and over/short delivery — FR-SUP-08 *(Stage 2)*
- [-][-] Landed cost apportionment — FR-SUP-09 *(Stage 2)*
- [-][-] Supplier invoices, payments and balances — FR-SUP-10 *(Stage 2)*

### Non-functional
- [x][ ] Receiving 75 @ 42.00 then 50 @ 50.00 yields 125 @ 45.20 — BR-4 *(verified through the UI and asserted)*

---

## L · Customers — `FR-CUST`

### Functional
- [x][ ] Sales may complete with no customer attached — FR-CUST-01
- [x][ ] Customer records: name, phone, email, address, type, notes, active — FR-CUST-02 · `G-03` `G-04`
- [~][ ] Phone number is the primary lookup key and is unique — FR-CUST-03 *(lookup done; uniqueness is a constraint)*
- [x][ ] Customer types map to price levels — FR-CUST-04 · `G-06`
- [x][ ] Customers shared across both outlets — FR-CUST-05
- [x][ ] Purchase history per customer across both outlets — FR-CUST-06 · `G-05`
- [-][-] Credit limit, balance, ageing, statements, part payments — FR-CUST-07 · `G-08` *(Stage 2; built ahead of scope)*

### Non-functional
- [x][ ] Empty state explains walk-in sales need no customer — `G-07`

---

## M · Users, roles & permissions — `FR-USER`

### Functional
- [x][ ] Every person has an individual account; no shared logins — FR-USER-01 · `J-01` `J-03`
- [x][ ] Four seeded roles: Owner, Manager, Cashier, Storekeeper — FR-USER-02 · `J-05`
- [~][ ] Permissions granted individually and varied per user, not only per role — FR-USER-03 · `J-07` *(overrides in the contract and resolver; no per-user UI yet)*
- [x][ ] Permission matrix over all 31 PRD codes, grouped by area — `J-06`
- [x][ ] Users assigned to one or more outlets — FR-USER-04
- [x][ ] No user can modify their own permissions — FR-USER-05 · BR-16
- [x][ ] Controls the user lacks permission for are absent, not disabled — FR-USER-06 · `L-09`
- [x][ ] Users deactivated, never deleted — FR-USER-07 · `J-11`
- [x][ ] Every permission change written to the audit log — FR-USER-08

### Non-functional
- [ ][ ] Server-side authorisation on every endpoint; the UI is never the only control — NFR-9
- [x][ ] A cashier account shows no cost price, no profit and no reports anywhere — release gate 7 *(asserted)*
- [x][ ] Navigation authorisation has one source of truth shared by shell and sidebar — `L-09`

---

## N · Audit — `FR-AUDIT`

### Functional
- [~][ ] Entries capture actor, action, entity type and ID, before and after, outlet, terminal, IP, timestamp — FR-AUDIT-01 *(actor, action, entity, outlet, timestamp done; before/after, terminal and IP missing)*
- [~][ ] All listed actions logged: sign-in, sale, void, discount override, price change, adjustment, receipt, shift, cash movement, user and permission change, settings, reprint, export — FR-AUDIT-02
- [ ][ ] Append-only; no application path edits or deletes an entry, including for the Owner — FR-AUDIT-03 · BR-15
- [x][ ] Filterable by actor, action, entity, outlet and date — FR-AUDIT-04 · `J-08` `J-09`
- [ ][ ] Entries retained for the life of the system — FR-AUDIT-05

### Non-functional
- [x][ ] The log is visually marked read-only — `J-08`

---

## O · Reports & dashboard — `FR-RPT`

### Functional
- [x][ ] Owner dashboard: both outlets separately and combined — FR-RPT-01 · `B-01`
- [x][ ] Manager and cashier dashboards, scoped and operational — FR-RPT-02 · `B-02` `B-03`
- [~][ ] Every report filterable by outlet, date range, category, user and payment method — FR-RPT-03 · `I-16` *(outlet and date done; the rest partial)*
- [~][ ] All fifteen reports present with real data — FR-RPT-04 · `I-02`…`I-15` *(sales, product, category, cashier, customer, profit, best sellers, slow movers, stock, movements, payments, discounts, voids, purchases render; several need server-side aggregation)*
- [x][ ] Profit and cost figures only for `report.view_profit` — FR-RPT-05
- [x][ ] Monetary figures calculated from stored frozen costs, never current prices — FR-RPT-06 · BR-5
- [-][-] Export to Excel and PDF — FR-RPT-07 *(Stage 2; CSV export exists)*

### Non-functional
- [x][ ] Dashboard loading skeleton and first-run empty state — `B-04` `B-05`
- [x][ ] Report empty state offers to widen the range — `I-17`
- [ ][ ] Report queries perform acceptably against a full year of sales — NFR-1

---

## P · Settings — `FR-SET`

### Functional
- [x][ ] Business profile: legal name, trading name, contact details — FR-SET-01 · `K-02`
- [~][ ] Logo upload and persistence — FR-SET-01
- [x][ ] Per-outlet settings: name, address, phone, receipt footer, reorder defaults, receipt prefix — FR-SET-02 · `K-03` `K-04`
- [x][ ] Accent colour from a preset palette or hex, with live preview; orange default; no blue — FR-SET-03 · `K-06`
- [x][ ] Accent applied as a CSS custom property; semantic colours fixed and unaffected — FR-SET-04
- [~][ ] Terminal settings: printer, paper width, test print, auto-print — FR-SET-05 · `K-07`
- [x][ ] Operational thresholds: idle lock, adjustment approval, cash variance, discount ceilings — FR-SET-06 · `K-08`
- [~][ ] Backup status, last successful backup, restore history — FR-SET-07 · `K-09`
- [~][ ] Data export of all business data on request — FR-SET-08 · `K-10`

### Non-functional
- [x][ ] Changing the accent updates every accent surface, with no blue anywhere — release gate 11 *(621 literals migrated; asserted)*
- [x][ ] The accent is a single token; no hard-coded accent hex in any component — NFR-15
- [x][ ] Settings sections are absent without their permission — `L-09`

---

## Q · Connectivity & resilience — `FR-SYNC`

### Functional
- [ ][ ] Catalogue and prices cached locally so search and scanning work regardless of connection — FR-SYNC-01
- [ ][ ] Sales recorded locally and queued during a connection loss — FR-SYNC-02
- [~][ ] Queued sales retain receipt numbers from the pre-allocated block — FR-SYNC-03 · BR-6 *(block module written; queue not)*
- [~][ ] Persistent non-blocking banner shows offline status and queued count — FR-SYNC-04 · `C-33` *(banner present; no count)*
- [ ][ ] On reconnection the queue is submitted in order, idempotently — FR-SYNC-05 · BR-7 · `C-34`
- [ ][ ] Conflicts surfaced on an exceptions report, never silently resolved — FR-SYNC-06
- [ ][ ] Abrupt power loss does not corrupt data or lose a committed sale — FR-SYNC-07 · NFR-5
- [-][-] Full-day offline operation with reconciliation — FR-SYNC-08 *(Stage 3)*

### Non-functional
- [ ][ ] Counter functions tolerate dropouts of up to 15 minutes without interrupting trade — NFR-4
- [ ][ ] Disconnect mid-sale, reconnect: exactly one correct sale at the server — FR-SYNC acceptance · release gate 10

---

## R · Cross-cutting non-functional — `NFR`

### Performance
- [ ][ ] NFR-1 · Product search under 300 ms at 3,000 products; scanned line renders under 100 ms
- [ ][ ] NFR-2 · Sale completion under 1 s on a normal connection
- [ ][ ] NFR-3 · Receipt begins printing within 1 s

### Availability & durability
- [ ][ ] NFR-4 · Counter tolerates 15-minute dropouts
- [ ][ ] NFR-5 · No committed sale lost on abrupt power loss
- [ ][ ] NFR-6 · Automated daily off-site backup, 30-day retention, documented and **tested** restore
- [ ][ ] NFR-7 · Recovery point 15 minutes, recovery time 4 hours

### Security
- [ ][ ] NFR-8 · Passwords bcrypt/argon2, PINs hashed separately, TLS on all traffic
- [ ][ ] NFR-9 · Server-side authorisation on every endpoint
- [ ][ ] NFR-10 · Rate limiting on authentication and approval endpoints

### Usability & accessibility
- [ ][ ] NFR-11 · A cashier reaches competence on core selling in one training session
- [ ][ ] NFR-12 · Core selling requires no mouse
- [~][ ] NFR-13 · Latest Chrome and Edge on Windows 10/11; tablet browsers for stock functions
- [~][ ] NFR-14 · 4.5:1 contrast, keyboard-reachable controls, 44 px touch targets *(contrast verified on the sign-in hero; not audited app-wide)*

### Maintainability & data
- [x][ ] NFR-15 · The accent is a single token, no hard-coded accent hex
- [x][ ] NFR-16 · A third outlet is configuration only
- [ ][ ] NFR-17 · Nightly job reconciles stock against movement sums and reports drift
- [~][ ] NFR-18 · Currency GHS, dates DD/MM/YYYY, 24-hour time *(currency and most dates done; not audited app-wide)*

### Engineering hygiene
- [x][ ] Typecheck is real and passes — `@types/react` installed, `tsc --noEmit` clean
- [x][ ] Contract assertions pass — `npm run check`, 71 assertions
- [ ][ ] Frontend unit and end-to-end tests for money rounding, change due, floor approval, role visibility, date filtering, sale/void/receipt
- [ ][ ] CI runs typecheck, contract check and tests on both repos

---

## Release gate — PRD §11

The twelve criteria that define acceptance. Frontend column is what the UI can satisfy alone.

| # | Criterion | FE | BE | Notes |
|---|---|:--:|:--:|---|
| 1 | Five-line sale, scanner and keyboard only, prints, decrements the selling outlet | `x` | ` ` | Global scanner capture done and asserted |
| 2 | Sale with the printer off is not lost; prints on retry | `x` | ` ` | Needs a physical printer to sign off |
| 3 | A sale submitted twice records once | ` ` | ` ` | Idempotency is server-side |
| 4 | Two terminals racing the last unit: one sale, one refusal | ` ` | ` ` | Row lock, week 3 |
| 5 | 3 drums of 100 m, sell 12.5 m → 287.5 m and correct average cost | `x` | ` ` | `stockCosting.ts`, asserted |
| 6 | Void leaves original and reversal visible, restores stock, appears on the report | `x` | ` ` | |
| 7 | A cashier sees no cost, no profit, no reports anywhere | `x` | ` ` | Asserted in `contract-check.ts` |
| 8 | Below-floor sale needs a manager PIN; approver stored | `x` | ` ` | |
| 9 | Blind close records variance and requires a note past threshold | `x` | ` ` | Threshold configurable in K-08 |
| 10 | Disconnect mid-sale, reconnect: exactly one sale at the server | ` ` | ` ` | Week 6 |
| 11 | Accent change updates every accent surface, no blue | `x` | — | 621 literals migrated, asserted |
| 12 | For every product at every outlet, quantity equals the sum of movements | ` ` | ` ` | Nightly reconciliation, NFR-17 |

**7 of 12 satisfied on the frontend side. 0 of 12 signed off end to end.**

---

## Deployment window — parked

Not part of the six-week software scope. Tracked here so it is not forgotten.

- [ ] Client product catalogue filled into the template
- [ ] Catalogue loaded via the import wizard
- [ ] Opening stock counted and entered
- [ ] Staff accounts and PINs created for real people
- [ ] Counter PCs, thermal printers and scanners installed at both outlets
- [ ] Print verified on real hardware — closes release gate 2
- [ ] UPS at each counter
- [ ] Connectivity confirmed at both towns
- [ ] Inco Hardware: install, train, supervised trading
- [ ] Radiance Lighting: install, train, supervised trading
- [ ] Owner training on dashboard and control reports
- [ ] Hypercare period and snag list closed

---

## Out of scope for Stage 1

Listed so none of it is assumed into the price. Several are already built in the frontend, which is
exactly what makes them easy to assume.

**Stage 2** — credit sales and installments · quotations · purchase orders · returns and refunds ·
stock counting · barcode label printing · expenses · report export to Excel and PDF · product
variants · bulk price updates

**Stage 3** — stock transfers between outlets · deliveries and deposits · VAT and tax invoicing ·
GRA E-VAT integration · cash drawer and customer display · SMS receipts · a third outlet ·
full-day offline operation
