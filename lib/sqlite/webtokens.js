const db = require('./index.js');

/**
 * Creates a new webtoken in the database.
 * @param {String} session_id 
 * @param {Number} user_id 
 * @param {String} browser 
 * @return {void}
 */
const createWebtoken = (session_id, user_id, browser) => {
    db.prepare(`INSERT INTO websessions (session_id, user_id, browser) VALUES (?, ?, ?)`)
        .run(session_id, user_id, browser);
}

/**
 * Retrieves a webtoken and user data from the database.
 * @param {String} session_id 
 * @returns {Object}
 */
const getWebtoken = (session_id) => {
    return db.prepare(`SELECT websessions.session_id AS token,
        websessions.user_id as id,
        websessions.browser,
        websessions.created_at AS time,
        users.username,
        users.language,
        users.email,
        users.uuid,
        users.user_role
    FROM websessions
    JOIN users ON websessions.user_id = users.id
    WHERE session_id = ?`)
        .get(session_id);
}

/**
 * Retrieves all webtokens for a user.
 * @param {Number} user_id
 * @returns {void}
 */
const deleteWebtoken = (session_id) => {
    db.prepare(`DELETE FROM websessions WHERE session_id = ?`)
        .run(session_id);
}

/**
 * Retrieves all webtokens for a user.
 * @param {Number} user_id
 * @returns {Array}
 */
const getAllWebtokensForUser = (user_id) => {
    return db.prepare(`SELECT websessions.session_id AS websessions.token,
        websessions.user_id,
        websessions.browser,
        websessions.created_at AS websessions.time
    FROM websessions
    WHERE user_id = ?`)
        .all(user_id);
}

/**
 * Deletes all webtokens for a user.
 * @param {Number} user_id
 */
const deleteAllWebtokensForUser = (user_id) => {
    db.prepare(`DELETE FROM websessions WHERE user_id = ?`)
        .run(user_id);
}

module.exports = {
    createWebtoken,
    getWebtoken,
    deleteWebtoken,
    getAllWebtokensForUser,
    deleteAllWebtokensForUser
};
