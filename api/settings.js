const crypto = require('node:crypto')
const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const package = require('../package.json');
const { getDBSize, vacuumDB} = require('@lib/sqlite');
const { getSettings, toggleSetting, updateSetting } = require('@lib/sqlite/settings');
const { getSystemStats } = require('@lib/stats');
const Joi = require('@lib/sanitizer');
const HyperExpress = require('hyper-express');
const router = new HyperExpress.Router();


/* Plugin info*/
const PluginName = 'Settings'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

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

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};

