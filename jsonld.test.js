'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;

const PRODUCT_PAGES = [
    'product/tablet-enclosure-kit-samsung-tab-a9/index.html',
    'product/flat-90-degree-usb-c-ribbon-extension-cable/index.html',
    'products/tablet-enclosure-kit-samsung-tab-a9.html',
    'products/flat-90-degree-usb-c-ribbon-extension-cable.html'
];

const CANONICAL_PRODUCT_PAGES = PRODUCT_PAGES.filter((file) => file.startsWith('product/'));

function read(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function jsonLdBlocks(html, rel) {
    const blocks = [];
    const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = re.exec(html))) {
        let parsed;
        try {
            parsed = JSON.parse(match[1]);
        } catch (err) {
            assert.fail(`${rel} has a JSON-LD block that JSON.parse rejected: ${err.message}`);
        }
        blocks.push(parsed);
    }
    return blocks;
}

function catalog() {
    const data = JSON.parse(read('products.json'));
    const bySku = new Map();
    for (const product of data.products) {
        bySku.set(product.sku, product);
    }
    return bySku;
}

function policyShipping(policyHtml) {
    const cable = policyHtml.match(/USB-C cable:<\/strong>\s*USPS Ground \$(\d+\.\d{2})/);
    const cableOnly = policyHtml.match(/Cable-only orders ship USPS Ground for \$(\d+\.\d{2})/);
    assert.ok(cable, 'shipping-policy.html states the USB-C cable USPS Ground rate');
    assert.ok(cableOnly, 'shipping-policy.html states the cable-only USPS Ground rate');
    assert.equal(cable[1], cableOnly[1]);
    assert.match(policyHtml, /Samsung Tab A11\+ \/ A9\+ enclosure:<\/strong>\s*USPS Ground free/);
    assert.match(policyHtml, /Orders that include the enclosure kit ship free, including any cables\./);
    assert.match(policyHtml, /United States shipping addresses/);

    const handling = policyHtml.match(/prepared for shipment within <strong>(\d+)-(\d+) business days<\/strong>/);
    const transit = policyHtml.match(/Typically delivered in <strong>(\d+)-(\d+) business days<\/strong>/);

    return {
        cable: Number(cable[1]),
        kit: 0,
        handling: handling ? { min: Number(handling[1]), max: Number(handling[2]) } : null,
        transit: transit ? { min: Number(transit[1]), max: Number(transit[2]) } : null
    };
}

function rateForProduct(product, rates) {
    if (product.category === 'cables') return rates.cable;
    if (product.category === 'enclosures') return rates.kit;
    assert.fail(`no shipping-policy rate mapped for ${product.sku}`);
}

function assertTime(label, actual, expected) {
    if (!expected) {
        assert.equal(actual, undefined, `${label} is omitted because the shipping policy does not state it`);
        return;
    }
    assert.equal(actual['@type'], 'QuantitativeValue', label);
    assert.equal(actual.minValue, expected.min, label);
    assert.equal(actual.maxValue, expected.max, label);
    assert.equal(actual.unitCode, 'DAY', label);
}

function offersFrom(blocks) {
    const offers = [];
    for (const block of blocks) {
        if (block['@type'] === 'Product' && block.offers) offers.push(block);
    }
    return offers;
}

test('product JSON-LD parses, matches products.json prices, and matches the shipping policy', () => {
    const bySku = catalog();
    const rates = policyShipping(read('shipping-policy.html'));
    const returns = read('returns.html');
    const windowDays = returns.match(/(\d+) days after receiving your item to request a return/);
    assert.ok(windowDays, 'returns.html states the return window');
    assert.match(returns, /Approved returns must be sent by mail\./);
    assert.match(returns, /For change-of-mind returns, you pay return shipping\./);
    assert.match(returns, /If we sent the wrong item or it arrives defective\/damaged, we cover return shipping\./);
    assert.match(returns, /No restocking fee when the return meets the unused \/ original-packaging rules\./);
    assert.match(returns, /We do not provide prepaid return labels for change-of-mind returns\./);
    assert.match(returns, /United States addresses only\./);

    let canonicalOffers = 0;
    for (const rel of PRODUCT_PAGES) {
        const html = read(rel);
        const blocks = jsonLdBlocks(html, rel);
        const products = offersFrom(blocks);
        const canonical = CANONICAL_PRODUCT_PAGES.includes(rel);

        if (canonical) {
            assert.equal(products.length, 1, `${rel} has one Product offer`);
            const crumbs = blocks.filter((block) => block['@type'] === 'BreadcrumbList');
            assert.equal(crumbs.length, 1, `${rel} has a separate BreadcrumbList`);
            assert.equal(blocks.length, 2, `${rel} JSON-LD is the product block plus the breadcrumb block`);
            canonicalOffers += 1;
        }

        for (const productLd of products) {
            const product = bySku.get(productLd.sku);
            assert.ok(product, `${rel} sku ${productLd.sku} is in products.json`);
            const offer = productLd.offers;
            assert.equal(offer['@type'], 'Offer');
            assert.equal(Number(offer.price), product.price, `${product.sku} offer price`);
            assert.equal(offer.priceCurrency, 'USD');

            const shipping = offer.shippingDetails;
            assert.equal(shipping['@type'], 'OfferShippingDetails');
            assert.equal(shipping.name, 'USPS Ground');
            assert.equal(shipping.shippingDestination['@type'], 'DefinedRegion');
            assert.equal(shipping.shippingDestination.addressCountry, 'US');
            assert.equal(shipping.shippingRate['@type'], 'MonetaryAmount');
            assert.equal(shipping.shippingRate.currency, 'USD');
            assert.equal(Number(shipping.shippingRate.value), rateForProduct(product, rates), `${product.sku} shipping rate`);
            assert.equal(shipping.deliveryTime['@type'], 'ShippingDeliveryTime');
            assertTime(`${product.sku} handlingTime`, shipping.deliveryTime.handlingTime, rates.handling);
            assertTime(`${product.sku} transitTime`, shipping.deliveryTime.transitTime, rates.transit);

            const policy = offer.hasMerchantReturnPolicy;
            assert.equal(policy['@type'], 'MerchantReturnPolicy');
            assert.equal(policy.applicableCountry, 'US');
            assert.equal(policy.returnPolicyCategory, 'https://schema.org/MerchantReturnFiniteReturnWindow');
            assert.equal(policy.merchantReturnDays, Number(windowDays[1]));
            assert.equal(policy.returnMethod, 'https://schema.org/ReturnByMail');
            assert.equal(policy.returnFees, 'https://schema.org/ReturnFeesCustomerResponsibility');
            assert.equal(policy.customerRemorseReturnFees, 'https://schema.org/ReturnFeesCustomerResponsibility');
            assert.equal(policy.customerRemorseReturnLabelSource, 'https://schema.org/ReturnLabelCustomerResponsibility');
            assert.equal(policy.itemDefectReturnFees, 'https://schema.org/FreeReturn');
            assert.equal(policy.restockingFee['@type'], 'MonetaryAmount');
            assert.equal(Number(policy.restockingFee.value), 0);
            assert.equal(policy.restockingFee.currency, 'USD');
            assert.equal(policy.returnShippingFeesAmount, undefined);
        }

        for (const crumbs of blocks.filter((block) => block['@type'] === 'BreadcrumbList')) {
            const items = crumbs.itemListElement;
            assert.equal(items.length, 3);
            assert.deepEqual(items.map((item) => item.position), [1, 2, 3]);
            assert.equal(items[0].name, 'Home');
            assert.equal(items[0].item, 'https://slatesafe.com/');
            assert.equal(items[1].name, 'Products');
            assert.equal(items[1].item, 'https://slatesafe.com/products.html');
            assert.equal(items[2].name, productLdName(products));
            assert.equal(items[2].item, products[0].url);
            for (const item of items) {
                assert.equal(item['@type'], 'ListItem');
                assert.match(item.item, /^https:\/\/slatesafe\.com\//);
            }
        }
    }
    assert.equal(canonicalOffers, 2);
});

function productLdName(products) {
    assert.equal(products.length, 1);
    return products[0].name;
}

test('policy page titles match the About and Contact pattern', () => {
    const about = read('about.html').match(/<title>([^<]+)<\/title>/)[1];
    const contact = read('contact.html').match(/<title>([^<]+)<\/title>/)[1];
    assert.equal(about, 'About | SlateSafe');
    assert.equal(contact, 'Contact | SlateSafe');

    const expected = {
        'returns.html': 'Returns | SlateSafe',
        'terms.html': 'Terms of Service | SlateSafe',
        'shipping-policy.html': 'Shipping Policy | SlateSafe'
    };
    for (const [rel, title] of Object.entries(expected)) {
        const html = read(rel);
        assert.equal(html.match(/<title>([^<]+)<\/title>/)[1], title, rel);
        assert.equal(html.match(/property="og:title" content="([^"]+)"/)[1], title, rel);
        assert.equal(html.includes('SlateSafe - Modern Tablet Solutions'), false, rel);
    }
});
