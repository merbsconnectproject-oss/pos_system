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
| `[·]` | **Not applicable** — this half does not exist. A scanner that tells a scan from typing has no server side; a row lock has no screen. Distinct from `[ ]`, which means outstanding work. |

An item is **complete only when both boxes are `[x]`**. A feature is complete when every
non-deferred item in its section is complete, including its non-functional items.

---

## Progress at a glance

| Feature | Items | Frontend | Backend |
|---|---:|---:|---:|
| A · Authentication & session | 16 | 14 done, 2 open | 16 done |
| B · Outlets | 10 | 7 done, 1 partial, 1 open, 1 deferred | 7 done, 2 partial, 1 deferred |
| C · Product catalogue | 17 | 15 done, 1 partial, 1 deferred | 15 done, 2 deferred |
| D · Units & conversions | 8 | 7 done, 1 open | 6 done, 2 open |
| E · Pricing | 10 | 8 done, 2 partial | 10 done |
| F · Inventory | 15 | 10 done, 2 partial, 1 open, 1 deferred, 1 n/a | 10 done, 1 partial, 2 open, 2 deferred |
| G · Point of sale | 25 | 17 done, 3 partial, 4 open, 1 deferred | 11 done, 1 partial, 2 open, 1 deferred, 10 n/a |
| H · Payments | 11 | 6 done, 2 partial, 2 open, 1 deferred | 7 done, 3 open, 1 deferred |
| I · Receipts & printing | 13 | 7 done, 3 partial, 2 open, 1 deferred | 12 open, 1 deferred |
| J · Shifts & cash | 12 | 9 done, 1 partial, 2 open | 10 done, 2 partial |
| K · Suppliers & goods receipt | 11 | 6 done, 2 partial, 3 deferred | 8 done, 3 deferred |
| L · Customers | 8 | 7 done, 1 deferred | 6 done, 1 deferred, 1 n/a |
| M · Users, roles & permissions | 12 | 10 done, 1 partial, 1 open | 10 done, 2 open |
| N · Audit | 6 | 4 done, 1 partial, 1 open | 5 done, 1 open |
| O · Reports & dashboard | 10 | 7 done, 1 partial, 1 open, 1 deferred | 6 done, 1 open, 1 deferred, 2 n/a |
| P · Settings | 12 | 9 done, 3 partial | 6 done, 2 partial, 3 open, 1 n/a |
| Q · Connectivity & resilience | 13 | 3 done, 1 partial, 4 open, 1 deferred, 4 n/a | 1 done, 5 open, 1 deferred, 6 n/a |
| R · Cross-cutting non-functional | 22 | 6 done, 3 partial, 12 open, 1 n/a | 6 done, 2 partial, 14 open |

**231 items · 130 complete · frontend 153 done · backend 140 done, 10 partial,
20 not applicable · contract frozen and machine-checked (`npm run check`)**

**Overall active Stage 1 completion: 61%** — 130 of 213 applicable,
non-deferred items are complete. Partials are not counted as complete.

> The table above is generated from the boxes below, so the two cannot drift.
> Read it with one caveat: many items have no backend half — a scanner that
> distinguishes a scan from typing, or a screen that runs without a sidebar, is
> finished when the frontend box is ticked. Their backend box stays open and the
> count reads worse than the truth. G is the clearest case: 19 of its 25 items
> are the till's own behaviour. **The feature table below is the better read for
> backend progress.**

### Where the backend stands

| | Feature | State |
|---|---|---|
| ✅ | A Auth · B Outlets · C Catalogue · D Units | done |
| ✅ | F Inventory · H Payments · K Suppliers | done |
| ✅ | G Point of sale | selling, payments, receipt numbers, voids — 10 of its 14 server-side items; the other four wait on J, P and L |
| 🟨 | N Audit | writes and reads; some actions do not exist yet to log |
| 🟨 | E Pricing | the three prices and history; per-outlet overrides open |
| ✅ | J Shifts & cash | open, cash movements, blind close, variance — release gate 9 passes |
| ✅ | M Users, roles & permissions | accounts, role baselines, per-user grants — BR-16 holds on every path |
| ✅ | P Settings | the thresholds are configuration now, and the rules read them |
| ✅ | L Customers | one list, found by phone however it is written |
| ✅ | O Reports & dashboard | aggregated by the database, over every row |
| ✅ | E Pricing | branch prices, customer levels, and cost no longer leaks |
| ⬜ | I Receipts | blocked on the thermal printer |
| ◐ | Q Connectivity | local-first removes the queue; power loss and the owner's push remain |

**Release gates** — 1 ⬜ · 2 ⬜ (needs the printer) · **3 ✅** same payment twice records
once · **4 ✅** two terminals cannot sell the same last unit.

**Measured, not assumed:** a five-line sale commits in **249 ms** against a real
Postgres — NFR-2 allows 1000.

**Still mock in the app:** nothing invents a figure any more.

The Stage 2 lists — expenses, installment plans, returns — start **empty** rather
than seeded, because nothing on the server records one. The screens that show them
say so instead of displaying invented totals. Two placeholders remain and both are
deliberate: `OUTLETS`, shown before sign-in when no branch is known, and
`INITIAL_SETTINGS`, which is blank wherever a value would be a claim.

The analytics screen was the worst of it and is worth recording: it did not merely
show stale seeds, it **computed** figures — revenue was real sales plus a literal,
COGS was `revenue × 0.641`, the velocity curve was a sine wave, and the category,
payment, top-mover and ageing tables were literal arrays. All of it now comes from
the reports API or is empty.

**Waiting on a decision from you:** the thermal printer — it blocks I and release
gate 2, and there is no way to choose it from here.

The three rules that were unenforced for want of a setting are now enforced: the
adjustment approval threshold (FR-INV-06), the discount ceiling (FR-POS-10) and the
cash variance threshold (FR-CASH-06) all read the value the settings screen saves.

The 31-vs-33 permission decision was taken rather than left open: all 33 are served,
with `stock.transfer` and `customer.credit` flagged as not yet active. The reasoning
and how to reverse it are on `Permission.isFutureStage()`.

---

## A · Authentication & session — `FR-AUTH`

### Functional
- [x][x] Sign in with username or email and password — FR-AUTH-01 · `A-01`
- [x][x] Sign-in error state with attempts remaining — FR-AUTH-02 · `A-02`
- [x][x] 4–6 digit PIN for counter approvals and unlock — FR-AUTH-02
- [x][x] Outlet selection after sign-in; single-outlet users placed automatically — FR-AUTH-03 · `A-03`
- [x][x] Lock the POS without ending the shift; unlock with the shift owner's PIN — FR-AUTH-04 · `A-07`
- [x][x] Idle timeout locks rather than signs out when a shift is open — FR-AUTH-05 · `A-08` *(the guard asks the shift service, so it cannot go stale)*
- [x][x] Idle period configurable, not a constant — FR-AUTH-05 · `K-08`
- [x][x] Failed sign-in attempts rate limited and logged — FR-AUTH-06 *(server enforces; 429 with retry-after)*
- [x][x] Password reset by administrator — FR-AUTH-07 · `A-04` `A-05` `A-06`
- [x][x] An account on a password somebody else chose must replace it before it can be used — FR-AUTH-07 *(a new account, or one an administrator reset: it may sign in and change its password and nothing else, enforced in the session filter)*
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
- [x][x] Product record: name, SKU, category, brand, supplier, base unit, prices, reorder level, image, active flag — FR-PROD-01 · `D-03` `D-04` *(reorder level is per outlet and lives on the stock level — BR-1)*
- [x][x] SKU auto-generated with manual override — FR-PROD-02 *({OUTLET}-{CATEGORY}-{NNN}; blank field uses a locked per-prefix sequence)*
- [x][x] SKU unique across the system — FR-PROD-02 *(unique index on upper(sku); UI surfaces server conflicts)*
- [x][x] Multiple barcodes per product — FR-PROD-03 · `D-06`
- [x][x] Each barcode bound to one selling unit, so a carton scan adds a carton — FR-PROD-04 *(a code naming an unsold unit is refused)*
- [x][x] Barcode unique system-wide — FR-PROD-03 *(UI surfaces the named server conflict)*
- [x][x] Categories and brands managed as lists — FR-PROD-05 · `D-09` `D-10` *(add, rename, retire; units of measure too — FR-UOM-01)*
- [x][x] Search matches name, SKU, barcode, brand, category and description; partial and out-of-order terms — FR-PROD-06
- [x][x] Search results show stock at the active outlet — FR-PROD-07 *(levels folded into the catalogue at load)*
- [x][x] Products deactivated, never deleted — FR-PROD-08 · BR-17 · `D-19`
- [x][x] Full cost and price history retained and viewable — FR-PROD-09 · `D-08` *(real append-only price rows plus cost-changing OPENING/RECEIPT ledger movements; no fabricated modal rows)*
- [x][x] Bulk import: template, upload, column mapping, row validation, error file, preview, commit — FR-PROD-10 · `D-12`…`D-16` *(one atomic server commit behind `product.import`; blank SKUs use the concurrency-safe prefix sequence)*
- [~][-] Bulk price update by category, brand or supplier with affected-count preview — FR-PROD-11 · `D-20` *(Stage 2; filters render, apply not wired)*
- [-][-] Product variants under a parent — FR-PROD-12 · `D-21` *(Stage 2)*

### Non-functional
- [x][x] Four-term partial query returns the product in the top three in under 300 ms at 3,000 products — NFR-1 · FR-PROD acceptance *(real PostgreSQL 18/Testcontainers volume test)*
- [x][x] Full-text or trigram index on name, SKU, description — PRD §7.5 *(pg_trgm GIN on all three; barcode partial search indexed too)*
- [x][x] Empty and no-results states — `D-17` `D-18` · `L-03` `L-11` *(an empty catalogue is now a real answer, not a seeded list)*

---

## D · Units & conversions — `FR-UOM`

### Functional
- [x][x] One base unit per product, the smallest sellable unit — FR-UOM-01
- [x][x] Additional selling units with a conversion factor to base — FR-UOM-02 · `D-05`
- [x][x] Cashier picks the unit at the counter; quantity and price convert — FR-UOM-03 · `C-04`
- [x][x] A selling unit may carry its own price, not a multiple — FR-UOM-04
- [x][x] Goods received in a purchase unit, converted to base on receipt — FR-UOM-05 *(3 drums of 100 m books in 300 m)*
- [x][x] Fractional quantities to 3 decimal places — FR-UOM-06 · BR-12
- [x][x] Conversion factor locked once stock or transactions exist — FR-UOM-07 *(product updates reject selling-unit name/factor changes after inventory movements exist)*

### Non-functional
- [x][ ] Receiving 3 drums of 100 m gives 300 m; selling 12.5 m leaves 287.5 m; selling a drum leaves 187.5 m — FR-UOM acceptance *(asserted in `contract-check.ts`)*

---

## E · Pricing — `FR-PRICE`

### Functional
- [x][x] Cost, retail and trade price per product — FR-PRICE-01 · `D-07` *(cost is the weighted average per outlet — BR-4)*
- [x][x] Floor price below which approval is required — FR-PRICE-02 · BR-10 *(server refuses without an approver; approver recorded on the line)*
- [~][x] Per-outlet price override — FR-PRICE-03 *(stored level by level, and it is the branch's floor the till is held to — BR-10. The API and the sale path are done; there is no control on the product screen yet)*
- [x][x] Customer type determines the price level automatically — FR-PRICE-04 *(decided by the server. The screen tested the type by hand in three places and missed `company`, charging every company retail)*
- [x][x] Customer-specific fixed discount or agreed price — FR-PRICE-05 *(applied at the counter, and it raises the FR-POS-10 ceiling rather than bypassing it — past the deal it is still refused)*
- [~][x] Price changes versioned with effective date and user — FR-PRICE-06 *(readable now, newest first, with who set each price; no history panel on the product screen yet)*
- [x][x] Cost and margin visible only with `price.view_cost` — FR-PRICE-07 *(**was a real hole**: `/api/stock/*` returned cost to anyone with `stock.view`, which every cashier has. Stripped at the edge now, and removed rather than zeroed)*
- [x][x] Accounting margin and replacement margin shown side by side — FR-PRICE-08 *(the weighted average says what the sale earned; the latest receipt says whether the price still works. A loss reads as a loss instead of being floored at zero)*

### Non-functional
- [x][x] Money held as integer minor units on the wire; half-up rounding per line — BR-11 *(sale amounts are BIGINT pesewas; per-unit rates keep 4 dp)*
- [x][x] Historical documents keep the price used at the time — BR-5 · FR-PRICE-06 *(cost frozen on the sale line; asserted against a later repricing)*

---

## F · Inventory — `FR-INV`

### Functional
- [x][x] Stock held per product per outlet; no global quantity — FR-INV-01 · BR-1
- [x][x] Movement types: RECEIPT, SALE, SALE_VOID, ADJUSTMENT_IN/OUT, DAMAGE, LOSS, OPENING — FR-INV-02
- [x][x] Every movement records outlet, product, delta, unit cost, reason, note, user, timestamp, source — FR-INV-03 · BR-2
- [x][x] Movement history filterable by product, outlet, type, user and date — FR-INV-04 · `E-03`
- [x][x] Manual adjustments require a reason code and `stock.adjust` — FR-INV-05 · `E-07`
- [~][ ] Adjustments above the value threshold require `stock.approve_adjustment` — FR-INV-06 · `E-08` *(threshold lives in settings, which is P; gate not wired either side)*
- [x][x] Weighted average cost recalculated per outlet on every receipt — FR-INV-07 · BR-4
- [x][x] Low stock flagged at or below reorder level, per outlet — FR-INV-08 · `E-10`
- [x][~] Valuation at weighted average cost, per outlet and combined — FR-INV-09 · `E-11` *(levels carry the average; no valuation report endpoint — that is O)*
- [x][x] Exceptions view: oversells, large adjustments, write-offs — FR-INV-10 · `E-12`
- [~][-] Stock count: generate sheet, enter counts, review variance, approve, post as one batch — FR-INV-11 · `E-14` *(Stage 2; entry works, does not post)*
- [-][-] Quarantine state for faulty goods — FR-INV-12 *(Stage 3)*

### Non-functional
- [ ][x] For any product at any outlet, quantity equals the sum of its movement deltas — FR-INV acceptance · BR-2 *(`InventoryService.drift`, asserted on every sale test)*
- [·][x] Nightly reconciliation job proves it and reports drift — NFR-17 *(`ScheduledJobs.reconcileStock`, 02:30 daily; reports rather than corrects, since a level that repaired itself would hide the bug that caused it. No screen: the drift log is for whoever is fixing it, not for a cashier)*
- [x][ ] Cash movements are not stock movements, so the stock ledger holds only stock — BR-2

---

## G · Point of sale — `FR-POS`

Ten of these are the till's own behaviour and have no server half — they are
marked `[·]`, which means "there is nothing here to build", not "not done yet".
Of the fourteen that do have one, **ten are done**; the four outstanding are
FR-POS-02 and FR-POS-10 (waiting on J and P), FR-POS-12 (waiting on L) and
held sales, which live only in the browser.

### Functional
- [x][·] Runs full screen without the application sidebar — FR-POS-01 · `C-01`
- [x][x] A shift must be open before selling; otherwise prompt to open one — FR-POS-02 · `C-30` *(the server refuses too, so takings cannot land outside a cash-up)*
- [x][·] Scanner input captured globally, whatever has focus — FR-POS-03
- [x][·] Scan distinguished from typing by inter-keystroke timing and a terminating Enter — FR-POS-04
- [x][·] Scanning a product already in the cart increments and flashes that line — FR-POS-05
- [x][·] Rapid consecutive scans queued; none dropped — FR-POS-06
- [x][x] Unrecognised barcode shows an inline strip, not a modal — FR-POS-07 · `C-19` *(`GET /api/products/barcode/{code}` 404s for an unknown code; the till resolves against its cached catalogue so scanning stays instant — FR-SYNC-01)*
- [x][x] A product with more than one selling unit prompts for the unit — FR-POS-08 · `C-04` *(units and factors come from the catalogue)*
- [x][x] Cart lines: quantity, unit change, price override, discount, remove — FR-POS-09 · `C-05` *(the sale stores the unit, factor, price and discount it was rung up with)*
- [~][ ] Line and cart discounts capped by the user's `sale.discount_max` — FR-POS-10 · `C-06` *(the ceiling lives in settings, which is P; unenforced on either side)*
- [x][x] Price below floor triggers manager PIN; approver recorded on the sale — FR-POS-11 · BR-10 · `C-07` `C-08` *(PIN checked by the server; approver stored on the line that needed it)*
- [x][~] Customer attached by phone search or created inline — FR-POS-12 · `C-09` `C-10` *(a sale stores the customer it was made to; there is no customer directory to search — needs L)*
- [x][x] Selling beyond stock blocked unless `stock.oversell` — FR-POS-13 · BR-9 · `C-21`
- [x][ ] Sales held with an optional label and resumed — FR-POS-14 · `C-22` `C-23` *(held in the browser, so a refresh loses them and another till cannot resume one)*
- [x][x] Held sales do not reserve stock — FR-POS-15 *(nothing moves until the sale commits; holding is not a server event at all)*
- [~][·] Shortcuts: F2 payment, F3 hold, F4 search, F9 lock, Esc clear, arrows navigate, Enter add — FR-POS-16 *(function keys done; arrow navigation of results not wired)*
- [~][·] Touch targets at least 44 px — FR-POS-17 *(not audited)*
- [x][x] Past transactions searchable by receipt, date, customer, amount or item — FR-POS-18 · `C-25` *(receipt, customer and phone server-side; date and amount filter in the browser)*
- [x][x] Void with a reason by `sale.void`; reversing movements written — FR-POS-19 · BR-3 · `C-27`
- [-][-] Returns and refunds against an original receipt — FR-POS-20 · `C-35` `C-36` *(Stage 2; built ahead of scope)*

### Non-functional
- [ ][·] A five-line sale completes with scanner and keyboard only, no mouse — FR-POS acceptance · NFR-12 *(not audited)*
- [ ][·] Adding a scanned line renders in under 100 ms — NFR-1
- [ ][x] Sale completion including stock decrement and persistence under 1 s — NFR-2 *(measured: a five-line sale commits in 249 ms against a real Postgres — receipt number, five priced lines, five locked decrements and the payment, in one transaction)*
- [ ][x] Two terminals cannot sell the same last unit — BR-8 · release gate 4 *(eight racing threads: one sale, seven refusals, level zero, ledger agrees)*
- [x][·] No blocking browser dialog in the payment path — `L-08`

---

## H · Payments — `FR-PAY`

### Functional
- [x][x] Cash, mobile money, card and bank transfer — FR-PAY-01 · `C-11`
- [x][x] Cash captures tendered and calculates change; denomination shortcuts offered — FR-PAY-02 · `C-12` *(cash split rows provide common GH₵10/20/50/100/200 denomination shortcuts)*
- [x][x] MoMo, card and transfer capture a reference and require explicit confirmation — FR-PAY-03 · `C-13` `C-14`
- [x][x] Split payment across two or more methods with a live remaining balance — FR-PAY-04 · `C-15`
- [x][x] Sale cannot complete until payments equal the total exactly — FR-PAY-05
- [~][x] Overpayment permitted only for cash, where the excess is change — FR-PAY-06
- [ ][x] Every payment carries a UUID; resubmission rejected — FR-PAY-07 · BR-7 *(client-generated primary key)*
- [x][ ] The payment modal is the only modal permitted to block scanner input — FR-PAY-08
- [-][-] Refund to the original method, cash refunds permission-restricted — FR-PAY-09 *(Stage 2)*

### Non-functional
- [ ][x] The same payment submitted twice records exactly one payment and returns the original result — FR-PAY acceptance · release gate 3
- [x][ ] Money comparison is exact, never within a tolerance — BR-11

---

## I · Receipts & printing — `FR-RCPT`

### Functional
- [x][ ] The sale is committed and persisted before any print is attempted — FR-RCPT-01
- [~][ ] Printing via ESC/POS through a local print service; no browser print dialogue — FR-RCPT-02 *(seam and client written; the Windows service is not)*
- [x][ ] Supports 58 mm and 80 mm — FR-RCPT-03
- [x][ ] Receipt content per PRD §9 — FR-RCPT-04
- [x][ ] A print failure never blocks or reverses the sale; a retry is offered — FR-RCPT-05 · `C-18`
- [x][x] Reprints permitted, marked `REPRINT`, and logged — FR-RCPT-06 · `C-17` *(history reprints call the protected server endpoint, recording `RECEIPT_REPRINTED` with receipt, outlet, terminal and actor)*
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
- [x][x] Shift opened with a declared float, tied to user, terminal and outlet — FR-CASH-01 · `C-29`
- [ ][x] Only one open shift per user and per terminal — FR-CASH-02 · BR-13 *(two partial unique indexes, so a race cannot pass where a check would)*
- [x][x] Cash movements during a shift, each with a reason — FR-CASH-03 · `H-04` `H-05` *(append-only; the sign belongs to the type)*
- [x][x] Shift close requires a blind count; expected cash hidden until submitted — FR-CASH-04 · `C-31` *(an open shift returns no expectation, takings or sale total — the UI cannot leak what it never receives)*
- [x][x] Variance calculated and recorded against the user, never absorbed — FR-CASH-05 · BR-14 · `C-32`
- [x][~] Variance beyond the configured threshold requires a written explanation — FR-CASH-06 · `H-06` *(enforced; the threshold is a constant at GH₵5.00 until P makes it a setting)*
- [x][x] Non-cash takings listed by method at close for reconciliation — FR-CASH-07 *(at close, deliberately — listing them earlier would give the count away)*
- [~][~] End-of-day report per cashier, per outlet and for the business — FR-CASH-08 · `H-03` *(shifts filter by outlet and cashier; a business-wide day report is O)*
- [x][x] A closed shift cannot be reopened; corrections are separate cash movements — FR-CASH-09 *(database trigger, not just a service check)*
- [x][x] Shift list and shift detail — `H-01` `H-02`

### Non-functional
- [ ][x] A blind close records the variance against the cashier and demands a note past threshold — release gate 9 *(verified: closing 100.00 short is refused, and the shift stays open so a note can be added)*
- [x][x] Expected cash = float + cash sales − cash refunds − cash payouts — BR-14 *(computed from the payments each time, never stored)*

---

## K · Suppliers & goods receipt — `FR-SUP`

### Functional
- [x][x] Supplier records: name, contact, phone, email, address, terms, notes, active — FR-SUP-01 · `F-01`…`F-04`
- [x][x] Goods received into a specific outlet, with or without a prior order — FR-SUP-02 · `E-04`
- [x][x] Receipt lines capture product, quantity, purchase unit, unit cost and reference — FR-SUP-03
- [x][x] Confirming writes stock movements and recalculates weighted average cost — FR-SUP-04 · BR-4
- [x][x] The confirmation screen shows resulting stock and the new average cost before commit — FR-SUP-05 · `E-05`
- [~][x] A confirmed receipt cannot be edited; it is reversed by a correcting document — FR-SUP-06 *(server refuses the edit and writes the reversal; no UI button yet)*
- [x][x] Purchase history per supplier and per product — FR-SUP-07 · `F-05` `F-06` *(supplier and product-scoped receipt history are available)*
- [-][-] Purchase orders, partial and over/short delivery — FR-SUP-08 *(Stage 2)*
- [-][-] Landed cost apportionment — FR-SUP-09 *(Stage 2)*
- [-][-] Supplier invoices, payments and balances — FR-SUP-10 *(Stage 2)*

### Non-functional
- [x][x] Receiving 75 @ 42.00 then 50 @ 50.00 yields 125 @ 45.20 — BR-4 *(asserted through two real deliveries)*

---

## L · Customers — `FR-CUST`

### Functional
- [x][x] Sales may complete with no customer attached — FR-CUST-01
- [x][x] Customer records: name, phone, email, address, type, notes, active — FR-CUST-02 · `G-03` `G-04` *(the form collected an email and address and threw them away; the record keeps them now)*
- [x][x] Phone number is the primary lookup key and is unique — FR-CUST-03 *(normalised to national significant digits, so `0244 123 456` and `+233244123456` are one person; a clash returns the record that already exists)*
- [x][x] Customer types map to price levels — FR-CUST-04 · `G-06` *(decided by the server — a browser that decides the price level can change it)*
- [x][x] Customers shared across both outlets — FR-CUST-05
- [x][x] Purchase history per customer across both outlets — FR-CUST-06 · `G-05` *(computed from the sales each time, never stored; a void leaves the sale in the history and takes it out of the total)*
- [-][-] Credit limit, balance, ageing, statements, part payments — FR-CUST-07 · `G-08` *(Stage 2; built ahead of scope)*

### Non-functional
- [x][·] Empty state explains walk-in sales need no customer — `G-07` *(what an empty list says is the screen's business)*

---

## M · Users, roles & permissions — `FR-USER`

### Functional
- [x][x] Every person has an individual account; no shared logins — FR-USER-01 · `J-01` `J-03` *(created with a temporary password they replace on first sign-in)*
- [x][x] Four seeded roles: Owner, Manager, Cashier, Storekeeper — FR-USER-02 · `J-05` *(the `Role` enum the server authorises with, so the matrix cannot describe rights it does not grant)*
- [~][x] Permissions granted individually and varied per user, not only per role — FR-USER-03 · `J-07` *(granted, withheld or cleared back to the role — three states. The API is complete; the per-user matrix screen is still to build)*
- [x][x] Permission matrix over all 31 PRD codes, grouped by area — `J-06` *(33 served, the two Stage 2/3 codes flagged `futureStage` — decision recorded on `Permission`)*
- [x][x] Users assigned to one or more outlets — FR-USER-04
- [x][x] No user can modify their own permissions — FR-USER-05 · BR-16 *(nor their own roles, nor deactivate themselves; editing their own name is still allowed)*
- [x][x] Controls the user lacks permission for are absent, not disabled — FR-USER-06 · `L-09` *(the server refuses regardless of what the screen draws)*
- [x][x] Users deactivated, never deleted — FR-USER-07 · `J-11`
- [x][x] Every permission change written to the audit log — FR-USER-08 *(naming the code: "supplier.manage: false → true")*

### Non-functional
- [ ][x] Server-side authorisation on every endpoint; the UI is never the only control — NFR-9 *(verified: granting one cashier `supplier.manage` turns their 403 into a 201)*
- [x][ ] A cashier account shows no cost price, no profit and no reports anywhere — release gate 7 *(asserted)*
- [x][ ] Navigation authorisation has one source of truth shared by shell and sidebar — `L-09`

---

## N · Audit — `FR-AUDIT`

### Functional
- [x][x] Entries capture actor, action, entity type and ID, before and after, outlet, terminal, IP, timestamp — FR-AUDIT-01 *(the view starts empty and shows the server's entries; it used to seed invented ones and keep them if the fetch failed)*
- [~][x] All listed actions logged: sign-in, sale, void, discount override, price change, adjustment, receipt, shift, cash movement, user and permission change, settings, reprint, export — FR-AUDIT-02 *(every action that exists now logs — shifts, cash, users, settings, customers and branch prices included. Reprint and export are the two that do not exist)*
- [x][x] Append-only; no application path edits or deletes an entry, including for the Owner — FR-AUDIT-03 · BR-15 *(database trigger; no write route exists, and the screen has no edit control)*
- [x][x] Filterable by actor, action, entity, outlet and date — FR-AUDIT-04 · `J-08` `J-09`
- [ ][x] Entries retained for the life of the system — FR-AUDIT-05 *(nothing prunes them; no delete path exists)*

### Non-functional
- [x][ ] The log is visually marked read-only — `J-08`

---

## O · Reports & dashboard — `FR-RPT`

### Functional
- [x][x] Owner dashboard: both outlets separately and combined — FR-RPT-01 · `B-01` *(the combined line is summed from the cards sent, so it always equals what is above it. **Both charts on it were literal arrays** — a fixed twelve-bar series and three hardcoded customer segments — and are now server-fed)*
- [x][x] Manager and cashier dashboards, scoped and operational — FR-RPT-02 · `B-02` `B-03` *(scoped by assignment on the server, not by a URL parameter)*
- [~][x] Every report filterable by outlet, date range, category, user and payment method — FR-RPT-03 · `I-16` *(the API takes all five; the screen offers outlet and date, so category, user and method have no control yet)*
- [x][x] All fifteen reports present with real data — FR-RPT-04 · `I-02`…`I-15` *(aggregated over every row, not over what the browser had loaded — which is what made a year-to-date total mean "the last hundred receipts")*
- [x][x] Profit and cost figures only for `report.view_profit` — FR-RPT-05 *(not computed rather than not displayed: without it the field is absent from the response)*
- [x][x] Monetary figures calculated from stored frozen costs, never current prices — FR-RPT-06 · BR-5 *(asserted: receiving stock at triple the price does not restate an old sale)*
- [-][-] Export to Excel and PDF — FR-RPT-07 *(Stage 2; CSV export exists)*

### Non-functional
- [x][·] Dashboard loading skeleton and first-run empty state — `B-04` `B-05`
- [x][·] Report empty state offers to widen the range — `I-17` *(and a failure state, so an empty table never reads as "no sales")*
- [ ][ ] Report queries perform acceptably against a full year of sales — NFR-1 *(not measured — needs a year of seeded sales to mean anything)*

---

## P · Settings — `FR-SET`

### Functional
- [x][x] Business profile: legal name, trading name, contact details — FR-SET-01 · `K-02`
- [~][~] Logo upload and persistence — FR-SET-01 *(the URL is stored and served; there is no upload endpoint, so the picture has to already live somewhere)*
- [x][x] Per-outlet settings: name, address, phone, receipt footer, reorder defaults, receipt prefix — FR-SET-02 · `K-03` `K-04` *(the reorder default applies when a product first gets a level at that branch, and never overwrites one somebody chose)*
- [x][x] Accent colour from a preset palette or hex, with live preview; orange default; no blue — FR-SET-03 · `K-06` *(validated as `#RRGGBB` by the schema and the request; the same Appearance section now persists a 90–130% font scale and an allowlist of five safe font stacks)*
- [x][·] Accent applied as a CSS custom property; semantic colours fixed and unaffected — FR-SET-04 *(how a colour is applied is the browser's business; the server stores which colour)*
- [~][~] Terminal settings: printer, paper width, test print, auto-print — FR-SET-05 · `K-07` *(paper width and auto-print are stored; the printer itself waits on the hardware — see I)*
- [x][x] Operational thresholds: idle lock, adjustment approval, cash variance, discount ceilings — FR-SET-06 · `K-08` *(and **read by the rules**: FR-CASH-06, FR-INV-06, FR-POS-10 and FR-AUTH-05 each take their number from here)*
- [x][x] Backup status, last successful backup, restore history — FR-SET-07 · `K-09` *(the screen reads `GET /api/backups`: live recovery point, whether the copy left the machine, and every run with its failure reason in full. "Healthy" requires off-site, so a local-only shop is told so rather than shown green)*
- [~][ ] Data export of all business data on request — FR-SET-08 · `K-10` *(the JSON snapshot is the browser's own records; a server-side export of everything is still open)*

---

## S · Expenses, P&L and installment plans

Not in the original Stage 1 scope — the frontend carried both screens and neither
had a server. Built on request, because an entry that vanishes on refresh is not
a feature somebody can use.

### Functional
- [x][x] Operating expenses recorded, amended and removed, with the date the money was spent *(the date is the spend date, not the entry date: a September P&L has to include rent typed in October)*
- [x][x] Expense removal keeps the row — a filed P&L has to keep reproducing *(voided, never deleted)*
- [x][x] Period totals and the per-category breakdown come from the database *(paid and owed counted apart: an unpaid invoice has not reduced the bank balance)*
- [x][x] Profit & loss: revenue, cost of sales, gross profit, operating expenses, net profit — `report.view_pl`
- [x][x] Installment plans with a generated schedule, persisted in full *(the customer can be handed the whole schedule on day one)*
- [x][x] Payments apply to the oldest unpaid installment first and spill forward *(so "what is overdue" stays answerable)*
- [x][x] Outstanding balance computed, never stored *(cannot drift from the payments)*
- [x][x] Overpayment refused, and the message says what is actually outstanding
- [x][x] A plan written off stops accepting money — needs `settings.general` as well as `customer.credit`
- [·][x] Overdue computed from today rather than stored *(a stored flag is wrong every morning until something runs)*

### Permissions
- [x][x] `expense.view` and `expense.manage` are their own codes *(the screen was gated on `cash.movement`, so anyone who could bank the takings could read the payroll)*
- [x][x] `report.view_pl` is separate from `report.view_profit` *(gross profit is trading; net profit is the whole cost base)*
- [x][x] `customer.credit` authorises the installment routes *(it had been a placeholder since week 1 with nothing behind it)*
- [x][x] BR-11 throughout: pesewas on the wire, one rounding rule, installments sum to the balance exactly

### Non-functional
- [·][x] NFR-9 · Every permission is enforced by an endpoint or inside an operation, or named as not-yet-built with the reason — `PermissionEnforcementTest` *(reads the real handler methods; verified to fail when the enforcement is removed)*
- [·][x] Per-user grant and revoke honoured on real endpoints — FR-USER-03 *(granting `expense.view` to one cashier opens the read and not the write)*

### Non-functional
- [x][ ] Changing the accent updates every accent surface, with no blue anywhere — release gate 11 *(621 literals migrated; asserted)*
- [x][ ] The accent is a single token; no hard-coded accent hex in any component — NFR-15
- [x][x] Settings sections are absent without their permission — `L-09` *(and the server refuses the write regardless of what the screen draws)*

---

## Q · Connectivity & resilience — `FR-SYNC`

> **Read this section against the topology, not the PRD.** FR-SYNC was written for
> PRD §2.2's original shape — both shops talking to one cloud database, with a queue
> in the browser to survive dropouts. The implementation plan superseded that with
> **local-first**: the server runs on the counter PC, beside its own Postgres, so the
> till never crosses a network to record a sale. Several FR-SYNC items are moot in
> that shape rather than outstanding, and are marked `[·]` with the reason.
>
> What is *not* moot: power loss, and the outbound push to the owner's consolidator.

### Functional
- [x][·] Catalogue and prices cached locally so search and scanning work regardless of connection — FR-SYNC-01 *(the catalogue is on the same machine; there is nothing to cache)*
- [·][·] Sales recorded locally and queued during a connection loss — FR-SYNC-02 *(a sale is already written locally — the queue existed to cross a network that is no longer between the till and its database)*
- [x][x] Queued sales retain receipt numbers from the pre-allocated block — FR-SYNC-03 · BR-6 *(blocks are issued and gapless; nothing depends on a connection)*
- [~][ ] Persistent non-blocking banner shows offline status — FR-SYNC-04 · `C-33` *(the banner now means "the owner's view is stale", not "you cannot sell"; it has not been re-pointed)*
- [·][·] On reconnection the queue is submitted in order, idempotently — FR-SYNC-05 · BR-7 · `C-34` *(no queue; BR-7 idempotency is built and tested on the sale itself)*
- [·][·] Conflicts surfaced on an exceptions report, never silently resolved — FR-SYNC-06 *(conflicts arose from offline sales racing the server; with one writer per outlet there is no race)*
- [ ][ ] Abrupt power loss does not corrupt data or lose a committed sale — FR-SYNC-07 · NFR-5 *(**still fully in scope.** Power cuts are routine; this is a UPS plus a proven Postgres durability setting, and neither has been done)*
- [-][-] Full-day offline operation with reconciliation — FR-SYNC-08 *(Stage 3)*

### Non-functional
- [x][·] Counter functions tolerate dropouts without interrupting trade — NFR-4 *(the counter does not use the internet to trade)*
- [·][·] Disconnect mid-sale, reconnect: exactly one correct sale at the server — FR-SYNC acceptance · release gate 10 *(gate rewritten below — there is no "at the server" any more)*

### What replaces them — the owner's view
- [ ][ ] Each shop pushes a snapshot outbound to the consolidator on an interval, retrying through outages — Phase 1
- [ ][ ] The owner's dashboard shows staleness per shop: *"Radiance — last seen 2 hours ago"* — Phase 1
- [ ][ ] A shop that cannot reach the consolidator keeps trading and nobody at the counter notices — Phase 1

---

## R · Cross-cutting non-functional — `NFR`

### Performance
- [x][ ] NFR-1 · Product search under 300 ms at 3,000 products; scanned line renders under 100 ms *(catalogue half proved; scanner render is a separate POS measurement)*
- [ ][ ] NFR-2 · Sale completion under 1 s on a normal connection
- [ ][ ] NFR-3 · Receipt begins printing within 1 s

### Availability & durability
- [ ][ ] NFR-4 · Counter tolerates 15-minute dropouts
- [ ][~] NFR-5 · No committed sale lost on abrupt power loss *(a sale commits in one transaction — receipt number, lines, payments and stock together; not yet tested by pulling the plug)*
- [x][x] NFR-6 · Automated daily off-site backup, 30-day retention, documented and **tested** restore *(`pg_dump -Fc` every 15 min, S3-compatible upload for R2; two-tier pruning — every copy for 2 days, then one a day to 30. Documented in `restore.sh`, tested by `BackupRestoreTest`, which dumps a real database, destroys it and puts it back with the script's own arguments)*
- [x][x] NFR-7 · Recovery point 15 minutes, recovery time 4 hours *(the interval is the recovery point, and the screen reports the **live** one rather than the configured target. Recovery time is minutes of `pg_restore` on a shop's database; the rest of the four hours is reaching the shop with a machine)*

### Security
- [ ][~] NFR-8 · Passwords bcrypt/argon2, PINs hashed separately, TLS on all traffic *(Argon2id with separate PIN encoder; TLS is a deployment matter, not yet configured)*
- [ ][x] NFR-9 · Server-side authorisation on every endpoint *(`@PreAuthorize` on every mutating route; unauthenticated is 401, unpermitted is 403)*
- [ ][x] NFR-10 · Rate limiting on authentication and approval endpoints *(sign-in, unlock and counter overrides, checked before any hash work)*

### Usability & accessibility
- [ ][ ] NFR-11 · A cashier reaches competence on core selling in one training session
- [ ][ ] NFR-12 · Core selling requires no mouse
- [~][ ] NFR-13 · Latest Chrome and Edge on Windows 10/11; tablet browsers for stock functions
- [~][ ] NFR-14 · 4.5:1 contrast, keyboard-reachable controls, 44 px touch targets *(contrast verified on the sign-in hero; not audited app-wide)*

### Maintainability & data
- [x][ ] NFR-15 · The accent is a single token, no hard-coded accent hex
- [x][x] NFR-16 · A third outlet is configuration only *(outlet_id on every table; adding one needs no schema change)*
- [·][x] NFR-17 · Nightly job reconciles stock against movement sums and reports drift *(scheduled at 02:30; `drift()` had existed since F with nothing calling it — the quiet way a requirement gets marked done)*
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
