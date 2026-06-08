const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const express = require('ultimate-express');
const useragent = require('express-useragent');

const { addWebtoken } = require('@lib/cache');
const { OAuthError, PermissionsError } = require('@lib/errors');
const { checkPermission, mergePermissions } = require('@lib/permissions');
const { countUsers, createAdminUser, createUser, findUserByEmail } = require('@lib/sqlite/users');
const { getEBGOAuthConfig, isEBGOAuthEnabled } = require('@lib/oauth');
const Joi = require('@lib/sanitizer');

const router = new express.Router();

/**
 * Validates that the local OAuth start endpoint receives no user-controlled query data.
 */
const oauthStartQuerySchema = Joi.object({}).unknown(false);

/**
 * Validates the expected query parameters from the OAuth provider callback, rejecting any unexpected data.
 */
const oauthCallbackQuerySchema = Joi.object({
    code: Joi.string().alphanum().length(128).required(),
}).unknown(false);

/**
 * Parses a provider response that may be JSON or urlencoded form data.
 * @param {Response} response OAuth provider fetch response.
 * @returns {Promise<Object>} Parsed response body.
 */
const parseTokenResponse = async (response) => {
    const body = await response.text();
    try {
        return JSON.parse(body);
    } catch {
        return Object.fromEntries(new URLSearchParams(body));
    }
};

/**
 * Exchanges an OAuth authorization code for provider tokens.
 * @param {String} code Authorization code returned by EBG.
 * @returns {Promise<Object>} Token response, expected to include access_token.
 * @throws {OAuthError} If the provider rejects the exchange.
 */
const fetchToken = async (code) => {
    const config = getEBGOAuthConfig();
    const body = JSON.stringify({
        code,
    });

    const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.clientSecret || ''}`,
        },
        body,
    });

    const tokenData = await parseTokenResponse(response);
    if (!response.ok) {
        process.log?.warn?.(`[OAUTH] Token exchange failed (${response.status}) at ${config.tokenUrl}: ${JSON.stringify(tokenData)}`);
        throw new OAuthError('OAuth token exchange failed').withStatus(response.status === 400 ? 401 : response.status);
    }
    return tokenData;
};

/**
 * Resolves OAuth user data from either embedded token data or the provider user endpoint.
 * @param {Object} tokenData Token response or direct callback profile data.
 * @returns {Promise<Object>} OAuth provider user profile.
 * @throws {OAuthError} If no access token is available or the user lookup fails.
 */
const fetchOAuthUser = async (tokenData) => {
    const embeddedUser = tokenData.user || tokenData.profile || tokenData.account || tokenData.data;
    if (embeddedUser && typeof embeddedUser === 'object') return embeddedUser;
    if (tokenData.email || tokenData.mail) return tokenData;

    const accessToken = tokenData.access_token || tokenData.accessToken || tokenData.token;
    if (!accessToken) throw new OAuthError('OAuth access token missing');

    const config = getEBGOAuthConfig();
    const userInfoUrl = new URL(config.userInfoUrl);
    userInfoUrl.searchParams.set('access_token', accessToken);

    const response = await fetch(userInfoUrl, {
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.clientSecret || ''}`,
        },
    });

    if (!response.ok) throw new OAuthError('OAuth user lookup failed');
    return response.json();
};

/**
 * Converts arbitrary provider text into a DB-safe username.
 * @param {String} value Raw username-like value.
 * @returns {String} Sanitized username between 3 and 30 chars.
 */
const cleanUsername = (value) => {
    const username = String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 30);

    return username.length >= 3 ? username : `user_${crypto.randomUUID().slice(0, 8)}`;
};

/**
 * Builds a deterministic local username from a unique email address.
 * The local username is only used to satisfy the existing users.username column.
 * @param {String} email Unique email address from the OAuth provider.
 * @returns {String} DB-safe username derived from the email local part and domain.
 */
const getUsernameFromEmail = (email) => {
    const [localPart, domainPart = ''] = String(email).split('@');
    const compactDomain = domainPart.replace(/\.[^.]+$/, '');
    return cleanUsername(`${localPart}_${compactDomain}`);
};

/**
 * Normalizes provider-specific user profile fields into the local user shape.
 * @param {Object} oauthUser Raw OAuth provider user profile.
 * @returns {{email: String, username: String, name: String}} Local user identity fields.
 * @throws {OAuthError} If the provider does not provide an email address.
 */
const normalizeOAuthUser = (oauthUser) => {
    const email = oauthUser.email || oauthUser.mail || oauthUser.user_email;
    if (!email) throw new OAuthError('OAuth user email missing');

    const username = getUsernameFromEmail(email);

    return {
        email,
        username,
        name: oauthUser.name || oauthUser.realname || oauthUser.display_name || oauthUser.full_name || oauthUser.user_realname || username,
    };
};

/**
 * Finds an existing local user by OAuth email or creates one.
 * The first OAuth-created user becomes admin, matching the empty-DB registration behavior.
 * @param {Object} oauthUser Raw OAuth provider user profile.
 * @returns {Promise<Object>} Local user row with password_hash still present for deletion before session storage.
 * @throws {OAuthError} If user creation fails.
 */
const findOrCreateOAuthUser = async (oauthUser) => {
    const normalizedUser = normalizeOAuthUser(oauthUser);
    const existingUser = await findUserByEmail(normalizedUser.email);
    if (existingUser) return existingUser;

    const firstUser = await countUsers() === 0;
    const passwordHash = await bcrypt.hash(crypto.randomUUID(), parseInt(process.env.SALTROUNDS, 10));

    if (firstUser) {
        await createAdminUser(
            normalizedUser.name,
            normalizedUser.email,
            normalizedUser.username,
            passwordHash,
        );
    } else {
        await createUser(
            normalizedUser.name,
            normalizedUser.email,
            normalizedUser.username,
            passwordHash,
        );
    }

    const createdUser = await findUserByEmail(normalizedUser.email);
    if (!createdUser) throw new OAuthError('OAuth user creation failed');
    return createdUser;
};

/**
 * Creates a local web session for an authenticated OAuth user.
 * @param {Object} req Express request, used for user-agent/browser tracking.
 * @param {Object} user Local user row.
 * @returns {Promise<{token: String, user: Object, permissions: String[]}>} Session payload for the browser.
 * @throws {PermissionsError} If the user is not allowed to log into the web app.
 */
const createSessionForUser = async (req, user) => {
    const permissions = mergePermissions([], user.user_role);
    const allowed = checkPermission(permissions, 'app.web.login');
    if (!allowed.result) throw new PermissionsError('NoPermissions', 'app.web.login');

    const token = crypto.randomUUID();
    const source = req.headers['user-agent'];
    const userAgent = useragent.parse(source);
    delete user.password_hash;
    await addWebtoken(token, user, permissions, userAgent.browser);

    return { token, user, permissions };
};

/**
 * Renders a minimal HTML bridge that writes the local session into localStorage.
 * @param {{token: String, user: Object, permissions: String[]}} session Session payload.
 * @returns {String} HTML document that redirects to the app overview.
 */
const renderOAuthCompletePage = (session) => {
    const payload = JSON.stringify({
        token: session.token,
        uuid: session.user.uuid,
        username: session.user.username,
        email: session.user.email,
        permissions: session.permissions,
        language: session.user.language,
    }).replace(/[<>&]/g, (char) => ({ '<': '\\u003c', '>': '\\u003e', '&': '\\u0026' }[char]));

    return `<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OAuth</title>
  </head>
  <body>
    <script>
      const session = ${payload};
      localStorage.setItem("token", session.token);
      localStorage.setItem("uuid", session.uuid);
      localStorage.setItem("username", session.username);
      localStorage.setItem("email", session.email);
      localStorage.setItem("permissions", JSON.stringify(session.permissions));
      localStorage.setItem("language", session.language);
      window.location.replace("/overview");
    </script>
  </body>
</html>`;
};

router.get('/oauth', async (req, res) => {
    if (!isEBGOAuthEnabled()) throw new OAuthError('OAuth is not enabled');
    await oauthStartQuerySchema.validateAsync(req.query || {});
    res.redirect(getEBGOAuthConfig().authorizeUrl);
});

router.get('/oauth/callback', async (req, res) => {
    const query = await oauthCallbackQuerySchema.validateAsync(req.query || {});

    if (!isEBGOAuthEnabled()) throw new OAuthError('OAuth is not enabled');
    if (query.error) throw new OAuthError(String(query.error));
    if (!query.code && !query.access_token && !query.token && !query.email && !query.mail) throw new OAuthError('OAuth callback code missing');

    const tokenData = query.access_token || query.token || query.email || query.mail
        ? query
        : await fetchToken(query.code);

    const oauthUser = await fetchOAuthUser(tokenData);
    const user = await findOrCreateOAuthUser(oauthUser);
    const session = await createSessionForUser(req, user);

    res.header('Content-Type', 'text/html');
    return res.send(renderOAuthCompletePage(session));
});

module.exports = router;
