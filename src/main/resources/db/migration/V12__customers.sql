-- Feature L · Customers — FR-CUST-02, FR-CUST-03, FR-CUST-04, FR-CUST-05
--
-- One list for the whole business. FR-CUST-05 is not a nicety: an electrician
-- who buys cable at one branch and conduit at the other is one customer, and a
-- per-branch list would quote them a different price depending on which door
-- they walked through.

CREATE TABLE customer (
    id            uuid         PRIMARY KEY,

    name          varchar(200) NOT NULL,

    -- FR-CUST-03: the phone as the customer says it, and the key it is found
    -- by. Two columns because "0244 123 456" and "+233244123456" are the same
    -- person, and the shop should not have to remember which spelling it used.
    phone         varchar(40)  NOT NULL,
    phone_key     varchar(20)  NOT NULL,

    email         varchar(320),
    address       varchar(240),

    -- FR-CUST-04: the type is what maps to a price level. A CHECK rather than
    -- an enum type so adding one is a migration and not a type rewrite.
    type          varchar(20)  NOT NULL DEFAULT 'retail'
        CHECK (type IN ('retail', 'electrician', 'contractor', 'company')),

    -- FR-PRICE-05: a standing discount for this customer. Defaulted from the
    -- type when they are created and editable afterwards, because the deal a
    -- shop does with one contractor is not the deal it does with all of them.
    discount_rate numeric(5,2) NOT NULL DEFAULT 0
        CHECK (discount_rate >= 0 AND discount_rate <= 100),

    notes         varchar(1000),

    -- BR-17: deactivated, never deleted. A customer on a receipt has to keep
    -- existing.
    is_active     boolean      NOT NULL DEFAULT true,

    created_at    timestamptz  NOT NULL DEFAULT now(),
    created_by    uuid         REFERENCES app_user (id),
    updated_at    timestamptz  NOT NULL DEFAULT now(),
    synced_at     timestamptz
);

-- FR-CUST-03: unique by the normalised key, not by what was typed. The index
-- is the guard; the service checks first only so the answer is a sentence.
CREATE UNIQUE INDEX idx_customer_phone_key ON customer (phone_key);

-- FR-CUST-06: every sale for one customer, newest first. V8 indexed the
-- customer alone; the history screen reads them in date order, and an index
-- that carries the order saves a sort on a page somebody scrolls.
DROP INDEX idx_sale_customer;
CREATE INDEX idx_sale_customer ON sale (customer_id, created_at DESC)
    WHERE customer_id IS NOT NULL;

-- Searching by name the way a counter does: part of a word, mid-string.
CREATE INDEX idx_customer_name_trgm ON customer USING gin (name gin_trgm_ops);

-- NOT VALID on purpose. From here on a sale cannot name a customer who does
-- not exist; sales already recorded are left exactly as they are. Validating
-- would mean either failing this migration on somebody's historic data or
-- quietly editing a completed sale, and BR-3 says a sale is not edited.
ALTER TABLE sale
    ADD CONSTRAINT sale_customer_id_fkey FOREIGN KEY (customer_id)
        REFERENCES customer (id) NOT VALID;
