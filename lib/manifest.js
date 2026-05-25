const { getSetting } = require('@lib/sqlite/settings.js');

let cachedManifest = null;

/**
 * Returns the PWA manifest, generating it if not cached
 * @returns {Object}
 */
const getManifest = async () => {
    if (cachedManifest) {
        return cachedManifest;
    } else {
        await generateManifest();
        return cachedManifest;
    }
};

/**
 * Generates the PWA manifest based on current settings and caches it in memory
 * @returns {void}
 * @throws {Error} If there is an error during manifest generation
 */
const generateManifest = async () => {
    const appName = await getSetting('APP_NAME') || 'Strichliste APP';
    const appShortName = await getSetting('APP_SHORT_NAME') || 'Strichliste';
    const appDescription = await getSetting('APP_DESCRIPTION') || 'A simple point of sale system for bars and restaurants.';
    const themeColor = await getSetting('APP_THEME_COLOR') || '#000000';
    const backgroundColor = await getSetting('APP_BACKGROUND_COLOR') || '#FFFFFF';

    const manifest = {
        name: appName,
        short_name: appShortName,
        description: appDescription,
        start_url: '/',
        display: 'standalone',
        theme_color: themeColor,
        background_color: backgroundColor,
        "icons": [
            {
                "src": "/favicon.ico",
                "sizes": "48x48",
                "type": "image/x-icon"
            },
            {
                "src": "/icons/icon-192.png",
                "type": "image/png",
                "sizes": "192x192"
            },
            {
                "src": "/icons/icon-512.png",
                "type": "image/png",
                "sizes": "512x512"
            }
        ]
    }

    cachedManifest = manifest;
};

module.exports = {
    getManifest,
    generateManifest
};
