// One switch for checkout. Leave mode as payment_links until launch.
// Flip mode to 'session' only after the Cloudflare test Worker is deployed
// and the wrangler secrets in docs/checkout.md are set.
//
// Single endpoint. After `wrangler deploy`, replace ACCOUNT_SUBDOMAIN with
// the workers.dev subdomain from the Cloudflare dashboard (Workers & Pages).
// The test worker is https://slatesafe-checkout-test.<same subdomain>.workers.dev/
// Point endpoint at the test host while exercising test mode, then at this
// production host before launch.
//
// CSP connect-src on every HTML page must list the same hosts. A CSP
// wildcard of *.workers.dev does not match: this hostname has two labels
// before workers.dev, and a CSP * matches one label.
var SLATESAFE_CHECKOUT_ENDPOINT = 'https://slatesafe-checkout.ACCOUNT_SUBDOMAIN.workers.dev/';
window.SLATESAFE_CHECKOUT = {
    mode: 'payment_links',
    endpoint: SLATESAFE_CHECKOUT_ENDPOINT
};
