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
const { deepMerge } = require('@lib/utils');

const NOTIFICATION_TYPES = {
    REG_MAIL: 'RegMail',
    DELETE_ACCOUNT: 'DeleteAcc',
    DISCOUNTS: 'Discounts',
    CUSTOM: 'Custom',
};

const RETRY_INTERVAL_MS = 5 * 60 * 1000;
const EMAIL_TEMPLATE_DIR = path.join(__dirname, '..', 'config', 'templates', 'email');
const EMAIL_LOCALE_DIR = path.join(EMAIL_TEMPLATE_DIR, 'locales');
const notificationTypes = new Map();
let workerTimer = null;
let processingPromise = null;
let transporter = null;
let emailI18nPromise = null;
let emailResources = null;

/**
 * Registers a notification type. Features may call this while their module is loaded.
 *
 * @param {Object} definition
 * @param {String} definition.type Queue type stored in email_tasks.type.
 * @param {String} definition.templatePath Absolute path or application-root-relative EJS path.
 * @param {Object.<String, Object>} [definition.translations] Translation trees keyed by language.
 * @param {Boolean} [definition.requiresMessage=false] Whether a non-empty queued message is required.
 * @param {Function} [definition.buildContext] Converts the queued task into extra EJS/i18n context.
 * @param {Function} [definition.buildText] Builds the plain-text body from the final context.
 * @param {String} [definition.constant] Optional NOTIFICATION_TYPES property for callers.
 * @param {Boolean} [definition.replace=false] Allows replacing an existing registration.
 * @returns {String} Registered type.
 */
const registerNotificationType = (definition) => {
    if (!definition || typeof definition !== 'object') {
        throw new TypeError('notification definition must be an object');
    }

    const type = definition.type;
    if (typeof type !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(type)) {
        throw new TypeError('notification type must contain only letters, numbers, underscores, or hyphens');
    }
    if (notificationTypes.has(type) && definition.replace !== true) {
        throw new Error(`Notification type is already registered: ${type}`);
    }

    const templatePath = path.isAbsolute(definition.templatePath || '')
        ? definition.templatePath
        : path.resolve(__dirname, '..', definition.templatePath || '');
    if (!fs.existsSync(templatePath) || path.extname(templatePath).toLowerCase() !== '.ejs') {
        throw new Error(`Notification template not found or not EJS: ${templatePath}`);
    }
    if (definition.translations !== undefined &&
        (!definition.translations || typeof definition.translations !== 'object' || Array.isArray(definition.translations))) {
        throw new TypeError('notification translations must be an object keyed by language');
    }
    if (definition.buildContext !== undefined && typeof definition.buildContext !== 'function') {
        throw new TypeError('buildContext must be a function');
    }
    if (definition.buildText !== undefined && typeof definition.buildText !== 'function') {
        throw new TypeError('buildText must be a function');
    }
    if (definition.constant && !/^[A-Z][A-Z0-9_]*$/.test(definition.constant)) {
        throw new TypeError('notification constant must use uppercase letters, numbers, and underscores');
    }
    if (definition.constant &&
        NOTIFICATION_TYPES[definition.constant] &&
        NOTIFICATION_TYPES[definition.constant] !== type &&
        definition.replace !== true) {
        throw new Error(`Notification constant is already registered: ${definition.constant}`);
    }

    notificationTypes.set(type, {
        type,
        templatePath,
        translations: definition.translations || {},
        requiresMessage: definition.requiresMessage === true,
        buildContext: definition.buildContext || (() => ({})),
        buildText: definition.buildText || null,
    });

    if (definition.constant) {
        NOTIFICATION_TYPES[definition.constant] = type;
    }

    emailResources = null;
    emailI18nPromise = null;
    return type;
};

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

    notificationTypes.forEach((definition) => {
        Object.entries(definition.translations).forEach(([language, translation]) => {
            if (!emailResources[language]) emailResources[language] = { translation: {} };
            deepMerge(emailResources[language].translation, translation);
        });
    });
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
    const definition = notificationTypes.get(task.type);
    if (!definition) throw new TypeError(`Unsupported notification type: ${task.type}`);

    const i18n = await getEmailI18n();
    const fallbackLanguage = getFallbackLanguage();
    const language = task.language && i18n.hasResourceBundle(task.language, 'translation')
        ? task.language
        : fallbackLanguage;
    const t = i18n.getFixedT(language);
    const extraContext = await definition.buildContext(task);
    const context = {
        name: task.name,
        username: task.username,
        email: task.email,
        uuid: task.uuid,
        application: process.env.APPLICATION || 'SimpleStrichliste',
        domain: process.env.DOMAIN || '',
        message: task.custom_message || '',
        language,
        t,
        ...(extraContext || {}),
    };
    const html = await ejs.renderFile(definition.templatePath, context);
    const text = definition.buildText
        ? await definition.buildText(context, task)
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
 * @param {string} type
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

    const definition = notificationTypes.get(type);
    if (!definition) {
        throw new TypeError(`type must be one of: ${[...notificationTypes.keys()].join(', ')}`);
    }
    if (definition.requiresMessage && (typeof message !== 'string' || !message.trim())) {
        throw new TypeError(`message is required for ${type} notifications`);
    }
    if (message !== null && message !== undefined && typeof message !== 'string') {
        throw new TypeError('message must be a string when provided');
    }

    const task = createEmailTask(receiver_id, priority, type, message, recipient);
    triggerEmailQueue();
    return task;
};

// Register Core Application Notification Types

registerNotificationType({
    type: NOTIFICATION_TYPES.REG_MAIL,
    templatePath: path.join(EMAIL_TEMPLATE_DIR, 'RegMail.ejs'),
});

registerNotificationType({
    type: NOTIFICATION_TYPES.DELETE_ACCOUNT,
    templatePath: path.join(EMAIL_TEMPLATE_DIR, 'DeleteAcc.ejs'),
});

registerNotificationType({
    type: NOTIFICATION_TYPES.CUSTOM,
    templatePath: path.join(EMAIL_TEMPLATE_DIR, 'Custom.ejs'),
    requiresMessage: true,
});

registerNotificationType({
    type: NOTIFICATION_TYPES.DISCOUNTS,
    templatePath: path.join(EMAIL_TEMPLATE_DIR, 'Discounts.ejs'),
    requiresMessage: true,
    buildContext: (task) => ({
        discountItems: JSON.parse(task.custom_message).items || [],
    }),
    buildText: (context) => [
        context.t('emails.greeting', { name: context.name }),
        '',
        context.t('emails.Discounts.body'),
        ...context.discountItems.map((item) =>
            `${item.name}: ${Number(item.discount_price).toFixed(2)} € ` +
            `(${context.t('emails.Discounts.until', {
                date: new Date(item.discount_until).toLocaleString(context.language),
            })})`
        ),
        '',
        context.domain,
    ].join('\n'),
});

module.exports = {
    NOTIFICATION_TYPES,
    registerNotificationType,
    buildEmail,
    sendNotification,
    processEmailQueue,
    startNotificationWorker,
    stopNotificationWorker,
};
