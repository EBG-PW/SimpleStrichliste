const os = require('os');
const util = require('node:util');

const loglevel = Number(process.env.LOG_LEVEL) || 3;
const Levels = ['error', 'warning', 'info', 'debug', 'system'];
const maxMemoryLogs = Number(process.env.LOG_MEMORY_LIMIT) || 5000;
const memoryLogs = [];
let logSequence = 0;

/**
 * Returns the current timestamp
 * @returns {String} Timestamp in the format DD.MM.YYYY HH:MM:SS
 */
const getTimestamp = () => {
    const pad = (n, s = 2) => (`${new Array(s).fill(0)}${n}`).slice(-s);
    const d = new Date();

    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${pad(d.getFullYear(), 4)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Will replace all {{Variables}} with the corresponding value of the Key
 * @param {String} templateid 
 * @param {Object} data 
 * @returns {String}
 */
const template = (templateid, data) => {
    if (typeof (templateid) !== 'string' || typeof (data) !== 'object') { throw new Error('Template expects string and object'); }
    return templateid
        .replace(
            /{{2}(\w*)}{2}/g,
            function (m, key) {
                return data.hasOwnProperty(key) ? data[key] : "NULL";
            }
        );
}

/**
 * Return the color and short form for the loglevel
 * @param {number} levelnumber 
 * @returns 
 */
const logColorShort = (levelnumber) => {
    switch (levelnumber) {
        case 1:
            if (process.env.LOG_COLOR == 'true') return '\x1b[31m[E]\x1b[0m';
            return '[E]';
        case 2:
            if (process.env.LOG_COLOR == 'true') return '\x1b[33m[W]\x1b[0m';
            return '[W]';
        case 3:
            if (process.env.LOG_COLOR == 'true') return '\x1b[32m[I]\x1b[0m';
            return '[I]';
        case 4:
            if (process.env.LOG_COLOR == 'true') return '\x1b[35m[D]\x1b[0m';
            return '[D]';
        case 5:
            if (process.env.LOG_COLOR == 'true') return '\x1b[36m[S]\x1b[0m';
            return '[S]';
        default:
            return '\x1b[0m'
    }
}

/**
 * Return the color for the loglevel
 * @param {number} levelnumber 
 * @returns 
 */
const logColor = (levelnumber) => {
    switch (levelnumber) {
        case 1:
            if (process.env.LOG_COLOR == 'true') return '\x1b[31m';
            return '';
        case 2:
            if (process.env.LOG_COLOR == 'true') return '\x1b[33m';
            return '';
        case 3:
            if (process.env.LOG_COLOR == 'true') return '\x1b[32m';
            return '';
        case 4:
            if (process.env.LOG_COLOR == 'true') return '\x1b[35m';
            return '';
        case 5:
            if (process.env.LOG_COLOR == 'true') return '\x1b[36m';
            return '';
        default:
            return ''
    }
}

/**
 * Formats the log message
 * @param {number} levelnumber 
 * @param {string} text 
 * @returns 
 */
const logFormater = (levelnumber, text) => {
    if (process.env.LOG_TEMPLATE) {
        const avaibleVars = {
            levelnumber: levelnumber,
            level: Levels[levelnumber - 1],
            text: text,
            timestamp: getTimestamp(),
            application: process.env.APPLICATION || "Application",
            logcolor: logColor(levelnumber),
            colorreset: '\x1b[0m',
            logcolorshort: logColorShort(levelnumber),
            hostname: os.hostname(),
        }
        return template(process.env.LOG_TEMPLATE, avaibleVars);
    }
    return `[${process.env.APPLICATION || "Application"}] [${getTimestamp()}] ${logColorShort(levelnumber)} ${text}`;
}

const rememberLog = (levelnumber, text, timestamp = getTimestamp()) => {
    if (levelnumber < 1) return;

    const level = Levels[levelnumber - 1] || 'unknown';
    memoryLogs.push({
        id: ++logSequence,
        timestamp,
        timestampMs: Date.now(),
        level,
        text: String(text),
    });

    if (memoryLogs.length > maxMemoryLogs) {
        memoryLogs.splice(0, memoryLogs.length - maxMemoryLogs);
    }

    if (levelnumber === 1) {
        try {
            require('@lib/sqlite/adminNotifications').recordErrorReport(text);
        } catch {
            // DB may not exist yet during early startup/migration.
        }
    }
}

const getMemoryLogs = () => memoryLogs.slice();

const rememberExternalLog = (level, text, timestamp = getTimestamp()) => {
    const levelnumber = Levels.indexOf(String(level || '').toLowerCase()) + 1;
    rememberLog(levelnumber, text, timestamp);
}

const writeLog = (levelnumber, text) => {
    if (process.env.LOG_TYPE === 'console') {
        console.log(logFormater(levelnumber, text))
    } else {
        process.stdout.write(logFormater(levelnumber, text) + '\n');
    }
}

/**
 * @param {string} level Loglevel of the to log text
 * @param {...unknown} parts Text to log
 */
const logger = function (level, ...parts) {
    const levelnumber = Levels.indexOf(level.toLowerCase()) + 1
    const text = util.format(...parts);

    rememberLog(levelnumber, text);

    if ((levelnumber <= loglevel && levelnumber >= 1 && levelnumber <= 4) || levelnumber === 5) {
        writeLog(levelnumber, text);
    }
}

/**
 * logs an error to the console
 * @param {String} text Text to log
 */
const logError = (...parts) => logger('error', ...parts);

/**
 * logs a warning to the console
 * @param {String} text Text to log
 */
const logWarning = (...parts) => logger('warning', ...parts);

/**
 * logs a info to the console
 * @param {String} text Text to log
 */
const logInfo = (...parts) => logger('info', ...parts);

/**
 * logs a debug message to the console
 * @param {String} text 
 * @returns 
 */
const logDebug = (...parts) => logger('debug', ...parts);

/**
 * logs an system message to the console
 * @param {String} text Text to log
 */
const logSystem = (...parts) => logger('system', ...parts);

const log = {
    error: logError,
    err: logError,
    warning: logWarning,
    warn: logWarning,
    info: logInfo,
    debug: logDebug,
    system: logSystem,
    sys: logSystem
}

logger('system', `Logger initialized at level ${Levels[loglevel - 1]}`);

module.exports = {
    logger,
    log,
    getMemoryLogs,
    rememberExternalLog
};
