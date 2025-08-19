const crypto = require("node:crypto");
const { db } = require('./index.js');

/**
 * Returns the count of users in the database.
 * @returns {Promise<number>}
 */
const countUsers = async () => {
    const row = await db.prepare('SELECT COUNT(*) as count FROM users').get();
    return row.count;
};

/**
 * Creates a new user in the database.
 * @param {String} name 
 * @param {String} email 
 * @param {String} username 
 * @param {String} password_hash 
 */
const createUser = async (name, email, username, password_hash) => {
    db.prepare('INSERT INTO users (uuid, name, email, username, password_hash, user_role) VALUES (?, ?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), name, email, username, password_hash, 'user');
}

/**
 * Generate a new user that is admin.
 * @param {String} name 
 * @param {String} email 
 * @param {String} username 
 * @param {String} password_hash 
 */
const createAdminUser = async (name, email, username, password_hash) => {
    db.prepare('INSERT INTO users (uuid, name, email, username, password_hash, user_role) VALUES (?, ?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), name, email, username, password_hash, 'admin');
};

/**
 * Get a user by username.
 * @param {String} username 
 * @returns {Promise<Object>}   
 */
const findUserByUsername = async (username) => {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
};

/**
 * Get user data of a user.
 * @param {Number} user_id 
 * @returns {Promise<Object>}
 */
const getUser = async (user_id) => {
    return db.prepare('SELECT uuid, name, email, username, user_role, balance, language FROM users where id = ?').get(user_id);
};

/**
 * Get user data of a user by uuid
 * @param {String} uuid 
 * @returns 
 */
const getUserByUUID = async (uuid) => {
    return db.prepare('SELECT uuid, name, email, username, user_role, balance, language FROM users WHERE uuid = ?').get(uuid);
};

/**
 * Retrieves a list of users with optional searching and sorting.
 * @param {string} [search='']
 * @param {string} [sort='name']
 * @param {string} [dir='asc']
 * @param {number} [page=1]
 * @param {number} [limit=15]
 * @returns {Promise<Array<Object>>}
 */
const getUsers = async (search = '', sort = 'name', dir = 'asc', page = 1, limit = 15) => {
    const allowedSortColumns = ['name', 'username', 'user_role', 'balance'];
    const sortColumn = allowedSortColumns.includes(sort) ? sort : 'name';

    const sortDirection = dir.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    let sql = `
        SELECT uuid, name, username, user_role, balance 
        FROM users
    `;

    const params = [];

    // Add search functionality if a search term is provided
    if (search) {
        sql += ` WHERE name LIKE ? OR username LIKE ?`;
        params.push(`%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY ${sortColumn} ${sortDirection}`;
    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, (page - 1) * limit);

    try {
        return db.prepare(sql).all(params);
    } catch (error) {
        console.error("Failed to get users:", error);
        return [];
    }
};

/**
 * Get the password hash of a user.
 * @param {Number} user_id 
 * @returns {Promise<Object>}
 */
const getUserPassword = async (user_id) => {
    return db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user_id);
};

/**
 * Gets the balance of a user.
 * @param {Number} user_id 
 * @returns {Promise<Object>}
 */
const getUserBalance = async (user_id) => {
    return db.prepare('SELECT balance FROM users WHERE id = ?').get(user_id);
};

/**
 * Update the balance of a user and create a transaction record.
 * @param {string} userUuid
 * @param {number} amount
 * @throws {Error}
 */
const updateBalance = async (userUuid, amount) => {
    const transaction = db.transaction((uuid, depositAmount) => {
        const info = db.prepare('UPDATE users SET balance = balance + ? WHERE uuid = ?').run(depositAmount, uuid);
        if (info.changes === 0) throw new Error(`User with UUID '${uuid}' not found.`);
        const DEPOSIT_ITEM_ID = 1;
        db.prepare('INSERT INTO transactions (user_id, item_id, quantity, price_at_transaction) VALUES ((SELECT id FROM users WHERE uuid = ?), ?, ?, ?)'
        ).run(uuid, DEPOSIT_ITEM_ID, 1, depositAmount);
        return;
    });
    try {
        const finalBalance = transaction(userUuid, amount);
        return finalBalance;
    } catch (error) {
        throw error;
    }
}

/**
 * Retrieves the favorite items of a user.
 * @param {Number} user_id
 * @param {Number} limit
 * @returns {Promise<Array>}
 */
const getUserFavorites = async (user_id, limit) => {
    return db.prepare('SELECT items.uuid, items.name, items.stock, items.price / 100.0 AS price, items.category_id FROM user_favorites JOIN items ON user_favorites.item_id = items.id WHERE user_favorites.user_id = ? LIMIT ?').all(user_id, limit);
}

/**
 * Updates the username of a user.
 * @param {Number} user_id 
 * @param {String} new_username 
 */
const updateUserUserName = async (user_id, new_username) => {
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(new_username, user_id);
};

/**
 * Updates the username of a user.
 * @param {String} user_uuid 
 * @param {String} new_username 
 */
const updateUserUserNameByUUID = async (user_uuid, new_username) => {
    db.prepare('UPDATE users SET username = ? WHERE uuid = ?').run(new_username, user_uuid);
};

/**
 * Updates the name of a user.
 * @param {Number} user_id 
 * @param {String} new_name 
 */
const updateUserName = async (user_id, new_name) => {
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(new_name, user_id);
};

/**
 * Updates the name of a user.
 * @param {String} user_uuid 
 * @param {String} new_name 
 */
const updateUserNameByUUID = async (user_uuid, new_name) => {
    db.prepare('UPDATE users SET name = ? WHERE uuid = ?').run(new_name, user_uuid);
};

/**
 * Updates the email of a user.
 * @param {Number} user_id 
 * @param {String} new_email 
 */
const updateUserEmail = async (user_id, new_email) => {
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(new_email, user_id);
};

/**
 * Updates the email of a user.
 * @param {String} user_uuid 
 * @param {String} new_email 
 */
const updateUserEmailByUUID = async (user_uuid, new_email) => {
    db.prepare('UPDATE users SET email = ? WHERE uuid = ?').run(new_email, user_uuid);
};

/**
 * Updates the password of a user.
 * @param {Number} user_id 
 * @param {String} new_password_hash 
 */
const updateUserPassword = async (user_id, new_password_hash) => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(new_password_hash, user_id);
};

/**
 * Updates the language of a user.
 * @param {Number} user_id 
 * @param {String} new_language 
 */
const updateUserLanguage = async (user_id, new_language) => {
    db.prepare('UPDATE users SET language = ? WHERE id = ?').run(new_language, user_id);
};

/**
 * Updates the language of a user.
 * @param {String} user_uuid
 * @param {String} new_language 
 */
const updateUserLanguageByUUID = async (user_uuid, new_language) => {
    db.prepare('UPDATE users SET language = ? WHERE uuid = ?').run(new_language, user_uuid);
};

module.exports = {
    countUsers,
    createUser,
    createAdminUser,
    findUserByUsername,
    getUser,
    getUserByUUID,
    getUsers,
    getUserPassword,
    getUserBalance,
    updateBalance,
    getUserFavorites,
    updateUserUserName,
    updateUserUserNameByUUID,
    updateUserName,
    updateUserNameByUUID,
    updateUserEmail,
    updateUserEmailByUUID,
    updateUserLanguage,
    updateUserLanguageByUUID,
    updateUserPassword
};