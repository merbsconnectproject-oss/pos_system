-- V3 · Outlets — FR-OUT
--
-- Reconciles the outlet row with the frozen frontend contract (`types.ts`
-- Outlet) and collapses two columns that were always one concept.
--
-- `code` and `receipt_prefix` held the same value and meant the same thing:
-- the {OUTLET} segment of BR-6's {OUTLET}-{TERMINAL}-{SEQ}. The frontend has a
-- single such field and already joins on `code` (`App.tsx` matches its
-- receiptPrefix against the session's outlet code), so two columns free to
-- diverge could only ever produce a silent mismatch — the join fails, the
-- outlet falls back to its UUID, and receipts print a prefix nobody selected.
--
-- The printed value wins where they differ, and the UNIQUE index on `code`
-- makes a genuine conflict fail the migration rather than pick a winner.

UPDATE outlet SET code = receipt_prefix WHERE code IS DISTINCT FROM receipt_prefix;

ALTER TABLE outlet DROP COLUMN receipt_prefix;

-- BR-6: a hyphen here yields {OUTLET}-{TERMINAL}-{SEQ} with four segments and
-- the terminal repeated. The frontend rejects the same shape at the branch
-- form; this is the boundary that cannot be bypassed.
ALTER TABLE outlet ADD CONSTRAINT outlet_code_is_receipt_safe
    CHECK (code ~ '^[A-Z0-9]{2,6}$');

COMMENT ON COLUMN outlet.code IS
    'BR-6: the {OUTLET} segment of a receipt number, e.g. INC in INC-01-004312. No hyphen.';

-- FR-OUT-02 · K-04: the branch form collects these two, and reports group by
-- town. Nullable because V1 rows predate them.
ALTER TABLE outlet ADD COLUMN town         TEXT;
ALTER TABLE outlet ADD COLUMN manager_name TEXT;

COMMENT ON COLUMN outlet.town IS 'FR-OUT-02: branch town, shown in the header and on reports';
COMMENT ON COLUMN outlet.manager_name IS 'FR-OUT-02: branch manager, display only — not an authorisation';

-- FR-OUT-05/06 scope every list by the caller's assigned outlets, so this is
-- on the hot path of most reads once C onward land.
CREATE INDEX idx_outlet_active_name ON outlet (is_active, name);
