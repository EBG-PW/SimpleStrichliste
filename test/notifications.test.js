const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

require('module-alias/register');
process.log = process.log || {
    info() {},
    error() {},
};

const {
    buildEmail,
    NOTIFICATION_CATEGORIES,
    getNewsletterNotifications,
    isPermanentEmailError,
    isSmtpAuthRateLimitError,
    registerNotification,
    sendNotification,
} = require('@lib/notifications');

const featureTemplateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simplestrichliste-notification-'));
const featureTemplatePath = path.join(featureTemplateDir, 'FeatureMail.ejs');
fs.writeFileSync(featureTemplatePath, `<!doctype html>
<html lang="<%= language %>">
<body>
    <h1><%= t('emails.FeatureMail.heading') %></h1>
    <p><%= t('emails.greeting', { name }) %></p>
    <p><%= featureValue %></p>
</body>
</html>`);

test.after(() => {
    fs.rmSync(featureTemplateDir, { recursive: true, force: true });
});

registerNotification({
    type: 'FeatureMail',
    constant: 'FEATURE_MAIL',
    category: NOTIFICATION_CATEGORIES.NEWSLETTER,
    preferenceKey: 'feature-mail',
    translationKeyBase: 'Feature.Notifications.Mail',
    requiresMessage: true,
    channels: {
        email: {
            templatePath: featureTemplatePath,
            translations: {
                de: {
                    emails: {
                        FeatureMail: {
                            subject: 'Feature-Benachrichtigung',
                            heading: 'Feature-Nachricht',
                        },
                    },
                },
            },
            buildContext: (task) => ({
                featureValue: JSON.parse(task.custom_message).value,
            }),
            buildText: (context) => `${context.name}: ${context.featureValue}`,
        },
    },
});

test('buildEmail renders localized EJS for custom notifications', async () => {
    const email = await buildEmail({
        type: 'Custom',
        name: 'Ada',
        username: 'ada',
        email: 'ada@example.com',
        uuid: 'test-uuid',
        language: 'de',
        custom_message: '<strong>Test</strong>',
    });

    assert.equal(email.to, 'ada@example.com');
    assert.match(email.subject, /Benachrichtigung/);
    assert.match(email.text, /Hallo Ada/);
    assert.match(email.html, /&lt;strong&gt;Test&lt;\/strong&gt;/);
});

test('buildEmail renders registration and deletion confirmations', async () => {
    const baseTask = {
        name: 'Ada',
        username: 'ada',
        email: 'ada@example.com',
        uuid: 'test-uuid',
        language: 'de',
        custom_message: null,
    };

    const registrationEmail = await buildEmail({
        ...baseTask,
        type: 'RegMail',
    });
    const deletionEmail = await buildEmail({
        ...baseTask,
        type: 'DeleteAcc',
    });

    assert.match(registrationEmail.subject, /Willkommen/);
    assert.match(registrationEmail.html, /registriert/);
    assert.match(deletionEmail.subject, /Konto/);
    assert.match(deletionEmail.html, /gel(?:ö|Ã¶)scht/);
});

test('buildEmail renders selected discounts', async () => {
    const email = await buildEmail({
        type: 'Discounts',
        name: 'Ada',
        username: 'ada',
        email: 'ada@example.com',
        uuid: 'test-uuid',
        language: 'de',
        custom_message: JSON.stringify({
            items: [{
                name: 'Testartikel',
                original_price: 2.5,
                discount_price: 1.5,
                discount_until: '2030-01-01T12:00:00.000Z',
            }],
        }),
    });

    assert.match(email.subject, /Angebote/);
    assert.match(email.html, /Testartikel/);
    assert.match(email.html, /1\.50/);
    assert.match(email.html, /<a href="(?:https?:\/\/[^"]+)?\/settings">Einstellungen<\/a>/);
    assert.doesNotMatch(email.html, /&lt;a href=|Settings\.Settings/);
});

test('buildEmail formats discount dates in application timezone', async () => {
    const previousTimeZone = process.env.APPLICATION_TIMEZONE;
    process.env.APPLICATION_TIMEZONE = 'Europe/Berlin';
    const discountUntil = '2030-01-01T12:00:00.000Z';
    const expectedDate = new Intl.DateTimeFormat('de', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Europe/Berlin',
    }).format(new Date(discountUntil));

    try {
        const email = await buildEmail({
            type: 'Discounts',
            name: 'Ada',
            username: 'ada',
            email: 'ada@example.com',
            uuid: 'test-uuid',
            language: 'de',
            custom_message: JSON.stringify({
                items: [{
                    name: 'Testartikel',
                    original_price: 2.5,
                    discount_price: 1.5,
                    discount_until: discountUntil,
                }],
            }),
        });

        assert.equal(email.html.includes(expectedDate), true);
        assert.equal(email.text.includes(expectedDate), true);
    } finally {
        if (previousTimeZone === undefined) delete process.env.APPLICATION_TIMEZONE;
        else process.env.APPLICATION_TIMEZONE = previousTimeZone;
    }
});

test('email HTML translations escape interpolated values', async () => {
    const previousApplication = process.env.APPLICATION;
    const previousDomain = process.env.DOMAIN;
    process.env.APPLICATION = '<script>alert("application")</script>';
    process.env.DOMAIN = 'https://example.com/" onclick="alert(1)';

    try {
        const email = await buildEmail({
            type: 'Discounts',
            name: 'Ada',
            username: 'ada',
            email: 'ada@example.com',
            uuid: 'test-uuid',
            language: 'de',
            custom_message: JSON.stringify({ items: [] }),
        });

        assert.doesNotMatch(email.html, /<script>|onclick="/);
        assert.match(email.html, /&lt;script&gt;/);
        assert.match(email.html, /&quot; onclick=&quot;/);
    } finally {
        if (previousApplication === undefined) delete process.env.APPLICATION;
        else process.env.APPLICATION = previousApplication;
        if (previousDomain === undefined) delete process.env.DOMAIN;
        else process.env.DOMAIN = previousDomain;
    }
});

test('features can register notification types, templates, and translations', async () => {
    const email = await buildEmail({
        type: 'FeatureMail',
        name: 'Ada',
        username: 'ada',
        email: 'ada@example.com',
        uuid: 'test-uuid',
        language: 'de',
        custom_message: JSON.stringify({ value: 'Feature payload' }),
    });

    assert.equal(email.subject, 'Feature-Benachrichtigung');
    assert.equal(email.text, 'Ada: Feature payload');
    assert.match(email.html, /Feature-Nachricht/);
    assert.match(email.html, /Feature payload/);
    assert.deepEqual(
        getNewsletterNotifications().find((notification) => notification.type === 'FeatureMail'),
        {
            type: 'FeatureMail',
            key: 'feature-mail',
            channel: 'email',
            translationKeyBase: 'Feature.Notifications.Mail',
        }
    );
});

test('sendNotification rejects unsupported types', async () => {
    await assert.rejects(
        sendNotification(1, 0, 'Unknown'),
        /type must be one of/
    );
});

test('sendNotification requires a message for Custom notifications', async () => {
    await assert.rejects(
        sendNotification(1, 0, 'Custom', '  '),
        /message is required/
    );
});

test('sendNotification validates small integer priority', async () => {
    await assert.rejects(
        sendNotification(1, 32768, 'RegMail'),
        /priority must be a small integer/
    );
});

test('SMTP authentication errors are permanent and must not be retried', () => {
    assert.equal(isPermanentEmailError({ code: 'EAUTH' }), true);
    assert.equal(isPermanentEmailError({ responseCode: 535 }), true);
    assert.equal(isSmtpAuthRateLimitError(new Error('Invalid login: 535 Too many failed logins')), true);
    assert.equal(isPermanentEmailError(new Error('Connection timed out')), false);
});
