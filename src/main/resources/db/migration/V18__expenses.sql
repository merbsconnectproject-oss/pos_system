-- Feature S · Operating expenses — the accounting module's ledger.
--
-- These were recorded in the browser and nowhere else: an owner typed the rent
-- in, saw it on the screen, refreshed, and it was gone. Worse than losing it,
-- the P&L beside it was computed from the same vanishing list, so the net
-- profit on screen was a number about nothing.
--
-- An expense is not a cash movement. `cash_movement` (V10) is the drawer: money
-- physically leaving a till during a shift, which has to reconcile against a
-- blind count (BR-13, BR-14). Rent paid by bank transfer never touches a
-- drawer. Keeping them apart is the same reason BR-2 keeps cash out of the
-- stock ledger — one table, one meaning.

CREATE TABLE expense (
    id              uuid         PRIMARY KEY,

    -- The date the money was spent, which is not the date it was typed in.
    -- A P&L for September has to include the rent somebody entered in October.
    spent_on        date         NOT NULL,

    category        varchar(40)  NOT NULL
        CHECK (category IN (
            'RENT_LEASE', 'UTILITIES_POWER', 'STAFF_PAYROLL', 'DELIVERY_HAULAGE',
            'ADVERTISING_MARKETING', 'MAINTENANCE_REPAIRS', 'PACKAGING_BAGS',
            'TAXES_LEVIES_LICENSES', 'OFFICE_COMMUNICATION', 'MISCELLANEOUS')),

    title           varchar(200) NOT NULL,
    description     varchar(1000),

    -- BR-11: pesewas, like every other stored amount in this schema. A P&L that
    -- disagreed with the sales figures by a rounding error would be worse than
    -- no P&L.
    amount_pesewas  bigint       NOT NULL CHECK (amount_pesewas > 0),

    -- Which shop the cost belongs to. NULL means the business as a whole —
    -- a licence covering both branches is not an Inco cost or a Radiance cost,
    -- and splitting it arbitrarily would make both outlets' P&L wrong.
    outlet_id       uuid         REFERENCES outlet (id),

    payee           varchar(200) NOT NULL,

    payment_method  varchar(30)  NOT NULL
        CHECK (payment_method IN (
            'CASH_DRAWER', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CHEQUE', 'CORPORATE_CARD')),

    reference_number varchar(80),

    -- The shop's accountant needs this separated at year end; it is not a
    -- calculation this system makes, only a fact it records.
    tax_deductible  boolean      NOT NULL DEFAULT false,

    -- PENDING is a commitment not yet paid — an invoice received. It belongs in
    -- the ledger (somebody owes it) but not in cash out, so the P&L counts it
    -- separately rather than pretending the money has gone.
    status          varchar(10)  NOT NULL DEFAULT 'PAID'
        CHECK (status IN ('PAID', 'PENDING')),

    recorded_by     uuid         NOT NULL REFERENCES app_user (id),
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now(),

    -- BR-17 in spirit: an expense on a filed P&L has to keep existing, so a
    -- delete is a flag and the row stays.
    is_voided       boolean      NOT NULL DEFAULT false,
    voided_by       uuid         REFERENCES app_user (id),
    voided_at       timestamptz,
    void_reason     varchar(400),

    synced_at       timestamptz
);

-- The P&L's own query: a period, optionally one outlet, live rows only.
CREATE INDEX idx_expense_period ON expense (spent_on DESC)
    WHERE is_voided = false;

CREATE INDEX idx_expense_outlet_period ON expense (outlet_id, spent_on DESC)
    WHERE is_voided = false;

-- Grouping the P&L by category is the breakdown an owner actually reads.
CREATE INDEX idx_expense_category ON expense (category, spent_on DESC)
    WHERE is_voided = false;
