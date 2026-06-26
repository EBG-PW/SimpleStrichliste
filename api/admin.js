const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const { countUsers, countTransactions, getMessageRecipientUsers, getUserByUUID, getUsers, updateBalance, setBalance, updateUserUserNameByUUID, updateUserNameByUUID, updateUserEmailByUUID, updateUserLanguageByUUID, updateUserGroupByUUID, softDeleteUserByUUID } = require('@lib/sqlite/users');
const { removeWebtoken } = require('@lib/cache');
const { NOTIFICATION_CHANNELS, NOTIFICATION_TYPES, sendNotification } = require('@lib/notifications');
const { countCategories } = require('@lib/sqlite/categories');
const { countItems } = require('@lib/sqlite/items');
const package = require('../package.json');
const Joi = require('@lib/sanitizer');
const express = require('ultimate-express');
const router = new express.Router();


/* Plugin info*/
const PluginName = 'Admin'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const getUserDataTableSchema = Joi.object({
  search: Joi.string().allow('').max(100).optional(),
  sort: Joi.string().valid('name', 'username', 'user_role', 'balance').default('name'),
  dir: Joi.string().valid('asc', 'desc').default('asc'),
  page: Joi.number().min(1).max(10000).default(1),
  limit: Joi.number().min(1).max(50).optional()
});

const updateUserBalanceSchema = Joi.object({
    add: Joi.number().min(-10000).max(10000).required()
});

const setUserBalanceSchema = Joi.object({
    balance: Joi.number().min(-10000).max(10000).required()
});

const getUserByUUIDSchema = Joi.object({
    uuid: Joi.string().uuid().required()
});

const userNameSchema = Joi.object({
    name: Joi.fullysanitizedString().min(1).max(100).required(),
});

const userEmailSchema = Joi.object({
    email: Joi.string().email().required(),
});

const userUsernameSchema = Joi.object({
    username: Joi.fullysanitizedString().min(3).max(30).required(),
});

const userLanguageSchema = Joi.object({
    language: Joi.fullysanitizedString().min(2).max(2).required()
});

const userGroupCheck = Joi.object({
    userGroup: Joi.string().valid(...Object.keys(process.permissions_config.groups)).required(),
});

const messageTargetSchema = Joi.object({
    type: Joi.string().valid('all', 'group', 'user').required(),
    value: Joi.when('type', {
        switch: [
            { is: 'all', then: Joi.string().valid('all').default('all') },
            { is: 'group', then: Joi.string().valid(...Object.keys(process.permissions_config.groups)).required() },
            { is: 'user', then: Joi.string().uuid().required() },
        ],
    }),
});

const messageSendSchema = Joi.object({
    target: messageTargetSchema.required(),
    message: Joi.sanitizedString().min(1).max(10000).required(),
});

const getMessageRecipientSelection = (target) => {
    const users = getMessageRecipientUsers();
    if (target.type === 'all') return users;
    if (target.type === 'group') return users.filter((user) => user.user_role === target.value);
    return users.filter((user) => user.uuid === target.value);
};

/**
 * Returns an overview of the admin dashboard
 */
router.get('/overview', verifyRequest('app.admin.overview.read'), limiter(10), async (req, res) => {
    const usercount = await countUsers();
    const categoriescount = await countCategories();
    const itemscount = await countItems();
    const transactionscount = await countTransactions();
    const appversion = package.version;
    return res.json({ usercount, categoriescount, itemscount, transactionscount, appversion });
});

router.get('/user/:uuid', verifyRequest('app.admin.users.read'), limiter(1), async (req, res) => {
    const params = await getUserByUUIDSchema.validateAsync(req.params);

    const user = await getUserByUUID(params.uuid);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
});

router.put('/user/:uuid/name', verifyRequest('app.admin.settings.name.write'), limiter(10), async (req, res) => {
    const body = await userNameSchema.validateAsync(req.body);
    const params = await getUserByUUIDSchema.validateAsync(req.params);

    await updateUserNameByUUID(params.uuid, body.name);
    return res.json({ message: 'Name updated successfully' });
});

router.put('/user/:uuid/email', verifyRequest('app.admin.settings.email.write'), limiter(10), async (req, res) => {
    const body = await userEmailSchema.validateAsync(req.body);
    const params = await getUserByUUIDSchema.validateAsync(req.params);

    await updateUserEmailByUUID(params.uuid, body.email);
    return res.json({ message: 'Email updated successfully' });
});

router.put('/user/:uuid/username', verifyRequest('app.admin.settings.username.write'), limiter(10), async (req, res) => {
    const body = await userUsernameSchema.validateAsync(req.body);
    const params = await getUserByUUIDSchema.validateAsync(req.params);

    await updateUserUserNameByUUID(params.uuid, body.username);
    return res.json({ message: 'Username updated successfully' });
});

router.put('/user/:uuid/addbalance', verifyRequest('app.admin.users.balance.write'), limiter(1), async (req, res) => {
    const body = await updateUserBalanceSchema.validateAsync(req.body);
    const params = await getUserByUUIDSchema.validateAsync(req.params);

    await updateBalance(params.uuid, body.add, req.user.user_data.id);
    res.json({ success: true });
});

router.put('/user/:uuid/balance', verifyRequest('app.admin.settings.balance.write'), limiter(10), async (req, res) => {
    const body = await setUserBalanceSchema.validateAsync(req.body);
    const params = await getUserByUUIDSchema.validateAsync(req.params);

    await setBalance(params.uuid, body.balance, req.user.user_data.id)
    return res.json({ message: 'Balance updated successfully' });
});

router.put('/user/:uuid/language', verifyRequest('app.admin.settings.language.write'), limiter(10), async (req, res) => {
    const body = await userLanguageSchema.validateAsync(req.body);
    const params = await getUserByUUIDSchema.validateAsync(req.params);

    await updateUserLanguageByUUID(params.uuid, body.language);
    return res.json({ message: 'Language updated successfully' });
});

router.put('/user/:uuid/userGroup', verifyRequest('app.admin.users.usergroup.write'), limiter(10), async (req, res) => {
    const body = await userGroupCheck.validateAsync(req.body);
    const params = await getUserByUUIDSchema.validateAsync(req.params);

    await updateUserGroupByUUID(params.uuid, body.userGroup);
    return res.json({ message: 'User group updated successfully' });
});

router.delete('/user/:uuid', verifyRequest('app.admin.users.write'), limiter(10), async (req, res) => {
    const params = await getUserByUUIDSchema.validateAsync(req.params);

    const result = softDeleteUserByUUID(params.uuid);
    if (!result.deleted) {
        return res.status(404).json({ error: 'User not found' });
    }

    await sendNotification(
        result.user.id,
        0,
        NOTIFICATION_TYPES.DELETE_ACCOUNT,
        null,
        result.user
    );
    result.sessionTokens.forEach((token) => removeWebtoken(token));
    return res.json({ message: 'User deleted successfully' });
});

router.get('/users', verifyRequest('app.admin.overview.read'), limiter(1), async (req, res) => {
    const query = await getUserDataTableSchema.validateAsync(req.query);
    const limit = query.limit || req.pagination.pageSize;

    const users = await getUsers(query.search, query.sort, query.dir, query.page, limit);
    const totalUsers = await countUsers(query.search);

    const result = {
        data: users,
        pagination: {
            totalPages: Math.ceil(totalUsers / limit),
            totalItems: totalUsers
        }
    }
    res.json(result);
});

router.get('/message/recipients', verifyRequest('app.admin.messages.read'), limiter(1), async (req, res) => {
    const users = getMessageRecipientUsers();
    const groupCounts = users.reduce((counts, user) => {
        counts[user.user_role] = (counts[user.user_role] || 0) + 1;
        return counts;
    }, {});

    return res.json({
        messagingSystems: [NOTIFICATION_CHANNELS.EMAIL],
        all: {
            type: 'all',
            value: 'all',
            label: 'All users',
            count: users.length,
        },
        groups: Object.keys(process.permissions_config.groups).map((group) => ({
            type: 'group',
            value: group,
            label: group,
            count: groupCounts[group] || 0,
        })),
        users: users.map((user) => ({
            type: 'user',
            value: user.uuid,
            label: user.name,
            username: user.username,
            email: user.email,
            group: user.user_role,
            count: 1,
        })),
    });
});

router.post('/message/send', verifyRequest('app.admin.messages.write'), limiter(1), async (req, res) => {
    const body = await messageSendSchema.validateAsync(req.body);
    const recipients = getMessageRecipientSelection(body.target);

    if (recipients.length === 0) {
        return res.status(400).json({ error: 'No recipients selected' });
    }

    const tasks = [];
    for (const recipient of recipients) {
        tasks.push(await sendNotification(recipient.id, 0, NOTIFICATION_TYPES.ADMIN_MESSAGE, body.message, recipient));
    }

    return res.json({
        success: true,
        recipients: recipients.length,
        messagingSystems: [NOTIFICATION_CHANNELS.EMAIL],
        queued: tasks.filter((task) => task.email).length,
    });
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};

