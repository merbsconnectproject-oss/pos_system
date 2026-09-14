-- V10 · Shifts and cash — FR-CASH, BR-13, BR-14
--
-- A shift is the unit a day's takings are counted in. Without one, cash sales
-- land nowhere and a drawer cannot be reconciled — which is why FR-POS-02 wants
-- the server, not just the till, to refuse a sale outside one.

CREATE TYPE shift_status AS ENUM ('OPEN', 'CLOSED');

CREATE TYPE cash_movement_type AS ENUM (
    'FLOAT_IN',     -- topping up the drawer mid-shift
    'PAYOUT',       -- money out for an expense, with a reason
    'DROP',         -- cash removed to the safe
    'CORRECTION'    -- FR-CASH-09: a closed shift is corrected by a movement,
                    -- never by reopening it
);

CREATE TABLE shift (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id       UUID          NOT NULL REFERENCES outlet (id),
    terminal_id     UUID          NOT NULL REFERENCES terminal (id),
    cashier_id      UUID          NOT NULL REFERENCES app_user (id),

    -- BR-14: the float the drawer started with, declared by the cashier.
    opening_float   BIGINT        NOT NULL,

    opened_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),

    status          shift_status  NOT NULL DEFAULT 'OPEN',

    -- FR-CASH-04: entered blind. The cashier submits what they counted before
    -- the system shows what it expected, so the count cannot be worked
    -- backwards from the answer.
    counted_cash    BIGINT,
    expected_cash   BIGINT,
    variance        BIGINT,

    -- FR-CASH-06: past the threshold, the variance has to be explained.
    variance_note   TEXT,

    closed_at       TIMESTAMPTZ,
    closed_by       UUID          REFERENCES app_user (id),
    synced_at       TIMESTAMPTZ,

    CONSTRAINT shift_float_not_negative CHECK (opening_float >= 0),

    -- An open shift has no count; a closed one has all three figures.
    CONSTRAINT shift_close_is_complete CHECK (
        (status = 'OPEN'   AND counted_cash IS NULL AND closed_at IS NULL)
     OR (status = 'CLOSED' AND counted_cash IS NOT NULL
                           AND expected_cash IS NOT NULL
                           AND variance IS NOT NULL
                           AND closed_at IS NOT NULL))
);

-- BR-13: one open shift per user, and one per terminal. Partial unique indexes
-- rather than an application check, because two sign-ins racing would both pass
-- a check and only one can pass an index.
CREATE UNIQUE INDEX idx_shift_one_open_per_cashier ON shift (cashier_id) WHERE status = 'OPEN';
CREATE UNIQUE INDEX idx_shift_one_open_per_terminal ON shift (terminal_id) WHERE status = 'OPEN';

CREATE INDEX idx_shift_outlet_opened ON shift (outlet_id, opened_at DESC);
CREATE INDEX idx_shift_cashier_opened ON shift (cashier_id, opened_at DESC);

-- FR-CASH-03: every movement of cash that is not a sale.
CREATE TABLE cash_movement (
    id          UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id    UUID                NOT NULL REFERENCES shift (id) ON DELETE CASCADE,

    type        cash_movement_type  NOT NULL,

    -- Signed, in pesewas. FLOAT_IN adds; PAYOUT and DROP remove. One column, so
    -- the drawer is the sum of it and nothing can disagree — the same reasoning
    -- as inventory_movement.quantity_delta.
    amount      BIGINT              NOT NULL,

    -- FR-CASH-03: each one carries a reason. A payout with no reason is
    -- indistinguishable from a shortfall.
    reason      TEXT                NOT NULL,
    note        TEXT,

    actor_id    UUID                REFERENCES app_user (id),
    created_at  TIMESTAMPTZ         NOT NULL DEFAULT now(),
    synced_at   TIMESTAMPTZ,

    CONSTRAINT cash_movement_not_zero CHECK (amount <> 0)
);

CREATE INDEX idx_cash_movement_shift ON cash_movement (shift_id, created_at);

-- BR-2's reasoning applied to money: the drawer's history is evidence, and a
-- correction is another movement rather than an edit.
CREATE OR REPLACE FUNCTION reject_cash_movement_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'cash_movement is append-only: correct with another movement';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cash_movement_immutable
    BEFORE UPDATE OR DELETE ON cash_movement
    FOR EACH ROW EXECUTE FUNCTION reject_cash_movement_mutation();

-- FR-CASH-09: a closed shift is never reopened.
CREATE OR REPLACE FUNCTION reject_shift_reopen() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'a shift is never deleted';
    END IF;
    IF OLD.status = 'CLOSED' THEN
        RAISE EXCEPTION 'a closed shift cannot be reopened: post a correcting cash movement';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shift_no_reopen
    BEFORE UPDATE OR DELETE ON shift
    FOR EACH ROW EXECUTE FUNCTION reject_shift_reopen();

-- FR-POS-02 · BR-13: a sale belongs to the shift it was rung up in, so a
-- cash-up can say which takings it is counting.
ALTER TABLE sale ADD COLUMN shift_id UUID REFERENCES shift (id);
CREATE INDEX idx_sale_shift ON sale (shift_id) WHERE shift_id IS NOT NULL;
