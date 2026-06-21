const test = require('node:test');
const assert = require('node:assert/strict');

require('module-alias/register');
process.log = process.log || {
    info() {},
    error() {},
};

const { InvalidRouteInput } = require('@lib/errors');
const errorHandler = require('@middleware/errorhandler');

const handleError = (error) => {
    let responseBody;
    let statusCode;
    const response = {
        status(code) {
            statusCode = code;
            return this;
        },
        header() {
            return this;
        },
        json(body) {
            responseBody = body;
            return this;
        },
    };

    errorHandler(error, {
        method: 'POST',
        url: '/api/v1/items',
        headers: { accept: 'application/json' },
    }, response, () => {});

    return { responseBody, statusCode };
};

test('custom errors do not include a translation key by default', () => {
    const { responseBody, statusCode } = handleError(
        new InvalidRouteInput('Invalid input').withBackUrl('none')
    );

    assert.equal(statusCode, 400);
    assert.equal(Object.hasOwn(responseBody, 'translationKey'), false);
});

test('custom errors can attach a translation key without changing the API message', () => {
    const { responseBody, statusCode } = handleError(
        new InvalidRouteInput('Invalid discount configuration')
            .withBackUrl('none')
            .setTranslationKey('Items.Response.DiscountFieldsRequired')
    );

    assert.equal(statusCode, 400);
    assert.deepEqual(responseBody, {
        message: 'Invalid discount configuration',
        info: 'Validation returned empty or wrong data',
        reason: 'Invalid Route Input',
        translationKey: 'Items.Response.DiscountFieldsRequired',
    });
});
