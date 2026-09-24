-- FR-POS-10 · FR-RPT-04: which part of a line's discount came from the cart.
--
-- V31 apportioned the cart concession onto the lines, which is what makes the
-- totals, the returns and the receipt correct without a special case anywhere.
-- What it lost was the ability to tell the two apart afterwards: `sale.cart_discount`
-- says a bill-level concession was given, and `sale_item.discount` says how much
-- came off this line, but nothing said how much of *this line's* discount was the
-- cart's share. The discount report could therefore label a sale but not a line.
--
-- Recorded per line rather than derived by re-running the apportionment on read.
-- A report that re-derives an allocation is a report that can disagree with the
-- sale it is describing — the rounding would only have to change once.

ALTER TABLE sale_item
    ADD COLUMN cart_discount_share BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN sale_item.cart_discount_share IS
    'FR-POS-10: the part of this line''s discount apportioned from a concession '
    'given against the whole cart. Always <= discount; the remainder was given '
    'against this line alone.';

ALTER TABLE sale_item
    ADD CONSTRAINT sale_item_cart_share_within_discount
        CHECK (cart_discount_share >= 0 AND cart_discount_share <= discount);
