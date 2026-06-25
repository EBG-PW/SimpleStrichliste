const express = require('ultimate-express');
const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const { getPerformanceStats } = require('@lib/sqlite/performanceStats');

const router = new express.Router();

const PluginName = 'Performance';
const PluginRequirements = [];
const PluginVersion = '0.0.1';

router.get('/', verifyRequest('app.admin.stats.read'), limiter(1), async (req, res) => {
    const requestedLimit = Number(req.query?.limit) || 200;
    const limit = Math.min(Math.max(requestedLimit, 10), 1000);
    const performanceStats = getPerformanceStats(limit, limit);
    return res.json({ performanceStats });
});

module.exports = {
    router,
    PluginName,
    PluginRequirements,
    PluginVersion,
};
