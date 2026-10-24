'use strict';

const { createCheckoutHandler } = require('./checkout-lib');

let stripeClient = null;

function getStripe() {
    if (!stripeClient) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) {
            throw new Error('missing_stripe_key');
        }
        const Stripe = require('stripe');
        stripeClient = new Stripe(key, {
            apiVersion: '2026-09-30.endive',
            maxNetworkRetries: 1,
            telemetry: false
        });
    }
    return stripeClient;
}

module.exports = createCheckoutHandler({
    env: process.env,
    getStripe
});
