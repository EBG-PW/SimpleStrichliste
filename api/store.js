const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const { getActiveCategories } = require('@lib/sqlite/categories');
const { getUserBalance, getUserFavorites } = require('@lib/sqlite/users');
const { getItemsByCategory, toggleUserFavorite } = require('@lib/sqlite/items');
const gategories_conf = require('@config/categories');
const Joi = require('@lib/sanitizer');
const HyperExpress = require('hyper-express');
const router = new HyperExpress.Router();


/* Plugin info*/
const PluginName = 'Store'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const paginationSchema = Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(10),
    page: Joi.number().integer().min(1).default(1)
});

router.get('/overview', verifyRequest('web.user.store.read'), limiter(4), async (req, res) => {
    const categories = await getActiveCategories();
    // Add parameters from the config file to the categories
    for (const category of categories) {
        if (gategories_conf[category.name]) {
            category.icon = gategories_conf[category.name].Icon;
        }
    }
    const { balance } = await getUserBalance(req.user.user_data.id);
    const favorites = await getUserFavorites(req.user.user_data.id, 10);
    return res.json({ categories, balance, favorites });
});

router.get('/categorie/:categoryName', verifyRequest('web.user.items.read'), limiter(4), async (req, res) => {
    const categoryName = await Joi.string().valid(...Object.keys(gategories_conf)).validateAsync(req.params.categoryName);
    const query = await paginationSchema.validateAsync(req.query);
    const items = await getItemsByCategory(categoryName, query.limit, query.page);
    res.json(items);
});

router.post('/item/:uuid/favorite', verifyRequest('web.user.favorite.write'), limiter(4), async (req, res) => {
    const uuid = await Joi.string().uuid().validateAsync(req.params.uuid);
    const isFavorite = await toggleUserFavorite(req.user.user_data.id, uuid);
    return res.json({ isFavorite });
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};

