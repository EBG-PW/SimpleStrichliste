const { db } = require('./index.js');

/**
 * Get all settings.
 * @returns {Array} An array of settings.
 */
const getSettings = async () => {
    return db.prepare('SELECT * FROM app_settings').all();
};

/**
 * Get value of a setting key.
 * @param {String} key 
 * @returns 
 */
const getSetting = async (key) => {
    const setting = db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get(key);
    return setting ? setting.setting_value : null;
};

/**
 * Toggle a boolean setting.
 * @param {string} key 
 */
const toggleSetting = async (key) => {
    const currentValue = db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get(key);
    if (currentValue) {
        const newValue = currentValue.setting_value === 'true' ? 'false' : 'true';
        db.prepare('UPDATE app_settings SET setting_value = ? WHERE setting_key = ?').run(newValue, key);
        return newValue;
    }
};

/**
 * Update a setting.
 * @param {string} key 
 * @param {string} value 
 */
const updateSetting = async (key, value) => {
    db.prepare('UPDATE app_settings SET setting_value = ? WHERE setting_key = ?').run(value, key);
};

/**
 * Check if a setting is true.
 * @param {string} key 
 * @returns {Promise<boolean>}
 */
const checkIfSettingTrue = async (key) => {
    const currentValue = db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get(key);
    return currentValue ? currentValue.setting_value === 'true' : false;
};

module.exports = {
    getSettings,
    getSetting,
    toggleSetting,
    updateSetting,
    checkIfSettingTrue
};