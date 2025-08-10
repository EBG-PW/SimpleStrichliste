const db = require('./index.js');

const countCategories = async () => {
    return db.prepare('SELECT COUNT(*) as count FROM item_categories WHERE is_active = 1').get().count;
}

const getActiveCategories = async () => {
    return db.prepare('SELECT uuid, name FROM item_categories WHERE is_active = 1').all();
}

const getCategoryById = async (id) => {
    return db.prepare('SELECT uuid, name, is_active FROM item_categories WHERE id = ?').get(id);
}

module.exports = {
    countCategories,
    getActiveCategories,
    getCategoryById
};
