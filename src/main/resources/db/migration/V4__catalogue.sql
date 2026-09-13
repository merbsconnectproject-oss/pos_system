-- V4 · Product catalogue and units — FR-PROD, FR-UOM
--
-- Stock, weighted-average cost and reorder levels are per outlet and belong to
-- F (inventory), not here. This migration is the catalogue: what a product is,
-- what units it sells in, and what codes scan to it.

-- ------------------------------------------------------------- lists · FR-PROD-05

CREATE TABLE category (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT         NOT NULL UNIQUE,
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    synced_at  TIMESTAMPTZ
);

CREATE TABLE brand (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT         NOT NULL UNIQUE,
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    synced_at  TIMESTAMPTZ
);

-- ------------------------------------------------------------- product · FR-PROD-01

CREATE TABLE product (
    id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),

    -- FR-PROD-02: unique across the system, not per outlet. Case-insensitively
    -- so "RAD-LGT-001" and "rad-lgt-001" cannot both exist and be mistaken for
    -- one another on a printed label.
    sku           TEXT           NOT NULL,

    name          TEXT           NOT NULL,
    description   TEXT,
    category_id   UUID           REFERENCES category (id),
    brand_id      UUID           REFERENCES brand (id),
    supplier_id   UUID,          -- K adds the supplier table; no FK until it exists

    -- FR-UOM-01: the smallest sellable unit. Every quantity in the system is
    -- stored in this unit, so it is not editable once movements exist.
    base_unit     TEXT           NOT NULL,

    -- BR-11 governs stored *amounts*; these are per-unit *rates*, so they keep
    -- four decimals. 3 x 18.335 settles to 55.01; rounding the rate first gives
    -- 55.02 and the receipt stops adding up.
    retail_price  NUMERIC(12,4)  NOT NULL DEFAULT 0,
    trade_price   NUMERIC(12,4)  NOT NULL DEFAULT 0,
    floor_price   NUMERIC(12,4)  NOT NULL DEFAULT 0,

    image_url     TEXT,

    -- BR-17 · FR-PROD-08: deactivation, never deletion. Sale lines reference this row.
    is_active     BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
    synced_at     TIMESTAMPTZ,

    -- BR-10: the floor is the lowest price approval can authorise, so a floor
    -- above retail would make every sale need approval.
    CONSTRAINT product_floor_not_above_retail CHECK (floor_price <= retail_price)
);

CREATE UNIQUE INDEX idx_product_sku_unique ON product (upper(sku));
CREATE INDEX idx_product_active_name ON product (is_active, name);
CREATE INDEX idx_product_category ON product (category_id);
CREATE INDEX idx_product_brand ON product (brand_id);

-- ------------------------------------------------------------- units · FR-UOM-02/04

CREATE TABLE product_selling_unit (
    id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id        UUID           NOT NULL REFERENCES product (id) ON DELETE CASCADE,
    name              TEXT           NOT NULL,

    -- FR-UOM-02: how many base units one of these is. BR-12's 3 decimals apply
    -- to quantities; a factor may be finer, so it carries four.
    conversion_factor NUMERIC(14,4)  NOT NULL,

    -- FR-UOM-04: a unit may price independently rather than as a multiple —
    -- a drum is usually cheaper per metre than a cut length.
    price             NUMERIC(12,4)  NOT NULL,
    trade_price       NUMERIC(12,4),

    sort_order        INT            NOT NULL DEFAULT 0,

    CONSTRAINT selling_unit_name_unique_per_product UNIQUE (product_id, name),

    -- A zero or negative factor divides by zero on conversion, or turns a sale
    -- into a stock increase.
    CONSTRAINT selling_unit_factor_positive CHECK (conversion_factor > 0)
);

CREATE INDEX idx_selling_unit_product ON product_selling_unit (product_id, sort_order);

-- ------------------------------------------------------------- barcodes · FR-PROD-03/04

CREATE TABLE product_barcode (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID         NOT NULL REFERENCES product (id) ON DELETE CASCADE,

    -- FR-PROD-03: unique system-wide. A code that scanned to two products would
    -- make the counter ambiguous at exactly the moment it must not be.
    code       TEXT         NOT NULL UNIQUE,

    -- FR-PROD-04: the unit this code identifies, so scanning the carton code
    -- adds a carton and not one piece. Matches a selling unit's name, or the
    -- product's base unit when the code identifies a single base unit.
    unit_name  TEXT         NOT NULL,

    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    synced_at  TIMESTAMPTZ
);

CREATE INDEX idx_barcode_product ON product_barcode (product_id);

-- ------------------------------------------------------------- search · NFR-1

-- NFR-1 wants a four-term partial query in the top three under 300 ms at 3,000
-- products. LIKE '%term%' cannot use a b-tree, so trigrams do the work.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_product_name_trgm ON product USING gin (name gin_trgm_ops);
CREATE INDEX idx_product_sku_trgm  ON product USING gin (sku gin_trgm_ops);

-- ------------------------------------------------------------- price history · FR-PROD-09

CREATE TABLE product_price_history (
    id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id    UUID           NOT NULL REFERENCES product (id) ON DELETE CASCADE,
    retail_price  NUMERIC(12,4)  NOT NULL,
    trade_price   NUMERIC(12,4)  NOT NULL,
    floor_price   NUMERIC(12,4)  NOT NULL,
    changed_by    UUID           REFERENCES app_user (id),
    changed_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
    synced_at     TIMESTAMPTZ
);

CREATE INDEX idx_price_history_product ON product_price_history (product_id, changed_at DESC);

-- FR-PROD-09 is a record of what a price *was*, so it is append-only for the
-- same reason as the audit log: a rewritten history cannot be evidence.
-- Its own function, not reject_audit_mutation() — that one raises "audit_log is
-- append-only", which would be a confusing thing to read about a price row.
CREATE OR REPLACE FUNCTION reject_price_history_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'product_price_history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER price_history_no_update
    BEFORE UPDATE OR DELETE ON product_price_history
    FOR EACH ROW EXECUTE FUNCTION reject_price_history_mutation();
