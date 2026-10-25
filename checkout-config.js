// One switch for checkout.
// Launch mode is 'session': the cart and the Buy button start a Stripe
// Checkout Session on the production worker.
// To roll back, set mode to 'payment_links'. Checkout and Buy then open
// the Stripe Payment Link stored on each product. The Payment Link URLs
// stay in products.json. CSP connect-src already allows both the
// production worker and the test worker, so rolling back is that
// one-line flag change:
//   https://slatesafe-checkout.slatesafe.workers.dev/
//   https://slatesafe-checkout-test.slatesafe.workers.dev/
// A CSP wildcard of *.workers.dev does not match either hostname.
var SLATESAFE_CHECKOUT_ENDPOINT = 'https://slatesafe-checkout.slatesafe.workers.dev/';
window.SLATESAFE_CHECKOUT = {
    mode: 'session',
    endpoint: SLATESAFE_CHECKOUT_ENDPOINT
};
