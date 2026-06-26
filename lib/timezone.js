const FALLBACK_TIME_ZONE = 'UTC';

const isValidTimeZone = (timeZone) => {
    if (!timeZone) return false;

    try {
        new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
        return true;
    } catch {
        return false;
    }
};

const getApplicationTimeZone = () => {
    const configuredTimeZone = process.env.APPLICATION_TIMEZONE || process.env.TZ;

    if (isValidTimeZone(configuredTimeZone)) return configuredTimeZone;

    const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(systemTimeZone) ? systemTimeZone : FALLBACK_TIME_ZONE;
};

const formatApplicationDateTime = (value, locale, options = {}) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        ...options,
        timeZone: getApplicationTimeZone(),
    }).format(date);
};

module.exports = {
    getApplicationTimeZone,
    formatApplicationDateTime,
};
