const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const { countUsers, createUser, createAdminUser, getUser, getUserPassword, updateUserEmail, updateUserLanguage, updateUserName, updateUserPassword, updateUserUserName } = require('@lib/sqlite/users');
const Joi = require('@lib/sanitizer');
const bcrypt = require('bcrypt');
const HyperExpress = require('hyper-express');
const router = new HyperExpress.Router();


/* Plugin info*/
const PluginName = 'Users'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const userSchema = Joi.object({
    name: Joi.fullysanitizedString().min(1).max(100).required(),
    email: Joi.string().email().required(),
    username: Joi.fullysanitizedString().min(3).max(30).required(),
    password: Joi.string().min(8).max(56).required(),
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

const userPasswordSchema = Joi.object({
    currentPassword: Joi.string().min(8).max(56).required(),
    newPassword: Joi.string().min(8).max(56).required()
});

const userLanguageSchema = Joi.object({
    language: Joi.fullysanitizedString().min(2).max(2).required()
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
    const body = await userSchema.validateAsync(await req.json());
    const usercount = await countUsers();
    if (usercount > 0) {
        return res.status(409).json({ error: 'Not available' });
    }

    const password_hash = await bcrypt.hash(body.password, parseInt(process.env.SALTROUNDS));
    try {
        await createAdminUser(body.name, body.email, body.username, password_hash);
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
    const body = await userSchema.validateAsync(await req.json());

    const password_hash = await bcrypt.hash(body.password, parseInt(process.env.SALTROUNDS));
        await createUser(body.name, body.email, body.username, password_hash);
        return res.status(201).json({ message: 'User created successfully' });
});

router.get('/', verifyRequest('web.user.read'), limiter(1), async (req, res) => {
    const user_data = await getUser(req.user.user_data.id)
    return res.json(user_data)
});

router.put('/name', verifyRequest('app.user.settings.name.write'), limiter(10), async (req, res) => {
    const body = await userNameSchema.validateAsync(await req.json());
    const user_id = req.user.user_data.id;

    await updateUserName(user_id, body.name);
    return res.json({ message: 'Name updated successfully' });
});

router.put('/email', verifyRequest('app.user.settings.email.write'), limiter(10), async (req, res) => {
    const body = await userEmailSchema.validateAsync(await req.json());
    const user_id = req.user.user_data.id;

    await updateUserEmail(user_id, body.email);
    return res.json({ message: 'Email updated successfully' });
});

router.put('/username', verifyRequest('app.user.settings.username.write'), limiter(10), async (req, res) => {
    const body = await userUsernameSchema.validateAsync(await req.json());
    const user_id = req.user.user_data.id;

    await updateUserUserName(user_id, body.username);
    return res.json({ message: 'Username updated successfully' });
});

router.put('/password', verifyRequest('app.user.settings.password.write'), limiter(10), async (req, res) => {
    const body = await userPasswordSchema.validateAsync(await req.json());
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
    const body = await userLanguageSchema.validateAsync(await req.json());
    const user_id = req.user.user_data.id;

    await updateUserLanguage(user_id, body.language);
    return res.json({ message: 'Language updated successfully' });
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};

