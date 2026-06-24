const { db } = require('./index.js');

const recordErrorReport = (message) => {
    db.prepare(`
        INSERT INTO error_reports (message)
        VALUES (?)
    `).run(String(message).slice(0, 4000));
};

const getPendingErrorReports = () => db.prepare(`
    SELECT id, timestamp, message
    FROM error_reports
    WHERE reported_at IS NULL
    ORDER BY timestamp ASC, id ASC
`).all();

const markErrorReportsSent = (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const markOne = db.prepare(`
        UPDATE error_reports
        SET reported_at = datetime('now')
        WHERE id = ?
    `);
    db.transaction((reportIds) => {
        reportIds.forEach((id) => markOne.run(id));
    })(ids);
};

const getAdminNotificationRecipients = () => db.prepare(`
    SELECT id, uuid, name, email, username, language
    FROM users
    WHERE state > 0
      AND user_role = 'admin'
      AND email IS NOT NULL
      AND email != ''
    ORDER BY id ASC
`).all();

const getItemSalesTrend = (itemUuid, days = 30) => {
    const safeDays = Number.isInteger(days) && days > 0 ? days : 30;
    const row = db.prepare(`
        WITH RECURSIVE days(day_offset, sale_date, weight) AS (
            SELECT 0, DATE('now'), ?
            UNION ALL
            SELECT
                day_offset + 1,
                DATE('now', '-' || (day_offset + 1) || ' days'),
                ? - (day_offset + 1)
            FROM days
            WHERE day_offset + 1 < ?
        ),
        daily_sales AS (
            SELECT
                DATE(t.transaction_timestamp) AS sale_date,
                SUM(t.quantity) AS quantity
            FROM transactions t
            JOIN items i ON i.id = t.item_id
            WHERE i.uuid = ?
              AND t.quantity > 0
              AND DATE(t.transaction_timestamp) >= DATE('now', ?)
            GROUP BY DATE(t.transaction_timestamp)
        )
        SELECT
            COALESCE(SUM(COALESCE(daily_sales.quantity, 0)), 0) AS sold_quantity,
            COALESCE(
                SUM(COALESCE(daily_sales.quantity, 0) * days.weight) * 1.0 / SUM(days.weight),
                0
            ) AS weighted_average_per_day
        FROM days
        LEFT JOIN daily_sales ON daily_sales.sale_date = days.sale_date
    `).get(safeDays, safeDays, safeDays, itemUuid, `-${safeDays - 1} days`);

    return {
        days: safeDays,
        soldQuantity: Number(row?.sold_quantity || 0),
        averagePerDay: Number(Number(row?.weighted_average_per_day || 0).toFixed(2)),
    };
};

module.exports = {
    recordErrorReport,
    getPendingErrorReports,
    markErrorReportsSent,
    getAdminNotificationRecipients,
    getItemSalesTrend,
};
