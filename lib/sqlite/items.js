const crypto = require("node:crypto");
const { InvalidRouteInput } = require('@lib/errors');
const { db } = require('./index.js');

const countItems = async () => {
    return db.prepare('SELECT COUNT(*) as count FROM items JOIN item_categories ON items.category_id = item_categories.id WHERE items.is_active = 1 AND item_categories.is_active = 1').get().count;
}

const getTotalInventoryValue = async () => {
    return db.prepare('SELECT COALESCE(SUM(price * stock) / 100.0, 0) AS total FROM items WHERE is_active = 1').get().total;
};

/**
 * Get Items and categories with search query for item names
 * @param {String} searchQuery 
 * @returns 
 */
const getItemsAndCategories = async (searchQuery) => {
    const query = searchQuery ? searchQuery : '';
    return db
        .prepare(
            `SELECT
                ic.name AS category_name,
                i.uuid,
                i.name,
                i.stock,
                i.target_stock,
                i.price / 100.0 AS price,
                i.pack_size,
                i.pack_price / 100.0 AS pack_price
            FROM
                item_categories AS ic
            LEFT JOIN
                items AS i ON i.category_id = ic.id AND i.is_active = 1 AND i.name LIKE ?
            WHERE
                ic.is_active = 1
            ORDER BY
                ic.name, i.name;`
        )
        .all(['%' + query + '%']);
};

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
    const category = db.prepare('SELECT id FROM item_categories WHERE name = ?').get(itemData.category);
    if (!category) {
        throw new InvalidRouteInput('Invalid category specified.');
    }

    const itemToInsert = {
        uuid: crypto.randomUUID(),
        name: itemData.name,
        stock: itemData.stock,
        targetStock: itemData.targetStock,
        price: itemData.price * 100,
        packSize: itemData.packSize,
        packPrice: itemData.packPrice * 100,
        categoryId: category.id,
        isActive: 1,
    };

    const sql = `
        INSERT INTO items (uuid, name, stock, price, category_id, is_active, pack_size, pack_price, target_stock)
        VALUES (@uuid, @name, @stock, @price, @categoryId, @isActive, @packSize, @packPrice, @targetStock)
    `;

    db.prepare(sql).run(itemToInsert);

    return itemToInsert.uuid;
};

/**
 * Get Item by UUID
 * @param {String} uuid 
 * @returns 
 */
const getItemByUUID = async (uuid) => {
    return db.prepare(`SELECT ic.name AS category_name,
            i.uuid,
            i.name,
            i.stock,
            i.target_stock,
            i.price / 100.0 AS price,
            i.pack_size,
            i.pack_price / 100.0 AS pack_price, ic.name AS category_name 
            FROM items AS i JOIN item_categories AS ic ON i.category_id = ic.id 
            WHERE i.uuid = ? AND i.is_active = 1 AND ic.is_active = 1`).get(uuid);
};

const updateItemByUUID = async (uuid, itemData) => {
    // Check if category exists
    const category = db.prepare('SELECT id FROM item_categories WHERE name = ?').get(itemData.category);
    if (!category) {
        throw new InvalidRouteInput('Invalid category specified.');
    }

    const itemToUpdate = {
        uuid,
        name: itemData.name,
        stock: itemData.stock,
        targetStock: itemData.targetStock,
        price: itemData.price * 100,
        packSize: itemData.packSize,
        packPrice: itemData.packPrice * 100,
        categoryId: category.id,
        isActive: 1,
    };

    const sql = `
        UPDATE items
        SET name = @name, stock = @stock, price = @price, pack_size = @packSize, pack_price = @packPrice, category_id = @categoryId, target_stock = @targetStock
        WHERE uuid = @uuid
    `;

    db.prepare(sql).run(itemToUpdate);

    return itemToUpdate.uuid;
};

/**
 * Return Items by Category
 * @param {String} categoryName 
 * @param {Number} limit
 * @param {Number} page
 * @returns 
 */
const getItemsByCategory = async (categoryName, limit, page) => {
    const offset = (page - 1) * limit;
    return db
        .prepare(
            `SELECT
                i.uuid,
                i.name,
                i.stock,
                i.target_stock,
                i.price / 100.0 AS price,
                i.pack_size,
                i.pack_price / 100.0 AS pack_price
            FROM
                items AS i
            JOIN
                item_categories AS ic ON i.category_id = ic.id
            WHERE
                ic.name = ? AND i.is_active = 1 AND ic.is_active = 1
            LIMIT ? OFFSET ?`
        )
        .all(categoryName, limit, offset);
};

/**
 * Toggle User Favorite
 * @param {String} userId
 * @param {String} itemUuid
 * @returns {Boolean}
 */
const toggleUserFavorite = db.transaction((userId, itemUuid) => {
    const result = db.prepare('DELETE FROM user_favorites WHERE user_id = ? AND item_id = (SELECT id FROM items WHERE uuid = ?)').run(userId, itemUuid);
    if (result.changes === 0) {
        db.prepare('INSERT INTO user_favorites (user_id, item_id) VALUES (?, (SELECT id FROM items WHERE uuid = ?))').run(userId, itemUuid);
        return true;
    }
    return false;
});

/**
 * Set Item to is_active 0 state
 * @param {String} itemUUID
 */
const deleteItem = (itemUUID) => {
    const result = db.prepare('UPDATE items SET is_active = 0 WHERE uuid = ?').run(itemUUID);
    if (result.changes === 1) {
        return true;
    }
    return false;
}

const getItemsRestocking = async () => {
    return db.prepare(`
    SELECT
        uuid,
        name,
        pack_price / 100.0 AS pack_price,
        pack_size,
        (target_stock - stock + pack_size - 1) / pack_size AS amount_to_buy
    FROM
        items
    WHERE
        is_active = 1
        AND stock < target_stock;
    `).all();
};

/**
 * Updates the stock for a list of bought items and awards the total price
 * to a user's balance within a single atomic transaction.
 *
 * @param {string[]} itemUUIDs - An array of UUIDs for the items being bought.
 * @param {string} userUUID - The UUID of the user who is being awarded the balance.
 * @returns {{awardedAmount: number, finalBalance: number}} An object containing the total amount awarded and the user's new balance.
 * @throws {Error} Throws an error if any item or the user is not found, which rolls back the transaction.
 */
const updateItemsBought = db.transaction((itemUUIDs, userUUID) => {
    const getItemByUUID = db.prepare('SELECT id, stock, target_stock, pack_price, pack_size FROM items WHERE uuid = ?');
    const updateItemStock = db.prepare('UPDATE items SET stock = stock + ? WHERE id = ?');
    const getUserByUUID = db.prepare('SELECT id, balance FROM users WHERE uuid = ?');
    const updateUserBalance = db.prepare('UPDATE users SET balance = ? WHERE id = ?');

    let totalAwardedPrice = 0;

    for (const uuid of itemUUIDs) {
        const item = getItemByUUID.get(uuid);

        if (!item) {
            // If any item is invalid, entire operation.
            throw new Error(`Purchase failed: Item with UUID ${uuid} could not be found.`);
        }

        const newStock = item.target_stock + item.pack_size - 1;
        console.log(newStock, item.target_stock, item.pack_size);
        updateItemStock.run(newStock, item.id);
        totalAwardedPrice += item.pack_price;
    }
    const user = getUserByUUID.get(userUUID);

    if (!user) {
        // If the user doesn't exist, entire operation.
        throw new Error(`Purchase failed: User with UUID ${userUUID} could not be found.`);
    }

    const finalBalance = user.balance + totalAwardedPrice;
    updateUserBalance.run(finalBalance, user.id);

    return { awardedAmount: totalAwardedPrice, finalBalance };
});

module.exports = {
    countItems,
    getTotalInventoryValue,
    getItemsAndCategories,
    createItem,
    getItemByUUID,
    updateItemByUUID,
    getItemsByCategory,
    toggleUserFavorite,
    deleteItem,
    getItemsRestocking,
    updateItemsBought
};