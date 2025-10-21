-- =============================================================================
-- Statistics Tables
-- =============================================================================

-- Table to manage refund requests for transactions.
CREATE TABLE IF NOT EXISTS refunds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    transaction_id INTEGER NOT NULL,
    authorizer_id INTEGER,
    status SMALLINT NOT NULL DEFAULT 0,
    created_timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    approved_timestamp TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE RESTRICT,
    FOREIGN KEY (authorizer_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- Table to queue and track emails that need to be sent.
CREATE TABLE IF NOT EXISTS email_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    custom_message TEXT,
    created_timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    sent_timestamp TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- =============================================================================
-- Modified Tables
-- =============================================================================

-- Add status column to transactions table to track refunds
ALTER TABLE transactions
ADD COLUMN status SMALLINT NOT NULL DEFAULT 0;