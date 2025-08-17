const path = require('node:path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', '..', 'application.db'), {
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
    getDBSize,
    vacuumDB
};