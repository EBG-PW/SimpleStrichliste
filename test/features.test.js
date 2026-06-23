const test = require('node:test');
const assert = require('node:assert/strict');

require('module-alias/register');

const { isCoreCompatible, mergeLocalsMapEntries, removeLocalsMapEntries } = require('@lib/features');

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

test('feature locals map entries extend core route keys', () => {
    const mergedLocalsMap = mergeLocalsMapEntries({
        '/settings': ['Settings', 'Error', 'Page', 'Setup', 'Navbar', 'Categories'],
    }, {
        '/settings': ['FoodOrders', 'Error'],
        '/foodorders': ['FoodOrders', 'Navbar'],
    });

    assert.deepEqual(mergedLocalsMap['/settings'], [
        'Settings',
        'Error',
        'Page',
        'Setup',
        'Navbar',
        'Categories',
        'FoodOrders',
    ]);
    assert.deepEqual(mergedLocalsMap['/foodorders'], ['FoodOrders', 'Navbar']);
});

test('feature locals map uninstall removes only feature route keys', () => {
    const localsMap = removeLocalsMapEntries({
        '/settings': ['Settings', 'Error', 'Page', 'Setup', 'Navbar', 'Categories', 'FoodOrders'],
        '/foodorders': ['FoodOrders', 'Error', 'Page', 'Navbar'],
    }, {
        '/settings': ['FoodOrders'],
        '/foodorders': ['FoodOrders', 'Error', 'Page', 'Navbar'],
    });

    assert.deepEqual(localsMap['/settings'], [
        'Settings',
        'Error',
        'Page',
        'Setup',
        'Navbar',
        'Categories',
    ]);
    assert.equal(localsMap['/foodorders'], undefined);
});
