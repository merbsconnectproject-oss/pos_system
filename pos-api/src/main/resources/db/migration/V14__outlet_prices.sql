-- Feature E · Pricing — FR-PRICE-03
--
-- AS-6: prices default to shared across outlets, with an optional per-outlet
-- override. The override is the exception, so it lives in its own table rather
-- than as three more columns on every product — a shop that never overrides
-- anything carries no rows at all, and "no override" is the absence of a row
-- rather than a null that has to be told apart from a deliberate zero.

CREATE TABLE product_outlet_price (
    product_id    uuid          NOT NULL REFERENCES product (id) ON DELETE CASCADE,
    outlet_id     uuid          NOT NULL REFERENCES outlet (id),

    -- Each level is overridden on its own. A branch that charges more for
    -- cable but keeps the same floor sets one column and leaves the others
    -- null, and null here means "use the product's", not "free".
    retail_price  numeric(12,4) CHECK (retail_price  >= 0),
    trade_price   numeric(12,4) CHECK (trade_price   >= 0),
    floor_price   numeric(12,4) CHECK (floor_price   >= 0),

    -- FR-PRICE-06: who set this branch's price, and when.
    updated_at    timestamptz   NOT NULL DEFAULT now(),
    updated_by    uuid          REFERENCES app_user (id),

    PRIMARY KEY (product_id, outlet_id)
);

-- A row that overrides nothing is a row that says nothing. Refusing it keeps
-- the table meaning what it says: every row here changes a price somewhere.
ALTER TABLE product_outlet_price
    ADD CONSTRAINT product_outlet_price_not_empty
        CHECK (retail_price IS NOT NULL OR trade_price IS NOT NULL OR floor_price IS NOT NULL);

CREATE INDEX idx_product_outlet_price_outlet ON product_outlet_price (outlet_id);

-- FR-PRICE-08: the replacement margin is measured against the latest purchase
-- cost, which is the unit cost of the most recent receipt at that branch. The
-- ledger already holds it; this index is so finding it is not a scan of every
-- movement the product has ever had.
CREATE INDEX idx_movement_latest_receipt
    ON inventory_movement (product_id, outlet_id, created_at DESC)
    WHERE type = 'RECEIPT' AND unit_cost IS NOT NULL;
