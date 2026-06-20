const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const i18next = require('i18next');
const nodemailer = require('nodemailer');
const {
    createEmailTask,
    getSendableEmailTasks,
    markEmailTaskSent,
    markEmailTaskFailed,
} = require('@lib/sqlite/emailTasks');

const NOTIFICATION_TYPES = Object.freeze({
    REG_MAIL: 'RegMail',
    DELETE_ACCOUNT: 'DeleteAcc',
    DISCOUNTS: 'Discounts',
    CUSTOM: 'Custom',
});

const RETRY_INTERVAL_MS = 5 * 60 * 1000;
const EMAIL_TEMPLATE_DIR = path.join(__dirname, '..', 'config', 'templates', 'email');
const EMAIL_LOCALE_DIR = path.join(EMAIL_TEMPLATE_DIR, 'locales');
let workerTimer = null;
let processingPromise = null;
let transporter = null;
let emailI18nPromise = null;
let emailResources = null;

const loadEmailResources = () => {
    if (emailResources) return emailResources;

    emailResources = Object.fromEntries(
        fs.readdirSync(EMAIL_LOCALE_DIR)
            .filter((file) => file.endsWith('.json'))
            .map((file) => {
                const language = path.basename(file, '.json');
                const translation = JSON.parse(fs.readFileSync(path.join(EMAIL_LOCALE_DIR, file), 'utf8'));
                return [language, { translation }];
            })
    );
    return emailResources;
};

const getFallbackLanguage = () => {
    const resources = loadEmailResources();
    const configured = process.env.FALLBACKLANG || 'de';
    return Object.hasOwn(resources, configured) ? configured : Object.keys(resources)[0];
};

const getEmailI18n = () => {
    if (!emailI18nPromise) {
        const instance = i18next.createInstance();
        emailI18nPromise = instance.init({
            resources: loadEmailResources(),
            fallbackLng: getFallbackLanguage(),
            interpolation: {
                escapeValue: false,
            },
        }).then(() => instance);
    }

    return emailI18nPromise;
};

const getTemplatePathForType = (type) => {
    switch (type) {
        case NOTIFICATION_TYPES.REG_MAIL:
            return path.join(EMAIL_TEMPLATE_DIR, 'RegMail.ejs');
        case NOTIFICATION_TYPES.DELETE_ACCOUNT:
            return path.join(EMAIL_TEMPLATE_DIR, 'DeleteAcc.ejs');
        case NOTIFICATION_TYPES.DISCOUNTS:
            return path.join(EMAIL_TEMPLATE_DIR, 'Discounts.ejs');
        case NOTIFICATION_TYPES.CUSTOM:
            return path.join(EMAIL_TEMPLATE_DIR, 'Custom.ejs');
        default:
            throw new TypeError(`Unsupported notification type: ${type}`);
    }
};

const createTransporter = () => {
    if (!process.env.SMTP_HOST) {
        throw new Error('SMTP_HOST is not configured');
    }

    const port = Number.parseInt(process.env.SMTP_PORT || '587', 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('SMTP_PORT must be a valid TCP port');
    }

    const options = {
        host: process.env.SMTP_HOST,
        port,
        secure: process.env.SMTP_SECURE === 'true' || port === 465,
    };

    if (process.env.SMTP_USER) {
        options.auth = {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD || '',
        };
    }

    return nodemailer.createTransport(options);
};

const getTransporter = () => {
    if (!transporter) transporter = createTransporter();
    return transporter;
};

const buildEmail = async (task) => {
    const i18n = await getEmailI18n();
    const fallbackLanguage = getFallbackLanguage();
    const language = task.language && i18n.hasResourceBundle(task.language, 'translation')
        ? task.language
        : fallbackLanguage;
    const t = i18n.getFixedT(language);
    let discountItems = [];
    if (task.type === NOTIFICATION_TYPES.DISCOUNTS && task.custom_message) {
        discountItems = JSON.parse(task.custom_message).items || [];
    }
    const context = {
        name: task.name,
        username: task.username,
        email: task.email,
        uuid: task.uuid,
        application: process.env.APPLICATION || 'SimpleStrichliste',
        domain: process.env.DOMAIN || '',
        message: task.custom_message || '',
        discountItems,
        language,
        t,
    };
    const templatePath = getTemplatePathForType(task.type);
    const html = await ejs.renderFile(templatePath, context);
    const text = task.type === NOTIFICATION_TYPES.DISCOUNTS
        ? [
            t('emails.greeting', { name: task.name }),
            '',
            t('emails.Discounts.body'),
            ...discountItems.map((item) =>
                `${item.name}: ${Number(item.discount_price).toFixed(2)} € ` +
                `(${t('emails.Discounts.until', { date: new Date(item.discount_until).toLocaleString(language) })})`
            ),
            '',
            process.env.DOMAIN || '',
        ].join('\n')
        : t(`emails.${task.type}.text`, context);

    return {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: task.email,
        subject: t(`emails.${task.type}.subject`, context),
        text,
        html,
    };
};

const getMaxRetries = () => {
    const configured = Number.parseInt(process.env.EMAIL_MAX_RETRIES || '5', 10);
    return Number.isInteger(configured) && configured > 0 ? configured : 5;
};

const processEmailQueue = () => {
    if (processingPromise) return processingPromise;

    processingPromise = (async () => {
        const tasks = getSendableEmailTasks(getMaxRetries());

        for (const task of tasks) {
            try {
                const email = await buildEmail(task);
                await getTransporter().sendMail(email);
                markEmailTaskSent(task.id);
                process.log?.info?.(`Email task ${task.id} sent to user ${task.user_id}`);
            } catch (error) {
                markEmailTaskFailed(task.id, error?.message || error);
                process.log?.error?.(`Email task ${task.id} failed: ${error?.message || error}`);
            }
        }
    })().finally(() => {
        processingPromise = null;
    });

    return processingPromise;
};

const triggerEmailQueue = () => {
    setImmediate(() => {
        void processEmailQueue().catch((error) => {
            process.log?.error?.(`Email queue worker failed: ${error?.message || error}`);
        });
    });
};

const startNotificationWorker = () => {
    if (workerTimer) return workerTimer;

    workerTimer = setInterval(triggerEmailQueue, RETRY_INTERVAL_MS);
    workerTimer.unref?.();
    triggerEmailQueue();
    return workerTimer;
};

const stopNotificationWorker = () => {
    if (!workerTimer) return;
    clearInterval(workerTimer);
    workerTimer = null;
};

/**
 * Queues an email and returns as soon as it has been inserted into SQLite.
 *
 * @param {number} receiver_id
 * @param {number} priority
 * @param {'RegMail'|'DeleteAcc'|'Discounts'|'Custom'} type
 * @param {string|null} message
 * @param {Object|null} recipient
 * @returns {Promise<Object>}
 */
const sendNotification = async (receiver_id, priority, type, message = null, recipient = null) => {
    if (!Number.isInteger(receiver_id) || receiver_id < 1) {
        throw new TypeError('receiver_id must be a positive integer');
    }
    if (!Number.isInteger(priority) || priority < -32768 || priority > 32767) {
        throw new TypeError('priority must be a small integer');
    }
    if (!Object.values(NOTIFICATION_TYPES).includes(type)) {
        throw new TypeError(`type must be one of: ${Object.values(NOTIFICATION_TYPES).join(', ')}`);
    }
    if (type === NOTIFICATION_TYPES.CUSTOM && (typeof message !== 'string' || !message.trim())) {
        throw new TypeError('message is required for Custom notifications');
    }
    if (type === NOTIFICATION_TYPES.DISCOUNTS && (typeof message !== 'string' || !message.trim())) {
        throw new TypeError('message is required for Discounts notifications');
    }
    if (message !== null && message !== undefined && typeof message !== 'string') {
        throw new TypeError('message must be a string when provided');
    }

    const task = createEmailTask(
        receiver_id,
        priority,
        type,
        type === NOTIFICATION_TYPES.CUSTOM || type === NOTIFICATION_TYPES.DISCOUNTS ? message : null,
        recipient
    );
    triggerEmailQueue();
    return task;
};

module.exports = {
    NOTIFICATION_TYPES,
    buildEmail,
    sendNotification,
    processEmailQueue,
    startNotificationWorker,
    stopNotificationWorker,
};
