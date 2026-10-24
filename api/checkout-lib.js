'use strict';

const crypto = require('crypto');

const ALLOWED_ORIGINS = new Set([
    'https://slatesafe.com',
    'https://www.slatesafe.com'
]);

const SKU_PRICE_ENV = {
    'CAB-RA20CM-MF-BLK-V1': 'PRICE_CABLE',
    'ENC-SAM-A9-V1': 'PRICE_KIT'
};

// Stable cart string for the command-deck order parser (command-deck PR #24):
// metadata.cart is "SKU:qty,SKU:qty" using products.json SKUs.
// Kit then cable matches the deck example "ENC-SAM-A9-V1:1,CAB-RA20CM-MF-BLK-V1:2".
const CART_SKU_ORDER = ['ENC-SAM-A9-V1', 'CAB-RA20CM-MF-BLK-V1'];

const KIT_SKU = 'ENC-SAM-A9-V1';
const MAX_QTY = 10;
const MAX_LINES = 2;
const MAX_BODY_BYTES = 4096;
const RATE_CAPACITY = 8;
const RATE_WINDOW_MS = 60 * 1000;
const CLIENT_ERROR = 'Unable to start checkout.';
const SUCCESS_URL = 'https://slatesafe.com/order-complete.html?session_id={CHECKOUT_SESSION_ID}';
const CANCEL_URL = 'https://slatesafe.com/';

const buckets = new Map();

function header(req, name) {
    const headers = req.headers || {};
    const want = name.toLowerCase();
    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === want) {
            const value = headers[key];
            return Array.isArray(value) ? value[0] : value;
        }
    }
    return '';
}

function clientIp(req) {
    const forwarded = header(req, 'x-forwarded-for');
    if (forwarded) {
        return String(forwarded).split(',')[0].trim() || 'unknown';
    }
    return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function allowRequest(ip, now) {
    const current = now();
    let bucket = buckets.get(ip);
    if (!bucket) {
        if (buckets.size > 5000) {
            const oldest = buckets.keys().next().value;
            buckets.delete(oldest);
        }
        bucket = { tokens: RATE_CAPACITY, updated: current };
        buckets.set(ip, bucket);
    }
    const elapsed = Math.max(0, current - bucket.updated);
    const refill = (elapsed / RATE_WINDOW_MS) * RATE_CAPACITY;
    bucket.tokens = Math.min(RATE_CAPACITY, bucket.tokens + refill);
    bucket.updated = current;
    if (bucket.tokens < 1) {
        return false;
    }
    bucket.tokens -= 1;
    return true;
}

function resetRateLimit() {
    buckets.clear();
}

function applyCors(res, origin) {
    if (!ALLOWED_ORIGINS.has(origin)) return;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
    res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(res, status, origin, body) {
    applyCors(res, origin);
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(JSON.stringify(body));
}

function fail(res, status, origin) {
    sendJson(res, status, origin, { error: CLIENT_ERROR });
}

function normalizeItems(body) {
    if (!Array.isArray(body) || body.length < 1 || body.length > MAX_LINES) {
        return null;
    }
    const merged = new Map();
    for (const row of body) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
        const keys = Object.keys(row);
        if (keys.length !== 2 || !Object.prototype.hasOwnProperty.call(row, 'sku') || !Object.prototype.hasOwnProperty.call(row, 'qty')) {
            return null;
        }
        if (typeof row.sku !== 'string' || !Object.prototype.hasOwnProperty.call(SKU_PRICE_ENV, row.sku)) {
            return null;
        }
        if (typeof row.qty !== 'number' || !Number.isInteger(row.qty)) return null;
        merged.set(row.sku, (merged.get(row.sku) || 0) + row.qty);
    }
    if (merged.size < 1 || merged.size > MAX_LINES) return null;
    const items = Array.from(merged.entries())
        .sort((a, b) => CART_SKU_ORDER.indexOf(a[0]) - CART_SKU_ORDER.indexOf(b[0]))
        .map(([sku, qty]) => ({ sku, qty }));
    if (items.some((item) => item.qty < 1 || item.qty > MAX_QTY)) return null;
    return items;
}

function priceIdForSku(sku, env) {
    const name = SKU_PRICE_ENV[sku];
    const value = env && env[name];
    if (typeof value !== 'string' || !/^price_[A-Za-z0-9]+$/.test(value)) return null;
    return value;
}

function shippingOption(items) {
    const hasKit = items.some((item) => item.sku === KIT_SKU);
    if (hasKit) {
        return {
            shipping_rate_data: {
                type: 'fixed_amount',
                display_name: 'Free shipping',
                fixed_amount: { amount: 0, currency: 'usd' },
                tax_behavior: 'exclusive'
            }
        };
    }
    return {
        shipping_rate_data: {
            type: 'fixed_amount',
            display_name: 'USPS Ground Advantage',
            fixed_amount: { amount: 575, currency: 'usd' },
            tax_behavior: 'exclusive'
        }
    };
}

function integrationSuffix(seed) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    const hash = crypto.createHash('sha256').update(seed).digest();
    let suffix = '';
    for (let i = 0; i < 8; i += 1) {
        suffix += alphabet[hash[i] % 26];
    }
    return suffix;
}

function idempotencyKeyFor(origin, items, requested) {
    if (requested) {
        if (!/^[A-Za-z0-9_-]{16,200}$/.test(requested)) return null;
        return requested;
    }
    const canonical = items.map((item) => `${item.sku}:${item.qty}`).join(',');
    return crypto.createHash('sha256').update(`${origin}|${canonical}`).digest('hex');
}

function sessionParams(items, env, idempotencyKey) {
    const lineItems = [];
    for (const item of items) {
        const price = priceIdForSku(item.sku, env);
        if (!price) return null;
        // Price ID only. Checkout line items accept metadata next to price,
        // so the deck can read the SKU without price_data or a client amount.
        lineItems.push({
            price,
            quantity: item.qty,
            metadata: { sku: item.sku }
        });
    }
    return {
        mode: 'payment',
        line_items: lineItems,
        automatic_tax: { enabled: true },
        shipping_address_collection: { allowed_countries: ['US'] },
        phone_number_collection: { enabled: true },
        shipping_options: [shippingOption(items)],
        success_url: SUCCESS_URL,
        cancel_url: CANCEL_URL,
        metadata: {
            source: 'slatesafe-cart',
            cart: items.map((item) => `${item.sku}:${item.qty}`).join(',')
        },
        integration_identifier: `slatesafe-cart-${integrationSuffix(idempotencyKey)}`
    };
}

async function readRawBody(req) {
    const declared = Number(header(req, 'content-length') || 0);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
        return { error: 'too_large' };
    }
    if (Buffer.isBuffer(req.body)) {
        if (req.body.length > MAX_BODY_BYTES) return { error: 'too_large' };
        return { raw: req.body.toString('utf8') };
    }
    if (typeof req.body === 'string') {
        if (Buffer.byteLength(req.body) > MAX_BODY_BYTES) return { error: 'too_large' };
        return { raw: req.body };
    }
    if (req.body && typeof req.body === 'object') {
        const raw = JSON.stringify(req.body);
        if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return { error: 'too_large' };
        return { parsed: req.body };
    }
    const chunks = [];
    let total = 0;
    if (!req || typeof req[Symbol.asyncIterator] !== 'function') {
        return { raw: '' };
    }
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > MAX_BODY_BYTES) return { error: 'too_large' };
        chunks.push(buffer);
    }
    return { raw: Buffer.concat(chunks).toString('utf8') };
}

function createCheckoutHandler(deps) {
    const env = deps.env || process.env;
    const now = deps.now || Date.now;
    const getStripe = deps.getStripe;

    return async function handler(req, res) {
        const origin = String(header(req, 'origin') || '');
        const method = String(req.method || '').toUpperCase();

        if (!ALLOWED_ORIGINS.has(origin)) {
            fail(res, 403, '');
            return;
        }

        if (method === 'OPTIONS') {
            applyCors(res, origin);
            res.statusCode = 204;
            res.setHeader('Cache-Control', 'no-store');
            res.end();
            return;
        }

        if (method !== 'POST') {
            fail(res, 405, origin);
            return;
        }

        if (!allowRequest(clientIp(req), now)) {
            fail(res, 429, origin);
            return;
        }

        const contentType = String(header(req, 'content-type') || '');
        if (!contentType.toLowerCase().startsWith('application/json')) {
            fail(res, 400, origin);
            return;
        }

        let payload;
        try {
            const loaded = await readRawBody(req);
            if (loaded.error) {
                fail(res, 413, origin);
                return;
            }
            payload = Object.prototype.hasOwnProperty.call(loaded, 'parsed')
                ? loaded.parsed
                : JSON.parse(loaded.raw || '');
        } catch (error) {
            fail(res, 400, origin);
            return;
        }

        const items = normalizeItems(payload);
        if (!items) {
            fail(res, 400, origin);
            return;
        }

        const requestedKey = String(header(req, 'idempotency-key') || '');
        const idempotencyKey = idempotencyKeyFor(origin, items, requestedKey);
        if (!idempotencyKey) {
            fail(res, 400, origin);
            return;
        }

        const params = sessionParams(items, env, idempotencyKey);
        if (!params) {
            console.error('checkout_misconfigured');
            fail(res, 500, origin);
            return;
        }

        try {
            const stripe = await getStripe();
            const session = await stripe.checkout.sessions.create(params, { idempotencyKey });
            const url = session && session.url;
            if (typeof url !== 'string' || !url.startsWith('https://checkout.stripe.com/')) {
                console.error('checkout_bad_redirect');
                fail(res, 500, origin);
                return;
            }
            sendJson(res, 200, origin, { url });
        } catch (error) {
            console.error('checkout_failed');
            fail(res, 500, origin);
        }
    };
}

module.exports = {
    ALLOWED_ORIGINS,
    CANCEL_URL,
    CLIENT_ERROR,
    MAX_BODY_BYTES,
    MAX_QTY,
    SUCCESS_URL,
    allowRequest,
    createCheckoutHandler,
    normalizeItems,
    resetRateLimit,
    sessionParams,
    shippingOption
};
