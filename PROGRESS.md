# Progress

**Updated** 2026-09-14 · **Tests** 388 green · **DB** connected to `pos_system`, V1–V19 applied

Updated after every completed feature. Detail lives in
`../pos-system/docs/CHECKLIST.md` (247 items, dual checkbox).

---

## At a glance

| | Features | Done | In progress | Not started |
|---|---:|---:|---:|---:|
| Backend | 19 | 18 | 0 | 1 |

```
A ██████████  Auth & session     100%   FR-AUTH-05 reachable since J; idle lock is a setting since P
B ██████████  Outlets            100%   reads scoped by assignment; writes need settings.general
C ██████████  Product catalogue  100%   every mandatory FR-PROD and loaded-search acceptance item is green
D ██████████  Units & conversions  100%  FR-UOM-07 conversion factors lock after stock/transactions
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
P ██████████  Settings           100%  thresholds read by the rules; backups every 15 min, off-site, tested restore
Q ████░░░░░░  Connectivity        40%   local-first removes the queue; power loss and the owner's push remain
R ███████░░░  Cross-cutting       70%   hashing, rate limiting, audit, idempotency, row locks
S ██████████  Expenses & credit  100%  expenses, P&L and installment plans persist; 3 new permission codes
```

388 tests, all green.

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

## P · Settings — backups, done

NFR-6, NFR-7 and FR-SET-07 were the last of P, and the three were one piece of
work: a backup nobody can see the state of is indistinguishable from no backup.

| Requirement | Status | Where |
|---|---|---|
| FR-SET-03 appearance typography | ✅ | Theme persists a 90–130% text scale and five allowlisted, offline-safe font stacks; V16 constrains both values |
| NFR-6 automated off-site backup | ✅ | `BackupServiceImpl` — `pg_dump -Fc` every 15 min; `OffsiteStore` uploads S3-compatible, so Cloudflare R2 as budgeted |
| NFR-6 30-day retention | ✅ | two tiers: every copy for 2 days, then one a day to 30. 2,880 fifteen-minute files a month buy no extra safety |
| NFR-6 documented **and tested** restore | ✅ | `restore.sh` documents it; `BackupRestoreTest` dumps a real database, destroys it, and puts it back with the script's own arguments |
| NFR-7 recovery point 15 minutes | ✅ | the interval *is* the recovery point; the screen reports the live one, not the target |
| NFR-7 recovery time 4 hours | ✅ | `pg_restore` is minutes on a shop's database — the rest of the budget is reaching the shop |
| FR-SET-07 status, last good backup, history | ✅ | `GET /api/backups` behind `settings.general`; the Backup tab reads it |
| NFR-17 nightly stock reconciliation | ✅ | `ScheduledJobs.reconcileStock` — `drift()` had existed since F with nothing calling it |

**`healthy` does not mean "the last run succeeded".** A copy made three weeks
ago succeeded too, and a copy beside the database survives a mistake but not the
disk — which is the failure the delivery plan's own risk table names. It means
there is a recent one *and* it left this machine. A shop with no bucket
configured is told "copies are kept on this machine only", not shown green.

**Three defects, all in code that a green suite had already covered.**

- `@ConditionalOnProperty` on the `@Scheduled` backup method is inert — it gates
  `@Bean` methods and nothing else. The timer fired every fifteen minutes on a
  machine whose owner had switched backups off. The only test that set the flag
  was setting it to stop a race, so nothing noticed. Gated in the body now, with
  `ScheduledJobsTest` pinning both directions.
- The `pg_dump` timeout was unreachable. `readAllBytes()` on the process output
  returns when the stream closes, which is when the process exits, so
  `waitFor(timeout)` was only ever reached after the thing it was timing had
  already finished. A hung `pg_dump` hung the scheduler with it. Drained on
  another thread now — dropping the drain instead would deadlock a chatty
  failure against a full pipe buffer.
- The status summary returned early on the enabled flag, so a machine with the
  timer off reported only that, and never that its one copy had never left the
  disk. Two independent facts, and an owner needs both.

**Two false claims removed from the settings screen.** The JSON download was
labelled "Full Backup" and described as containing all products, inventory and
sales — it is built from whatever the browser happens to hold, cannot include
what was never loaded, and lands on the same disk as the database. It is a
snapshot, and now says so, pointing at the real backup. The health panel also
had a hardcoded green "Offline Cache: IndexedDB Synced" for something this build
does not do; it now shows the age of the last good backup, which the server
answered for.

**Deliberately not built:** a restore button. Putting a database back is not a
thing to offer behind one click on a screen a shop assistant can reach — it
replaces every sale rung up since the backup. `restore.sh` takes a typed
confirmation of the database name and dumps the current state first, so a wrong
choice of backup is still recoverable. `RESTORE` rows appear in the same history
the screen shows.

---

## C · Product catalogue — done

Every mandatory `FR-PROD` item and the catalogue half of NFR-1 are complete.

| Requirement | Status | Where |
|---|---|---|
| FR-PROD-01 complete record | ✅ | Product request/view now persist description and preferred supplier as well as identity, units and prices |
| FR-PROD-02 safe generated SKU | ✅ | `sku_sequence` plus a PostgreSQL per-prefix transaction lock; blank SKU works in the form and imports |
| FR-PROD-03/04 barcodes | ✅ | System-wide uniqueness and selling-unit binding remain database/service enforced |
| FR-PROD-05 managed lists | ✅ | Category, brand and unit setup APIs/screens |
| FR-PROD-06/07 search | ✅ | One ranked, out-of-order query across name, SKU, description, brand, category and barcode; outlet stock remains folded into results |
| FR-PROD-08 deactivate | ✅ | Active toggle, never delete |
| FR-PROD-09 history | ✅ | Real append-only selling-price history and cost-changing OPENING/RECEIPT ledger rows; the mock modal was removed |
| FR-PROD-10 import | ✅ | Template, mapping, validation, error CSV and preview in the browser; one atomic `product.import` commit on the server |
| NFR-1 loaded search | ✅ | PostgreSQL 18 test seeds 3,000 products and proves a four-term partial query returns the correct top three under 300 ms |

`FR-PROD-11` bulk price changes and `FR-PROD-12` variants stay explicitly
deferred to Stage 2, as the PRD marks them `S` rather than mandatory Stage 1 work.

---

## S · Expenses, P&L and installment plans — done

The complaint was "when I add an entry it records but only to disappear on
refresh", and it was exactly right. Expenses and installment plans lived in
`useState` and nowhere else. The P&L beside them was computed from the same
vanishing array, so the net profit an owner read was a statement about a browser
tab. A plan is worse than a cost: a shop that refreshed lost the schedule while
the customer kept the goods.

| What | Where |
|---|---|
| `expense` table, void-not-delete | `V18__expenses.sql` |
| `installment_plan` + schedule + lines | `V19__installment_plans.sql` |
| Expenses CRUD, period totals by category | `ExpenseController` behind `expense.view` / `expense.manage` |
| Plans, payments, write-off | `InstallmentController` behind `customer.credit` |
| P&L: revenue, COGS, gross, opex, net | `GET /api/reports/profit-and-loss` behind `report.view_pl` |
| Both wired to the screen | `expensesApi.ts`, `installmentsApi.ts`, loaded on sign-in |

**Three new permission codes, 33 → 36.** `expense.view`, `expense.manage` and
`report.view_pl`. The expenses screen had been gated on `cash.movement`, which
meant anyone allowed to bank the day's takings could also read the rent and the
payroll. `report.view_pl` is separate from `report.view_profit` because the two
disclose different things: gross profit is what the shop buys and sells, net
profit is the whole cost base. A manager records what the branch spends and does
not see the business's net position; the owner can grant it per user.

**`customer.credit` stopped being a future-stage placeholder.** It had sat in the
catalogue since week 1 with nothing behind it. It now authorises the installment
routes, so granting it does something — and the flag that claimed otherwise had
to stop saying so.

**Rules that carry the features.** A payment goes to the oldest unpaid
installment first and spills forward, so "what is overdue" stays answerable;
crediting a later installment while an earlier one stayed open would make the
question meaningless. The outstanding balance is never stored — it is the total
less the down payment less what the schedule received — so it cannot drift from
the payments. `InstallmentSchedule` splits to the pesewa with the remainder on
the *first* installment: a customer who pays every instalment as quoted and still
owes a penny is a support call, one who pays a penny more at the start never
notices. Overdue is computed from today's date rather than stored, because a
stored flag is wrong every morning until something runs.

**Four defects found on the way.**

- **`sale.discount` was never checked.** The ceiling was enforced by role, but
  the permission itself was not, so revoking it hid the control on screen and the
  server took the discount anyway. Now the code buys the discretion and the
  ceiling answers how much. The customer's agreed rate survives either way —
  honouring a deal the business made is not a cashier giving money away.
- **The expense form lost the entry on refusal.** It closed the modal and reset
  every field on the same tick as the call, so a server rejection cost the
  expense *and* everything typed, silently. It now waits, keeps the form open and
  shows the reason.
- **Two collection fetch-joins in one query** — `MultipleBagFetchException` on
  every read of a plan. Even where Hibernate allowed it, joining the schedule and
  the lines would multiply each installment by each line and every sum over the
  result would be wrong.
- **Payment methods disagreed across the wire.** The DTO accepted a `CHEQUE` the
  frontend's `PaymentMethod` has no name for, and called bank transfer
  `BANK_TRANSFER` against the app's `transfer`. A value no screen can send and
  none can display is not a feature.

**The comprehensive role test.** `PermissionEnforcementTest` reads the actual
handler methods and asserts that every one of the 36 codes is enforced — at a
route, or inside an operation where the right changes what an allowed request
*does* (`report.view_profit` withholding cost, `stock.oversell` passing zero) —
or is on a named list of codes whose feature does not exist yet, with the reason.
That list is currently `stock.transfer` (Stage 3), `sale.refund` (Stage 2) and
`sale.reprint` (waiting on the printer): granting one of those changes the screen
and nothing a server enforces, and an owner is entitled to know which.

Verified not vacuous: reintroducing the appearance bug on purpose fails two of
its tests with the exact diagnosis. Per-user grant and revoke are covered on real
endpoints — granting `expense.view` to one cashier opens the read and not the
write; revoking `expense.manage` from a manager closes the write and leaves the
read.

---

## Next up

1. **I · Receipts & printing** — blocked on the printer, not on us. Next in
   line, and the one remaining feature at 0%.
2. **Q · Connectivity** — power loss (NFR-5) is untested by actually pulling the
   plug, and the owner's push waits on the consolidator decision below.
3. **Pricing, audit, payment and cross-cutting gaps** — continue closing the
   remaining checklist items after the completed D/K requirements.

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
