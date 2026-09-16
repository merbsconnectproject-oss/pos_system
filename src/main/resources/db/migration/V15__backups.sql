-- NFR-6 · NFR-7 · FR-SET-07: backup history.
--
-- The risk this exists for is the one in the delivery plan's own table:
-- "counter PC disk failure loses a shop's history". A backup nobody can see
-- the state of is indistinguishable from no backup at all, which is why the
-- runs are recorded rather than only logged — an owner has to be able to look
-- at a screen and know the last one worked, and when.

CREATE TABLE backup_run (
    id           uuid         PRIMARY KEY,

    kind         varchar(20)  NOT NULL
        CHECK (kind IN ('SCHEDULED', 'MANUAL', 'RESTORE')),

    started_at   timestamptz  NOT NULL DEFAULT now(),
    finished_at  timestamptz,

    outcome      varchar(20)  NOT NULL DEFAULT 'RUNNING'
        CHECK (outcome IN ('RUNNING', 'SUCCEEDED', 'FAILED')),

    file_name    varchar(200),
    size_bytes   bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),

    -- Where it actually landed, and whether that is somewhere the fire is not.
    -- A copy on the same disk as the database is a backup of a mistake, not of
    -- a disk failure, so the two are recorded separately and the screen says
    -- which it has.
    stored_local boolean      NOT NULL DEFAULT false,
    stored_offsite boolean    NOT NULL DEFAULT false,
    destination  varchar(200),

    -- Kept in full. "The backup failed" without the reason is a line nobody
    -- can act on at eight in the morning.
    error        text,

    actor_id     uuid         REFERENCES app_user (id)
);

CREATE INDEX idx_backup_run_recent ON backup_run (started_at DESC);

-- Finding the last good one is the question the screen asks on every load.
CREATE INDEX idx_backup_run_succeeded
    ON backup_run (finished_at DESC)
    WHERE outcome = 'SUCCEEDED';

-- NFR-6 is about restores as much as backups, and a restore that nobody
-- recorded is a gap in the history of the database it restored. The restore
-- script writes its own row here once the server is back up.
