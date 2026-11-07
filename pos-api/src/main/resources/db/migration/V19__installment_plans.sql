-- Feature S · Customer installment plans — FR-CUST credit, `customer.credit`.
--
-- Same defect as the expenses: a plan was created in the browser, shown on the
-- screen, and gone on refresh. Worse here, because a plan is a debt. A shop that
-- loses the schedule has no record of what a customer still owes, and the
-- customer has the goods.
--
-- The money is split three ways on purpose — what was agreed, what was paid up
-- front, and what each installment has actually received — because the question
-- the counter asks is "how much is left", and that has to be arithmetic over
-- recorded facts rather than a stored balance somebody has to remember to
-- update.

CREATE TABLE installment_plan (
    id                    uuid         PRIMARY KEY,

    -- Human reference, the one written on the customer's copy. Not BR-6: that
    -- rule governs receipts, which must be gapless because they are the legal
    -- record of a sale. A rolled-back plan leaving a gap here costs nothing.
    plan_number           varchar(30)  NOT NULL UNIQUE,

    customer_id           uuid         NOT NULL REFERENCES customer (id),

    -- Where the agreement was made. The customer is shared across branches
    -- (FR-CUST-05) but the plan belongs to the shop that let the goods go.
    outlet_id             uuid         NOT NULL REFERENCES outlet (id),

    -- Set when the goods went out on a completed sale. Null while a plan is
    -- agreed ahead of collection.
    sale_id               uuid         REFERENCES sale (id),

    -- BR-11: pesewas throughout.
    total_pesewas         bigint       NOT NULL CHECK (total_pesewas > 0),
    down_payment_pesewas  bigint       NOT NULL DEFAULT 0
        CHECK (down_payment_pesewas >= 0),

    -- A down payment cannot exceed the goods; there would be nothing to spread.
    CONSTRAINT down_payment_within_total
        CHECK (down_payment_pesewas <= total_pesewas),

    frequency             varchar(10)  NOT NULL
        CHECK (frequency IN ('WEEKLY', 'BIWEEKLY', 'MONTHLY')),

    installment_count     integer      NOT NULL CHECK (installment_count BETWEEN 1 AND 60),

    start_date            date         NOT NULL,

    -- DEFAULTED is a decision somebody makes, not a date arriving: an overdue
    -- installment is still collectable. Overdue is computed from the schedule;
    -- this column only records that the shop has given up on it.
    status                varchar(12)  NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'COMPLETED', 'DEFAULTED')),

    notes                 varchar(1000),

    created_by            uuid         NOT NULL REFERENCES app_user (id),
    created_at            timestamptz  NOT NULL DEFAULT now(),
    updated_at            timestamptz  NOT NULL DEFAULT now(),
    synced_at             timestamptz
);

CREATE INDEX idx_plan_customer ON installment_plan (customer_id, created_at DESC);
CREATE INDEX idx_plan_outlet ON installment_plan (outlet_id, created_at DESC);

-- "What is still owed across the shop" reads only the live ones.
CREATE INDEX idx_plan_active ON installment_plan (start_date)
    WHERE status = 'ACTIVE';

-- What was bought, frozen. The same reason sale_item keeps its own names and
-- prices (BR-5): renaming a product must not rewrite an agreement.
CREATE TABLE installment_plan_item (
    id              uuid         PRIMARY KEY,
    plan_id         uuid         NOT NULL REFERENCES installment_plan (id) ON DELETE CASCADE,

    product_id      uuid         REFERENCES product (id),
    product_name    varchar(300) NOT NULL,
    quantity        numeric(14,3) NOT NULL CHECK (quantity > 0),
    unit_price      numeric(12,4) NOT NULL CHECK (unit_price >= 0),
    line_total_pesewas bigint     NOT NULL CHECK (line_total_pesewas >= 0)
);

CREATE INDEX idx_plan_item_plan ON installment_plan_item (plan_id);

-- One row per due installment. Written in full when the plan is created, so the
-- customer can be handed the whole schedule on day one.
CREATE TABLE installment_schedule_item (
    id                 uuid        PRIMARY KEY,
    plan_id            uuid        NOT NULL REFERENCES installment_plan (id) ON DELETE CASCADE,

    installment_number integer     NOT NULL CHECK (installment_number >= 1),
    due_date           date        NOT NULL,

    expected_pesewas   bigint      NOT NULL CHECK (expected_pesewas > 0),

    -- Accumulates. A customer paying half of one installment is ordinary, and
    -- the row has to be able to say so rather than being PAID or not.
    paid_pesewas       bigint      NOT NULL DEFAULT 0 CHECK (paid_pesewas >= 0),

    paid_on            date,
    payment_method     varchar(20),
    reference          varchar(80),

    -- Derived and stored: PENDING, PARTIAL or PAID. OVERDUE is not here — it is
    -- a function of today against due_date, and a stored value would be wrong
    -- every morning until something ran to refresh it.
    status             varchar(10) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PARTIAL', 'PAID')),

    UNIQUE (plan_id, installment_number)
);

CREATE INDEX idx_schedule_plan ON installment_schedule_item (plan_id, installment_number);

-- The collections screen: what is due, oldest first, still owing.
CREATE INDEX idx_schedule_due ON installment_schedule_item (due_date)
    WHERE status <> 'PAID';

-- Plan numbers. A sequence rather than max()+1, which two counters taking a
-- plan at once would both read the same answer from.
CREATE SEQUENCE installment_plan_number_seq START WITH 1 INCREMENT BY 1;
