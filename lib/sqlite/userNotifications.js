const { db } = require('./index.js');

const getUserNotificationState = (userId, key, type, defaultState = true) => {
    const preference = db.prepare(`
        SELECT state
        FROM user_notifications
        WHERE user_id = ? AND "key" = ? AND "type" = ?
    `).get(userId, key, type);

    return preference ? preference.state === 1 : Boolean(defaultState);
};

const getUserNotifications = (userId) => {
    return db.prepare(`
        SELECT "key", "type", state
        FROM user_notifications
        WHERE user_id = ?
        ORDER BY "key", "type"
    `).all(userId).map((preference) => ({
        key: preference.key,
        type: preference.type,
        state: preference.state === 1,
    }));
};

const setUserNotificationState = (userId, key, type, state) => {
    db.prepare(`
        INSERT INTO user_notifications (user_id, "key", "type", state)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, "key", "type")
        DO UPDATE SET state = excluded.state
    `).run(userId, key, type, state ? 1 : 0);
};

const getNotificationSubscribers = (key, type, defaultState = true) => {
    return db.prepare(`
        SELECT u.id, u.uuid, u.name, u.email, u.username, u.language
        FROM users u
        LEFT JOIN user_notifications un
          ON un.user_id = u.id
         AND un."key" = ?
         AND un."type" = ?
        WHERE u.state > 0
          AND COALESCE(un.state, ?) = 1
        ORDER BY u.id
    `).all(key, type, defaultState ? 1 : 0);
};

module.exports = {
    getUserNotificationState,
    getUserNotifications,
    setUserNotificationState,
    getNotificationSubscribers,
};
