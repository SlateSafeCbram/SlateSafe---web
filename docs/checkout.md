# Checkout Sessions

The public site stays on GitHub Pages. A Vercel Hobby function creates Stripe Checkout Sessions. Buyers keep using Stripe Payment Links until `checkout-config.js` is switched to session mode.

Do not attach `slatesafe.com` or `www.slatesafe.com` to the Vercel project. Those hostnames stay on GitHub Pages. The function hostname is `checkout.slatesafe.com`.

## Feature flag

`checkout-config.js`:

```js
window.SLATESAFE_CHECKOUT = {
    mode: 'payment_links',
    endpoint: 'https://checkout.slatesafe.com/api/create-checkout-session'
};
```

`payment_links` is the default. In that mode the cart still locks each line to quantity 1, still shows the mixed-cart cable notice, and Checkout still opens the product's Stripe Payment Link. Buy buttons always open Payment Links.

Flip `mode` to `'session'` only after the checklist below is done and a test-mode purchase has succeeded. Then:

- Cart lines show steppers from 1 to 10.
- The product page quantity field accepts 1 to 10 and that quantity is what the cart stores.
- A cart may contain both the kit and the cable.
- The mixed-cart cable notice is hidden.
- Checkout POSTs `[{ sku, qty }]` to the endpoint and redirects only to a `https://checkout.stripe.com/` URL.
- Buy buttons still open Payment Links as a fallback.

Privacy copy still says checkout uses Payment Links. Update `privacy-policy.html` in the same change that flips the flag.

## URLs the function sends to Stripe

Stripe Payment Link "after completion" URLs live in the Stripe Dashboard, not in this repo. Session mode uses new static URLs:

- Success: `https://slatesafe.com/order-complete.html?session_id={CHECKOUT_SESSION_ID}`
- Cancel: `https://slatesafe.com/`

`order-complete.html` does not claim the payment succeeded. It says Stripe emails a receipt only when receipt emails are enabled and Stripe confirms the payment, and that test mode sends none. The page is not linked from the nav.

## What the browser sends

Only an array of `{ sku, qty }`. No prices, no amounts, no Price IDs. The server maps:

| SKU | Env var | Catalog price (display only) |
| --- | --- | --- |
| `CAB-RA20CM-MF-BLK-V1` | `PRICE_CABLE` | $11.99 |
| `ENC-SAM-A9-V1` | `PRICE_KIT` | $56.00 |

Rules: 1 or 2 lines, integer quantity 1–10 per SKU after duplicates are summed, unknown SKUs rejected. Shipping is chosen on the server:

- Kit in the cart (with or without cables): one option, "Free shipping", $0.
- Cable only: one option, "USPS Ground Advantage", 575 cents.

The buyer does not pick a shipping menu. Shipping `tax_behavior` is `exclusive`. No shipping tax code is sent, so Stripe's default shipping tax code applies. `automatic_tax` is enabled. That does not collect tax until SlateSafe has an active Stripe Tax registration and the products have tax codes in Stripe. Until then Stripe collects $0 tax and does not error. Phone number collection is on because the live Payment Links collect a phone number. Stripe treats that field as required when collection is enabled.

Session metadata matches the command-deck order parser (command-deck PR #24):

- `source` is exactly `slatesafe-cart`
- `cart` is `SKU:qty,SKU:qty` using the SKUs in `products.json`
- A cart of 1 kit and 2 cables is exactly `ENC-SAM-A9-V1:1,CAB-RA20CM-MF-BLK-V1:2`
- Pairs are emitted kit then cable, not in the order the browser posted

Checkout line items use Price IDs, not `price_data`, so the amount stays on the Stripe Price. Stripe's Checkout Session line item accepts `metadata` next to `price`. Each line sets `metadata.sku` to that same SKU. No webhook is included. Fulfillment stays manual until a later change adds a signature-checked webhook.

## Security limits of the function

- Exact `Origin` allowlist: `https://slatesafe.com` and `https://www.slatesafe.com`. Other origins get 403 and no CORS header.
- `OPTIONS` and `POST` only.
- JSON body, 4096 byte cap, objects may contain only `sku` and `qty`.
- Client errors are always `{ "error": "Unable to start checkout." }`. Stripe messages and stack traces are not returned.
- In-memory token bucket: 8 requests per 60 seconds per IP per instance. Vercel Hobby can run more than one instance, so this is not a global limit. `x-forwarded-for` is taken from the first hop, which a client can spoof if the platform does not overwrite it. Vercel does set that header, but this is still a basic control.
- Idempotency-Key, when sent, must match `^[A-Za-z0-9_-]{16,200}$`. The browser sends a new UUID per click. The Stripe `integration_identifier` suffix is derived from that key so a retry of the same key does not change the payload.

The restricted key needs **Checkout Sessions: Write** only. The function passes Price IDs and does not read Prices or Products, so those read scopes are not required. Do not use a secret key (`sk_`).

## Tests

```bash
npm test
```

That runs `api/checkout-lib.test.js` with a mocked Stripe client. The required case is one kit plus two cables: one session, two line items, cable quantity 2, free shipping, `automatic_tax` enabled, and no client-supplied amounts.

A real test-mode session, once env vars exist. `PRICE_CABLE` and `PRICE_KIT` must be test-mode Price IDs. The live Payment Link prices will not work with an `rk_test_` key.

```bash
STRIPE_SECRET_KEY=rk_test_... PRICE_CABLE=price_... PRICE_KIT=price_... \
  node scripts/checkout-session-e2e.mjs
```

The script refuses keys that do not start with `rk_test_` unless `ALLOW_LIVE=1`. It prints the session id, URL, mode, and livemode. It does not print the key.

## Chris setup checklist

Do these in order. Merging this pull request does not turn session checkout on.

1. Stripe Dashboard, **test mode** (a sandbox is better than the shared test mode if one is available).
2. Create a restricted key (`rk_test_...`) with only **Checkout Sessions: Write**. Do not grant Prices or Products read. Do not create a webhook for this change.
3. Confirm Stripe Tax: either an active registration exists, or accept that `automatic_tax` will collect $0 until one does. Put the product tax code on each Stripe Product. This repo does not set tax codes.
4. Create or select **test-mode** Price IDs for the first end-to-end run. The existing Payment Links are live-mode (those URLs have no `test_` prefix). A live-mode Price does not work with the `rk_test_` key from step 2.
   - Cable `CAB-RA20CM-MF-BLK-V1` → test-mode Price ID in `PRICE_CABLE`
   - Kit `ENC-SAM-A9-V1` → test-mode Price ID in `PRICE_KIT`
   Leave the live Payment Links in place. Copy their Price IDs in step 12, not for this test run:
   - Cable Payment Link `https://buy.stripe.com/00w14ncfc6EN2574tP1Fe00`
   - Kit Payment Link `https://buy.stripe.com/4gMaEXgvsgfnfVXe4p1Fe01`
5. Optional, and preferred by the command-deck order parser: on each test-mode Price from step 4, set `lookup_key` equal to the SKU (`CAB-RA20CM-MF-BLK-V1` on the cable Price, `ENC-SAM-A9-V1` on the kit Price). This function does not read `lookup_key`. It sends the Price ID. Skip this if the Price already has a different lookup key you need to keep.
6. Create a Vercel project from this repo on the **Hobby** plan. Root directory is the repository root. Do not add `slatesafe.com` as a project domain.
7. Vercel environment variables, **Production** (sensitive):
   - `STRIPE_SECRET_KEY` = the test `rk_test_` key for the first end-to-end run, then the live `rk_live_` key only after that run succeeds
   - `PRICE_CABLE`
   - `PRICE_KIT`
   Keep every key in Vercel env vars. Do not put them in git, in GitHub Actions, or in the browser.
8. Preview deployments: either disable Preview deployments, or give Preview its own env vars that contain only the **test** restricted key and test Price IDs. Production must be the only environment with the live key.
9. Turn on Vercel Deployment Protection for Preview if previews stay enabled.
10. DNS: add a CNAME `checkout` on the `slatesafe.com` zone pointing at `cname.vercel-dns.com` (Vercel shows the exact target when the domain is added). In the Vercel project, add `checkout.slatesafe.com` and let Vercel manage the certificate. Do not point the apex at Vercel.
11. Run `scripts/checkout-session-e2e.mjs` with the test key. Open the printed Checkout URL and confirm one kit, cable quantity 2, free shipping, and a phone field. Do not use a live key for that check.
12. Repeat the restricted key in **live mode** (`rk_live_`, Checkout Sessions write only). Copy the Price IDs from the existing live Payment Links into the Production env vars, then remove the test key from Production:
   - Cable `CAB-RA20CM-MF-BLK-V1`, Payment Link `https://buy.stripe.com/00w14ncfc6EN2574tP1Fe00` → `PRICE_CABLE`
   - Kit `ENC-SAM-A9-V1`, Payment Link `https://buy.stripe.com/4gMaEXgvsgfnfVXe4p1Fe01` → `PRICE_KIT`
13. In the live-mode Stripe Dashboard, turn on customer emails for successful payments (Settings → Emails). Checkout collects an email address, and Stripe sends a receipt only when that email is on. Test mode does not send receipts. `order-complete.html` does not promise one.
14. Change `checkout-config.js` `mode` from `payment_links` to `session` in a follow-up commit, and update the privacy-policy sentences that still say Payment Links.
15. Place one real live test order, then refund it.

Shipping awkwardness to accept before launch: one server-chosen rate, free whenever the kit is in the cart, $5.75 for cable-only, tax stays $0 until Stripe Tax is actually configured, phone is required, and there is no webhook so nothing fulfills automatically.
