const path = require('path');
const ejs = require('ejs');

const { log_errors } = require('@config/errors')

/**
 * Handle errors and send appropriate responses
 * @param {Error} error 
 * @param {Request} req 
 * @param {Response} res 
 * @param {Next} next 
 */
const errorHandler = (error, req, res, next) => {
    if (process.env.LOG_LEVEL == 4) process.log.debug("Global Error Handler:", error)
    const outError = {
        message: error.message || "",
        info: error.info || "",
        reason: error.reason || "",
        headers: error.headers || false,
        statusCode: error.status || 500, // Default to error 500
        back_url: error.back_url || false,
    }

    /* Returns 400 if the client didn´t provide all data/wrong data type*/
    if (error.name === "ValidationError" || error.name === "InvalidOption") {
        outError.message = error.name
        outError.info = error.message
        outError.reason = error.details
        outError.statusCode = 400;
    }

    /* Returns 401 if the client is not authorized*/
    if (error.message === "Token not provided" || error.message === "Token Invalid") {
        outError.statusCode = 401;
    }

    /* Returns 403 if the client is not allowed to do something*/
    if (error.message === "NoPermissions" || error.message === "Permission Denied") {
        outError.statusCode = 403;
    }

    /* Returns 409 if a unique constraint is violeted in the DB*/
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        outError.statusCode = 409
        outError.secret_reason = outError.message
        outError.message = "DB Constraint violated"
    }

    /* Returns 429 if the client is ratelimited*/
    if (error.message === "Too Many Requests" || error.message === "Too Many Requests - IP Blocked") {
        outError.statusCode = 429;
    }

    const logConfig = log_errors[error.name];
    const logMessage = error.secret_reason
        ? `[${outError.statusCode}] ${req.method} "${req.url}" >> ${outError.message} in "${error.path}:${error.fileline}" >> ${error.secret_reason}`
        : `[${outError.statusCode}] ${req.method} "${req.url}" >> ${outError.message} in "${error.path}:${error.fileline}"`;
    if (logConfig === true) process.log.error(logMessage);
    if (logConfig === false) process.log.warn(logMessage);
    if (error.error) console.log(error.error)
    if (error.translationKey) outError.translationKey = error.translationKey;
    res.status(outError.statusCode);
    if (outError.headers) { res.header(outError.headers.name, outError.headers.value); }
    if (outError.back_url && req.headers['accept'] !== 'application/json') {
        outError.domain = process.env.DOMAIN; // Apend the domain to the error
        outError.curentUnixTime = new Date().getTime(); // Add the current time to the error
        ejs.renderFile(path.join(__dirname, '..', 'views', 'error', 'error-xxx.ejs'), outError, (err, str) => {
            if (err) {
                res.header('Content-Type', 'application/json');
                const responseBody = {
                    message: outError.message,
                    info: outError.info,
                    reason: outError.reason,
                };
                if (outError.translationKey) responseBody.translationKey = outError.translationKey;
                res.json(responseBody);

                throw err;
            } else {
                res.header('Content-Type', 'text/html');
                res.send(str);
            }
        });
    } else {
        res.header('Content-Type', 'application/json');
        const responseBody = {
            message: outError.message,
            info: outError.info,
            reason: outError.reason,
        };
        if (outError.translationKey) responseBody.translationKey = outError.translationKey;
        res.json(responseBody);
    }
};

module.exports = errorHandler;
