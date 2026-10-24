'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const handler = require('./create-checkout-session');

test('Stripe client timeout leaves room for one retry inside maxDuration', () => {
    const options = handler.STRIPE_CLIENT_OPTIONS;
    const attempts = options.maxNetworkRetries + 1;
    assert.equal(options.timeout, 4000);
    assert.equal(options.maxNetworkRetries, 1);
    assert.equal(options.telemetry, false);
    assert.equal(
        options.timeout * attempts + handler.STRIPE_RETRY_DELAY_MS
            <= handler.CHECKOUT_MAX_DURATION_MS,
        true
    );

    const vercel = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'vercel.json'),
        'utf8'
    ));
    assert.equal(
        vercel.functions['api/create-checkout-session.js'].maxDuration * 1000,
        handler.CHECKOUT_MAX_DURATION_MS
    );
});
