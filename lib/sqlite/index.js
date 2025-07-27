const path = require('node:path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', '..', 'application.db'), {
    // verbose: console.log
});

db.pragma('journal_mode = WAL');

module.exports = db;