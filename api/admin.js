const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const { countUsers } = require('@lib/sqlite/users');
const { countCategories } = require('@lib/sqlite/categories');
const { countItems } = require('@lib/sqlite/items');
// const Joi = require('@lib/sanitizer');
const HyperExpress = require('hyper-express');
const router = new HyperExpress.Router();


/* Plugin info*/
const PluginName = 'Users'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

/**
 * Returns an overview of the admin dashboard
 */
router.get('/overview', verifyRequest('app.admin.overview.read'), limiter(10), async (req, res) => {
    const usercount = await countUsers();
    const categoriescount = await countCategories();
    const itemscount = await countItems();
    return res.json({ usercount, categoriescount, itemscount });
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};

