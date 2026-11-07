-- Upload frequency belongs to the business, not to a compiled scheduler.
-- Fifteen minutes preserves existing installations until an owner chooses a
-- lower-cost interval in Settings. The upper bound keeps stale configuration
-- mistakes from silently stopping cloud visibility for days.
ALTER TABLE business_settings
    ADD COLUMN cloud_sync_interval_minutes INTEGER NOT NULL DEFAULT 15;

ALTER TABLE business_settings
    ADD CONSTRAINT business_settings_cloud_sync_interval_valid
        CHECK (cloud_sync_interval_minutes BETWEEN 15 AND 1440
               AND cloud_sync_interval_minutes % 15 = 0);
