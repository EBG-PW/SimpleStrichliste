const path = require('node:path');

const emailTemplateDir = path.join(__dirname, '..', 'templates', 'email');

module.exports = [
    {
        type: 'RegMail',
        constant: 'REG_MAIL',
        category: 'system',
        channels: {
            email: { templatePath: path.join(emailTemplateDir, 'RegMail.ejs') },
        },
    },
    {
        type: 'DeleteAcc',
        constant: 'DELETE_ACCOUNT',
        category: 'system',
        channels: {
            email: { templatePath: path.join(emailTemplateDir, 'DeleteAcc.ejs') },
        },
    },
    {
        type: 'Custom',
        constant: 'CUSTOM',
        category: 'system',
        requiresMessage: true,
        channels: {
            email: { templatePath: path.join(emailTemplateDir, 'Custom.ejs') },
        },
    },
    {
        type: 'Discounts',
        constant: 'DISCOUNTS',
        category: 'newsletter',
        preferenceKey: 'discount',
        translationKeyBase: 'Settings.DiscountEmails',
        requiresMessage: true,
        channels: {
            email: {
                templatePath: path.join(emailTemplateDir, 'Discounts.ejs'),
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
            },
        },
    },
    {
        type: 'ErrorReport',
        constant: 'ERROR_REPORT',
        category: 'system',
        requiresMessage: true,
        channels: {
            email: {
                templatePath: path.join(emailTemplateDir, 'ErrorReport.ejs'),
                buildContext: (task) => ({
                    errors: JSON.parse(task.custom_message).errors || [],
                }),
                buildText: (context) => [
                    context.t('emails.greeting', { name: context.name }),
                    '',
                    context.t('emails.ErrorReport.body', { count: context.errors.length }),
                    ...context.errors.map((entry) => `[${entry.timestamp}] ${entry.message}`),
                    '',
                    context.domain,
                ].join('\n'),
            },
        },
    },
    {
        type: 'LowStock',
        constant: 'LOW_STOCK',
        category: 'system',
        requiresMessage: true,
        channels: {
            email: {
                templatePath: path.join(emailTemplateDir, 'LowStock.ejs'),
                buildContext: (task) => {
                    const context = JSON.parse(task.custom_message);
                    const estimatedDays = context.trend?.estimatedDaysRemaining;
                    const estimatedDuration = estimatedDays
                        ? `ca. ${estimatedDays} ${estimatedDays === 1 ? 'Tag' : 'Tage'}`
                        : 'Trend unbekannt';
                    return {
                        ...context,
                        itemName: context.item?.name || '',
                        estimatedDuration,
                    };
                },
                buildText: (context) => [
                    context.t('emails.greeting', { name: context.name }),
                    '',
                    context.t('emails.LowStock.body'),
                    `${context.item.name}: ${context.item.stock} / ${context.item.target_stock}`,
                    context.trend?.averagePerDay > 0
                        ? context.t('emails.LowStock.estimateText', {
                            averagePerDay: context.trend.averagePerDay,
                            estimatedDuration: context.estimatedDuration,
                        })
                        : context.t('emails.LowStock.noTrendText'),
                    '',
                    context.domain,
                ].join('\n'),
            },
        },
    },
];
