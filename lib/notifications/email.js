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
    markEmailTaskPermanentlyFailed,
} = require('@lib/sqlite/emailTasks');
const { deepMerge } = require('@lib/utils');

const RETRY_INTERVAL_MS = 5 * 60 * 1000;
const EMAIL_TEMPLATE_DIR = path.join(__dirname, '..', '..', 'config', 'templates', 'email');
const EMAIL_LOCALE_DIR = path.join(EMAIL_TEMPLATE_DIR, 'locales');
const emailNotifications = new Map();
let workerTimer = null;
let processingPromise = null;
let transporter = null;
let emailI18nPromise = null;
let emailResources = null;

const registerEmailNotification = (notificationType, definition, replace = false) => {
    if (emailNotifications.has(notificationType) && !replace) {
        throw new Error(`Email notification is already registered: ${notificationType}`);
    }

    const templatePath = path.isAbsolute(definition.templatePath || '')
        ? definition.templatePath
        : path.resolve(__dirname, '..', '..', definition.templatePath || '');
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

    emailNotifications.set(notificationType, {
        templatePath,
        translations: definition.translations || {},
        buildContext: definition.buildContext || (() => ({})),
        buildText: definition.buildText || null,
    });
    emailResources = null;
    emailI18nPromise = null;
};

const loadEmailResources = () => {
    if (emailResources) return emailResources;

    emailResources = {};
    const loadLocaleDirectory = (directory) => {
        fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                loadLocaleDirectory(entryPath);
                return;
            }
            if (!entry.name.endsWith('.json')) return;

            const language = path.basename(entry.name, '.json');
            const translation = JSON.parse(fs.readFileSync(entryPath, 'utf8'));
            if (!emailResources[language]) emailResources[language] = { translation: {} };
            deepMerge(emailResources[language].translation, translation);
        });
    };
    loadLocaleDirectory(EMAIL_LOCALE_DIR);

    emailNotifications.forEach((definition) => {
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
            interpolation: { escapeValue: false },
        }).then(() => instance);
    }
    return emailI18nPromise;
};

const createTransporter = () => {
    if (!process.env.SMTP_HOST) throw new Error('SMTP_HOST is not configured');

    const port = Number.parseInt(process.env.SMTP_PORT || '587', 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('SMTP_PORT must be a valid TCP port');
    }

    const options = {
        host: process.env.SMTP_HOST,
        port,
        secure: process.env.SMTP_SECURE === 'true' || port === 465,
        pool: true,
        maxConnections: Number.parseInt(process.env.SMTP_POOL_MAX_CONNECTIONS || '1', 10),
        maxMessages: Number.parseInt(process.env.SMTP_POOL_MAX_MESSAGES || '1000', 10),
    };
    if (!Number.isInteger(options.maxConnections) || options.maxConnections < 1) {
        throw new Error('SMTP_POOL_MAX_CONNECTIONS must be a positive integer');
    }
    if (!Number.isInteger(options.maxMessages) || options.maxMessages < 1) {
        throw new Error('SMTP_POOL_MAX_MESSAGES must be a positive integer');
    }
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
    const definition = emailNotifications.get(task.type);
    if (!definition) throw new TypeError(`Unsupported email notification: ${task.type}`);

    const i18n = await getEmailI18n();
    const fallbackLanguage = getFallbackLanguage();
    const language = task.language && i18n.hasResourceBundle(task.language, 'translation')
        ? task.language
        : fallbackLanguage;
    const t = i18n.getFixedT(language);
    const escapeHtml = (value) => String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    const tHtml = (key, options = {}) => t(key, {
        ...options,
        interpolation: {
            ...options.interpolation,
            escapeValue: true,
            escape: escapeHtml,
        },
    });
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
        tHtml,
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

const queueEmail = (receiverId, priority, type, message, recipient) => {
    const task = createEmailTask(receiverId, priority, type, message, recipient);
    triggerEmailQueue();
    return task;
};

const getMaxRetries = () => {
    const configured = Number.parseInt(process.env.EMAIL_MAX_RETRIES || '5', 10);
    return Number.isInteger(configured) && configured > 0 ? configured : 5;
};

const isPermanentEmailError = (error) => {
    const responseCode = Number(error?.responseCode);
    const message = String(error?.message || error || '');
    return error?.code === 'EAUTH' ||
        responseCode === 535 ||
        /invalid login|authentication failed/i.test(message);
};

const isSmtpAuthRateLimitError = (error) =>
    /too many failed logins/i.test(String(error?.message || error || ''));

const processEmailQueue = () => {
    if (processingPromise) return processingPromise;

    processingPromise = (async () => {
        const tasks = getSendableEmailTasks(getMaxRetries());
        for (const task of tasks) {
            try {
                const email = await buildEmail(task);
                await getTransporter().sendMail(email);
                markEmailTaskSent(task.id);
                process.log?.info?.(
                    `Email Task ${task.id} of type ${task.type} sent to ${task.email} (${task.username}, ${task.user_id})`
                );
            } catch (error) {
                if (isSmtpAuthRateLimitError(error)) {
                    markEmailTaskFailed(task.id, error?.message || error);
                } else if (isPermanentEmailError(error)) {
                    markEmailTaskPermanentlyFailed(task.id, error?.message || error, getMaxRetries());
                } else {
                    markEmailTaskFailed(task.id, error?.message || error);
                }
                process.log?.error?.(`Email task ${task.id} failed: ${error?.message || error}`);
                if (isPermanentEmailError(error) || isSmtpAuthRateLimitError(error)) break;
            }
        }
    })().finally(() => {
        processingPromise = null;
    });
    return processingPromise;
};

function triggerEmailQueue() {
    setImmediate(() => {
        void processEmailQueue().catch((error) => {
            process.log?.error?.(`Email queue worker failed: ${error?.message || error}`);
        });
    });
}

const startEmailWorker = () => {
    if (workerTimer) return workerTimer;
    workerTimer = setInterval(triggerEmailQueue, RETRY_INTERVAL_MS);
    workerTimer.unref?.();
    triggerEmailQueue();
    return workerTimer;
};

const stopEmailWorker = () => {
    if (workerTimer) {
        clearInterval(workerTimer);
        workerTimer = null;
    }
    transporter?.close?.();
    transporter = null;
};

module.exports = {
    EMAIL_TEMPLATE_DIR,
    registerEmailNotification,
    buildEmail,
    queueEmail,
    isPermanentEmailError,
    isSmtpAuthRateLimitError,
    processEmailQueue,
    startEmailWorker,
    stopEmailWorker,
};
