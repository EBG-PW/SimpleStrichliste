-- =============================================================================
-- Statistics Tables
-- =============================================================================

-- daily_item_sales: Aggregates the number of items sold per day for each category.
CREATE TABLE IF NOT EXISTS daily_category_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_date TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    total_quantity INTEGER NOT NULL DEFAULT 0,
    UNIQUE(sale_date, category_id),
    FOREIGN KEY (category_id) REFERENCES item_categories(id) ON DELETE CASCADE
);

-- user_category_purchases: Tracks the total quantity of items a user has purchased from a specific category.
CREATE TABLE IF NOT EXISTS user_category_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    total_quantity INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, category_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES item_categories(id) ON DELETE CASCADE
);

-- daily_item_purchases: Tracks the total quantity of each item purchased per day.
CREATE TABLE IF NOT EXISTS daily_item_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_date TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    total_quantity INTEGER NOT NULL DEFAULT 0,
    UNIQUE(sale_date, item_id),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);


-- =============================================================================
-- Triggers for Statistics Tables
-- =============================================================================

-- Trigger: update_daily_category_sales
CREATE TRIGGER IF NOT EXISTS update_daily_category_sales
AFTER INSERT ON transactions
BEGIN
    -- Get the category_id for the item in the new transaction
    INSERT INTO daily_category_sales (sale_date, category_id, total_quantity)
    VALUES (
        DATE(NEW.transaction_timestamp),
        (SELECT category_id FROM items WHERE id = NEW.item_id),
        NEW.quantity
    )
    ON CONFLICT(sale_date, category_id) DO UPDATE SET
        total_quantity = total_quantity + NEW.quantity;
END;

-- Trigger: update_user_category_purchases
CREATE TRIGGER IF NOT EXISTS update_user_category_purchases
AFTER INSERT ON transactions
BEGIN
    INSERT INTO user_category_purchases (user_id, category_id, total_quantity)
    VALUES (
        NEW.user_id,
        (SELECT category_id FROM items WHERE id = NEW.item_id),
        NEW.quantity
    )
    ON CONFLICT(user_id, category_id) DO UPDATE SET
        total_quantity = total_quantity + NEW.quantity;
END;

-- Trigger: update_daily_item_purchases
CREATE TRIGGER IF NOT EXISTS update_daily_item_purchases
AFTER INSERT ON transactions
BEGIN
    INSERT INTO daily_item_purchases (sale_date, item_id, total_quantity)
    VALUES (
        DATE(NEW.transaction_timestamp),
        NEW.item_id,
        NEW.quantity
    )
    ON CONFLICT(sale_date, item_id) DO UPDATE SET
        total_quantity = total_quantity + NEW.quantity;
END;

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_daily_category_sales_date ON daily_category_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_user_category_purchases_user ON user_category_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_item_purchases_date ON daily_item_purchases(sale_date);
