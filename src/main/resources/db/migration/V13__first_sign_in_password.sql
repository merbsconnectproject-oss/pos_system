-- FR-AUTH-07: an account whose password somebody else chose.
--
-- An administrator creating a staff account has to put a password on it, and
-- from that moment two people know it. The flag marks the account as needing
-- its owner to choose their own before it can be used for anything, so the
-- window in which a shared password is a working credential is one sign-in
-- long.

ALTER TABLE app_user
    ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;

-- Existing accounts are not caught up in this. Their passwords were not set by
-- somebody else today, and locking every user out of their own till on the
-- next deploy would be a migration doing damage.
