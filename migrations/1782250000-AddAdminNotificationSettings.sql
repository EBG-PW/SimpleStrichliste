INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES
('ERROR_REPORTS_ACTIVE', 'false'),
('LOW_STOCK_WARNING', 'false'),
('LOW_STOCK_PERCENT', '20');

CREATE TABLE IF NOT EXISTS error_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    message TEXT NOT NULL,
    reported_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_error_reports_pending
ON error_reports (reported_at, timestamp);
