-- FR-USER-02: what each role may do, as data rather than as a constant.
--
-- The catalogue of *which permissions exist* stays in the Permission enum — that
-- is a vocabulary the code switches on, and a row somebody could add would name
-- a right nothing knows how to enforce.
--
-- What a role *grants*, though, is a shop's decision, not a compile-time one.
-- An owner who wants a senior cashier to approve adjustments while they are away
-- should not need a release to do it. The earlier note in PROGRESS.md worried
-- about a table becoming "a second source of truth free to drift" — the answer
-- is that this table is the *only* source at runtime, and the enum becomes the
-- seed and the reset. There is one authority, not two.
CREATE TABLE role_permission (
    role_key        varchar(20) NOT NULL,
    permission_code varchar(40) NOT NULL,

    -- Who last changed the grant, so the audit trail on a privilege change has
    -- somewhere to point (BR-16).
    granted_at      timestamptz NOT NULL DEFAULT now(),
    granted_by      uuid REFERENCES app_user (id),

    PRIMARY KEY (role_key, permission_code)
);

CREATE INDEX idx_role_permission_role ON role_permission (role_key);

-- Deliberately left empty. It is seeded at startup from the Role enum, so the
-- defaults live in exactly one place and cannot drift from the contract vectors
-- that assert them. Writing a hundred INSERTs here would be that drift.
