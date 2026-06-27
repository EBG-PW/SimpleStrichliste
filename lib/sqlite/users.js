const crypto = require("node:crypto");
const { db } = require('./index.js');
const { CustomError, PurchaseError } = require('@lib/errors');

/**
 * Returns the count of users in the database.
 * @returns {Promise<number>}
 */
const countUsers = async (search = '') => {
  let sql = 'SELECT COUNT(*) as count FROM users WHERE state > 0';
  const params = [];

  if (search) {
    sql += ' AND (name LIKE ? OR username LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const row = await db.prepare(sql).get(...params);
  return row.count;
};

const countTransactions = async () => {
  const row = db.prepare('SELECT COUNT(*) as count FROM transactions').get();
  return row.count;
};

/**
 * Creates a new user in the database.
 * @param {String} name 
 * @param {String} email 
 * @param {String} username 
 * @param {String} password_hash 
 * @param {String|null} language
 */
const createUser = async (name, email, username, password_hash, language = null) => {
  const result = db.prepare('INSERT INTO users (uuid, name, email, username, password_hash, user_role, language) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(crypto.randomUUID(), name, email, username, password_hash, 'user', language);
  return Number(result.lastInsertRowid);
}

/**
 * Generate a new user that is admin.
 * @param {String} name 
 * @param {String} email 
 * @param {String} username 
 * @param {String} password_hash 
 * @param {String|null} language
 */
const createAdminUser = async (name, email, username, password_hash, language = null) => {
  const result = db.prepare('INSERT INTO users (uuid, name, email, username, password_hash, user_role, language) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(crypto.randomUUID(), name, email, username, password_hash, 'admin', language);
  return Number(result.lastInsertRowid);
};

/**
 * Get a user by email.
 * @param {String} email
 * @returns {Promise<Object>}
 */
const findUserByEmail = async (email) => {
  return db.prepare('SELECT * FROM users WHERE email = ? AND state > 0').get(email);
};

/**
 * Get user data of a user.
 * @param {Number} user_id 
 * @returns {Promise<Object>}
 */
const getUser = async (user_id) => {
  return db.prepare('SELECT uuid, name, email, username, user_role, balance / 100.0 as balance, language, page_size, state FROM users where id = ? AND state > 0').get(user_id);
};

/**
 * Get user data of a user by uuid
 * @param {String} uuid 
 * @returns 
 */
const getUserByUUID = async (uuid) => {
  return db.prepare('SELECT uuid, name, email, username, user_role, balance / 100.0 as balance, language, page_size, state FROM users WHERE uuid = ? AND state > 0').get(uuid);
};

/**
 * Gets the internal ID of an active user by UUID.
 * @param {String} uuid
 * @returns {Promise<Number|undefined>}
 */
const getUserIdByUUID = async (uuid) => {
  const user = db.prepare('SELECT id FROM users WHERE uuid = ? AND state > 0').get(uuid);
  return user?.id;
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
const getUsers = async (search = '', sort = 'name', dir = 'asc', page = 1, limit = 5) => {
  const allowedSortColumns = ['name', 'username', 'user_role', 'balance'];
  const sortColumn = allowedSortColumns.includes(sort) ? sort : 'name';

  const sortDirection = dir.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  let sql = `
        SELECT uuid, name, username, user_role, balance / 100.0 as balance
        FROM users
        WHERE state > 0
    `;

  const params = [];

  // Add search functionality if a search term is provided
  if (search) {
    sql += ` AND (name LIKE ? OR username LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ` ORDER BY ${sortColumn} ${sortDirection}`;
  sql += ` LIMIT ? OFFSET ?`;
  params.push(limit, (page - 1) * limit);

  return db.prepare(sql).all(params);
};

/**
 * Retrieves active users available as message recipients.
 * @returns {Array<Object>}
 */
const getMessageRecipientUsers = () => {
  return db.prepare(`
    SELECT id, uuid, name, username, email, language, user_role
    FROM users
    WHERE state > 0
    ORDER BY name COLLATE NOCASE, username COLLATE NOCASE
  `).all();
};

/**
 * Get the password hash of a user.
 * @param {Number} user_id 
 * @returns {Promise<Object>}
 */
const getUserPassword = async (user_id) => {
  return db.prepare('SELECT password_hash FROM users WHERE id = ? AND state > 0').get(user_id);
};

/**
 * Gets the balance of a user.
 * @param {Number} user_id 
 * @returns {Promise<Object>}
 */
const getUserBalance = async (user_id) => {
  return db.prepare('SELECT balance / 100.0 as balance FROM users WHERE id = ? AND state > 0').get(user_id);
};

/**
 * Update the balance of a user and create a transaction record.
 * @param {string} userUuid
 * @param {number} amount
 * @param {number} initiatorId
 * @throws {Error}
 */
const updateBalance = async (userUuid, amount, initiatorId) => {
  const transaction = db.transaction((uuid, depositAmount, initiatorId) => {
    const depositAmountCents = depositAmount * 100;
    const info = db.prepare('UPDATE users SET balance = balance + ? WHERE uuid = ? AND state > 0').run(depositAmountCents, uuid);
    if (info.changes === 0) throw new Error(`User with UUID '${uuid}' not found.`);
    const DEPOSIT_ITEM_UUID = '13620506-b9f8-44d7-a9ff-d1b58ddee93f'; // UUID of the "Transaction" item
    db.prepare('INSERT INTO transactions (user_id, item_id, quantity, price_at_transaction, initiator_id) VALUES ((SELECT id FROM users WHERE uuid = ?), (SELECT id FROM items WHERE uuid = ?), ?, ?, ?)'
    ).run(uuid, DEPOSIT_ITEM_UUID, 1, depositAmountCents, initiatorId);
    return;
  });
  return await transaction(userUuid, amount, initiatorId);
}

/**
 * Set the balance of a user and create a transaction record.
 * @param {string} userUuid
 * @param {number} balance
 * @param {number} initiatorId
 * @throws {Error}
 */
const setBalance = (userUuid, balance, initiatorId) => {
  const balanceCents = Math.round(balance * 100);
  const DEPOSIT_ITEM_UUID = '13620506-b9f8-44d7-a9ff-d1b58ddee93f';

  const executeUpdate = db.transaction((uuid, target) => {
    const user = db.prepare('SELECT id, balance FROM users WHERE uuid = ? AND state > 0').get(uuid);
    if (!user) throw new Error(`User ${uuid} not found.`);

    const diffCents = target - user.balance;
    if (diffCents === 0) return 0;

    db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(target, user.id);
    db.prepare(`
      INSERT INTO transactions (user_id, item_id, quantity, price_at_transaction, initiator_id)
      VALUES (?, (SELECT id FROM items WHERE uuid = ?), 1, ?, ?)
    `).run(user.id, DEPOSIT_ITEM_UUID, diffCents, initiatorId);
    return diffCents;
  });

  try {
    return executeUpdate(userUuid, balanceCents);
  } catch (err) {
    console.error("Balance update failed, changes rolled back:", err.message);
    throw err;
  }
};

/**
 * Purchases an item for a user.
 * @param {string} userUUID
 * @param {string} itemUUID
 * @param {number} quantity
 * @param {number} initiatorId
 */
const purchaseItem = async (userUUID, itemUUID, quantity, initiatorId) => {
  const transaction = db.transaction((userUUID, itemUUID, quantity, initiatorId) => {
    const user = db.prepare('SELECT id, balance FROM users WHERE uuid = ? AND state > 0').get(userUUID);
    const item = db.prepare(`
      SELECT id,
             uuid,
             name,
             CASE WHEN discount_price IS NOT NULL AND discount_price < price AND datetime(discount_until) > datetime('now')
                  THEN discount_price ELSE price END AS price,
             stock, target_stock, is_active
      FROM items WHERE uuid = ?
    `).get(itemUUID);

    if (!user) throw new CustomError(`UnknownUser`).withStatus(404);
    if (!item) throw new CustomError(`UnknownItem`).withStatus(404);
    if (item.is_active !== 1) throw new PurchaseError(`PurchaseErrorNotAvailable`).withStatus(400);

    if (item.stock < quantity) throw new PurchaseError(`PurchaseErrorStock`).withStatus(400);

    const totalPrice = item.price * quantity;
    if (user.balance < totalPrice) throw new PurchaseError(`PurchaseErrorFunds`).withStatus(400);

    const updateBalance = db.prepare('UPDATE users SET balance = balance - ? WHERE id = ? AND state > 0 AND balance >= ?').run(totalPrice, user.id, totalPrice);
    if (updateBalance.changes === 0) throw new PurchaseError(`PurchaseErrorFunds`).withStatus(400);
    db.prepare('UPDATE items SET stock = stock - ? WHERE uuid = ?').run(quantity, itemUUID);
    db.prepare('INSERT INTO transactions (user_id, item_id, quantity, price_at_transaction, initiator_id) VALUES (?, ?, ?, ?, ?)').run(user.id, item.id, quantity, item.price, initiatorId);

    return {
      userId: user.id,
      itemId: item.id,
      quantity,
      price: item.price,
      previousStock: item.stock,
      item: {
        uuid: item.uuid,
        name: item.name,
        stock: item.stock - quantity,
        target_stock: item.target_stock,
      },
    };
  });

  return await transaction(userUUID, itemUUID, quantity, initiatorId);
}

/**
 * Retrieves the transaction history of a user.
 * @param {Number} user_id
 * @param {Number} limit
 * @param {Number} page
 * @param {Boolean} groupbyday
 * @returns {Promise<Array>}
 */
const getUserTransactionHistory = async (user_id, limit = 10, page = 1, groupbyday = true) => {
  const offset = (page - 1) * limit;
  let query;
  if (groupbyday) {
    query = `
      SELECT
        NULL AS id,
        t.user_id,
        t.item_id,
        SUM(t.quantity) AS quantity,
        SUM(t.price_at_transaction * t.quantity) / SUM(t.quantity) / 100.0 AS price_at_transaction,
        t.transaction_timestamp,
        t.status,
        0 AS can_refund,
        t.custom_item_text,
        i.uuid AS item_uuid,
        i.name AS item_name,
        u.uuid AS user_uuid,
        u.name AS user_name,
        u.username AS user_username,
        initiator.name AS initiator_name,
        initiator.username AS initiator_username
      FROM
        transactions t
      JOIN
        items i ON t.item_id = i.id
      JOIN
        users u ON t.user_id = u.id
      JOIN
        users initiator ON t.initiator_id = initiator.id
      WHERE
        t.user_id = ?
      GROUP BY
        DATE(t.transaction_timestamp), t.item_id, t.status, t.custom_item_text, t.user_id, i.uuid, i.name, u.uuid, u.name, u.username, initiator.name, initiator.username
      ORDER BY
        transaction_timestamp DESC
      LIMIT ? OFFSET ?
    `;
  } else {
    query = `
      SELECT
        t.id,
        t.user_id,
        t.item_id,
        t.quantity,
        t.price_at_transaction / 100.0 AS price_at_transaction,
        t.transaction_timestamp,
        t.status,
        CASE
          WHEN t.status = 0
            AND NOT (i.uuid = '13620506-b9f8-44d7-a9ff-d1b58ddee93f' AND t.custom_item_text IS NULL)
            AND (SELECT setting_value FROM app_settings WHERE setting_key = 'AUTO_REFUNDS_ACTIVE') = 'true'
            AND datetime(t.transaction_timestamp, '+' || COALESCE((SELECT setting_value FROM app_settings WHERE setting_key = 'AUTO_REFUNDS_MINUTES'), '0') || ' minutes') >= datetime('now')
          THEN 1
          ELSE 0
        END AS can_refund,
        t.custom_item_text,
        i.uuid AS item_uuid,
        i.name AS item_name,
        u.uuid AS user_uuid,
        u.name AS user_name,
        u.username AS user_username,
        initiator.name AS initiator_name,
        initiator.username AS initiator_username
      FROM
        transactions t
      JOIN
        items i ON t.item_id = i.id
      JOIN
        users u ON t.user_id = u.id
      JOIN
        users initiator ON t.initiator_id = initiator.id
      WHERE
        t.user_id = ?
      ORDER BY
        t.transaction_timestamp DESC
      LIMIT ? OFFSET ?
    `;
  }
  return db.prepare(query).all(user_id, limit, offset);
};

/** Retrieves all transaction history.
 * @param {Number} limit
 * @param {Number} page
 * @param {Boolean} groupbyday
 * @returns {Promise<Array>}
 */
const getAllTransactionHistory = async (limit = 10, page = 1, groupbyday = true) => {
  const offset = (page - 1) * limit;
  let query;
  let params; // Store query parameters

  if (groupbyday) {
    query = `
      SELECT
        NULL AS id,
        t.user_id,
        t.item_id,
        SUM(t.quantity) AS quantity,
        SUM(t.price_at_transaction * t.quantity) / SUM(t.quantity) / 100.0 AS price_at_transaction,
        t.transaction_timestamp,
        t.status,
        0 AS can_refund,
        t.custom_item_text,
        i.uuid AS item_uuid,
        i.name AS item_name,
        u.uuid AS user_uuid,
        u.name AS user_name,
        u.username AS user_username,
        initiator.name AS initiator_name,
        initiator.username AS initiator_username
      FROM
        transactions t
      JOIN
        items i ON t.item_id = i.id
      JOIN
        users u ON t.user_id = u.id
      JOIN
        users initiator ON t.initiator_id = initiator.id
      GROUP BY
        DATE(t.transaction_timestamp), t.item_id, t.status, t.custom_item_text, t.user_id, i.uuid, i.name, u.uuid, u.name, u.username, initiator.name, initiator.username
      ORDER BY
        transaction_timestamp DESC
      LIMIT ? OFFSET ?
    `;
    params = [limit, offset];
  } else {
    query = `
      SELECT
        t.id,
        t.user_id,
        t.item_id,
        t.quantity,
        t.price_at_transaction / 100.0 AS price_at_transaction,
        t.transaction_timestamp,
        t.status,
        CASE
          WHEN t.status = 0
            AND NOT (i.uuid = '13620506-b9f8-44d7-a9ff-d1b58ddee93f' AND t.custom_item_text IS NULL)
          THEN 1
          ELSE 0
        END AS can_refund,
        t.custom_item_text,
        i.uuid AS item_uuid,
        i.name AS item_name,
        u.uuid AS user_uuid,
        u.name AS user_name,
        u.username AS user_username,
        initiator.name AS initiator_name,
        initiator.username AS initiator_username
      FROM
        transactions t
      JOIN
        items i ON t.item_id = i.id
      JOIN
        users u ON t.user_id = u.id
      JOIN
        users initiator ON t.initiator_id = initiator.id
      ORDER BY
        t.transaction_timestamp DESC
      LIMIT ? OFFSET ?
    `;
    params = [limit, offset];
  }

  return db.prepare(query).all(...params);
}

const isAutoRefundAvailable = () => {
  const active = db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get('AUTO_REFUNDS_ACTIVE');
  return active?.setting_value === 'true';
};

const getAutoRefundMinutes = () => {
  const setting = db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get('AUTO_REFUNDS_MINUTES');
  const minutes = Number(setting?.setting_value ?? 0);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
};

const refundTransaction = (transactionId, requesterId, { force = false } = {}) => {
  const runRefund = db.transaction((id, userId, forceRefund) => {
    const transaction = db.prepare(`
      SELECT
        t.id,
        t.user_id,
        t.item_id,
        t.quantity,
        t.price_at_transaction,
        t.transaction_timestamp,
        t.status,
        t.custom_item_text,
        i.uuid AS item_uuid
      FROM transactions t
      JOIN items i ON i.id = t.item_id
      WHERE t.id = ?
    `).get(id);

    if (!transaction) return { success: false, status: 404, error: 'Transaction not found' };
    if (transaction.status === 1) return { success: false, status: 409, error: 'Transaction already refunded' };
    if (transaction.item_uuid === '13620506-b9f8-44d7-a9ff-d1b58ddee93f' && !transaction.custom_item_text) {
      return { success: false, status: 400, error: 'System transactions cannot be refunded' };
    }

    if (!forceRefund) {
      if (transaction.user_id !== userId) return { success: false, status: 404, error: 'Transaction not found' };
      if (!isAutoRefundAvailable()) return { success: false, status: 403, error: 'Auto refunds disabled' };

      const minutes = getAutoRefundMinutes();
      const timestamp = `${String(transaction.transaction_timestamp).replace(' ', 'T')}Z`;
      const ageMs = Date.now() - new Date(timestamp).getTime();
      if (!minutes || Number.isNaN(ageMs) || ageMs > minutes * 60 * 1000) {
        return { success: false, status: 403, error: 'Refund window expired' };
      }
    }

    const refundAmount = transaction.price_at_transaction * transaction.quantity;
    const balanceDelta = transaction.item_uuid === '13620506-b9f8-44d7-a9ff-d1b58ddee93f' && !transaction.custom_item_text
      ? refundAmount * -1
      : refundAmount;
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(balanceDelta, transaction.user_id);
    db.prepare('UPDATE items SET stock = stock + ? WHERE id = ? AND is_active = 1').run(transaction.quantity, transaction.item_id);
    db.prepare('UPDATE transactions SET status = 1 WHERE id = ?').run(transaction.id);
    db.prepare(`
      INSERT INTO refunds (user_id, transaction_id, authorizer_id, status, approved_timestamp)
      VALUES (?, ?, ?, 1, datetime('now'))
    `).run(transaction.user_id, transaction.id, userId);

    return { success: true, refundedAmount: refundAmount };
  });

  return runRefund(transactionId, requesterId, force);
};

/**
 * Retrieves a user's favorite items.
 * @param {Number} user_id
 * @param {Number} limit
 * @returns {Promise<Array>}
 */
const getUserFavorites = async (user_id, limit) => {
  return db.prepare(`
    SELECT items.uuid, items.name, items.stock,
           CASE WHEN items.discount_price IS NOT NULL AND items.discount_price < items.price AND datetime(items.discount_until) > datetime('now')
                THEN items.discount_price ELSE items.price END / 100.0 AS price,
           items.price / 100.0 AS original_price,
           CASE WHEN items.discount_price IS NOT NULL AND items.discount_price < items.price AND datetime(items.discount_until) > datetime('now')
                THEN 1 ELSE 0 END AS is_discounted,
           items.discount_until, items.category_id
    FROM user_favorites
    JOIN items ON user_favorites.item_id = items.id
    WHERE user_favorites.user_id = ? AND items.is_active = 1 LIMIT ?
  `).all(user_id, limit);
}

/**
 * Updates the username of a user.
 * @param {Number} user_id 
 * @param {String} new_username 
 */
const updateUserUserName = async (user_id, new_username) => {
  db.prepare('UPDATE users SET username = ? WHERE id = ? AND state > 0').run(new_username, user_id);
};

/**
 * Updates the username of a user.
 * @param {String} user_uuid 
 * @param {String} new_username 
 */
const updateUserUserNameByUUID = async (user_uuid, new_username) => {
  db.prepare('UPDATE users SET username = ? WHERE uuid = ? AND state > 0').run(new_username, user_uuid);
};

/**
 * Updates the name of a user.
 * @param {Number} user_id 
 * @param {String} new_name 
 */
const updateUserName = async (user_id, new_name) => {
  db.prepare('UPDATE users SET name = ? WHERE id = ? AND state > 0').run(new_name, user_id);
};

/**
 * Updates the name of a user.
 * @param {String} user_uuid 
 * @param {String} new_name 
 */
const updateUserNameByUUID = async (user_uuid, new_name) => {
  db.prepare('UPDATE users SET name = ? WHERE uuid = ? AND state > 0').run(new_name, user_uuid);
};

/**
 * Updates the email of a user.
 * @param {Number} user_id 
 * @param {String} new_email 
 */
const updateUserEmail = async (user_id, new_email) => {
  db.prepare('UPDATE users SET email = ? WHERE id = ? AND state > 0').run(new_email, user_id);
};

/**
 * Updates the email of a user.
 * @param {String} user_uuid 
 * @param {String} new_email 
 */
const updateUserEmailByUUID = async (user_uuid, new_email) => {
  db.prepare('UPDATE users SET email = ? WHERE uuid = ? AND state > 0').run(new_email, user_uuid);
};

/**
 * Updates the password of a user.
 * @param {Number} user_id 
 * @param {String} new_password_hash 
 */
const updateUserPassword = async (user_id, new_password_hash) => {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ? AND state > 0').run(new_password_hash, user_id);
};

/**
 * Updates the language of a user.
 * @param {Number} user_id 
 * @param {String} new_language 
 */
const updateUserLanguage = async (user_id, new_language) => {
  db.prepare('UPDATE users SET language = ? WHERE id = ? AND state > 0').run(new_language, user_id);
};

/**
 * Updates the preferred page size of a user.
 * @param {Number} user_id
 * @param {Number} page_size
 */
const updateUserPageSize = async (user_id, page_size) => {
  db.prepare('UPDATE users SET page_size = ? WHERE id = ? AND state > 0').run(page_size, user_id);
};

/**
 * Updates the language of a user.
 * @param {String} user_uuid
 * @param {String} new_language 
 */
const updateUserLanguageByUUID = async (user_uuid, new_language) => {
  db.prepare('UPDATE users SET language = ? WHERE uuid = ? AND state > 0').run(new_language, user_uuid);
};

/**
 * Updates the user group of a user.
 * @param {String} user_uuid
 * @param {String} new_user_group
 */
const updateUserGroupByUUID = async (user_uuid, new_user_group) => {
  db.prepare('UPDATE users SET user_role = ? WHERE uuid = ? AND state > 0').run(new_user_group, user_uuid);
};

/**
 * Soft-deletes and anonymizes a user while preserving foreign-key references.
 * @param {String} user_uuid
 * @returns {{deleted: boolean, sessionTokens: string[]}}
 */
const softDeleteUserByUUID = (user_uuid) => {
  const transaction = db.transaction((uuid) => {
    const user = db.prepare(`
      SELECT id, uuid, name, email, username, language
      FROM users
      WHERE uuid = ? AND state > 0
    `).get(uuid);
    if (!user) return { deleted: false, sessionTokens: [] };

    const sessionTokens = db.prepare('SELECT session_id FROM websessions WHERE user_id = ?').all(user.id).map((row) => row.session_id);
    const shortUUID = uuid.split('-')[0];

    db.prepare(`
      UPDATE users
      SET
        state = 0,
        name = ?,
        email = ?,
        username = ?,
        password_hash = '',
        user_role = 'unknown',
        language = NULL
      WHERE id = ?
    `).run(shortUUID, `${shortUUID}@deleted.local`, shortUUID, user.id);

    db.prepare('DELETE FROM websessions WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM user_favorites WHERE user_id = ?').run(user.id);

    return {
      deleted: true,
      sessionTokens,
      user: {
        id: user.id,
        uuid: user.uuid,
        name: user.name,
        email: user.email,
        username: user.username,
        language: user.language,
      },
    };
  });

  return transaction(user_uuid);
};

module.exports = {
  countUsers,
  countTransactions,
  createUser,
  createAdminUser,
  findUserByEmail,
  getUser,
  getUserByUUID,
  getUserIdByUUID,
  getUsers,
  getMessageRecipientUsers,
  getUserPassword,
  getUserBalance,
  updateBalance,
  setBalance,
  purchaseItem,
  getUserTransactionHistory,
  getAllTransactionHistory,
  refundTransaction,
  getUserFavorites,
  updateUserUserName,
  updateUserUserNameByUUID,
  updateUserName,
  updateUserNameByUUID,
  updateUserEmail,
  updateUserEmailByUUID,
  updateUserLanguage,
  updateUserPageSize,
  updateUserLanguageByUUID,
  updateUserPassword,
  updateUserGroupByUUID,
  softDeleteUserByUUID
};
