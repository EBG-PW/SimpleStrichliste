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
    registerNotificationType,
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

registerNotificationType({
    type: 'FeatureMail',
    constant: 'FEATURE_MAIL',
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
    requiresMessage: true,
    buildContext: (task) => ({
        featureValue: JSON.parse(task.custom_message).value,
    }),
    buildText: (context) => `${context.name}: ${context.featureValue}`,
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
