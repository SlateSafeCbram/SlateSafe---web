import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    BUY_SUCCESS_URL,
    CLIENT_ERROR,
    SUCCESS_URL,
    checkoutSource,
    createCheckoutHandler,
    normalizeItems,
    sessionParams,
    shippingOption
} from './checkout.js';

const PRICE_CABLE = 'price_cableTest123';
const PRICE_KIT = 'price_kitTest456';

function envWith(limiter, extra = {}) {
    return {
        PRICE_CABLE,
        PRICE_KIT,
        CHECKOUT_RATE_LIMITER: limiter,
        ...extra
    };
}

function allowLimiter(calls) {
    return {
        async limit({ key }) {
            if (calls) calls.push(key);
            return { success: true };
        }
    };
}

function makeHandler(stripe, limiter = allowLimiter()) {
    const seen = [];
    const binding = limiter || allowLimiter(seen);
    return {
        handler: createCheckoutHandler({
            getStripe: async () => stripe
        }),
        env: envWith(binding),
        seen
    };
}

async function post(handler, env, body, extraHeaders = {}, method = 'POST', requestUrl) {
    const headers = new Headers({
        origin: 'https://slatesafe.com',
        'content-type': 'application/json',
        'cf-connecting-ip': '203.0.113.5',
        ...extraHeaders
    });
    const init = { method, headers };
    if (method !== 'GET' && method !== 'OPTIONS') {
        init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const request = new Request(requestUrl || 'https://slatesafe-checkout-test.slatesafe.workers.dev/', init);
    const response = await handler(request, env);
    const text = await response.text();
    let json = null;
    if (text) json = JSON.parse(text);
    return { response, json, text };
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

test('a kit plus two cables builds one session with two line items and automatic tax', async () => {
    const items = normalizeItems([
        { sku: 'ENC-SAM-A9-V1', qty: 1 },
        { sku: 'CAB-RA20CM-MF-BLK-V1', qty: 2 }
    ]);
    const params = await sessionParams(items, envWith(allowLimiter()), 'idempotency-key-value');
    assert.equal(params.mode, 'payment');
    assert.equal(params.automatic_tax.enabled, true);
    assert.deepEqual(params.shipping_address_collection.allowed_countries, ['US']);
    assert.equal(params.phone_number_collection.enabled, true);
    assert.equal(params.success_url, SUCCESS_URL);
    assert.equal(Object.prototype.hasOwnProperty.call(params.metadata, 'checkout'), false);
    assert.equal(params.shipping_options[0].shipping_rate_data.display_name, 'Free shipping');
    assert.equal(params.metadata.source, 'slatesafe-cart');
    assert.equal(params.metadata.cart, 'ENC-SAM-A9-V1:1,CAB-RA20CM-MF-BLK-V1:2');
    assert.equal(params.line_items.length, 2);
    const cable = params.line_items.find((line) => line.price === PRICE_CABLE);
    const kit = params.line_items.find((line) => line.price === PRICE_KIT);
    assert.equal(cable.quantity, 2);
    assert.equal(cable.metadata.sku, 'CAB-RA20CM-MF-BLK-V1');
    assert.equal(kit.quantity, 1);
    assert.equal(kit.metadata.sku, 'ENC-SAM-A9-V1');
    assert.equal('payment_method_types' in params, false);
    assert.match(params.integration_identifier, /^slatesafe-cart-[a-z]{8}$/);
});

test('command-deck metadata is source=slatesafe-cart and cart=SKU:qty pairs', async () => {
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
        const params = await sessionParams(items, envWith(allowLimiter()), 'deck-contract-key');
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
    const { handler, env } = makeHandler(stripe);

    const ok = await post(handler, env, [{ sku: 'CAB-RA20CM-MF-BLK-V1', qty: 1 }]);
    assert.equal(ok.response.status, 200);
    assert.equal(ok.response.headers.get('access-control-allow-origin'), 'https://slatesafe.com');
    assert.equal(ok.json.url, 'https://checkout.stripe.com/c/pay/cs_test_123');

    const www = await post(handler, env, [{ sku: 'CAB-RA20CM-MF-BLK-V1', qty: 1 }], {
        origin: 'https://www.slatesafe.com'
    });
    assert.equal(www.response.status, 200);
    assert.equal(www.response.headers.get('access-control-allow-origin'), 'https://www.slatesafe.com');

    const evil = await post(handler, env, [{ sku: 'CAB-RA20CM-MF-BLK-V1', qty: 1 }], {
        origin: 'https://evil.example'
    });
    assert.equal(evil.response.status, 403);
    assert.equal(evil.response.headers.get('access-control-allow-origin'), null);
    assert.equal(evil.json.error, CLIENT_ERROR);

    const options = await post(handler, env, null, {}, 'OPTIONS');
    assert.equal(options.response.status, 204);
    assert.equal(options.response.headers.get('access-control-allow-methods'), 'POST, OPTIONS');

    const get = await post(handler, env, null, {}, 'GET');
    assert.equal(get.response.status, 405);
    assert.equal(calls.length, 2);
});

test('the handler rejects a bad cart without calling Stripe and hides Stripe errors', async () => {
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
    const { handler, env } = makeHandler(stripe);
    const bad = await post(handler, env, [{ sku: 'NOPE', qty: 1 }]);
    assert.equal(bad.response.status, 400);
    assert.equal(bad.json.error, CLIENT_ERROR);
    assert.equal(JSON.stringify(bad.json).includes('sk_live'), false);
    assert.equal(called, false);

    const boom = await post(handler, env, [{ sku: 'CAB-RA20CM-MF-BLK-V1', qty: 1 }]);
    assert.equal(boom.response.status, 500);
    assert.equal(boom.json.error, CLIENT_ERROR);
    assert.equal(boom.text.includes('sk_live'), false);
    assert.equal(boom.text.includes('price_'), false);
});

test('oversized bodies are rejected', async () => {
    const { handler, env } = makeHandler({
        checkout: { sessions: { create: async () => ({ url: 'https://checkout.stripe.com/c/pay/x' }) } }
    });
    const huge = 'x'.repeat(5000);
    const result = await post(handler, env, huge, { 'content-length': '5000' });
    assert.equal(result.response.status, 413);
});

test('a stream larger than 4096 bytes is rejected when content-length is absent', async () => {
    let called = false;
    const { handler, env } = makeHandler({
        checkout: {
            sessions: {
                create: async () => {
                    called = true;
                    return { url: 'https://checkout.stripe.com/c/pay/x' };
                }
            }
        }
    });
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode('x'.repeat(5000)));
            controller.close();
        }
    });
    const request = new Request('https://slatesafe-checkout-test.slatesafe.workers.dev/', {
        method: 'POST',
        headers: {
            origin: 'https://slatesafe.com',
            'content-type': 'application/json',
            'cf-connecting-ip': '203.0.113.5'
        },
        body: stream,
        duplex: 'half'
    });
    const response = await handler(request, env);
    assert.equal(response.status, 413);
    assert.equal(called, false);
});

test('the rate-limit binding keys on CF-Connecting-IP and fails closed', async () => {
    let called = false;
    const stripe = {
        checkout: {
            sessions: {
                create: async () => {
                    called = true;
                    return { url: 'https://checkout.stripe.com/c/pay/cs_test_ok' };
                }
            }
        }
    };
    const keys = [];
    const limited = createCheckoutHandler({ getStripe: async () => stripe });
    const limitedEnv = envWith({
        async limit({ key }) {
            keys.push(key);
            return { success: false };
        }
    });
    const denied = await post(limited, limitedEnv, [{ sku: 'CAB-RA20CM-MF-BLK-V1', qty: 1 }]);
    assert.equal(denied.response.status, 429);
    assert.deepEqual(keys, ['203.0.113.5']);
    assert.equal(called, false);

    const unbound = await post(
        limited,
        { PRICE_CABLE, PRICE_KIT },
        [{ sku: 'CAB-RA20CM-MF-BLK-V1', qty: 1 }]
    );
    assert.equal(unbound.response.status, 500);
    assert.equal(unbound.json.error, CLIENT_ERROR);
    assert.equal(called, false);

    const broken = await post(
        limited,
        envWith({
            async limit() {
                throw new Error('binding down');
            }
        }),
        [{ sku: 'CAB-RA20CM-MF-BLK-V1', qty: 1 }]
    );
    assert.equal(broken.response.status, 500);
    assert.equal(called, false);
});

test('integration: 1 kit + 2 cables is one session, cable qty 2, free shipping, automatic tax', async () => {
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
    const { handler, env } = makeHandler(stripe);
    const result = await post(handler, env, [
        { sku: 'ENC-SAM-A9-V1', qty: 1 },
        { sku: 'CAB-RA20CM-MF-BLK-V1', qty: 2 }
    ], { 'idempotency-key': 'cart-kit-1-cable-2' });

    assert.equal(result.response.status, 200);
    assert.equal(seen.length, 1);
    const params = seen[0].params;
    assert.equal(params.automatic_tax.enabled, true);
    assert.equal(params.line_items.length, 2);
    assert.deepEqual(
        params.line_items.find((line) => line.price === PRICE_CABLE),
        { price: PRICE_CABLE, quantity: 2, metadata: { sku: 'CAB-RA20CM-MF-BLK-V1' } }
    );
    assert.deepEqual(
        params.line_items.find((line) => line.price === PRICE_KIT),
        { price: PRICE_KIT, quantity: 1, metadata: { sku: 'ENC-SAM-A9-V1' } }
    );
    assert.equal(params.shipping_options[0].shipping_rate_data.display_name, 'Free shipping');
    assert.equal(params.shipping_options[0].shipping_rate_data.fixed_amount.amount, 0);
    assert.equal(seen[0].options.idempotencyKey, 'cart-kit-1-cable-2');
    assert.equal(params.line_items.every((line) => !Object.prototype.hasOwnProperty.call(line, 'amount') && !Object.prototype.hasOwnProperty.call(line, 'price_data')), true);
    assert.equal(JSON.stringify(params).includes('11.99'), false);
    assert.equal(JSON.stringify(params).includes('56.00'), false);
    assert.equal(params.metadata.cart, 'ENC-SAM-A9-V1:1,CAB-RA20CM-MF-BLK-V1:2');
    assert.equal(params.success_url, SUCCESS_URL);
    assert.equal(Object.prototype.hasOwnProperty.call(params.metadata, 'checkout'), false);
});

test('product buy posts one line and tags the session without changing the cart contract', async () => {
    assert.equal(checkoutSource('https://slatesafe-checkout-test.slatesafe.workers.dev/?src=buy'), 'buy');
    assert.equal(checkoutSource('https://slatesafe-checkout-test.slatesafe.workers.dev/'), 'cart');
    assert.equal(BUY_SUCCESS_URL, `${SUCCESS_URL}&src=buy`);

    const seen = [];
    const stripe = {
        checkout: {
            sessions: {
                create: async (params, options) => {
                    seen.push({ params, options });
                    return { id: 'cs_test_buy', url: 'https://checkout.stripe.com/c/pay/cs_test_buy' };
                }
            }
        }
    };
    const { handler, env } = makeHandler(stripe);
    const body = [{ sku: 'ENC-SAM-A9-V1', qty: 3 }];
    const buy = await post(
        handler,
        env,
        body,
        { 'idempotency-key': 'buy-kit-qty-3-key' },
        'POST',
        'https://slatesafe-checkout-test.slatesafe.workers.dev/?src=buy'
    );
    assert.equal(buy.response.status, 200);
    assert.equal(seen.length, 1);
    const params = seen[0].params;
    assert.equal(params.success_url, `${SUCCESS_URL}&src=buy`);
    assert.equal(params.metadata.source, 'slatesafe-cart');
    assert.equal(params.metadata.cart, 'ENC-SAM-A9-V1:3');
    assert.equal(params.metadata.checkout, 'buy');
    assert.equal(params.line_items.length, 1);
    assert.deepEqual(params.line_items[0], {
        price: PRICE_KIT,
        quantity: 3,
        metadata: { sku: 'ENC-SAM-A9-V1' }
    });
    assert.equal(seen[0].options.idempotencyKey, 'buy-kit-qty-3-key');

    const cart = await post(handler, env, body, { 'idempotency-key': 'cart-kit-qty-3-key' });
    assert.equal(cart.response.status, 200);
    assert.equal(seen[1].params.success_url, SUCCESS_URL);
    assert.equal(seen[1].params.metadata.source, 'slatesafe-cart');
    assert.equal(seen[1].params.metadata.cart, 'ENC-SAM-A9-V1:3');
    assert.equal(Object.prototype.hasOwnProperty.call(seen[1].params.metadata, 'checkout'), false);
    assert.equal(seen[1].options.idempotencyKey, 'cart-kit-qty-3-key');
});

test('wrangler.toml sets the rate-limit binding and commits no account or secrets', () => {
    const toml = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
    assert.match(toml, /name = "CHECKOUT_RATE_LIMITER"/);
    assert.match(toml, /namespace_id = "1001"/);
    assert.match(toml, /namespace_id = "1002"/);
    assert.equal([...toml.matchAll(/limit = 8/g)].length, 2);
    assert.equal([...toml.matchAll(/period = 60/g)].length, 2);
    assert.equal(/^\s*account_id\s*=/m.test(toml), false);
    assert.equal(/rk_(test|live)_/.test(toml), false);
    assert.equal(/sk_(test|live)_/.test(toml), false);
    assert.equal(/^\s*(STRIPE_SECRET_KEY|PRICE_CABLE|PRICE_KIT)\s*=/m.test(toml), false);
    assert.match(toml, /preview_urls = false/);
    assert.match(toml, /name = "slatesafe-checkout-test"/);
});
