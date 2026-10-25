// One switch for checkout. Leave mode as payment_links until launch.
// Flip mode to 'session' only after the checklist in docs/checkout.md
// is finished, including the live purchase.
//
// This constant points at the TEST worker so a session-mode trial
// cannot charge live cards. At launch, switch it to the production
// worker and keep mode in sync with that change:
//   https://slatesafe-checkout.slatesafe.workers.dev/
// CSP connect-src already allows both hosts. A CSP wildcard of
// *.workers.dev does not match either hostname: each has two labels
// before workers.dev, and a CSP * matches one label.
var SLATESAFE_CHECKOUT_ENDPOINT = 'https://slatesafe-checkout-test.slatesafe.workers.dev/';
window.SLATESAFE_CHECKOUT = {
    mode: 'payment_links',
    endpoint: SLATESAFE_CHECKOUT_ENDPOINT
};
