# Checkout Sessions

The public site stays on GitHub Pages. A Cloudflare Worker on the Workers Free plan creates Stripe Checkout Sessions. Buyers keep using Stripe Payment Links until `checkout-config.js` is switched to session mode.

Do not attach `slatesafe.com` or `www.slatesafe.com` to the Worker. Those hostnames stay on GitHub Pages. DNS for `slatesafe.com` stays where it is (Vercel DNS today). The function hostname is the free `workers.dev` URL below, not `checkout.slatesafe.com`.

## Feature flag

`checkout-config.js` holds the only endpoint constant, `SLATESAFE_CHECKOUT_ENDPOINT`:

```js
var SLATESAFE_CHECKOUT_ENDPOINT = 'https://slatesafe-checkout-test.slatesafe.workers.dev/';
window.SLATESAFE_CHECKOUT = {
    mode: 'payment_links',
    endpoint: SLATESAFE_CHECKOUT_ENDPOINT
};
```

`payment_links` is the default. In that mode the cart still locks each line to quantity 1, still shows the mixed-cart cable notice, and Checkout still opens the product's Stripe Payment Link. Buy buttons always open Payment Links.

The workers.dev subdomain is `slatesafe`. The constant currently points at the **test** worker, `https://slatesafe-checkout-test.slatesafe.workers.dev/`. At launch, switch it to `https://slatesafe-checkout.slatesafe.workers.dev/` in the same change that sets `mode` to `session`. Both hosts are in each HTML page's `connect-src`. A CSP wildcard `*.workers.dev` does not match these hosts: the URL has two labels before `workers.dev`, and a CSP `*` matches one label.

Flip `mode` to `'session'` only after the checklist below is done and a test-mode purchase has succeeded. Then:

- Cart lines show steppers from 1 to 10.
- The product page quantity field accepts 1 to 10 and that quantity is what the cart stores.
- A cart may contain both the kit and the cable.
- The mixed-cart cable notice is hidden.
- Checkout POSTs `[{ sku, qty }]` to the endpoint and redirects only to a `https://checkout.stripe.com/` URL.
- Buy buttons still open Payment Links as a fallback.

Privacy copy still says checkout uses Payment Links. Update `privacy-policy.html` in the same change that flips the flag.

## Where the Worker runs

`worker/wrangler.toml` defines two scripts. Neither file contains secrets or an `account_id`.

| Deploy | Worker name | Hostname |
| --- | --- | --- |
| `npx wrangler deploy --env=""` | `slatesafe-checkout` | `https://slatesafe-checkout.slatesafe.workers.dev/` |
| `npx wrangler deploy --env test` | `slatesafe-checkout-test` | `https://slatesafe-checkout-test.slatesafe.workers.dev/` |

Secrets are per script. `wrangler secret put NAME --env test` does not set production, and a production secret does not appear on the test worker.

Wrangler 4.36.0 or later is required for the rate-limit binding. Run the commands from the `worker/` directory (or pass `--config worker/wrangler.toml` from the repo root).

## Domain

A Worker cannot serve `checkout.slatesafe.com` through a CNAME while the `slatesafe.com` nameservers stay off Cloudflare, not on the Free plan.

- Custom Domains need an active Cloudflare zone you own, and Cloudflare creates the DNS record. You cannot add a Custom Domain on a zone you do not own, or on a hostname that already has a CNAME. [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) (updated Sep 29, 2026).
- Routes have the same requirement: an active zone plus a proxied DNS record. [Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/) (updated Oct 18, 2026).
- Partial (CNAME) setup keeps authoritative DNS at another provider and proxies individual names. Free and Pro are **No**. Business and Enterprise are **Yes**. [CNAME setup](https://developers.cloudflare.com/dns/zone-setups/partial-setup/) (updated Oct 15, 2026).
- Cloudflare for SaaS custom hostnames also need a zone that is already on Cloudflare. The customer then CNAMEs to a hostname on that zone. The Free plan includes 100 hostnames, and enabling the product on a non-enterprise zone requires entering payment information. [Plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/) (updated Aug 14, 2026) and [Enable](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/enable/) (updated Apr 29, 2026).

Recommendation: use the free `*.workers.dev` URL. [workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/) (updated Sep 22, 2026) is the documented way to deploy without onboarding a domain. Cloudflare describes that subdomain as a Free website for personal or hobby projects, and recommends a route or Custom Domain for business-critical production. For this store the buyers' address bar is `checkout.stripe.com`, then `https://slatesafe.com/order-complete.html`. The workers.dev host is not a page, so it has no SEO surface. It shows up in devtools and in the checkout POST. Trust impact is limited to someone inspecting that request. The meta CSP must name the exact origin or the browser blocks the POST once `mode` is `session`.

What moving DNS to Cloudflare would add later: a Custom Domain on `checkout.slatesafe.com` after the zone is active on Cloudflare. The apex can stay a GitHub Pages target. That move is optional and is not required to launch. Do not point the apex at the Worker.

`workers.dev` is public when enabled. The Origin allowlist stops other websites' browsers. It is not authentication: a non-browser client can send `Origin: https://slatesafe.com`. The SKU allowlist, server-side Price IDs, and the rate-limit binding still apply. Cloudflare Access can require a login on the workers.dev URL; do not enable that for buyers.

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

The Stripe client is stripe-node with `Stripe.createFetchHttpClient()` (Workers have no Node HTTP client). API version `2026-09-30.endive`. Timeout 4000ms, one retry, telemetry off. A hung call still returns the generic JSON error. Workers Free allows 10ms of CPU per request; time spent waiting on Stripe does not count. If the dashboard shows error 1102 (`exceededCpu`), that is the free CPU limit and the buyer sees Cloudflare's error page rather than the JSON error. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (updated Oct 12, 2026): 100,000 requests/day and 10ms CPU on the Free plan.

## Security limits of the function

- Exact `Origin` allowlist: `https://slatesafe.com` and `https://www.slatesafe.com`. Other origins get 403 and no CORS header.
- `OPTIONS` and `POST` only.
- JSON body, 4096 byte cap (Content-Length and the bytes actually read), objects may contain only `sku` and `qty`.
- Client errors are always `{ "error": "Unable to start checkout." }`. Stripe messages and stack traces are not returned. Logs are the fixed strings `checkout_misconfigured`, `checkout_bad_redirect`, `checkout_failed`, `checkout_rate_limit_unbound`, and `checkout_rate_limit_failed`.
- Rate limit: the Workers Rate Limiting binding `CHECKOUT_RATE_LIMITER`, 8 requests per 60 seconds, keyed on `CF-Connecting-IP`. Cloudflare sets that header; the client does not. The binding is GA (`[[ratelimits]]` in wrangler.toml). Wrangler must be 4.36.0 or later. The [Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) page (updated Oct 21, 2026) does not require a paid plan, and the [Sept 19, 2025 GA note](https://developers.cloudflare.com/changelog/post/2025-09-19-ratelimit-workers-ga/) recommends the binding for production. Limits are approximate and per Cloudflare location, not one global counter. A burst can exceed 8 before counts sync, and another location has its own counter. A strict worldwide cap would need Durable Objects, which are not the free option. Cloudflare also notes that many people can share one IP, so a carrier NAT can share a bucket. The handler fails closed (HTTP 500, generic error, Stripe not called) when the binding is missing or `limit()` throws. Test uses `namespace_id` `1002` and production uses `1001`, so the counters do not mix.
- Idempotency-Key, when sent, must match `^[A-Za-z0-9_-]{16,200}$`. The browser sends a new UUID per click. The Stripe `integration_identifier` suffix is derived from that key so a retry of the same key does not change the payload.
- `preview_urls` is false on both environments. Do not put secrets in `[vars]` or in git. `worker/.dev.vars` is gitignored and is only for local `wrangler dev`. Do not run `wrangler dev --remote` against the production script.

The restricted key needs **Checkout Sessions: Write** only. The function passes Price IDs and does not read Prices or Products, so those read scopes are not required. Do not use a secret key (`sk_`).

## Tests

```bash
npm test
```

That runs `worker/src/checkout.test.js` with a mocked Stripe client and a mocked rate-limit binding. The required case is one kit plus two cables: one session, two line items, cable quantity 2, free shipping, `automatic_tax` enabled, and no client-supplied amounts. `worker/src/stripe-client.test.js` checks the fetch HTTP client and the timeout budget. No Miniflare install: Node's `Request`, `Response`, and `crypto.subtle` are enough.

A real test-mode session against the deployed test Worker. `PRICE_CABLE` and `PRICE_KIT` on that worker must be test-mode Price IDs. The script does not take a Stripe key.

```bash
CHECKOUT_WORKER_URL=https://slatesafe-checkout-test.slatesafe.workers.dev/ \
  node scripts/checkout-session-e2e.mjs
```

The script refuses a URL that is not the test worker unless `ALLOW_LIVE=1`. It prints the Checkout URL only. On 2026-10-24 that command against the deployed test worker returned HTTP 200 and a `https://checkout.stripe.com/` URL whose session id starts with `cs_test_`, for 1 kit and 2 cables.

## Chris setup checklist

Do these in order. Merging this pull request does not turn session checkout on. The flag stays `payment_links`.

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
6. Create a free Cloudflare account. The Workers Free plan is the target (100,000 requests/day, 10ms CPU). Do not move the `slatesafe.com` nameservers. The site stays on GitHub Pages.
7. From `worker/`, log in with `npx wrangler@4 login` (Wrangler 4.36.0 or later) or use the dashboard. Enable the workers.dev subdomain (Workers & Pages → your subdomain). Leave `account_id` out of `wrangler.toml`. Wrangler uses the logged-in account. The subdomain in use is `slatesafe`.
8. **Done (2026-10-24).** The test worker is deployed at `https://slatesafe-checkout-test.slatesafe.workers.dev/` with the `CHECKOUT_RATE_LIMITER` binding (8 requests / 60 seconds, namespace `1002`).
9. **Done (2026-10-24).** `STRIPE_SECRET_KEY`, `PRICE_CABLE`, and `PRICE_KIT` are set on the test environment with `wrangler secret put` (secrets, not `[vars]`, not git). The key is the test restricted key. The Price IDs are test-mode. The live key is not on this worker.
10. **Done.** `checkout-config.js` points at `https://slatesafe-checkout-test.slatesafe.workers.dev/`. Every HTML `connect-src` allows that host and `https://slatesafe-checkout.slatesafe.workers.dev`. `mode` stays `payment_links` until step 14.
11. **Done (2026-10-24).** `scripts/checkout-session-e2e.mjs` against the test worker, body 1 kit + 2 cables, returned HTTP 200 and a `https://checkout.stripe.com/` URL with a `cs_test_` session id. A browser pass of that Checkout page (one kit, cable quantity 2, free shipping, phone field) is still worth doing before step 12 if it has not been clicked through.
12. Later, when the test purchase looks right: create the live restricted key (`rk_live_`, Checkout Sessions write only) and copy the Price IDs from the existing live Payment Links. Put those on the **production** worker, then deploy production. Leave the test key on the test worker.

   Wrangler 4 warns if you deploy the top-level script without an environment flag, because `[env.test]` also exists. Pass an empty `--env` to mean production.

   ```bash
   cd worker
   npx wrangler@4 secret put STRIPE_SECRET_KEY --env=""
   npx wrangler@4 secret put PRICE_CABLE --env=""
   npx wrangler@4 secret put PRICE_KIT --env=""
   npx wrangler@4 deploy --env=""
   ```

    - Cable `CAB-RA20CM-MF-BLK-V1`, Payment Link `https://buy.stripe.com/00w14ncfc6EN2574tP1Fe00` → `PRICE_CABLE`
    - Kit `ENC-SAM-A9-V1`, Payment Link `https://buy.stripe.com/4gMaEXgvsgfnfVXe4p1Fe01` → `PRICE_KIT`

    Then set `checkout-config.js` `endpoint` to `https://slatesafe-checkout.slatesafe.workers.dev/`. That host is already in `connect-src`. Leave `mode` at `payment_links` until step 14.
13. In the live-mode Stripe Dashboard, turn on customer emails for successful payments (Settings → Emails). Checkout collects an email address, and Stripe sends a receipt only when that email is on. Test mode does not send receipts. `order-complete.html` does not promise one.
14. Change `checkout-config.js` `mode` from `payment_links` to `session` in a follow-up commit, and update the privacy-policy sentences that still say Payment Links.
15. Place one real live test order, then refund it.

Optional, not required for launch: move `slatesafe.com` onto Cloudflare nameservers (the site can remain a GitHub Pages target) and add `checkout.slatesafe.com` as a Worker Custom Domain. A CNAME from the current DNS host to the Worker does not work on the Free plan. See the Domain section above. Do not attach the apex to the Worker.

Shipping awkwardness to accept before launch: one server-chosen rate, free whenever the kit is in the cart, $5.75 for cable-only, tax stays $0 until Stripe Tax is actually configured, phone is required, there is no webhook so nothing fulfills automatically, and the rate limit is per Cloudflare location rather than one global cap.
