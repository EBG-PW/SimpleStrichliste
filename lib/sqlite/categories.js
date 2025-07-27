const db = require('./index.js');

const getActiveCategories = async () => {
    return db.prepare('SELECT * FROM item_categories WHERE is_active = 1').all();
}

const getCategoryById = async (id) => {
    return db.prepare('SELECT * FROM item_categories WHERE id = ?').get(id);
}

module.exports = {
    getActiveCategories,
    getCategoryById
};
