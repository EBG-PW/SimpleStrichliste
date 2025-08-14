const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const { getActiveCategories, updateCategoryStatus } = require('@lib/sqlite/categories');
const gategories_conf = require('@config/categories');
const Joi = require('@lib/sanitizer');
const HyperExpress = require('hyper-express');
const router = new HyperExpress.Router();

/* Plugin info*/
const PluginName = 'Categories'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const categoryNameSchema = Joi.object({
    categoryName: Joi.string().valid(...Object.keys(gategories_conf)).required()
});

const booleanSchema = Joi.object({
    enabled: Joi.boolean().required()
});

router.get('/', verifyRequest('web.user.categories.read'), limiter(4), async (req, res) => {
    const activeCategoriesList = await getActiveCategories();

    const activeCategorySet = new Set(activeCategoriesList.map(c => c.name));

    const allCategories = Object.keys(gategories_conf).map(categoryName => {
        return {
            name: categoryName,
            icon: gategories_conf[categoryName].Icon,
            enabled: activeCategorySet.has(categoryName)
        };
    });

    res.json({ categories: allCategories });
});

router.patch('/:categoryName', verifyRequest('web.user.categories.write'), limiter(4), async (req, res) => {
    const params = await categoryNameSchema.validateAsync(req.params);
    const body = await booleanSchema.validateAsync(await req.json());

    console.log(params, body);

    await updateCategoryStatus(params.categoryName, body.enabled);
    res.json({ success: true });
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};

