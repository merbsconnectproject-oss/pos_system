# Progress

**Updated** 2026-09-14 · **Tests** 156 green · **DB** connected to `pos_system`, V1–V4 applied

Updated after every completed feature. Detail lives in
`../pos-system/docs/CHECKLIST.md` (189 items, dual checkbox).

---

## At a glance

| | Features | Done | In progress | Not started |
|---|---:|---:|---:|---:|
| Backend | 18 | 4 | 0 | 14 |

```
A ██████████  Auth & session     100%   FR-AUTH-05's shift branch waits on J to set the flag
B ██████████  Outlets            100%   reads scoped by assignment; writes need settings.general
C ████████░░  Product catalogue   80%   FR-PROD-07 and -10 wait on F and on SKU blocks
D █████████░  Units & conversions  90%   FR-UOM-07 waits on F for something to check against
E ░░░░░░░░░░  Pricing              0%
F ░░░░░░░░░░  Inventory            0%
G ░░░░░░░░░░  Point of sale        0%
H ░░░░░░░░░░  Payments             0%
I ░░░░░░░░░░  Receipts & printing  0%
J ░░░░░░░░░░  Shifts & cash        0%
K ░░░░░░░░░░  Suppliers & receipt  0%
L ░░░░░░░░░░  Customers            0%
M ░░░░░░░░░░  Users & permissions  0%
N ░░░░░░░░░░  Audit                0%
O ░░░░░░░░░░  Reports & dashboard  0%
P ░░░░░░░░░░  Settings             0%
Q ██████████  Connectivity        n/a   local-first removed the offline queue
R █████░░░░░  Cross-cutting       50%   auth hashing, rate limiting, config, audit log
```

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

1. **F · Inventory** — `stock_level` and `inventory_movement`, with the
   weighted-average cost of BR-4. Four items across C and D are waiting on
   it: FR-PROD-07 (stock on search results), FR-UOM-07 (lock a conversion
   factor once stock exists), cost history, and goods receipt. It is also
   what makes `ProductView` able to carry the per-outlet maps the frontend's
   `types.ts` expects.
2. **E · Pricing** — per-outlet overrides on top of the price history that
   C already records.
3. **FR-PROD-10 · bulk import** — the endpoint reuses the frontend's
   validation rules, but needs SKU blocks first: `generateSku` counts rows,
   which is right for hand entry and wrong for two importers running at
   once. Allocate a block the way BR-6 does for receipts.
4. **M · Users & permissions** — blocked on the 31-vs-33 decision below.

---

## Blocked / needs a decision

| What | Needed from | Blocks |
|---|---|---|
| **Consolidator in scope, or separate quote?** | Client | Owner has no combined view until it ships. PRD §1.2 promises it. |
| **31 vs 33 permission codes** | You | `permissions.ts` has 33, PRD §6 documents 31. Extras are `stock.transfer` (Stage 3) and `customer.credit` (Stage 2). Owner currently holds both. Settle before B, not before M: every controller from B onward hardcodes codes into `@PreAuthorize`, so the cost grows with each feature. |
| **Acceptance criterion 4 is unsatisfiable** | You | One terminal per outlet + per-outlet stock = the two terminals can never contend. Reword to goods-receipt-vs-sale. |
| **Stage 2 features expected live?** | Client | Installments, returns, expenses are in the frontend but out of Stage 1 |
| **Thermal printer ordered?** | You | Acceptance criterion 2 cannot close without one |

---

## Deviations from the PRD

Recorded so nobody treats them as drift.

| Deviation | Why |
|---|---|
| No `role` / `permission` / `role_permission` tables | The catalogue is the `Permission` and `Role` enums, which are asserted against the contract vectors. A table would be a second source of truth free to drift from what the server authorises with. |
| UUID primary keys, `outlet_id` everywhere, `synced_at` | Free now, expensive to retrofit. Makes merging two shops into one cloud DB an insert rather than a migration. |
| Prices `NUMERIC(12,4)`, not `BIGINT` pesewas | BR-11's integer rule governs stored *amounts*, not per-unit *rates*. `3 × 18.335` settles to 55.01; rounding the price first gives 55.02. |
