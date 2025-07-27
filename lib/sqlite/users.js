const crypto = require("node:crypto");
const db = require('./index.js');

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
 * Gets a user by their username.
 * @param {String} username 
 */
const findUserByUsername = async (username) => {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
};

/**
 * Gets the balance of a user.
 * @param {Number} user_id 
 * @returns 
 */
const getUserBalance = async (user_id) => {
    return db.prepare('SELECT balance FROM users WHERE id = ?').get(user_id);
};

const getUserFavorites = async (user_id, limit) => {
    return db.prepare('SELECT * FROM user_favorites WHERE user_id = ? LIMIT ?').all(user_id, limit);
}

module.exports = {
    countUsers,
    createUser,
    createAdminUser,
    findUserByUsername,
    getUserBalance,
    getUserFavorites
};