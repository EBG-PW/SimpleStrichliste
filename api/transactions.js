const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const { getUserTransactionHistory, getAllTransactionHistory, getUserIdByUUID, refundTransaction } = require('@lib/sqlite/users');
const Joi = require('@lib/sanitizer');
const express = require('ultimate-express');
const router = new express.Router();

/* Plugin info*/
const PluginName = 'Transactions'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const paginationSchema = Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(10),
    page: Joi.number().integer().min(1).default(1),
    groupbyday: Joi.boolean().default(false),
});

const userUUIDSchema = Joi.object({
    uuid: Joi.string().uuid().required(),
});

const transactionIdSchema = Joi.object({
    id: Joi.number().integer().min(1).required(),
});

router.get('/', verifyRequest('web.user.transactions.read'), limiter(4), async (req, res) => {
    const query = await paginationSchema.validateAsync(req.query);
    const transactions = await getUserTransactionHistory(req.user.user_data.id, query.limit, query.page, query.groupbyday);
    res.json({ transactions });
});

router.get('/all', verifyRequest('web.admin.transactions.read'), limiter(4), async (req, res) => {
    const query = await paginationSchema.validateAsync(req.query);
    const transactions = await getAllTransactionHistory(query.limit, query.page, query.groupbyday);
    res.json({ transactions });
});

router.get('/user/:uuid', verifyRequest('web.admin.transactions.read'), limiter(4), async (req, res) => {
    const params = await userUUIDSchema.validateAsync(req.params);
    const query = await paginationSchema.validateAsync(req.query);
    const userId = await getUserIdByUUID(params.uuid);

    if (!userId) {
        return res.status(404).json({ error: 'User not found' });
    }

    const transactions = await getUserTransactionHistory(userId, query.limit, query.page, query.groupbyday);
    res.json({ transactions });
});

router.post('/:id/refund', verifyRequest('web.user.transactions.write'), limiter(2), async (req, res) => {
    const params = await transactionIdSchema.validateAsync(req.params);
    const result = refundTransaction(params.id, req.user.user_data.id);

    if (!result.success) {
        return res.status(result.status || 400).json({ error: result.error || 'Refund failed' });
    }

    return res.json({ success: true, refundedAmount: result.refundedAmount });
});

router.post('/admin/:id/refund', verifyRequest('web.admin.transactions.write'), limiter(2), async (req, res) => {
    const params = await transactionIdSchema.validateAsync(req.params);
    const result = refundTransaction(params.id, req.user.user_data.id, { force: true });

    if (!result.success) {
        return res.status(result.status || 400).json({ error: result.error || 'Refund failed' });
    }

    return res.json({ success: true, refundedAmount: result.refundedAmount });
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};

