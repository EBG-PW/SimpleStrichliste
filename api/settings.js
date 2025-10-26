const crypto = require('node:crypto')
const fs = require('node:fs');
const path = require('node:path');
const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const package = require('../package.json');
const multer = require('multer');
const { getDBSize, vacuumDB } = require('@lib/sqlite/index');
const { getSettings, toggleSetting, updateSetting } = require('@lib/sqlite/settings');
const { countUsers } = require('@lib/sqlite/users');
const { getSystemStats } = require('@lib/stats');
const { getBackups, createBackup, restoreBackup } = require('@lib/backup');
const Joi = require('@lib/sanitizer');
const HyperExpress = require('hyper-express');
const router = new HyperExpress.Router();

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
    setting_key: Joi.fullysanitizedString().valid('REG_CODE_ACTIVE', 'USER_SHOPPINGLIST_ACTIVE', 'DB_AUTOVACUUM').required(),
});

router.get('/', verifyRequest('app.admin.settings.read'), limiter(1), async (req, res) => {
    const settings = await getSettings();
    return res.json(settings);
});

router.post('/toggle', verifyRequest('app.admin.settings.write'), limiter(1), async (req, res) => {
    const body = await settingsToggleSchema.validateAsync(await req.json());
    const result = await toggleSetting(body.setting_key);
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

