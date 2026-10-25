# Security review

Date: 2026-10-24. Repo: public `SlateSafeCbram/SlateSafe---web`. Branch: `cursor/checkout-sessions-d418`. Scanner: gitleaks 8.28.0 (`--log-opts=--all`, 82 commits, and a `--no-git` pass over the working tree). Trufflehog was not installed and Docker was not available, so this pass did not run trufflehog.

No secret value is written below. Findings list file, commit, and type only.

## 1. Secrets — PASS for Stripe, webhook, and .env

Full-history scan with the default gitleaks rules (allowing only `node_modules` and `package-lock.json`) found **no** `stripe-access-token`, restricted key, webhook secret (`whsec_`), Vercel token, or `.env` file. The same scan of the working tree found none of those either. GitHub issue bodies (51), issue comments (52), pull request bodies (51), and review comments (22) had no `sk_live_` / `sk_test_` / `rk_live_` / `rk_test_` / `whsec_` / `vercel_` token patterns. `worker/wrangler.toml` has no `account_id` and no secret values. Stripe keys are wrangler secrets, not files in git.

`.gitignore` ignores `.env`, `.env.*` (keeps `.env.example`, names only), and `.dev.vars` (wrangler's local secret file). `worker/.dev.vars.example` lists empty names only. `.github/workflows/gitleaks.yml` runs `gitleaks/gitleaks-action@v2` on pull requests with full history and sets `GITLEAKS_VERSION` to `8.28.0`. Without that pin the action installs 8.24.3, which ignores `[[allowlists]]`. That action is free on public repositories.

The unfiltered generic-api-key rule did match other tokens. They are not Stripe keys:

| Type | File | Commit | Still in the tree |
| --- | --- | --- | --- |
| generic-api-key (Web3Forms `access_key`, a public client form id) | `index.html` | `f4766c008cae` | Yes (form still uses it) |
| generic-api-key (same Web3Forms form id) | `contact.html` | `8d8e89ef86ed` | Yes |
| generic-api-key (retired Shopify Storefront token) | `shopify-cart.js`, `product-tablet-enclosure.html`, `product-usb-c-cable.html`, `contact.html` | `2134940d1938` | No |

`.gitleaks.toml` allowlists **only** rule `generic-api-key` (`targetRules`) on those five paths so a scan does not fail on the public form id and the retired Storefront token. Stripe rules stay active. gitleaks 8.28.0 does not apply a `targetRules` allowlist when `[extend] useDefault = true` (the targeted allowlist is attached only when `extendDepth` is still 0, and loading the default config increments that first). A regex of the extracted tokens was not added: it would copy those values into git, and this binary would not apply it for the same reason. A full-history scan with this binary still reports those 6 `generic-api-key` hits and no Stripe keys. Dropping `targetRules` would hide every rule on those paths, including a future Stripe key, so the file keeps it. `gitleaks-action@v2` scans the pull request with `--no-merges --first-parent`. Replacing that with `--all` would fail the job on those 6 hits. The job reported no leaks on `f9f7e5b`.

Follow-up, not done here: in the Web3Forms dashboard, domain-lock the form to `slatesafe.com` (and rotate the form id if it was never locked). Revoke the old Shopify Storefront token if that store still exists. Do not delete the form id from the HTML until a replacement is in place, or the contact form stops working. No Stripe key was found, so no Stripe rotation is indicated by this scan.

## 2. Personal data — PASS on the current site and the live site; history still has old copy

Scanned the current tree (code, JSON, README, comments), git history, and the live pages `/`, `/products.html`, both product URLs, `/about.html`, `/contact.html`, `/returns.html`, `/privacy-policy.html`, `/terms.html`, `/shipping-policy.html`, and `/products.json` (all HTTP 200 on 2026-10-24).

Current tree and live site: no personal phone number, no former street address, and no former mailbox address. A personal phone number appeared in earlier commits on this PR branch, was redacted in `1fe15cc`, and PR #52 must be squash-merged so it never reaches `main`'s history. No `gmail.com`. `support@slatesafe.com` and "West Chester, Pennsylvania" are the business contact and are intentional.

Historical, removed from the current tree:

- A former street address was in `returns.html` at `70cd134` and removed in `fba48c0`.
- A former street address was added on public pages in `fba48c0` (`about.html`, `contact.html`, `privacy-policy.html`, `returns.html`, `terms.html`) and removed in `3f22863`. It is not on the site now. It is acceptable only where a future page states the official business address on purpose as the business returns address.
- A personal Gmail address appeared in old `README.md` and `contact.html` copy in `2ebaf5496564`, `7a21b7ca21a9`, `2134940d1938`, and `8d8e89ef86ed`. It is not a commit author. The local part is omitted here. It is gone from the current files.

Commit authors across all branches:

| Author mailbox | Domain / type | Commits |
| --- | --- | --- |
| `cbrammell@slatesafe.com` | company domain | 84 |
| `cursoragent@cursor.com` | vendor automation | 41 |
| `206951365+cursor[bot]@users.noreply.github.com` | GitHub noreply | 3 |

No personal Gmail author. Chris already commits with the company domain. GitHub's noreply address (`ID+username@users.noreply.github.com`) is worth turning on if that company mailbox should not stay in a public history. This PR does not rewrite history.

## 3. Checkout function — PASS (implemented in this PR)

`worker/src/index.js` and `worker/src/checkout.js` (Cloudflare Worker, Workers Free). The Vercel function and `vercel.json` are removed.

- Server maps SKU → Price ID from `PRICE_CABLE` and `PRICE_KIT`. The browser sends only `{ sku, qty }`. No client amount is accepted (extra fields are rejected).
- SKU allowlist is the two `products.json` SKUs. Quantity is an integer 1–10 per SKU after duplicates are summed. At most 2 lines.
- CORS allows exactly `https://slatesafe.com` and `https://www.slatesafe.com`. Other origins get 403 and no `Access-Control-Allow-Origin`. `OPTIONS` and `POST` only.
- Body must be `application/json`, at most 4096 bytes (declared Content-Length and bytes read from the stream), and a JSON array of objects whose only keys are `sku` and `qty`.
- Every client error is `{ "error": "Unable to start checkout." }`. Stripe error text and stack traces are not returned. Server logs are the fixed strings `checkout_misconfigured`, `checkout_bad_redirect`, `checkout_failed`, `checkout_rate_limit_unbound`, and `checkout_rate_limit_failed`.
- Redirect URL must start with `https://checkout.stripe.com/`.
- Abuse controls: exact Origin check, 4096-byte cap, idempotency key (`^[A-Za-z0-9_-]{16,200}$`, or a hash of origin + cart when the header is omitted), and the Workers Rate Limiting binding (`[[ratelimits]]`, name `CHECKOUT_RATE_LIMITER`). Limit 8 per 60 seconds, key `CF-Connecting-IP` (set by Cloudflare, not the client). The binding is GA and the docs do not gate it to a paid plan ([Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), updated Oct 21, 2026; [GA](https://developers.cloudflare.com/changelog/post/2025-09-19-ratelimit-workers-ga/), Sept 19, 2025). Counts are approximate and per Cloudflare location, not a strict global cap. A missing or throwing binding fails closed (HTTP 500, Stripe not called). Test `namespace_id` is `1002`; production is `1001`.
- The workers.dev subdomain is `slatesafe`. Launch state points `checkout-config.js` at `https://slatesafe-checkout.slatesafe.workers.dev/` with `mode` `session`. The production worker secrets are `PRICE_CABLE`, `PRICE_KIT`, and `STRIPE_SECRET_KEY` (an `rk_live_` key with Checkout Sessions Write only). The deployed test worker remains `https://slatesafe-checkout-test.slatesafe.workers.dev/`. Both hosts are in CSP `connect-src`. Rollback is `mode: 'payment_links'` in `checkout-config.js`. The URL is reachable by anyone. Origin is a browser control, not authentication. `preview_urls` is false. Secrets are `wrangler secret put` per environment, not `[vars]`, not git, and not a preview deployment that inherits the live key. `wrangler.toml` has no `account_id`. On 2026-10-24 the test worker had `STRIPE_SECRET_KEY`, `PRICE_CABLE`, and `PRICE_KIT` set as secrets, and the scripted 1 kit + 2 cables check returned HTTP 200 with a `cs_test_` Checkout URL.
- stripe-node uses `Stripe.createFetchHttpClient()`, API `2026-09-30.endive`, timeout 4000ms, one retry. Workers Free CPU is 10ms per request; waiting on Stripe is not CPU. A consistent error 1102 would be that CPU limit, and the buyer would see Cloudflare's page rather than the JSON error.
- Command-deck contract: session `metadata.source` is `slatesafe-cart` and `metadata.cart` is `SKU:qty,SKU:qty`. One kit and two cables is exactly `ENC-SAM-A9-V1:1,CAB-RA20CM-MF-BLK-V1:2` (kit, then cable), whatever order the browser posted. Each line item is `{ price, quantity, metadata: { sku } }`. Stripe Checkout line items accept that metadata next to a Price ID, so `price_data` is not used.

`npm test` runs `worker/src/checkout.test.js`, `worker/src/stripe-client.test.js`, and `cart.test.js`: 29 passing, including the metadata case, the mocked 1 kit + 2 cables session, the rate-limit binding, and the fetch HTTP client. On 2026-10-24, `scripts/checkout-session-e2e.mjs` ran against the deployed test Worker and returned HTTP 200 with a `cs_test_` Checkout URL for 1 kit and 2 cables. `stripe/stripe-mock` was not used; the mocked client covers the required session shape. Miniflare was not added: Node's `Request` / `Response` / `crypto.subtle` cover the handler.

## 4. Restricted key and webhooks — PASS (documented; no webhook in this PR)

Minimum restricted-key scope is **Checkout Sessions: Write**. The function passes Price IDs and does not retrieve Prices or Products, so those read scopes are not required. Do not use a secret key (`sk_`).

This PR does not add a webhook. Fulfillment is not automated. A later webhook must verify the `Stripe-Signature` against a webhook secret stored only with `wrangler secret put` and must not trust the unsigned body.

## 5. Site — PASS with a flagged CSP residual

- Alpine.js is pinned to 3.13.5 and every copy has SRI `sha384-BxpSbjbDhVKwnC1UfcjsNEuMuxg4af5IXOaSi1Iq5rASQ/9a7uslhEXbP9UI/fXo` and `crossorigin="anonymous"`.
- GitHub Pages cannot set a CSP response header. A `Content-Security-Policy` meta tag is on each HTML page. It allows the Alpine CDN, Google Analytics (after the existing consent loader), Google Fonts, Web3Forms, YouTube, Gumlet, and both checkout hosts (`https://slatesafe-checkout-test.slatesafe.workers.dev` and `https://slatesafe-checkout.slatesafe.workers.dev`). `*.workers.dev` is not used: a CSP wildcard matches one label, and these hosts have two.
- Alpine's stock CDN build evaluates expressions, so the meta CSP includes `'unsafe-eval'`. It also includes `'unsafe-inline'` because several pages have inline scripts and style attributes. `@alpinejs/csp` was not adopted: the cart and product pages use `@click="$store..."` expressions that the CSP build rejects. **Flag: this CSP does not stop an injected inline script or an eval-based XSS. It does block new script hosts, mixed content upgrades, and unexpected form posts.**
- `frame-src` includes `'self'` because the product gallery mounts an iframe for every media item, including local images. `img-src` includes YouTube hosts because hidden gallery nodes request embed URLs as images.
- Mixed content: no `http://` script, image, or frame URLs in the pages. `http://` in `sitemap.xml` and `logo.svg` is an XML namespace, not a resource load.
- Local 375px check (Chrome, `http://127.0.0.1:8765`) for this launch commit: `mode` is `session`, the endpoint is the production worker, `scrollWidth` is 375, the quantity field accepts 1 to 10, posted prices are unchanged, and the kit-shipping hint is visible. Alpine still loads with the SRI tag.

GitHub settings read with this token:

| Setting | Result |
| --- | --- |
| Secret scanning | **unknown** (API 403, `security_and_analysis` is null) |
| Push protection | **unknown** (not separately readable; same 403) |
| Dependabot alerts | **off** (API: "Dependabot alerts are disabled for this repository.") |
| Branch protection on `main` | **unknown** (API 403, needs administration read) |

## 6. Cloudflare Workers — PASS as documentation; the dashboard steps are not applied from here

The function is a Worker on the Workers Free plan. `docs/checkout.md` tells Chris to:

- Keep `slatesafe.com` on GitHub Pages. Do not move nameservers for launch. Use the workers.dev host. A CNAME to `checkout.slatesafe.com` does not work on the Free plan while DNS stays off Cloudflare (Custom Domains and Routes need an active zone; partial CNAME setup is Business or Enterprise; Cloudflare for SaaS needs a zone on Cloudflare and payment info on non-enterprise plans).
- Put `STRIPE_SECRET_KEY`, `PRICE_CABLE`, and `PRICE_KIT` in with `wrangler secret put`, once per environment. `[env.test]` gets the `rk_test_` key and test Price IDs. Production gets the live key only after the test purchase. Nothing is committed. `account_id` stays out of `wrangler.toml`.
- Leave `preview_urls` false. Do not use `wrangler dev --remote` against production. Local `.dev.vars` is gitignored and should hold the test key only.
- The rate-limit binding is the free control. It is not a global hard cap (per location, approximate). The workers.dev URL is public. Origin checks do not authenticate non-browser clients.

## Only Chris can change

GitHub (repo is public):

1. Enable Dependabot alerts (currently off). Enable Dependabot security updates if you want PRs for them.
2. Confirm secret scanning is on, and turn on push protection for public repos if the plan allows it. This token could not read either switch.
3. Confirm branch protection on `main` (this token got 403). Require the gitleaks check once the workflow has run once.
4. Optional: set the GitHub commit email to the noreply address if `cbrammell@slatesafe.com` should not remain on new public commits.
5. Do not rewrite git history from this PR. If the old personal Gmail or a former street address must disappear from clones, that is a history rewrite Chris has to choose.

Stripe:

1. Create an `rk_test_` restricted key with **Checkout Sessions: Write** only. No Prices or Products read. No webhook in this change.
2. For the first end-to-end run, copy **test-mode** Price IDs into `PRICE_CABLE` and `PRICE_KIT`. The live Payment Link prices do not work with an `rk_test_` key (see `docs/checkout.md`).
3. Optional, preferred by the command-deck parser: set each Price `lookup_key` to its SKU (`CAB-RA20CM-MF-BLK-V1`, `ENC-SAM-A9-V1`). Checkout does not read lookup keys.
4. Confirm Stripe Tax registration and product tax codes, or accept that `automatic_tax` collects $0 until then.
5. After a test-mode purchase works, create the live `rk_live_` key with the same single scope, copy the live Payment Link Price IDs into the production Worker with `wrangler secret put` (no `--env`), turn on successful-payment receipt emails, and do not put the live key on the test worker.
6. No Stripe key rotation is indicated by the scan. Domain-lock or rotate the Web3Forms form id, and revoke the retired Shopify Storefront token if that store still exists.

Cloudflare:

1. Free account. Workers Free. Do not move `slatesafe.com` nameservers for this launch. Enable the workers.dev subdomain.
2. `npx wrangler@4 login` (4.36.0 or later). `npx wrangler deploy --env test` from `worker/`. Then `wrangler secret put` for `STRIPE_SECRET_KEY`, `PRICE_CABLE`, and `PRICE_KIT` with `--env test`.
3. Test worker `https://slatesafe-checkout-test.slatesafe.workers.dev/` is deployed with the rate limiter, and its three secrets are set. CSP names that host and `https://slatesafe-checkout.slatesafe.workers.dev`. Launch state points `SLATESAFE_CHECKOUT_ENDPOINT` at the production host. Production secrets are `PRICE_CABLE`, `PRICE_KIT`, and `STRIPE_SECRET_KEY` (`rk_live_`, Checkout Sessions Write only). Do not add an `account_id` to the repo.
4. Leave `preview_urls` false. Do not commit `.dev.vars`. Do not put secrets in `[vars]`.
5. Optional later: move the zone to Cloudflare and add a Custom Domain. A CNAME while DNS stays at Vercel is not available on the Free plan. Buyers still see `checkout.stripe.com`; the workers.dev host is only in devtools and the POST.

This pull request is the go-live change. `checkout-config.js` `mode` is `session`, the endpoint is the production worker, and privacy and terms describe a secure Stripe Checkout page. Rollback is `mode: 'payment_links'`. A squash merge launches that cart. Do not rewrite history.
