-- FR-SUP-08: purchase orders, with partial, over- and short-delivery.
--
-- A purchase order is a *commitment*, not a movement. Raising one moves no stock
-- and no money; it becomes stock only through a confirmed goods receipt. That is
-- why no column here holds a received quantity: ordered lives in this table, and
-- received is summed from the receipt lines that point at it. Two figures that
-- must agree eventually do not — the same reasoning that makes the stock ledger,
-- not a level column, the truth under BR-2.
--
-- Over- and short-delivery therefore need no special storage either. Both are
-- the same subtraction: ordered minus received. A supplier who sends 11 of the
-- 10 you ordered is over; one who sends 8 and nothing more is short, and somebody
-- closes the order with a reason saying so.

CREATE TYPE purchase_order_status AS ENUM ('DRAFT', 'SENT', 'CLOSED', 'CANCELLED');

CREATE TABLE purchase_order (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

    -- {OUTLET}-PO-000001. Per-outlet, like every other document number here, so
    -- two shops that both order on the same morning do not both raise PO-000007.
    number        TEXT          NOT NULL,

    outlet_id     UUID          NOT NULL REFERENCES outlet (id),
    supplier_id   UUID          NOT NULL REFERENCES supplier (id),

    status        purchase_order_status NOT NULL DEFAULT 'DRAFT',

    -- When the supplier promised it. A date, not a timestamp: nobody agrees a
    -- delivery to the minute, and pretending otherwise invites a false precision
    -- into the "overdue" report.
    expected_on   DATE,
    note          TEXT,

    -- Sent is the point of no return: the supplier now holds a copy, so the
    -- lines stop being editable.
    sent_at       TIMESTAMPTZ,
    sent_by       UUID          REFERENCES app_user (id),

    -- Closed covers both endings — received in full, and "they are never sending
    -- the rest". The reason is what tells the two apart a month later.
    closed_at     TIMESTAMPTZ,
    closed_by     UUID          REFERENCES app_user (id),
    close_reason  TEXT,

    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by    UUID          REFERENCES app_user (id),

    -- Nulled whenever the order changes, so the owner's copy follows it up the
    -- transaction channel rather than freezing at whatever it was first sent as.
    synced_at     TIMESTAMPTZ,

    CONSTRAINT po_number_per_outlet UNIQUE (outlet_id, number),

    -- An implication, not an equality: a cancelled order may or may not have
    -- been sent first, and both are ordinary.
    CONSTRAINT po_sent_is_stamped
        CHECK (status NOT IN ('SENT', 'CLOSED') OR sent_at IS NOT NULL),

    -- Every ending carries a reason. "Received in full" is a reason; the service
    -- supplies it so that no ending is silent.
    CONSTRAINT po_close_has_reason
        CHECK (status NOT IN ('CLOSED', 'CANCELLED')
               OR (closed_at IS NOT NULL AND close_reason IS NOT NULL))
);

CREATE INDEX idx_po_outlet_status ON purchase_order (outlet_id, status, created_at DESC);
CREATE INDEX idx_po_supplier ON purchase_order (supplier_id, created_at DESC);

-- Outstanding orders by promised date is the screen somebody actually opens.
CREATE INDEX idx_po_expected ON purchase_order (expected_on)
    WHERE status = 'SENT';

CREATE TABLE purchase_order_line (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID          NOT NULL REFERENCES purchase_order (id) ON DELETE CASCADE,
    product_id        UUID          NOT NULL REFERENCES product (id),

    -- FR-UOM-05, and the same pair goods_receipt_line keeps: you order 3 drums,
    -- and the unit and its factor are frozen here so the order still reads as it
    -- was written after somebody edits the product's units.
    purchase_unit     TEXT          NOT NULL,
    conversion_factor NUMERIC(14,4) NOT NULL,
    quantity          NUMERIC(14,3) NOT NULL,

    -- Agreed cost per purchase unit. What arrives may cost something else; the
    -- receipt records that, and the difference is a price variance worth seeing.
    unit_cost         NUMERIC(12,4) NOT NULL,

    CONSTRAINT po_line_quantity_positive CHECK (quantity > 0),
    CONSTRAINT po_line_factor_positive CHECK (conversion_factor > 0),
    CONSTRAINT po_line_cost_not_negative CHECK (unit_cost >= 0),

    -- One line per product, which is what makes "how much of this is still
    -- outstanding" a single subtraction rather than a reconciliation.
    CONSTRAINT po_line_one_per_product UNIQUE (purchase_order_id, product_id)
);

CREATE INDEX idx_po_line_order ON purchase_order_line (purchase_order_id);
CREATE INDEX idx_po_line_product ON purchase_order_line (product_id);

-- ------------------------------------------------------------- receiving against an order

-- Nullable, and deliberately. Goods arrive without a purchase order every day —
-- a supplier's van turns up and the storekeeper receives it. Requiring an order
-- would only teach people to raise a fake one after the fact.
ALTER TABLE goods_receipt ADD COLUMN purchase_order_id UUID REFERENCES purchase_order (id);

CREATE INDEX idx_receipt_purchase_order ON goods_receipt (purchase_order_id)
    WHERE purchase_order_id IS NOT NULL;

-- ------------------------------------------------------------- numbering

CREATE TABLE purchase_order_sequence (
    outlet_id  UUID   PRIMARY KEY REFERENCES outlet (id),
    next_value BIGINT NOT NULL DEFAULT 1
);

-- ------------------------------------------------------------- what may change, and when

-- Once the supplier holds a copy, the lines are a record of what was agreed.
-- Changing them afterwards makes every delivery variance meaningless, because
-- the thing the delivery is compared against moved.
CREATE OR REPLACE FUNCTION reject_sent_order_line_change() RETURNS trigger AS $$
DECLARE
    state purchase_order_status;
BEGIN
    SELECT status INTO state FROM purchase_order
     WHERE id = coalesce(NEW.purchase_order_id, OLD.purchase_order_id);

    -- Null when the parent is being deleted in the same statement: a draft
    -- cascading away takes its lines with it, and that is not an edit.
    IF state IS NOT NULL AND state <> 'DRAFT' THEN
        RAISE EXCEPTION
            'an order already sent to the supplier cannot be changed: cancel it and raise another';
    END IF;

    RETURN coalesce(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER purchase_order_line_frozen_after_send
    BEFORE INSERT OR UPDATE OR DELETE ON purchase_order_line
    FOR EACH ROW EXECUTE FUNCTION reject_sent_order_line_change();

-- The lifecycle runs one way. A finished order is not reopened — the shop raises
-- another — and an order the supplier has already seen cannot quietly become a
-- draft again.
CREATE OR REPLACE FUNCTION reject_order_lifecycle_regress() RETURNS trigger AS $$
BEGIN
    IF NEW.number <> OLD.number THEN
        RAISE EXCEPTION 'a purchase order number is permanent once issued';
    END IF;

    IF NEW.status <> OLD.status THEN
        IF OLD.status IN ('CLOSED', 'CANCELLED') THEN
            RAISE EXCEPTION 'this order is already %: raise a new one',
                lower(OLD.status::text);
        END IF;
        IF NEW.status = 'DRAFT' THEN
            RAISE EXCEPTION 'an order the supplier has already received cannot return to draft';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER purchase_order_one_way_lifecycle
    BEFORE UPDATE ON purchase_order
    FOR EACH ROW EXECUTE FUNCTION reject_order_lifecycle_regress();
