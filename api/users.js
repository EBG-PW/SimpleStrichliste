const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const { removeWebtoken, removeWebtokenFromCache } = require('@lib/cache');
const { countUsers, createUser, createAdminUser, getUser, getUserPassword, updateUserEmail, updateUserLanguage, updateUserName, updateUserPageSize, updateUserPassword, updateUserUserName } = require('@lib/sqlite/users');
const { getUserNotifications, setUserNotificationState } = require('@lib/sqlite/userNotifications');
const { getAllUserSessions, deleteAllWebtokensForUser } = require('@lib/sqlite/webtokens');
const { checkIfSettingTrue, getSetting } = require('@lib/sqlite/settings');
const { getRuntimeFeatureRegistrationHooks } = require('@lib/features');
const { isEBGOAuthEnabled } = require('@lib/oauth');
const {
    NOTIFICATION_TYPES,
    NOTIFICATION_CHANNELS,
    getNewsletterNotifications,
    canSetNotificationPreference,
    sendNotification,
} = require('@lib/notifications');
const Joi = require('@lib/sanitizer');
const bcrypt = require('bcrypt');
const express = require('ultimate-express');
const router = new express.Router();


/* Plugin info*/
const PluginName = 'Users'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const userSchema = Joi.object({
    reg_code: Joi.fullysanitizedString().allow('').min(32).max(32),
    name: Joi.fullysanitizedString().min(1).max(100).required(),
    email: Joi.string().email().required(),
    username: Joi.fullysanitizedString().min(3).max(30).required(),
    password: Joi.string().min(8).max(56).required(),
});

const registrationUserSchema = userSchema.keys({
    features: Joi.object().unknown(true).default({}),
});

const validateRegistrationFeaturePayloads = async (body) => {
    const results = [];
    for (const descriptor of getRuntimeFeatureRegistrationHooks()) {
        const hook = require(descriptor.filePath);
        if (typeof hook.validateRegistration !== 'function') continue;
        const payload = body.features?.[descriptor.payloadKey];
        results.push({
            descriptor,
            hook,
            data: await hook.validateRegistration(payload, { Joi, body }),
        });
    }
    return results;
};

const runRegistrationFeatureHooks = async (userId, body, featureResults) => {
    for (const featureResult of featureResults) {
        if (typeof featureResult.hook.afterUserCreated !== 'function') continue;
        await featureResult.hook.afterUserCreated({
            userId,
            body,
            data: featureResult.data,
            sendNotification,
            NOTIFICATION_TYPES,
        });
    }
};

const userNameSchema = Joi.object({
    name: Joi.fullysanitizedString().min(1).max(100).required(),
});

const userEmailSchema = Joi.object({
    email: Joi.string().email().required(),
});

const userUsernameSchema = Joi.object({
    username: Joi.fullysanitizedString().min(3).max(30).required(),
});

const userPasswordSchema = Joi.object({
    currentPassword: Joi.string().min(8).max(56).required(),
    newPassword: Joi.string().min(8).max(56).required()
});

const userLanguageSchema = Joi.object({
    language: Joi.fullysanitizedString().min(2).max(2).required()
});

const userPageSizeSchema = Joi.object({
    pageSize: Joi.number().integer().valid(5, 10, 20, 50).required()
});

const notificationStateSchema = Joi.object({
    enabled: Joi.boolean().required()
});

const notificationParamsSchema = Joi.object({
    key: Joi.fullysanitizedString().pattern(/^[a-z0-9_-]+$/).min(1).max(64).required(),
    type: Joi.fullysanitizedString().valid(...Object.values(NOTIFICATION_CHANNELS)).required()
});

const validateUUID = Joi.object({
    uuid: Joi.string().uuid().required()
});

/**
 * Returns true if DB has more than 1 user
 */
router.get('/hasUsers', limiter(10), async (req, res) => {
    const usercount = await countUsers();
    if (usercount > 0) {
        return res.json({ hasUsers: true });
    }
    return res.json({ hasUsers: false });
});

/**
 * Generate a new Admin User, is only avaible on a empty DB
 */
router.post('/admin', limiter(20), async (req, res) => {
    // Disable normal registration if OAuth is enabled
    if (isEBGOAuthEnabled()) {
        return res.status(403).json({ error: 'OAuth registration is enabled' });
    }

    const usercount = await countUsers();
    if (usercount > 0) {
        return res.status(409).json({ error: 'Not available' });
    }

    const body = await registrationUserSchema.validateAsync(req.body);
    const featureResults = await validateRegistrationFeaturePayloads(body);

    const password_hash = await bcrypt.hash(body.password, parseInt(process.env.SALTROUNDS));
    try {
        const userId = await createAdminUser(body.name, body.email, body.username, password_hash);
        await sendNotification(userId, 0, NOTIFICATION_TYPES.REG_MAIL);
        await runRegistrationFeatureHooks(userId, body, featureResults);
        return res.status(201).json({ message: 'Admin user created successfully' });
    } catch (error) {
        console.error('Error creating user:', error);
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ error: 'Username or email already exists' });
        }
        throw error;
    }
});

/**
 * Create a normal user
 */
router.post('/', limiter(20), async (req, res) => {
    // Disable normal registration if OAuth is enabled
    if (isEBGOAuthEnabled()) {
        return res.status(403).json({ error: 'OAuth registration is enabled' });
    }

    // Do not allow registration if admin did not setup the application yet, forward to /setup
    const usercount = await countUsers();
    if (usercount < 1) {
        return res.status(405).json({ error: 'Application not setup' });
    }

    const body = await registrationUserSchema.validateAsync(req.body);
    const featureResults = await validateRegistrationFeaturePayloads(body);

    if (await checkIfSettingTrue('REG_CODE_ACTIVE')) {
        const regCode = await getSetting('REG_CODE');
        if (body.reg_code !== regCode) {
            return res.status(403).json({ error: 'Invalid registration code' });
        }
    }

    const password_hash = await bcrypt.hash(body.password, parseInt(process.env.SALTROUNDS));
    const userId = await createUser(body.name, body.email, body.username, password_hash);
    await sendNotification(userId, 0, NOTIFICATION_TYPES.REG_MAIL);
    await runRegistrationFeatureHooks(userId, body, featureResults);
    return res.status(201).json({ message: 'User created successfully' });
});

router.get('/', verifyRequest('web.user.read'), limiter(1), async (req, res) => {
    const user_data = await getUser(req.user.user_data.id);
    const preferences = getUserNotifications(req.user.user_data.id);
    user_data.notifications = preferences;
    user_data.notificationSettings = getNewsletterNotifications().map((definition) => ({
        ...definition,
        enabled: preferences.find((preference) =>
            preference.key === definition.key && preference.type === definition.channel
        )?.state !== false,
    }));
    return res.json(user_data)
});

router.put('/name', verifyRequest('app.user.settings.name.write'), limiter(10), async (req, res) => {
    const body = await userNameSchema.validateAsync(req.body);
    const user_id = req.user.user_data.id;

    await updateUserName(user_id, body.name);
    return res.json({ message: 'Name updated successfully' });
});

router.put('/email', verifyRequest('app.user.settings.email.write'), limiter(10), async (req, res) => {
    const body = await userEmailSchema.validateAsync(req.body);
    const user_id = req.user.user_data.id;

    await updateUserEmail(user_id, body.email);
    return res.json({ message: 'Email updated successfully' });
});

router.put('/username', verifyRequest('app.user.settings.username.write'), limiter(10), async (req, res) => {
    const body = await userUsernameSchema.validateAsync(req.body);
    const user_id = req.user.user_data.id;

    await updateUserUserName(user_id, body.username);
    return res.json({ message: 'Username updated successfully' });
});

router.put('/password', verifyRequest('app.user.settings.password.write'), limiter(10), async (req, res) => {
    const body = await userPasswordSchema.validateAsync(req.body);
    const user_id = req.user.user_data.id;

    const currentPasswordHash = await getUserPassword(user_id);
    const isMatch = await bcrypt.compare(body.currentPassword, currentPasswordHash.password_hash);
    if (!isMatch) {
        return res.status(401).json({ message: 'CurrentPasswordIsIncorrect' });
    }

    const password_hash = await bcrypt.hash(body.newPassword, parseInt(process.env.SALTROUNDS));
    await updateUserPassword(user_id, password_hash);
    return res.json({ message: 'PasswordUpdatedSuccessfully' });
});

router.put('/language', verifyRequest('app.user.settings.language.write'), limiter(10), async (req, res) => {
    const body = await userLanguageSchema.validateAsync(req.body);
    const user_id = req.user.user_data.id;

    await updateUserLanguage(user_id, body.language);
    removeWebtokenFromCache(req.authorization);
    return res.json({ message: 'Language updated successfully' });
});

router.put('/pageSize', verifyRequest('app.user.settings.pageSize.write'), limiter(10), async (req, res) => {
    const body = await userPageSizeSchema.validateAsync(req.body);
    const user_id = req.user.user_data.id;

    await updateUserPageSize(user_id, body.pageSize);
    removeWebtokenFromCache(req.authorization);
    return res.json({ message: 'Page size updated successfully' });
});

router.put('/notifications/:key/:type', verifyRequest('app.user.settings.email.write'), limiter(10), async (req, res) => {
    const params = await notificationParamsSchema.validateAsync(req.params);
    const body = await notificationStateSchema.validateAsync(req.body);
    if (!canSetNotificationPreference(params.key, params.type)) {
        return res.status(404).json({ error: 'Notification preference not found' });
    }
    setUserNotificationState(req.user.user_data.id, params.key, params.type, body.enabled);
    return res.json({ message: 'Notification preference updated successfully' });
});

router.get('/sessions', verifyRequest('web.user.sessions.read'), limiter(2), async (req, res) => {
    const sql_response = getAllUserSessions(req.user.user_data.id, req.authorization);

    res.status(200);
    res.json(sql_response);
});

router.delete('/sessions/:uuid', verifyRequest('web.user.sessions.write'), limiter(10), async (req, res) => {
    const params = await validateUUID.validateAsync(req.params);
    removeWebtoken(params.uuid);

    res.status(200);
    res.json({
        message: 'Session deleted',
    });
});

router.delete('/allothersessions', verifyRequest('web.user.sessions.write'), limiter(10), async (req, res) => {
    deleteAllWebtokensForUser(req.user.user_data.id, req.authorization);

    res.status(200);
    res.json({
        message: 'All other sessions deleted',
    });
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};

