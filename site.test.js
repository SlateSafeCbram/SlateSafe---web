'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = __dirname;
const CABLE_PDP = 'product/flat-90-degree-usb-c-ribbon-extension-cable/index.html';
const KIT_PDP = 'product/tablet-enclosure-kit-samsung-tab-a9/index.html';
const CABLE_SHIPPING = 'Ships $5.75, free with the enclosure kit';

function read(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function htmlFiles() {
    return execFileSync('git', ['ls-files', '*.html'], { cwd: ROOT, encoding: 'utf8' })
        .split('\n')
        .filter(Boolean);
}

function cableLd(html) {
    const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = re.exec(html))) {
        const block = JSON.parse(match[1]);
        if (block['@type'] === 'Product') return block;
    }
    return null;
}

test('every footer says (c) 2026', () => {
    let footers = 0;
    for (const rel of htmlFiles()) {
        const html = read(rel);
        const years = [...html.matchAll(/&copy; (\d{4}) SlateSafe/g)].map((m) => m[1]);
        assert.equal(/©\s*\d{4}/.test(html), false, `${rel} uses &copy; for the copyright`);
        for (const year of years) {
            assert.equal(year, '2026', `${rel} footer year`);
        }
        footers += years.length;
    }
    assert.ok(footers >= 11, 'all public pages have a footer copyright');
});

test('cable PDP shipping line matches the policy, JSON-LD, and worker rate', () => {
    const pdp = read(CABLE_PDP);
    assert.equal(pdp.split(CABLE_SHIPPING).length - 1, 1, 'cable PDP shows the shipping line once');
    const line = pdp.match(/<p[^>]*data-cable-shipping[^>]*>([^<]*)<\/p>/);
    assert.ok(line, 'shipping line is static HTML');
    assert.equal(line[1], CABLE_SHIPPING);
    assert.equal(/x-show|x-cloak/.test(line[0]), false, 'static PDP line renders without JS');
    const buy = pdp.indexOf('@click="buyNow()"');
    const note = pdp.indexOf('United States shipping only', buy);
    const ship = pdp.indexOf(CABLE_SHIPPING);
    assert.ok(buy > 0 && ship > buy && ship < note, 'shipping line sits after Buy and before the US-only note');

    const rate = CABLE_SHIPPING.match(/\$(\d+\.\d{2})/)[1];
    const policy = read('shipping-policy.html');
    assert.match(policy, new RegExp(`Cable-only orders ship USPS Ground for \\$${rate.replace('.', '\\.')}`));
    assert.match(policy, /Orders that include the enclosure kit ship free, including any cables\./);
    assert.equal(Number(cableLd(pdp).offers.shippingDetails.shippingRate.value), Number(rate));
    const worker = read('worker/src/checkout.js');
    assert.match(worker, new RegExp(`amount: ${Math.round(Number(rate) * 100)}, currency: 'usd'`));

    assert.equal(read(KIT_PDP).includes(CABLE_SHIPPING), false, 'kit PDP does not show the cable line');
    const generic = read('product.html');
    assert.match(
        generic,
        /data-cable-shipping x-show="productData && productData\.handle === 'flat-90-degree-usb-c-ribbon-extension-cable'"[^>]*>Ships \$5\.75, free with the enclosure kit<\/p>/,
        'product.html shows the line only for the cable'
    );
});

const GA_ORIGINS = {
    'script-src': ['https://www.googletagmanager.com'],
    'connect-src': ['https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://www.googletagmanager.com'],
    'img-src': ['https://www.google-analytics.com', 'https://www.googletagmanager.com']
};

test('pages that load analytics.js allow GA in their CSP', () => {
    let pages = 0;
    for (const rel of htmlFiles()) {
        const html = read(rel);
        if (!html.includes('src="/analytics.js"') && !html.includes('src="analytics.js"')) continue;
        pages += 1;
        const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/);
        assert.ok(csp, `${rel} has a CSP`);
        const directives = Object.fromEntries(csp[1].split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
        for (const [directive, origins] of Object.entries(GA_ORIGINS)) {
            for (const origin of origins) {
                assert.ok((directives[directive] || []).includes(origin), `${rel} ${directive} allows ${origin}`);
            }
        }
        assert.ok(html.indexOf('cookie-consent.js') < html.indexOf('analytics.js'), `${rel} loads consent before analytics`);
    }
    assert.ok(pages >= 11, 'analytics.js is on every public page');
});

function runAnalytics(consented) {
    const docListeners = {};
    const winListeners = {};
    const appended = [];
    const document = {
        head: { appendChild: (el) => appended.push(el) },
        createElement: () => ({}),
        addEventListener: (name, fn) => { (docListeners[name] = docListeners[name] || []).push(fn); }
    };
    const store = { hasConsented: () => consented };
    const Alpine = { store: (name) => (name === 'cookieConsent' ? store : undefined) };
    // The context is the browser global, so window.dataLayer and dataLayer match.
    const window = vm.createContext({
        document,
        Alpine,
        Date,
        addEventListener: (name, fn) => { (winListeners[name] = winListeners[name] || []).push(fn); }
    });
    vm.runInContext('var window = globalThis;', window);
    vm.runInContext(read('analytics.js'), window);
    for (const fn of docListeners['alpine:initialized'] || []) fn();
    return { appended, window, winListeners };
}

test('returning visitor with saved consent loads gtag once Alpine is initialized', () => {
    const { appended, window } = runAnalytics(true);
    assert.equal(appended.length, 1);
    assert.equal(appended[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-1XB9ZLWTV0');
    assert.equal(typeof window.gtag, 'function');
    window.SlateSafeAnalytics.init();
    assert.equal(appended.length, 1, 'gtag.js is not loaded twice');
});

test('no saved consent means no gtag until Accept', () => {
    const { appended, window, winListeners } = runAnalytics(false);
    assert.equal(appended.length, 0);
    assert.equal(window.gtag, undefined);
    window.SlateSafeAnalytics.trackAddToCart({ id: 'x', title: 'x', price: 1, quantity: 1 });
    assert.equal(appended.length, 0, 'events before consent do not load gtag');
    assert.ok((winListeners.cookieConsentChanged || []).length > 0, 'Accept path listener is registered');
});
