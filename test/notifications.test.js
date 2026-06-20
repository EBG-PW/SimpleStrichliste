const test = require('node:test');
const assert = require('node:assert/strict');

require('module-alias/register');
process.log = process.log || {
    info() {},
    error() {},
};

const {
    buildEmail,
    sendNotification,
} = require('@lib/notifications');

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
