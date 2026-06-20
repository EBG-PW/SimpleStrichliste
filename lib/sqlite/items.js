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
                i.discount_price / 100.0 AS discount_price,
                i.discount_until,
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
        discountPrice: itemData.discountPrice ? Math.round(itemData.discountPrice * 100) : null,
        discountUntil: itemData.discountUntil || null,
        packSize: itemData.packSize,
        packPrice: itemData.packPrice * 100,
        categoryId: category.id,
        isActive: 1,
    };

    const sql = `
        INSERT INTO items (uuid, name, stock, price, discount_price, discount_until, category_id, is_active, pack_size, pack_price, target_stock)
        VALUES (@uuid, @name, @stock, @price, @discountPrice, @discountUntil, @categoryId, @isActive, @packSize, @packPrice, @targetStock)
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
            i.discount_price / 100.0 AS discount_price,
            i.discount_until,
            i.pack_size,
            i.pack_price / 100.0 AS pack_price, ic.name AS category_name 
            FROM items AS i JOIN item_categories AS ic ON i.category_id = ic.id 
            WHERE i.uuid = ? AND i.is_active = 1 AND ic.is_active = 1`).get(uuid);
};

/**
 * Clears an expired discount before returning an item to the admin UI.
 * @param {String} uuid
 * @returns {Boolean} Whether an expired discount was cleared.
 */
const clearExpiredDiscountByUUID = (uuid) => {
    const result = db.prepare(`
        UPDATE items
        SET discount_price = NULL,
            discount_until = NULL
        WHERE uuid = ?
          AND discount_until IS NOT NULL
          AND datetime(discount_until) <= datetime('now')
    `).run(uuid);

    return result.changes > 0;
};

/**
 * Lists users who purchased an item, ordered by their most recent purchase.
 * @param {String} itemUUID
 * @param {String} search
 * @param {Number} page
 * @param {Number} limit
 * @returns {{buyers: Object[], total: Number}}
 */
const getItemBuyers = (itemUUID, search = '', page = 1, limit = 20) => {
    const offset = (page - 1) * limit;
    const searchPattern = `%${search}%`;
    const queryParams = [itemUUID, searchPattern, searchPattern];

    const buyers = db.prepare(`
        SELECT
            u.uuid,
            u.name,
            u.username,
            SUM(t.quantity) AS quantity,
            MAX(t.transaction_timestamp) AS last_bought
        FROM transactions t
        JOIN users u ON u.id = t.user_id
        JOIN items i ON i.id = t.item_id
        WHERE i.uuid = ?
          AND u.state > 0
          AND (u.name LIKE ? OR u.username LIKE ?)
        GROUP BY u.id, u.uuid, u.name, u.username
        ORDER BY last_bought DESC, u.name ASC
        LIMIT ? OFFSET ?
    `).all(...queryParams, limit, offset);

    const total = db.prepare(`
        SELECT COUNT(*) AS count
        FROM (
            SELECT u.id
            FROM transactions t
            JOIN users u ON u.id = t.user_id
            JOIN items i ON i.id = t.item_id
            WHERE i.uuid = ?
              AND u.state > 0
              AND (u.name LIKE ? OR u.username LIKE ?)
            GROUP BY u.id
        )
    `).get(...queryParams).count;

    return { buyers, total };
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
        discountPrice: itemData.discountPrice ? Math.round(itemData.discountPrice * 100) : null,
        discountUntil: itemData.discountUntil || null,
        packSize: itemData.packSize,
        packPrice: itemData.packPrice * 100,
        categoryId: category.id,
        isActive: 1,
    };

    const sql = `
        UPDATE items
        SET name = @name,
            stock = @stock,
            price = @price,
            discount_price = @discountPrice,
            discount_until = @discountUntil,
            pack_size = @packSize,
            pack_price = @packPrice,
            category_id = @categoryId,
            target_stock = @targetStock
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
                CASE
                    WHEN i.discount_price IS NOT NULL AND i.discount_price < i.price AND datetime(i.discount_until) > datetime('now')
                    THEN i.discount_price ELSE i.price
                END / 100.0 AS price,
                i.price / 100.0 AS original_price,
                CASE
                    WHEN i.discount_price IS NOT NULL AND i.discount_price < i.price AND datetime(i.discount_until) > datetime('now')
                    THEN 1 ELSE 0
                END AS is_discounted,
                i.discount_until,
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

const getActiveDiscounts = () => {
    return db.prepare(`
        SELECT uuid, name, price / 100.0 AS original_price,
               discount_price / 100.0 AS discount_price, discount_until
        FROM items
        WHERE is_active = 1
          AND discount_price IS NOT NULL
          AND discount_price < price
          AND datetime(discount_until) > datetime('now')
        ORDER BY datetime(discount_until), name
    `).all();
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
 * @param {string[]} items - An array of objects containing the UUIDs and amounts for the items being bought.
 * @param {string} userUUID - The UUID of the user who is being awarded the balance.
 * @returns {{awardedAmount: number, finalBalance: number}} An object containing the total amount awarded and the user's new balance.
 * @throws {Error} Throws an error if any item or the user is not found, which rolls back the transaction.
 */
const updateItemsBought = db.transaction((items, userUUID) => {
    const getItemByUUID = db.prepare('SELECT id, stock, target_stock, pack_price, pack_size, (target_stock - stock + pack_size - 1) / pack_size AS amount_to_buy FROM items WHERE uuid = ?');
    const updateItemStock = db.prepare('UPDATE items SET stock = stock + ? WHERE id = ?');
    const getUserByUUID = db.prepare('SELECT id, balance FROM users WHERE uuid = ? AND state > 0');
    const updateUserBalance = db.prepare('UPDATE users SET balance = ? WHERE id = ?');

    let totalAwardedPrice = 0;

    for (const { uuid, amount } of items) {
        const item = getItemByUUID.get(uuid);

        if (!item) {
            // If any item is invalid, stop entire process.
            throw new Error(`Purchase failed: Item with UUID ${uuid} could not be found.`);
        }

        // Make sure the UI isn´t allowed to buy more than needed
        if(amount > item.amount_to_buy) {
            throw new InvalidRouteInput(`Purchase failed: Attempted to buy more than needed for item with UUID ${uuid}.`);
        }

        // Calculate based on UI input so the user dosn´t exetently buy 2 because its shown as 2 but someone else bought another item bringing the new amount to buy up to 3
        updateItemStock.run(amount * item.pack_size, item.id);
        totalAwardedPrice += item.pack_price * amount;
    }

    const user = getUserByUUID.get(userUUID);

    if (!user) {
        // If the user doesn't exist, stop entire process.
        throw new Error(`Purchase failed: User with UUID ${userUUID} could not be found.`);
    }

    const finalBalance = user.balance + totalAwardedPrice;
    updateUserBalance.run(finalBalance, user.id);

    const DEPOSIT_ITEM_UUID = '80a38ccf-013f-404f-9099-b2a63e958aa8'; // UUID of the "Purchase" item
    db.prepare('INSERT INTO transactions (user_id, item_id, quantity, price_at_transaction, initiator_id) VALUES (?, (SELECT id FROM items WHERE uuid = ?), ?, ?, ?)'
    ).run(user.id, DEPOSIT_ITEM_UUID, 1, totalAwardedPrice, user.id);

    return { awardedAmount: totalAwardedPrice, finalBalance };
});

module.exports = {
    countItems,
    getTotalInventoryValue,
    getItemsAndCategories,
    createItem,
    getItemByUUID,
    clearExpiredDiscountByUUID,
    getItemBuyers,
    updateItemByUUID,
    getItemsByCategory,
    getActiveDiscounts,
    toggleUserFavorite,
    deleteItem,
    getItemsRestocking,
    updateItemsBought
};
