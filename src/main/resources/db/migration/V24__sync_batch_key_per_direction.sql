-- Repairs a database that applied an earlier draft of V22.
--
-- V22 first declared sync_batch.object_key UNIQUE on its own. That is wrong: one
-- instance that both sells and receives writes a batch and later reads it back,
-- and those are two facts about the same object. Keying on the object alone made
-- the second insert silently do nothing, so every batch was ingested again on
-- every run.
--
-- V22 was corrected, but a database that had already applied the earlier draft
-- keeps the old constraint — it will not re-run. This brings it into line.
--
-- A no-op on any database that applied the corrected V22, which is why every
-- statement is guarded rather than assumed.
ALTER TABLE sync_batch DROP CONSTRAINT IF EXISTS sync_batch_object_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_batch_key ON sync_batch (object_key, direction);

-- The watermark table arrived in the same edit. A database that applied the
-- first draft has no idea the append-only ledgers need one, and the push fails
-- against a table that is not there.
CREATE TABLE IF NOT EXISTS sync_watermark (
    table_name   varchar(64) PRIMARY KEY,
    last_sent_at timestamptz NOT NULL
);
