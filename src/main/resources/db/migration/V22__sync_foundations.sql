-- Channel prerequisites — see docs/ARCHITECTURE-topology-and-sync.md.
--
-- WRITTEN TO BE RE-RUNNABLE, and the reason is a mistake worth recording: this
-- file was edited twice *after* it had already been applied to a live database.
-- Flyway checksums a migration when it runs it, so the next start would have
-- refused to boot — and the database was left half-way between the two
-- versions, with `sync_watermark` present and the sync_batch key still wrong.
--
-- Every statement here is therefore guarded. Deleting this version's row from
-- flyway_schema_history and letting it re-apply brings any database to the same
-- place, whichever version of the file it saw first.

-- 1 ────────────────────────────────────────────────────────────────────────
-- Which outlets carry which product.
--
-- Availability was only ever implied by a stock_level row existing, which means
-- the owner cannot assign a product to a shop *before* any stock arrives — and
-- assigning before stock is exactly what setting a shop up is. It is also what
-- makes the overlapping lines work: one product, one id, assigned to both shops,
-- so "how much tape did the business sell" has an answer.
CREATE TABLE IF NOT EXISTS product_outlet (
    product_id  uuid        NOT NULL REFERENCES product (id) ON DELETE CASCADE,
    outlet_id   uuid        NOT NULL REFERENCES outlet (id)  ON DELETE CASCADE,

    -- Set when the owner publishes; the shop pulls it and does not write it.
    assigned_at timestamptz NOT NULL DEFAULT now(),
    synced_at   timestamptz,

    PRIMARY KEY (product_id, outlet_id)
);

CREATE INDEX IF NOT EXISTS idx_product_outlet_outlet ON product_outlet (outlet_id);

-- Everything already on the shelf is carried by the outlet it is sitting in.
-- Without this the first pull would look like every product had been withdrawn.
INSERT INTO product_outlet (product_id, outlet_id)
SELECT DISTINCT product_id, outlet_id FROM stock_level
ON CONFLICT DO NOTHING;

-- 2 ────────────────────────────────────────────────────────────────────────
-- Where a product came from, and therefore who may change it.
--
-- CENTRAL is defined by the owner and pulled down; a shop may not edit it,
-- because the next pull would overwrite the edit and the counter would be told
-- the system forgets what it does. LOCAL is the shop's own and is never touched
-- by a pull.
ALTER TABLE product ADD COLUMN IF NOT EXISTS origin varchar(10) NOT NULL DEFAULT 'LOCAL';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_origin_known') THEN
        ALTER TABLE product ADD CONSTRAINT product_origin_known
            CHECK (origin IN ('CENTRAL', 'LOCAL'));
    END IF;
END $$;

COMMENT ON COLUMN product.origin IS
    'CENTRAL products are published by the owner and read-only at a shop; LOCAL ones belong to the shop that made them.';

-- 3 ────────────────────────────────────────────────────────────────────────
-- The per-outlet price override had no synced_at, alone among the tables the
-- shop writes. Without it a branch's real selling price never reaches the
-- owner's view — a silently wrong number rather than a missing one, which is
-- the worse of the two.
ALTER TABLE product_outlet_price ADD COLUMN IF NOT EXISTS synced_at timestamptz;

-- 4 ────────────────────────────────────────────────────────────────────────
-- What this instance has already taken in, so a batch is never applied twice
-- and a missing one is visible rather than silently skipped.
CREATE TABLE IF NOT EXISTS sync_batch (
    id            uuid         PRIMARY KEY,
    object_key    varchar(400) NOT NULL,
    outlet_code   varchar(20)  NOT NULL,
    sequence      bigint       NOT NULL,
    direction     varchar(10)  NOT NULL CHECK (direction IN ('PUSHED', 'INGESTED')),
    row_count     integer      NOT NULL DEFAULT 0,
    byte_count    bigint       NOT NULL DEFAULT 0,
    recorded_at   timestamptz  NOT NULL DEFAULT now()
);

-- Unique per direction, not per key. One instance that both sells and receives
-- — the owner's, if they also serve a counter — writes a batch and later reads
-- it back, and those are two different facts about the same object. Keying on
-- the object alone made the second one silently do nothing, so every batch was
-- ingested again on every run.
--
-- Dropped explicitly because the first version of this file declared the column
-- UNIQUE, and a database that saw that version still carries the constraint.
ALTER TABLE sync_batch DROP CONSTRAINT IF EXISTS sync_batch_object_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_batch_key ON sync_batch (object_key, direction);

CREATE INDEX IF NOT EXISTS idx_sync_batch_outlet ON sync_batch (outlet_code, sequence DESC);

-- The next sequence a shop should write, per outlet. A gap in these is the
-- signal that a batch went missing, which is the whole reason they are numbered
-- rather than only timestamped.
CREATE TABLE IF NOT EXISTS sync_sequence (
    outlet_code varchar(20) PRIMARY KEY,
    next_value  bigint      NOT NULL DEFAULT 1 CHECK (next_value >= 1)
);

-- 5 ────────────────────────────────────────────────────────────────────────
-- How far the append-only tables have been sent.
--
-- Four tables in this schema refuse every UPDATE by trigger — audit_log,
-- inventory_movement, cash_movement and product_price_history. That is BR-2 and
-- BR-15 doing their job: a ledger somebody can edit is not a ledger. They
-- therefore cannot carry a synced_at that anybody writes, and their position is
-- kept here instead.
--
-- A high-water mark on created_at is enough because these tables only grow, and
-- re-sending a row on a tied timestamp costs nothing: the far end inserts on
-- conflict do nothing.
CREATE TABLE IF NOT EXISTS sync_watermark (
    table_name   varchar(64) PRIMARY KEY,
    last_sent_at timestamptz NOT NULL
);
