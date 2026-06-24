const test = require('node:test');
const assert = require('node:assert/strict');

require('module-alias/register');

const { getIpOfRequest } = require('@lib/utils');

const originalProxy = process.env.PROXY;
const originalLog = process.log;

const withProxyEnv = (proxy, callback) => {
    process.env.PROXY = proxy;

    const warnings = [];
    process.log = {
        warn(message) {
            warnings.push(message);
        }
    };

    try {
        const result = callback(warnings);
        return { result, warnings };
    } finally {
        if (originalProxy === undefined) {
            delete process.env.PROXY;
        } else {
            process.env.PROXY = originalProxy;
        }
        process.log = originalLog;
    }
};

test('uses proxy header even when proxy env is disabled and warns clearly', () => {
    const { result, warnings } = withProxyEnv('none', () => {
        return getIpOfRequest({
            ip: '10.0.0.1',
            headers: {
                'x-forwarded-for': '203.0.113.10, 10.0.0.1'
            }
        });
    });

    assert.equal(result, '203.0.113.10');
    assert.ok(warnings.some((message) => message.includes('PROXY=none')));
    assert.ok(warnings.some((message) => message.includes('Using first X-Forwarded-For IP anyway')));
});

test('falls back to X-Forwarded-For when Cloudflare env misses Cloudflare header', () => {
    const { result, warnings } = withProxyEnv('cf', () => {
        return getIpOfRequest({
            ip: '10.0.0.1',
            headers: {
                'x-forwarded-for': '203.0.113.11'
            }
        });
    });

    assert.equal(result, '203.0.113.11');
    assert.ok(warnings.some((message) => message.includes('PROXY includes "cf" but CF-Connecting-IP is missing')));
    assert.ok(warnings.some((message) => message.includes('Using first X-Forwarded-For IP as fallback')));
});

test('prefers Cloudflare header when proxy setting includes Cloudflare and internal proxy', () => {
    const { result, warnings } = withProxyEnv('cf,proxy', () => {
        return getIpOfRequest({
            ip: '10.0.0.1',
            headers: {
                'cf-connecting-ip': '203.0.113.12',
                'x-forwarded-for': '203.0.113.13'
            }
        });
    });

    assert.equal(result, '203.0.113.12');
    assert.equal(warnings.length, 0);
});

test('warns when Cloudflare plus internal proxy chain lacks X-Forwarded-For', () => {
    const { result, warnings } = withProxyEnv('cf,proxy', () => {
        return getIpOfRequest({
            ip: '10.0.0.1',
            headers: {
                'cf-connecting-ip': '203.0.113.14'
            }
        });
    });

    assert.equal(result, '203.0.113.14');
    assert.ok(warnings.some((message) => message.includes('PROXY=cf,proxy expects an internal proxy after Cloudflare')));
});
