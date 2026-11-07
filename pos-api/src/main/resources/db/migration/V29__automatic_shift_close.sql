-- A scheduled close stops an abandoned shift from accepting another day's
-- sales, but it must not pretend somebody physically counted the drawer.
ALTER TABLE shift ADD COLUMN automatically_closed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE shift DROP CONSTRAINT shift_close_is_complete;
ALTER TABLE shift ADD CONSTRAINT shift_close_is_complete CHECK (
       (status = 'OPEN'
        AND automatically_closed = FALSE
        AND counted_cash IS NULL
        AND expected_cash IS NULL
        AND variance IS NULL
        AND closed_at IS NULL
        AND closed_by IS NULL)
    OR (status = 'CLOSED'
        AND automatically_closed = FALSE
        AND counted_cash IS NOT NULL
        AND expected_cash IS NOT NULL
        AND variance IS NOT NULL
        AND closed_at IS NOT NULL)
    OR (status = 'CLOSED'
        AND automatically_closed = TRUE
        AND counted_cash IS NULL
        AND expected_cash IS NOT NULL
        AND variance IS NULL
        AND closed_at IS NOT NULL
        AND closed_by IS NULL)
);
