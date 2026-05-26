-- Add a soft-delete state to users.
-- 0 = deleted, values greater than 0 are active states.
ALTER TABLE users ADD COLUMN state SMALLINT NOT NULL DEFAULT 1 CHECK (state >= 0);
