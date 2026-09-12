-- V1 · Identity — outlets, terminals, users, roles, permissions
-- Source: PRD §7.1. Flyway owns the schema; Hibernate never generates DDL.
--
-- THREE AMENDMENTS TO PRD §7 (see docs/blueprint.html §12)
-- These are free now and expensive to retrofit into live trading data:
--
--   1. UUID primary keys. Each shop runs its own database. Two databases both
--      counting from 1 collide catastrophically if they are ever merged into
--      one cloud instance. UUIDs make that merge an insert, not a conflict.
--
--   2. outlet_id retained on every outlet-scoped table, even though a local
--      database holds exactly one outlet. It is what makes the owner's combined
--      dashboard work unchanged after a merge — and NFR-16 already requires
--      that a third outlet be configuration only, no schema change.
--
--   3. synced_at, nullable and unused today. Already present on `sale` in
--      PRD §7.3; extended to everything that will eventually sync.
--
-- CONVENTIONS
--   · Money is BIGINT pesewas — BR-11 mandates integer minor units.
--   · Quantities are NUMERIC(18,3) — BR-12, to support cut lengths.
--   · `user` is reserved in PostgreSQL, so the table is `app_user`.

-- ---------------------------------------------------------------- outlets

CREATE TABLE outlet (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT         NOT NULL UNIQUE,
    name            TEXT         NOT NULL,
    trading_name    TEXT,
    address         TEXT,
    phone           TEXT,
    receipt_footer  TEXT,
    logo_url        TEXT,
    receipt_prefix  TEXT         NOT NULL,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    synced_at       TIMESTAMPTZ
);

COMMENT ON COLUMN outlet.receipt_prefix IS 'BR-6: the {OUTLET} segment, e.g. INC in INC-01-004312';

-- --------------------------------------------------------------- terminals

CREATE TABLE terminal (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id        UUID         NOT NULL REFERENCES outlet (id),
    code             TEXT         NOT NULL,
    name             TEXT         NOT NULL,
    printer_config   JSONB        NOT NULL DEFAULT '{}'::jsonb,
    seq_block_start  BIGINT       NOT NULL,
    seq_block_end    BIGINT       NOT NULL,
    seq_current      BIGINT       NOT NULL,
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    synced_at        TIMESTAMPTZ,

    CONSTRAINT terminal_code_unique_per_outlet UNIQUE (outlet_id, code),
    -- BR-6: a terminal may only issue numbers inside the block it was handed.
    CONSTRAINT terminal_seq_block_ordered  CHECK (seq_block_end >= seq_block_start),
    CONSTRAINT terminal_seq_within_block   CHECK (seq_current >= seq_block_start
                                                  AND seq_current <= seq_block_end + 1)
);

COMMENT ON CONSTRAINT terminal_seq_within_block ON terminal IS
    'seq_current may reach end+1, which means the block is exhausted and the terminal must request another';

-- ------------------------------------------------------------------- users

CREATE TABLE app_user (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    username       TEXT         NOT NULL UNIQUE,
    email          TEXT         UNIQUE,
    password_hash  TEXT         NOT NULL,
    pin_hash       TEXT,
    full_name      TEXT         NOT NULL,
    phone          TEXT,
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login_at  TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    synced_at      TIMESTAMPTZ
);

-- NFR-8: passwords and PINs are hashed separately, with their own salts.
COMMENT ON COLUMN app_user.password_hash IS 'Argon2id';
COMMENT ON COLUMN app_user.pin_hash      IS 'Argon2id, separate salt — a manager PIN is an approval primitive, not a login';

-- ------------------------------------------------- roles and permissions
--
-- DEVIATION FROM PRD §7.1, deliberate.
--
-- The PRD models `role`, `permission` and `role_permission` as catalogue
-- tables. They are omitted here because the catalogue already exists as the
-- Permission and Role enums, and those enums are asserted against
-- test-vectors.json — the same file the frontend is checked against.
--
-- A catalogue table would be a SECOND source of truth for the 33 codes and the
-- four baselines, free to drift from the enum the server actually authorises
-- with. Descriptions and groupings for the permissions screen are served from
-- the enum too.
--
-- What is kept is the part that is genuinely per-user data: role assignment
-- and FR-USER-03 overrides. Both store the enum key directly.
--
-- `role.is_system` anticipated custom roles. Those are not in Stage 1. If they
-- arrive, add the table then and have the enum seed it.

CREATE TABLE user_role (
    user_id   UUID  NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    role_key  TEXT  NOT NULL,
    PRIMARY KEY (user_id, role_key)
);

COMMENT ON COLUMN user_role.role_key IS 'gh.giftedlabs.pos.rules.Role — owner | manager | cashier | storekeeper';

-- FR-USER-03: per-user overrides on top of the role baseline.
-- granted = TRUE grants a code the role lacks; FALSE revokes one it has.
CREATE TABLE user_permission (
    user_id          UUID     NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    permission_code  TEXT     NOT NULL,
    granted          BOOLEAN  NOT NULL,
    PRIMARY KEY (user_id, permission_code)
);

COMMENT ON COLUMN user_permission.permission_code IS 'gh.giftedlabs.pos.rules.Permission wire code, e.g. sale.void';

CREATE TABLE user_outlet (
    user_id    UUID  NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    outlet_id  UUID  NOT NULL REFERENCES outlet (id)   ON DELETE CASCADE,
    PRIMARY KEY (user_id, outlet_id)
);

CREATE INDEX idx_terminal_outlet ON terminal (outlet_id);
