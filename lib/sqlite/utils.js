const db = require('./index.js');

const getDBMigration = () => {
    const dbOK = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'`).all()
    if(dbOK.length === 0) return 0
    const dbVersion = db.prepare(`SELECT version FROM schema_migrations`).all()
    return dbVersion
}

module.exports = {
    getDBMigration
}