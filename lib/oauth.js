const buildUrl = (baseUrl, route) => {
    return `${String(baseUrl || '').replace(/\/+$/, '')}${route}`;
};

const isEBGOAuthEnabled = () => {
    return Boolean(process.env.EBG_OAUTH_URL);
};

const getEBGOAuthAuthorizeUrl = (state = null) => {
    if (!isEBGOAuthEnabled()) return null;

    const authorizeUrl = new URL(buildUrl(process.env.EBG_OAUTH_URL, '/auth/oauth'));
    authorizeUrl.searchParams.set('client_id', process.env.EBG_OAUTH_CLIENT_ID || '');
    authorizeUrl.searchParams.set('scope', process.env.EBG_OAUTH_SCOPE || '');
    if (state) authorizeUrl.searchParams.set('state', state);
    return authorizeUrl.toString();
};

const getEBGOAuthConfig = () => {
    const baseUrl = String(process.env.EBG_OAUTH_URL || '').replace(/\/+$/, '');
    return {
        enabled: isEBGOAuthEnabled(),
        authorizeUrl: getEBGOAuthAuthorizeUrl(),
        tokenUrl: process.env.EBG_OAUTH_TOKEN_URL || buildUrl(baseUrl, '/oauth/authorize'),
        userInfoUrl: process.env.EBG_OAUTH_USERINFO_URL || buildUrl(baseUrl, '/oauth/user'),
        callbackUrl: process.env.EBG_OAUTH_REDIRECT_URI || buildUrl(process.env.DOMAIN, '/auth/oauth/callback'),
        clientId: process.env.EBG_OAUTH_CLIENT_ID,
        clientSecret: process.env.EBG_OAUTH_CLIENT_SECRET,
        scope: process.env.EBG_OAUTH_SCOPE,
    };
};

module.exports = {
    getEBGOAuthAuthorizeUrl,
    getEBGOAuthConfig,
    isEBGOAuthEnabled,
};
