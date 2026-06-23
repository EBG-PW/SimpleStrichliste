const test = require('node:test');
const assert = require('node:assert/strict');

require('module-alias/register');

const { isCoreCompatible } = require('@lib/features');

test('features accept compatible minimum core versions', () => {
    assert.equal(isCoreCompatible({
        name: 'compatible',
        version: '1.0.0',
        minCoreVersion: '0.3.0',
    }), true);
});

test('features reject newer minimum core versions', () => {
    assert.equal(isCoreCompatible({
        name: 'future-feature',
        version: '1.0.0',
        minCoreVersion: '999.0.0',
    }), false);
});
