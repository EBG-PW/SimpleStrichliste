-- Turn on foreign key support in SQLite
PRAGMA foreign_keys = ON;

-- =============================================================================
-- Main Tables
-- =============================================================================

-- users: Stores user information and their current balance.
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    user_role TEXT NOT NULL DEFAULT 'unknown',
    balance INTEGER NOT NULL DEFAULT 0,
    language TEXT DEFAULT null,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- user_favorites: A many-to-many table linking users to their favorite items.
CREATE TABLE IF NOT EXISTS user_favorites (
    user_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, item_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

-- item_categories: Defines categories for items
CREATE TABLE IF NOT EXISTS item_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1
);

-- items: Items avaible for purchase. Each item belongs to a category.
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    target_stock INTEGER NOT NULL DEFAULT 0,
    price INTEGER NOT NULL CHECK (price >= 0),
    pack_size INTEGER NOT NULL DEFAULT 1,
    pack_price INTEGER NOT NULL CHECK (pack_price >= 0),
    category_id INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (category_id) REFERENCES item_categories(id) ON DELETE RESTRICT,
    UNIQUE (name, category_id)
);

-- transactions: A log of every single item taken by a user.
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    initiator_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price_at_transaction INTEGER NOT NULL,
    transaction_timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (initiator_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT
);

-- app_settings: Stores application-wide settings.
CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT NOT NULL UNIQUE,
    setting_value TEXT NOT NULL
);

-- websessions: Stores active web sessions for logged-in users.
CREATE TABLE IF NOT EXISTS websessions (
    session_id TEXT PRIMARY KEY NOT NULL,
    user_id INTEGER NOT NULL,
    browser TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_users_uuid ON users(uuid);
CREATE INDEX IF NOT EXISTS idx_items_uuid ON items(uuid);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(transaction_timestamp);