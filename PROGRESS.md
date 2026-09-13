# Progress

**Updated** 2026-09-12 · **Tests** 107 green · **DB** connected to `pos_system`, V1 applied

Updated after every completed feature. Detail lives in
`../pos-system/docs/CHECKLIST.md` (189 items, dual checkbox).

---

## At a glance

| | Features | Done | In progress | Not started |
|---|---:|---:|---:|---:|
| Backend | 18 | 0 | 1 | 17 |

```
A ██████░░░░  Auth & session      60%   credential checks done; HTTP session binding remains
B ░░░░░░░░░░  Outlets              0%
C ░░░░░░░░░░  Product catalogue    0%
D ░░░░░░░░░░  Units & conversions  0%
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
R ███░░░░░░░  Cross-cutting       30%   auth hashing, rate limiting, config
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

## A · Authentication & session — in progress

| Requirement | Status | Where |
|---|---|---|
| FR-AUTH-01 sign in with username or email | 🟨 | Credentials verify, but `AuthController` does not yet persist the authenticated principal in the HTTP session |
| FR-AUTH-02 PIN for counter approvals | ✅ | `verifyApprovalPin` |
| FR-AUTH-03 outlet selection / auto-placement | ✅ | `place` |
| FR-AUTH-06 rate limiting + logging | ✅ | `InMemoryLoginAttemptService` |
| FR-AUTH-08 deactivated user, clear message | ✅ | `AuthenticationServiceImpl` |
| NFR-8 separate password and PIN hashing | ✅ | `PasswordEncoderConfig` |
| NFR-10 rate limiting on auth endpoints | ✅ | checked *before* any hash work |
| **FR-AUTH-04 screen lock without ending shift** | ⬜ | needs `ScreenLockService` |
| **FR-AUTH-05 idle timeout locks, not signs out** | ⬜ | needs shift state (blocked on J) |
| **FR-AUTH-07 password reset by administrator** | ⬜ | |
| **FR-AUTH-07 self-service reset by email** | ⬜ | ⚠️ no mail transport chosen |
| **BR-15 audit log** | ⬜ | table not yet created |

**12 tests**, all naming their requirement.

---

## Next up

1. **Finish A** — bind successful sign-in/outlet selection to the Spring Security
   session, then `FR-AUTH-04`, `FR-AUTH-07`, and audit log. `FR-AUTH-05` needs
   shift state, so it waits for J.
2. **B · Outlets** — small, and C/F/G all depend on it.
3. **C + D · Catalogue and units** — the biggest single chunk.

---

## Blocked / needs a decision

| What | Needed from | Blocks |
|---|---|---|
| **Consolidator in scope, or separate quote?** | Client | Owner has no combined view until it ships. PRD §1.2 promises it. |
| **31 vs 33 permission codes** | You | `permissions.ts` has 33, PRD §6 documents 31. Extras are `stock.transfer` (Stage 3) and `customer.credit` (Stage 2). Owner currently holds both. Decide before M. |
| **Acceptance criterion 4 is unsatisfiable** | You | One terminal per outlet + per-outlet stock = the two terminals can never contend. Reword to goods-receipt-vs-sale. |
| **Stage 2 features expected live?** | Client | Installments, returns, expenses are in the frontend but out of Stage 1 |
| **Thermal printer ordered?** | You | Acceptance criterion 2 cannot close without one |
| **Mail transport for FR-AUTH-07** | You | Self-service password reset |

---

## Deviations from the PRD

Recorded so nobody treats them as drift.

| Deviation | Why |
|---|---|
| No `role` / `permission` / `role_permission` tables | The catalogue is the `Permission` and `Role` enums, which are asserted against the contract vectors. A table would be a second source of truth free to drift from what the server authorises with. |
| UUID primary keys, `outlet_id` everywhere, `synced_at` | Free now, expensive to retrofit. Makes merging two shops into one cloud DB an insert rather than a migration. |
| Prices `NUMERIC(12,4)`, not `BIGINT` pesewas | BR-11's integer rule governs stored *amounts*, not per-unit *rates*. `3 × 18.335` settles to 55.01; rounding the price first gives 55.02. |
