-- A record of which permission codes have ever been seeded.
--
-- V23 left role_permission empty and had the application seed it from the Role
-- enum at startup — but only `if (count == 0)`. That is correct exactly once. Any
-- code shipped afterwards reaches a fresh install and never reaches a running
-- one, so the shop that has been trading for a month is the one that silently
-- misses the new permission. `sync.push` was the first to hit it.
--
-- Seeding unconditionally is the wrong fix: it would resurrect, on every restart,
-- every grant the owner had deliberately revoked. The distinction the seeder
-- actually needs is "has this code ever been offered to its default roles" — not
-- "is this grant currently present". That is what this table records.
CREATE TABLE role_permission_seeded (
    permission_code varchar(40) PRIMARY KEY,
    seeded_at       timestamptz NOT NULL DEFAULT now()
);

-- Everything already granted counts as seeded, so this migration changes nothing
-- about an existing install's permissions. Only codes that appear *after* it will
-- be handed to their default roles.
--
-- A fresh database has an empty role_permission, so this inserts nothing and the
-- ordinary first-run seed happens as before.
INSERT INTO role_permission_seeded (permission_code)
SELECT DISTINCT permission_code FROM role_permission
ON CONFLICT DO NOTHING;
