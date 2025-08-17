const fs = require('node:fs');
const path = require('node:path');
const { arrayBuffer } = require('node:stream/consumers');

const getCPUUsage = () => {
    const cpuUsage = process.cpuUsage();
    return {
        user: cpuUsage.user / 1000,
        system: cpuUsage.system / 1000
    };
};

const getMemoryUsage = () => {
    const memoryUsage = process.memoryUsage();
    return {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers
    };
};

const getUptime = () => {
    return Math.floor(process.uptime());
};

const getStorageSize = () => {
    const storagePath = path.join(__dirname, '..', 'storage');

    // Cache latest function, to reduce file system calls
    const cache = {};

    if (cache.getStorageSize && (Date.now() - cache.getStorageSize.lastUpdated < 1000)) {
        return cache.getStorageSize();
    }

    // Get Size per sub storage
    const subDirs = fs.readdirSync(storagePath).filter(file => fs.statSync(path.join(storagePath, file)).isDirectory());
    const sizes = subDirs.map(dir => {
        const dirPath = path.join(storagePath, dir);
        const total = fs.readdirSync(dirPath).reduce((acc, file) => {
            const filePath = path.join(dirPath, file);
            const stats = fs.statSync(filePath);
            return acc + stats.size;
        }, 0);
        return { dir, size: total};
    });

    cache.getStorageSize = () => sizes;
    cache.getStorageSize.lastUpdated = new Date();

    return sizes;
};

const getSystemStats = () => {
    return {
        cpu: getCPUUsage(),
        memory: getMemoryUsage(),
        storage: getStorageSize(),
        uptime: getUptime()
    };
};

module.exports = {
    getCPUUsage,
    getMemoryUsage,
    getUptime,
    getStorageSize,
    getSystemStats
};