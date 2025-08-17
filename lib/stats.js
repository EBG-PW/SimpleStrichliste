const fs = require('node:fs');
const path = require('node:path');

let latestCpuUsage = 0.0;

/**
 * Background Job to sample Applications own CPU usage
 * @param {number} sampleInterval - The interval in milliseconds to sample CPU usage.
 */
const startCpuMonitoring = (sampleInterval = 1000) => {
  let lastUsage = process.cpuUsage();
  let lastTime = Date.now();

  setInterval(() => {
    const currentUsage = process.cpuUsage();
    const currentTime = Date.now();

    const elapsedTime = (currentTime - lastTime) * 1000;
    if (elapsedTime === 0) return;

    const elapsedUsage = (currentUsage.user - lastUsage.user) + (currentUsage.system - lastUsage.system);

    const cpuPercentage = (100 * elapsedUsage) / elapsedTime;

    latestCpuUsage = parseFloat(cpuPercentage.toFixed(2));

    lastUsage = currentUsage;
    lastTime = currentTime;
  }, sampleInterval);
};

const getCPUUsage = () => {
    return latestCpuUsage;
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

startCpuMonitoring();

module.exports = {
    getCPUUsage,
    getMemoryUsage,
    getUptime,
    getStorageSize,
    getSystemStats
};