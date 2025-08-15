const crypto = require("node:crypto");
const { InvalidRouteInput } = require('@lib/errors');
const db = require('./index.js');

const countItems = async () => {
    return db.prepare('SELECT COUNT(*) as count FROM items JOIN item_categories ON items.category_id = item_categories.id WHERE items.is_active = 1 AND item_categories.is_active = 1').get().count;
}

const getItemsGroupedByCategory = async () => {
    return db.prepare(`
        SELECT
            i.uuid,
            i.name,
            i.stock,
            i.target_stock,
            i.price,
            i.pack_size,
            i.pack_price,
            ic.name AS category_name
        FROM
            items AS i
        JOIN
            item_categories AS ic ON i.category_id = ic.id
        WHERE
            i.is_active = 1 AND ic.is_active = 1
        ORDER BY
            ic.name, i.name;
    `).all();
}

/**
 * Creates a new item in the database.
 * @param {object} itemData
 * @param {string} itemData.name
 * @param {number} itemData.stock
 * @param {number} itemData.price
 * @param {number} itemData.packSize
 * @param {number} itemData.packPrice
 * @param {number} itemData.category
 * @returns {Promise<string>}
 */
const createItem = async (itemData) => {
    // Check if category exists
    console.log(itemData);
    const category = db.prepare('SELECT id FROM item_categories WHERE name = ?').get(itemData.category);
    if (!category) {
        throw new InvalidRouteInput('Invalid category specified.');
    }

    const itemToInsert = {
        uuid: crypto.randomUUID(),
        name: itemData.name,
        stock: itemData.stock,
        price: itemData.price,
        packSize: itemData.packSize,
        packPrice: itemData.packPrice,
        categoryId: category.id,
        isActive: 1,
    };
    
    const sql = `
        INSERT INTO items (uuid, name, stock, price, category_id, is_active, pack_size, pack_price)
        VALUES (@uuid, @name, @stock, @price, @categoryId, @isActive, @packSize, @packPrice)
    `;

    db.prepare(sql).run(itemToInsert);

    return itemToInsert.uuid;
};

module.exports = {
    countItems,
    getItemsGroupedByCategory,
    createItem
};