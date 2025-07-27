const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const { getActiveCategories } = require('@lib/sqlite/categories');
const { getUserBalance, getUserFavorites } = require('@lib/sqlite/users');
const Joi = require('@lib/sanitizer');
const HyperExpress = require('hyper-express');
const router = new HyperExpress.Router();


/* Plugin info*/
const PluginName = 'Store'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

router.get('/overview', verifyRequest('web.user.store.read'), limiter(4), async (req, res) => {
    const categories = await getActiveCategories();
    const { balance } = await getUserBalance(req.user.user_data.id);
    const favorites = await getUserFavorites(req.user.user_data.id, 5);
    return res.json({ categories, balance, favorites });
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};

