// const { limiter } = require('@middleware/limiter');
const { findUserByEmail } = require('@lib/sqlite/users');
const { PermissionsError, InvalidLogin } = require('@lib/errors');
const { mergePermissions, checkPermission } = require('@lib/permissions');
const { addWebtoken } = require('@lib/cache');
const { verifyRequest } = require('@middleware/verifyRequest');
const Joi = require('@lib/sanitizer');
const { isEBGOAuthEnabled } = require('@lib/oauth');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const express = require('ultimate-express');
const router = new express.Router();


/* Plugin info*/
const PluginName = 'Auth'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(56).required(),
});

router.post('/login', async (req, res) => {
    if (isEBGOAuthEnabled()) {
        return res.status(403).json({ message: 'OAuth login is enabled' });
    }

    const body = await loginSchema.validateAsync(req.body);

    const user = await findUserByEmail(body.email);
    if (!user) {
        throw new InvalidLogin('Unknown or invalid email and password');
    }

    const isValidPassword = await bcrypt.compare(body.password, user.password_hash);
    if (!isValidPassword) {
        throw new InvalidLogin('Invalid email or password');
    }

    const Formated_Permissions = mergePermissions([], user.user_role); // Format the permissions to a array

    const allowed = checkPermission(Formated_Permissions, 'app.web.login'); // Check if user has permissions to login
    if (!allowed.result) throw new PermissionsError('NoPermissions', 'app.web.login');

    const newtoken = crypto.randomUUID(); // Generate a new token

    delete user.password_hash; // Remove the password hash from the user object
    addWebtoken(newtoken, user, Formated_Permissions, req.useragent?.browser || "unknown", req.ip); // Add the token to the cache and SQLite

    return res.json({ token: newtoken, uuid: user.uuid, name: user.name, email: user.email, username: user.username, permissions: Formated_Permissions, language: user.language });
});

router.post('/check', verifyRequest('app.web.login'), async (req, res) => {
    return res.json({ token: req.authorization,
        uuid: req.user.user_data.uuid,
        name: req.user.user_data.name,
        email: req.user.user_data.email,
        username: req.user.user_data.username,
        permissions: req.user.permissions,
        language: req.user.user_data.language });
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};
