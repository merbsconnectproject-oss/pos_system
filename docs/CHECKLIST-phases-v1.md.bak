# Build & Delivery Checklist
## POS & Inventory System — Two Outlets

Companion to PRD v1.0 and Screen Inventory v1.0. Every item references its requirement (`FR-`) or screen (`A-01`) ID so progress ties back to the spec.

**Progress:** `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked · `[-]` deferred

| Phase | Items | Done | Status |
|---|---|---|---|
| 0 · Pre-build | 24 | | |
| 1 · Foundations | 39 | 12 | design system done, data model and auth open |
| 2 · Catalogue & units | 31 | | |
| 3 · Inventory | 27 | | |
| 4 · POS, payments, receipts | 54 | | |
| 5 · Shifts & cash | 21 | | |
| 6 · Suppliers & customers | 20 | | |
| 7 · Reports & dashboard | 29 | | |
| 8 · Settings & appearance | 22 | | |
| 9 · Resilience & sync | 16 | | |
| 10 · Security & audit | 18 | | |
| 11 · Testing | 41 | | |
| 12 · Data migration | 17 | | |
| 13 · Deployment & ops | 19 | | |
| 14 · Outlet 1 go-live | 24 | | |
| 15 · Outlet 2 go-live | 18 | | |
| 16 · Warranty & handover | 15 | | |
| **Total** | **415** | **12** | |

---

## Phase 0 — Before writing code

### Commercial
- [ ] Quotation accepted in writing
- [ ] Scope of Work v2.0 signed by both parties
- [ ] Initial payment received
- [ ] Source code release decision made and written into the contract
- [ ] Change procedure agreed and understood by the client

### Open questions closed (PRD §13)
- [ ] Q1 — Internet quality and outage duration confirmed at **both** outlets
- [ ] Q2 — Per-outlet pricing confirmed: shared, or overrides used routinely
- [ ] Q3 — Discount ceilings per role and floor price policy agreed
- [ ] Q4 — Mobile money: merchant account with statement, or personal number
- [ ] Q5 — Staff list per outlet with roles
- [ ] Q6 — Cash variance threshold requiring written explanation
- [ ] Q7 — Confirmation that VAT stays out of Stage 1

### Client inputs
- [ ] Business and outlet details: names, addresses, phones
- [ ] Logo supplied in usable resolution
- [ ] Receipt footer and returns policy wording
- [ ] Product data template issued to client
- [ ] Named client-side owner for product data confirmed
- [ ] Hardware specification issued
- [ ] Client confirmed hardware purchase plan and dates

### Technical decisions
- [ ] Stack chosen and written down
- [ ] Hosting provider and region selected
- [ ] Database engine confirmed, with money as integer minor units (BR-11)
- [ ] Print service approach confirmed and prototyped against a real thermal printer
- [ ] Barcode scanner tested for keystroke timing behaviour (FR-POS-04)

---

## Phase 1 — Foundations

### Project setup
- [ ] Repository created with branch strategy
- [ ] Environments: local, staging, production
- [ ] CI running lint, typecheck and tests on every push
- [ ] Error tracking wired up
- [ ] Environment secrets managed outside the repo
- [ ] Database migration tooling in place
- [ ] Seed script for demo data

### Data model (PRD §7)
- [ ] `outlet`, `terminal`
- [ ] `user`, `role`, `permission`, `role_permission`, `user_role`, `user_permission`, `user_outlet`
- [ ] `category`, `brand`, `supplier`
- [ ] `product`, `unit`, `product_unit`, `product_barcode`
- [ ] `product_outlet_price`, `price_history`
- [ ] `stock_level` keyed on (product, outlet) — **BR-1**
- [ ] `inventory_movement` insert-only — **BR-2**
- [ ] `sale`, `sale_item`, `payment`, `sale_void`, `held_sale`
- [ ] `customer`, `customer_type`
- [ ] `goods_receipt`, `goods_receipt_item`
- [ ] `shift`, `cash_movement`
- [ ] `audit_log`
- [ ] All unique constraints applied (PRD §7.5)
- [ ] Partial unique indexes: one open shift per user, one per terminal
- [ ] Search index on product name, SKU, description (FR-PROD-06)

### Auth and permissions
- [ ] Sign in with password (FR-AUTH-01) — `A-01`
- [ ] PIN set and verify (FR-AUTH-02)
- [ ] Outlet selection after sign-in (FR-AUTH-03) — `A-03`
- [ ] Screen lock and PIN unlock (FR-AUTH-04) — `A-07`
- [ ] Session expiry, POS locks rather than signs out (FR-AUTH-05)
- [ ] Rate limiting on sign-in (FR-AUTH-06, NFR-10)
- [ ] Password reset flow — `A-04` `A-05` `A-06`
- [ ] **Server-side permission check on every endpoint** (NFR-9)
- [ ] Permission-absent rendering, not disabled (FR-USER-06, `L-09`)

### Design system and shell

Specified and rendered at working size in `reference.html` (the Counter Datasheet, sections 01–11).
Tokens live in `src/styles/tokens.css` and `src/theme/`; the component CSS is still inside the
datasheet and has not yet been extracted into `src/styles/components.css` for the app build.

- [x] Accent as CSS custom property, zero hard-coded accent hex (NFR-15) — enforced by `scripts/blue-audit.mjs`
- [x] Colour tokens including fixed semantic colours — datasheet §02
- [x] Nunito loaded, tabular figures for money — datasheet §03
- [x] Buttons: primary, secondary dark, ghost, danger, icon, bordered square — datasheet §04
- [x] Inputs: text, number, currency, quantity with unit, select, searchable select, date range — datasheet §05
- [x] Data table with checkbox, thumbnail, badge, row actions, pagination — datasheet §06
- [x] Stat tile (filled) and stat card (white) with trend badge — datasheet §06
- [x] Modal, drawer, toast, inline strip — datasheet §07
- [x] Skeleton loaders and empty state pattern — datasheet §08
- [x] App shell: sidebar with grouped sections, header with outlet switcher (`L-10`) — datasheet §10
- [x] Page header with title and action cluster — datasheet §10
- [x] **No blue anywhere** — audited against focus rings, links, checkboxes, tabs, charts — audit clean
- [ ] Component CSS extracted from the datasheet into the app's own stylesheet

---

## Phase 2 — Catalogue and units

### Products
- [ ] Product CRUD (FR-PROD-01) — `D-03` `D-04`
- [ ] SKU auto-generation with manual override (FR-PROD-02)
- [ ] Multiple barcodes per product (FR-PROD-03) — `D-06`
- [ ] Barcode attached to a non-base unit (FR-PROD-04)
- [ ] Categories management (FR-PROD-05) — `D-09`
- [ ] Brands management — `D-10`
- [ ] Deactivate not delete (FR-PROD-08, BR-17) — `D-19`
- [ ] Product list with filters (`D-01`)
- [ ] Product detail drawer showing stock at **both** outlets (`D-02`)
- [ ] Empty and no-results states (`D-17` `D-18`)

### Search
- [ ] Partial, out-of-order term matching (FR-PROD-06)
- [ ] "2.5 twin earth" finds "Twin & Earth Cable 2.5mm"
- [ ] Results show stock at the **active outlet** (FR-PROD-07)
- [ ] Under 300ms at 3,000 products (NFR-1)

### Units and conversions
- [ ] Base unit per product (FR-UOM-01)
- [ ] Selling units with conversion factors (FR-UOM-02) — `D-05`
- [ ] Unit selection converts quantity and price (FR-UOM-03)
- [ ] Per-unit price override, so a drum differs from cut metres (FR-UOM-04)
- [ ] Purchase unit converts on receipt (FR-UOM-05)
- [ ] Fractional quantities to 3dp (FR-UOM-06, BR-12)
- [ ] Conversion factor locked once transactions exist (FR-UOM-07)

### Pricing
- [ ] Cost, retail, trade, floor price (FR-PRICE-01, 02) — `D-07`
- [ ] Per-outlet price override (FR-PRICE-03)
- [ ] Customer type drives price level (FR-PRICE-04)
- [ ] Customer-specific discount or agreed price (FR-PRICE-05)
- [ ] Price history recorded (FR-PRICE-06) — `D-08`
- [ ] Cost hidden without `price.view_cost` (FR-PRICE-07)
- [ ] Accounting margin and replacement margin both shown (FR-PRICE-08)

### Import
- [ ] Upload with template download (`D-12`)
- [ ] Column mapping (`D-13`)
- [ ] Validation with downloadable error file (`D-14`)
- [ ] Preview before commit (`D-15`)
- [ ] Result summary (`D-16`)

---

## Phase 3 — Inventory

- [ ] Stock held per product per outlet (FR-INV-01, BR-1)
- [ ] All movement types implemented (FR-INV-02)
- [ ] Movement records outlet, reason, user, source document (FR-INV-03)
- [ ] Movement history filterable (FR-INV-04) — `E-03`
- [ ] Stock on hand list per outlet (`E-01`)
- [ ] Stock detail with running balance (`E-02`)
- [ ] Adjustment with **mandatory reason** (FR-INV-05) — `E-07`
- [ ] Adjustment approval above threshold (FR-INV-06) — `E-08`
- [ ] Damage and write-off with cost impact (`E-09`)
- [ ] Weighted average cost recalculated on receipt (FR-INV-07, BR-4)
- [ ] Cost frozen on sale line (BR-5)
- [ ] Low stock flag per outlet (FR-INV-08) — `E-10`
- [ ] Inventory valuation per outlet and combined (FR-INV-09) — `E-11`
- [ ] Exceptions view (FR-INV-10) — `E-12`
- [ ] Negative stock blocked by default (BR-9)
- [ ] Oversell permitted with `stock.oversell`, movement flagged
- [ ] Stock decrement inside transaction with row lock (BR-8)
- [ ] Empty movement state (`E-13`)
- [ ] **Nightly reconciliation job**: stock level equals sum of movements (NFR-17)
- [ ] Reconciliation drift alerts to the developer

---

## Phase 4 — POS, payments, receipts

### POS shell and cart
- [ ] Full-screen POS outside the app shell (FR-POS-01) — `C-01`
- [ ] Shift required before selling (FR-POS-02) — `C-30`
- [ ] Product tile grid with price per unit and stock at this outlet
- [ ] Category chips
- [ ] Cart panel: lines, customer, discount, subtotal, large total
- [ ] Empty cart state (`C-24`)
- [ ] Line editor: quantity, unit, price, discount, remove (FR-POS-09) — `C-05`
- [ ] Hold sale with label (FR-POS-14) — `C-23`
- [ ] Held sales list and resume (`C-22`)
- [ ] Held sales do **not** reserve stock (FR-POS-15)

### Scanning
- [ ] **Global keystroke capture** — no click into search required (FR-POS-03)
- [ ] Scanner distinguished from typing by timing plus Enter (FR-POS-04)
- [ ] Repeat scan increments the existing line and flashes it (FR-POS-05)
- [ ] Rapid consecutive scans all applied, none dropped (FR-POS-06)
- [ ] Unknown barcode as inline strip, not a modal (FR-POS-07) — `C-19`
- [ ] Assign barcode to product from the POS (`C-20`)
- [ ] Multi-unit product prompts for unit (FR-POS-08) — `C-04`
- [ ] Line render under 100ms (NFR-1)

### Discounts and approval
- [ ] Line and cart discount, percent or amount (FR-POS-10) — `C-06`
- [ ] Capped by `sale.discount_max`
- [ ] Below-floor triggers inline PIN approval (FR-POS-11, BR-10) — `C-07`
- [ ] Approver identity stored on the sale
- [ ] Approval refused state (`C-08`)

### Customers at the counter
- [ ] Attach by phone search (FR-POS-12) — `C-09`
- [ ] Quick create with name and phone only (`C-10`)
- [ ] Walk-in requires nothing (FR-CUST-01)

### Payments
- [ ] Method selection (FR-PAY-01) — `C-11`
- [ ] Cash with tendered, change, denomination shortcuts (FR-PAY-02) — `C-12`
- [ ] Mobile money with reference and explicit confirmation (FR-PAY-03) — `C-13`
- [ ] Card and transfer with reference (`C-14`)
- [ ] Split payment with live remaining balance (FR-PAY-04) — `C-15`
- [ ] Cannot complete until payments equal total (FR-PAY-05)
- [ ] Overpayment only for cash (FR-PAY-06)
- [ ] **Payment UUID idempotency** (FR-PAY-07, BR-7)
- [ ] Payment modal is the only one that blocks scanning (FR-PAY-08)

### Completion and receipts
- [ ] **Sale committed before print attempted** (FR-RCPT-01)
- [ ] Sale complete screen with large change due (`C-16`)
- [ ] Receipt numbering per outlet from pre-allocated block (BR-6)
- [ ] ESC/POS printing via local service, no browser dialogue (FR-RCPT-02)
- [ ] 58mm and 80mm layouts (FR-RCPT-03)
- [ ] All receipt content present (FR-RCPT-04, PRD §9)
- [ ] **Print failure never blocks or reverses the sale** (FR-RCPT-05) — `C-18`
- [ ] Reprint marked REPRINT and logged (FR-RCPT-06)
- [ ] Skip printing option (FR-RCPT-07)
- [ ] Receipt preview (`C-17`)
- [ ] Print begins within 1s (NFR-3)

### History and voids
- [ ] Transaction lookup with filters (FR-POS-18) — `C-25`
- [ ] Sale detail drawer (`C-26`)
- [ ] Void with reason and approval (FR-POS-19, BR-3) — `C-27`
- [ ] Void writes reversing movements, original preserved
- [ ] Void appears on the void report

### Keyboard and touch
- [ ] Shortcuts F2, F3, F4, F9, Esc, arrows, Enter (FR-POS-16)
- [ ] **Full sale completable with no mouse** (NFR-12)
- [ ] Touch targets ≥44px (FR-POS-17, NFR-14)

---

## Phase 5 — Shifts and cash

- [ ] Open shift with declared float (FR-CASH-01) — `C-29`
- [ ] One open shift per user and per terminal (FR-CASH-02, BR-13)
- [ ] Cash movements with reason (FR-CASH-03) — `H-04`
- [ ] **Blind count** — expected cash hidden until submit (FR-CASH-04) — `C-31`
- [ ] Variance calculated per BR-14 and recorded against the user
- [ ] Variance note required beyond threshold (FR-CASH-06) — `H-06`
- [ ] Non-cash takings listed at close (FR-CASH-07)
- [ ] Close result screen (`C-32`)
- [ ] Shift cannot be reopened (FR-CASH-09)
- [ ] Shift list with variance colour (`H-01`)
- [ ] Shift detail (`H-02`)
- [ ] End-of-day per outlet and combined (FR-CASH-08) — `H-03`
- [ ] Cash movement list (`H-05`)
- [ ] Open shifts panel on dashboard (`H-07`)
- [ ] Empty state (`H-08`)

---

## Phase 6 — Suppliers and customers

### Suppliers
- [ ] Supplier CRUD (FR-SUP-01) — `F-01` `F-03` `F-04`
- [ ] Supplier detail drawer (`F-02`)
- [ ] Receive stock into a chosen outlet (FR-SUP-02) — `E-04`
- [ ] Receipt lines with purchase unit and unit cost (FR-SUP-03)
- [ ] Confirm screen showing resulting stock and new average cost (FR-SUP-05) — `E-05`
- [ ] Confirming writes movements and recalculates cost (FR-SUP-04)
- [ ] Posted receipt is immutable (FR-SUP-06)
- [ ] Receipt detail view (`F-06`)
- [ ] Purchase history per supplier and product (FR-SUP-07) — `F-05`
- [ ] Empty state (`F-07`)

### Customers
- [ ] Customer CRUD (FR-CUST-02) — `G-01` `G-03` `G-04`
- [ ] Phone unique and primary lookup (FR-CUST-03)
- [ ] Customer types mapped to price levels (FR-CUST-04) — `G-06`
- [ ] Shared across both outlets (FR-CUST-05)
- [ ] Purchase history across outlets (FR-CUST-06) — `G-05`
- [ ] Detail drawer (`G-02`)
- [ ] Empty state (`G-07`)

---

## Phase 7 — Reports and dashboard

### Dashboards
- [ ] Owner dashboard, both outlets separate and combined (FR-RPT-01) — `B-01`
- [ ] Manager dashboard, single outlet (`B-02`)
- [ ] Cashier landing with no profit or stock value (`B-03`)
- [ ] Loading skeleton (`B-04`)
- [ ] First-run empty state (`B-05`)
- [ ] Low stock alert strip (`B-06`)

### Reports
- [ ] Report index with profit reports hidden without permission (`I-01`)
- [ ] Sales summary with outlet comparison (`I-02`)
- [ ] Sales by product (`I-03`)
- [ ] Sales by category (`I-04`)
- [ ] Sales by cashier (`I-05`)
- [ ] Sales by customer (`I-06`)
- [ ] Gross profit and COGS from frozen costs (FR-RPT-06) — `I-07`
- [ ] Best sellers (`I-08`)
- [ ] Slow movers (`I-09`)
- [ ] Stock on hand report (`I-10`)
- [ ] Stock movement report (`I-11`)
- [ ] Payment method breakdown (`I-12`)
- [ ] Discount and override log (`I-13`)
- [ ] Void and refund log (`I-14`)
- [ ] Purchases report (`I-15`)
- [ ] **Outlet comparison report — NEW** (FR-RPT-08) — `I-19`
  - [ ] Side-by-side: sales, gross margin, transactions, average sale
  - [ ] Discount rate and void rate per outlet
  - [ ] Cash variance per outlet
  - [ ] Stock value and low-stock count per outlet
  - [ ] Period selector with previous-period comparison
- [ ] Filter panel: outlet, date range, category, user, method (FR-RPT-03) — `I-16`
- [ ] Profit visible only with `report.view_profit` (FR-RPT-05)
- [ ] Empty and loading states (`I-17` `I-18`)

---

## Phase 8 — Settings and appearance

- [ ] Settings index (`K-01`)
- [ ] Business profile with logo upload (FR-SET-01) — `K-02`
- [ ] Outlet list (`K-03`)
- [ ] Per-outlet settings including receipt prefix and footer (FR-SET-02) — `K-04`
- [ ] Receipt designer with 58mm and 80mm live preview (FR-RCPT-09) — `K-05`
- [ ] **Appearance: accent picker** (FR-SET-03) — `K-06`
  - [ ] Seven preset swatches, none blue
  - [ ] Hex input with validation
  - [ ] Live preview: button, nav item, selected row, tab, stat tile
  - [ ] Reset to orange
  - [ ] Restricted to `settings.appearance`
  - [ ] Semantic colours unaffected (FR-SET-04)
  - [ ] Change applies across the whole app without reload
- [ ] Terminal settings: printer, width, auto-print (FR-SET-05) — `K-07`
- [ ] **Test print button working against a real printer** (FR-RCPT-08)
- [ ] Receipt number block status visible
- [ ] Operational thresholds (FR-SET-06) — `K-08`
- [ ] Backup status and restore history (FR-SET-07) — `K-09`
- [ ] Data export (FR-SET-08) — `K-10`
- [ ] Save confirmation toast (`K-11`)

---

## Phase 9 — Resilience and sync

- [ ] Product catalogue cached locally (FR-SYNC-01)
- [ ] Search and scan work at full speed offline
- [ ] Sales recorded and queued during dropout (FR-SYNC-02)
- [ ] Queued sales keep pre-allocated receipt numbers (FR-SYNC-03, BR-6)
- [ ] Offline banner with queued count, non-blocking (FR-SYNC-04) — `C-33`
- [ ] Queue submitted in order on reconnect, idempotently (FR-SYNC-05)
- [ ] Sync recovered toast (`C-34`)
- [ ] Offline stock conflicts surfaced on exceptions report (FR-SYNC-06)
- [ ] **Abrupt power loss loses no committed sale** (FR-SYNC-07, NFR-5)
- [ ] Tolerates 15-minute dropout without interrupting trade (NFR-4)
- [ ] Network error state with retry (`L-04`)
- [ ] Sale UUID idempotency verified end to end (BR-7)

---

## Phase 10 — Security and audit

- [ ] Passwords hashed with bcrypt or argon2 (NFR-8)
- [ ] PINs hashed separately
- [ ] TLS enforced on all traffic
- [ ] Authorisation enforced server-side on every endpoint (NFR-9)
- [ ] Rate limiting on auth and approval endpoints (NFR-10)
- [ ] Audit entries capture actor, action, before/after, outlet, terminal, IP (FR-AUDIT-01)
- [ ] All listed actions logged (FR-AUDIT-02)
- [ ] **Audit log append-only, no edit or delete path even for Owner** (FR-AUDIT-03, BR-15)
- [ ] Audit log filterable (FR-AUDIT-04) — `J-08`
- [ ] Audit entry detail (`J-09`)
- [ ] Users cannot change their own permissions (FR-USER-05, BR-16)
- [ ] User CRUD with outlet assignment (`J-01` `J-03` `J-04`)
- [ ] Permission matrix (`J-06`)
- [ ] Per-user overrides (`J-07`)
- [ ] Permission denied page (`J-10`)
- [ ] Deactivate user, sessions ended (`J-11`)
- [ ] Penetration sanity check: can a cashier reach a profit endpoint directly by URL or API call

---

## Phase 11 — Testing

### Unit
- [ ] Weighted average cost calculation (BR-4) across edge cases including zero stock
- [ ] Unit conversion both directions, including fractions
- [ ] Money rounding, half-up, per line then summed (BR-11)
- [ ] Expected cash calculation (BR-14)
- [ ] Discount and floor price validation (BR-10)
- [ ] Permission resolution: role plus user override
- [ ] Receipt number generation from a block

### Integration
- [ ] Sale writes sale, items, payments, movements atomically
- [ ] Failed payment writes nothing
- [ ] Goods receipt updates stock and average cost correctly
- [ ] Void writes reversing movements and restores stock
- [ ] Shift close computes variance correctly
- [ ] Adjustment above threshold requires approval
- [ ] Movement sum equals stock level after a long random sequence

### Concurrency
- [ ] **Two terminals sell the last unit → one succeeds, one refused** (BR-8)
- [ ] Same sale UUID submitted twice → one sale (BR-7)
- [ ] Same payment submitted twice → one payment
- [ ] Simultaneous receipt and sale on the same product → correct final quantity and cost
- [ ] Two users opening a shift on the same terminal → one succeeds

### End to end
- [ ] Scan five items, split payment, print, verify stock at selling outlet only
- [ ] Sale with printer off → completes, prints on retry
- [ ] Below-floor sale blocked, then approved by manager PIN
- [ ] Void a sale, verify both records and the void report
- [ ] Receive stock, verify new average cost, sell, verify frozen cost in profit report
- [ ] Cashier account: no cost, no profit, no reports anywhere
- [ ] Disconnect mid-sale, reconnect, verify exactly one sale at the server
- [ ] Change accent colour, verify every accent surface updates
- [ ] Full day simulated at both outlets, reconcile end-of-day figures

### Non-functional
- [ ] Search under 300ms at 3,000 products (NFR-1)
- [ ] Sale completion under 1s (NFR-2)
- [ ] Print starts within 1s (NFR-3)
- [ ] Backup restore performed successfully into a clean environment (NFR-6)
- [ ] Contrast check 4.5:1 on all text (NFR-14)
- [ ] Full keyboard reachability
- [ ] **Blue audit: no blue pixel anywhere in the interface**

### Release gate — PRD §11
- [ ] All twelve acceptance criteria pass at both outlets

---

## Phase 12 — Data migration

- [ ] Template issued to client (week 1)
- [ ] Client data received (target week 10)
- [ ] Duplicate products identified and merged
- [ ] Missing costs and prices flagged back to client
- [ ] Categories and brands normalised
- [ ] Units and conversion factors set per product
- [ ] Barcodes validated for uniqueness
- [ ] Products without barcodes identified for labelling
- [ ] Reorder levels set
- [ ] Opening stock quantities per outlet supplied
- [ ] Opening stock loaded as `OPENING` movements, not direct writes
- [ ] Opening valuation reviewed and signed off by client
- [ ] Customers imported with unique phone numbers
- [ ] Suppliers imported
- [ ] Users created with roles and outlet assignments
- [ ] Spot check: 20 random products verified against the shelf
- [ ] Client sign-off that data is correct before go-live

---

## Phase 13 — Deployment and operations

- [ ] Production environment provisioned
- [ ] Domain and TLS certificate
- [ ] Database with automated daily backup, 30-day retention (NFR-6)
- [ ] **Restore tested into a clean environment** — not assumed
- [ ] RPO 15 minutes and RTO 4 hours verified (NFR-7)
- [ ] Monitoring and uptime alerting
- [ ] Error tracking in production
- [ ] Log retention configured
- [ ] Print service packaged as an installer
- [ ] Print service auto-starts on boot
- [ ] Print service tested on the client's actual printer model
- [ ] Browser kiosk or shortcut configured for the POS
- [ ] Deployment runbook written
- [ ] Rollback procedure written and tested
- [ ] Support contact and escalation path documented

---

## Phase 14 — Outlet 1 go-live (Inco Hardware)

### Pre-visit
- [ ] Hardware purchased and delivered to the shop
- [ ] UPS present at the counter — **not optional**
- [ ] Internet confirmed working
- [ ] Product data loaded and verified
- [ ] User accounts created for this outlet's staff
- [ ] Receipt layout configured with this outlet's details

### On site
- [ ] PC set up and positioned at the counter
- [ ] Printer connected and test print successful
- [ ] Scanner connected and tested with real products
- [ ] UPS tested by pulling mains power mid-transaction
- [ ] Opening stock counted and entered
- [ ] Barcode labels applied to unlabelled stock
- [ ] Test sale completed and voided
- [ ] Shift opened, test sales, shift closed and reconciled

### Training (per quotation §3)
- [ ] Cashier session delivered — half day
- [ ] Storekeeper session delivered — 2 hours
- [ ] Manager and Owner session delivered — half day
- [ ] User guide handed over
- [ ] Quick reference cards printed and placed at the counter
- [ ] Screen recordings shared

### Go-live day
- [ ] Full day on site during real trading
- [ ] First real sale completed successfully
- [ ] End of day reconciled with staff present
- [ ] Issues logged and triaged
- [ ] Client sign-off for Outlet 1

---

## Phase 15 — Outlet 2 go-live ([Electrical shop])

- [ ] Four-week settling period at Outlet 1 completed
- [ ] Issues from Outlet 1 fixed before touching Outlet 2
- [ ] Hardware purchased and delivered
- [ ] UPS present
- [ ] Internet confirmed working
- [ ] Outlet configured with its own name, address and receipt prefix
- [ ] Product data and opening stock for this outlet loaded
- [ ] User accounts created for this outlet's staff
- [ ] PC, printer and scanner set up and tested
- [ ] Test sale completed and voided
- [ ] Cashier session delivered
- [ ] Storekeeper session delivered
- [ ] Manager session delivered
- [ ] Full day on site during real trading
- [ ] End of day reconciled
- [ ] **Owner dashboard verified showing both outlets separately and combined**
- [ ] Outlet comparison report verified with real data from both shops
- [ ] Client sign-off for Outlet 2

---

## Phase 16 — Warranty and handover

- [ ] 30-day warranty started at each outlet, dates recorded
- [ ] Follow-up training session at Outlet 1 (~2 weeks after go-live)
- [ ] Follow-up training session at Outlet 2
- [ ] One staff member shown how to train new starters
- [ ] Backup verified running in production
- [ ] Restore tested once more with live data
- [ ] Documentation handed over: user guide, setup notes, runbook
- [ ] Source code handed over, if contracted
- [ ] Data export demonstrated to the client
- [ ] Monthly support arrangement agreed and started
- [ ] Final invoice issued at end of warranty
- [ ] Stage 2 scope discussed and quoted
- [ ] Post-project review with the client
- [ ] Lessons logged for the next build

---

## Milestone and payment tracker

| # | Milestone | Target | Actual | Client approved | Invoice | Paid |
|---|---|---|---|---|---|---|
| — | Contract signed | | | | 25% | |
| M1 | Design approval | Wk 2 | | | 10% | |
| M2 | Catalogue, stock, users | Wk 6 | | | — | |
| M3 | POS working | Wk 10 | | | 20% | |
| M4 | Cash, suppliers, reports | Wk 13 | | | — | |
| M5 | Outlet 1 live | Wk 15 | | | 25% | |
| M6 | Outlet 2 live | Wk 19 | | | 10% | |
| — | Warranty ends | Wk 23 | | | 10% | |

---

## Live risk register

| Risk | Status | Owner | Mitigation | Review |
|---|---|---|---|---|
| Product data not ready by week 10 | | Client | Template issued wk 1, weekly check-in from wk 6 | |
| Connectivity poor at Outlet 2 | | Client | Confirm before signing; full offline quotable separately | |
| Hardware not purchased in time | | Client | Spec issued wk 1; deadline wk 12 | |
| Effort exceeds calendar (113 days vs 19 weeks) | | Developer | Re-baseline timeline or cut from SOW §9 | |
| Client subject to E-VAT mid-project | | Client | Tax layer kept separate; integration is a change | |
| Scope creep from Stage 2 list | | Developer | Written change procedure, no verbal agreements | |
| Staff resist individual logins | | Client | Owner briefed that accountability is the point | |

---

## Weekly review — five questions

1. Which checklist items moved this week, and which slipped?
2. Is anything marked `[!]` blocked, and who is it blocked on?
3. Is the client on track for product data and hardware?
4. Has any accent-colour hard-coding or blue crept into the UI?
5. Does the milestone tracker still match reality, or does the client need telling now rather than later?
