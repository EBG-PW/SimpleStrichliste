ALTER TABLE items ADD COLUMN discount_price INTEGER CHECK (discount_price IS NULL OR discount_price >= 0);
ALTER TABLE items ADD COLUMN discount_until TEXT;

CREATE TABLE IF NOT EXISTS user_notifications (
    user_id INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    state SMALLINT NOT NULL DEFAULT 1 CHECK (state IN (0, 1)),
    PRIMARY KEY (user_id, "key", "type"),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_items_active_discounts
ON items (discount_until, discount_price)
WHERE discount_price IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_notifications_lookup
ON user_notifications ("key", "type", state, user_id);
