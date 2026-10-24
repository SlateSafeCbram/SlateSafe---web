'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    slatesafeLineQuantity,
    slatesafeOnPageShow,
    SESSION_MAX_QTY
} = require('./cart');

const ROOT = __dirname;

function htmlFiles() {
    const found = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === 'node_modules' || entry.name === '.git') continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.html')) found.push(full);
        }
    };
    walk(ROOT);
    return found;
}

test('line quantity clamps to 1..10 in session mode and stays 1 on payment links', () => {
    assert.equal(slatesafeLineQuantity(0, true), 1);
    assert.equal(slatesafeLineQuantity(1, true), 1);
    assert.equal(slatesafeLineQuantity(2, true), 2);
    assert.equal(slatesafeLineQuantity(SESSION_MAX_QTY + 1, true), SESSION_MAX_QTY);
    assert.equal(slatesafeLineQuantity(1.5, true), 1);
    assert.equal(slatesafeLineQuantity('2', true), 2);
    assert.equal(slatesafeLineQuantity(4, false), 1);
    assert.equal(slatesafeLineQuantity(0, false), 1);
});

test('pageshow clears checkoutBusy only for a back-forward cache restore', () => {
    const cart = { checkoutBusy: true };
    slatesafeOnPageShow({ persisted: false }, cart);
    assert.equal(cart.checkoutBusy, true);
    slatesafeOnPageShow(null, cart);
    assert.equal(cart.checkoutBusy, true);
    slatesafeOnPageShow({ persisted: true }, cart);
    assert.equal(cart.checkoutBusy, false);
});

test('cart steppers name the item and do not decrement below 1', () => {
    const steppers = htmlFiles().filter((file) => {
        return fs.readFileSync(file, 'utf8').includes('updateLineItem');
    });
    assert.ok(steppers.length >= 12);
    for (const file of steppers) {
        const html = fs.readFileSync(file, 'utf8');
        const rel = path.relative(ROOT, file);
        assert.equal(
            html.includes('@click="$store.cart.updateLineItem(item.id, item.quantity - 1)"'),
            false,
            rel
        );
        assert.match(html, /:aria-label="'Decrease quantity of ' \+ item\.title"/, rel);
        assert.match(html, /:aria-label="'Increase quantity of ' \+ item\.title"/, rel);
        assert.match(html, /:disabled="item\.quantity <= 1"/, rel);
        assert.match(
            html,
            /@click="\$store\.cart\.updateLineItem\(item\.id, Math\.max\(1, item\.quantity - 1\)\)"/,
            rel
        );
        assert.match(html, /x-show="!\$store\.cart\.sessionCheckout"/, rel);
        assert.match(html, /Quantity 1/, rel);
    }
});

test('checkout-config stays on payment links', () => {
    const source = fs.readFileSync(path.join(ROOT, 'checkout-config.js'), 'utf8');
    assert.match(source, /mode:\s*'payment_links'/);
    assert.doesNotMatch(source, /mode:\s*'session'/);
});

test('gitleaks allowlist targets generic-api-key on 8.28.0', () => {
    const config = fs.readFileSync(path.join(ROOT, '.gitleaks.toml'), 'utf8');
    const workflow = fs.readFileSync(
        path.join(ROOT, '.github', 'workflows', 'gitleaks.yml'),
        'utf8'
    );
    assert.match(config, /targetRules = \["generic-api-key"\]/);
    assert.doesNotMatch(config, /ruleIDs/);
    assert.match(workflow, /GITLEAKS_VERSION:\s*"8\.28\.0"/);
});

test('order complete page does not promise a receipt email', () => {
    const html = fs.readFileSync(path.join(ROOT, 'order-complete.html'), 'utf8');
    assert.match(html, /only when receipt emails are enabled/);
    assert.match(html, /Test mode does not send a receipt/);
    assert.match(html, /does not, by itself, confirm that the payment succeeded/);
    assert.doesNotMatch(html, /a receipt email arrives from Stripe/);
    const docs = fs.readFileSync(path.join(ROOT, 'docs', 'checkout.md'), 'utf8');
    assert.match(docs, /test-mode Price IDs/);
    assert.match(docs, /live Payment Links/);
    assert.match(docs, /https:\/\/buy\.stripe\.com\/00w14ncfc6EN2574tP1Fe00/);
    assert.match(docs, /https:\/\/buy\.stripe\.com\/4gMaEXgvsgfnfVXe4p1Fe01/);
    assert.match(docs, /turn on customer emails for successful payments/);
});
