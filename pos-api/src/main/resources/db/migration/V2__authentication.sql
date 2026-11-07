-- V2 · Authentication completion — persistent audit and one-time reset tokens

ALTER TABLE app_user ADD COLUMN credentials_changed_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE audit_log (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id     UUID         REFERENCES app_user (id),
    action       TEXT         NOT NULL,
    entity_type  TEXT         NOT NULL,
    entity_id    UUID,
    before_json  JSONB,
    after_json   JSONB,
    outlet_id    UUID         REFERENCES outlet (id),
    terminal_id  UUID         REFERENCES terminal (id),
    ip_address   TEXT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    synced_at    TIMESTAMPTZ
);

CREATE INDEX idx_audit_actor_created ON audit_log (actor_id, created_at DESC);
CREATE INDEX idx_audit_action_created ON audit_log (action, created_at DESC);
CREATE INDEX idx_audit_outlet_created ON audit_log (outlet_id, created_at DESC);

-- Only a SHA-256 digest is stored. A database read cannot recover a usable link.
CREATE TABLE password_reset_token (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    token_hash  VARCHAR(64)  NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ  NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_user ON password_reset_token (user_id, created_at DESC);

-- BR-15: the application role may append and read audit entries, never alter them.
CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
