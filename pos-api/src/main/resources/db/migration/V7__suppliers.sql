-- V7 · Suppliers and goods receipt — FR-SUP, BR-4
--
-- The goods receipt is the only path that moves weighted average cost, so it is
-- a document rather than a gesture: it is recorded, referenced by the stock
-- movements it caused, and never edited afterwards.

-- ------------------------------------------------------------- suppliers · FR-SUP-01

CREATE TABLE supplier (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT         NOT NULL,
    contact_person    TEXT,
    phone             TEXT,
    email             TEXT,
    address           TEXT,

    -- FR-SUP-01. Free text rather than an enum: the frontend offers four, but a
    -- shop that agrees "Net 45" with a supplier should not need a migration.
    payment_terms     TEXT,

    notes             TEXT,
    category_supplied TEXT,

    -- Null means every branch. FR-OUT-03 tags transactions to an outlet; a
    -- supplier is a party, and most serve the whole business.
    outlet_id         UUID         REFERENCES outlet (id),

    -- BR-17: deactivation, never deletion. Receipts reference this row.
    is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    synced_at         TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_supplier_name_ci ON supplier (upper(name));
CREATE INDEX idx_supplier_active_name ON supplier (is_active, name);

-- ------------------------------------------------------------- receipts · FR-SUP-02/03

CREATE TABLE goods_receipt (
    id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),

    -- FR-SUP-02: into a specific outlet, always.
    outlet_id     UUID           NOT NULL REFERENCES outlet (id),
    supplier_id   UUID           NOT NULL REFERENCES supplier (id),

    -- The supplier's own invoice or delivery note number, as written on paper.
    reference     TEXT,
    note          TEXT,

    -- FR-SUP-06: a receipt is confirmed once. Until then it moves no stock;
    -- after, it cannot be edited, only reversed by a correcting document.
    confirmed_at  TIMESTAMPTZ,
    confirmed_by  UUID           REFERENCES app_user (id),

    -- The correcting document, when one exists, and the one it corrects.
    reverses_id   UUID           REFERENCES goods_receipt (id),

    created_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
    created_by    UUID           REFERENCES app_user (id),
    synced_at     TIMESTAMPTZ
);

CREATE INDEX idx_receipt_supplier ON goods_receipt (supplier_id, created_at DESC);
CREATE INDEX idx_receipt_outlet ON goods_receipt (outlet_id, created_at DESC);

-- A reversal exists once per document, or "reversed" stops being a fact.
CREATE UNIQUE INDEX idx_receipt_one_reversal ON goods_receipt (reverses_id)
    WHERE reverses_id IS NOT NULL;

CREATE TABLE goods_receipt_line (
    id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id        UUID           NOT NULL REFERENCES goods_receipt (id) ON DELETE CASCADE,
    product_id        UUID           NOT NULL REFERENCES product (id),

    -- FR-SUP-03 · FR-UOM-05: goods arrive in a purchase unit — 3 drums — and
    -- both the unit and the factor are kept, so the receipt still reads as it
    -- was written after someone edits the product's units.
    purchase_unit     TEXT           NOT NULL,
    conversion_factor NUMERIC(14,4)  NOT NULL,
    quantity          NUMERIC(14,3)  NOT NULL,

    -- What one purchase unit cost. The per-base cost is derived, not stored:
    -- two figures that must agree eventually do not.
    unit_cost         NUMERIC(12,4)  NOT NULL,

    CONSTRAINT receipt_line_quantity_positive CHECK (quantity > 0),
    CONSTRAINT receipt_line_factor_positive CHECK (conversion_factor > 0),

    -- One line per product per receipt. Two batches of the same product at
    -- different costs are two receipts — and this is what keeps the movement
    -- idempotency key (source_type, source_id, product_id, type) unique.
    CONSTRAINT receipt_line_one_per_product UNIQUE (receipt_id, product_id)
);

CREATE INDEX idx_receipt_line_product ON goods_receipt_line (product_id);

-- FR-SUP-06: confirmed receipts are evidence of what was delivered and what it
-- cost. Correction is a reversing document, the same rule BR-3 applies to sales.
CREATE OR REPLACE FUNCTION reject_confirmed_receipt_change() RETURNS trigger AS $$
BEGIN
    IF OLD.confirmed_at IS NOT NULL THEN
        RAISE EXCEPTION 'a confirmed goods receipt cannot be changed: reverse it instead';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER goods_receipt_no_edit_after_confirm
    BEFORE UPDATE OR DELETE ON goods_receipt
    FOR EACH ROW EXECUTE FUNCTION reject_confirmed_receipt_change();
