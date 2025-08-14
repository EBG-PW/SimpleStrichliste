const crypto = require("node:crypto");
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

/**
 * Updates the status of a category.
 * @param {String} categoryName 
 * @param {Boolean} isEnabled 
 * @returns 
 */
const updateCategoryStatus = async (categoryName, isEnabled) => {
    return db.prepare('INSERT INTO item_categories (uuid, name, is_active) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET is_active = ?').run(crypto.randomUUID(), categoryName, isEnabled ? 1 : 0, isEnabled ? 1 : 0);
}

module.exports = {
    countCategories,
    getActiveCategories,
    getCategoryById,
    updateCategoryStatus
};
