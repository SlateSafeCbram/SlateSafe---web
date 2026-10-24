'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    CLIENT_ERROR,
    SUCCESS_URL,
    allowRequest,
    createCheckoutHandler,
    normalizeItems,
    resetRateLimit,
    sessionParams,
    shippingOption
} = require('./checkout-lib');

const ENV = {
    PRICE_CABLE: 'price_cableTest123',
    PRICE_KIT: 'price_kitTest456'
};

function mockRes() {
    return {
        statusCode: 0,
        headers: {},
        body: '',
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
        },
        end(payload) {
            this.body = payload || '';
        }
    };
}

function handlerWith(stripe, env = ENV) {
    return createCheckoutHandler({
        env,
        now: () => 1_000_000,
        getStripe: async () => stripe
    });
}

async function post(handler, body, extraHeaders = {}) {
    const req = {
        method: 'POST',
        headers: {
            origin: 'https://slatesafe.com',
            'content-type': 'application/json',
            ...extraHeaders
        },
        body
    };
    const res = mockRes();
    await handler(req, res);
    let json = null;
    if (res.body) {
        json = JSON.parse(res.body);
    }
    return { res, json };
}

test('normalizeItems rejects unknown SKUs, bad qty, extra fields, and a third line', () => {
    assert.equal(normalizeItems([{ sku: 'NOPE', qty: 1 }]), null);
    assert.equal(normalizeItems([{ sku: 'CAB-RA20CM-MF-BLK-V1', qty: 0 }]), null);
    assert.equal(normalizeItems([{ sku: 'CAB-RA20CM-MF-BLK-V1', qty: 11 }]), null);
    assert.equal(normalizeItems([{ sku: 'CAB-RA20CM-MF-BLK-V1', qty: 1.5 }]), null);
    assert.equal(normalizeItems([{ sku: 'CAB-RA20CM-MF-BLK-V1', qty: 1, price: 1199 }]), null);
    assert.equal(normalizeItems({ items: [{ sku: 'CAB-RA20CM-MF-BLK-V1', qty: 1 }] }), null);
    assert.equal(normalizeItems([
        { sku: 'CAB-RA20CM-MF-BLK-V1', qty: 1 },
        { sku: 'ENC-SAM-A9-V1', qty: 1 },
        { sku: 'CAB-RA20CM-MF-BLK-V1', qty: 1 }
    ]), null);
});

test('normalizeItems dedupes SKUs and keeps a merged quantity inside 1-10', () => {
    assert.deepEqual(
        normalizeItems([
            { sku: 'CAB-RA20CM-MF-BLK-V1', qty: 2 },
            { sku: 'CAB-RA20CM-MF-BLK-V1', qty: 3 }
        ]),
        [{ sku: 'CAB-RA20CM-MF-BLK-V1', qty: 5 }]
    );
    assert.equal(normalizeItems([
        { sku: 'CAB-RA20CM-MF-BLK-V1', qty: 6 },
        { sku: 'CAB-RA20CM-MF-BLK-V1', qty: 6 }
    ]), null);
});

test('shipping is free when the kit is present and USPS Ground Advantage for cable only', () => {
    const kit = shippingOption([{ sku: 'ENC-SAM-A9-V1', qty: 1 }]);
    assert.equal(kit.shipping_rate_data.display_name, 'Free shipping');
    assert.equal(kit.shipping_rate_data.fixed_amount.amount, 0);
    assert.equal(kit.shipping_rate_data.tax_behavior, 'exclusive');

    const mixed = shippingOption([
        { sku: 'ENC-SAM-A9-V1', qty: 1 },
        { sku: 'CAB-RA20CM-MF-BLK-V1', qty: 2 }
    ]);
    assert.equal(mixed.shipping_rate_data.display_name, 'Free shipping');

    const cable = shippingOption([{ sku: 'CAB-RA20CM-MF-BLK-V1', qty: 2 }]);
    assert.equal(cable.shipping_rate_data.display_name, 'USPS Ground Advantage');
    assert.equal(cable.shipping_rate_data.fixed_amount.amount, 575);
    assert.equal(cable.shipping_rate_data.fixed_amount.currency, 'usd');
});

test('a kit plus two cables builds one session with two line items and automatic tax', () => {
    const items = normalizeItems([
        { sku: 'ENC-SAM-A9-V1', qty: 1 },
        { sku: 'CAB-RA20CM-MF-BLK-V1', qty: 2 }
    ]);
    const params = sessionParams(items, ENV, 'idempotency-key-value');
    assert.equal(params.mode, 'payment');
    assert.equal(params.automatic_tax.enabled, true);
    assert.deepEqual(params.shipping_address_collection.allowed_countries, ['US']);
    assert.equal(params.phone_number_collection.enabled, true);
    assert.equal(params.success_url, SUCCESS_URL);
    assert.equal(params.shipping_options[0].shipping_rate_data.display_name, 'Free shipping');
    assert.equal(params.metadata.source, 'slatesafe-cart');
    assert.equal(params.metadata.cart, 'ENC-SAM-A9-V1:1,CAB-RA20CM-MF-BLK-V1:2');
    assert.equal(params.line_items.length, 2);
    const cable = params.line_items.find((line) => line.price === ENV.PRICE_CABLE);
    const kit = params.line_items.find((line) => line.price === ENV.PRICE_KIT);
    assert.equal(cable.quantity, 2);
    assert.equal(cable.metadata.sku, 'CAB-RA20CM-MF-BLK-V1');
    assert.equal(kit.quantity, 1);
    assert.equal(kit.metadata.sku, 'ENC-SAM-A9-V1');
    assert.equal('payment_method_types' in params, false);
    assert.match(params.integration_identifier, /^slatesafe-cart-[a-z]{8}$/);
});

test('command-deck metadata is source=slatesafe-cart and cart=SKU:qty pairs', () => {
    const deckExample = 'ENC-SAM-A9-V1:1,CAB-RA20CM-MF-BLK-V1:2';
    const fromKitFirst = normalizeItems([
        { sku: 'ENC-SAM-A9-V1', qty: 1 },
        { sku: 'CAB-RA20CM-MF-BLK-V1', qty: 2 }
    ]);
    const fromCableFirst = normalizeItems([
        { sku: 'CAB-RA20CM-MF-BLK-V1', qty: 2 },
        { sku: 'ENC-SAM-A9-V1', qty: 1 }
    ]);
    for (const items of [fromKitFirst, fromCableFirst]) {
        const params = sessionParams(items, ENV, 'deck-contract-key');
        assert.equal(params.metadata.source, 'slatesafe-cart');
        assert.equal(params.metadata.cart, deckExample);
        assert.match(params.metadata.cart, /^(?:[A-Z0-9-]+:[1-9][0-9]?)(?:,[A-Z0-9-]+:[1-9][0-9]?)*$/);
        assert.deepEqual(
            params.line_items.map((line) => line.metadata.sku),
            ['ENC-SAM-A9-V1', 'CAB-RA20CM-MF-BLK-V1']
        );
        assert.equal(params.line_items.every((line) => !Object.prototype.hasOwnProperty.call(line, 'price_data')), true);
    }
});

test('CORS allows only the site origins and POST', async () => {
    resetRateLimit();
    const calls = [];
    const stripe = {
        checkout: {
            sessions: {
                create: async (params) => {
                    calls.push(params);
                    return { url: 'https://checkout.stripe.com/c/pay/cs_test_123' };
                }
            }
        }
    };
    const handler = handlerWith(stripe);

    const ok = await post(handler, [{ sku: 'CAB-RA20CM-MF-BLK-V1', qty: 1 }]);
    assert.equal(ok.res.statusCode, 200);
    assert.equal(ok.res.headers['access-control-allow-origin'], 'https://slatesafe.com');
    assert.equal(ok.json.url, 'https://checkout.stripe.com/c/pay/cs_test_123');

    const www = await post(handler, [{ sku: 'CAB-RA20CM-MF-BLK-V1', qty: 1 }], {
        origin: 'https://www.slatesafe.com'
    });
    assert.equal(www.res.statusCode, 200);
    assert.equal(www.res.headers['access-control-allow-origin'], 'https://www.slatesafe.com');

    const evil = await post(handler, [{ sku: 'CAB-RA20CM-MF-BLK-V1', qty: 1 }], {
        origin: 'https://evil.example'
    });
    assert.equal(evil.res.statusCode, 403);
    assert.equal(evil.res.headers['access-control-allow-origin'], undefined);
    assert.equal(evil.json.error, CLIENT_ERROR);

    const options = mockRes();
    await handler({
        method: 'OPTIONS',
        headers: { origin: 'https://slatesafe.com' }
    }, options);
    assert.equal(options.statusCode, 204);
    assert.equal(options.headers['access-control-allow-methods'], 'POST, OPTIONS');

    const get = mockRes();
    await handler({
        method: 'GET',
        headers: { origin: 'https://slatesafe.com' }
    }, get);
    assert.equal(get.statusCode, 405);
    assert.equal(calls.length, 2);
});

test('the handler rejects a bad cart without calling Stripe and hides Stripe errors', async () => {
    resetRateLimit();
    let called = false;
    const stripe = {
        checkout: {
            sessions: {
                create: async () => {
                    called = true;
                    const error = new Error('No such price: price_secret_detail sk_live_should_not_leak');
                    error.type = 'StripeInvalidRequestError';
                    throw error;
                }
            }
        }
    };
    const handler = handlerWith(stripe);
    const bad = await post(handler, [{ sku: 'NOPE', qty: 1 }]);
    assert.equal(bad.res.statusCode, 400);
    assert.equal(bad.json.error, CLIENT_ERROR);
    assert.equal(JSON.stringify(bad.json).includes('sk_live'), false);
    assert.equal(called, false);

    const boom = await post(handler, [{ sku: 'CAB-RA20CM-MF-BLK-V1', qty: 1 }]);
    assert.equal(boom.res.statusCode, 500);
    assert.equal(boom.json.error, CLIENT_ERROR);
    assert.equal(boom.res.body.includes('sk_live'), false);
    assert.equal(boom.res.body.includes('price_'), false);
});

test('oversized bodies are rejected', async () => {
    resetRateLimit();
    const handler = handlerWith({
        checkout: { sessions: { create: async () => ({ url: 'https://checkout.stripe.com/c/pay/x' }) } }
    });
    const huge = 'x'.repeat(5000);
    const result = await post(handler, huge, { 'content-length': '5000' });
    assert.equal(result.res.statusCode, 413);
});

test('the in-memory token bucket limits one IP', () => {
    resetRateLimit();
    const now = { t: 5_000 };
    let allowed = 0;
    for (let i = 0; i < 12; i += 1) {
        if (allowRequest('203.0.113.5', () => now.t)) allowed += 1;
    }
    assert.equal(allowed, 8);
    now.t += 60_000;
    assert.equal(allowRequest('203.0.113.5', () => now.t), true);
});

test('integration: 1 kit + 2 cables is one session, cable qty 2, free shipping, automatic tax', async () => {
    resetRateLimit();
    const seen = [];
    const stripe = {
        checkout: {
            sessions: {
                create: async (params, options) => {
                    seen.push({ params, options });
                    return { id: 'cs_test_mixed', url: 'https://checkout.stripe.com/c/pay/cs_test_mixed' };
                }
            }
        }
    };
    const handler = handlerWith(stripe);
    const result = await post(handler, [
        { sku: 'ENC-SAM-A9-V1', qty: 1 },
        { sku: 'CAB-RA20CM-MF-BLK-V1', qty: 2 }
    ], { 'idempotency-key': 'cart-kit-1-cable-2' });

    assert.equal(result.res.statusCode, 200);
    assert.equal(seen.length, 1);
    const params = seen[0].params;
    assert.equal(params.automatic_tax.enabled, true);
    assert.equal(params.line_items.length, 2);
    assert.deepEqual(
        params.line_items.find((line) => line.price === ENV.PRICE_CABLE),
        { price: ENV.PRICE_CABLE, quantity: 2, metadata: { sku: 'CAB-RA20CM-MF-BLK-V1' } }
    );
    assert.deepEqual(
        params.line_items.find((line) => line.price === ENV.PRICE_KIT),
        { price: ENV.PRICE_KIT, quantity: 1, metadata: { sku: 'ENC-SAM-A9-V1' } }
    );
    assert.equal(params.shipping_options[0].shipping_rate_data.display_name, 'Free shipping');
    assert.equal(params.shipping_options[0].shipping_rate_data.fixed_amount.amount, 0);
    assert.equal(seen[0].options.idempotencyKey, 'cart-kit-1-cable-2');
    assert.equal(params.line_items.every((line) => !Object.prototype.hasOwnProperty.call(line, 'amount') && !Object.prototype.hasOwnProperty.call(line, 'price_data')), true);
    assert.equal(JSON.stringify(params).includes('11.99'), false);
    assert.equal(JSON.stringify(params).includes('56.00'), false);
});
