const express = require('ultimate-express');
const cookieParser = require('cookie-parser');
const { expressCspHeader, INLINE, NONE, SELF } = require('express-csp-header');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { ViewRenderer } = require('@lib/template');
const errorHandler = require('@middleware/errorhandler');
const { getDBMigration } = require('@lib/sqlite/utils')
const { execSync } = require('child_process');
const { dbVersion } = require('@config/application');
const { getManifest } = require('@lib/manifest');
const { countUsers } = require('@lib/sqlite/users');
const { backfillStatistics } = require('@lib/sqlite/stats');
const { getStaticFilePath } = require('@lib/imageStore');
const { loadFeatureDefinitions, getFeaturePublicFilePath } = require('@lib/features');
const { ensureFeatureSettings } = require('@lib/sqlite/settings');
const { isEBGOAuthEnabled } = require('@lib/oauth');

let options = {};

// Enable HTTPS if cert and key files are present in the root directory
if (fs.existsSync(path.join(__dirname, '..', 'cert.pem')) && fs.existsSync(path.join(__dirname, '..', 'key.pem'))) {
    options = {
        key_file_name: path.join(process.cwd(), 'key.pem'),
        cert_file_name: path.join(process.cwd(), 'cert.pem'),
    };
}

const app = express({
    uwsOptions: options
});
app.set('catch async errors', true);

app.use(express.json({ limit: '50mb' }));
app.use(express.text({ type: 'text/plain', limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
    if (typeof req.body === 'string' && req.body.trim().match(/^[{\[]/)) {
        req.body = JSON.parse(req.body);
    }
    req.json = async () => req.body;
    next();
});

let defaultRoute = '/overview';
const dbMigration = getDBMigration();
if (dbMigration === 0) {
    process.log.system(`No Database found. Entering setup mode`)
    try {
        process.log.system('Running database migration script...');
        execSync('node migrate.js setup', { stdio: 'inherit' });
        process.log.system('Database migration completed successfully.');
    } catch (error) {
        process.log.error('Failed to run database migration script:');
        console.error(error);
        process.exit(1);
    }
    defaultRoute = isEBGOAuthEnabled() ? '/login' : '/setup';
} else {
    try {
        if (dbMigration < dbVersion) {
            process.log.system(`Database migration required. Current version: ${dbMigration}, Required version: ${dbVersion}`);
        } else {
            process.log.system('Checking database migrations and seed data...');
        }
        execSync('node migrate.js setup', { stdio: 'inherit' });
        process.log.system('Database migration completed successfully.');
    } catch (error) {
        process.log.error('Failed to run database migration script:');
        console.error(error);
        process.exit(1);
    }
}

ensureFeatureSettings(loadFeatureDefinitions());
backfillStatistics(); // Backfill statistics data

// Redirect root to setup
app.get('/', async (req, res) => {
    // Reset to overview when a user was created
    if (defaultRoute === '/setup' || defaultRoute === '/login') {
        const currentUserCount = await countUsers();
        if (currentUserCount > 0) {
            defaultRoute = '/overview';
        }
    }
    res.redirect(defaultRoute);
});

// Needs to be moved and implemented into template rendering to remove the inline and use nonce or hash
app.use(expressCspHeader({
    directives: {
        'default-src': [SELF],
        'script-src': [SELF, INLINE],
        'style-src': [SELF, INLINE, "https://rsms.me/inter/inter.css"],
        'font-src': [SELF, "https://rsms.me/inter/font-files/"],
        'img-src': [
            SELF,
            INLINE,
            "data:",
            "blob:"
        ],
        'worker-src': [SELF],
        'connect-src': [
            SELF,
            `ws://${process.env.WebSocketURL}`,
            `wss://${process.env.WebSocketURL}`
        ],
        'block-all-mixed-content': true
    }
}));

const renderer = new ViewRenderer(app, path.join(__dirname, '..', 'views'));

// Register the static routes and overwrite some filename paths internaly
renderer.registerStaticRoutes(path.join(__dirname, '..', 'views'), ["error-xxx.ejs", "navbar.ejs", "footer.ejs", "manifest.ejs"], {});

// Register the dynamic routes
renderer.registerDynamicRoutes();

const apiv1 = require('@api');
const images_handler = require('@static_api/images');
const auth_handler = require('@static_api/auth');

app.use('/api/v1', apiv1);
app.use('/i', images_handler);
app.use('/auth', auth_handler);

app.get('/manifest.json', async (req, res) => {
    res.header('Content-Type', 'application/json');
    const manifest = await getManifest();
    res.json(manifest);
});

app.get('/features/*', (req, res) => {
    const rawFeaturePath = decodeURIComponent(req.url.split('?')[0].replace(/^\/features\//, ''));
    const [featureName, ...fileParts] = rawFeaturePath.split('/').filter(Boolean);
    const relativeFilePath = fileParts.join('/');

    if (!featureName || !relativeFilePath) {
        res.status(404);
        return res.json({ message: "Page not found", info: "Request can not be served", reason: "The requested feature file was not found" });
    }

    try {
        const filePath = getFeaturePublicFilePath(featureName, relativeFilePath);
        if (!filePath) throw new Error(`Feature public file not found - ${rawFeaturePath}`);

        switch (filePath.split('.').pop()) {
            case 'js':
                res.header('Content-Type', 'text/javascript');
                break;
            case 'css':
                res.header('Content-Type', 'text/css');
                break;
            case 'png':
                res.header('Content-Type', 'image/png');
                break;
            case 'jpg':
            case 'jpeg':
                res.header('Content-Type', 'image/jpg');
                break;
            case 'svg':
                res.header('Content-Type', 'image/svg+xml');
                break;
            case 'json':
                res.header('Content-Type', 'application/json');
                break;
            default:
                res.header('Content-Type', 'text/plain');
                break;
        }

        res.header('Cache-Control', 'public, max-age=172800');
        res.send(fs.readFileSync(filePath));
    } catch (error) {
        process.log.error(error);
        res.status(404);
        return res.json({ message: "Page not found", info: "Request can not be served", reason: "The requested feature file was not found" });
    }
});

const manifestIconTypes = {
    'icon-192.png': 'image/png',
    'icon-512.png': 'image/png'
};

const sendStaticStorageFile = (res, relativePath, contentType) => {
    const filePath = getStaticFilePath(relativePath, { fallbackToPublic: true });
    res.header('Content-Type', contentType);
    res.header('Cache-Control', 'public, max-age=172800');
    res.send(fs.readFileSync(filePath));
};

app.get('/favicon.ico', (req, res) => {
    sendStaticStorageFile(res, 'favicon.ico', 'image/x-icon');
});

app.get('/icons/:filename', (req, res) => {
    const contentType = manifestIconTypes[req.params.filename];
    if (!contentType) {
        res.status(404);
        return res.json({ message: "Page not found", info: "Request can not be served", reason: "The requested icon was not found" });
    }

    sendStaticStorageFile(res, path.join('icons', req.params.filename), contentType);
});

app.get('/*', (req, res) => {
    // Split the URL to separate the path and query string
    const rawUrl = req.url.split('?')[0];
    const filePath = decodeURIComponent(rawUrl);

    // Determine the content type based on the file extension
    switch (filePath.split('.').pop()) {
        case 'js':
            res.header('Content-Type', 'text/javascript');
            break;
        case 'css':
            res.header('Content-Type', 'text/css');
            break;
        case 'png':
            res.header('Content-Type', 'image/png');
            break;
        case 'jpg':
            res.header('Content-Type', 'image/jpg');
            break;
        case 'svg':
            res.header('Content-Type', 'image/svg+xml');
            break;
        case 'ico':
            res.header('Content-Type', 'image/x-icon');
            break;
        case 'html':
            res.header('Content-Type', 'text/html');
            break;
        case 'json':
            res.header('Content-Type', 'application/json');
            break;
        default:
            res.header('Content-Type', 'text/plain');
            break;
    }

    try {
        // Read the file from the filesystem without the query string
        // Add cache poloicy to cache 48h
        res.header('Cache-Control', 'public, max-age=172800');

        const publicDir = path.join(__dirname, '..', 'public');
        const resolvedPath = path.normalize(path.join(publicDir, filePath));

        if (!resolvedPath.startsWith(publicDir)) throw new Error(`Access denied: path traversal attempt - ${filePath}`);

        let file_to_send = null;
        if (fs.existsSync(resolvedPath)) {
            file_to_send = resolvedPath;
        } else {
            throw new Error(`File not found - ${filePath}`);
        }
        res.send(fs.readFileSync(file_to_send));
    } catch (error) {
        process.log.error(error)
        res.status(404);
        if (req.accepts('html')) {
            ejs.renderFile(path.join(__dirname, '..', 'views', 'error', 'error-xxx.ejs'), { statusCode: 404, message: "Page not found", info: "Request can not be served", reason: "The requested page was not found", domain: process.env.DOMAIN, back_url: process.env.DOMAIN, curentUnixTime: new Date().getTime() }, (err, str) => {
                if (err) throw err;
                res.header('Content-Type', 'text/html');
                res.send(str);
            });
        } else {
            res.header('Content-Type', 'application/json');
            res.json({ message: "Page not found", info: "Request can not be served", reason: "The requested page was not found" });

        }
    };
});

// Catch all POST requests (404)
app.post('/*', (req, res) => {
    res.status(404);
    res.header('Content-Type', 'application/json');
    res.json({ message: "Route not Found", info: "Request can not be served", reason: "The requested route was not found" });
});

app.use(errorHandler);

module.exports = app;
