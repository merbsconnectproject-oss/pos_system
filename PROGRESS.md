# Progress

**Updated** 2026-09-26 · **Tests** 569 backend (3 skipped) + 95 frontend green · **DB** migrations V1–V34 validated

Updated after every completed feature. Detail lives in
`../pos-system/docs/CHECKLIST.md` (258 items, dual checkbox).

---

## At a glance

| | Features | Done | In progress | Not started |
|---|---:|---:|---:|---:|
| Backend | 20 | 20 | 0 | 0 |

```
A ██████████  Auth & session     100%   FR-AUTH-05 reachable since J; idle lock is a setting since P
B ██████████  Outlets            100%   reads scoped by assignment; writes need settings.general
C ██████████  Product catalogue  100%   every mandatory FR-PROD and loaded-search acceptance item is green
D ██████████  Units & conversions  100%  FR-UOM-07 conversion factors lock after stock/transactions
E ██████████  Pricing            100%  branch overrides, customer levels; cost no longer leaks
F ██████████  Inventory          100%   FR-INV-06 enforced against P's threshold
G ██████████  Point of sale      100%   discount ceiling enforced; gates 3 and 4 pass
H ██████████  Payments            100%  cash, split, reference-confirmed non-cash, exact settlement, change and duplicate protection are server-enforced
I █████████░  Receipts & printing 90%   layout, ESC/POS, both widths, audited reprints, preview; the Windows print service needs the hardware
J ██████████  Shifts & cash      100%   blind/manual close plus audited 23:00 automatic close; gates remain green
K ██████████  Suppliers & receipt  100%  supplier directory, outlet-scoped goods receipts, weighted-average costing, reversals, and supplier/product purchase history are API-backed and wired in the frontend
L ██████████  Customers          100%   shared directory, phone lookup, pricing and cross-outlet history
M ██████████  Users & permissions 100%  what a role grants is editable and persisted, and takes effect mid-session
N ██████████  Audit               100%  mutating actions and security events are recorded; read endpoint, pagination and acceptance coverage are live
O ██████████  Reports & dashboard 100%  every sales surface is net of returns
P ██████████  Settings           100%  thresholds read by the rules; backups every 15 min, off-site, tested restore
Q ██████████  Connectivity       100%  both channels built; Cloud Sync frequency is owner-configurable; power-loss recovery covered
R ██████████  Cross-cutting       100%  hashing, rate limiting, audit, idempotency, row locks, live permission refresh, CSRF, CORS and browser security headers
S ██████████  Expenses & credit  100%  expenses, P&L and installment plans persist; 3 new permission codes
T ██████████  Returns & swaps    100%  wired end to end; net of returns now reaches the takings and the P&L
```

569 backend tests green (3 skipped) across the full 2026-09-26 Testcontainers run,
including Cloud Sync scheduling and Windows installer acceptance checks; the last
recorded frontend contract and Vitest suite is also green (95 tests). Three live R2
checks remain on-demand because they require configured credentials.

---

## Foundations — done

| Item | Detail |
|---|---|
| Project scaffold | Boot 4.1.1 · Java 25 · Maven wrapper, no local `mvn` needed |
| Contract vectors | 81 vectors generated from the frontend, read by **both** suites |
| Database tests | Testcontainers defaults to PostgreSQL 18; local cached-image override is `-Dtest.postgres.image=...` |
| `rules/` ported | `Money` `Quantity` `Costing` `ReceiptSequence` `Permission` `Role` |
| Database | `pos_system` on localhost, role `giftedlabs`, **V1–V30 applied** |
| Deployment config | `counter` / `consolidator` profiles; Railway `DATABASE_URL` + `PORT` handled |
| Security baseline | Argon2id, separate PIN hashing, session-cookie policy, CSRF, CORS |
| Windows delivery | Offline x64 installer: embedded UI, private Java/PostgreSQL, service lifecycle, secure onboarding, diagnostics, upgrades and data-preserving uninstall; desktop and Start-menu launchers open a dedicated Edge/Chrome app window without browser chrome; response-file installs never block on an interactive completion dialog; CI reads the frontend from `Gifted-Labs/radiance-pos-frontend` through a read-only deploy key |
| Ubuntu delivery | Native `.deb`: embedded UI and Java 25 runtime, Ubuntu PostgreSQL, hardened systemd service, secure onboarding, desktop launcher and diagnostics |
| Commercial catalogue UI | POS category pills come from the database-managed catalogue; category, brand and unit renames use the styled in-app editor rather than a browser prompt |
| Refresh continuity | The current authorised workspace and open POS terminal survive a page refresh; state is scoped per user and cleared on sign-out |
| Automatic shift close | On counter deployments, any shift still open at the latest 23:00 `Africa/Accra` boundary is closed and audited; startup catches a boundary missed while the machine was off, while physical count and variance remain explicitly pending |
| Startup render safety | The shell renders while its outlet is still loading; missing browser assets are ordinary 404 responses rather than logged internal errors |
| Workspace motion | Every module shares a viewport-aware reveal system, softly elevated interactive surfaces and page transitions; reduced-motion preferences disable it without hiding content |
| Configurable Cloud Sync | Owners/admins choose the automatic upload interval in Settings › Cloud Sync from 15 minutes to 24 hours; manual sync stays immediate and failed attempts respect the chosen request cadence |

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
| NFR-6 automated off-site backup | ✅ | `BackupServiceImpl` — `pg_dump -Fc` every 15 min; `OffsiteStore` uploads S3-compatible, verifies the stored object with HEAD/size acknowledgement, and supports downloads for recovery |
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
| Immutable payment history + receipt facts | `V34__installment_payment_receipts.sql` |
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

**Installment receipts now survive the dialog.** Each collection has its own
database row, unique receipt number, amount, channel/reference, cashier and the
balance immediately after that payment. Reopening a plan shows those rows in
Payment History & Receipts, including legacy collections reconstructed from the
old schedule aggregates. Original prints and audited, visibly marked reprints
are rendered from the stored row and sent through the same in-process ESC/POS
endpoint as sale receipts; `window.print()` is no longer in this workflow.

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

## T · Returns and exchanges — done

Built 2026-09-15 on request. `ReturnsExchangesView` had no backend at all and
`sale.refund` authorised nothing; both are now real.

| What | Where |
|---|---|
| `sale_return` + items + per-outlet numbering | `V20__returns_and_exchanges.sql` |
| Restock / damaged write-off / supplier RMA | `ReturnDisposition`, each owning its movements |
| `CUSTOMER_RETURN`, `SUPPLIER_RETURN` | new `MovementType`s — adding them made the compiler reject an exhaustive switch, which is why the enum exists |
| Returns, exchanges, what-may-come-back | `ReturnController` behind `sale.refund` |

**Three rules carry it, all about refusing to recompute something already decided.**
The refund is at the price the customer *paid*, taken from the original line with
its discount — refunding a 20%-off purchase at today's ticket price loses the
difference on every return, with no report that would show it. The cost is the
cost frozen on that line (BR-5), so a return does not restate the margin of a sale
made months ago. And what has already come back is the cap, read from the returns
themselves, so nothing can be returned twice.

**An exchange is a return and an ordinary sale**, in one transaction. The
replacement goes through `SaleService` exactly as anything else does — its own
receipt number, its own movements, its own frozen cost. A second, half-featured
way to sell would have drifted from the real one within a month.

**A cash refund writes a drawer payout** (BR-13, BR-14). Without it the till is
short at close by exactly the refunds given, and a cashier is asked to explain a
variance they did not cause.

**Two defects found while building.** The return number had no outlet prefix, so
both shops would have produced `R000001` and collided the moment their returns met
in the owner's database — which is precisely what the sync channel does. And a
named approver was trusted from the request body; it is now verified against
`sale.refund`, because an id in a body is the client's claim.

---

## I · Receipts and printing — 98%

| Requirement | Status |
|---|---|
| FR-RCPT-02 ESC/POS, no browser dialogue | ✅ `EscPos` — init, code page 437, feed past the blade, partial cut |
| FR-RCPT-03 58mm and 80mm | ✅ 32 and 48 columns; the narrow roll gives the item name its own line rather than truncating it |
| FR-RCPT-04 content per PRD §9 | ✅ `ReceiptLayout`, rendered from the sale **as stored** |
| FR-RCPT-06 reprints marked and logged | ✅ band above the receipt details; `RECEIPT_REPRINTED` audited before the render |
| FR-RCPT-09 previewable at both widths | ✅ through the same layout the printer uses, so a preview cannot drift from the output |
| In-process local printing | ✅ Authenticated `/api/printing/receipt` submits server-rendered ESC/POS through `javax.print` to the configured OS queue; physically validated on `POS-80` with text, graphics, feed and cut |

**No browser printing for receipts.** Sale completion, retry, audited reprints and
credit notes all use the same-origin endpoint. Printer-offline and missing-queue
failures return a retryable error after the sale remains committed. The queue is
selected with `POS_PRINTER_NAME` (default `POS-80`).

**Cash overpayment survives onto the paper.** Checkout persists the amount the
customer actually handed over rather than replacing it with the bill total. The
server stores the difference, and the receipt spells the two figures out as
`Cash tendered` and `Change due`.

**The layout is asserted character by character without hardware** — 11 tests on
column width, right-aligned money, two decimals, trimmed quantities, the REPRINT
band's position, long names wrapping rather than being dropped. That is the only
way to test a receipt before the roll exists, and it is also where the fiddly part
lives.

**Rendered server-side on purpose.** A receipt assembled in the browser states
what the till believed rather than what was stored, and a reprint assembled that
way could differ from the original — the one thing a reprint must never do. The
test asserts the two are identical but for the band.

---

## What the last session found and fixed

Three defects, all found by the client testing rather than by the suite.

**Returns had no frontend.** The backend was built and tested, and I reported the
feature done — but `handleAddReturnRecord` still pushed into React state and
nothing loaded returns on sign-in, so they vanished on refresh. The same bug
class the expenses had. Now wired: posted to the server, listed on sign-in, and
the screen re-reads stock and the ledger rather than predicting them.

**Every return failed with "tell a manager".** The returns screen invented a
customer id of the form `cust-1757…`, which is not a UUID, so the body could not
be read at all — the request never reached the returns code, which is why no row
was ever written. Worse, there was **no handler for an unreadable body**: it fell
through to the catch-all and produced a 500 telling a cashier to fetch a manager,
for what is a 400. Any malformed value anywhere in the API did this. Now a 400
that names the field.

*(A trap worth recording: the first two attempts at that handler compiled and
silently never matched. Spring 7 here uses **Jackson 3 — `tools.jackson`** — and
the Jackson 2 `com.fasterxml` exception classes type-check perfectly against
nothing.)*

**Returns did not reach the takings.** `sale_return` appeared nowhere in
`ReportServiceImpl`, so a shop could sell GH₵200, refund GH₵80, and every sales
figure still read GH₵200. The summary now carries `refundTotal`, `refundCount`
and `netRevenue`, and the P&L is built on the net figure.

Gross is kept beside net deliberately — takings of 10,000 with 3,000 returned is
a different month from takings of 7,000 with none.

**The cost side is the subtle half.** A restocked return reverses its cost: the
goods were not sold after all. A written-off one does not — the shop still paid
for stock it no longer has. Reversing both would quietly hide write-off losses
inside the margin. Both are tested.

---

## Q · Connectivity — both channels built

R2 verified live against `s3://pos-system/` — write, read, list, and an absent key
coming back empty rather than throwing, which is the ordinary first-run state.

| | |
|---|---|
| Config down | `ConfigurationChannel` — outlet, business profile, thresholds, staff (hashes included, so a shop authenticates its own people offline) and the catalogue it carries |
| Transactions up | `SyncServiceImpl` — incremental batches keyed on `synced_at`, zero-padded so lexical order is chronological order |
| Ingest | `json_populate_record` rebuilds each row; UUID keys make a repeat a no-op |
| Foundations | `V22` — `product_outlet`, `product.origin`, the missing `synced_at` on `product_outlet_price`, `sync_batch`, `sync_sequence`, `sync_watermark` |

**Rows are serialised by Postgres and rebuilt by Postgres.** Hand-mapping fifteen
tables in both directions would be thirty places for a column added later to be
forgotten, and the failure would be silent — a field that simply stopped
arriving.

**Four defects the round-trip test found**, none of which a unit test would have:

- **The audit log cannot be stamped.** Its trigger refuses every UPDATE, which is
  the point of BR-15 — a log somebody can write to is not a log. Weakening the
  trigger for one column would trade a real guarantee for convenience, so the
  position is kept beside it in `sync_watermark` instead.
- **`sync_batch` was unique on the object key alone.** One instance that both
  sells and receives writes a batch and later reads it back; those are two facts
  about the same object, and keying on the object made the second silently do
  nothing — so every batch was ingested again on every run.
- **The stored payload's timestamp format was inherited.** The injected Jackson 2
  mapper has no time module, and this is a file read back later by another
  instance, so the format is now pinned as an ISO string rather than left to
  whatever the HTTP mapper happens to be configured with.
- **A push writes an audit row, so the next push carries it.** Not a bug — the
  owner should see that a shop is syncing — but it means the backlog converges to
  one rather than zero, and the test says so rather than asserting a zero that
  would never arrive.

**Nothing here is on the selling path.** Every route is something a person
presses; if the bucket is unreachable the till does not notice.

---

## FR-USER-02 — role permissions are editable now

Reported by the client: assigning permissions to a role reset, and had no effect.
Both were true, for two different reasons.

**The Save button called `setState`.** `onUpdateRolesPermissions={setRolesPermissions}`
— nothing reached the server, and the editor re-seeded from its unchanged props,
which is the reset. **And underneath there was nowhere to save to**: role
baselines were the `Role` enum, fixed at compile time.

That was a decision recorded in this file, and the client was right to push back
on it. An owner who is away should be able to let a senior cashier approve
something without waiting for a release.

**`role_permission` is now the runtime authority**, seeded at startup from the
enum. The enum keeps the job it is good at — defining which permissions *exist*,
a vocabulary the code switches on — and supplies the defaults and the reset. The
original worry was "a second source of truth free to drift"; the answer is that
there is one authority at runtime and the defaults live in exactly one place.
Seeding happens in Java rather than in the migration for that reason: a hundred
INSERTs in SQL would have been the drift.

It is a **replace, not a merge** — taking a right away has to be as possible as
giving one — and it takes effect **mid-session**, because the guard filter
re-resolves per request. Both are tested with two live sessions.

Still missing: there is no per-user permission editor anywhere in the UI.
`usersApi.setPermission` and its endpoint both exist and are tested, and nothing
calls them.

---

## FR-RCPT — one renderer for every slip

Asked for after the client noticed the documents did not match.

A return now prints through **the same layout as the sale it reverses** — same
shop block, same rules, same right-aligned money — titled `CREDIT NOTE` or
`EXCHANGE NOTE` so a customer holding two slips can tell them apart. An exchange
names the receipt for the replacement goods, so the pair can be put together.

**Every printed amount now carries a currency.** It is the currency *code*, not
the symbol: code page 437 cannot render GH₵ and it would come out as two pieces
of rubbish, while a bare `310.00` is the other failure. The screen keeps the
symbol; the roll gets `GHS`.

---

## Two features that had never worked

Both were built without tests. Writing the tests was what found them — neither
had ever succeeded once, on any machine.

**Holding a sale failed with a 500 every time.**
`cart_json` is `jsonb`; the entity mapped it as a plain `String` with
`columnDefinition = "jsonb"`, which only matters if Hibernate generates the
schema. Flyway owns DDL here, so it did nothing, the driver sent a `varchar`
into a `jsonb` column, and Postgres refused. `@JdbcTypeCode(SqlTypes.JSON)`
fixes it; the column stays queryable, because "which parked carts contain this
product" is a question somebody will ask.

**Creating a till failed with a 500 every time.**
The audit log writes in its own transaction (`REQUIRES_NEW`, so a failure cannot
take the record of the attempt down with it) — so it could not see a terminal
the outer transaction had not committed, and the foreign key refused every
insert. The audit now names the terminal as `entity_id` and leaves `terminal_id`
null: a till being created is not yet a till anything was done *at*. This one
also meant **no second till could be added to a branch**, and BR-6 receipt
blocks are allocated at till creation.

I had previously reported held sales as working, on the strength of the whole
stack existing. It did exist; it just never ran.

---

## CI — two repositories, not one

`pos-api` and `pos-system` are separate repositories. A workflow at the project
root would have been tracked by neither and never run, so each has its own:

- `pos-api` — the suite against real PostgreSQL through Testcontainers. **No
  remote yet**, so nothing triggers it.
- `pos-system` — typecheck, contract assertions, build, and a **staleness check**
  that regenerates the vectors and fails if the committed file differs. Without
  it somebody changes a rule, forgets to regenerate, and the backend discovers it
  later in a different repository.
- `verify.sh` at the root runs both. Tracked by neither, because it spans them.

`gen:vectors` wrote to both repositories, which is right side by side and wrong
in CI where only one is checked out. It now writes the sibling copy only when it
is actually there.

---

## Next up

1. **I · Receipts & printing** — software receipt generation, preview, ESC/POS
   layouts and audited reprints are complete; physical printer validation remains.
2. Release packaging and an on-site hardware acceptance pass.

---

## Blocked / needs a decision

| What | Needed from | Blocks |
|---|---|---|
| ~~**Consolidator in scope, or separate quote?**~~ | *Taken* | **Replaced by R2.** The hosted consolidator API is dropped; the owner runs the same application and pulls transaction batches from a bucket. Nothing to host, and the `pos.consolidator.*` config it would have used was never built. Still to build: the publish/pull on both channels. |
| ~~**One instance, or one per shop?**~~ | *Taken* | **One per shop**, with the owner running the same application and Cloudflare R2 as a one-way postbox between them. Settled by three facts about the client: the two shops sell largely different ranges, the overlap is small but real, and the second outlet's internet cannot be relied on to sell. Written up in `../pos-system/docs/ARCHITECTURE-topology-and-sync.md`. |
| ~~**31 vs 33 permission codes**~~ | *Taken* | Now **36**. The three added with the accounting module are all enforced. `customer.credit` stopped being a placeholder when installment plans got endpoints; `stock.transfer` is the last code flagged `futureStage`. `PermissionEnforcementTest` fails if any code is grantable with nothing behind it. |
| **Acceptance criterion 4 is unsatisfiable** | You | One terminal per outlet + per-outlet stock = the two terminals can never contend. Reword to goods-receipt-vs-sale. |
| **Returns / swaps expected live?** | Client | **Expenses and installment plans shipped 2026-09-14** and are no longer in question. Returns and exchanges are the last of the Stage 2 trio: `ReturnsExchangesView` has no backend and `sale.refund` authorises nothing. The owner has asked to see swaps in the combined view, which cannot happen until they are built. |
| **Thermal printer ordered?** | You | Acceptance criterion 2 cannot close without one |

---

## The topology question — settled 2026-09-15

**One instance per shop.** The owner runs the same application, holding both outlets; Cloudflare R2
carries configuration down and transactions up. Every channel is one-way, so nothing in the design
needs conflict resolution.

What settled it: the two shops sell largely different ranges (so there is no shared catalogue to keep
in step), the electrical shop carries a few hardware lines (so the overlap is real and those products
keep one shared id), and the second outlet's connection cannot be relied on to make a sale.

This amends PRD assumptions AS-5 and AS-6, which described one shared product list and shared prices.
Neither describes this client. The full record, including what each channel carries and why the
alternatives were rejected, is in `../pos-system/docs/ARCHITECTURE-topology-and-sync.md`.

Two things it leaves open: whether stock physically moves between the shops (`stock.transfer` is
unbuilt), and swaps/returns, which the owner wants to see and which have no backend.

---

## Deviations from the PRD

Recorded so nobody treats them as drift.

| Deviation | Why |
|---|---|
| No `role` / `permission` / `role_permission` tables | The catalogue is the `Permission` and `Role` enums, which are asserted against the contract vectors. A table would be a second source of truth free to drift from what the server authorises with. |
| UUID primary keys, `outlet_id` everywhere, `synced_at` | Free now, expensive to retrofit. Makes merging two shops into one cloud DB an insert rather than a migration. |
| Prices `NUMERIC(12,4)`, not `BIGINT` pesewas | BR-11's integer rule governs stored *amounts*, not per-unit *rates*. `3 × 18.335` settles to 55.01; rounding the price first gives 55.02. |

---

## Purchase orders, and a permission that could never arrive — 2026-09-15

**FR-SUP-08 is built.** Draft → sent → closed or cancelled. The lines freeze the
moment the order is sent, because a delivery variance measured against an order
somebody edited afterwards is not a variance.

The decision the whole feature turns on: **received is never stored.** It is
summed on read from the confirmed goods receipts pointing at the order. A
received column would be a second copy of the deliveries, and the first reversal
would put the two out of step — with the order claiming goods the ledger says
never arrived. Partial and over-delivery therefore need no state at all; both are
the same subtraction. Over-delivery is recorded rather than refused: the goods are
already on the shelf.

Deliveries are compared in **base units**, so 300 m loose counts against 3 drums
ordered. Comparing purchase units would have reported a phantom shortage of three
drums standing next to 300 m of real stock.

**`sync.push` is a new, 37th permission code.** Sending the day up is not the same
right as changing the business: pushing is one-way, additive and audited, while
pulling configuration rewrites the counter's staff and can move its outlet id.
Status and push now sit behind `sync.push`; publish, pull and ingest stay with
`settings.general`. Cashiers hold it by default, so whoever locks up can send the
day without an owner present — though the scheduled push has already sent it.

### Three things found on the way

- **A new permission code could never reach a running shop.** The seeder ran only
  `if (role_permission is empty)`, which is correct exactly once. Seeding
  unconditionally would have been worse — it would restore, on every restart,
  every grant an owner deliberately revoked. `role_permission_seeded` (V26) now
  records which codes have ever been *offered*, and each is handed to its default
  roles once. `RolePermissionSeedingTest` pins both halves.
- **`goods_receipt_line` was in no channel.** The owner received delivery
  documents with nothing on them — no product, no quantity, no cost.
- **`supplier` travelled in neither direction.** Every goods receipt a shop pushed
  failed its foreign key at the owner, silently. Suppliers now travel up: a shop
  creates its own, and they are not head-office reference data like the catalogue.
  V27 also makes supplier names unique **per outlet** — they were globally unique,
  so both shops buying from Melcom meant the second shop's row was refused on the
  *name* index, which `on conflict (id)` never catches.

---

## Closing the checklist — 2026-09-16

Everything on the list that could be built has been. Four items remain open and
none is code: three wait on the thermal printer, and one is training a person.

**NFR-1, catalogue search: 307–442 ms → 75 ms.** It had failed most builds for
weeks and I had been calling it flaky. It was not flaky; it was a sequential scan.
The per-term matching sits inside a correlated `NOT EXISTS` over a set-returning
function, so the trigram indexes from V4 were never reachable and every one of
3,000 products was tested against four terms and six fields. V28 adds a
`search_text` column holding everything the search looks at, and one pre-filter
predicate the planner *can* answer. The predicate is semantically redundant — the
first term has to match anyway — so it changes the plan and no result.

Worth recording what the measurement actually showed: at 3,000 rows Postgres still
scans, even with fresh statistics, and the gain is entirely the cheap predicate
running before the expensive one. The index earns its keep at 30,000 rows on a
selective term (measured in a scratch container: Bitmap Index Scan). I nearly
shipped a comment claiming the index was doing the work.

**NFR-1, reports over a year: series 1,256 ms → 44 ms.** `ReportPerformanceTest`
seeds 14,600 sales across 365 days. Five of six reports came in under 130 ms; the
dashboard series took 1.2 s because it ran a lateral subquery per bucket, and
`date_trunc(created_at) = bucket` inside it cannot use an index — so a year's chart
scanned the sale table 365 times. Grouping once and joining to the buckets fixed
it, with all 22 report tests unchanged.

**NFR-5, power loss: now evidence rather than reasoning.** `PowerLossTest` kills
the database with SIGKILL, restarts it, and asserts the committed sale, its lines,
its payment and the receipt sequence all survived. It also pins `fsync`,
`synchronous_commit` and `full_page_writes` on — the realistic way this requirement
gets lost is somebody turning one off to make the till feel quicker. Testcontainers
runs with `fsync=off` by default, which the first run caught.

**NFR-4, dropouts: answered architecturally.** `CounterIndependenceTest` walks the
import graph from the class that completes a sale and fails if anything reachable
can leave this machine. Verified it can fail by pointing it at a class that *is* in
the path.

**NFR-12, no mouse.** The POS search results were clickable only. ↑↓ now choose,
Enter adds, Enter completes the payment and Escape returns to the cart.

**Frontend tests exist.** 40 under Vitest — money rounding and exact comparison,
receipt numbering and block exhaustion, role visibility, scan detection, weighted
average cost, outlet scoping. Run by `npm test`, `npm run check`, `verify.sh` and
CI. End-to-end browser tests remain absent and are recorded as such rather than
hidden behind the tick.

**Two defects found while closing items rather than by looking for them:**

- The blind cash count was cleared the moment it was submitted. When the server
  refused — which it does when the variance passes the threshold with no note —
  the cashier's figure was already gone, and a blind count is the one number they
  cannot reconstruct. The screen now holds the count until the server accepts it
  and shows the reason.
- Outlet scoping was written out by hand in every list. Now one tested rule,
  `belongsToOutlet`, which also settles that a record with no outlet stays visible
  from every branch.

**496 backend tests, 40 frontend, all green.**

---

## Reports, discounts and the last of the unreachable APIs — 2026-09-23

Seven things were built or repaired. Three of them were defects a client
demonstration would have hit, and two of those had been reported as done.

### The cart discount never reached the server

`PosModal` offered a discount on the whole bill, reduced the total it asked the
customer to pay, and took the money. `salesApi.complete` then sent the server
only the *line* discounts. The server priced the sale from the lines, found the
payment short of its own total, and refused the sale — so every discounted bill
failed with "payments do not settle", naming a problem the cashier did not have.

The concession now travels as its own field and is **apportioned across the
lines**, largest remainder first, so the pesewas add back to exactly what was
given. Apportioning rather than holding it on the header is the whole design:
the receipt, a partial return, the discount report and the margin on a product
all read the line, and the first reader to forget a header-level discount would
refund a customer more than they paid. `sale.cart_discount` and
`sale_item.cart_discount_share` (V31, V32) record where it came from so the
discount report can still tell a cashier marking one item down from a manager
taking a figure off the bill.

Past the seller's ceiling the till now asks for a manager's PIN rather than
silently reducing the figure to what they may give — the cashier typed 20, the
screen showed 10, and the customer was told a number nobody had agreed to.

### A discount could walk a line under the floor

BR-10 was checked against the price as entered, and the discount subtracted
afterwards. So the way around the floor was to ring the line at list price and
discount to wherever you liked: at a 100% owner ceiling, anywhere at all, with
nobody asked. The floor is now measured against the price the customer actually
pays. One existing test had been quietly relying on the hole — it asked for a
60% discount on a line whose floor was half the list price, and had been
asserting only the ceiling error.

The ceiling is checked before the floor, deliberately: when a discount breaks
both, "that is more than you may give" is the answer a cashier can act on.

### Customer discounts applied on one path in four

`priceFor` was correct and `handleCustomerPhoneLookup` called it. The other
three ways to attach a customer — picking from the list, creating one at the
till, continuing without one — set the customer and left the cart at retail. So
a contractor created at the counter paid retail, and a trade customer detached
afterwards left *their* prices behind for the next walk-in. One
`attachCustomer` now does both halves everywhere. The bill discount is also
cleared after a sale; it used to stand until somebody noticed at the cash-up.

The rules moved to `discounts.ts` with 20 tests. A rule about money that only
one call site obeys is not a rule.

### The analytics screen stated things it could not know

`AnalyticsReportsView` posted to `/api/analytics/ai-inference`, a route that
exists only in `pos-system/server.ts` — the Vite dev server, which the
installers do not ship. In a real shop the call always failed and the screen
always rendered its `catch` branch: a financial health score of **88, graded
A**, "Radiance Lighting captures highest ticket value (GH₵ 1,245/order)", an
ageing panel captioned "GH₵ 18,200 funded customer financing", and an action
plan promising "GH₵ 8,500 Cash Released". Identical on every counter in every
shop. The charts beside it carried real server figures, which made the invented
half impossible to pick out rather than easy.

Replaced by `insights.ts`: every sentence derived from a figure the server
returned, nothing emitted when the figures do not support it, and no
cost-derived observation at all for a reader without `report.view_profit`. 13
tests. The Gemini endpoint and the `@google/genai` dependency are gone — an
offline-first till had no business holding either.

`OutletComparisonView` was worse and less obvious: each branch was **seeded**
with a literal revenue, order count and margin — Radiance Lighting opened at
GH₵34,850 on 28 orders at 40% — and the session's real sales were added to it.
Any line without a recorded cost fell back to 70% of its selling price. Every
comparison on the screen was therefore a comparison of two seeds. It now reads
`reports/summary`, `breakdown`, and `stock` per branch, and the commentary
column names whichever branch actually leads, or says nothing.

### FR-RPT-03 had three of its five filters unreachable

The reports API has taken outlet, date, category, user and payment method since
it was written. The screen offered two, so a manager could not ask what one
cashier sold or what went through MoMo. All five are now on the screen, and the
discount and void logs take the user filter too — "whose voids are these" being
the question those logs are opened to answer.

Three FR-RPT-04 reports had no tab despite being on the API: **inventory
valuation**, **low stock** and **end of day**.

### Cost was reaching every cashier

`frozenCostPrice` was on every line of every sale returned to anyone holding
`pos.sell`. Release gate 7 is "a cashier sees no cost or profit". The reports
withheld cost carefully and the sales endpoint handed it over; the dashboard
then computed a profit figure out of it for exactly the people the reports were
protecting. Redacted at the controller, where the caller's rights are known.

### Built, not repaired

- **FR-SET-08 data export.** Server-side, streamed, read from
  `information_schema` so a table added later is in the archive without anyone
  remembering — JSON for the whole business, a zip of CSV for the accountant.
  Live password-reset tokens are excluded; password hashes are not, because an
  archive that cannot restore its own users is not an archive. Audited before a
  byte is written.
- **FR-USER-03 per-user permissions.** The API was complete and had no caller,
  so AT-A1-04 could not be demonstrated at all. Three states on the screen,
  because "withheld" and "the role never had it" are different facts.
- **FR-PRICE-03 / FR-PRICE-06.** Branch prices and price history had no control
  either; a branch floor could be stored and enforced with no way to set or read it.
- **FR-SET-01 logo upload.** The field held a URL, so the logo had to already
  live on the internet — on a counter whose connection cannot be relied on to
  sell. Bytes in the database now, carried by the backup.
- **FR-CUST-07 credit limits, balances, ageing, statements.** `credit_limit`
  appeared nowhere in the server. The balance is *derived* from open plans and
  deliberately not stored, for the same reason a purchase order does not store
  received quantity.
- **FR-SUP-08 amend, FR-CUST-07 write-off, FR-RCPT-09 server-rendered preview** —
  three more APIs that had no caller. The settings receipt preview was a
  hand-built mock-up in JSX, a second renderer free to disagree with the printer.

**A limit that would have stranded the client.** The first version of the credit
check read a zero limit as "no credit". Nine installment tests failed, which is
the clearest possible statement of what it would have done to a shop on
upgrade: the column defaults to zero, so every existing customer would have been
refused credit until somebody set a limit for each of them by hand. Zero now
means "no limit set".

**Three migrations:** V31 cart discount and discount approver, V32 the per-line
cart share, V33 logo bytes and credit limit.

**560 backend tests (3 skipped — the live R2 checks), 95 frontend, all green.**
Up from 514 and 54. Maven's own summary, not a count assembled from the reports
directory — that one reads stale files from a partial run and had me reporting 8
failures against a green build.

### The migrations ran in the tests and not on the machine

Both suites were green and the backend would not start. Testcontainers builds
the schema from nothing as the owner of everything, so it never exercises the
one thing that was wrong: what the application role is *allowed* to do against a
database it did not create.

Two failures, one cause. The Ubuntu `.deb` adopts an existing `pos_system` with
`ALTER DATABASE ... OWNER TO radiance_pos`. Since PostgreSQL 15 the `public`
schema belongs to the implicit role `pg_database_owner`, so that one statement
moves `CREATE`-on-public to the new owner and leaves every table with the old
one:

- `./run.sh`, as `giftedlabs`, still owned the tables — so `ALTER TABLE` worked
  and V31's `CREATE INDEX` did not: *permission denied for schema public*. The
  first migration in months to create anything was the first to notice.
- the packaged service, as `radiance_pos`, owned the database and none of its
  contents: *permission denied for table flyway_schema_history*. It had been
  stuck in `activating` since the package was installed, failing at V30, with
  nothing to do with this session's work.

**Both indexes are gone rather than the privilege granted.** Neither was
measured — one would have served "what did this manager approve", which the
discount report already answers from lines already filtered by date and outlet;
the other saved a lookup over the handful of plans a customer has. This project
learned once already that an index added on a guess is a guess somebody later
mistakes for a finding. Dropping them is also what makes the migration run as an
ordinary table owner, which is the privilege the application should need.

**`postinst` now moves ownership as one piece** — schema, tables, sequences and
`flyway_schema_history` together, with `REASSIGN OWNED` when the old role is
still there. A machine that already took the half-move cannot be repaired by
reinstalling, because the database block only runs when `pos.env` is absent, so
`radiance-pos-repair-database` does it once.

V31–V33 were edited in place, which is safe exactly once: no database anywhere
had applied them, so there is no checksum to invalidate.

## The Start-menu entry that refused and explained — 2026-09-24

**"Configure or repair Radiance POS" could never have worked.** The shortcut ran
`wscript launch.vbs onboard.ps1`, and nothing anywhere in that chain asked
Windows for administrator rights. Under UAC even an administrator account runs
with a filtered token unless a process requests the real one, so
`Test-Administrator` was false on the first line inside the try and setup threw
before touching anything. The counter saw the shortcut fail and then explain
itself — "must run as a Windows administrator; right-click the Start-menu entry
and choose Run as administrator" — which is a remedy nobody is told about at
install time, and an unreliable one: the shortcut targets `wscript.exe`, where
right-click *Run as administrator* is not consistently offered once the entry is
pinned or reached from search.

`launch.vbs` now takes `/elevate` and raises the prompt itself through
`ShellExecute ... "runas"`, which `Run` cannot do. Setup and restore both use it,
so the rights arrive by asking rather than by the operator knowing. The message
changed with the mechanism: answer Yes to the Windows prompt, not right-click
the icon.

**Setup also ran where it could not be watched.** `/show` keeps the console
visible for onboarding and diagnostics, because during setup an error nobody can
see is worse than a window nobody wanted. The everyday launcher still opens with
no window at all — that was the original point of the shim and it is unchanged.

**`-NonInteractive` is gone.** The wizard is a WinForms `ShowDialog`, and a host
told it may not interact has no business showing one. It was not what broke the
shortcut, which is exactly why it was worth removing before it was.

**The transcript now opens before anything can throw.** It used to start below
the function definitions, so a failure above that line left nothing to read —
and reading nothing is how this was diagnosed twice.

### Two defects in the repair itself

The rewrite that did all of the above shipped neither.

**The shim stopped naming what it ran.** `ShellExecute` takes the executable and
its arguments separately; `Run` takes one command line. The new code built the
argument string for the first and handed it to the second, so every shortcut
that does *not* elevate — the desktop icon, "Open Radiance POS", and the
post-install onboarding step — would have tried to launch a program called
`-NoProfile`. The fix for an icon that did nothing would have been an icon that
did nothing, on the path a cashier uses every morning.

**A handled failure was reported twice.** The shim reports any unexpected exit so
a death before a tool's own error handling still reaches the operator. But
`open-pos.ps1` exits 2 and 3 *after* putting its own dialog up, and only 1 was
exempt — so a stopped service would have produced the real explanation followed
by a box reading "Exit code: 2". There is a convention now: **64 means the
operator has already been told**, used by all four tools, and the shim speaks for
everything else. That distinction matters because a blocked execution policy and
a host that will not start also exit 1, and those are precisely the failures
nothing else can report.

**A version the counter can read back.** The build writes `VERSION.txt` — version,
commit, build time — and diagnostics reports it with the PowerShell version. A
support call that opens with "which build is this?" has already lost. The
`git rev-parse` behind it is wrapped, because under `$ErrorActionPreference =
'Stop'` a build machine without git would otherwise abort the run after the
frontend and backend were built, over one line of text.

Five packaging assertions in `WindowsAppWindowTest`, which is all that can be
asserted about PowerShell and Inno from Linux CI. The shim naming its host is one
of them.

### Two builds, so the window question is answered on hardware

The counter opens the POS either as a dedicated app window through Edge or
Chrome — no address bar, no tabs — or in the machine's ordinary browser.
`-LaunchMode` picks one at build time and the browser build carries a `-browser`
suffix, because two artifacts that cannot be told apart are one artifact. The
Windows workflow now builds both on every run.

They install over each other on purpose: same `AppId`, same services, same
ports. Comparing them means one counter at a time, which is honest about what
is actually being compared.

The mode is also a file. `LAUNCH-MODE.txt` holds what the build chose and
`config\launch-mode.txt` in ProgramData overrides it, so a counter switches on
the next launch with no reinstall and no service restart — and one installer is
enough to see both. Kept separate from `VERSION.txt` deliberately: a stamp for
people to read and a setting for a script to read are different things, and only
one of them is allowed to change. An unreadable or unknown value is logged and
the default stands; a till does not stop selling over a preference.
