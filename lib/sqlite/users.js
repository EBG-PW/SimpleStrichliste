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
 * Retrieves the favorites of a user.
 * @param {Number} user_id 
 * @param {Number} limit 
 * @returns {Promise<Array>}
 */
const getUserFavorites = async (user_id, limit) => {
    return db.prepare('SELECT * FROM user_favorites WHERE user_id = ? LIMIT ?').all(user_id, limit);
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
 * Updates the name of a user.
 * @param {Number} user_id 
 * @param {String} new_name 
 */
const updateUserName = async (user_id, new_name) => {
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(new_name, user_id);
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

module.exports = {
    countUsers,
    createUser,
    createAdminUser,
    findUserByUsername,
    getUser,
    getUserPassword,
    getUserBalance,
    getUserFavorites,
    updateUserUserName,
    updateUserName,
    updateUserEmail,
    updateUserPassword,
    updateUserLanguage
};