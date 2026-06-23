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
];
