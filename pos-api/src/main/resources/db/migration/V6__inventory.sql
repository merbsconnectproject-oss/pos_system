-- V6 · Inventory — FR-INV, BR-1, BR-2, BR-4
--
-- BR-1: stock is never on the product record. There is no global quantity
-- anywhere in this schema — a level exists only for a (product, outlet) pair.
--
-- BR-2: the movement ledger is the truth and stock_level is a running total of
-- it. Keeping both is a deliberate denormalisation: the counter needs "how many
-- are there" in one indexed read while selling, and summing a ledger that grows
-- forever would get slower every day. NFR-17's nightly job re-proves the two
-- agree, and FR-INV's acceptance criterion is exactly that equality.

-- ------------------------------------------------------------- levels · BR-1

CREATE TABLE stock_level (
    id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID           NOT NULL REFERENCES product (id) ON DELETE CASCADE,
    outlet_id       UUID           NOT NULL REFERENCES outlet (id),

    -- BR-12: three decimals, in the product's base unit, to support cut lengths.
    quantity        NUMERIC(14,3)  NOT NULL DEFAULT 0,

    -- BR-4: weighted average cost, per outlet. Four decimals because it is a
    -- per-unit rate, not a settled amount — see the note in V4 on prices.
    average_cost    NUMERIC(12,4)  NOT NULL DEFAULT 0,

    -- FR-INV-08: reorder level is per outlet. A branch that sells ten a day
    -- and one that sells one do not share a threshold.
    reorder_level   NUMERIC(14,3)  NOT NULL DEFAULT 0,

    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    synced_at       TIMESTAMPTZ,

    CONSTRAINT stock_level_one_per_product_outlet UNIQUE (product_id, outlet_id)
);

CREATE INDEX idx_stock_level_outlet ON stock_level (outlet_id);
-- FR-INV-08: "what is at or below its reorder level here", on the dashboard.
CREATE INDEX idx_stock_level_low ON stock_level (outlet_id, product_id)
    WHERE quantity <= reorder_level;

-- ------------------------------------------------------------- ledger · BR-2

CREATE TYPE movement_type AS ENUM (
    'OPENING',          -- FR-INV-02: the starting count when a product is set up
    'RECEIPT',          -- goods in from a supplier (K)
    'SALE',             -- G
    'SALE_VOID',        -- BR-3: the reversing movement, never a deletion
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
    'DAMAGE',
    'LOSS'
);

CREATE TABLE inventory_movement (
    id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID           NOT NULL REFERENCES product (id),
    outlet_id       UUID           NOT NULL REFERENCES outlet (id),

    type            movement_type  NOT NULL,

    -- Signed, in base units. Positive adds, negative removes. One column rather
    -- than a quantity plus a direction flag, because the sum of this column is
    -- the level and any second field could disagree with it.
    quantity_delta  NUMERIC(14,3)  NOT NULL,

    -- BR-5: the cost at the moment of the movement, frozen. A later price
    -- change must never alter historical profit.
    unit_cost       NUMERIC(12,4),

    -- FR-INV-05: adjustments carry a reason code; receipts and sales carry the
    -- document they came from.
    reason          TEXT,
    note            TEXT,
    source_type     TEXT,
    source_id       UUID,

    -- BR-9: an oversell is permitted to holders of stock.oversell and flagged,
    -- so FR-INV-10's exceptions view can find it.
    is_exception    BOOLEAN        NOT NULL DEFAULT FALSE,

    actor_id        UUID           REFERENCES app_user (id),
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    synced_at       TIMESTAMPTZ,

    -- A zero-quantity movement records nothing and would sit in the ledger
    -- looking like an event.
    CONSTRAINT movement_delta_not_zero CHECK (quantity_delta <> 0)
);

CREATE INDEX idx_movement_product_outlet ON inventory_movement (product_id, outlet_id, created_at DESC);
CREATE INDEX idx_movement_outlet_created ON inventory_movement (outlet_id, created_at DESC);
CREATE INDEX idx_movement_type_created   ON inventory_movement (type, created_at DESC);
CREATE INDEX idx_movement_exceptions     ON inventory_movement (outlet_id, created_at DESC)
    WHERE is_exception;

-- BR-7 · FR-SYNC-05: a sale submitted twice — a double-click, a retry, a
-- reconnect — must not decrement stock twice. The source document's id is the
-- idempotency key, so the second write loses to this index rather than to
-- application logic that could be raced.
CREATE UNIQUE INDEX idx_movement_source_unique
    ON inventory_movement (source_type, source_id, product_id, type)
    WHERE source_id IS NOT NULL;

-- BR-2: the ledger is evidence. Correcting a mistake means writing the opposite
-- movement, which is what SALE_VOID and the ADJUSTMENT pair are for.
CREATE OR REPLACE FUNCTION reject_movement_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'inventory_movement is append-only: correct with a reversing movement';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER movement_no_update
    BEFORE UPDATE OR DELETE ON inventory_movement
    FOR EACH ROW EXECUTE FUNCTION reject_movement_mutation();
