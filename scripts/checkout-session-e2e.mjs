// Posts one kit and two cables to the deployed test Worker.
// The Worker holds the Stripe key. This script does not.
//
//   CHECKOUT_WORKER_URL=https://slatesafe-checkout-test.slatesafe.workers.dev/ \
//     node scripts/checkout-session-e2e.mjs
//
// Refuses a URL that is not the test worker unless ALLOW_LIVE=1.
// Prints the Checkout URL only.

const url = process.env.CHECKOUT_WORKER_URL || '';
if (!url) {
    console.error('Set CHECKOUT_WORKER_URL to the test Worker (https://slatesafe-checkout-test.slatesafe.workers.dev/).');
    process.exit(1);
}
let parsed;
try {
    parsed = new URL(url);
} catch (error) {
    console.error('CHECKOUT_WORKER_URL is not a URL.');
    process.exit(1);
}
if (parsed.protocol !== 'https:') {
    console.error('CHECKOUT_WORKER_URL must be https.');
    process.exit(1);
}
const testHost = parsed.hostname.startsWith('slatesafe-checkout-test.')
    && parsed.hostname.endsWith('.workers.dev');
if (!testHost && process.env.ALLOW_LIVE !== '1') {
    console.error('Refusing a URL that is not the test worker. Set ALLOW_LIVE=1 only if you mean to.');
    process.exit(1);
}

const origin = process.env.CHECKOUT_ORIGIN || 'https://slatesafe.com';
const idempotencyKey = `e2e-kit1-cable2-${Date.now()}`;
const response = await fetch(parsed, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify([
        { sku: 'ENC-SAM-A9-V1', qty: 1 },
        { sku: 'CAB-RA20CM-MF-BLK-V1', qty: 2 }
    ])
});
const text = await response.text();
let json = null;
try {
    json = JSON.parse(text);
} catch (error) {
    json = null;
}
const checkoutUrl = json && json.url;
if (!response.ok || typeof checkoutUrl !== 'string' || !checkoutUrl.startsWith('https://checkout.stripe.com/')) {
    console.error(`Checkout failed (HTTP ${response.status}).`);
    process.exit(1);
}
console.log(JSON.stringify({ status: response.status, url: checkoutUrl }));
