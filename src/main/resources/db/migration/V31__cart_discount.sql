-- FR-POS-10: cart discounts, and who approved a discount.
--
-- Two gaps closed here, both of which let a concession leave no trace.
--
-- 1. A discount off the whole cart had nowhere to live. The till offered one,
--    reduced the total it asked the customer to pay, and sent the server only
--    the line discounts — so the payment arrived short of the server's own
--    total and every discounted sale was refused as a payment mismatch. The
--    concession is now apportioned across the lines (so returns, receipts and
--    the discount report need no special case), and `cart_discount` records
--    how much of `discount_total` was given at the cart rather than the line.
--
-- 2. `discount_approved_by` was accepted on the request, checked, and then
--    dropped. FR-AUDIT-02 asks for the discount override *and its approver*;
--    the log could only ever name the approver of a below-floor price.

ALTER TABLE sale
    ADD COLUMN cart_discount BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN sale.cart_discount IS
    'FR-POS-10: the part of discount_total conceded against the whole cart '
    'rather than a single line. Apportioned onto the lines for arithmetic; '
    'kept here so the discount report can tell the two apart.';

ALTER TABLE sale
    ADD CONSTRAINT sale_cart_discount_not_negative CHECK (cart_discount >= 0);

ALTER TABLE sale_item
    ADD COLUMN discount_approved_by UUID REFERENCES app_user (id);

COMMENT ON COLUMN sale_item.discount_approved_by IS
    'FR-POS-10 · FR-AUDIT-02: who authorised a discount past the seller''s own '
    'ceiling. Null when the discount was within it and needed nobody.';

-- No index on discount_approved_by. It would only serve "what did this manager
-- approve", which the discount report already answers from a scan of the lines
-- already filtered by date and outlet, and nothing has measured it as slow. An
-- index added on a guess is a guess that has to be maintained on every write.
