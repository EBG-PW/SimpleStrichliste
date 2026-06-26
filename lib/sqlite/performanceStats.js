let db = null;
let initialized = false;
let compactTimer = null;
let muteDepth = 0;
let compacting = false;

const DB_SAMPLE_TABLE = 'performance_db_query_samples';
const DB_DAILY_TABLE = 'daily_db_query_stats';
const PAGE_SAMPLE_TABLE = 'performance_page_load_samples';
const PAGE_DAILY_TABLE = 'daily_page_load_stats';
const HTTP_SAMPLE_TABLE = 'performance_http_request_samples';
const HTTP_DAILY_TABLE = 'daily_http_request_stats';
const IGNORED_HTTP_ROUTES = new Set([
    '/api/v1/settings/stats',
    '/api/v1/auth/check',
]);
const API_ROUTE_PREFIXES = ['/api', '/static_api', '/i', '/auth'];

const roundMs = (value) => Math.round(Number(value) * 1000) / 1000;

const getLocalDateKey = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const normalizeRouteKey = (routeKey) => {
    const normalized = String(routeKey || '/').trim() || '/';
    return normalized.length > 255 ? normalized.slice(0, 255) : normalized;
};

const shouldIgnoreHttpRoute = (routeKey) => IGNORED_HTTP_ROUTES.has(normalizeRouteKey(routeKey));

const isApiPerformanceRoute = (routeKey) => {
    const normalized = normalizeRouteKey(routeKey);
    return API_ROUTE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
};

const isRecordingEnabled = () => Boolean(db) && muteDepth === 0;

const withMutedDbAccess = (callback) => {
    muteDepth += 1;
    try {
        return callback();
    } finally {
        muteDepth -= 1;
    }
};

const quantileFromSorted = (sortedValues, percentile) => {
    if (!sortedValues.length) return 0;
    const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * percentile) - 1));
    return sortedValues[index];
};

const summarizeDurations = (durations) => {
    if (!durations.length) {
        return null;
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const sampleCount = sorted.length;
    const totalMs = sorted.reduce((sum, value) => sum + value, 0);

    return {
        sample_count: sampleCount,
        min_ms: roundMs(sorted[0]),
        avg_ms: roundMs(totalMs / sampleCount),
        p95_ms: roundMs(quantileFromSorted(sorted, 0.95)),
        p99_ms: roundMs(quantileFromSorted(sorted, 0.99)),
    };
};

const summarizeRowsByKey = (rows, keySelector, valueSelector) => {
    const groups = new Map();

    rows.forEach((row) => {
        const key = keySelector(row);
        if (!groups.has(key)) {
            groups.set(key, {
                meta: row,
                durations: [],
            });
        }

        groups.get(key).durations.push(valueSelector(row));
    });

    return Array.from(groups.values()).map(({ meta, durations }) => ({
        ...meta,
        ...summarizeDurations(durations),
    })).filter(Boolean);
};

const ensureSchema = () => {
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${DB_SAMPLE_TABLE} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sample_date TEXT NOT NULL,
            duration_ms REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ${DB_DAILY_TABLE} (
            stat_date TEXT PRIMARY KEY NOT NULL,
            sample_count INTEGER NOT NULL DEFAULT 0,
            min_ms REAL NOT NULL DEFAULT 0,
            avg_ms REAL NOT NULL DEFAULT 0,
            p95_ms REAL NOT NULL DEFAULT 0,
            p99_ms REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS ${PAGE_SAMPLE_TABLE} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sample_date TEXT NOT NULL,
            route TEXT NOT NULL,
            duration_ms REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ${PAGE_DAILY_TABLE} (
            stat_date TEXT NOT NULL,
            route TEXT NOT NULL,
            sample_count INTEGER NOT NULL DEFAULT 0,
            min_ms REAL NOT NULL DEFAULT 0,
            avg_ms REAL NOT NULL DEFAULT 0,
            p95_ms REAL NOT NULL DEFAULT 0,
            p99_ms REAL NOT NULL DEFAULT 0,
            PRIMARY KEY (stat_date, route)
        );

        CREATE TABLE IF NOT EXISTS ${HTTP_SAMPLE_TABLE} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sample_date TEXT NOT NULL,
            route TEXT NOT NULL,
            duration_ms REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ${HTTP_DAILY_TABLE} (
            stat_date TEXT NOT NULL,
            route TEXT NOT NULL,
            sample_count INTEGER NOT NULL DEFAULT 0,
            min_ms REAL NOT NULL DEFAULT 0,
            avg_ms REAL NOT NULL DEFAULT 0,
            p95_ms REAL NOT NULL DEFAULT 0,
            p99_ms REAL NOT NULL DEFAULT 0,
            PRIMARY KEY (stat_date, route)
        );

        CREATE INDEX IF NOT EXISTS idx_${DB_SAMPLE_TABLE}_date ON ${DB_SAMPLE_TABLE}(sample_date);
        CREATE INDEX IF NOT EXISTS idx_${PAGE_SAMPLE_TABLE}_date_route ON ${PAGE_SAMPLE_TABLE}(sample_date, route);
        CREATE INDEX IF NOT EXISTS idx_${PAGE_DAILY_TABLE}_date_route ON ${PAGE_DAILY_TABLE}(stat_date, route);
        CREATE INDEX IF NOT EXISTS idx_${HTTP_SAMPLE_TABLE}_date_route ON ${HTTP_SAMPLE_TABLE}(sample_date, route);
        CREATE INDEX IF NOT EXISTS idx_${HTTP_DAILY_TABLE}_date_route ON ${HTTP_DAILY_TABLE}(stat_date, route);
    `);
};

const recordDbQueryDuration = (durationMs) => {
    if (!db) return;

    const safeDuration = roundMs(Math.max(0, Number(durationMs) || 0));

    try {
        withMutedDbAccess(() => {
            db.prepare(`INSERT INTO ${DB_SAMPLE_TABLE} (sample_date, duration_ms) VALUES (?, ?)`)
                .run(getLocalDateKey(), safeDuration);
        });
    } catch (error) {
        process.log?.warn?.(`Failed to store DB query stat: ${error?.message || error}`);
    }
};

const recordPageLoadDuration = (routeKey, durationMs) => {
    if (!db) return;

    const safeDuration = roundMs(Math.max(0, Number(durationMs) || 0));
    const safeRoute = normalizeRouteKey(routeKey);

    try {
        withMutedDbAccess(() => {
            db.prepare(`INSERT INTO ${PAGE_SAMPLE_TABLE} (sample_date, route, duration_ms) VALUES (?, ?, ?)`)
                .run(getLocalDateKey(), safeRoute, safeDuration);
        });
    } catch (error) {
        process.log?.warn?.(`Failed to store page load stat for ${safeRoute}: ${error?.message || error}`);
    }
};

const recordHttpRequestDuration = (routeKey, durationMs) => {
    if (!db) return;

    const safeDuration = roundMs(Math.max(0, Number(durationMs) || 0));
    const safeRoute = normalizeRouteKey(routeKey);

    if (shouldIgnoreHttpRoute(safeRoute)) {
        return;
    }

    try {
        withMutedDbAccess(() => {
            db.prepare(`INSERT INTO ${HTTP_SAMPLE_TABLE} (sample_date, route, duration_ms) VALUES (?, ?, ?)`)
                .run(getLocalDateKey(), safeRoute, safeDuration);
        });
    } catch (error) {
        process.log?.warn?.(`Failed to store HTTP request stat for ${safeRoute}: ${error?.message || error}`);
    }
};

const upsertDbDailyStat = (statDate, summary) => {
    db.prepare(`
        INSERT INTO ${DB_DAILY_TABLE} (stat_date, sample_count, min_ms, avg_ms, p95_ms, p99_ms)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(stat_date) DO UPDATE SET
            sample_count = excluded.sample_count,
            min_ms = excluded.min_ms,
            avg_ms = excluded.avg_ms,
            p95_ms = excluded.p95_ms,
            p99_ms = excluded.p99_ms
    `).run(statDate, summary.sample_count, summary.min_ms, summary.avg_ms, summary.p95_ms, summary.p99_ms);
};

const upsertPageDailyStat = (statDate, summary) => {
    db.prepare(`
        INSERT INTO ${PAGE_DAILY_TABLE} (stat_date, route, sample_count, min_ms, avg_ms, p95_ms, p99_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(stat_date, route) DO UPDATE SET
            sample_count = excluded.sample_count,
            min_ms = excluded.min_ms,
            avg_ms = excluded.avg_ms,
            p95_ms = excluded.p95_ms,
            p99_ms = excluded.p99_ms
    `).run(statDate, summary.route, summary.sample_count, summary.min_ms, summary.avg_ms, summary.p95_ms, summary.p99_ms);
};

const upsertHttpDailyStat = (statDate, summary) => {
    db.prepare(`
        INSERT INTO ${HTTP_DAILY_TABLE} (stat_date, route, sample_count, min_ms, avg_ms, p95_ms, p99_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(stat_date, route) DO UPDATE SET
            sample_count = excluded.sample_count,
            min_ms = excluded.min_ms,
            avg_ms = excluded.avg_ms,
            p95_ms = excluded.p95_ms,
            p99_ms = excluded.p99_ms
    `).run(statDate, summary.route, summary.sample_count, summary.min_ms, summary.avg_ms, summary.p95_ms, summary.p99_ms);
};

const compactPendingStats = () => {
    if (!db || compacting) return;

    const cutoffDate = getLocalDateKey();
    compacting = true;

    try {
        withMutedDbAccess(() => {
            const dbSamples = db.prepare(`
                SELECT sample_date, duration_ms
                FROM ${DB_SAMPLE_TABLE}
                WHERE sample_date < ?
                ORDER BY sample_date ASC, duration_ms ASC
            `).all(cutoffDate);

            const pageSamples = db.prepare(`
                SELECT sample_date, route, duration_ms
                FROM ${PAGE_SAMPLE_TABLE}
                WHERE sample_date < ?
                ORDER BY sample_date ASC, route ASC, duration_ms ASC
            `).all(cutoffDate);

            const httpSamples = db.prepare(`
                SELECT sample_date, route, duration_ms
                FROM ${HTTP_SAMPLE_TABLE}
                WHERE sample_date < ?
                  AND route NOT IN ('/api/v1/settings/stats', '/api/v1/auth/check')
                ORDER BY sample_date ASC, route ASC, duration_ms ASC
            `).all(cutoffDate);

            const dbSummaries = summarizeRowsByKey(
                dbSamples,
                (row) => row.sample_date,
                (row) => Number(row.duration_ms) || 0
            );

            const pageSummaries = summarizeRowsByKey(
                pageSamples,
                (row) => `${row.sample_date}::${row.route}`,
                (row) => Number(row.duration_ms) || 0
            ).map((summary) => ({
                ...summary,
                route: normalizeRouteKey(summary.route),
            }));

            const httpSummaries = summarizeRowsByKey(
                httpSamples,
                (row) => `${row.sample_date}::${row.route}`,
                (row) => Number(row.duration_ms) || 0
            ).map((summary) => ({
                ...summary,
                route: normalizeRouteKey(summary.route),
            }));

            if (!dbSummaries.length && !pageSummaries.length && !httpSummaries.length) {
                return;
            }

            db.transaction(() => {
                dbSummaries.forEach((summary) => upsertDbDailyStat(summary.sample_date, summary));
                pageSummaries.forEach((summary) => upsertPageDailyStat(summary.sample_date, summary));
                httpSummaries.forEach((summary) => upsertHttpDailyStat(summary.sample_date, summary));

                if (dbSamples.length) {
                    db.prepare(`DELETE FROM ${DB_SAMPLE_TABLE} WHERE sample_date < ?`).run(cutoffDate);
                }
                if (pageSamples.length) {
                    db.prepare(`DELETE FROM ${PAGE_SAMPLE_TABLE} WHERE sample_date < ?`).run(cutoffDate);
                }
                if (httpSamples.length) {
                    db.prepare(`DELETE FROM ${HTTP_SAMPLE_TABLE} WHERE sample_date < ?`).run(cutoffDate);
                }
            })();
        });
    } catch (error) {
        process.log?.warn?.(`Failed to compact performance stats: ${error?.message || error}`);
    } finally {
        compacting = false;
    }
};

const scheduleNextCompaction = () => {
    if (compactTimer) {
        clearTimeout(compactTimer);
    }

    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const delay = Math.max(1000, nextMidnight.getTime() - now.getTime());

    compactTimer = setTimeout(() => {
        try {
            compactPendingStats();
        } finally {
            scheduleNextCompaction();
        }
    }, delay);
};

const installPerformanceStats = (database) => {
    if (initialized) return;

    db = database;
    try {
        withMutedDbAccess(() => {
            ensureSchema();
            compactPendingStats();
        });
    } catch (error) {
        process.log?.warn?.(`Failed to initialize performance stats: ${error?.message || error}`);
    } finally {
        scheduleNextCompaction();
        initialized = true;
    }
};

const stopPerformanceStats = () => {
    if (compactTimer) {
        clearTimeout(compactTimer);
        compactTimer = null;
    }
};

const getPerformanceStats = (limit = 10, routeLimit = limit) => {
    if (!db) {
        return {
            dbQueryStats: null,
            pageLoadStats: [],
            httpRequestStats: [],
        };
    }

    return withMutedDbAccess(() => {
        const currentDate = getLocalDateKey();

        const dbSamples = db.prepare(`
            SELECT duration_ms
            FROM ${DB_SAMPLE_TABLE}
            WHERE sample_date = ?
            ORDER BY duration_ms ASC
        `).all(currentDate);

        const pageSamples = db.prepare(`
            SELECT route, duration_ms
            FROM ${PAGE_SAMPLE_TABLE}
            WHERE sample_date = ?
            ORDER BY route ASC, duration_ms ASC
        `).all(currentDate);

        const httpSamples = db.prepare(`
            SELECT route, duration_ms
            FROM ${HTTP_SAMPLE_TABLE}
            WHERE sample_date = ?
              AND route NOT IN ('/api/v1/settings/stats', '/api/v1/auth/check')
            ORDER BY route ASC, duration_ms ASC
        `).all(currentDate);

        const dbQueryStats = summarizeDurations(dbSamples.map((row) => Number(row.duration_ms) || 0));

        const pageLoadStats = Array.from(
            pageSamples.reduce((groups, row) => {
                const route = normalizeRouteKey(row.route);
                if (!groups.has(route)) {
                    groups.set(route, []);
                }

                groups.get(route).push(Number(row.duration_ms) || 0);
                return groups;
            }, new Map()).entries()
        ).map(([route, durations]) => ({
            route,
            ...summarizeDurations(durations),
        })).filter(Boolean)
            .sort((left, right) => {
                if (right.p99_ms !== left.p99_ms) {
                    return right.p99_ms - left.p99_ms;
                }
                if (right.sample_count !== left.sample_count) {
                    return right.sample_count - left.sample_count;
                }
                return left.route.localeCompare(right.route);
            })
            .slice(0, Math.max(1, Number(routeLimit) || Number(limit) || 10));

        const summarizedHttpRequestStats = Array.from(
            httpSamples.reduce((groups, row) => {
                const route = normalizeRouteKey(row.route);
                if (!groups.has(route)) {
                    groups.set(route, []);
                }

                groups.get(route).push(Number(row.duration_ms) || 0);
                return groups;
            }, new Map()).entries()
        ).map(([route, durations]) => ({
            route,
            ...summarizeDurations(durations),
        })).filter(Boolean)
            .sort((left, right) => {
                if (right.p99_ms !== left.p99_ms) {
                    return right.p99_ms - left.p99_ms;
                }
                if (right.sample_count !== left.sample_count) {
                    return right.sample_count - left.sample_count;
                }
                return left.route.localeCompare(right.route);
            });

        const routeResultLimit = Math.max(1, Number(routeLimit) || Number(limit) || 10);
        const httpRequestStats = summarizedHttpRequestStats.slice(0, routeResultLimit);
        const apiRequestStats = summarizedHttpRequestStats
            .filter((row) => isApiPerformanceRoute(row.route))
            .slice(0, routeResultLimit);

        return {
            date: currentDate,
            dbQueryStats,
            pageLoadStats,
            httpRequestStats,
            apiRequestStats,
        };
    });
};

module.exports = {
    installPerformanceStats,
    stopPerformanceStats,
    isRecordingEnabled,
    recordDbQueryDuration,
    recordPageLoadDuration,
    recordHttpRequestDuration,
    compactPendingStats,
    getPerformanceStats,
};
