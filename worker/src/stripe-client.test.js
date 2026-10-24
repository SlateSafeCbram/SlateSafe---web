import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CHECKOUT_MAX_DURATION_MS,
    STRIPE_CLIENT_OPTIONS,
    STRIPE_RETRY_DELAY_MS,
    createStripeClient
} from './index.js';

test('Stripe client uses fetch, a 4s timeout, and one retry inside a 10s budget', () => {
    const options = STRIPE_CLIENT_OPTIONS;
    const attempts = options.maxNetworkRetries + 1;
    assert.equal(options.apiVersion, '2026-09-30.endive');
    assert.equal(options.timeout, 4000);
    assert.equal(options.maxNetworkRetries, 1);
    assert.equal(options.telemetry, false);
    assert.equal(
        options.timeout * attempts + STRIPE_RETRY_DELAY_MS <= CHECKOUT_MAX_DURATION_MS,
        true
    );

    const client = createStripeClient('unit-test-key');
    assert.equal(client.getApiField('timeout'), 4000);
    assert.equal(client.getApiField('maxNetworkRetries'), 1);
    assert.equal(client.getTelemetryEnabled(), false);
    assert.equal(client.getApiField('httpClient').constructor.name, 'FetchHttpClient');
});
