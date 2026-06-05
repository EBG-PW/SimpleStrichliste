const crypto = require('node:crypto')
const fs = require('node:fs');
const path = require('node:path');
const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const { parseMultipart } = require('@middleware/parseMultipartForm');
const package = require('../package.json');
const multer = require('multer');
const { getDBSize, vacuumDB } = require('@lib/sqlite/index');
const { getSettings, toggleSetting, updateSetting } = require('@lib/sqlite/settings');
const { countUsers } = require('@lib/sqlite/users');
const { getSystemStats } = require('@lib/stats');
const { writefavicon, writeImage } = require('@lib/imageStore');
const { verifyBufferIsJPG, verifyBufferIsJPGMaxDimensions, convertToWebp } = require('@lib/utils');
const { getBackups, createBackup, restoreBackup } = require('@lib/backup');
const { generateManifest } = require('@lib/manifest');
const { InvalidRouteInput } = require('@lib/errors');
const { ViewRenderer } = require('@lib/template');
const { featureDefinitions } = require('@config/features');
const Joi = require('@lib/sanitizer');
const express = require('ultimate-express');
const router = new express.Router();

/* Plugin info*/
const PluginName = 'Settings'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const uploadDir = path.join(__dirname, '..', 'storage', 'temp_uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const uploadHandler = multer({
    dest: uploadDir,
    limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB file size limit
});

const settingsToggleSchema = Joi.object({
    setting_key: Joi.fullysanitizedString().valid('REG_CODE_ACTIVE', 'USER_SHOPPINGLIST_ACTIVE', 'DB_AUTOVACUUM', 'LOW_FUNDS_WARNING', ...Object.keys(featureDefinitions).map((featureName) => `feature_${featureName}`)).required(),
});

const settingsManifestSchema = Joi.object({
    APP_NAME: Joi.fullysanitizedString().min(1).max(100).required(),
    APP_SHORT_NAME: Joi.fullysanitizedString().min(1).max(100).required(),
    APP_DESCRIPTION: Joi.fullysanitizedString().min(1).max(250).required(),
    APP_BACKGROUND_COLOR: Joi.string().pattern(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).required(),
    APP_THEME_COLOR: Joi.string().pattern(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).required(),
});

const settingsLowFundsSchema = Joi.object({
    LOW_FUNDS_AMOUNT: Joi.number().min(1).max(100).required(),
    LOW_FUNDS_RESETTIME: Joi.number().integer().min(0).max(8760).required(),
    LOW_FUNDS_STRING: Joi.fullysanitizedString().min(1).max(250).required(),
});

router.get('/', verifyRequest('app.admin.settings.read'), limiter(1), async (req, res) => {
    const settings = await getSettings();
    return res.json(settings);
});

router.post('/toggle', verifyRequest('app.admin.settings.write'), limiter(1), async (req, res) => {
    const body = await settingsToggleSchema.validateAsync(req.body);
    const result = await toggleSetting(body.setting_key);
    if (body.setting_key.startsWith('feature_')) {
        new ViewRenderer().flushAllCachesAndRenderStaticPages();
    }
    return res.json({ success: true, new_value: result });
});

router.put('/regcode', verifyRequest('app.admin.settings.write'), limiter(1), async (req, res) => {
    const newCode = crypto.randomBytes(16).toString('hex');
    await updateSetting('REG_CODE', newCode);
    return res.json({ success: true, new_reg_code: newCode });
});

router.get('/stats', verifyRequest('app.admin.stats.read'), limiter(1), async (req, res) => {
    const appversion = package.version;
    const dbSize = getDBSize();
    const systemStats = await getSystemStats();
    return res.json({ appversion, dbSize, systemStats });
});

router.post('/vacuumdb', verifyRequest('app.admin.db.write'), limiter(1), async (req, res) => {
    const dbSize_before = getDBSize();
    await vacuumDB();
    const dbSize_after = getDBSize();
    return res.json({ success: true, dbSize_before, dbSize_after });
});

router.put('/manifest', verifyRequest('app.admin.settings.write'), parseMultipart(), limiter(10), async (req, res) => {
    const body = await settingsManifestSchema.validateAsync(req.body);

    if (req.file) {
        if (req.file.fieldname !== 'favicon') throw new InvalidRouteInput('Invalid Image');

        const validImage = await verifyBufferIsJPG(req.file.buffer, 512, 512);
        if (!validImage) throw new InvalidRouteInput('Invalid Image');

        await writefavicon(req.file.buffer);
    }

    await updateSetting('APP_NAME', body.APP_NAME);
    await updateSetting('APP_SHORT_NAME', body.APP_SHORT_NAME);
    await updateSetting('APP_DESCRIPTION', body.APP_DESCRIPTION);
    await updateSetting('APP_BACKGROUND_COLOR', body.APP_BACKGROUND_COLOR);
    await updateSetting('APP_THEME_COLOR', body.APP_THEME_COLOR);

    await generateManifest();

    res.status(200).json({ success: true });
});

router.put('/favicon', verifyRequest('web.admin.items.write'), parseMultipart(), limiter(10), async (req, res) => {
    // Image is only in the request if it was modified
    if (req.file) {
        if (req.file.fieldname !== 'favicon') throw new InvalidRouteInput('Invalid Image');

        const validImage = await verifyBufferIsJPG(req.file.buffer, 512, 512);
        if (!validImage) throw new InvalidRouteInput('Invalid Image');

        await writefavicon(req.file.buffer);
    }

    res.status(200).json({ success: true });
});

router.put('/lowFunds', verifyRequest('app.admin.settings.write'), parseMultipart(), limiter(10), async (req, res) => {
    const body = await settingsLowFundsSchema.validateAsync(req.body);

    if (req.file) {
        if (req.file.fieldname !== 'lowFundsImage') throw new InvalidRouteInput('Invalid Image');

        const validImage = await verifyBufferIsJPGMaxDimensions(req.file.buffer, 5000, 5000);
        if (!validImage) throw new InvalidRouteInput('Invalid Image');

        const webpImage = await convertToWebp(req.file.buffer, { quality: 80, lossless: false, effort: 4 });

        await writeImage(webpImage, 'static', 'low-funds', 'webp');
    }

    await updateSetting('LOW_FUNDS_AMOUNT', body.LOW_FUNDS_AMOUNT.toString());
    await updateSetting('LOW_FUNDS_RESETTIME', body.LOW_FUNDS_RESETTIME.toString());
    await updateSetting('LOW_FUNDS_STRING', body.LOW_FUNDS_STRING);

    res.status(200).json({ success: true });
});

router.get('/backup', verifyRequest('app.admin.backup.read'), limiter(5), async (req, res) => {
    const backups = getBackups();
    return res.json(backups);
});

router.post('/backup', verifyRequest('app.admin.backup.write'), limiter(20), async (req, res) => {
    await createBackup();
    res.status(200).json({ success: true });
});

router.get('/backup/:timestamp', verifyRequest('app.admin.backup.read'), limiter(5), async (req, res) => {
    const { timestamp } = req.params;
    const backup = getBackups().find(b => b.name === `${timestamp}.zip`);
    if (!backup) {
        return res.status(404).json({ success: false, error: "Backup not found" });
    }
    return res.download(path.join(__dirname, '..', 'storage', 'backups', backup.name), backup.name);
});

router.delete('/backup/:timestamp', verifyRequest('app.admin.backup.write'), limiter(5), async (req, res) => {
    const { timestamp } = req.params;
    const backupPath = path.join(__dirname, '..', 'storage', 'backups', `${timestamp}.zip`);
    if (!fs.existsSync(backupPath)) {
        return res.status(404).json({ success: false, error: "Backup not found" });
    }
    fs.rmSync(backupPath);
    return res.json({ success: true });
});

router.post('/backup/restore', limiter(10), uploadHandler.single('backupFile'), async (req, res) => {
    // Only allow restore if no users exist
    const usercount = await countUsers();
    if (usercount > 0) return res.status(409).json({ error: 'Not available' });
    if (!req.file) return res.status(400).json({ success: false });

    const zipFilePath = req.file.path;
    process.log.system(`Restore started. Received file: ${zipFilePath}`);

    try {
        await restoreBackup(zipFilePath);
        res.status(200).json({ success: true });
    } catch (error) {
        process.log.error('Restore failed:', error);
        res.status(500).json({ success: false });
    } finally {
        if (fs.existsSync(zipFilePath)) {
            fs.rmSync(zipFilePath, { force: true });
            process.log.system(`Cleaned up uploaded zip: ${zipFilePath}`);
        }
        // Kill Application
        process.log.system('Killing application to get into a safe state...');
        process.exit(0);
    }
}
);

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};

