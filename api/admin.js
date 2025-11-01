const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const { countUsers, getUserByUUID, getUsers, updateBalance, updateUserUserNameByUUID, updateUserNameByUUID, updateUserEmailByUUID, updateUserLanguageByUUID, updateUserGroupByUUID } = require('@lib/sqlite/users');
const { countCategories } = require('@lib/sqlite/categories');
const { countItems } = require('@lib/sqlite/items');
const package = require('../package.json');
const Joi = require('@lib/sanitizer');
const HyperExpress = require('hyper-express');
const router = new HyperExpress.Router();


/* Plugin info*/
const PluginName = 'Admin'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const getUserDataTableSchema = Joi.object({
  search: Joi.string().allow('').max(100).optional(),
  sort: Joi.string().valid('name', 'username', 'user_role', 'balance').default('name'),
  dir: Joi.string().valid('asc', 'desc').default('asc'),
  page: Joi.number().min(1).max(10000).default(1),
  limit: Joi.number().min(1).max(50).default(5)
});

const updateUserBalanceSchema = Joi.object({
    uuid: Joi.string().uuid().required(),
    add: Joi.number().min(-10000).max(10000).required()
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

/**
 * Returns an overview of the admin dashboard
 */
router.get('/overview', verifyRequest('app.admin.overview.read'), limiter(10), async (req, res) => {
    const usercount = await countUsers();
    const categoriescount = await countCategories();
    const itemscount = await countItems();
    const appversion = package.version;
    return res.json({ usercount, categoriescount, itemscount, appversion });
});

router.get('/user/:uuid', verifyRequest('app.admin.users.read'), limiter(1), async (req, res) => {
    const params = await getUserByUUIDSchema.validateAsync(req.params);

    const user = await getUserByUUID(params.uuid);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
});

router.put('/user/:uuid/name', verifyRequest('app.user.settings.name.write'), limiter(10), async (req, res) => {
    const body = await userNameSchema.validateAsync(await req.json());
    const params = await getUserByUUIDSchema.validateAsync(req.params);

    await updateUserNameByUUID(params.uuid, body.name);
    return res.json({ message: 'Name updated successfully' });
});

router.put('/user/:uuid/email', verifyRequest('app.user.settings.email.write'), limiter(10), async (req, res) => {
    const body = await userEmailSchema.validateAsync(await req.json());
    const params = await getUserByUUIDSchema.validateAsync(req.params);

    await updateUserEmailByUUID(params.uuid, body.email);
    return res.json({ message: 'Email updated successfully' });
});

router.put('/user/:uuid/username', verifyRequest('app.user.settings.username.write'), limiter(10), async (req, res) => {
    const body = await userUsernameSchema.validateAsync(await req.json());
    const params = await getUserByUUIDSchema.validateAsync(req.params);

    await updateUserUserNameByUUID(params.uuid, body.username);
    return res.json({ message: 'Username updated successfully' });
});

router.put('/user/:uuid/language', verifyRequest('app.user.settings.language.write'), limiter(10), async (req, res) => {
    const body = await userLanguageSchema.validateAsync(await req.json());
    const params = await getUserByUUIDSchema.validateAsync(req.params);

    await updateUserLanguageByUUID(params.uuid, body.language);
    return res.json({ message: 'Language updated successfully' });
});

router.put('/user/:uuid/userGroup', verifyRequest('app.admin.users.usergroup.write'), limiter(10), async (req, res) => {
    const body = await userGroupCheck.validateAsync(await req.json());
    const params = await getUserByUUIDSchema.validateAsync(req.params);

    await updateUserGroupByUUID(params.uuid, body.userGroup);
    return res.json({ message: 'User group updated successfully' });
});

router.get('/users', verifyRequest('app.admin.overview.read'), limiter(1), async (req, res) => {
    const query = await getUserDataTableSchema.validateAsync(req.query);

    const users = await getUsers(query.search, query.sort, query.dir, query.page, query.limit);
    const totalUsers = await countUsers(query.search);

    const result = {
        data: users,
        pagination: {
            totalPages: Math.ceil(totalUsers / query.limit),
            totalItems: totalUsers
        }
    }
    res.json(result);
});

router.post('/users/balance', verifyRequest('app.admin.users.balance.write'), limiter(1), async (req, res) => {
    const body = await updateUserBalanceSchema.validateAsync(await req.json());

    await updateBalance(body.uuid, body.add, req.user.user_data.id);

    res.json({ success: true });
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};

