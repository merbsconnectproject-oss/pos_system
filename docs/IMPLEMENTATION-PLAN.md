# Stage 1 Implementation Plan — Backend

**Drawn** 2026-09-12 · **Against** PRD v1.0 · `blueprint.html` · `CHECKLIST.md` v1.0
**Supersedes** `DELIVERY-PLAN.md`, which assumed a cloud-hosted Express/Node backend.

---

## How this document works

There are three documents and they do different jobs. Do not duplicate between them.

| Document | Answers | Changes when |
|---|---|---|
| `PRD (1).md` | **What** the system must do | Client agrees a scope change |
| `blueprint.html` | **How** it is built and why | An architectural decision is revisited |
| `CHECKLIST.md` | **Whether** a feature is done — 189 items, dual checkbox | Every working session |
| **This file** | **When**, and in what order | Weekly, at the Friday exit check |

`CHECKLIST.md` is the progress tracker. It already carries a backend column against
every item, currently all zeros. **This plan does not restate those items** — it
sequences them and names the gate each week has to pass.

### Marking progress

Tick the backend box in `CHECKLIST.md` as work lands:

```
- [x][x] Multiple barcodes per product — FR-PROD-03 · D-06
   ^  ^
   |  backend: done and verified
   frontend: done
```

An item is complete only when **both** boxes are `[x]`. A week is complete only when
its exit statement is true — not when its tasks look finished.

---

## Fixed decisions

Settled in `blueprint.html`. Listed here so no week re-opens them.

| | |
|---|---|
| Language / runtime | Java 25 (LTS) · Spring Boot 4.1.1 · JVM, not native |
| Persistence | PostgreSQL 18 · Flyway owns DDL · Spring Data JPA + `JdbcTemplate` for reports |
| Topology | **Local-first.** One instance per shop on the counter PC |
| Frontend | Existing React 19 build, served from inside the JAR |
| Printing | In-process via `javax.print`, no separate service |
| Packaging | `jpackage` Windows MSI with bundled JRE + Postgres |
| Hosting | None for Stage 1. Nightly `pg_dump` to Cloudflare R2 |
| Owner dashboard | Consolidator, **outside these six weeks** — see §Phase 1 |

---

## Lanes

| Lane | Owner | Scope |
|---|---|---|
| **A** | Agent | Schema, migrations, money and stock paths, weighted average cost, idempotency, receipt blocks, reports |
| **B** | You | Client decisions, product data, hardware, printer, Postgres installer, R2 account |
| **C** | Agent | Auth and permission enforcement, frontend integration, printing, packaging |

Lane B is the one that blocks the others. Its week-1 items are not optional.

---

## Week 0 — done

Completed before the six weeks start. Recorded so it is not repeated.

- [x] `pos-api` scaffolded — Boot 4.1.1, Java 25, Maven wrapper (no local `mvn` needed)
- [x] **`money.ts` rounding fixed.** The `Number.EPSILON` nudge failed near 100, where the gap between doubles (~1.4e-14) exceeds EPSILON. `1.005` rounded **down** to 1.00 where `BigDecimal.HALF_UP` gives 1.01. Same bug found and fixed in `roundQuantity`, which governs cut lengths and therefore stock levels
- [x] `npm run check` still passes — 41 barcodes, 32 products, all assertions green
- [x] **`test-vectors.json` generated** — 81 vectors across BR-4, BR-6, BR-11, BR-12 and the §6 matrix, emitted by `npm run gen:vectors`, never hand-written
- [x] `rules` package ported to Java — `Money`, `Quantity`, `Costing`, `ReceiptSequence`, `Permissions`, with no Spring or JPA dependency
- [x] `RulesVectorTest` reads the same vector file the frontend does
- [x] `V1__identity.sql` — UUID keys, `outlet_id`, `synced_at`

---

## Week 1 — Foundations · decisions due

**Lane A**
- [ ] `V2__seed_permissions.sql` — 33 codes, 4 role baselines
- [ ] `V3__catalogue.sql`, `V4__inventory.sql` from PRD §7.2–7.3
- [ ] JPA entities for identity; Testcontainers Postgres green in CI

**Lane B — blocking, do these first**
- [ ] **Order the thermal printer.** Cheapest de-risking available; criterion 2 cannot close without it
- [ ] Answer: is the consolidator in scope or a separate quote? (§Phase 1)
- [ ] Answer: are Stage 2 features the client has seen in the frontend — installments, returns, expenses — expected live?
- [ ] Confirm counter PC specs and Windows version
- [ ] Cloudflare R2 bucket + API token

**Lane C**
- [ ] Argon2id password hashing; separate PIN hashing — NFR-8
- [ ] Sessions, rate limiting on auth and approval endpoints — NFR-10
- [ ] `@PreAuthorize` over the 33 codes; resolution with per-user overrides — FR-USER-03
- [ ] Append-only audit log — BR-15

**Decisions to settle**
- [ ] **31 vs 33 permission codes.** `permissions.ts` has 33; PRD §6 documents 31. Extras are `stock.transfer` (Stage 3) and `customer.credit` (Stage 2). Owner currently holds both, mirroring the frontend. Either accept that, or grant neither and amend `contract-check.ts` (it asserts Owner holds every code) and regenerate vectors
- [ ] **Reword acceptance criterion 4** — unsatisfiable as written, see §Acceptance

> **Exit** · A cashier signs in against the local API and is refused a manager-only
> endpoint **by the server**. Both suites read the same vector file and pass.

---

## Week 2 — Catalogue, stock, backups

**Lane A**
- [ ] Products, units, conversions, unit-bound barcodes — `CHECKLIST` C, D
- [ ] `stock_level` + `inventory_movement`; goods receipt in one transaction with weighted average cost — F, K
- [ ] Price history, per-outlet price overrides — E

**Lane B**
- [ ] Product data template issued to the client
- [ ] Postgres unattended install proven on a clean Windows machine

**Lane C**
- [ ] Import endpoint reusing the frontend's validation rules — FR-PROD-09/10
- [ ] Adjustments, write-offs, approval threshold — FR-INV
- [ ] **Nightly `pg_dump` → R2, working and verified** — moved forward from week 6

> **Exit** · Receiving 3 drums of 100 m cable moves stock to 300 m against the real
> database, quantity equals the sum of its movements, and last night's dump is in R2.

---

## Week 3 — Selling · hardest week

**Lane A**
- [ ] `sale`, `sale_item`, `payment`; idempotency on both UUIDs — BR-7
- [ ] Atomic decrement with `@Lock(PESSIMISTIC_WRITE)` and availability check — BR-8
- [ ] Receipt number issued from the terminal's pre-allocated block — BR-6
- [ ] Cost frozen onto the sale line — BR-5

**Lane B**
- [ ] Mobile money merchant account and statement format confirmed
- [ ] Discount ceilings, floor-price policy, variance threshold set

**Lane C**
- [ ] Void with reversing movements — BR-3
- [ ] Below-floor approval recorded on the sale — BR-10
- [ ] Flagged oversell path — BR-9
- [ ] Held carts — `held_sale`, not sales

> **Exit** · A goods receipt on a tablet and a sale at the till, hitting the same
> product at the same moment, produce one correct outcome. The same sale submitted
> twice records once.

---

## Week 4 — Cash, parties, reporting

**Lane A**
- [ ] The **sixteen** reports from frozen costs — gross profit, COGS, discount and void logs — O
  - ⚠️ `FR-RPT-04` names sixteen. `DELIVERY-PLAN.md` says fifteen. Recount before scoping
- [ ] Owner and manager dashboards — FR-RPT-01/02

**Lane B**
- [ ] Product data loaded into a staging database
- [ ] Receipt layout signed off against PRD §9

**Lane C**
- [ ] Shifts, blind count, variance, cash movements, end of day — J, BR-14
- [ ] Customers and suppliers — L, K

> **Exit** · A blind close records variance against the cashier, demands a note past
> the threshold, and the day reconciles per outlet.

---

## Week 5 — Integration & printing

**Lane A**
- [ ] Pagination, query performance; search under 300 ms at 3,000 products — NFR-1
- [ ] API hardening; every endpoint permission-checked — NFR-9

**Lane B**
- [ ] Draft training material from the real screens

**Lane C**
- [ ] **Every view off `mockData` onto the API** — loading, error and retry throughout
- [ ] ESC/POS output on the real printer; per-terminal config; reprints — I
- [ ] Vite build served from the JAR; kiosk shortcut

> **Exit** · No component imports `mockData`, and a full day of trading can be done
> against a real receipt printer.

---

## Week 6 — Packaging & acceptance

**Lane A**
- [ ] Nightly stock reconciliation job — NFR-17
- [ ] **A restore actually performed** into a scratch database, and recorded
- [ ] All twelve acceptance criteria scripted and repeatable

**Lane B**
- [ ] Synthetic 3,000-product catalogue for the performance run
- [ ] Both counter PCs ready to receive the installer

**Lane C**
- [ ] `jpackage` MSI — bundled JRE, chained Postgres install, Windows service, first-run wizard
- [ ] Security pass on every endpoint

> **Exit** · A clean Windows machine goes from MSI to a printed sale with no developer
> present. Power pulled mid-sale, the committed sale survives exactly once.

---

## Acceptance

Twelve criteria from PRD §11. Two need restating before week 6, not during it.

⚠️ **Criterion 4 is unsatisfiable as written.** *"Two terminals attempting to sell the
last unit produce one sale and one clear refusal."* One terminal per outlet (`AS-4`),
`stock_level` keyed on `(product_id, outlet_id)`, and non-overlapping catalogues mean
the only two terminals in the system can never touch the same row.

> **Proposed** · *A goods receipt and a sale hitting the same product at the same outlet
> simultaneously produce one correct stock level, or a clear refusal if stock is
> insufficient.*

That tests the same lock on a collision that genuinely occurs — the storekeeper
receiving goods on a tablet while the cashier sells.

⚠️ **Criterion 10 needs restating.** There is no network in the sale path any more, so
"disconnect mid-sale" is now a power cut. Restate against `NFR-5`: pull power mid-sale;
on restart the committed sale is present exactly once and the uncommitted one left no
trace.

---

## Phase 1 — the consolidator · outside these six weeks

The owner's combined view. `FR-RPT-01` asks for five figures per outlet — a summary,
not a drill-down — so it needs no replication.

- Each shop POSTs a snapshot every 15 minutes. **Outbound only**, per-outlet token
- The same JAR in the cloud under a `consolidator` profile
- ~3–5 days · ~$60/year on Railway Hobby
- Dashboard must show staleness: *"Radiance — last seen 2 hours ago"*

Until it ships the owner sees one shop at a time. PRD §1.2 promises the combined view
in its opening paragraph, so **this needs written sign-off in week 1**, not a
conversation at handover.

---

## Risks

| Risk | Mitigation |
|---|---|
| Counter PC disk failure loses a shop's history | R2 upload built week 2, proven at both shops before go-live |
| Money rules drift between Java and TypeScript | Shared `test-vectors.json`; neither side owns private expectations |
| Client expects the combined dashboard at handover | Written sign-off, week 1 |
| No printer to develop against | Order week 1 |
| Stage 2 features assumed in scope because the frontend has them | Settle week 1 |
| Updates require site visits | Version check in-app; remote sessions budgeted into the deployment window |
| Week 5 integration runs long | Integrate view by view from week 4 as endpoints land |

---

## If it slips

Cut in this order. All defensible; none touches money correctness.

1. **The sixteen reports down to the six the owner uses daily.** The rest are scope creep by enumeration
2. **First-run wizard → a hand-filled config file.** You are installing on exactly two machines
3. **`FR-RPT-07` export to Excel and PDF** — already marked `S`, Stage 2

**Do not cut** backups, the rules vectors, or printing. Those fail silently or fail expensively.
