-- Feature T · Returns and exchanges — FR-POS (refunds), `sale.refund`.
--
-- A return is not a void. BR-3's void cancels a whole sale that should never
-- have happened; a return is a later, separate event in which specific goods
-- come back, possibly days afterwards, possibly only some of them. Both write
-- reversing movements and neither ever deletes anything, but conflating them
-- would mean a shop could not refund two of five items without cancelling the
-- sale that correctly recorded the other three.
--
-- Three things this table exists to get right, all of which are easy to get
-- wrong and expensive to notice later:
--
--   1. The refund is at the price the customer actually paid, discount and all
--      — not today's price. A customer who bought at 20% off and is refunded at
--      full price is a way to lose money that no report would flag.
--   2. The cost is the cost frozen on the original sale line (BR-5). Refunding
--      at today's average cost would restate the profit of a sale made months
--      ago every time stock is received at a new price.
--   3. Nothing can be returned twice. The quantity already returned against a
--      sale line is the constraint, and it is checked against the ledger.

-- Stock coming back from a customer, and stock going out to a supplier as a
-- warranty claim. Neither existed: ADJUSTMENT_IN/OUT are hand-entered
-- corrections (FR-INV-06 treats them as needing approval past a threshold), and
-- a return is a document, not a correction.
ALTER TYPE movement_type ADD VALUE IF NOT EXISTS 'CUSTOMER_RETURN';
ALTER TYPE movement_type ADD VALUE IF NOT EXISTS 'SUPPLIER_RETURN';

-- Per-outlet numbering for the customer's copy. Deliberately not BR-6's receipt
-- sequence: that rule governs receipts, which must be gapless because they are
-- the legal record of a sale. A return document is a credit note, and a gap in
-- them costs nothing.
CREATE TABLE return_sequence (
    outlet_id   uuid    PRIMARY KEY REFERENCES outlet (id),
    next_value  bigint  NOT NULL DEFAULT 1 CHECK (next_value >= 1)
);

CREATE TABLE sale_return (
    id                  uuid          PRIMARY KEY,

    -- {OUTLET}-R000001
    return_number       varchar(40)   NOT NULL UNIQUE,

    -- FR: returns are processed against a receipt. Required, because without the
    -- original there is no price the customer paid and no cost to reverse — the
    -- two things this document exists to carry.
    original_sale_id    uuid          NOT NULL REFERENCES sale (id),

    outlet_id           uuid          NOT NULL REFERENCES outlet (id),
    terminal_id         uuid          REFERENCES terminal (id),

    -- REFUND gives money back. EXCHANGE settles the value against new goods,
    -- which is a second, ordinary sale linked below — so the swapped-for items
    -- get their own receipt number, their own stock movements and their own
    -- cost, exactly like anything else sold.
    kind                varchar(10)   NOT NULL CHECK (kind IN ('REFUND', 'EXCHANGE')),

    -- BR-11: pesewas. The value of the goods coming back, at the price paid.
    refund_total_pesewas bigint       NOT NULL CHECK (refund_total_pesewas >= 0),

    -- EXCHANGE only: the sale created for the replacement goods.
    exchange_sale_id    uuid          REFERENCES sale (id),

    -- Positive: the customer paid the difference. Negative: the shop paid it
    -- back. Zero for an even swap. Stored rather than derived so the document
    -- states what actually happened at the counter.
    settlement_pesewas  bigint        NOT NULL DEFAULT 0,

    -- How the money went back, when it did. Cash refunds also write a
    -- cash_movement so the drawer reconciles at close (BR-13, BR-14).
    refund_method       varchar(20)
        CHECK (refund_method IS NULL OR refund_method IN
              ('CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'EXCHANGE_CREDIT')),

    customer_id         uuid          REFERENCES customer (id),

    notes               varchar(1000),

    cashier_id          uuid          NOT NULL REFERENCES app_user (id),

    -- Who authorised it, when the shop requires approval for refunds. Null when
    -- the cashier held sale.refund themselves.
    approved_by         uuid          REFERENCES app_user (id),

    created_at          timestamptz   NOT NULL DEFAULT now(),
    synced_at           timestamptz
);

CREATE INDEX idx_return_sale ON sale_return (original_sale_id);
CREATE INDEX idx_return_outlet_date ON sale_return (outlet_id, created_at DESC);
CREATE INDEX idx_return_customer ON sale_return (customer_id, created_at DESC)
    WHERE customer_id IS NOT NULL;

CREATE TABLE sale_return_item (
    id                  uuid          PRIMARY KEY,
    return_id           uuid          NOT NULL REFERENCES sale_return (id) ON DELETE CASCADE,

    -- The line being returned. This is what caps the quantity and supplies both
    -- the price paid and the frozen cost.
    sale_item_id        uuid          NOT NULL REFERENCES sale_item (id),

    product_id          uuid          NOT NULL REFERENCES product (id),
    -- Frozen, like sale_item's: renaming a product must not rewrite a credit
    -- note the customer is holding.
    product_name        varchar(300)  NOT NULL,

    quantity_base       numeric(14,3) NOT NULL CHECK (quantity_base > 0),

    -- What the customer actually paid per base unit on the original line,
    -- discount included.
    unit_price          numeric(12,4) NOT NULL CHECK (unit_price >= 0),
    line_refund_pesewas bigint        NOT NULL CHECK (line_refund_pesewas >= 0),

    -- BR-5: copied from the original sale line, never recomputed.
    frozen_cost_price   numeric(12,4) NOT NULL CHECK (frozen_cost_price >= 0),

    reason              varchar(60)   NOT NULL,

    -- RESTOCK puts it back on the shelf. DAMAGED_WRITE_OFF takes it back and
    -- writes it off — recorded as two movements, in then out, because the item
    -- physically returned and BR-2 makes the ledger the account of what happened.
    -- SUPPLIER_RMA sends it on to the supplier as a warranty claim.
    disposition         varchar(24)   NOT NULL
        CHECK (disposition IN ('RESTOCK', 'DAMAGED_WRITE_OFF', 'SUPPLIER_RMA')),

    condition_notes     varchar(500)
);

CREATE INDEX idx_return_item_return ON sale_return_item (return_id);

-- "How much of this line has already come back?" — the question asked before
-- every return is accepted, and the reason a line cannot be returned twice.
CREATE INDEX idx_return_item_sale_item ON sale_return_item (sale_item_id);

-- What the damage report reads, and what a supplier claim is built from.
CREATE INDEX idx_return_item_disposition ON sale_return_item (disposition)
    WHERE disposition <> 'RESTOCK';
