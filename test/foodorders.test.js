const test = require('node:test');
const assert = require('node:assert/strict');

require('module-alias/register');

const { canTransitionOrderItemStatus } = require('@lib/sqlite/foodorders');

test('food order item statuses only move forward', () => {
    assert.equal(canTransitionOrderItemStatus('requested', 'ordered'), true);
    assert.equal(canTransitionOrderItemStatus('requested', 'completed'), false);
    assert.equal(canTransitionOrderItemStatus('ordered', 'requested'), false);
    assert.equal(canTransitionOrderItemStatus('ordered', 'completed'), true);
});

test('terminal and charged food order items cannot change status', () => {
    assert.equal(canTransitionOrderItemStatus('completed', 'ordered'), false);
    assert.equal(canTransitionOrderItemStatus('completed', 'missing'), false);
    assert.equal(canTransitionOrderItemStatus('missing', 'ordered'), false);
    assert.equal(canTransitionOrderItemStatus('cancelled', 'requested'), false);
    assert.equal(canTransitionOrderItemStatus('ordered', 'completed', '2026-06-23 00:00:00'), false);
});
