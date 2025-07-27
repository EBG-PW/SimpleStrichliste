const { checkPermission } = require('@lib/permissions');
const { checkWebToken } = require('@lib/token');
const { getIpOfRequest } = require('@lib/utils');
const { removeWebtoken, IPLimit, IPCheck } = require('@lib/cache');
const { InvalidToken, TooManyRequests, PermissionsError } = require('@lib/errors');
const Joi = require('joi');
const useragent = require('express-useragent');

/**
 * Async function to verify the request based on the given permission. User data will be added to the request. (req.user)
 * @param {String} permission 
 * @returns 
 */
const verifyRequest = (permission) => {
    return async (req, res, next) => {
        try {
            let UserToken;
            const IP = getIpOfRequest(req);
            const source = req.headers['user-agent']
            const UserAgent = useragent.parse(source)

            const isBlocked = await IPCheck(IP);
            if (isBlocked.result) throw new TooManyRequests('Too Many Requests', isBlocked.retryIn)

            // Get the token from the header
            if (req.headers['authorization'] != undefined) {
                UserToken = req.headers['authorization'].replace('Bearer ', '');
            } else {
                if (!permission) return; // Ignore if no permissions where requested - Its a public API route so everyone can access it but IF some logged in user is using it, we just append the user data to the request
                throw new InvalidToken('No Token Provided').withBackUrl("none");
            }

            // Validate the token wich is a uuid-v4
            const TokenSchema = Joi.string().uuid({ version: 'uuidv4' }).required();
            await TokenSchema.validateAsync(UserToken);

            // Check if the token is valid
            const WebTokenResponse = await checkWebToken(UserToken, UserAgent.browser);
            if (!WebTokenResponse.State) {
                if (WebTokenResponse.DidExist) {
                    // The token existed, but was invalid for this request. Delete it from the database and cache
                    process.log.debug(`Deleting Token ${UserToken} from database`);
                    // await webtoken.delete(UserToken)
                    removeWebtoken(UserToken);
                } else {
                    // The token did not exist, lets add the reuqest IP to the cache to stop brute force attacks and reduce DB stress
                    const IPLimiter = await IPLimit(IP, 20);

                    // If true, then the IP has been in rate limit
                    if (IPLimiter.result) throw new TooManyRequests('Too Many Requests', IPLimiter.retryIn)
                }
                throw new InvalidToken('Invalid Token');
            }

            if (permission) {
                // Check if the user has the permission for the request
                const allowed = checkPermission(WebTokenResponse.Data.permissions, permission);
                if (!allowed.result) throw new PermissionsError('NoPermissions', permission);
                process.log.debug(`Permission Granted for ${WebTokenResponse.Data.username} to ${permission}`);
            }

            // Add the user data to the request
            req.user = WebTokenResponse.Data;
            req.authorization = UserToken;

        } catch (error) {
            if (error.name === "ValidationError") {
                if (!permission) return; // Ignore if no permissions where requested - Its a public API route so everyone can access it but IF some logged in user is using it, we just append the user data to the request
                next(new InvalidToken('Invalid Token'));
            }
            next(error); // This will trigger global error handler as we are returning an Error
        }
    };
};

module.exports = {
    verifyRequest
};