'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    slatesafeLineQuantity,
    slatesafeOnPageShow,
    slatesafeLinePriceLabel,
    slatesafeSessionBuyQuantity,
    slatesafeClearCartIfCheckoutSession,
    CHECKOUT_CLIENT_ERROR,
    SLATESAFE_CART_KEY,
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

test('line price shows a total once quantity is 2 or more', () => {
    assert.equal(slatesafeLinePriceLabel(11.99, 1), '$11.99');
    assert.equal(slatesafeLinePriceLabel(11.99, 2), '$23.98 ($11.99 each)');
    assert.equal(slatesafeLinePriceLabel(11.99, 3), '$35.97 ($11.99 each)');
    assert.equal(slatesafeLinePriceLabel(56, 2), '$112.00 ($56.00 each)');
    assert.equal(slatesafeLinePriceLabel(11.99, 10), '$119.90 ($11.99 each)');
    assert.equal(slatesafeLinePriceLabel(11.99, 0), '$11.99');
});

test('session buy keeps a chosen quantity from 1 to 10', () => {
    assert.deepEqual(slatesafeSessionBuyQuantity(3), { quantity: 3 });
    assert.deepEqual(slatesafeSessionBuyQuantity('2'), { quantity: 2 });
    assert.equal(slatesafeSessionBuyQuantity(0).error, 'Please enter a valid quantity');
    assert.equal(slatesafeSessionBuyQuantity(1.5).error, 'Please enter a valid quantity');
    assert.equal(slatesafeSessionBuyQuantity(11).error, 'Maximum quantity is 10.');
});

test('checkout session return clears the stored cart and badge counts', () => {
    const storage = {
        removed: null,
        removeItem(key) { this.removed = key; }
    };
    const cart = {
        items: [{ id: 'cable', quantity: 3 }],
        itemCount: 3,
        total: 35.97,
        recalculate() {
            this.itemCount = this.items.reduce((sum, item) => sum + item.quantity, 0);
            this.total = this.itemCount ? this.total : 0;
        }
    };
    assert.equal(
        slatesafeClearCartIfCheckoutSession('?session_id=cs_test_example', cart, storage),
        true
    );
    assert.equal(cart.items.length, 0);
    assert.equal(cart.itemCount, 0);
    assert.equal(cart.total, 0);
    assert.equal(storage.removed, SLATESAFE_CART_KEY);

    const kept = {
        items: [{ quantity: 1 }],
        itemCount: 1,
        recalculate() { throw new Error('should not clear'); }
    };
    const untouched = { removed: null, removeItem(key) { this.removed = key; } };
    assert.equal(slatesafeClearCartIfCheckoutSession('', kept, untouched), false);
    assert.equal(slatesafeClearCartIfCheckoutSession('?session_id=plink_example', kept, untouched), false);
    assert.equal(kept.itemCount, 1);
    assert.equal(untouched.removed, null);
});

test('checkout failure copy points buyers to support', () => {
    assert.equal(
        CHECKOUT_CLIENT_ERROR,
        "We couldn't start checkout. Please try again, or email support@slatesafe.com."
    );
    const worker = fs.readFileSync(path.join(ROOT, 'worker', 'src', 'checkout.js'), 'utf8');
    assert.match(worker, /Unable to start checkout\./);
});

test('cart drawers show line totals, stop at 10, and mention kit shipping', () => {
    const drawers = htmlFiles().filter((file) => {
        return fs.readFileSync(file, 'utf8').includes('linePriceLabel');
    });
    assert.ok(drawers.length >= 12);
    for (const file of drawers) {
        const html = fs.readFileSync(file, 'utf8');
        const rel = path.relative(ROOT, file);
        assert.match(html, /:disabled="item\.quantity >= 10"/, rel);
        assert.match(html, /Free shipping when your order includes the kit\./, rel);
        assert.match(html, /\$store\.cart\.linePriceLabel\(item\)/, rel);
    }
});

test('product buy passes the selected quantity and drops the old shipping claim', () => {
    const dynamic = fs.readFileSync(path.join(ROOT, 'product.html'), 'utf8');
    const kit = fs.readFileSync(path.join(ROOT, 'product', 'tablet-enclosure-kit-samsung-tab-a9', 'index.html'), 'utf8');
    const cable = fs.readFileSync(path.join(ROOT, 'product', 'flat-90-degree-usb-c-ribbon-extension-cable', 'index.html'), 'utf8');
    assert.match(dynamic, /buyProduct\(id, this\.quantity\)/);
    assert.match(kit, /buyProduct\(this\.sku, this\.quantity\)/);
    assert.match(cable, /buyProduct\(this\.sku, this\.quantity\)/);
    assert.match(dynamic, /min-h-11/);
    assert.match(fs.readFileSync(path.join(ROOT, 'cart-drawer.html'), 'utf8'), /removeLineItem\(item\.id\)[\s\S]{0,220}min-h-11/);
    for (const file of htmlFiles()) {
        const html = fs.readFileSync(file, 'utf8');
        assert.equal(html.includes('Free shipping on orders over $40'), false, path.relative(ROOT, file));
    }
    const policy = fs.readFileSync(path.join(ROOT, 'shipping-policy.html'), 'utf8');
    assert.match(
        policy,
        /Orders that include the enclosure kit ship free, including any cables\. Cable-only orders ship USPS Ground for \$5\.75\./
    );
});

test('order complete clears the cart only for a checkout session id', () => {
    const html = fs.readFileSync(path.join(ROOT, 'order-complete.html'), 'utf8');
    assert.match(html, /src="cart\.js"/);
    assert.match(html, /slatesafeClearCartIfCheckoutSession\(window\.location\.search, cart\)/);
});

test('toast dismiss control is a 44px target', () => {
    const pages = htmlFiles().filter((file) => fs.readFileSync(file, 'utf8').includes('toast.remove'));
    assert.ok(pages.length >= 10);
    for (const file of pages) {
        const html = fs.readFileSync(file, 'utf8');
        assert.match(
            html,
            /toast\.remove\(toast\.id\)" class="inline-flex items-center justify-center flex-shrink-0 min-h-11 min-w-11/,
            path.relative(ROOT, file)
        );
    }
});
