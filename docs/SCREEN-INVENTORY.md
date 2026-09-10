# Screen Inventory
## POS & Inventory Management System — Two Outlets

Companion to PRD v1.0. Every screen carries an ID, route, purpose, permission and its exits. Stage 1 screens are marked **S1** and are in the contracted build; **S2** and **S3** are listed so the navigation and components accommodate them without redesign.

**Total: 118 screens and states — 94 in Stage 1.**

---

## Legend

| Column | Meaning |
|---|---|
| Type | `page` full route · `drawer` right panel over a list · `modal` blocking dialogue · `state` a condition of another screen · `inline` a strip or panel within a screen |
| Perm | Permission required to reach it |
| Exits | Where the primary actions lead |

---

## A. Authentication and session

| ID | Screen | Route | Type | Purpose | Key elements | Exits |
|---|---|---|---|---|---|---|
| A-01 | Sign in | `/login` | page | Authenticate | Logo, username, password, show/hide, remember, sign-in button, forgot link | → A-03 or B-01 |
| A-02 | Sign-in error | — | state | Wrong credentials or locked account | Inline error above the form, attempts remaining | stays |
| A-03 | Outlet select | `/select-outlet` | page | Choose working outlet | Two large outlet cards with name, town, open-shift indicator | → B-01 |
| A-04 | Forgot password | `/forgot-password` | page | Request reset | Email field, submit | → A-05 |
| A-05 | Reset link sent | `/forgot-password/sent` | state | Confirmation | Message, resend, back to sign in | → A-01 |
| A-06 | Set new password | `/reset-password/:token` | page | Set password | New password, confirm, strength meter | → A-01 |
| A-07 | Screen lock | `/lock` | page | Lock without ending shift | Avatar, name, PIN keypad, switch user | → previous screen |
| A-08 | Session expired | — | modal | Idle timeout | Message, sign in again | → A-01 |
| A-09 | Account disabled | — | state | Deactivated user | Plain message, contact administrator | → A-01 |
| A-10 | Not found | `/404` | page | Bad route | Message, back to dashboard | → B-01 |
| A-11 | Server error | `/500` | page | Unrecoverable error | Message, retry, reference code | → retry |

---

## B. Dashboard

| ID | Screen | Route | Type | Perm | Purpose | Key elements |
|---|---|---|---|---|---|---|
| B-01 | Owner dashboard | `/` | page | `outlet.view_all` | Whole business at a glance | Outlet toggle (Inco / Electrical / Both); four filled stat tiles — today's sales, estimated profit, expected cash, stock value; four white cards — transactions, average sale, low stock count, open shifts; sales chart by outlet; low stock list; recent sales; top sellers |
| B-02 | Manager dashboard | `/` | page | `report.view` | One outlet, operational | Today's sales, profit, expected cash, low stock; open shifts; pending approvals; recent sales |
| B-03 | Cashier landing | `/` | page | `pos.sell` | Get to work | Large "Open shift" or "Continue selling" card, own sales today, own shift status. No profit, no stock value |
| B-04 | Dashboard loading | — | state | — | Skeleton | Grey tile and chart placeholders |
| B-05 | First-run empty | — | state | — | No data yet | "No sales recorded yet" with links to import products and open a shift |
| B-06 | Low stock alert strip | — | inline | — | Attention | Dismissible amber strip above the tiles with a count and a link to F-06 |

---

## C. Point of sale

Runs full width with no sidebar. Exit control top left.

| ID | Screen | Route | Type | Perm | Purpose | Notes |
|---|---|---|---|---|---|---|
| C-01 | POS main | `/pos` | page | `pos.sell` | Sell | Left: search bar, category chips, product tile grid with name, price per unit, stock at this outlet. Right: 380px cart panel, customer row, discount row, subtotal, large total, TAKE PAYMENT, Hold, Clear. Header: outlet, cashier, shift time, held count |
| C-02 | Search results | — | inline | `pos.sell` | Find product | Dropdown under the search field: name, SKU, unit, price, stock. Arrow-key navigable, Enter adds |
| C-03 | No results | — | state | — | Nothing matched | "No product matches" with a create-product link for permitted users |
| C-04 | Unit picker | — | modal | `pos.sell` | Choose selling unit | Unit buttons with conversion and price each — Metre 18.50 · Drum 1,750.00 |
| C-05 | Line editor | — | inline | `pos.sell` | Adjust a line | Expands the cart line: quantity stepper and numeric entry, unit switch, price field, line discount, remove |
| C-06 | Discount entry | — | modal | `sale.discount` | Apply discount | Percent or amount toggle, value, permitted maximum shown, resulting total |
| C-07 | Below-floor approval | — | modal | `pos.sell` | Get authorisation | States product, requested price, floor price. Manager PIN keypad. Approver name recorded |
| C-08 | Approval refused | — | state | — | Wrong PIN or insufficient rights | Inline error, retry, cancel |
| C-09 | Attach customer | — | modal | `pos.sell` | Identify customer | Phone-number search, results with name and type, "Walk-in" clear option, create-inline form |
| C-10 | Quick create customer | — | modal | `customer.manage` | New customer at counter | Name, phone, type. Two fields minimum |
| C-11 | Payment method | — | modal | `pos.sell` | Choose how to pay | Amount due large. Four method tiles: Cash, Mobile Money, Card, Transfer. Split payment link |
| C-12 | Cash payment | — | modal | `pos.sell` | Take cash | Amount due, tendered field, denomination shortcut buttons, change calculated large |
| C-13 | Mobile money payment | — | modal | `pos.sell` | Take MoMo | Amount, reference field, network selector, explicit "Payment received" confirm |
| C-14 | Card / transfer payment | — | modal | `pos.sell` | Take card or transfer | Amount, reference, confirm received |
| C-15 | Split payment | — | modal | `pos.sell` | Multiple methods | Added payment rows, running remaining balance, add-method button, disabled complete until zero |
| C-16 | Sale complete | — | modal | `pos.sell` | Confirm and hand over | Change due very large, receipt number, printing status, New Sale, Reprint, Email/skip |
| C-17 | Receipt preview | — | modal | `sale.reprint` | See the receipt | Rendered 58/80mm receipt, print, close |
| C-18 | Print failed | — | inline | — | Printer problem | Amber strip on C-16: "Sale saved. Receipt did not print." Retry, Continue without printing. Never blocks |
| C-19 | Unknown barcode | — | inline | `pos.sell` | Scanned code not found | Strip: barcode shown, Search manually, Assign to a product |
| C-20 | Assign barcode | — | modal | `product.edit` | Attach code to product | Product search, unit selector, save |
| C-21 | Out of stock | — | inline | `pos.sell` | Insufficient stock | Strip: available quantity, Reduce quantity, Sell anyway (only with `stock.oversell`) |
| C-22 | Held sales | — | drawer | `pos.sell` | Resume a parked sale | List with label, item count, total, time held. Resume, Delete |
| C-23 | Hold sale | — | modal | `pos.sell` | Park current cart | Optional label, confirm |
| C-24 | Empty cart | — | state | — | Nothing scanned yet | Cart panel shows "Scan or search to begin", shortcut hints |
| C-25 | Transaction lookup | `/pos/transactions` | page | `sale.view_all` | Find past sale | Filters: date, receipt number, customer, amount, cashier. Dense table |
| C-26 | Sale detail | — | drawer | `sale.view_all` | Inspect a sale | Header, lines with unit and price, payments, cashier, terminal, approver, void history. Reprint, Void |
| C-27 | Void sale | — | modal | `sale.void` | Reverse a sale | Reason select, note, warning that the record is preserved, manager PIN, confirm |
| C-28 | Void complete | — | state | — | Confirmation | Original marked voided, reversal reference shown |
| C-29 | Open shift | `/pos/shift/open` | page | `shift.open` | Start trading | Opening float entry with denomination breakdown, terminal name, start button |
| C-30 | No open shift | — | state | — | Blocked from selling | POS shows "Open a shift to begin selling" with the button |
| C-31 | Close shift — count | `/pos/shift/close` | page | `shift.close` | Blind count | Denomination grid, counted total, non-cash takings listed for reference, submit. Expected cash hidden |
| C-32 | Close shift — result | — | state | `shift.close` | Variance revealed | Expected, counted, variance highlighted; note required beyond threshold; confirm |
| C-33 | Offline banner | — | inline | — | Connection lost | Persistent amber bar: "Offline — sales are being saved. 3 queued." Non-blocking |
| C-34 | Sync recovered | — | state | — | Back online | Toast: "Back online. 3 sales sent." |
| C-35 | Return / refund | `/pos/return` | page | `sale.refund` | S2 — refund against receipt | Receipt lookup, select lines, quantities, refund method, approval |
| C-36 | Credit note | — | modal | `sale.refund` | S2 — issue credit instead of cash | Amount, customer, print |

---

## D. Products

| ID | Screen | Route | Type | Perm | Purpose | Key elements |
|---|---|---|---|---|---|---|
| D-01 | Product list | `/products` | page | `stock.view` | Browse catalogue | Page header with Add Product and Import. Search, category and brand filters, stock-status filter. Table: checkbox, thumbnail + name, SKU, category, brand, unit, price, stock at outlet, three row-action icon buttons |
| D-02 | Product detail | — | drawer | `stock.view` | Inspect one product | Image, name, SKU, barcodes, category, brand, supplier; prices (cost hidden without `price.view_cost`); units and conversions; stock at each outlet; recent movements; Edit |
| D-03 | Add product | `/products/new` | page | `product.create` | Create | Sectioned form: identity, classification, units, pricing, stock settings, image |
| D-04 | Edit product | `/products/:id/edit` | page | `product.edit` | Amend | Same form, prefilled, with change history link |
| D-05 | Units and conversions | — | inline | `product.edit` | Define selling units | Base unit selector, then rows: unit, factor to base, optional price override, purchase-default flag |
| D-06 | Barcodes | — | inline | `product.edit` | Manage codes | Rows of barcode + linked unit, add, remove, scan-to-fill |
| D-07 | Pricing panel | — | inline | `price.edit` | Set prices | Cost, retail, trade, floor. Margin shown live. Per-outlet override toggle revealing two columns |
| D-08 | Price history | — | modal | `price.view_cost` | See changes | Table: date, field, old, new, user |
| D-09 | Categories | `/products/categories` | page | `product.edit` | Manage categories | Simple table, inline add, rename, deactivate, product count |
| D-10 | Brands | `/products/brands` | page | `product.edit` | Manage brands | As above |
| D-11 | Units of measure | `/products/units` | page | `product.edit` | Manage unit names | Name, abbreviation, usage count |
| D-12 | Import — upload | `/products/import` | page | `product.import` | Bring in catalogue | Template download, drop zone, file requirements |
| D-13 | Import — mapping | — | state | `product.import` | Match columns | Source column → system field selects, sample row preview |
| D-14 | Import — validation | — | state | `product.import` | Fix errors | Row-level error table with reasons, download error file, proceed with valid rows only |
| D-15 | Import — preview | — | state | `product.import` | Confirm | Counts to create and update, sample of results, commit |
| D-16 | Import — result | — | state | `product.import` | Outcome | Created, updated, skipped counts; link to the list |
| D-17 | Product list empty | — | state | — | No products yet | "No products yet" with Import and Add Product |
| D-18 | Search no results | — | state | — | Filter too narrow | "No products match" with clear-filters |
| D-19 | Deactivate product | — | modal | `product.edit` | Retire an item | Explains history is retained and it disappears from the POS |
| D-20 | Bulk price update | `/products/bulk-price` | page | `price.edit` | S2 — reprice in bulk | Filter, change type, value, affected-count preview, apply |
| D-21 | Variants | — | inline | `product.edit` | S2 — variant matrix | Attribute rows generating variant combinations |

---

## E. Inventory

| ID | Screen | Route | Type | Perm | Purpose | Key elements |
|---|---|---|---|---|---|---|
| E-01 | Stock on hand | `/inventory` | page | `stock.view` | Current position | Outlet-scoped table: product, category, quantity in base unit, reorder level, status badge, value at cost. Filters and sort by lowest stock |
| E-02 | Stock detail | `/inventory/:productId` | page | `stock.view` | One product at one outlet | Current quantity, average cost, value, reorder level; movement table with running balance |
| E-03 | Movement history | `/inventory/movements` | page | `stock.view` | Audit stock | Filters: product, type, reason, user, date. Table: date, product, type, delta, balance after, reason, user, source link |
| E-04 | Receive stock | `/inventory/receive` | page | `stock.receive` | Take in goods | Supplier select, reference, date; line rows with product search, purchase unit, quantity, unit cost; running total |
| E-05 | Receive confirm | — | modal | `stock.receive` | Check before commit | Per line: quantity in base units, resulting stock, old and new average cost. Confirm |
| E-06 | Receive complete | — | state | — | Done | Reference number, links to stock and to receive again |
| E-07 | Stock adjustment | `/inventory/adjust` | page | `stock.adjust` | Correct a quantity | Product, current quantity, new quantity or delta, **mandatory reason select**, note, value impact shown |
| E-08 | Adjustment approval | — | modal | `stock.approve_adjustment` | Authorise a large change | Details, value impact, approver PIN |
| E-09 | Damage / write-off | `/inventory/write-off` | page | `stock.adjust` | Record loss | Product, quantity, reason (damaged, lost, expired, shop use), note, cost impact |
| E-10 | Low stock | `/inventory/low-stock` | page | `stock.view` | What to reorder | Grouped by supplier: product, current, reorder level, shortfall, suggested quantity |
| E-11 | Valuation | `/inventory/valuation` | page | `report.view_profit` | What stock is worth | By category and outlet, quantity, average cost, total value, combined figure |
| E-12 | Exceptions | `/inventory/exceptions` | page | `report.view` | Things to look at | Oversell events, adjustments above threshold, write-offs, with user and date |
| E-13 | No stock movement | — | state | — | New product | "No movements recorded" with receive-stock link |
| E-14 | Stock count | `/inventory/count` | page | `stock.adjust` | S2 — physical count | Generate sheet, enter counts, variance review, approve, post |
| E-15 | Transfer | `/inventory/transfer` | page | `stock.transfer` | S3 — move between outlets | Despatch, in-transit, receive |

---

## F. Suppliers

| ID | Screen | Route | Type | Perm | Purpose |
|---|---|---|---|---|---|
| F-01 | Supplier list | `/suppliers` | page | `supplier.manage` | Browse suppliers — name, contact, phone, terms, last receipt, total purchased |
| F-02 | Supplier detail | — | drawer | `supplier.manage` | Contact block, products supplied, receipt history, purchase total |
| F-03 | Add supplier | `/suppliers/new` | page | `supplier.manage` | Create record |
| F-04 | Edit supplier | `/suppliers/:id/edit` | page | `supplier.manage` | Amend record |
| F-05 | Receipt history | `/suppliers/:id/receipts` | page | `supplier.manage` | All goods receipts from this supplier |
| F-06 | Goods receipt detail | `/receipts/:id` | page | `stock.receive` | Read-only view of a posted receipt with its movements |
| F-07 | Supplier empty | — | state | — | "No suppliers yet" with add button |
| F-08 | Purchase orders | `/purchase-orders` | page | `supplier.manage` | S2 — raise and track orders |
| F-09 | Supplier balances | `/suppliers/balances` | page | `report.view` | S2 — what is owed and when |

---

## G. Customers

| ID | Screen | Route | Type | Perm | Purpose |
|---|---|---|---|---|---|
| G-01 | Customer list | `/customers` | page | `customer.manage` | Name, phone, type, last purchase, total spent, purchase count. Search by phone |
| G-02 | Customer detail | — | drawer | `customer.manage` | Contact, type, price level, discount, purchase history across both outlets |
| G-03 | Add customer | `/customers/new` | page | `customer.manage` | Create record |
| G-04 | Edit customer | `/customers/:id/edit` | page | `customer.manage` | Amend record |
| G-05 | Purchase history | `/customers/:id/purchases` | page | `sale.view_all` | Sales list with outlet column, links to sale detail |
| G-06 | Customer types | `/customers/types` | page | `settings.general` | Type names mapped to price levels |
| G-07 | Customer empty | — | state | — | "No registered customers" — walk-in sales need none |
| G-08 | Credit account | — | inline | `customer.credit` | S2 — limit, balance, ageing, statement |

---

## H. Cash and shifts

| ID | Screen | Route | Type | Perm | Purpose | Key elements |
|---|---|---|---|---|---|---|
| H-01 | Shift list | `/cash/shifts` | page | `cash.view_variance` | All shifts | Outlet, cashier, opened, closed, sales total, expected, counted, variance with colour, status |
| H-02 | Shift detail | `/cash/shifts/:id` | page | `cash.view_variance` | One shift in full | Summary; sales list; payments by method; cash movements; close-out figures and note |
| H-03 | End of day | `/cash/end-of-day` | page | `cash.view_variance` | Reconcile the day | Per outlet: takings by payment method, expected vs counted cash, variance, shift breakdown, print |
| H-04 | Cash movement | — | modal | `cash.movement` | Money in or out of the drawer | Direction, amount, reason (banking, owner drawing, supplier payment, float transfer), note |
| H-05 | Cash movement list | `/cash/movements` | page | `cash.movement` | All movements | Date, outlet, direction, amount, reason, user, shift link |
| H-06 | Variance explanation | — | modal | `shift.close` | Explain a discrepancy | Variance shown, mandatory note, submit |
| H-07 | Open shifts | — | inline | `report.view` | Who is trading now | Dashboard panel: outlet, cashier, opened at, running sales |
| H-08 | No shifts | — | state | — | Nothing yet | "No shifts recorded" |
| H-09 | Expenses | `/cash/expenses` | page | `cash.movement` | S2 — record shop expenses by category with receipt photo |

---

## I. Reports

| ID | Screen | Route | Perm | Purpose |
|---|---|---|---|---|
| I-01 | Report index | `/reports` | `report.view` | Grouped tiles: Sales, Stock, Cash, Control. Profit reports hidden without `report.view_profit` |
| I-02 | Sales summary | `/reports/sales` | `report.view` | By day, week, month; outlet comparison; chart and table |
| I-03 | Sales by product | `/reports/sales/product` | `report.view` | Quantity, revenue, and margin where permitted |
| I-04 | Sales by category | `/reports/sales/category` | `report.view` | Category share, chart and table |
| I-05 | Sales by cashier | `/reports/sales/cashier` | `report.view` | Transactions, value, average sale, discounts given |
| I-06 | Sales by customer | `/reports/sales/customer` | `report.view` | Top customers across both outlets |
| I-07 | Gross profit | `/reports/profit` | `report.view_profit` | Revenue, COGS at frozen cost, gross profit, margin percent |
| I-08 | Best sellers | `/reports/best-sellers` | `report.view` | By quantity and by value, with period selector |
| I-09 | Slow movers | `/reports/slow-movers` | `report.view` | No sale in N days, with stock value tied up |
| I-10 | Stock on hand report | `/reports/stock` | `report.view` | Point-in-time position per outlet |
| I-11 | Stock movement report | `/reports/movements` | `report.view` | Ins and outs by type and reason over a period |
| I-12 | Payment breakdown | `/reports/payments` | `report.view` | Cash, MoMo, card, transfer by value and count |
| I-13 | Discount and override log | `/reports/discounts` | `report.view` | Every discount and price override: user, approver, product, amount |
| I-14 | Void and refund log | `/reports/voids` | `report.view` | Every voided sale: user, approver, reason, value |
| I-15 | Purchases report | `/reports/purchases` | `report.view` | Goods received by supplier and period |
| I-16 | Filter panel | — | drawer | Outlet, date range with presets, category, user, payment method |
| I-17 | Report empty | — | state | "No data for this period" with a widen-range action |
| I-18 | Report loading | — | state | Skeleton table and chart |

---

## J. Users and audit

| ID | Screen | Route | Type | Perm | Purpose |
|---|---|---|---|---|---|
| J-01 | User list | `/users` | page | `user.manage` | Name, username, role, outlets, last login, status |
| J-02 | User detail | — | drawer | `user.manage` | Profile, roles, outlets, effective permissions, recent activity |
| J-03 | Add user | `/users/new` | page | `user.manage` | Name, username, email, phone, password, PIN, role, outlet assignment |
| J-04 | Edit user | `/users/:id/edit` | page | `user.manage` | Amend, reset password, reset PIN, deactivate |
| J-05 | Roles | `/users/roles` | page | `user.manage` | Role list with user counts |
| J-06 | Permission matrix | `/users/permissions` | page | `user.manage` | Permissions as rows, roles as columns, checkboxes, grouped by module |
| J-07 | User overrides | — | inline | `user.manage` | Per-user grants and revocations against their role baseline |
| J-08 | Audit log | `/audit` | page | `audit.view` | Filters: user, action, entity, outlet, date. Table with before/after expander. Visually marked read-only |
| J-09 | Audit entry | — | modal | `audit.view` | Full before and after values |
| J-10 | Permission denied | `/denied` | page | — | Calm page: what is needed, who to ask, back to dashboard |
| J-11 | Deactivate user | — | modal | `user.manage` | Warns that history is retained and sessions end |

---

## K. Settings

| ID | Screen | Route | Perm | Purpose | Key elements |
|---|---|---|---|---|---|
| K-01 | Settings index | `/settings` | varies | Landing | Grouped cards: Business, Outlets, Receipts, Appearance, Terminal, System |
| K-02 | Business profile | `/settings/business` | `settings.general` | Company identity | Legal name, trading name, logo upload, contact details |
| K-03 | Outlet list | `/settings/outlets` | `settings.general` | Both shops | Name, town, terminals, status, edit |
| K-04 | Outlet settings | `/settings/outlets/:id` | `settings.general` | Per-shop configuration | Name, address, phone, receipt prefix, receipt footer, reorder defaults, logo override |
| K-05 | Receipt designer | `/settings/receipt` | `settings.general` | Shape the receipt | Toggles for each block, footer text, live preview at 58mm and 80mm side by side |
| K-06 | **Appearance** | `/settings/appearance` | `settings.appearance` | Accent colour | Seven preset swatches plus hex input; **live preview panel showing a primary button, active nav item, selected table row, active tab and a stat tile**; reset to orange. No blue in the palette |
| K-07 | Terminal settings | `/settings/terminals` | `settings.terminal` | Counter hardware | Terminal name, printer selection, paper width 58/80mm, auto-print toggle, **test print button**, receipt number block status |
| K-08 | Operational thresholds | `/settings/thresholds` | `settings.general` | Control limits | Idle lock timeout, adjustment approval threshold, cash variance threshold, discount ceilings per role |
| K-09 | Backups | `/settings/backups` | `settings.general` | Data safety | Last successful backup, schedule, retention, restore history, manual backup |
| K-10 | Data export | `/settings/export` | `settings.general` | Get the data out | Select data sets and date range, generate, download |
| K-11 | Settings saved | — | state | — | Confirmation | Toast with undo where reversible |
| K-12 | Tax settings | `/settings/tax` | `settings.general` | S3 — VAT rates, TIN, E-VAT connection |

---

## L. Global states and patterns

| ID | Pattern | Type | Where | Behaviour |
|---|---|---|---|---|
| L-01 | Table loading | state | every list | Skeleton rows matching final column widths |
| L-02 | Form saving | state | every form | Button shows a spinner and disables; fields stay readable |
| L-03 | Empty state | state | every list | One line of fact, one line of instruction, one primary action. No illustration |
| L-04 | Network error | state | any fetch | Inline panel with the reason and a retry |
| L-05 | Offline banner | inline | global | Amber bar with queued count, non-blocking |
| L-06 | Destructive confirm | modal | void, deactivate, write-off | States what happens and what is preserved. Danger button on the right |
| L-07 | Unsaved changes | modal | any form | Stay or discard |
| L-08 | Toast | overlay | global | Bottom right, one line, 4s, undo where real |
| L-09 | Permission absent | pattern | global | Controls without permission are not rendered at all |
| L-10 | Outlet scope indicator | inline | global | Header shows the active outlet on every screen |
| L-11 | Search no results | state | every search | "No match" with clear-filters |
| L-12 | Pagination | pattern | every table | Rows-per-page select and page numbers, active page in accent |
| L-13 | Bulk selection bar | inline | tables with checkboxes | Appears on selection: count and permitted bulk actions |
| L-14 | Approval prompt | modal | discount, void, adjustment | Consistent shape: what is being approved, PIN keypad, approver recorded |

---

## M. Navigation map

```
Sign in ─→ Outlet select ─→ Dashboard
                                │
   ┌────────────────────────────┼─────────────────────────────┐
   │                            │                             │
  Sell                      Manage                        Review
   │                            │                             │
 POS full screen          Products ─→ detail ─→ edit      Reports ─→ report ─→ filter
   ├ scan / search              ├ import wizard             ├ discount log ─→ sale detail
   ├ unit picker                ├ categories, brands        └ void log ─→ sale detail
   ├ discount ─→ approval       │
   ├ customer ─→ quick create  Inventory ─→ stock detail    Cash ─→ shift list ─→ shift detail
   ├ payment ─→ split           ├ receive ─→ confirm         ├ end of day
   ├ complete ─→ receipt        ├ adjust ─→ approval         └ cash movement
   ├ hold ─→ held sales         ├ write-off
   ├ transactions ─→ sale       └ low stock ─→ receive      Users ─→ permissions
   │        detail ─→ void                                    └ audit log ─→ entry
   └ shift open / close        Suppliers ─→ detail
                               Customers ─→ detail          Settings ─→ appearance
                                                                     ─→ receipt designer
                                                                     ─→ terminal / test print
```

Every screen returns to the dashboard via the sidebar. The POS is the only screen that leaves the shell, and it exits back to wherever it was entered from.

---

## N. Component inventory

Build these once and reuse everywhere.

**Layout** — app shell, sidebar with grouped sections, header with outlet switcher, page header with title and action cluster, card, section divider.

**Data** — data table with checkbox column, thumbnail cell, status badge cell, row-action icon group, footer with rows-per-page and pagination; filter bar; search input with ⌘K; drawer; empty state; skeleton loader.

**Forms** — text, number, currency, quantity with unit suffix, select, searchable select, product picker, date range, toggle, checkbox, radio group, textarea, file upload, form section, field error, form footer.

**Actions** — primary, secondary dark, ghost, danger, icon button, bordered icon square, split button, dropdown menu.

**Feedback** — toast, inline strip (info, warning, danger), modal, confirmation modal, PIN approval modal, progress bar.

**Domain-specific** — stat tile filled, stat card white, trend badge, product tile for the POS grid, cart line, payment method tile, denomination keypad, receipt preview, permission matrix row, movement row with running balance, accent colour swatch picker.

---

## O. Responsive rules

| Breakpoint | Behaviour |
|---|---|
| ≥1280px | Full shell. POS two-pane with 380px cart. Primary target |
| 1024–1280px | Sidebar collapses to icon rail. Cart narrows to 320px. Tables keep all columns |
| 768–1024px | Storekeeper mode: receive, adjust, stock lookup, low stock. Tables drop secondary columns. POS cart becomes an expandable bottom sheet showing item count and total |
| <768px | Owner mode only: dashboard, reports, approvals, audit. Tables become stacked rows with the primary value emphasised. POS shows "Not available on phone — use the counter terminal" rather than degrading |
