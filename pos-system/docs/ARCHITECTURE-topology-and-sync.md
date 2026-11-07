# Topology and Synchronisation — Architecture Decision Record

**Drawn** 2026-09-15 · **Against** PRD v1.0 · `IMPLEMENTATION-PLAN.md` · `CHECKLIST.md`
**Settles** the topology question left open in `pos-api/PROGRESS.md`
**Amends** PRD assumptions AS-5 and AS-6, which do not describe this client

---

## Why this document exists

`PROGRESS.md` carried an open question headed *"One instance, or one per shop?"* with a note that
the two shapes could not both be true without replication that was neither built nor quoted. That
question is now settled, and three facts about the client settled it:

| Fact | Consequence |
|---|---|
| The two shops sell largely **different products** | There is no single shared catalogue to keep in step |
| The electrical shop carries **some** hardware lines | …but the overlap is real, so the catalogue is not fully separable either |
| Internet at the second outlet is **unreliable** | A till that needs the network to sell is unusable there |

The decision below is the smallest arrangement that satisfies all three.

---

## The decision

**Each shop runs its own instance. The owner runs the same application. Cloudflare R2 is the postbox
between them. Nothing is ever written from both ends.**

```
        ┌──────────────────────────┐
        │   Owner's instance       │   authority for configuration
        │   (owner's PC)           │   holds BOTH outlets' data
        └───────┬──────────▲───────┘
    publish     │          │   update
    config      ▼          │
        ┌──────────────────┴───────┐
        │   Cloudflare R2          │
        │   config/   (down)       │
        │   data/     (up)         │
        └───────▲──────────┬───────┘
     get config │          │  push
                │          ▼
    ┌───────────┴──┐   ┌───┴──────────┐
    │ Inco (INC)   │   │ Radiance(RAD)│   each trades with no internet
    │ counter PC   │   │ counter PC   │
    └──────────────┘   └──────────────┘
```

**The property that makes this safe:** every channel is one-way, and every row has exactly one writer.
Configuration is written only by the owner. Transactions are written only by the shop that made them.
There is no conflict resolution anywhere in this design, because there is no case where two places
can change the same row.

### Non-negotiable rule

**No shop ever requires the network to trade.** The pull is on demand, the push is best-effort. If R2
is unreachable on a Tuesday, nothing at either counter behaves differently. Any future change that
puts a network call on the selling path breaks the reason this shape was chosen.

---

## Why not the alternatives

| | Overlap handled | Combined reporting | Shop trades offline | Verdict |
|---|---|---|---|---|
| **One shared instance** | natively | true | ❌ needs the whole FR-SYNC queue rebuilt | rejected |
| **Two instances, duplicated overlap** | two separate records | ❌ impossible — different ids | ✅ | rejected |
| **Two instances + R2 (this)** | one id, both sides | ✅ true | ✅ | **adopted** |

The second option fails on a subtle point worth recording: duplicating the ~overlap items is only
mild data entry, but it makes the two shops' tape *different products*. The owner could then never
ask "how much tape did the business sell" — and the overlap is precisely where a cross-shop
comparison is interesting.

An HTTP consolidator API was the original plan (`pos.consolidator.*`). R2 replaces it. That config is
**0% built**, so this deletes unbuilt work rather than adding to it, and removes a hosted service from
the bill entirely.

---

## Channel 1 — configuration, owner → shop

Written by the owner's instance to `config/{OUTLET}.json`. Pulled by a shop on **Get configuration**,
which is re-runnable, not once-only.

| Carried | Notes |
|---|---|
| Business profile | Shared: company name, TIN, tax rate, currency, rounding |
| Outlet record | Per shop: trading name, address, phone, receipt prefix, receipt header/footer |
| Users for that outlet | Teams are separate; each shop receives only its own |
| Products assigned to that outlet | See *central vs local* below |
| Thresholds and policies | Idle lock, approval and variance limits, discount ceilings |

### Setting a shop up, in order

1. The owner creates the outlet, imports its products, assigns them to it, creates
   its staff — then **Publish configuration**.
2. The shop's counter PC is installed with `POS_BOOTSTRAP_ADMIN_*` set, so a first
   run gives it an outlet, a till with a receipt block (BR-6) and one owner
   account. Without that there is nobody to sign in as, and the pull needs
   `settings.general`.
3. Somebody signs in at the counter with that account and presses **Get
   configuration**. The shop now has its real catalogue, staff and settings.
4. Bootstrap is switched off.

**The id has to be adopted at step 3, and this is easy to get wrong.** The first
run invents a UUID for its outlet, because it has never heard of head office. The
owner's copy of the same shop has a different id and the same code — and
`outlet.code` is unique, so inserting head office's row violates the *code*
index, which an `on conflict (id)` clause does not catch. Every first pull failed
with a 500 until `adoptHeadOfficeId` was written.

Head office's id must win. It is the id every product, price and pushed sale is
keyed to; a shop that kept its own would send its trading up attached to an outlet
that exists nowhere else, and the combined reports would quietly sum to nothing.
The swap is only ever done while the shop has no trading of its own — doing it
under a shop that has been selling would orphan its sales, so that is refused
with a message rather than attempted.

**Re-runnable, not once.** A once-only pull would leave the owner editing the tax rate in three places
and the copies drifting apart silently. Re-running the same one-way pull costs nothing extra once the
pull exists.

**Users flow down only.** `user.manage` belongs to the owner alone — no other role carries it — so
shops never create staff and never push users up. This is what makes every `actor_id` in a pushed
audit row resolve against a user the owner's database already has.

### Central and local products

Two classes, so that head-office control does not cost a shop the ability to add an item at the till:

- **Central** — defined on the owner's instance, pulled down, **read-only at the shop**. Overwritten by
  the next pull. The overlapping lines live here, which is what gives them one shared UUID on both
  sides and makes cross-shop reporting on them real.
- **Local** — created at the shop, **never touched by a pull**. A one-off special order, a line only
  that shop will ever stock.

Neither can conflict: the pull only ever writes central products, and UUID keys mean a locally created
product can never collide with anything.

**This needs a new table.** `product_outlet` — which outlets carry which product — does not exist
today. Availability is currently only implied by a `stock_level` row existing, which means the owner
cannot assign a product to a shop before any stock has arrived. It is the one schema addition this
design requires.

---

## Channel 2 — transactions, shop → owner

Written by each shop to `data/{OUTLET}/{SEQ}-{TIMESTAMP}.json`. Pulled by the owner on **Update**.

### Incremental, not snapshots

A summary could be re-sent whole every time and would be self-healing. **Full transaction history
cannot** — it would mean re-uploading a year of data every fifteen minutes. So the push is
incremental, and the mechanism already exists in the schema.

**`synced_at` is on every table that needs it** — `sale`, `payment`, `inventory_movement`,
`stock_level`, `shift`, `cash_movement`, `customer`, `audit_log`, `goods_receipt`, `expense`,
`installment_plan`, `product`. `PROGRESS.md` records the reasoning: *"Free now, expensive to retrofit.
Makes merging two shops into one cloud DB an insert rather than a migration."* That decision is what
makes this channel cheap.

`sale_item` has no `synced_at`, correctly — line items travel with their sale, never alone. The same
holds for `installment_plan_item` and `installment_schedule_item`.

The push is: select where `synced_at IS NULL`, write the batch, stamp the rows.

### Two classes of row

**Append-only — insert if absent, never updated:**

| Table | Gives the owner |
|---|---|
| `sale` + `sale_item` + `payment` | full sales history, every line and every tender |
| `inventory_movement` | every stock movement — the ledger (BR-2) |
| `cash_movement` | every pay-in and pay-out |
| `goods_receipt` | purchases from suppliers |
| `audit_log` | every operation performed (BR-15) |

**Mutable — upsert by id, the shop always wins because only the shop writes them:**

| Table | Why it changes after first push |
|---|---|
| `stock_level` | moves with every sale and receipt |
| `shift` | opens now, closes later |
| `customer` | created and edited at the till |
| `expense`, `installment_plan` + schedule | edited, and paid against |

An update to a mutable row clears `synced_at` so the row re-pushes. That is the only new rule this
channel introduces.

### Idempotency

Ingest is `INSERT … ON CONFLICT DO NOTHING` on the UUID primary key. If a push succeeds but the
stamping afterwards fails, the rows go a second time and the second time changes nothing. BR-7
idempotency is already built and tested on sales for exactly this reason.

### Batch mechanics

```
data/INC/000001-2026-09-15T0815.json
data/INC/000002-2026-09-15T0830.json
```

- **Sequenced**, because with incremental batches a skipped file is a hole rather than a delay. The
  owner ingests in order and can see if one is missing.
- **Ordered within the file** by dependency — customers before sales, sales before lines, shifts
  before cash movements — so foreign keys resolve on the way in.
- **Kept ~90 days** by an R2 lifecycle rule. They double as a second off-site copy of the transaction
  history, beside the `pg_dump` backups already going to the same bucket (NFR-6).
- **Never blocks trading.** With no connection, rows simply accumulate unstamped. The owner/admin
  chooses the automatic upload frequency in **Settings › Cloud Sync**, from 15 minutes to 24 hours
  in 15-minute steps. The scheduler wakes locally every 15 minutes and consults that database-backed
  setting before making a cloud request; manual **Sync trading now** requests remain immediate.

---

## The audit log

Already built, already recording, and already protected: `audit_log` in `V2__authentication.sql` is
**append-only enforced by a database trigger**, not by application convention (BR-15).

It needs nothing special to travel — it is append-only, so it takes the insert-if-absent rule like
sales. Three properties follow:

1. **The owner's copy inherits the same protection.** The same trigger exists in their database, so
   ingested rows can be inserted and never altered. The combined log is as tamper-evident as each
   shop's own.
2. **Every actor resolves**, because users flow down from the owner before any audit row referencing
   them can be pushed up.
3. **One combined log, filterable by outlet**, since every row carries `outlet_id`. The existing audit
   screen works across both shops or either one with no change.

---

## The outlet switcher

No new work. The owner's database holds both outlets' rows, every row tagged with `outlet_id`, and
`outlet.view_all` already exists and is enforced:

- **Inco** → scoped reads, exactly as at the shop
- **Radiance** → the same
- **All outlets** → combined, which the reports already aggregate

At a shop instance only one outlet exists in the database, so the switcher naturally offers only that
one. No special-casing, because scoping is by assignment.

---

## Packaging

The target is a Windows counter PC operated by someone who will not use a terminal.

| Piece | Approach |
|---|---|
| Java runtime | `jpackage` bundles a trimmed JRE into an `.msi` — nothing installed separately |
| Application | the Spring fat jar, inside the same package |
| Frontend | **served by Spring from `src/main/resources/static`** — see below |
| PostgreSQL | its own Windows installer as a prerequisite; bundling is the fallback |
| Auto-start | registered as a Windows service |
| Printer | the ESC/POS service, its own installer (feature I) |

**The frontend must move inside the jar.** It is currently served by a separate Node/Express process
(`pos-system/server.ts`, port 3000), which means a counter PC would need a second runtime purely to
draw screens. Building the Vite output into `pos-api/src/main/resources/static` removes Node from the
install, collapses two processes into one, and makes `pos.web.corsAllowedOrigins` unnecessary.

**The installer asks two questions** — which outlet, and the R2 key. Everything else arrives on the
first **Get configuration**. No catalogue typed into a till, no tax rate configured per shop.

---

## Cost

| | |
|---|---|
| R2 storage | kilobyte batches; ~50–150 MB per shop per year. Inside the free tier |
| R2 egress | none — R2 does not charge for it |
| Owner's instance | runs on the owner's own PC |
| Shop instances | run on the counter PCs |
| Hosted services | **none** |

Railway deployment remains supported in the code (`DatabaseUrlConfig` translates Railway's
`DATABASE_URL`) if the owner's instance should later be always-on and reachable from a phone. That is
a few dollars a month and a change of hosting, not of design.

---

## What this does not cover

| Open | Why it matters |
|---|---|
| ~~Does stock move between the shops?~~ | **Settled 2026-09-15: it does not.** Every item at an outlet belongs to that outlet; each shop buys direct from suppliers. No dispatch/receive pair is needed and `stock.transfer` stays Stage 3, unbuilt and flagged `futureStage`. This is what keeps `inventory_movement` and `stock_level` single-writer, and therefore keeps channel 2 conflict-free |
| ~~Swaps / returns~~ | **Settled 2026-09-15: in scope, being built.** They push up like any other transaction once they exist |
| Customer directory | Per shop by decision. Customers still push up, so the owner sees them; there is simply no merge across shops |

---

## What may be changed where

Settled 2026-09-15, after the question "if the owner signs in at a shop, what do they see?"

**Anything that flows down is read-only at a shop. Anything the shop owns is editable there.**

| Owned by the shop — editable there | Owned by the owner — read-only at a shop |
|---|---|
| Sales, stock, movements, shifts, cash | Central product definitions |
| Expenses, installment plans, returns | Base prices |
| Customers | Users and credentials |
| Locally created products | Business profile, thresholds, tax rate |
| **That shop's price override** (`product_outlet_price`) | |

The per-outlet price override is the elegant case: it is keyed `(product_id, outlet_id)`, so a branch
manager with `price.edit` writes their own row and never the owner's. The architecture permits it; the
permission decides whether they may. Revoke `price.edit` from that manager and they cannot.

**Why read-only rather than "allowed but overwritten":** a manager who edits a central product and
finds the change silently reverted on the next pull has been told the system forgets what they do.
Refusing is kinder, and it matches the L-09 convention used everywhere else — controls you may not use
are absent, not broken.

**The owner signing in at a shop** gets full admin *for that shop*: every report, the audit log, all
36 permissions — but only that outlet's data, because that is all the machine holds. The switcher
correctly does not render (`Header.tsx` requires more than one accessible outlet), and they are placed
straight into the shop by FR-AUTH-03. No internet is needed to do any of it. Their actions are audited
locally and push up tagged to that outlet.

**Two gaps this rule exposes, both to fix when the channels are built:**

1. `product_outlet_price` has **no `synced_at`** — every other table that needs one has it. Without it
   a branch's real selling price never reaches the owner's view, which would be a silently wrong
   number rather than a missing one.
2. `product` has a unique index on `upper(sku)`. A locally created product can therefore collide with
   a central one arriving later. Prevent the common case by allocating local SKUs from a per-outlet
   range (`sku_sequence` exists), and **report** the rare one to the owner rather than guessing —
   auto-merging two products on a matching SKU would fold different items together and the stock
   figures would be wrong with nothing to notice it by.

---

## Amendments to the PRD

Recorded so that nobody reads the code, finds it disagrees with the PRD, and "fixes" it back.

| Assumption | Status |
|---|---|
| **AS-5** — one shared product list across both outlets | **Does not hold.** The ranges are largely different. Superseded by central/local products with explicit `product_outlet` assignment |
| **AS-6** — shared prices with a per-outlet override | **Mostly does not hold.** `product_outlet_price` remains correct for the overlapping lines and is unused elsewhere |
| **§2.2** — "cloud-hosted single system" | **Superseded.** Local-first per shop, with R2 as the link. The PRD's own risk register anticipated this: *"full offline quotable separately"* |
| **FR-SYNC-01/02/04/05/06** | Remain moot, and now correctly so. They existed to cross a network that no longer sits between a till and its database |

---

## Build order

1. **I · Receipts & printing** — the only feature at 0%, and the print service is half of the install story
2. **Frontend into the Spring jar** — small, and unblocks clean packaging
3. **`product_outlet` assignment** — the one schema addition
4. **Channel 1** — publish and get configuration
5. **Channel 2** — push and ingest transactions
6. **`jpackage` installer and Windows service**

Items 4 and 5 need `OffsiteStore` to grow `get` and `list`. It has only `put()` today, which is what
sends the backups off-site — the R2 client itself is already built, configured and in use.
