const db = require('./index.js');

const getDBMigration = () => {
    const tableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'`).get();
    if (!tableExists) {
        return 0;
    }

    const result = db.prepare(`SELECT MAX(version) AS latestVersion FROM schema_migrations`).get();
    
    return result && result.latestVersion ? Number(result.latestVersion) : 0;
};

module.exports = {
    getDBMigration
}