// const { limiter } = require('@middleware/limiter');
const { findUserByUsername } = require('@lib/sqlite/users');
const { PermissionsError, InvalidLogin } = require('@lib/errors');
const { mergePermissions, checkPermission } = require('@lib/permissions');
const { addWebtoken } = require('@lib/cache');
const { verifyRequest } = require('@middleware/verifyRequest');
const Joi = require('@lib/sanitizer');
const useragent = require('express-useragent');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const HyperExpress = require('hyper-express');
const router = new HyperExpress.Router();


/* Plugin info*/
const PluginName = 'Auth'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const loginSchema = Joi.object({
    username: Joi.string().min(3).max(30).required(),
    password: Joi.string().min(8).max(56).required(),
});

router.post('/login', async (req, res) => {
    const body = await loginSchema.validateAsync(await req.json());

    const user = await findUserByUsername(body.username);
    if (!user) {
        throw new InvalidLogin('Unknown or invalid username and password');
    }

    const isValidPassword = await bcrypt.compare(body.password, user.password_hash);
    if (!isValidPassword) {
        throw new InvalidLogin('Invalid username or password');
    }

    const Formated_Permissions = mergePermissions([], user.user_role); // Format the permissions to a array

    const allowed = checkPermission(Formated_Permissions, 'app.web.login'); // Check if user has permissions to login
    if (!allowed.result) throw new PermissionsError('NoPermissions', 'app.web.login');

    const newtoken = crypto.randomUUID(); // Generate a new token
    const source = req.headers['user-agent']
    const UserAgent = useragent.parse(source)

    delete user.password_hash; // Remove the password hash from the user object
    addWebtoken(newtoken, user, Formated_Permissions, UserAgent.browser); // Add the token to the cache and SQLite

    return res.json({ token: newtoken, uuid: user.uuid, name: user.name, email: user.email, username: user.username, permissions: Formated_Permissions, language: user.language });
});

router.post('/check', verifyRequest('app.web.login'), async (req, res) => {
    return res.json({ token: req.authorization, uuid: req.user.user_data.uuid, name: req.user.user_data.name, email: req.user.user_data.email, username: req.user.user_data.username, permissions: req.user.user_data.permissions, language: req.user.user_data.language });
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};