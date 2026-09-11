# Stage 1 Delivery Plan — Six Weeks to Software Complete

**Drawn:** 2026-09-10 · **Against:** PRD v1.0, SCREEN-INVENTORY.md v1.0, FRONTEND-READINESS-AUDIT.md

**Stack:** Express/Node + Postgres on Railway · React on Cloudflare Pages · local ESC/POS print service on each counter PC

**Starting position:** frontend 95%, API contract frozen and machine-checked (`npm run check`), backend 0%.

**Scope:** software complete and tested. Installation, training and go-live are scheduled separately
as the *deployment window* (§7), because they cannot start until hardware is on site and the client's
catalogue exists.

---

## Verdict

Six weeks with three lanes in parallel. It works because the frontend is built and the contract is
frozen, and because installation is out of scope — the two dependencies that weren't ours to control
(hardware and client data) no longer sit on the critical path.

The cost of the compression is that **week 6 carries the two hardest pieces** — the offline queue and
the print service — with no week behind it. That is why the queue is prototyped in week 3.

---

## 1. Lanes

Fixed for all six weeks so nobody waits on a mid-week handover.

| Lane | Owner | Scope |
|---|---|---|
| A | Me | Schema, migrations, money and stock paths, weighted average cost, idempotency, receipt blocks, reports |
| B | You | Railway/Cloudflare, open PRD decisions, product data, hardware, connectivity, client-facing work |
| C | Second agent | Auth and permission enforcement, frontend integration, offline queue, print service |

---

## 2. The six weeks

Each week ends on one testable statement. If it is not true on Friday, the plan has slipped.

### Week 1 — Foundations · decisions due
- **A:** Postgres schema and migrations from `types.ts` + `permissions.ts`; seed from `mockData.ts`; outlets, terminals, users, roles
- **B:** Railway project + managed Postgres; Cloudflare Pages; answers to the 7 open PRD questions; issue the product data template
- **C:** Argon2 password + separate PIN hashing; sessions; rate limiting; permission middleware over the 31 codes; append-only audit log

**Exit:** a cashier signs in against the deployed API and is refused a manager-only endpoint by the server, not the UI.

### Week 2 — Catalogue & stock
- **A:** Products, units, conversions, barcodes; `stock_level` + `inventory_movement`; goods receipt in a transaction with weighted average cost; price history
- **B:** Confirm connectivity at both shops; order printers and scanners; chase product data
- **C:** Import endpoint reusing the validation rules; adjustments, write-offs, approval threshold; low stock and exceptions

**Exit:** receiving 3 drums of 100 m cable moves stock to 300 m against the real database, and quantity equals the sum of movements.

### Week 3 — Selling · hardest week
- **A:** Sale, sale item, payment; idempotency on sale and payment UUIDs; atomic decrement with row lock and availability check; pre-allocated receipt blocks per terminal
- **B:** Confirm the MoMo merchant account and statement format; set discount ceilings and floor-price policy
- **C:** Void with reversing movements; below-floor approval recorded on the sale; oversell path flagged on exceptions; **offline queue prototype** — started here, not in week 6

**Exit:** two terminals racing for the last unit produce one sale and one clear refusal; the same sale submitted twice records once.

### Week 4 — Cash, parties, reporting
- **A:** The fifteen report queries from frozen costs; gross profit, COGS, discount and void logs
- **B:** Product data loaded into staging; receipt layout signed off
- **C:** Shifts, blind count, variance, cash movements; end of day per cashier/outlet/business; customers and suppliers

**Exit:** a blind close records variance against the cashier, demands a note past the threshold, and the day reconciles per outlet.

### Week 5 — Integration
- **A:** API hardening, pagination, query performance; search under 300 ms at 3,000 products
- **B:** Staging environment for the client; draft training material from the real screens
- **C:** Every view off mock state onto the API; loading/error/retry throughout; router and deep links; toasts; unsaved guards

**Exit:** no component imports `mockData`, and a full day of trading can be done in staging without touching seed data.

### Week 6 — Edges & acceptance · no week behind it
- **A:** Nightly stock reconciliation job; automated backups, retention, a restore actually run; all 12 acceptance criteria scripted and repeatable
- **B:** Synthetic 3,000-product catalogue for the performance run; production environment on Railway and Cloudflare ready to promote
- **C:** Offline queue finished — ordered replay, sync banner; local ESC/POS print service and Windows installer; security pass on every endpoint

**Exit:** network pulled mid-sale — the sale completes, prints, and arrives at the server exactly once when the connection returns; eleven of the twelve criteria pass on a green run.

---

## 3. What still gates us

Taking installation out of scope removes most of the client dependency. Three things remain, and only
one is expensive.

1. **One thermal printer on our own desk.** The cheapest thing that de-risks this plan. Without a physical ESC/POS device, acceptance criterion 2 — *a sale completed with the printer switched off is not lost and prints on retry* — cannot be signed off, and printing stays unknown until install day. Order it in week 1.
2. **The seven open PRD questions.** Less blocking than they were: the K-08 thresholds screen already makes discount ceilings, variance threshold and approval limits configuration rather than constants, so we ship defaults and the client changes them. The MoMo merchant account answer still shapes how reconciliation is presented — chase it in week 1.
3. **A realistic catalogue for the performance run.** NFR-1 wants search under 300 ms at 3,000 products. A synthetic catalogue of the right shape is generated in week 6; the client's real data belongs to the deployment window.

**What week 6 cannot close:** printing on real hardware, and reconciliation against a real mobile-money
statement. Eleven of the twelve acceptance criteria pass without the client; the twelfth needs a
printer, which is why the printer is worth buying now.

---

## 4. Stack decisions to make in week 1

- **Cross-origin auth.** Cloudflare frontend and Railway API are different origins. Either put the API behind a subdomain proxied through Cloudflare so session cookies stay first-party, or use short-lived tokens in memory with a refresh endpoint. Decide before any auth code is written.
- **The print service is not cloud software.** ESC/POS runs on the counter PC over USB — a separate Windows service with its own installer. Scheduled week 6 because it is the piece most often forgotten until install week.
- **Railway Postgres backups.** NFR-6 wants daily off-site backups, 30-day retention and a *tested* restore. The restore actually gets run in week 6.

---

## 5. Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Offline sync underestimated | Week 6 overruns with nothing behind it | High | Prototype the queue in week 3; if it isn't working by end of week 5, cut to short-dropout tolerance and say so |
| No printer to develop against | Printing untested; one criterion cannot close | High | Buy one thermal printer in week 1 |
| Frontend integration larger than a week | Week 5 spills into week 6, which has no slack | Medium | Integrate view by view from week 4 as endpoints land, not all at once in week 5 |
| Stage 2 features assumed in scope | Silent scope creep of weeks | Medium | Settle in week 1 — see §6 |
| Cross-origin auth reworked late | Auth rewritten mid-integration | Medium | Decide cookies-via-subdomain or in-memory tokens before any auth code in week 1 |
| Client data arrives during the build | Distraction, or a rushed early load | Low | Park it — it belongs to the deployment window |

---

## 6. Not in the six weeks

- **Installments, returns and refunds, expenses.** Already built in the frontend, which makes them easy to assume are included. They are Stage 2. If the client has seen them and expects them live, settle it in week 1.
- **Purchase orders, stock counts, bulk repricing, product variants.** Stage 2.
- **Stock transfers between outlets, VAT and E-VAT, cash drawer kick, SMS receipts, third outlet.** Stage 3.
- **Full-day offline operation.** Week 6 delivers tolerance for short dropouts, which is what the PRD asks for.

---

## 7. Parked: the deployment window

Two weeks that cannot start until hardware is on site and the client's catalogue exists. Scheduled,
not scoped out.

### D1 — Data & hardware · client-gated
**Prerequisites:** product catalogue filled into the template · counter PCs, printers and scanners installed · connectivity confirmed at both towns

**Work:** load the real catalogue via the import wizard · opening stock counted and entered · staff accounts and PINs created · print on real hardware, closing the last acceptance criterion

**Exit:** the owner signs off on their own products, prices and a receipt printed on their own printer.

### D2 — Installation · on site
- **Mon–Tue:** Inco Hardware — install, print service, test print; train cashier and storekeeper; supervised trading
- **Wed–Thu:** Radiance Lighting — same, with lessons from Inco applied; manager training on approvals, voids, end of day
- **Fri:** Owner training on dashboard and control reports; hypercare, snag fixes, handover

**Exit:** both shops close their own drawer on the system, and the owner sees both outlets on one dashboard.
