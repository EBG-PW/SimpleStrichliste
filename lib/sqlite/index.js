const path = require('node:path');
const fs = require('node:fs')
const { performance } = require('node:perf_hooks');
const Database = require('better-sqlite3');
const { installPerformanceStats, stopPerformanceStats, isRecordingEnabled, recordDbQueryDuration } = require('./performanceStats');

if (!fs.existsSync(path.join(__dirname, '..', '..', 'storage'))) {
    fs.mkdirSync(path.join(__dirname, '..', '..', 'storage'), { recursive: true });
}

const db = new Database(path.join(__dirname, '..', '..', 'storage', 'application.db'), {
    // verbose: console.log
});

db.pragma('journal_mode = WAL');

const originalPrepare = db.prepare.bind(db);
const originalExec = db.exec.bind(db);

db.prepare = function patchedPrepare(sql, ...args) {
    const statement = originalPrepare(sql, ...args);
    return new Proxy(statement, {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, target);

            if (typeof value !== 'function' || !['run', 'get', 'all', 'values'].includes(prop)) {
                return value;
            }

            return (...methodArgs) => {
                const startTime = performance.now();
                try {
                    return value.apply(target, methodArgs);
                } finally {
                    if (isRecordingEnabled()) {
                        recordDbQueryDuration(performance.now() - startTime);
                    }
                }
            };
        }
    });
};

db.exec = function patchedExec(sql) {
    const startTime = performance.now();
    try {
        return originalExec(sql);
    } finally {
        if (isRecordingEnabled()) {
            recordDbQueryDuration(performance.now() - startTime);
        }
    }
};

installPerformanceStats(db);

/**
 * Closes the database connection gracefully, ensuring all data is flushed to disk and WAL files are cleaned up.
 */
function closeDatabases() {
    if (db) {
        try {
            stopPerformanceStats();
            db.pragma('wal_checkpoint(TRUNCATE)');
            db.unsafeMode(false);
            db.pragma('journal_mode = DELETE'); 
            process.log?.system?.('WAL successfully merged and deleted.');

        } catch (err) {
            console.log(err);
            process.log?.error?.('Error during WAL merge:', err);
        } finally {
            try {
                db.close();
                process.log?.system?.('SQLite database closed cleanly');
            } catch (closeErr) {
                process.log?.error?.('Failed to close DB handle:', closeErr);
            }
        }
    }
}

const getDBSize = () => {
    const pageCount = db.prepare('PRAGMA page_count;').get().page_count;
    const pageSize = db.prepare('PRAGMA page_size;').get().page_size;
    return pageCount * pageSize;
};

const vacuumDB = () => {
    db.exec('VACUUM');
};

/**
 * Asynchronously creates a backup of the database.
 * Changes during the backup are only applied to the file if they are from the same connection instance.
 * @param {string} tempPath
 * @returns {Promise<string>}
 */
const backupDB = async (tempPath) => {
    // Check if tempPath is provided and exists
    if (!tempPath || !fs.existsSync(tempPath)) throw new Error('Temp path does not exist');
    const backup_path = path.join(tempPath, `application.db`);

    process.log.system(`Creating DB Backup`);
    fs.mkdirSync(path.dirname(backup_path), { recursive: true });

    try {
        await db.backup(backup_path, {
            progress({ totalPages: t, remainingPages: r }) {
                process.log.system(`DB Backup progress: ${((t - r) / t * 100).toFixed(1)}%`);
            }
        });

        process.log.system(`DB Backup completed: ${backup_path}`);
        return backup_path;

    } catch (err) {
        process.log.error('DB Backup failed:', err);
        throw err;
    }
};

/**
 * Asynchronously restores the database from a backup file.
 * @param {string} backupDbPath
 * @returns {Promise<void>}
 */
const restoreDB = async (backupDbPath) => {
    if (!fs.existsSync(backupDbPath)) throw new Error(`Backup DB file does not exist: ${backupDbPath}`);
    const targetDbPath = path.join(__dirname, '..', '..', 'storage', 'application.db');
    process.log.system(`Starting DB Restore: Copying ${backupDbPath} to ${targetDbPath}`);

    try {
        if (db && typeof db.close === 'function') {
            db.close();
            process.log.system('Closed active database connection.');
        } else {
            process.log.warn('db.close() not found or db not available in scope. File deletion may fail.');
        }

        if (fs.existsSync(targetDbPath)) {
            await fs.promises.unlink(targetDbPath);
            process.log.system(`Removed old database file: ${targetDbPath}`);
        }

        const shmPath = `${targetDbPath}-shm`;
        const walPath = `${targetDbPath}-wal`;
        if (fs.existsSync(shmPath)) {
            await fs.promises.unlink(shmPath);
            process.log.system(`Removed old SHM file: ${shmPath}`);
        }
        if (fs.existsSync(walPath)) {
            await fs.promises.unlink(walPath);
            process.log.system(`Removed old WAL file: ${walPath}`);
        }

        await fs.promises.copyFile(backupDbPath, targetDbPath);
        process.log.system(`Successfully copied new database file: ${targetDbPath}`);

        process.log.system('DB Restore completed. Server must be restarted to use the new database.');

    } catch (err) {
        console.log(err);
        throw err;
    }
};


setInterval(() => {
    const currentValue = db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get('DB_AUTOVACUUM');
    if (currentValue) {
        if (currentValue.setting_value === 'true') {
            process.log.system('Auto vacuuming database');
            vacuumDB();
        }
    }
}, 1000 * 60 * 60 * 24); // Every day

module.exports = {
    db,
    backupDB,
    restoreDB,
    getDBSize,
    vacuumDB,
    closeDatabases
};
