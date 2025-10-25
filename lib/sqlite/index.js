const path = require('node:path');
const fs = require('node:fs')
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', '..', 'storage', 'application.db'), {
    // verbose: console.log
});

db.pragma('journal_mode = WAL');

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
    getDBSize,
    vacuumDB
};