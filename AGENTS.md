# Working on this project

POS and inventory backend for two shops — Inco Hardware and Radiance Lighting.
Java 25 · Spring Boot 4.1.1 · PostgreSQL 18 · local-first.

Read this before writing code. It is short on purpose.

---

## The four documents

| File | Answers | You edit it when |
|---|---|---|
| `../pos-system/docs/PRD (1).md` | **What** the system must do | Never. The client owns it. |
| `../pos-system/docs/blueprint.html` | **How** it is built, and why | An architectural decision changes |
| `PROGRESS.md` | **What is done and what is left** | After every feature. Always. |
| `AGENTS.md` (this) | **How to work** | A convention changes |

If code and the PRD disagree, the PRD wins. If the PRD and the blueprint
disagree on *how*, the blueprint wins — it records decisions made after the PRD
was written.

---

## The loop, per feature

Work one feature at a time. A feature is one lettered section of
`../pos-system/docs/CHECKLIST.md` (A = auth, B = outlets, C = catalogue …).

1. **Read the requirement.** Find the `FR-` IDs in the PRD §5 and the matching
   checklist items. Do not work from memory or from the checklist alone — the
   PRD has the acceptance wording.
2. **Write the test first** where the rule is non-obvious (money, permissions,
   stock, concurrency). Name the requirement in `@DisplayName`.
3. **Implement**, smallest thing that satisfies the requirement.
4. **Run** `./mvnw test`. Green, or it is not done.
5. **Update `PROGRESS.md`.** Not optional, not batched.
6. **Commit** with the `FR-` IDs in the message.

Do not start the next feature until `PROGRESS.md` reflects the last one.

---

## Where code goes

```
gh.giftedlabs.pos
├── config/       Spring configuration and @ConfigurationProperties
├── controller/   REST endpoints. Thin — validate, delegate, return.
├── dto/          Request and response records. Never expose an entity.
├── entity/       JPA entities. No business logic.
├── exception/    Domain exceptions. Mapped in ApiExceptionHandler.
├── repository/   Spring Data interfaces. One per aggregate.
├── rules/        Domain rules ported from the frontend. SEE BELOW.
└── service/      Interfaces
    └── impl/     Implementations
```

**Rules, not preferences:**

- A service is an **interface** in `service/` with an implementation in
  `service/impl/`. Controllers depend on the interface.
- **Nothing goes in the wrong folder.** A repository in `service/` is a bug.
- Entities never leave the service layer. Controllers speak DTOs.
- Controllers contain no business branching. If there is an `if` about a
  business rule, it belongs in a service.
- `rules/` must not import Spring or JPA. Ever. See the next section.

---

## The three non-negotiables

**1. `rules/` is pinned by the frontend.**

`Money`, `Quantity`, `Costing`, `ReceiptSequence`, `Permission`, `Role` are
ports of the frontend's TypeScript. Both sides are tested against the same file:

```
../pos-system/docs/contract/test-vectors.json
```

If you change a rule, you change it in **the frontend first**, regenerate, and
re-sync:

```bash
cd ../pos-system && npm run gen:vectors && npm run check
cd ../pos-api  && ./scripts/sync-vectors.sh && ./mvnw test
```

Never edit `test-vectors.json` by hand. Never make the Java side "more correct"
than the frontend — a one-pesewa disagreement becomes an unexplainable shift
variance months after go-live.

**2. Money is `Money`, quantities are `Quantity`.**

- `Money` wraps `long` pesewas — BR-11. Never `double`, never a bare `BigDecimal`
  for a stored amount.
- **Unit prices and discounts are `BigDecimal`, not `Money`** — they carry
  sub-pesewa precision. `3 × 18.335` settles to `55.01`; rounding the price to
  pesewas first gives `55.02`. Schema: prices are `NUMERIC(12,4)`, totals and
  payments are `BIGINT`.
- `Quantity` normalises to 3dp — BR-12, for cut lengths.

**3. Every mutating endpoint carries `@PreAuthorize`.**

NFR-9: the interface is never the only control. Use the enum constants:

```java
@PreAuthorize("hasAuthority('" + Permission.Codes.SALE_VOID + "')")
```

---

## Database

Flyway owns the schema. **Hibernate never generates DDL** (`ddl-auto: validate`).

- New table or column → a new `V{n}__{name}.sql` in `db/migration/`.
- **Never edit a migration that has run.** If it has only ever run on your own
  machine and nowhere else, editing is fine — say so in the commit.
- Money `BIGINT`, quantities `NUMERIC(18,3)`, prices `NUMERIC(12,4)`.
- Every table: `UUID` primary key, `outlet_id` if outlet-scoped, nullable
  `synced_at`. These three are what keep the move to cloud cheap — see
  blueprint §12.

---

## Testing

- **Unit tests** for services — mock the repositories. No Spring context, no
  database. Fast.
- **Testcontainers** for anything touching real SQL: locks, constraints,
  migrations, reports.
- Name the requirement: `@DisplayName("FR-AUTH-06 · failed attempts are rate limited")`.

⚠️ **A plain `@Test` on a class that also has `@Nested` members is silently
skipped** by surefire's default run. Put every test inside a `@Nested` class,
or have no nested classes at all. A test that does not run is worse than none.

---

## Commands

```bash
./run.sh                  # start against local Postgres (counter profile)
./run.sh consolidator     # start as the owner's view
./mvnw test               # everything
./mvnw -Dtest=X test      # one class
./scripts/sync-vectors.sh # pull contract vectors from the frontend
```

Local config lives in `.env` (gitignored). Copy `.env.example` to start.

---

## Two deployments, one JAR

- `counter` — the shop's PC. **The system of record.**
- `consolidator` — the owner's combined view, on Railway. **Never authoritative.**
  If it is down, the tills do not notice.

Everything that differs between machines is an environment variable with a
working local default. **No file should need editing to deploy.** If you find
yourself hardcoding a URL, port or credential, that is the bug.

---

## Definition of done

A feature is done when all of these are true:

- [ ] Every `M`-priority `FR-` in that checklist section is implemented
- [ ] Server-side permission check on every mutating endpoint
- [ ] Tests green, and they name the requirements they cover
- [ ] `PROGRESS.md` updated
- [ ] Committed with the `FR-` IDs in the message

Not done: "the happy path works." The PRD's acceptance wording is the bar.
