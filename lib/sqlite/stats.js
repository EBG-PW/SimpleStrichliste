const { db } = require('./index.js'); // Assuming your db connection is exported from index.js

/**
 * Backfills the statistics tables with data from the transactions table.
 */
const backfillStatistics = () => {

    // Get the last date from the stats tables to know where to start from.
    const lastDailySale = db.prepare('SELECT MAX(sale_date) as last_date FROM daily_item_purchases').get();
    const startDate = lastDailySale?.last_date || '1970-01-01';

    process.log.system(`Backfilling statistics data from ${startDate}...`);

    // Backfill daily item purchases
    const backfillStmt = db.prepare(`
        INSERT INTO daily_item_purchases (sale_date, item_id, total_quantity)
        SELECT DATE(transaction_timestamp), item_id, SUM(quantity)
        FROM transactions
        WHERE DATE(transaction_timestamp) > ?
        GROUP BY DATE(transaction_timestamp), item_id
        ON CONFLICT(sale_date, item_id) DO UPDATE SET
        total_quantity = total_quantity + excluded.total_quantity;
    `);
    backfillStmt.run(startDate);

    const categoryBackfillStmt = db.prepare(`
        INSERT INTO daily_category_sales (sale_date, category_id, total_quantity)
        SELECT DATE(t.transaction_timestamp), i.category_id, SUM(t.quantity)
        FROM transactions t
        JOIN items i ON t.item_id = i.id
        WHERE DATE(t.transaction_timestamp) > ?
        GROUP BY DATE(t.transaction_timestamp), i.category_id
        ON CONFLICT(sale_date, category_id) DO UPDATE SET
        total_quantity = total_quantity + excluded.total_quantity;
    `);
    categoryBackfillStmt.run(startDate);

    // Make sure its correct, dropping it. ToDO: If performance is an issue, find other way
    db.transaction(() => {
        db.prepare('DELETE FROM user_category_purchases').run();
        const userCategoryPurchasesStmt = db.prepare(`
            INSERT INTO user_category_purchases (user_id, category_id, total_quantity)
            SELECT t.user_id, i.category_id, SUM(t.quantity)
            FROM transactions t
            JOIN items i ON t.item_id = i.id
            GROUP BY t.user_id, i.category_id
        `);
        userCategoryPurchasesStmt.run();
    })();
}


/**
 * Gets sales data for all categories, grouped by a specified time period.
 * @param {'day' | 'week' | 'month' | 'year'} period - The time period to group by.
 * @param {string} startDate - The start date in 'YYYY-MM-DD' format.
 * @param {string} endDate - The end date in 'YYYY-MM-DD' format.
 * @returns {Array}
 */
const getCategorySalesByPeriod = (period = 'day', startDate, endDate) => {
    let periodFormat;
    switch (period) {
        case 'week':
            periodFormat = '%Y-%W';
            break;
        case 'month':
            periodFormat = '%Y-%m';
            break;
        case 'year':
            periodFormat = '%Y';
            break;
        default:
            periodFormat = '%Y-%m-%d';
            break;
    }

    const stmt = db.prepare(`
        SELECT
            strftime(?, dcs.sale_date) as period,
            ic.name as category_name,
            SUM(dcs.total_quantity) as total_quantity
        FROM daily_category_sales dcs
        JOIN item_categories ic ON dcs.category_id = ic.id
        WHERE dcs.sale_date BETWEEN ? AND ?
        GROUP BY period, ic.name
        ORDER BY period, total_quantity DESC
    `);

    return stmt.all(periodFormat, startDate, endDate);
}

/**
 * Finds the top buyer for a specific category within a given date range.
 * Note: This queries the main transactions table directly to provide date-range accuracy.
 * @param {number} categoryId - The ID of the category to check.
 * @param {string} startDate - The start date in 'YYYY-MM-DD' format.
 * @param {string} endDate - The end date in 'YYYY-MM-DD' format.
 * @returns {object | undefined}
 */
const getTopBuyerForCategoryInPeriod = (categoryId, startDate, endDate) => {
    const stmt = db.prepare(`
        SELECT
            u.name as user_name,
            SUM(t.quantity) as total_quantity
        FROM transactions t
        JOIN users u ON t.user_id = u.id
        JOIN items i ON t.item_id = i.id
        WHERE i.category_id = ?
          AND DATE(t.transaction_timestamp) BETWEEN ? AND ?
        GROUP BY u.name
        ORDER BY total_quantity DESC
        LIMIT 1
    `);
    return stmt.get(categoryId, startDate, endDate);
}


/**
 * Gets the total sales for a specific item, grouped by a specified time period.
 * @param {number} itemId - The ID of the item.
 * @param {'day' | 'week' | 'month' | 'year'} period - The period to group by.
 * @param {string} startDate - The start date in 'YYYY-MM-DD' format.
 * @param {string} endDate - The end date in 'YYYY-MM-DD' format.
 * @returns {Array}
 */
const getItemSalesByPeriod = (itemId, period = 'day', startDate, endDate) => {
    let periodFormat;
    switch (period) {
        case 'week':
            periodFormat = '%Y-%W';
            break;
        case 'month':
            periodFormat = '%Y-%m';
            break;
        case 'year':
            periodFormat = '%Y';
            break;
        default:
            periodFormat = '%Y-%m-%d';
            break;
    }

    const stmt = db.prepare(`
        SELECT
            strftime(?, sale_date) as period,
            SUM(total_quantity) as total_quantity
        FROM daily_item_purchases
        WHERE item_id = ?
          AND sale_date BETWEEN ? AND ?
        GROUP BY period
        ORDER BY period
    `);

    return stmt.all(periodFormat, itemId, startDate, endDate);
}

/**
 * Gets the top selling items within a date range.
 * @param {string} startDate - The start date in 'YYYY-MM-DD' format.
 * @param {string} endDate - The end date in 'YYYY-MM-DD' format.
 * @param {number} [limit=10] - The number of top items to return.
 * @returns {Array}
 */
const getTopSellingItems = (startDate, endDate, limit = 10) => {
    const stmt = db.prepare(`
        SELECT
            i.name as item_name,
            SUM(dip.total_quantity) as total_sold
        FROM daily_item_purchases dip
        JOIN items i ON dip.item_id = i.id
        WHERE dip.sale_date BETWEEN ? AND ?
        GROUP BY i.name
        ORDER BY total_sold DESC
        LIMIT ?
    `);
    return stmt.all(startDate, endDate, limit);
}

/**
 * Finds the busiest periods (day, week, month) for sales.
 * @param {'day' | 'week' | 'month'} period - The period to analyze.
 * @param {string} startDate - The start date in 'YYYY-MM-DD' format.
 * @param {string} endDate - The end date in 'YYYY-MM-DD' format.
 * @param {number} [limit=5] - The number of top periods to return.
 * @returns {Array}
 */
const getBusiestPeriods = (period = 'day', startDate, endDate, limit = 5) => {
    let periodFormat;
    switch (period) {
        case 'week':
            periodFormat = '%Y-%W';
            break;
        case 'month':
            periodFormat = '%Y-%m';
            break;
        default:
            periodFormat = '%Y-%m-%d';
            break;
    }

    const stmt = db.prepare(`
        SELECT
            strftime(?, sale_date) as period,
            SUM(total_quantity) as total_sales
        FROM daily_item_purchases
        WHERE sale_date BETWEEN ? AND ?
        GROUP BY period
        ORDER BY total_sales DESC
        LIMIT ?
    `);
    return stmt.all(periodFormat, startDate, endDate, limit);
}


module.exports = {
    backfillStatistics,
    getCategorySalesByPeriod,
    getTopBuyerForCategoryInPeriod,
    getItemSalesByPeriod,
    getTopSellingItems,
    getBusiestPeriods,
};
