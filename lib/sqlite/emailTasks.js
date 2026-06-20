const { db } = require('./index.js');

const EMAIL_TASK_STATUS = Object.freeze({
    PENDING: 0,
    SENT: 1,
    FAILED: 2,
});

const createEmailTask = (userId, priority, type, customMessage, recipient = null) => {
    const snapshot = recipient || db.prepare(`
        SELECT uuid, name, email, username, language
        FROM users
        WHERE id = ?
    `).get(userId);

    if (!snapshot) {
        throw new Error(`Cannot create email task: user ${userId} not found`);
    }

    const result = db.prepare(`
        INSERT INTO email_tasks (
            user_id,
            priority,
            type,
            custom_message,
            status,
            retry_count,
            recipient_uuid,
            recipient_name,
            recipient_email,
            recipient_username,
            recipient_language
        )
        VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `).run(
        userId,
        priority,
        type,
        customMessage,
        EMAIL_TASK_STATUS.PENDING,
        snapshot.uuid,
        snapshot.name,
        snapshot.email,
        snapshot.username,
        snapshot.language
    );

    return {
        id: Number(result.lastInsertRowid),
        user_id: userId,
        priority,
        type,
        custom_message: customMessage,
        status: EMAIL_TASK_STATUS.PENDING,
        retry_count: 0,
    };
};

const getSendableEmailTasks = (maxRetries, limit = 25) => {
    return db.prepare(`
        SELECT
            et.id,
            et.user_id,
            et.type,
            et.custom_message,
            et.priority,
            et.retry_count,
            COALESCE(et.recipient_uuid, u.uuid) AS uuid,
            COALESCE(et.recipient_name, u.name) AS name,
            COALESCE(et.recipient_email, u.email) AS email,
            COALESCE(et.recipient_username, u.username) AS username,
            COALESCE(et.recipient_language, u.language) AS language
        FROM email_tasks et
        JOIN users u ON u.id = et.user_id
        WHERE et.status IN (?, ?)
          AND et.retry_count < ?
        ORDER BY et.created_timestamp ASC, et.id ASC
        LIMIT ?
    `).all(EMAIL_TASK_STATUS.PENDING, EMAIL_TASK_STATUS.FAILED, maxRetries, limit);
};

const markEmailTaskSent = (taskId) => {
    db.prepare(`
        UPDATE email_tasks
        SET status = ?, sent_timestamp = datetime('now'), last_error = NULL
        WHERE id = ?
    `).run(EMAIL_TASK_STATUS.SENT, taskId);
};

const markEmailTaskFailed = (taskId, error) => {
    db.prepare(`
        UPDATE email_tasks
        SET status = ?, retry_count = retry_count + 1, last_error = ?, sent_timestamp = NULL
        WHERE id = ?
    `).run(EMAIL_TASK_STATUS.FAILED, String(error).slice(0, 2000), taskId);
};

module.exports = {
    EMAIL_TASK_STATUS,
    createEmailTask,
    getSendableEmailTasks,
    markEmailTaskSent,
    markEmailTaskFailed,
};
