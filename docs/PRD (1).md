# Product Requirements Document
## POS & Inventory Management System — Two Outlets

| | |
|---|---|
| **Version** | 1.0 |
| **Status** | Draft for review |
| **Client** | [Client name] — Inco Hardware and [Electrical shop name] |
| **Prepared by** | [Your name] |
| **Date** | [Date] |
| **Related documents** | Feature Summary v1.0 · Scope of Work v2.0 · Quotation QTN-001 · stitch-prompt.md |

---

## 1. Purpose and scope

### 1.1 Purpose

This document defines what the system must do, for whom, and under what rules. It is the source of truth for development, design and testing. Where it conflicts with earlier documents, this document governs functionality and the Scope of Work governs commercial terms.

### 1.2 Product summary

A point-of-sale and inventory system for an electrical and hardware retail business trading from two shops in different towns. The shops trade independently — their own stock, cash, staff and receipts — but share one product list, one customer list and one owner's view of the whole business.

### 1.3 Scope of this release

**Stage 1** covers: outlets, product catalogue with unit conversions, stock control per outlet, point of sale with all payment methods, receipt printing, goods receipt, suppliers, customers, cashier shifts and cash reconciliation, users and permissions, audit logging, reports and dashboard, hosting and backups.

**Deferred to Stage 2**: credit sales, quotations, purchase orders, returns and refunds, stock counting, barcode label printing, expenses, report export, product variants, bulk price updates.

**Deferred to Stage 3**: stock transfers between outlets, deliveries and deposits, VAT and tax invoicing, GRA E-VAT integration, cash drawer and customer display, SMS receipts, third outlet.

### 1.4 Business objectives

| Ref | Objective | Measure |
|---|---|---|
| BO-1 | The owner knows what each shop sold and made, without being present | Dashboard answers today's sales, profit, cash and low stock for both outlets |
| BO-2 | Stock figures are trustworthy and traceable | Every quantity change has a reason, a user and a source transaction |
| BO-3 | Cash and stock losses become visible quickly | Discount, void and variance reports reviewable daily |
| BO-4 | Checkout is faster than the current manual process | Median time from first scan to printed receipt under 45 seconds for a 5-line sale |
| BO-5 | The owner sees one business, not two | Every report available per outlet and combined |

---

## 2. Users

### 2.1 Personas

**Cashier — Kwame, counter, Inco Hardware**
Stands at the counter for eight hours. Uses a barcode scanner in one hand. Serves trade customers who negotiate and walk-in customers who do not. Needs to find "2.5 twin and earth" without knowing the SKU. Cannot see cost prices. Cannot void a sale.

**Storekeeper — Ama, back store**
Receives deliveries, checks quantities against invoices, records damage. Works on a tablet or the counter PC between customers. Needs stock figures she can trust and a reason field she must fill.

**Manager — Kofi, one outlet**
Approves discounts below the floor, authorises voids, closes the day, reviews the discount and void reports. Sees cost and profit for his outlet.

**Owner — the client, usually elsewhere**
Is never in both shops at once. Checks the dashboard from a phone. Sets prices and permissions. Sees everything, both outlets, combined or separately.

### 2.2 Environment and constraints

| Factor | Reality | Design consequence |
|---|---|---|
| Two towns | Separate premises, staff, internet | Cloud-hosted single system; every record tagged to an outlet |
| Internet | Usable but unreliable | Counter survives short dropouts; long outages stop that outlet |
| Power | Cuts are routine | UPS required; no data loss on abrupt shutdown |
| Devices | One Windows PC per counter, possible tablet in the store | Desktop-first; tablet-usable for stock; phone for owner only |
| Hardware | USB thermal printer, USB scanner | ESC/POS via local print service; scanner behaves as a keyboard |
| Staff literacy | Mixed; some low computer confidence | Plain labels, few steps, hard to make an irreversible mistake |

---

## 3. Assumptions, dependencies, exclusions

### 3.1 Assumptions

| Ref | Assumption |
|---|---|
| AS-1 | VAT is out of scope for Stage 1. Receipts show prices as charged with no tax breakdown |
| AS-2 | Two outlets. The design accommodates a third but it is not built |
| AS-3 | Stock does not routinely move between outlets; no transfer workflow |
| AS-4 | One checkout terminal per outlet |
| AS-5 | One shared product list; each outlet stocks the part of it that it sells |
| AS-6 | Prices default to shared, with an optional per-outlet override |
| AS-7 | Stock is a total quantity per outlet in the base unit; no part-drum or remnant tracking |
| AS-8 | Weighted average cost, calculated per outlet |
| AS-9 | Single currency, GHS |
| AS-10 | Client provides hardware, internet, product data and opening stock |

### 3.2 Dependencies

Cloud hosting and managed database · a local print service installed on each counter PC · client-supplied product data in the provided template · client-supplied logo and shop details for receipts.

### 3.3 Explicitly out of scope

Online store · accounting general ledger, trial balance or financial statements · payroll · customer mobile app · bank or mobile-money API integration · manufacturing or kit assembly · serial number tracking · expiry date tracking · multi-currency.

---

## 4. Business rules

These rules govern the whole system and override any conflicting requirement.

| Ref | Rule |
|---|---|
| **BR-1** | **Stock is never stored on the product record.** It is held per product per outlet. There is no global quantity anywhere in the system |
| **BR-2** | **Every stock change is a movement row** carrying outlet, product, quantity delta, reason, user, timestamp and source document. The current level must always equal the sum of its movements |
| **BR-3** | **Completed sales are immutable.** They are never deleted or edited. Correction is by void, which writes reversing movements and leaves both records visible |
| **BR-4** | **Costing is weighted average per outlet.** On receipt: `new_avg = ((qty_on_hand × current_avg) + (qty_received × unit_cost)) ÷ (qty_on_hand + qty_received)` |
| **BR-5** | **Cost is frozen on the sale line** at the moment of sale. Later cost or price changes never alter historical profit |
| **BR-6** | **Receipt numbers are per outlet, gapless and never reused.** Format `{OUTLET}-{TERMINAL}-{SEQ}`, e.g. `INC-01-004312`. Each terminal holds a pre-allocated block of sequence numbers so it can number receipts while offline |
| **BR-7** | **Every sale carries a client-generated UUID.** The server rejects a second submission of the same UUID. A double-click, retry or reconnect can never create a duplicate sale or duplicate payment |
| **BR-8** | **Stock decrement happens inside a database transaction** with a row-level lock and an availability check. Two terminals cannot sell the same last unit |
| **BR-9** | **Negative stock is blocked by default.** Users with `stock.oversell` may proceed; the resulting movement is flagged and appears on an exceptions report |
| **BR-10** | **A sale cannot go below the product's floor price** without approval from a user holding `sale.approve_below_floor`. The approver's identity is recorded on the sale |
| **BR-11** | **Money is stored in minor units (pesewas) as integers.** Display to 2 decimal places. Rounding is half-up, applied per line, with totals summed from rounded lines |
| **BR-12** | **Quantities are stored to 3 decimal places** in the base unit, to support cut lengths |
| **BR-13** | **A user may have only one open shift at a time.** A terminal may have only one open shift at a time |
| **BR-14** | **Expected cash** = opening float + cash sales − cash refunds − cash payouts. Counted cash is entered blind; the variance is revealed only after submission |
| **BR-15** | **Audit log is append-only.** No application path exists to edit or delete an entry, including for the Owner |
| **BR-16** | **Permission changes cannot be self-applied.** No user can alter their own permissions |
| **BR-17** | **Deactivation, not deletion.** Products, customers, suppliers and users are deactivated and retained, because historical documents reference them |

---

## 5. Functional requirements

Each requirement carries an ID, a user story, and acceptance criteria. Priority: **M** must have (Stage 1), **S** should have (Stage 2), **C** could have (Stage 3).

### 5.1 Authentication and session — FR-AUTH

| ID | Pri | Requirement |
|---|---|---|
| FR-AUTH-01 | M | Users sign in with a username or email and password |
| FR-AUTH-02 | M | Each user has a 4–6 digit PIN used for counter-level approvals and screen unlock |
| FR-AUTH-03 | M | A user assigned to both outlets selects an outlet after sign-in; a user assigned to one is placed there automatically |
| FR-AUTH-04 | M | The POS screen can be locked without ending the shift; unlock requires the shift owner's PIN |
| FR-AUTH-05 | M | Sessions expire after a configurable idle period; the POS with an open shift locks rather than signs out |
| FR-AUTH-06 | M | Failed sign-in attempts are rate limited and logged |
| FR-AUTH-07 | M | Password reset by an administrator; self-service reset by email where an address exists |
| FR-AUTH-08 | M | A deactivated user cannot sign in and sees a clear message |

> **US-AUTH-1** As a cashier, I want to lock the screen when I step away, so nobody can sell under my name without ending my shift.

**Acceptance** — Locking and unlocking does not close the shift, does not clear the cart, and is recorded in the audit log.

### 5.2 Outlets — FR-OUT

| ID | Pri | Requirement |
|---|---|---|
| FR-OUT-01 | M | The system supports multiple outlets; two are configured at launch |
| FR-OUT-02 | M | Each outlet holds its own name, trading name, address, phone, receipt footer and logo |
| FR-OUT-03 | M | Every sale, payment, stock movement, shift, cash movement and goods receipt is permanently tagged to one outlet |
| FR-OUT-04 | M | The active outlet is selected in the header and persists across screens and sessions |
| FR-OUT-05 | M | Users with `outlet.view_all` may select "All outlets" on dashboards and reports; transactional screens always require a single outlet |
| FR-OUT-06 | M | Users without `outlet.view_all` see their outlet name as static text, not a control |
| FR-OUT-07 | C | Stock transfer between outlets, with despatch and receipt sides and an in-transit state |

**Acceptance** — With Outlet A selected, no record belonging to Outlet B is visible on any list, report or search result.

### 5.3 Product catalogue — FR-PROD

| ID | Pri | Requirement |
|---|---|---|
| FR-PROD-01 | M | Products carry: name, SKU, category, brand, description, supplier, base unit, cost, prices, reorder level, active flag, image |
| FR-PROD-02 | M | SKU is unique across the system and auto-generated with a manual override |
| FR-PROD-03 | M | A product may have **multiple barcodes**; each barcode is unique system-wide and maps to one product and one selling unit |
| FR-PROD-04 | M | A barcode may be attached to a non-base unit, so scanning a carton adds the full carton quantity |
| FR-PROD-05 | M | Categories and brands are managed lists; categories are single-level in Stage 1 |
| FR-PROD-06 | M | Search matches name, SKU, barcode, brand, category and description, tolerating partial and out-of-order terms — "2.5 twin earth" must find "Twin & Earth Cable 2.5mm" |
| FR-PROD-07 | M | Search results show name, unit, price and **stock at the active outlet** |
| FR-PROD-08 | M | Products are deactivated, never deleted (BR-17) |
| FR-PROD-09 | M | Full cost and price history is retained and viewable |
| FR-PROD-10 | M | Bulk import from spreadsheet with column mapping, validation, an error report and a preview before commit |
| FR-PROD-11 | S | Bulk price update by category, brand or supplier, with preview of affected products before applying |
| FR-PROD-12 | S | Product variants under a parent product (size, rating, wattage, length, colour) |

> **US-PROD-1** As a cashier, I want to type how the customer describes an item rather than its exact name, so I do not hold up the queue hunting for it.

**Acceptance** — A four-term partial query returns the correct product in the top three results in under 300ms with 3,000 products loaded.

### 5.4 Units and conversions — FR-UOM

| ID | Pri | Requirement |
|---|---|---|
| FR-UOM-01 | M | Each product has one **base unit**, the smallest sellable unit, in which stock is held |
| FR-UOM-02 | M | Each product may have additional **selling units**, each with a conversion factor to the base unit (drum = 100 m, carton = 20 pcs, bundle = 10 lengths) |
| FR-UOM-03 | M | The cashier picks the selling unit at the counter; quantity and price convert automatically |
| FR-UOM-04 | M | A selling unit may carry its own price rather than a multiple of the base price, so a full drum can be cheaper per metre than a cut length |
| FR-UOM-05 | M | Goods are received in a purchase unit and converted to the base unit on receipt |
| FR-UOM-06 | M | Fractional quantities are supported for continuous goods, to 3 decimal places |
| FR-UOM-07 | M | Changing a conversion factor is blocked once stock or transactions exist; a new unit must be created instead |

**Acceptance** — Receiving 3 drums of a 100 m cable increases stock by 300 m. Selling 12.5 m reduces it to 287.5 m. Selling 1 drum reduces it to 187.5 m.

### 5.5 Pricing — FR-PRICE

| ID | Pri | Requirement |
|---|---|---|
| FR-PRICE-01 | M | Each product holds a cost, a retail price and a trade price |
| FR-PRICE-02 | M | Each product holds a **floor price** below which a sale requires approval (BR-10) |
| FR-PRICE-03 | M | Prices default to shared across outlets; an optional per-outlet override may be set per product |
| FR-PRICE-04 | M | Customer type determines which price level applies automatically at the counter |
| FR-PRICE-05 | M | A specific customer may carry a fixed discount percentage or an agreed price |
| FR-PRICE-06 | M | Price changes are versioned with effective date and user; historical documents keep the price used at the time (BR-5) |
| FR-PRICE-07 | M | Cost price and margin are visible only to users with `price.view_cost` |
| FR-PRICE-08 | M | The product screen shows both accounting margin (against weighted average cost) and replacement margin (against latest purchase cost) |

> **US-PRICE-1** As the owner, I want to see what I actually earned and what it costs me to restock, because when copper moves those are different numbers.

### 5.6 Inventory — FR-INV

| ID | Pri | Requirement |
|---|---|---|
| FR-INV-01 | M | Stock is held per product per outlet (BR-1) |
| FR-INV-02 | M | Movement types: `RECEIPT`, `SALE`, `SALE_VOID`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `DAMAGE`, `LOSS`, `OPENING`, and later `RETURN_IN`, `SUPPLIER_RETURN`, `TRANSFER_IN`, `TRANSFER_OUT` |
| FR-INV-03 | M | Every movement records outlet, product, quantity delta in base units, unit cost, reason code, free-text note, user, timestamp and source document reference |
| FR-INV-04 | M | Movement history is filterable by product, outlet, type, user and date range |
| FR-INV-05 | M | Manual adjustments require a reason code and are restricted to `stock.adjust` |
| FR-INV-06 | M | Adjustments above a configurable value threshold require approval from `stock.approve_adjustment` |
| FR-INV-07 | M | Weighted average cost is recalculated per outlet on every receipt (BR-4) |
| FR-INV-08 | M | Low stock is flagged when quantity ≤ reorder level, per outlet |
| FR-INV-09 | M | Inventory valuation at weighted average cost, per outlet and combined |
| FR-INV-10 | M | An exceptions view lists oversell events, large adjustments and write-offs |
| FR-INV-11 | S | Stock count: generate count sheet, enter counted figures, review variance, approve, post adjustments as one batch |
| FR-INV-12 | C | Quarantine state for faulty goods awaiting supplier claim — owned, not sellable |

**Acceptance** — For any product at any outlet, the current quantity equals the sum of all its movement deltas. A reconciliation job proves this nightly and reports any drift.

### 5.7 Point of sale — FR-POS

| ID | Pri | Requirement |
|---|---|---|
| FR-POS-01 | M | The POS runs full screen without the application sidebar |
| FR-POS-02 | M | A shift must be open before selling; if none is open the user is prompted to open one |
| FR-POS-03 | M | **Scanner input is captured globally** — keystrokes are routed to the product search regardless of focus, without the cashier clicking into a field |
| FR-POS-04 | M | Scanner input is distinguished from typing by inter-keystroke timing and a terminating Enter |
| FR-POS-05 | M | Scanning a product already in the cart increments that line and visually flashes it, rather than adding a second line |
| FR-POS-06 | M | Rapid consecutive scans are queued and all applied; none may be dropped |
| FR-POS-07 | M | An unrecognised barcode shows an inline strip offering search and "assign this barcode to a product", not a modal |
| FR-POS-08 | M | A product with more than one selling unit prompts for the unit before adding |
| FR-POS-09 | M | Cart lines support quantity edit, unit change, price override where permitted, discount and removal |
| FR-POS-10 | M | Line and cart discounts are supported, by percentage or amount, capped by the user's `sale.discount_max` |
| FR-POS-11 | M | A price below the floor triggers inline manager approval by PIN; the approval is recorded against the sale (BR-10) |
| FR-POS-12 | M | A customer may be attached by phone-number search or created inline with name and phone only |
| FR-POS-13 | M | Selling below available stock is blocked unless the user holds `stock.oversell` (BR-9) |
| FR-POS-14 | M | Sales may be held with an optional label and resumed later on the same terminal or another at the same outlet |
| FR-POS-15 | M | Held sales do not reserve stock |
| FR-POS-16 | M | Keyboard shortcuts: F2 payment, F3 hold, F4 search focus, F9 lock, Esc clear line, arrows navigate results, Enter add |
| FR-POS-17 | M | Touch targets are at least 44px |
| FR-POS-18 | M | Past transactions are searchable by receipt number, date, customer, amount or item |
| FR-POS-19 | M | A sale may be voided with a reason by a user holding `sale.void`; reversing movements are written (BR-3) |
| FR-POS-20 | S | Returns and refunds against an original receipt, full or partial, with a credit note option |

> **US-POS-1** As a cashier, I want to scan five items and take payment without touching the mouse, so I can serve the queue.

**Acceptance** — A five-line sale can be completed keyboard-and-scanner only, with no mouse input, from empty cart to printed receipt.

### 5.8 Payments — FR-PAY

| ID | Pri | Requirement |
|---|---|---|
| FR-PAY-01 | M | Payment methods: cash, mobile money, card, bank transfer |
| FR-PAY-02 | M | Cash payment captures amount tendered and calculates change; denomination shortcut buttons are offered |
| FR-PAY-03 | M | Mobile money, card and transfer capture a reference and require an explicit cashier confirmation that funds were received |
| FR-PAY-04 | M | Split payment across two or more methods, with a live remaining balance |
| FR-PAY-05 | M | A sale cannot complete until payments equal the total |
| FR-PAY-06 | M | Overpayment is only permitted for cash, where the excess becomes change |
| FR-PAY-07 | M | Every payment carries a UUID; resubmission is rejected (BR-7) |
| FR-PAY-08 | M | The payment screen is the only modal permitted to block scanner input |
| FR-PAY-09 | S | Refund to the original payment method, with cash refunds restricted by permission |

**Acceptance** — Submitting the same payment twice due to a network retry records exactly one payment and returns the original result.

### 5.9 Receipts and printing — FR-RCPT

| ID | Pri | Requirement |
|---|---|---|
| FR-RCPT-01 | M | The sale is committed and persisted **before** any print is attempted |
| FR-RCPT-02 | M | Printing uses ESC/POS via a local print service; no browser print dialogue appears |
| FR-RCPT-03 | M | Supports 58mm and 80mm thermal printers over USB or network |
| FR-RCPT-04 | M | Receipt content: outlet name, logo, address, phone, receipt number, date and time, cashier name, customer name where attached, line items with quantity, unit, unit price and line total, discounts, total, payment method(s), amount paid, change, footer text |
| FR-RCPT-05 | M | A print failure never blocks or reverses the sale; it surfaces a retry with the sale marked complete |
| FR-RCPT-06 | M | Reprints are permitted and are printed with a clear `REPRINT` marker; every reprint is logged |
| FR-RCPT-07 | M | Printing may be skipped per sale |
| FR-RCPT-08 | M | Printer selection, paper width and a test print are configurable per terminal |
| FR-RCPT-09 | M | The receipt layout is previewable in Settings at both widths |
| FR-RCPT-10 | C | Cash drawer kick via the printer on cash sales |

**Acceptance** — With the printer switched off, the sale completes, the receipt number is issued, stock is decremented, and the receipt prints on retry once the printer is restored.

### 5.10 Shifts and cash — FR-CASH

| ID | Pri | Requirement |
|---|---|---|
| FR-CASH-01 | M | A shift is opened with a declared opening float, tied to a user, terminal and outlet |
| FR-CASH-02 | M | Only one open shift per user and per terminal (BR-13) |
| FR-CASH-03 | M | Cash movements during a shift: payout, banking, owner drawing, float transfer — each requiring a reason |
| FR-CASH-04 | M | Shift close requires a **blind count**; expected cash is not shown until the count is submitted |
| FR-CASH-05 | M | Variance is calculated per BR-14 and recorded against the user; it is never silently absorbed |
| FR-CASH-06 | M | Variance beyond a configurable threshold requires a written explanation |
| FR-CASH-07 | M | Non-cash takings are listed by method at close for reconciliation against statements |
| FR-CASH-08 | M | An end-of-day report is produced per cashier, per outlet and for the business |
| FR-CASH-09 | M | A shift cannot be reopened once closed; corrections are made by a separate cash movement |

> **US-CASH-1** As the owner, I want each cashier accountable for their own drawer, so a shortage points to a person rather than a shop.

### 5.11 Suppliers and goods receipt — FR-SUP

| ID | Pri | Requirement |
|---|---|---|
| FR-SUP-01 | M | Supplier records: name, contact person, phone, email, address, payment terms, notes, active flag |
| FR-SUP-02 | M | Goods are received into a specific outlet, with or without a prior order |
| FR-SUP-03 | M | Receipt lines capture product, quantity, purchase unit, unit cost and optional supplier reference |
| FR-SUP-04 | M | Confirming a receipt writes stock movements and recalculates weighted average cost (BR-4) |
| FR-SUP-05 | M | The confirmation screen shows resulting stock and the new average cost before commit |
| FR-SUP-06 | M | A confirmed receipt cannot be edited; it is reversed by a correcting document |
| FR-SUP-07 | M | Purchase history is viewable per supplier and per product |
| FR-SUP-08 | S | Purchase orders, partial delivery, over- and short-delivery handling |
| FR-SUP-09 | S | Landed cost apportionment across received lines |
| FR-SUP-10 | S | Supplier invoices, payments and outstanding balances |

### 5.12 Customers — FR-CUST

| ID | Pri | Requirement |
|---|---|---|
| FR-CUST-01 | M | Sales may complete with no customer attached |
| FR-CUST-02 | M | Customer records: name, phone, email, address, type, notes, active flag |
| FR-CUST-03 | M | Phone number is the primary lookup key and is unique |
| FR-CUST-04 | M | Customer types (retail, electrician, contractor, company) map to price levels |
| FR-CUST-05 | M | Customers are shared across both outlets |
| FR-CUST-06 | M | Purchase history per customer, across both outlets |
| FR-CUST-07 | S | Credit limit, outstanding balance, ageing, statements, part payments |

### 5.13 Users, roles and permissions — FR-USER

| ID | Pri | Requirement |
|---|---|---|
| FR-USER-01 | M | Every person has an individual account; shared logins are not supported |
| FR-USER-02 | M | Four seeded roles: Owner, Manager, Cashier, Storekeeper |
| FR-USER-03 | M | Permissions are granted individually and may be varied per user, not only per role |
| FR-USER-04 | M | Users are assigned to one or more outlets |
| FR-USER-05 | M | No user can modify their own permissions (BR-16) |
| FR-USER-06 | M | Navigation and controls the user lacks permission for are **absent**, not disabled |
| FR-USER-07 | M | Users are deactivated, never deleted |
| FR-USER-08 | M | Every permission change is written to the audit log |

### 5.14 Audit — FR-AUDIT

| ID | Pri | Requirement |
|---|---|---|
| FR-AUDIT-01 | M | Audit entries capture actor, action, entity type and ID, before and after values, outlet, terminal, IP and timestamp |
| FR-AUDIT-02 | M | Logged actions include: sign-in and failures, sale completion, void, discount override, price change, cost change, stock adjustment, write-off, goods receipt, shift open and close, cash movement, user and permission changes, settings changes, receipt reprint, data export |
| FR-AUDIT-03 | M | The log is append-only with no application delete or edit path (BR-15) |
| FR-AUDIT-04 | M | The log is filterable by actor, action, entity, outlet and date range |
| FR-AUDIT-05 | M | Audit entries are retained for the life of the system |

### 5.15 Reports and dashboard — FR-RPT

| ID | Pri | Requirement |
|---|---|---|
| FR-RPT-01 | M | Owner dashboard shows both outlets separately and combined: today's sales, estimated profit, expected cash, low stock count, open shifts |
| FR-RPT-02 | M | Manager dashboard shows a single outlet with operational focus |
| FR-RPT-03 | M | Every report is filterable by outlet, date range and, where relevant, category, user and payment method |
| FR-RPT-04 | M | Reports: sales summary, sales by product, by category, by cashier, by customer, gross profit and COGS, best sellers, slow movers, stock on hand, inventory valuation, stock movement, low stock, payment method breakdown, discount and override log, void log, shift and end-of-day |
| FR-RPT-05 | M | Profit and cost figures appear only for users with `report.view_profit` |
| FR-RPT-06 | M | All monetary figures are calculated from stored frozen costs, never recomputed from current prices |
| FR-RPT-07 | S | Export to Excel and PDF |

### 5.16 Settings — FR-SET

| ID | Pri | Requirement |
|---|---|---|
| FR-SET-01 | M | Business profile: legal name, trading name, logo, contact details |
| FR-SET-02 | M | Per-outlet settings: name, address, phone, receipt footer, reorder defaults, receipt number prefix |
| FR-SET-03 | M | **Appearance: accent colour selectable from a preset palette or hex entry, with live preview.** Orange is the default. Restricted to `settings.appearance` |
| FR-SET-04 | M | The accent is applied as a CSS custom property; semantic colours (success, warning, danger) are fixed and unaffected |
| FR-SET-05 | M | Terminal settings: printer, paper width, test print, receipt auto-print on or off |
| FR-SET-06 | M | Operational thresholds: idle lock timeout, adjustment approval threshold, cash variance threshold |
| FR-SET-07 | M | Backup status, last successful backup, and restore history are visible |
| FR-SET-08 | M | Data export of all business data on request |

### 5.17 Connectivity and resilience — FR-SYNC

| ID | Pri | Requirement |
|---|---|---|
| FR-SYNC-01 | M | The product catalogue and prices are cached locally so search and scanning work at full speed regardless of connection quality |
| FR-SYNC-02 | M | During a short connection loss the terminal continues to record sales locally and queues them |
| FR-SYNC-03 | M | Queued sales retain their receipt numbers from the pre-allocated block (BR-6) |
| FR-SYNC-04 | M | A persistent, non-blocking banner shows offline status and the queued count |
| FR-SYNC-05 | M | On reconnection the queue is submitted in order, idempotently (BR-7) |
| FR-SYNC-06 | M | Conflicts arising from offline sales — chiefly stock going negative — are surfaced on an exceptions report rather than silently resolved |
| FR-SYNC-07 | M | An abrupt power loss must not corrupt data or lose a committed sale |
| FR-SYNC-08 | C | Full-day offline operation with reconciliation |

**Acceptance** — With the network disconnected mid-sale, the sale completes, prints, and appears at the server correctly and exactly once when the connection returns.

---

## 6. Permission matrix

Default assignment. Individual users may be varied.

| Permission | Owner | Manager | Cashier | Storekeeper |
|---|:-:|:-:|:-:|:-:|
| `pos.sell` | ✓ | ✓ | ✓ | — |
| `sale.discount` (to limit) | ✓ | ✓ | ✓ | — |
| `sale.approve_below_floor` | ✓ | ✓ | — | — |
| `sale.void` | ✓ | ✓ | — | — |
| `sale.refund` | ✓ | ✓ | — | — |
| `sale.view_all` | ✓ | ✓ | own only | — |
| `sale.reprint` | ✓ | ✓ | ✓ | — |
| `price.view_cost` | ✓ | ✓ | — | ✓ |
| `price.edit` | ✓ | ✓ | — | — |
| `product.create` | ✓ | ✓ | — | ✓ |
| `product.edit` | ✓ | ✓ | — | ✓ |
| `product.import` | ✓ | — | — | — |
| `stock.view` | ✓ | ✓ | ✓ | ✓ |
| `stock.receive` | ✓ | ✓ | — | ✓ |
| `stock.adjust` | ✓ | ✓ | — | ✓ |
| `stock.approve_adjustment` | ✓ | ✓ | — | — |
| `stock.oversell` | ✓ | ✓ | — | — |
| `shift.open` | ✓ | ✓ | ✓ | — |
| `shift.close` | ✓ | ✓ | ✓ | — |
| `cash.movement` | ✓ | ✓ | — | — |
| `cash.view_variance` | ✓ | ✓ | own only | — |
| `customer.manage` | ✓ | ✓ | ✓ | — |
| `supplier.manage` | ✓ | ✓ | — | ✓ |
| `report.view` | ✓ | ✓ | — | — |
| `report.view_profit` | ✓ | ✓ | — | — |
| `user.manage` | ✓ | — | — | — |
| `audit.view` | ✓ | ✓ | — | — |
| `outlet.view_all` | ✓ | — | — | — |
| `settings.general` | ✓ | — | — | — |
| `settings.appearance` | ✓ | ✓ | — | — |
| `settings.terminal` | ✓ | ✓ | — | — |

---

## 7. Data model

### 7.1 Core entities

```
outlet(id, code, name, trading_name, address, phone, receipt_footer,
       logo_url, receipt_prefix, is_active)

terminal(id, outlet_id→outlet, code, name, printer_config,
         seq_block_start, seq_block_end, seq_current)

user(id, username, email, password_hash, pin_hash, full_name, phone,
     is_active, last_login_at)
role(id, name, is_system)
permission(id, code, description)
role_permission(role_id→role, permission_id→permission)
user_role(user_id→user, role_id→role)
user_permission(user_id→user, permission_id→permission, granted)  -- overrides
user_outlet(user_id→user, outlet_id→outlet)

category(id, name, is_active)
brand(id, name, is_active)
supplier(id, name, contact_name, phone, email, address, terms, is_active)

product(id, sku UNIQUE, name, description, category_id→category,
        brand_id→brand, supplier_id→supplier, base_unit_id→unit,
        cost_price, retail_price, trade_price, floor_price,
        reorder_level, image_url, is_active, created_by, created_at)

unit(id, name, abbreviation)
product_unit(id, product_id→product, unit_id→unit, factor_to_base,
             price_override, is_base, is_purchase_default)
product_barcode(id, product_id→product, product_unit_id→product_unit,
                barcode UNIQUE)
product_outlet_price(product_id→product, outlet_id→outlet,
                     retail_price, trade_price, floor_price)
price_history(id, product_id, outlet_id NULL, field, old_value,
              new_value, changed_by, changed_at)
```

### 7.2 Inventory

```
stock_level(product_id→product, outlet_id→outlet,
            quantity_base, avg_cost, updated_at)
            PRIMARY KEY (product_id, outlet_id)

inventory_movement(id, outlet_id→outlet, product_id→product,
                   movement_type, quantity_delta_base, unit_cost,
                   reason_code, note, source_type, source_id,
                   created_by→user, created_at, is_flagged)
```
`source_type` ∈ {sale, sale_void, receipt, adjustment, opening}. Movements are insert-only.

### 7.3 Sales

```
sale(id, uuid UNIQUE, receipt_number UNIQUE, outlet_id→outlet,
     terminal_id→terminal, shift_id→shift, customer_id→customer NULL,
     cashier_id→user, subtotal, discount_total, total,
     status, approved_by→user NULL, sold_at, synced_at)

sale_item(id, sale_id→sale, product_id→product,
          product_unit_id→product_unit, quantity, unit_price,
          discount_amount, line_total, unit_cost_at_sale,
          quantity_base)

payment(id, uuid UNIQUE, sale_id→sale, method, amount,
        reference, tendered, change_given, confirmed_by→user, paid_at)

sale_void(id, sale_id→sale UNIQUE, reason_code, note,
          voided_by→user, approved_by→user, voided_at)
```
`status` ∈ {completed, voided}. There is no draft or deleted status; held carts live in a separate `held_sale` table and are not sales.

### 7.4 Purchasing, customers, cash

```
customer(id, name, phone UNIQUE, email, address,
         customer_type_id→customer_type, discount_percent,
         is_active, created_at)
customer_type(id, name, price_level)

goods_receipt(id, outlet_id→outlet, supplier_id→supplier,
              supplier_reference, received_by→user, received_at,
              total_cost, status)
goods_receipt_item(id, goods_receipt_id, product_id,
                   product_unit_id, quantity, unit_cost,
                   quantity_base, line_cost)

shift(id, outlet_id→outlet, terminal_id→terminal, user_id→user,
      opening_float, opened_at, counted_cash, expected_cash,
      variance, variance_note, closed_at, status)

cash_movement(id, shift_id→shift, direction, amount,
              reason_code, note, created_by→user, created_at)

audit_log(id, actor_id→user, action, entity_type, entity_id,
          before_json, after_json, outlet_id, terminal_id,
          ip_address, created_at)
```

### 7.5 Key constraints and indexes

- `UNIQUE(product_barcode.barcode)`, `UNIQUE(product.sku)`, `UNIQUE(sale.uuid)`, `UNIQUE(sale.receipt_number)`, `UNIQUE(payment.uuid)`, `UNIQUE(customer.phone)`
- `UNIQUE(shift.user_id) WHERE status='open'` and `UNIQUE(shift.terminal_id) WHERE status='open'`
- Index `inventory_movement(outlet_id, product_id, created_at)`
- Index `sale(outlet_id, sold_at)`, `sale(receipt_number)`
- Index `stock_level(outlet_id)` filtered where `quantity_base <= reorder_level`
- Full-text or trigram index on `product(name, sku, description)` for FR-PROD-06
- `CHECK(stock_level.quantity_base >= 0)` unless the oversell path is used, which lifts the check via an explicit flagged path

---

## 8. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Performance | Product search returns in under 300ms at 3,000 products; adding a scanned line renders in under 100ms |
| NFR-2 | Performance | Sale completion, including stock decrement and persistence, completes in under 1s on a normal connection |
| NFR-3 | Performance | Receipt begins printing within 1s of sale completion |
| NFR-4 | Availability | Counter functions tolerate dropouts of up to 15 minutes without interrupting trade |
| NFR-5 | Durability | No committed sale may be lost on abrupt power loss |
| NFR-6 | Backup | Automated daily off-site backup, 30-day retention, with a documented and tested restore |
| NFR-7 | Recovery | Recovery point objective 15 minutes; recovery time objective 4 hours |
| NFR-8 | Security | Passwords hashed with bcrypt or argon2; PINs hashed separately; TLS on all traffic |
| NFR-9 | Security | Server-side authorisation on every endpoint; the UI is never the only control |
| NFR-10 | Security | Rate limiting on authentication and approval endpoints |
| NFR-11 | Usability | A cashier reaches competence on core selling within one training session |
| NFR-12 | Usability | Core selling requires no mouse |
| NFR-13 | Compatibility | Latest Chrome and Edge on Windows 10/11; tablet browsers for stock functions |
| NFR-14 | Accessibility | Minimum 4.5:1 contrast for text; all interactive elements keyboard reachable; touch targets ≥ 44px |
| NFR-15 | Maintainability | The accent colour is a single token; no hard-coded accent hex values anywhere |
| NFR-16 | Extensibility | Adding a third outlet requires configuration only, no schema or code change |
| NFR-17 | Data integrity | Nightly job reconciles stock levels against movement sums and reports drift |
| NFR-18 | Localisation | Currency GHS, dates DD/MM/YYYY, 24-hour time |

---

## 9. Receipt specification

```
        [LOGO]
     INCO HARDWARE
   12 Main Street, Koforidua
      Tel: 024 000 0000
────────────────────────────────
Receipt : INC-01-004312
Date    : 05/09/2026  14:32
Cashier : Kwame A.
Customer: Yaw Mensah (Electrician)
────────────────────────────────
2.5mm T&E Cable
  12 m @ 18.50           222.00
13A Switched Socket
  4 pcs @ 25.00          100.00
63A 4-Pole MCB
  1 pc @ 340.00          340.00
────────────────────────────────
Subtotal                 662.00
Discount                 -12.00
TOTAL                    650.00
────────────────────────────────
Cash                     500.00
Mobile Money             150.00
  Ref: MM8842219
Change                     0.00
────────────────────────────────
   Goods returnable within 7
   days with this receipt.
       Thank you.
────────────────────────────────
```
Reprints carry a `*** REPRINT ***` band immediately below the header. The 58mm layout drops to a single-column line format with the item name on its own line.

---

## 10. Release plan

| Milestone | Contents | Target |
|---|---|---|
| M1 | Design approval, data model, receipt layouts | Week 2 |
| M2 | Catalogue, units, outlets, stock, users, permissions, audit | Week 6 |
| M3 | POS, payments, receipt printing, shifts | Week 10 |
| M4 | Goods receipt, suppliers, customers, cash reconciliation, reports, dashboard, sync | Week 13 |
| M5 | Outlet 1 installation, data load, training, go-live | Week 15 |
| M6 | Outlet 2 installation, data load, training, go-live | Week 19 |

Timeline is subject to confirmation — see the note on effort in the quotation.

---

## 11. Acceptance criteria for release

The release is accepted when all of the following pass at both outlets:

1. A five-line sale completes with scanner and keyboard only, prints, and decrements stock correctly at the selling outlet only.
2. A sale completed with the printer switched off is not lost; the receipt prints on retry.
3. A sale submitted twice records once.
4. Two terminals attempting to sell the last unit produce one sale and one clear refusal.
5. Receiving 3 drums of 100m cable and selling 12.5m leaves 287.5m and the correct weighted average cost.
6. Voiding a sale leaves both the original and the reversal visible, restores stock, and appears on the void report.
7. A cashier account shows no cost price, no profit and no reports anywhere in the interface.
8. A below-floor sale cannot proceed without a manager PIN, and the approver's name is stored on the sale.
9. A blind shift close records the variance against the cashier and requires a note when beyond threshold.
10. Disconnecting the network mid-sale, then reconnecting, produces exactly one correct sale at the server.
11. Changing the accent colour in Settings updates every accent surface in the application with no blue appearing anywhere.
12. For every product at every outlet, quantity equals the sum of its movements.

---

## 12. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Product data not ready | Go-live slips | Template issued at week 1; data due week 10; named owner on the client side |
| Poor connectivity at the second outlet | That shop cannot trade during outages | Confirm connection quality before signing; full offline quotable separately |
| Staff resistance to accountability | Workarounds, shared logins | Individual logins enforced; owner briefed that this is the point of the system |
| Client becomes subject to E-VAT mid-project | Legal invoicing gap | Tax layer kept separate; integration quotable as a change |
| Scope creep from deferred Stage 2 items | Delay and margin loss | Written change procedure; deferred list agreed in the Scope of Work |
| Weighted average cost misunderstood as replacement cost | Owner disputes profit figures | Both figures shown side by side; covered in owner training |

---

## 13. Open questions

| # | Question | Blocks |
|---|---|---|
| 1 | Confirmed internet quality and outage duration at each outlet | FR-SYNC scope and price |
| 2 | Are prices actually the same at both outlets, or will overrides be used routinely | FR-PRICE-03 UI emphasis |
| 3 | Discount ceilings per role, and floor price policy — percentage or per product | FR-POS-10, FR-PRICE-02 |
| 4 | Is mobile money a registered merchant account with a downloadable statement | FR-CASH-07 |
| 5 | Number of staff per outlet and their roles | User seeding, training plan |
| 6 | Cash variance threshold requiring explanation | FR-CASH-06 |
| 7 | Source code release to client — yes or no | Contract, not build |

---

## 14. Glossary

**Base unit** — the smallest sellable unit of a product, in which stock is held.
**Blind count** — counting the drawer without seeing the expected figure first.
**Floor price** — the lowest price a sale may reach without approval.
**Movement** — a single recorded change to stock, with reason and source.
**Outlet** — one physical shop. Inco Hardware or the electrical shop.
**Oversell** — selling more than recorded stock; blocked unless permitted.
**Shift** — one cashier's session on one terminal, from float declaration to blind count.
**Void** — reversing a completed sale without deleting it.
**Weighted average cost** — a blended cost per unit, recalculated on each receipt.
