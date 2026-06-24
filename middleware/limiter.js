const { LimiterMiddleware } = require('@lib/cache')
const { TooManyRequests } = require('@lib/errors')
const { getIpOfRequest } = require('@lib/utils')

/**
 * Middleware to limit requests on routes
 * @param {Number} cost 
 * @returns 
 */
const limiter = (cost = 1) => {
    return async (req, res, next) => {
        try {
            let key;
            if (!req.authorization) {
                key = getIpOfRequest(req);
            } else {
                key = req.authorization;
            }

            const rateLimit = await LimiterMiddleware(key, cost);

            if (rateLimit.result) throw new TooManyRequests('Too Many Requests', rateLimit.retryIn)
            return next();

        } catch (error) {
            return next(error); // This will trigger global error handler as we are returning an Error
        }
    };
};

module.exports = {
    limiter
};
