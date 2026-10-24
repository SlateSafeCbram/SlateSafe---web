# Security review

Date: 2026-10-24. Repo: public `SlateSafeCbram/SlateSafe---web`. Branch: `cursor/checkout-sessions-d418`. Scanner: gitleaks 8.28.0 (`--log-opts=--all`, 82 commits, and a `--no-git` pass over the working tree). Trufflehog was not installed and Docker was not available, so this pass did not run trufflehog.

No secret value is written below. Findings list file, commit, and type only.

## 1. Secrets — PASS for Stripe, Vercel, webhook, and .env

Full-history scan with the default gitleaks rules (allowing only `node_modules` and `package-lock.json`) found **no** `stripe-access-token`, restricted key, webhook secret (`whsec_`), Vercel token, or `.env` file. The same scan of the working tree found none of those either. GitHub issue bodies (51), issue comments (52), pull request bodies (51), and review comments (22) had no `sk_live_` / `sk_test_` / `rk_live_` / `rk_test_` / `whsec_` / `vercel_` token patterns.

`.gitignore` now ignores `.env` and `.env.*` and keeps `.env.example` (empty names only). `.github/workflows/gitleaks.yml` runs `gitleaks/gitleaks-action@v2` on pull requests with full history and sets `GITLEAKS_VERSION` to `8.28.0`. Without that pin the action installs 8.24.3, which ignores `[[allowlists]]`. That action is free on public repositories.

The unfiltered generic-api-key rule did match other tokens. They are not Stripe keys:

| Type | File | Commit | Still in the tree |
| --- | --- | --- | --- |
| generic-api-key (Web3Forms `access_key`, a public client form id) | `index.html` | `f4766c008cae` | Yes (form still uses it) |
| generic-api-key (same Web3Forms form id) | `contact.html` | `8d8e89ef86ed` | Yes |
| generic-api-key (retired Shopify Storefront token) | `shopify-cart.js`, `product-tablet-enclosure.html`, `product-usb-c-cable.html`, `contact.html` | `2134940d1938` | No |

`.gitleaks.toml` allowlists **only** rule `generic-api-key` (`targetRules`) on those five paths so CI does not fail on the public form id and the retired Storefront token. Stripe rules stay active. With that config, the full-history scan reports 0 findings.

Follow-up, not done here: in the Web3Forms dashboard, domain-lock the form to `slatesafe.com` (and rotate the form id if it was never locked). Revoke the old Shopify Storefront token if that store still exists. Do not delete the form id from the HTML until a replacement is in place, or the contact form stops working. No Stripe key was found, so no Stripe rotation is indicated by this scan.

## 2. Personal data — PASS on the current site and the live site; history still has old copy

Scanned the current tree (code, JSON, README, comments), git history, and the live pages `/`, `/products.html`, both product URLs, `/about.html`, `/contact.html`, `/returns.html`, `/privacy-policy.html`, `/terms.html`, `/shipping-policy.html`, and `/products.json` (all HTTP 200 on 2026-10-24).

Current tree and live site: no `1442`, no Pottstown Pike, no `302-367-7867` (that number is also absent from history), no `gmail.com`, no Constitution Drive. `support@slatesafe.com` and "West Chester, Pennsylvania" are the business contact and are intentional.

Historical, removed from the current tree:

- `1442 Pottstown Pike` was in `returns.html` at `70cd134` and removed in `fba48c0`.
- `806 Constitution Drive` was added on public pages in `fba48c0` (`about.html`, `contact.html`, `privacy-policy.html`, `returns.html`, `terms.html`) and removed in `3f22863` ("Remove residential street address from public pages"). It is not on the site now. It is acceptable only where a future page states it on purpose as the business returns address.
- A personal Gmail address appeared in old `README.md` and `contact.html` copy in `2ebaf5496564`, `7a21b7ca21a9`, `2134940d1938`, and `8d8e89ef86ed`. It is not a commit author. The local part is omitted here. It is gone from the current files.

Commit authors across all branches:

| Author mailbox | Domain / type | Commits |
| --- | --- | --- |
| `cbrammell@slatesafe.com` | company domain | 84 |
| `cursoragent@cursor.com` | vendor automation | 41 |
| `206951365+cursor[bot]@users.noreply.github.com` | GitHub noreply | 3 |

No personal Gmail author. Chris already commits with the company domain. GitHub's noreply address (`ID+username@users.noreply.github.com`) is worth turning on if that company mailbox should not stay in a public history. This PR does not rewrite history.

## 3. Checkout function — PASS (implemented in this PR)

`api/create-checkout-session.js` and `api/checkout-lib.js`:

- Server maps SKU → Price ID from `PRICE_CABLE` and `PRICE_KIT`. The browser sends only `{ sku, qty }`. No client amount is accepted (extra fields are rejected).
- SKU allowlist is the two `products.json` SKUs. Quantity is an integer 1–10 per SKU after duplicates are summed. At most 2 lines.
- CORS allows exactly `https://slatesafe.com` and `https://www.slatesafe.com`. Other origins get 403 and no `Access-Control-Allow-Origin`. `OPTIONS` and `POST` only.
- Body must be `application/json`, at most 4096 bytes, and a JSON array of objects whose only keys are `sku` and `qty`.
- Every client error is `{ "error": "Unable to start checkout." }`. Stripe error text and stack traces are not returned. Server logs are the fixed strings `checkout_misconfigured`, `checkout_bad_redirect`, and `checkout_failed`.
- Redirect URL must start with `https://checkout.stripe.com/`.
- Abuse controls that fit Vercel Hobby: exact Origin check, 4096-byte cap, idempotency key (`^[A-Za-z0-9_-]{16,200}$`, or a hash of origin + cart when the header is omitted), and an in-memory token bucket of 8 requests per 60 seconds per IP **per instance**. The bucket does not span instances, and the first `x-forwarded-for` hop is what the platform sets. This is not a global rate limit.
- Command-deck contract: session `metadata.source` is `slatesafe-cart` and `metadata.cart` is `SKU:qty,SKU:qty`. One kit and two cables is exactly `ENC-SAM-A9-V1:1,CAB-RA20CM-MF-BLK-V1:2` (kit, then cable), whatever order the browser posted. Each line item is `{ price, quantity, metadata: { sku } }`. Stripe Checkout line items accept that metadata next to a Price ID, so `price_data` is not used.

`npm test` (`node --test api/checkout-lib.test.js`): 10 passing, including that metadata case and the mocked 1 kit + 2 cables session. No real Stripe key was available, so `scripts/checkout-session-e2e.mjs` was not run against Stripe. `stripe/stripe-mock` was not used; the mocked client covers the required session shape.

## 4. Restricted key and webhooks — PASS (documented; no webhook in this PR)

Minimum restricted-key scope is **Checkout Sessions: Write**. The function passes Price IDs and does not retrieve Prices or Products, so those read scopes are not required. Do not use a secret key (`sk_`).

This PR does not add a webhook. Fulfillment is not automated. A later webhook must verify the `Stripe-Signature` against a webhook secret stored only in Vercel and must not trust the unsigned body.

## 5. Site — PASS with a flagged CSP residual

- Alpine.js is pinned to 3.13.5 and every copy has SRI `sha384-BxpSbjbDhVKwnC1UfcjsNEuMuxg4af5IXOaSi1Iq5rASQ/9a7uslhEXbP9UI/fXo` and `crossorigin="anonymous"`.
- GitHub Pages cannot set a CSP response header. A `Content-Security-Policy` meta tag is on each HTML page. It allows the Alpine CDN, Google Analytics (after the existing consent loader), Google Fonts, Web3Forms, YouTube, Gumlet, and `https://checkout.slatesafe.com`.
- Alpine's stock CDN build evaluates expressions, so the meta CSP includes `'unsafe-eval'`. It also includes `'unsafe-inline'` because several pages have inline scripts and style attributes. `@alpinejs/csp` was not adopted: the cart and product pages use `@click="$store..."` expressions that the CSP build rejects. **Flag: this CSP does not stop an injected inline script or an eval-based XSS. It does block new script hosts, mixed content upgrades, and unexpected form posts.**
- `frame-src` includes `'self'` because the product gallery mounts an iframe for every media item, including local images. `img-src` includes YouTube hosts because hidden gallery nodes request embed URLs as images.
- Mixed content: no `http://` script, image, or frame URLs in the pages. `http://` in `sitemap.xml` and `logo.svg` is an XML namespace, not a resource load.
- Local 375px check (Chrome, `http://127.0.0.1:8765`): default mode stays `payment_links`, `scrollWidth` is 375, Alpine loads with the SRI tag, and a session-mode override (not committed) held a kit at qty 1 plus a cable at qty 2, total $79.98, with the cable-bundle notice hidden.

GitHub settings read with this token:

| Setting | Result |
| --- | --- |
| Secret scanning | **unknown** (API 403, `security_and_analysis` is null) |
| Push protection | **unknown** (not separately readable; same 403) |
| Dependabot alerts | **off** (API: "Dependabot alerts are disabled for this repository.") |
| Branch protection on `main` | **unknown** (API 403, needs administration read) |

## 6. Vercel — PASS as documentation; the dashboard steps are not applied from here

`docs/checkout.md` tells Chris to:

- Keep `slatesafe.com` on GitHub Pages. Attach only `checkout.slatesafe.com` to Vercel.
- Put `STRIPE_SECRET_KEY`, `PRICE_CABLE`, and `PRICE_KIT` in Vercel sensitive env vars, never in git or the browser.
- Either disable Preview deployments, or give Preview only the test restricted key and test Price IDs. Production is the only environment that should hold the live key.
- Turn on Deployment Protection for Preview if previews stay enabled.

## Only Chris can change

GitHub (repo is public):

1. Enable Dependabot alerts (currently off). Enable Dependabot security updates if you want PRs for them.
2. Confirm secret scanning is on, and turn on push protection for public repos if the plan allows it. This token could not read either switch.
3. Confirm branch protection on `main` (this token got 403). Require the gitleaks check once the workflow has run once.
4. Optional: set the GitHub commit email to the noreply address if `cbrammell@slatesafe.com` should not remain on new public commits.
5. Do not rewrite git history from this PR. If the old personal Gmail or the `1442 Pottstown Pike` line must disappear from clones, that is a history rewrite Chris has to choose.

Stripe:

1. Create an `rk_test_` restricted key with **Checkout Sessions: Write** only. No Prices or Products read. No webhook in this change.
2. For the first end-to-end run, copy **test-mode** Price IDs into `PRICE_CABLE` and `PRICE_KIT`. The live Payment Link prices do not work with an `rk_test_` key (see `docs/checkout.md`).
3. Optional, preferred by the command-deck parser: set each Price `lookup_key` to its SKU (`CAB-RA20CM-MF-BLK-V1`, `ENC-SAM-A9-V1`). Checkout does not read lookup keys.
4. Confirm Stripe Tax registration and product tax codes, or accept that `automatic_tax` collects $0 until then.
5. After a test-mode purchase works, create the live `rk_live_` key with the same single scope, copy the live Payment Link Price IDs into Production, turn on successful-payment receipt emails, and put the live key only in Vercel Production.
6. No Stripe key rotation is indicated by the scan. Domain-lock or rotate the Web3Forms form id, and revoke the retired Shopify Storefront token if that store still exists.

Vercel:

1. Hobby project, root = this repo. Do not add `slatesafe.com` as a domain.
2. Sensitive env vars as named above. Preview gets the test key or no preview deployments. Production gets the live key only after the test purchase.
3. Deployment Protection on Preview.
4. DNS CNAME `checkout.slatesafe.com` to the Vercel target. Do not move the apex off GitHub Pages.

Launch follow-up after those steps: flip `checkout-config.js` `mode` to `session`, and update the privacy-policy sentences that still say Payment Links. This pull request leaves the flag at `payment_links` and must not be merged until that checklist is accepted.
