-- =============================================================================
-- Performance Statistics Tables
-- =============================================================================

-- Raw samples collected during the current day.
CREATE TABLE IF NOT EXISTS performance_db_query_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_date TEXT NOT NULL,
    duration_ms REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS performance_page_load_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_date TEXT NOT NULL,
    route TEXT NOT NULL,
    duration_ms REAL NOT NULL
);

-- Compact daily stats.
CREATE TABLE IF NOT EXISTS daily_db_query_stats (
    stat_date TEXT PRIMARY KEY NOT NULL,
    sample_count INTEGER NOT NULL DEFAULT 0,
    min_ms REAL NOT NULL DEFAULT 0,
    avg_ms REAL NOT NULL DEFAULT 0,
    p95_ms REAL NOT NULL DEFAULT 0,
    p99_ms REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS daily_page_load_stats (
    stat_date TEXT NOT NULL,
    route TEXT NOT NULL,
    sample_count INTEGER NOT NULL DEFAULT 0,
    min_ms REAL NOT NULL DEFAULT 0,
    avg_ms REAL NOT NULL DEFAULT 0,
    p95_ms REAL NOT NULL DEFAULT 0,
    p99_ms REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (stat_date, route)
);

CREATE TABLE IF NOT EXISTS performance_http_request_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_date TEXT NOT NULL,
    route TEXT NOT NULL,
    duration_ms REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_http_request_stats (
    stat_date TEXT NOT NULL,
    route TEXT NOT NULL,
    sample_count INTEGER NOT NULL DEFAULT 0,
    min_ms REAL NOT NULL DEFAULT 0,
    avg_ms REAL NOT NULL DEFAULT 0,
    p95_ms REAL NOT NULL DEFAULT 0,
    p99_ms REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (stat_date, route)
);

CREATE INDEX IF NOT EXISTS idx_performance_db_query_samples_date ON performance_db_query_samples(sample_date);
CREATE INDEX IF NOT EXISTS idx_performance_page_load_samples_date_route ON performance_page_load_samples(sample_date, route);
CREATE INDEX IF NOT EXISTS idx_daily_page_load_stats_date_route ON daily_page_load_stats(stat_date, route);
CREATE INDEX IF NOT EXISTS idx_performance_http_request_samples_date_route ON performance_http_request_samples(sample_date, route);
CREATE INDEX IF NOT EXISTS idx_daily_http_request_stats_date_route ON daily_http_request_stats(stat_date, route);
