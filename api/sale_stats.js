const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const { getSaleStatsCategories, getSaleStatsByCategory, getSaleStatsItemsByCategory } = require('@lib/sqlite/stats');
const Joi = require('@lib/sanitizer');
const express = require('ultimate-express');
const router = new express.Router();

/* Plugin info*/
const PluginName = 'SaleStats';
const PluginRequirements = [];
const PluginVersion = '0.0.1';

const rangeSchema = Joi.object({
    days: Joi.number().integer().valid(7, 30, 90, 365).default(7),
    period: Joi.string().valid('day', 'week').default('day')
});

const itemStatsSchema = rangeSchema.keys({
    category: Joi.string().uuid().required()
});

const formatDate = (date) => date.toISOString().slice(0, 10);

const getDateRange = (days) => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days + 1);

    return {
        startDate: formatDate(start),
        endDate: formatDate(end)
    };
};

router.get('/categories', verifyRequest('app.admin.stats.read'), limiter(4), async (req, res) => {
    const categories = getSaleStatsCategories();
    return res.json({ categories });
});

router.get('/category_sales', verifyRequest('app.admin.stats.read'), limiter(4), async (req, res) => {
    const query = await rangeSchema.validateAsync(req.query);
    const { startDate, endDate } = getDateRange(query.days);
    const stats = getSaleStatsByCategory(query.period, startDate, endDate);

    return res.json({
        range: { days: query.days, period: query.period, startDate, endDate },
        ...stats
    });
});

router.get('/item_sales', verifyRequest('app.admin.stats.read'), limiter(4), async (req, res) => {
    const query = await itemStatsSchema.validateAsync(req.query);
    const { startDate, endDate } = getDateRange(query.days);
    const stats = getSaleStatsItemsByCategory(query.category, query.period, startDate, endDate);

    return res.json({
        range: { days: query.days, period: query.period, startDate, endDate },
        ...stats
    });
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};
