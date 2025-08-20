const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const { getTransactionHistory } = require('@lib/sqlite/users');
const Joi = require('@lib/sanitizer');
const HyperExpress = require('hyper-express');
const router = new HyperExpress.Router();

/* Plugin info*/
const PluginName = 'Transactions'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const paginationSchema = Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(10),
    page: Joi.number().integer().min(1).default(1)
});

router.get('/', async (req, res) => {
    const query = await paginationSchema.validateAsync(req.query);

    const transactions = await getTransactionHistory(1, query.limit, query.page);
    res.json({ transactions });
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};

