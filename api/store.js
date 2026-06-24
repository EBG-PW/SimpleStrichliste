const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const { getActiveCategories } = require('@lib/sqlite/categories');
const { getUserBalance, getUserFavorites, purchaseItem } = require('@lib/sqlite/users');
const { getItemsByCategory, toggleUserFavorite } = require('@lib/sqlite/items');
const { getSetting } = require('@lib/sqlite/settings');
const { getCategoryPurchaseLeaderboard } = require('@lib/sqlite/stats');
const { notifyLowStockIfNeeded } = require('@lib/notifications');
const gategories_conf = require('@config/categories');
const Joi = require('@lib/sanitizer');
const express = require('ultimate-express');
const router = new express.Router();


/* Plugin info*/
const PluginName = 'Store'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const paginationSchema = Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(10),
    page: Joi.number().integer().min(1).default(1)
});

const buySchema = Joi.object({
    uuid: Joi.string().uuid().required(),
    quantity: Joi.number().integer().positive().min(1).max(99).required()
});

const leaderboardSchema = Joi.object({
    range: Joi.string().valid('week', 'month', 'all').default('week')
});

router.get('/overview', verifyRequest('web.user.store.read'), limiter(2), async (req, res) => {
    const categories = await getActiveCategories();
    // Add parameters from the config file to the categories
    for (const category of categories) {
        if (gategories_conf[category.name]) {
            category.icon = gategories_conf[category.name].Icon;
        }
    }
    const { balance } = await getUserBalance(req.user.user_data.id);
    const favorites = await getUserFavorites(req.user.user_data.id, 10);
    const [lowFundsWarning, lowFundsAmount, lowFundsResettime, lowFundsString] = await Promise.all([
        getSetting('LOW_FUNDS_WARNING'),
        getSetting('LOW_FUNDS_AMOUNT'),
        getSetting('LOW_FUNDS_RESETTIME'),
        getSetting('LOW_FUNDS_STRING')
    ]);
    const lowFunds = {
        enabled: lowFundsWarning === 'true',
        amount: parseFloat(lowFundsAmount || '0') / 100,
        resettime: parseInt(lowFundsResettime || '0', 10),
        message: lowFundsString || ''
    };
    return res.json({ categories, balance, favorites, lowFunds });
});

router.get('/balance', verifyRequest('web.user.store.read'), limiter(1), async (req, res) => {
    const { balance } = await getUserBalance(req.user.user_data.id);
    return res.json({ balance });
});

router.get('/categorie/:categoryName', verifyRequest('web.user.items.read'), limiter(1), async (req, res) => {
    const categoryName = await Joi.string().valid(...Object.keys(gategories_conf)).validateAsync(req.params.categoryName);
    const query = await paginationSchema.validateAsync(req.query);
    const items = await getItemsByCategory(categoryName, query.limit, query.page);
    res.json(items);
});

router.get('/categorie/:categoryName/leaderboard', verifyRequest('web.user.store.read'), limiter(4), async (req, res) => {
    const categoryName = await Joi.string().valid(...Object.keys(gategories_conf)).validateAsync(req.params.categoryName);
    const query = await leaderboardSchema.validateAsync(req.query);
    const leaderboard = getCategoryPurchaseLeaderboard(categoryName, query.range, 5);
    res.json({ category: categoryName, range: query.range, leaderboard });
});

router.post('/item/:uuid/favorite', verifyRequest('web.user.favorite.write'), limiter(1), async (req, res) => {
    const uuid = await Joi.string().uuid().validateAsync(req.params.uuid);
    const isFavorite = await toggleUserFavorite(req.user.user_data.id, uuid);
    return res.json({ isFavorite });
});

router.post('/buy', verifyRequest('web.user.store.write'), limiter(4), async (req, res) => {
    const { uuid, quantity } = await buySchema.validateAsync(req.body);

    const result = await purchaseItem(req.user.user_data.uuid, uuid, quantity, req.user.user_data.id);
    void notifyLowStockIfNeeded(result.previousStock, result.item)
        .catch((error) => process.log?.error?.(`Low stock notification failed: ${error?.message || error}`));

    return res.json({ success: true });
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};

