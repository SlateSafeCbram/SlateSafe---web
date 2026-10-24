// One switch for checkout. Leave mode as payment_links until launch.
// Flip mode to 'session' only after checkout.slatesafe.com is live
// and the Vercel env vars in docs/checkout.md are set.
window.SLATESAFE_CHECKOUT = {
    mode: 'payment_links',
    endpoint: 'https://checkout.slatesafe.com/api/create-checkout-session'
};
