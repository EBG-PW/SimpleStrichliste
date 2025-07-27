const MegaHash = require('megahash');
const { mergePermissions } = require('@lib/permissions');
const { createWebtoken, getWebtoken, deleteWebtoken } = require('@lib/sqlite/webtokens');

const store = new MegaHash();

/**
 * Get memory usage of the cache
 * @returns {Number}
 */
const getMemoryUsage = () => {
    return new Promise((resolve, reject) => {
        resolve(store.stats().dataSize);
    })
}

/**
 * Delete all keys from the cache
 * @returns {String}
 */
const WipeCache = () => {
    return new Promise((resolve, reject) => {
        store.clear();
        resolve('Cleaned');
    })
}

/**
 * @typedef {Object} WebtokenCacheResult
 * @property {String} token
 * @property {Number} user_id
 * @property {String} uuid
 * @property {String} username
 * @property {Array} permissions
 * @property {String} browser
 * @property {String} language
 * @property {Object} time
 */

/**
 * Add a Webtoken to the Cache
 * @param {String} webtoken
 * @param {Object} user_data
 * @param {Array} formated_Permissions
 * @param {String} browser
 * @param {Boolean} cacheOnly If true, the webtoken will not be added to the database
 * @return {Promise<WebtokenCacheResult>}
 */
const addWebtoken = (webtoken, user_data, formated_Permissions, browser, cacheOnly = false) => {
    return new Promise(async (resolve, reject) => {
        if (!cacheOnly) {
            await createWebtoken(webtoken, user_data.id, browser); // Create the Webtoken in SQLite
        }
        const writeResult = store.set(`WT:${webtoken}`, {
            user_data,
            browser: browser,
            permissions: formated_Permissions,
            time: new Date().getTime()
        });

        if (!writeResult) {
            throw new Error("Failed to write to MegaHash: Out of memory");
        }
        resolve({ token: webtoken, ...user_data, formated_Permissions, browser });
    });
}

/**
 * If the webtoken is missing from the cache, we have to check the persistant DB
 * @param {String} webtoken 
 * @returns {WebtokenCacheResult|Undefined}
 */
const readWebtoken = (webtoken) => {
    return new Promise(async (resolve, reject) => {
        if (!webtoken) return reject("No token provided");
        const inCache = store.has(`WT:${webtoken}`)
        if (inCache) {
            process.log.debug(`Webtoken Cach Hit on ${webtoken}`)
            resolve(store.get(`WT:${webtoken}`));
        } else {
            process.log.debug(`Webtoken Cach Miss on ${webtoken}`)
            const dbResult = await getWebtoken(webtoken) // Get TokenData from DB
            // To prevent the same cache miss, we add it to the cache
            if (dbResult) {
                const Formated_Permissions = mergePermissions([], dbResult.user_role);
                addWebtoken(webtoken, dbResult, Formated_Permissions, dbResult.browser, true);
                resolve({ token: webtoken,user_data: dbResult, browser: dbResult.browser, permissions: Formated_Permissions, time: new Date(dbResult.time).getTime() })
            } else {
                resolve(null); // Token does not exist in cache or DB
            }
        }
    })
}

/**
 * Removes a Webtoken from the Cache
 * @param {String} webtoken 
 */
const removeWebtoken = (webtoken) => {
    store.delete(`WT:${webtoken}`);
    deleteWebtoken(webtoken)
}

/**
 * Increase the IPs request count, or add a new entry if it does not exist
 * Returns true if the IP is blocked
 * @param {String} ip 
 * @param {Number} cost 
 */
const IPLimit = (ip, cost = 1) => {
    if (typeof cost !== 'number') throw new Error('Cost must be a number');
    if (cost < 0) throw new Error('Cost must be a positive number');
    // Check if the IP is in the cache
    if (!store.has(`IPL:${ip}`)) {
        store.set(`IPL:${ip}`, { r: 0 + cost, t: new Date().getTime() });
        return { result: false };
    } else {
        // IP is in the cache, increase the request count
        const current = store.get(`IPL:${ip}`);
        if (current.r + cost < Number(process.env.DECREASEPERMIN)) {
            const reduced = ((new Date().getTime() - current.t) / (1000 * 60)) * Number(process.env.DECREASEPERMIN);
            // Reduce requests by the time passed but make sure its not below 0 and add the cost
            const newCount = Math.max(0, current.r - reduced) + cost;
            store.set(`IPL:${ip}`, { r: newCount, t: new Date().getTime() });
            return { result: false };
        } else {
            const reduced = ((new Date().getTime() - current.t) / (1000 * 60)) * Number(process.env.DECREASEPERMIN);
            // Reduce requests by the time passed but make sure its not below 0 and add the cost
            const newCount = Math.max(0, current.r - reduced);
            store.set(`IPL:${ip}`, { r: newCount, t: new Date().getTime() });
            // Calculate the time when the next request is possible
            const time = (((newCount + cost) - Number(process.env.DECREASEPERMIN)) / ((Number(process.env.DECREASEPERMIN) / 60)) * 1000).toFixed(0);
            return { result: true, retryIn: time };
        }
    }
}

/**
 * Returns true if the IP is blocked
 * @param {String} ip 
 * @returns 
 */
const IPCheck = (ip) => {
    if (!store.has(`IPL:${ip}`)) {
        return { result: false };
    } else {
        const current = store.get(`IPL:${ip}`);
        const reduced = ((new Date().getTime() - current.t) / (1000 * 60)) * Number(process.env.DECREASEPERMIN);
        const newCount = Math.max(0, current.r - reduced);
        store.set(`IPL:${ip}`, { r: newCount, t: new Date().getTime() });
        if (newCount < Number(process.env.DECREASEPERMIN) - 1) {
            return { result: false };
        } else {
            // Calculate the time when the next request is possible
            const time = (((newCount + cost) - Number(process.env.DECREASEPERMIN)) / ((Number(process.env.DECREASEPERMIN) / 60)) * 1000).toFixed(0);
            return { result: true, retryIn: time };
        }
    }
}

/**
 * Increase the limiters request count, or add a new entry if it does not exist
 * Returns true if the limiter is saturated
 * @param {String} key 
 * @param {Number} cost 
 */
const LimiterMiddleware = (key, cost = 1) => {
    if (typeof cost !== 'number') throw new Error('Cost must be a number');
    if (cost < 0) throw new Error('Cost must be a positive number');
    // Check if the key is in the cache
    if (!store.has(`LIM:${key}`)) {
        store.set(`LIM:${key}`, { r: 0 + cost, t: new Date().getTime() });
        return { result: false };
    } else {
        // Key is in the cache, increase the request count
        const current = store.get(`LIM:${key}`);
        const reduced = ((new Date().getTime() - current.t) / (1000 * 60)) * Number(process.env.DECREASEPERMIN);
        if ((current.r - reduced) + cost < Number(process.env.DECREASEPERMIN)) {
            // Reduce requests by the time passed but make sure its not below 0 and add the cost
            const newCount = Math.max(0, current.r - reduced) + cost;
            store.set(`LIM:${key}`, { r: newCount, t: new Date().getTime() });
            return { result: false };
        } else {
            // Reduce requests by the time passed but make sure its not below 0
            const newCount = Math.max(0, current.r - reduced);
            store.set(`LIM:${key}`, { r: newCount, t: new Date().getTime() });
            // Calculate the time when the next request with this cost is possible
            const time = (((newCount + cost) - Number(process.env.DECREASEPERMIN)) / ((Number(process.env.DECREASEPERMIN) / 60)) * 1000).toFixed(0);
            return { result: true, retryIn: time };
        }
    }
}

module.exports = {
    getMemoryUsage,
    WipeCache,
    addWebtoken,
    readWebtoken,
    removeWebtoken,
    IPCheck,
    IPLimit,
    LimiterMiddleware
};
