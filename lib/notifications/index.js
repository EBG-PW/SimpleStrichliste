const fs = require('node:fs');
const path = require('node:path');
const email = require('./email');
const { getUserNotificationState } = require('@lib/sqlite/userNotifications');
const { checkIfSettingTrue, getSetting } = require('@lib/sqlite/settings');
const {
    getPendingErrorReports,
    markErrorReportsSent,
    getAdminNotificationRecipients,
    getItemSalesTrend,
} = require('@lib/sqlite/adminNotifications');
const { getRuntimeFeatureNotificationConfigs } = require('@lib/features');

const NOTIFICATION_CATEGORIES = Object.freeze({
    SYSTEM: 'system',
    NEWSLETTER: 'newsletter',
});
const NOTIFICATION_CHANNELS = Object.freeze({
    EMAIL: 'email',
});
const NOTIFICATION_TYPES = {};
const notifications = new Map();
const notificationConfigDir = path.join(__dirname, '..', '..', 'config', 'notifications');

const registerNotification = (definition) => {
    if (!definition || typeof definition !== 'object') {
        throw new TypeError('notification definition must be an object');
    }

    const type = definition.type;
    if (typeof type !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(type)) {
        throw new TypeError('notification type must contain only letters, numbers, underscores, or hyphens');
    }
    if (notifications.has(type) && definition.replace !== true) {
        throw new Error(`Notification is already registered: ${type}`);
    }
    if (!Object.values(NOTIFICATION_CATEGORIES).includes(definition.category)) {
        throw new TypeError('notification category must be system or newsletter');
    }
    if (!definition.channels || typeof definition.channels !== 'object' || Array.isArray(definition.channels)) {
        throw new TypeError('notification channels must be an object');
    }
    if (definition.requiresMessage !== undefined && typeof definition.requiresMessage !== 'boolean') {
        throw new TypeError('requiresMessage must be a boolean');
    }

    const preferenceKey = definition.preferenceKey || type.toLowerCase();
    if (!/^[a-z0-9_-]{1,64}$/.test(preferenceKey)) {
        throw new TypeError('notification preferenceKey must use lowercase letters, numbers, underscores, or hyphens');
    }
    if (definition.category === NOTIFICATION_CATEGORIES.NEWSLETTER &&
        (typeof definition.translationKeyBase !== 'string' || !definition.translationKeyBase)) {
        throw new TypeError('newsletter notifications require translationKeyBase');
    }

    const channelNames = Object.keys(definition.channels);
    if (channelNames.length === 0) throw new TypeError('notification must have at least one channel');
    channelNames.forEach((channel) => {
        if (channel !== NOTIFICATION_CHANNELS.EMAIL) {
            throw new TypeError(`Unsupported notification channel: ${channel}`);
        }
        email.registerEmailNotification(type, definition.channels[channel], definition.replace === true);
    });

    notifications.set(type, {
        type,
        category: definition.category,
        preferenceKey,
        translationKeyBase: definition.translationKeyBase || null,
        requiresMessage: definition.requiresMessage === true,
        channels: channelNames,
    });

    if (definition.constant) {
        if (!/^[A-Z][A-Z0-9_]*$/.test(definition.constant)) {
            throw new TypeError('notification constant must use uppercase letters, numbers, and underscores');
        }
        if (NOTIFICATION_TYPES[definition.constant] &&
            NOTIFICATION_TYPES[definition.constant] !== type &&
            definition.replace !== true) {
            throw new Error(`Notification constant is already registered: ${definition.constant}`);
        }
        NOTIFICATION_TYPES[definition.constant] = type;
    }
    return type;
};

const getNotification = (type) => notifications.get(type) || null;

const getNewsletterNotifications = () => [...notifications.values()]
    .filter((definition) => definition.category === NOTIFICATION_CATEGORIES.NEWSLETTER)
    .flatMap((definition) => definition.channels.map((channel) => ({
        type: definition.type,
        key: definition.preferenceKey,
        channel,
        translationKeyBase: definition.translationKeyBase,
    })));

const canSetNotificationPreference = (key, channel) => getNewsletterNotifications()
    .some((definition) => definition.key === key && definition.channel === channel);

const sendNotification = async (receiverId, priority, type, message = null, recipient = null) => {
    if (!Number.isInteger(receiverId) || receiverId < 1) {
        throw new TypeError('receiver_id must be a positive integer');
    }
    if (!Number.isInteger(priority) || priority < -32768 || priority > 32767) {
        throw new TypeError('priority must be a small integer');
    }

    const definition = getNotification(type);
    if (!definition) {
        throw new TypeError(`type must be one of: ${[...notifications.keys()].join(', ')}`);
    }
    if (definition.requiresMessage && (typeof message !== 'string' || !message.trim())) {
        throw new TypeError(`message is required for ${type} notifications`);
    }
    if (message !== null && message !== undefined && typeof message !== 'string') {
        throw new TypeError('message must be a string when provided');
    }

    const tasks = {};
    if (definition.channels.includes(NOTIFICATION_CHANNELS.EMAIL)) {
        const enabled = definition.category !== NOTIFICATION_CATEGORIES.NEWSLETTER ||
            getUserNotificationState(receiverId, definition.preferenceKey, NOTIFICATION_CHANNELS.EMAIL, true);
        if (enabled) {
            tasks.email = email.queueEmail(receiverId, priority, type, message, recipient);
        }
    }
    return tasks;
};

const registerNotificationType = (definition) => registerNotification({
    type: definition.type,
    constant: definition.constant,
    category: NOTIFICATION_CATEGORIES.SYSTEM,
    requiresMessage: definition.requiresMessage,
    replace: definition.replace,
    channels: {
        email: {
            templatePath: definition.templatePath,
            translations: definition.translations,
            buildContext: definition.buildContext,
            buildText: definition.buildText,
        },
    },
});

const loadNotificationConfigs = () => {
    const configFiles = fs.existsSync(notificationConfigDir)
        ? fs.readdirSync(notificationConfigDir)
            .filter((file) => file.endsWith('.js'))
            .sort()
            .map((file) => path.join(notificationConfigDir, file))
        : [];

    configFiles.concat(getRuntimeFeatureNotificationConfigs())
        .forEach((filePath) => {
            const definitions = require(filePath);
            if (!Array.isArray(definitions)) {
                throw new TypeError(`Notification config must export an array: ${filePath}`);
            }
            definitions.forEach(registerNotification);
        });
};

loadNotificationConfigs();

let dailyErrorReportTimer = null;

const sendErrorReportIfNeeded = async () => {
    if (!await checkIfSettingTrue('ERROR_REPORTS_ACTIVE')) return [];

    const errors = getPendingErrorReports();
    if (errors.length === 0) return [];

    const recipients = getAdminNotificationRecipients();
    if (recipients.length === 0) return [];

    const message = JSON.stringify({
        errors: errors.map((entry) => ({
            id: entry.id,
            timestamp: entry.timestamp,
            message: entry.message,
        })),
    });

    const tasks = [];
    for (const recipient of recipients) {
        tasks.push(await sendNotification(recipient.id, 0, NOTIFICATION_TYPES.ERROR_REPORT, message, recipient));
    }
    markErrorReportsSent(errors.map((entry) => entry.id));
    return tasks;
};

const getNextErrorReportDelay = () => {
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setHours(23, 59, 0, 0);
    if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1);
    return nextRun.getTime() - now.getTime();
};

const scheduleDailyErrorReport = () => {
    if (dailyErrorReportTimer) clearTimeout(dailyErrorReportTimer);
    dailyErrorReportTimer = setTimeout(() => {
        sendErrorReportIfNeeded()
            .catch((error) => process.log?.error?.(`Daily error report failed: ${error?.message || error}`))
            .finally(scheduleDailyErrorReport);
    }, getNextErrorReportDelay());
    dailyErrorReportTimer.unref?.();
};

const startNotificationWorker = () => {
    const timer = email.startEmailWorker();
    scheduleDailyErrorReport();
    return timer;
};

const stopNotificationWorker = () => {
    if (dailyErrorReportTimer) {
        clearTimeout(dailyErrorReportTimer);
        dailyErrorReportTimer = null;
    }
    email.stopEmailWorker();
};

const notifyLowStockIfNeeded = async (previousStock, item, triggerPercent) => {
    if (!item || !Number.isFinite(Number(item.target_stock)) || Number(item.target_stock) <= 0) return [];
    if (!await checkIfSettingTrue('LOW_STOCK_WARNING')) return [];

    const configuredTrigger = triggerPercent ?? Number(await getSetting('LOW_STOCK_PERCENT'));
    if (!Number.isFinite(configuredTrigger) || configuredTrigger < 0 || configuredTrigger > 100) return [];

    const targetStock = Number(item.target_stock);
    const currentStock = Number(item.stock);
    const previousPercent = (Number(previousStock) / targetStock) * 100;
    const currentPercent = (currentStock / targetStock) * 100;
    if (!(previousPercent >= configuredTrigger && currentPercent < configuredTrigger)) return [];

    const recipients = getAdminNotificationRecipients();
    const trend = getItemSalesTrend(item.uuid);
    const estimatedDaysRemaining = trend.averagePerDay > 0
        ? Math.ceil(currentStock / trend.averagePerDay)
        : null;
    const message = JSON.stringify({
        item: {
            uuid: item.uuid,
            name: item.name,
            stock: currentStock,
            target_stock: targetStock,
        },
        trend: {
            ...trend,
            estimatedDaysRemaining,
        },
    });

    const tasks = [];
    for (const recipient of recipients) {
        tasks.push(await sendNotification(recipient.id, 0, NOTIFICATION_TYPES.LOW_STOCK, message, recipient));
    }
    return tasks;
};

module.exports = {
    NOTIFICATION_TYPES,
    NOTIFICATION_CATEGORIES,
    NOTIFICATION_CHANNELS,
    registerNotification,
    registerNotificationType,
    getNotification,
    getNewsletterNotifications,
    canSetNotificationPreference,
    buildEmail: email.buildEmail,
    isPermanentEmailError: email.isPermanentEmailError,
    isSmtpAuthRateLimitError: email.isSmtpAuthRateLimitError,
    sendNotification,
    processEmailQueue: email.processEmailQueue,
    sendErrorReportIfNeeded,
    notifyLowStockIfNeeded,
    startNotificationWorker,
    stopNotificationWorker,
};
