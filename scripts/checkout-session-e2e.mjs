// Real Stripe test-mode check. Run only after the test key and Price IDs
// are in the environment. This does not run in CI.
//
//   STRIPE_SECRET_KEY=rk_test_... PRICE_CABLE=price_... PRICE_KIT=price_... \
//     node scripts/checkout-session-e2e.mjs
//
// Refuses live keys unless ALLOW_LIVE=1. Prints the session id and URL only.

import { createRequire } from 'module';
import Stripe from 'stripe';

const require = createRequire(import.meta.url);
const { sessionParams } = require('../api/checkout-lib.js');

const key = process.env.STRIPE_SECRET_KEY || '';
if (!key) {
    console.error('Set STRIPE_SECRET_KEY to a test-mode restricted key (rk_test_...).');
    process.exit(1);
}
if (!key.startsWith('rk_test_') && process.env.ALLOW_LIVE !== '1') {
    console.error('Refusing to run without an rk_test_ key. Set ALLOW_LIVE=1 only if you mean to.');
    process.exit(1);
}
if (!process.env.PRICE_CABLE || !process.env.PRICE_KIT) {
    console.error('Set PRICE_CABLE and PRICE_KIT.');
    process.exit(1);
}

const items = [
    { sku: 'ENC-SAM-A9-V1', qty: 1 },
    { sku: 'CAB-RA20CM-MF-BLK-V1', qty: 2 }
];
const idempotencyKey = `e2e-${Date.now()}`;
const params = sessionParams(items, process.env, idempotencyKey);
const stripe = new Stripe(key, {
    apiVersion: '2026-09-30.endive',
    maxNetworkRetries: 1,
    telemetry: false
});
const session = await stripe.checkout.sessions.create(params, { idempotencyKey });
console.log(JSON.stringify({
    id: session.id,
    url: session.url,
    mode: session.mode,
    livemode: session.livemode
}));
