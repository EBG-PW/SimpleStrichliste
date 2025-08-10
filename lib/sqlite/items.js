const db = require('./index.js');

const countItems = async () => {
    return db.prepare('SELECT COUNT(*) as count FROM items WHERE is_active = 1').get().count;
}

module.exports = {
    countItems
};