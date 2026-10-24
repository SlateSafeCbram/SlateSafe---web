'use strict';

const { createCheckoutHandler } = require('./checkout-lib');

let stripeClient = null;

// vercel.json maxDuration is 10s. stripe-node defaults to an 80s timeout.
// maxNetworkRetries: 1 is one retry. stripe-node's first retry sleeps
// INITIAL_NETWORK_RETRY_DELAY_SEC (0.5s); jitter on that first retry is
// clamped back to the same floor. Two 4s attempts plus that delay stay
// inside the function limit, so the handler catch can still return CORS.
const STRIPE_CLIENT_OPTIONS = Object.freeze({
    apiVersion: '2026-09-30.endive',
    maxNetworkRetries: 1,
    timeout: 4000,
    telemetry: false
});
const STRIPE_RETRY_DELAY_MS = 500;
const CHECKOUT_MAX_DURATION_MS = 10000;

function getStripe() {
    if (!stripeClient) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) {
            throw new Error('missing_stripe_key');
        }
        const Stripe = require('stripe');
        stripeClient = new Stripe(key, STRIPE_CLIENT_OPTIONS);
    }
    return stripeClient;
}

const handler = createCheckoutHandler({
    env: process.env,
    getStripe
});
handler.STRIPE_CLIENT_OPTIONS = STRIPE_CLIENT_OPTIONS;
handler.STRIPE_RETRY_DELAY_MS = STRIPE_RETRY_DELAY_MS;
handler.CHECKOUT_MAX_DURATION_MS = CHECKOUT_MAX_DURATION_MS;
module.exports = handler;
