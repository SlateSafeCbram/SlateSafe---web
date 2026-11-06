import Stripe from 'stripe';
import { createCheckoutHandler } from './checkout.js';

// stripe-node defaults to an 80s timeout. One retry sleeps 500ms
// (stripe-node's first-retry floor). Two 4s attempts plus that delay
// stay inside 10s, so a hung Stripe call still returns the generic
// JSON error. Waiting on fetch does not count as Workers CPU time.
// The static import runs at isolate startup (1s budget) rather than
// on the free plan's 10ms request CPU.
export const STRIPE_CLIENT_OPTIONS = Object.freeze({
    apiVersion: '2026-09-30.endive',
    maxNetworkRetries: 1,
    timeout: 4000,
    telemetry: false
});
export const STRIPE_RETRY_DELAY_MS = 500;
export const CHECKOUT_MAX_DURATION_MS = 10000;

export function createStripeClient(key) {
    return new Stripe(key, {
        ...STRIPE_CLIENT_OPTIONS,
        httpClient: Stripe.createFetchHttpClient()
    });
}

let stripeClient = null;
let stripeKey = '';

function getStripe(env) {
    const key = env && env.STRIPE_SECRET_KEY;
    if (typeof key !== 'string' || key.length === 0) {
        throw new Error('missing_stripe_key');
    }
    if (!stripeClient || stripeKey !== key) {
        stripeClient = createStripeClient(key);
        stripeKey = key;
    }
    return stripeClient;
}

const handler = createCheckoutHandler({
    getStripe
});

export default {
    async fetch(request, env) {
        return handler(request, env);
    }
};
