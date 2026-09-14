# Progress

**Updated** 2026-09-14 · **Tests** 330 green · **DB** connected to `pos_system`, V1–V14 applied

Updated after every completed feature. Detail lives in
`../pos-system/docs/CHECKLIST.md` (189 items, dual checkbox).

---

## At a glance

| | Features | Done | In progress | Not started |
|---|---:|---:|---:|---:|
| Backend | 18 | 15 | 2 | 1 |

```
A ██████████  Auth & session     100%   FR-AUTH-05 reachable since J; idle lock is a setting since P
B ██████████  Outlets            100%   reads scoped by assignment; writes need settings.general
C █████████░  Product catalogue   90%   FR-PROD-10 bulk import needs SKU blocks
D █████████░  Units & conversions  90%   FR-UOM-07 lock-once-stock-exists still open
E ██████████  Pricing            100%  branch overrides, customer levels; cost no longer leaks
F ██████████  Inventory          100%   FR-INV-06 enforced against P's threshold
G ██████████  Point of sale      100%   discount ceiling enforced; gates 3 and 4 pass
H █████████░  Payments            90%   denomination shortcuts are frontend-only
I ░░░░░░░░░░  Receipts & printing  0%   blocked on the thermal printer
J ██████████  Shifts & cash      100%   blind close, BR-13 by index, BR-14 computed; gate 9 passes
K ████████░░  Suppliers & receipt  80%   purchase history per product still to query
L ██████████  Customers          100%   shared directory, phone lookup, pricing and cross-outlet history
M ██████████  Users & permissions 100%  BR-16 on every path that changes a privilege
N █████████░  Audit               90%   every built action logs; read endpoint and view live
O ██████████  Reports & dashboard 100%  aggregated by the database; FR-RPT-05 withholds cost, not hides it
P ████████░░  Settings            80%   thresholds live and read by the rules; backup/export open
Q ████░░░░░░  Connectivity        40%   local-first removes the queue; power loss and the owner's push remain
R ███████░░░  Cross-cutting       70%   hashing, rate limiting, audit, idempotency, row locks
```

295 tests, all green.

---

## Foundations — done

| Item | Detail |
|---|---|
| Project scaffold | Boot 4.1.1 · Java 25 · Maven wrapper, no local `mvn` needed |
| Contract vectors | 81 vectors generated from the frontend, read by **both** suites |
| Database tests | Testcontainers defaults to PostgreSQL 18; local cached-image override is `-Dtest.postgres.image=...` |
| `rules/` ported | `Money` `Quantity` `Costing` `ReceiptSequence` `Permission` `Role` |
| Database | `pos_system` on localhost, role `giftedlabs`, **V1 applied** |
| Deployment config | `counter` / `consolidator` profiles; Railway `DATABASE_URL` + `PORT` handled |
| Security baseline | Argon2id, separate PIN hashing, session-cookie policy, CSRF, CORS |

**Two bugs found and fixed in the frozen frontend:**
`roundMoney(1.005)` returned 1.00 where `BigDecimal.HALF_UP` gives 1.01 — the
`Number.EPSILON` nudge is useless near 100. Same bug in `roundQuantity`, which
feeds cut lengths and therefore stock levels.

---

## A · Authentication & session — done

| Requirement | Status | Where |
|---|---|---|
| FR-AUTH-01 sign in with username or email | ✅ | `AuthController` → `SessionServiceImpl.establish` |
| FR-AUTH-02 PIN for counter approvals | ✅ | `verifyApprovalPin` |
| FR-AUTH-03 outlet selection / auto-placement | ✅ | `place` |
| FR-AUTH-04 screen lock without ending shift | ✅ | `SessionServiceImpl` lock/unlock; 423 while locked |
| FR-AUTH-05 idle timeout locks, not signs out | 🟨 | `SessionGuardFilter` is written and tested; the shift branch is unreachable until J sets `OPEN_SHIFT`, which is only ever written `false` today |
| FR-AUTH-06 rate limiting + logging | ✅ | `InMemoryLoginAttemptService` |
| FR-AUTH-07 password reset by administrator | ✅ | `PasswordResetServiceImpl.resetByAdministrator`; refuses self-reset |
| FR-AUTH-07 self-service reset by email | ✅ | Resend over HTTPS; needs a key and a verified domain to send |
| FR-AUTH-08 deactivated user, clear message | ✅ | `AuthenticationServiceImpl`; revoked mid-session by `SessionGuardFilter` |
| NFR-8 separate password and PIN hashing | ✅ | `PasswordEncoderConfig` |
| NFR-10 rate limiting on auth endpoints | ✅ | checked *before* any hash work |
| BR-15 audit log | ✅ | `V2__authentication.sql`, append-only by trigger |

**37 tests**, all naming their requirement — 27 at the service layer, 10 on the
HTTP contract.

**Two defects the service suite could not see.** Both lived in the filter
chain, which answers before any controller and so never reaches
`ApiExceptionHandler`: unauthenticated callers got a bodiless 403 from
Spring's fallback entry point, and a wrong unlock PIN was indistinguishable
from a dead session. A green suite stayed green through both because every
test stopped at the service layer. `AuthControllerTest` now drives the real
chain.

**Known gap, not a blocker.** The lockout key is the raw identifier, so an
account with an email address has two independent attempt budgets. Case is
normalised; the username/email split is not.

---

## Next up

1. **O · Reports** — the dashboard computes its own figures from whatever
   lists happen to be loaded, which is fine at one outlet and wrong at two.
   It is also the one place an owner would notice a number being wrong last.
2. **E · Pricing** — the overrides and the margin pair. `product_price_history`
   already records who changed a price and when; nothing reads it back.
3. **I · Receipts & printing** — blocked on the printer, not on us.

---

## Blocked / needs a decision

| What | Needed from | Blocks |
|---|---|---|
| **Consolidator in scope, or separate quote?** | Client | Owner has no combined view until it ships. PRD §1.2 promises it. Config and profile are written; no push or ingest code. |
| **One instance, or one per shop?** | You | The plan says one instance per shop on each counter PC. Everything built so far is a single database holding both outlets — one product list, one customer list, stock tagged per outlet. Two instances means those stop being shared unless something replicates them, which is not built and not quoted. See the note below. |
| ~~**31 vs 33 permission codes**~~ | *Taken* | Kept all 33 with `stock.transfer` and `customer.credit` flagged `futureStage`. Removing them meant amending the frozen contract and its vectors now and restoring them later; keeping them costs nothing, since no endpoint checks a code whose feature does not exist. Reversal instructions are on `Permission.isFutureStage()`. |
| **Acceptance criterion 4 is unsatisfiable** | You | One terminal per outlet + per-outlet stock = the two terminals can never contend. Reword to goods-receipt-vs-sale. |
| **Stage 2 features expected live?** | Client | Installments, returns, expenses are in the frontend but out of Stage 1 |
| **Thermal printer ordered?** | You | Acceptance criterion 2 cannot close without one |

---

## The topology question

The PRD (§2.2) describes a **cloud-hosted single system, every record tagged to an
outlet**. The implementation plan settled on **local-first — one instance per shop on
the counter PC** — which is what makes the till immune to the internet.

Everything built so far is the first shape: one database, `outlet_id` on every row,
one product list, one customer list, users assigned to outlets, stock per outlet.
That is deliberate and it is what the requirements ask for — AS-5 (one shared product
list), AS-6 (shared prices with per-outlet override), FR-CUST-05 (customers shared
across both outlets), FR-CUST-06 (history across both).

Those requirements and "one instance per shop" cannot both hold without replication
between the two shops. The only sync in the plan is the outbound snapshot to the
consolidator, which is explicitly a summary and needs no replication.

So one of two things is true, and it is the client's call:

**A · One system of record, packaged.** The instance lives at the main shop (or in the
cloud); the second counter runs the same packaged app pointing at it. Everything above
stays true as built. The main shop never depends on the internet. The second shop does
— which the PRD already accepts ("long outages stop that outlet", §2.2) and already
prices as a risk ("full offline quotable separately", §Risks).

**B · One instance per shop.** Matches the packaging plan exactly, and both shops
trade through any outage. But the product list, the price list and the customer list
become per-shop copies, and keeping them in step is bidirectional replication — real
work, not currently quoted, and the source of every hard bug in this class of system.

Recommended: **A**. It is what the requirements describe, it is what is built, and it
puts the connectivity risk on the one shop the PRD already flagged rather than
introducing a replication problem to avoid it.

---

## Deviations from the PRD

Recorded so nobody treats them as drift.

| Deviation | Why |
|---|---|
| No `role` / `permission` / `role_permission` tables | The catalogue is the `Permission` and `Role` enums, which are asserted against the contract vectors. A table would be a second source of truth free to drift from what the server authorises with. |
| UUID primary keys, `outlet_id` everywhere, `synced_at` | Free now, expensive to retrofit. Makes merging two shops into one cloud DB an insert rather than a migration. |
| Prices `NUMERIC(12,4)`, not `BIGINT` pesewas | BR-11's integer rule governs stored *amounts*, not per-unit *rates*. `3 × 18.335` settles to 55.01; rounding the price first gives 55.02. |
