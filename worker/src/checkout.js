// Checkout Session request checks. Web APIs only, so the same module
// runs in a Worker and under Node's test runner.

export const ALLOWED_ORIGINS = new Set([
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
export const MAX_QTY = 10;
const MAX_LINES = 2;
export const MAX_BODY_BYTES = 4096;
export const CLIENT_ERROR = 'Unable to start checkout.';
export const SUCCESS_URL = 'https://slatesafe.com/order-complete.html?session_id={CHECKOUT_SESSION_ID}';
export const CANCEL_URL = 'https://slatesafe.com/';

function clientIp(request) {
    const connecting = request.headers.get('cf-connecting-ip');
    if (connecting && connecting.trim()) return connecting.trim();
    return 'unknown';
}

async function sha256Bytes(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return new Uint8Array(digest);
}

function applyCors(headers, origin) {
    if (!ALLOWED_ORIGINS.has(origin)) return;
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
    headers.set('Access-Control-Max-Age', '86400');
}

function jsonResponse(status, origin, body) {
    const headers = new Headers({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    });
    applyCors(headers, origin);
    return new Response(JSON.stringify(body), { status, headers });
}

function fail(status, origin) {
    return jsonResponse(status, origin, { error: CLIENT_ERROR });
}

export function normalizeItems(body) {
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

export function shippingOption(items) {
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

async function integrationSuffix(seed) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    const hash = await sha256Bytes(seed);
    let suffix = '';
    for (let i = 0; i < 8; i += 1) {
        suffix += alphabet[hash[i] % 26];
    }
    return suffix;
}

export async function idempotencyKeyFor(origin, items, requested) {
    if (requested) {
        if (!/^[A-Za-z0-9_-]{16,200}$/.test(requested)) return null;
        return requested;
    }
    const canonical = items.map((item) => `${item.sku}:${item.qty}`).join(',');
    const hash = await sha256Bytes(`${origin}|${canonical}`);
    return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sessionParams(items, env, idempotencyKey) {
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
        integration_identifier: `slatesafe-cart-${await integrationSuffix(idempotencyKey)}`
    };
}

async function readRawBody(request) {
    const declared = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
        return { error: 'too_large' };
    }
    if (!request.body) return { raw: '' };
    const reader = request.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BODY_BYTES) {
            try {
                await reader.cancel();
            } catch (error) {
                // The cap already failed the request.
            }
            return { error: 'too_large' };
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return { raw: new TextDecoder().decode(bytes) };
}

// Missing or throwing limiter fails closed. A `success: false` result is 429.
async function checkRateLimit(env, request) {
    const limiter = env && env.CHECKOUT_RATE_LIMITER;
    if (!limiter || typeof limiter.limit !== 'function') {
        return 'unbound';
    }
    try {
        const result = await limiter.limit({ key: clientIp(request) });
        if (!result || result.success !== true) return 'limited';
        return 'ok';
    } catch (error) {
        return 'failed';
    }
}

export function createCheckoutHandler(deps) {
    const getStripe = deps.getStripe;

    return async function handler(request, env) {
        const origin = request.headers.get('origin') || '';
        const method = request.method.toUpperCase();

        if (!ALLOWED_ORIGINS.has(origin)) {
            return fail(403, '');
        }

        if (method === 'OPTIONS') {
            const headers = new Headers({ 'Cache-Control': 'no-store' });
            applyCors(headers, origin);
            return new Response(null, { status: 204, headers });
        }

        if (method !== 'POST') {
            return fail(405, origin);
        }

        const rate = await checkRateLimit(env, request);
        if (rate === 'limited') {
            return fail(429, origin);
        }
        if (rate !== 'ok') {
            console.error(rate === 'unbound' ? 'checkout_rate_limit_unbound' : 'checkout_rate_limit_failed');
            return fail(500, origin);
        }

        const contentType = request.headers.get('content-type') || '';
        if (!contentType.toLowerCase().startsWith('application/json')) {
            return fail(400, origin);
        }

        let payload;
        try {
            const loaded = await readRawBody(request);
            if (loaded.error) return fail(413, origin);
            payload = JSON.parse(loaded.raw || '');
        } catch (error) {
            return fail(400, origin);
        }

        const items = normalizeItems(payload);
        if (!items) return fail(400, origin);

        const requestedKey = request.headers.get('idempotency-key') || '';
        const idempotencyKey = await idempotencyKeyFor(origin, items, requestedKey);
        if (!idempotencyKey) return fail(400, origin);

        const params = await sessionParams(items, env, idempotencyKey);
        if (!params) {
            console.error('checkout_misconfigured');
            return fail(500, origin);
        }

        try {
            const stripe = await getStripe(env);
            const session = await stripe.checkout.sessions.create(params, { idempotencyKey });
            const url = session && session.url;
            if (typeof url !== 'string' || !url.startsWith('https://checkout.stripe.com/')) {
                console.error('checkout_bad_redirect');
                return fail(500, origin);
            }
            return jsonResponse(200, origin, { url });
        } catch (error) {
            if (error && error.message === 'missing_stripe_key') {
                console.error('checkout_misconfigured');
            } else {
                console.error('checkout_failed');
            }
            return fail(500, origin);
        }
    };
}
