-- FR-SET-01 logo upload, and FR-CUST-07 credit limits.
--
-- Both were half-built in the same way: a field existed for the *reference* to
-- something, and nothing could produce the something.
--
-- 1. `business_settings.logo_url` stored a URL, so the shop's logo had to
--    already live somewhere on the internet — on a counter with no reliable
--    connection, which is the whole premise of this deployment. The bytes now
--    live beside the setting, and the application serves them.
--
-- 2. `credit_limit` appeared nowhere in the server at all. Installment plans
--    could be created without limit, so "customer credit" had a schedule and a
--    receipt but no ceiling: the one control that makes credit a policy rather
--    than a hope.

-- --------------------------------------------------------------- FR-SET-01

ALTER TABLE business_settings
    ADD COLUMN logo_bytes BYTEA,
    ADD COLUMN logo_content_type VARCHAR(100),
    ADD COLUMN logo_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN business_settings.logo_bytes IS
    'FR-SET-01: the logo itself. Held here rather than on disk so a database '
    'backup carries it — a restore that comes back without the shop''s logo on '
    'its receipts is a restore somebody has to finish by hand.';

ALTER TABLE business_settings
    ADD CONSTRAINT business_settings_logo_complete
        CHECK ((logo_bytes IS NULL AND logo_content_type IS NULL)
            OR (logo_bytes IS NOT NULL AND logo_content_type IS NOT NULL));

-- ------------------------------------------------------------- FR-CUST-07

ALTER TABLE customer
    ADD COLUMN credit_limit NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN customer.credit_limit IS
    'FR-CUST-07: the most this customer may owe across open installment plans. '
    'Zero means no limit *set*, not no credit: the column defaults to zero, so '
    'the other reading would have this migration deny credit to every customer '
    'the shop already serves. A limit applies from the moment somebody sets one.';

ALTER TABLE customer
    ADD CONSTRAINT customer_credit_limit_not_negative CHECK (credit_limit >= 0);

-- The balance is deliberately *not* a column. It is the sum of what is still
-- owed on this customer's open plans, and a stored copy would be a second
-- record of the same money — the first payment posted outside the one path
-- that maintained it would put the two out of step, with the shop refusing
-- credit to somebody who had already paid. Same reasoning as purchase orders,
-- where received quantity is summed on read rather than stored.

-- No index on (customer_id) either. A customer has a handful of plans, not a
-- page of them, and the statement reads them through the existing plan query.
