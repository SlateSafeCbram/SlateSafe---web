// Local cart store. Catalog source of truth is products.json.
// Launch checkout is a Stripe Checkout Session (checkout-config.js mode
// 'session'). Set mode to 'payment_links' to roll back to the Stripe
// Payment Link on each product (stripePaymentLink).
// Previously shopify-cart.js. Pages load cart.js.
// No Shopify Storefront API, no myshopify.com, no shop.slatesafe.com.

const SLATESAFE_CART_KEY = 'slatesafe_cart';
const SLATESAFE_CATALOG_URL = '/products.json';

function slatesafeMediaUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return path.startsWith('/') ? path : `/${path}`;
}

function slatesafeFormatPrice(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return '$0.00';
    return `$${n.toFixed(2)}`;
}

function slatesafeEscapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function slatesafeDescriptionHtml(product) {
    const html = product && product.descriptionHtml;
    if (typeof html === 'string' && html.trim()
        && !/<script/i.test(html)
        && !/<img\b/i.test(html)) {
        return html;
    }
    const description = (product && (product.description || product.featureHighlight)) || '';
    return description ? `<p>${slatesafeEscapeHtml(description)}</p>` : '';
}

function slatesafePaymentLink(url) {
    if (typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!/^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+$/.test(trimmed)) return null;
    return trimmed;
}

function slatesafeOpenPaymentLink(url) {
    window.location.assign(url);
}

const ENCLOSURE_KIT_IDS = new Set([
    'ENC-SAM-A9-V1',
    'tablet-enclosure-kit-samsung-tab-a9'
]);
const STANDALONE_CABLE_IDS = new Set([
    'CAB-RA20CM-MF-BLK-V1',
    'flat-90-degree-usb-c-ribbon-extension-cable'
]);
const CABLE_BUNDLE_NOTICE = 'Heads up: the enclosure kit in your cart already includes a USB-C cable. Adding the standalone cable means this order would include 2 cables.';
const SESSION_MAX_QTY = 10;
const CHECKOUT_CLIENT_ERROR = "We couldn't start checkout. Please try again, or email support@slatesafe.com.";

function slatesafeCheckoutSettings() {
    const config = (typeof window !== 'undefined' && window.SLATESAFE_CHECKOUT) || {};
    const mode = config.mode === 'session' ? 'session' : 'payment_links';
    const endpoint = typeof config.endpoint === 'string' && config.endpoint
        ? config.endpoint
        : 'https://slatesafe-checkout-test.slatesafe.workers.dev/';
    // Same host as SLATESAFE_CHECKOUT_ENDPOINT in checkout-config.js.
    // Launch switches this fallback to https://slatesafe-checkout.slatesafe.workers.dev/
    return { mode, endpoint, session: mode === 'session' };
}

function slatesafeIdempotencyKey() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function slatesafeItemKeys(item) {
    if (!item) return [];
    return [item.sku, item.handle, item.id].filter(Boolean).map(String);
}

function slatesafeCartHasIds(items, ids) {
    return (items || []).some((item) => slatesafeItemKeys(item).some((key) => ids.has(key)));
}

function slatesafeHasEnclosureAndCable(items) {
    return slatesafeCartHasIds(items, ENCLOSURE_KIT_IDS)
        && slatesafeCartHasIds(items, STANDALONE_CABLE_IDS);
}

// Quantity stays at least 1. Decrement must not delete a line; Remove does that.
// Payment Links mode keeps every line at 1.
function slatesafeLineQuantity(quantity, sessionCheckout) {
    const qty = Number(quantity);
    if (!sessionCheckout || !Number.isInteger(qty) || qty < 1) {
        return 1;
    }
    if (qty > SESSION_MAX_QTY) {
        return SESSION_MAX_QTY;
    }
    return qty;
}

// Back-forward cache restores Alpine state, including checkoutBusy, after
// the buyer presses Back on the Stripe page.
function slatesafeOnPageShow(event, cart) {
    if (event && event.persisted && cart) {
        cart.checkoutBusy = false;
    }
}

// Unit price until qty is 2 or more, then "$23.98 ($11.99 each)".
function slatesafeLinePriceLabel(unitAmount, quantity) {
    const unit = Number(unitAmount);
    if (!Number.isFinite(unit)) return '$0.00';
    const unitText = `$${unit.toFixed(2)}`;
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 2) return unitText;
    return `$${(unit * qty).toFixed(2)} (${unitText} each)`;
}

function slatesafeSessionBuyQuantity(quantity) {
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
        return { error: 'Please enter a valid quantity' };
    }
    if (qty > SESSION_MAX_QTY) {
        return { error: 'Maximum quantity is 10.' };
    }
    return { quantity: qty };
}

function slatesafeBuyPayload(sku, quantity) {
    const planned = slatesafeSessionBuyQuantity(quantity);
    if (planned.error) return planned;
    if (typeof sku !== 'string' || !sku) {
        return { error: 'Product not found.' };
    }
    return { items: [{ sku, qty: planned.quantity }] };
}

function slatesafeCheckoutRequestUrl(endpoint, buy) {
    const url = new URL(endpoint);
    if (buy) url.searchParams.set('src', 'buy');
    return url.toString();
}

function slatesafeBuyAnalytics(lines, findProduct) {
    const items = lines.map((line) => {
        const product = typeof findProduct === 'function' ? findProduct(line.sku) : null;
        const price = product ? Number(product.price) || 0 : 0;
        return {
            id: line.sku,
            title: product && product.title ? product.title : line.sku,
            variant: { id: line.sku, price: { amount: price } },
            quantity: line.qty
        };
    });
    const total = items.reduce((sum, item) => {
        return sum + (Number(item.variant.price.amount) || 0) * (item.quantity || 1);
    }, 0);
    return { items, total };
}

// Stripe success URLs look like ?session_id=cs_test_... or cs_live_...
// Payment Links do not use that prefix. src=buy is a product-page Buy,
// which must not wipe a cart the buyer left behind.
function slatesafeClearCartIfCheckoutSession(search, cart, storage) {
    const query = typeof search === 'string' ? search : '';
    const normalized = query.charAt(0) === '?' ? query.slice(1) : query;
    let params;
    try {
        params = new URLSearchParams(normalized);
    } catch (e) {
        return false;
    }
    const sessionId = params.get('session_id') || '';
    if (!sessionId.startsWith('cs_') || params.get('src') === 'buy') return false;
    if (cart) {
        cart.items = [];
        if (typeof cart.recalculate === 'function') {
            cart.recalculate();
        } else {
            cart.itemCount = 0;
            cart.total = 0;
        }
    }
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (store && typeof store.removeItem === 'function') {
        try {
            store.removeItem(SLATESAFE_CART_KEY);
        } catch (e) {
            // Ignore storage errors
        }
    }
    return true;
}

if (typeof document !== 'undefined') {
document.addEventListener('alpine:init', () => {
    Alpine.store('cart', {
        open: false,
        itemCount: 0,
        items: [],
        total: 0,
        catalog: [],
        catalogLoaded: false,
        catalogPromise: null,
        checkoutNotice: '',
        cableBundleNotice: '',
        checkoutUrl: '#',
        sessionCheckout: false,
        checkoutBusy: false,
        checkoutMode: 'payment_links',
        checkoutEndpoint: 'https://slatesafe-checkout-test.slatesafe.workers.dev/',

        async init() {
            const settings = slatesafeCheckoutSettings();
            this.sessionCheckout = settings.session;
            this.checkoutMode = settings.mode;
            this.checkoutEndpoint = settings.endpoint;
            window.addEventListener('pageshow', (event) => {
                slatesafeOnPageShow(event, this);
            });
            this.open = false;
            try {
                localStorage.removeItem('shopify_checkout_id');
            } catch (e) {
                // Ignore storage errors
            }
            await this.loadCatalog();
            this.loadCart();
        },

        async loadCatalog() {
            if (this.catalogLoaded) return this.catalog;
            if (this.catalogPromise) return this.catalogPromise;

            this.catalogPromise = (async () => {
                try {
                    const response = await fetch(SLATESAFE_CATALOG_URL, { cache: 'no-cache' });
                    if (!response.ok) {
                        throw new Error(`Failed to load catalog: ${response.status}`);
                    }
                    const data = await response.json();
                    this.catalog = Array.isArray(data.products) ? data.products : [];
                    this.catalogLoaded = true;
                    return this.catalog;
                } catch (error) {
                    console.error('Catalog load error:', error);
                    this.catalog = [];
                    this.catalogLoaded = true;
                    return this.catalog;
                }
            })();

            return this.catalogPromise;
        },

        findProduct(idOrHandle) {
            if (idOrHandle == null || idOrHandle === '') return null;
            const raw = idOrHandle.toString();
            const needle = raw.replace(/^gid:\/\/shopify\/Product\//, '');
            return this.catalog.find((product) => (
                product.id === needle
                || product.sku === needle
                || product.handle === needle
                || product.id === raw
                || product.sku === raw
                || product.handle === raw
            )) || null;
        },

        productMedia(product) {
            if (!product) return [];
            const fromJson = Array.isArray(product.media) ? product.media : [];
            const media = fromJson
                .map((item, index) => {
                    const url = slatesafeMediaUrl(item.url || item);
                    if (!url) return null;
                    const type = (item.type || 'IMAGE').toUpperCase();
                    const mapped = {
                        type,
                        url,
                        alt: item.alt || product.title || '',
                        id: item.id || url || `${product.sku || product.handle}-media-${index}`
                    };
                    if (item.thumbnailUrl) {
                        mapped.thumbnailUrl = slatesafeMediaUrl(item.thumbnailUrl);
                    }
                    if (item.previewUrl) {
                        mapped.previewUrl = slatesafeMediaUrl(item.previewUrl);
                    }
                    return mapped;
                })
                .filter(Boolean);

            if (media.length === 0 && product.image) {
                media.push({
                    type: 'IMAGE',
                    url: slatesafeMediaUrl(product.image),
                    alt: product.title || '',
                    id: slatesafeMediaUrl(product.image)
                });
            }
            return media;
        },

        detailsFromProduct(product) {
            if (!product) return null;
            const price = Number(product.price) || 0;
            const media = this.productMedia(product);
            const description = product.description || product.featureHighlight || '';
            const variantId = product.sku || product.handle || product.id;
            return {
                id: product.id,
                sku: product.sku,
                handle: product.handle,
                title: product.title,
                description,
                descriptionHtml: slatesafeDescriptionHtml(product),
                price,
                priceFormatted: slatesafeFormatPrice(price),
                currencyCode: 'USD',
                image: slatesafeMediaUrl(product.image),
                stripePaymentLink: slatesafePaymentLink(product.stripePaymentLink),
                galleryDir: product.galleryDir || '',
                media,
                keyFeatures: product.keyFeatures || [],
                specifications: product.specifications || {},
                priceRange: {
                    min: price,
                    max: price,
                    minFormatted: slatesafeFormatPrice(price),
                    maxFormatted: slatesafeFormatPrice(price)
                },
                variants: [{
                    id: variantId,
                    title: 'Default',
                    price,
                    priceFormatted: slatesafeFormatPrice(price),
                    currencyCode: 'USD',
                    availableForSale: true,
                    selectedOptions: [],
                    image: media[0] ? { url: media[0].url, alt: media[0].alt } : null
                }],
                options: []
            };
        },

        persistCart() {
            try {
                localStorage.setItem(SLATESAFE_CART_KEY, JSON.stringify(this.items));
            } catch (e) {
                // Ignore storage errors
            }
        },

        loadCart() {
            let saved = [];
            try {
                saved = JSON.parse(localStorage.getItem(SLATESAFE_CART_KEY) || '[]');
            } catch (e) {
                saved = [];
            }
            if (!Array.isArray(saved)) saved = [];

            this.items = saved.map((item) => {
                const product = this.findProduct(item.sku || item.handle || item.id);
                const savedQty = this.sessionCheckout ? item && item.quantity : 1;
                if (product) {
                    return this.lineItemFromProduct(product, savedQty);
                }
                if (!item) return null;
                let quantity = 1;
                if (this.sessionCheckout) {
                    const parsed = Number(item.quantity);
                    quantity = Number.isInteger(parsed) && parsed >= 1
                        ? Math.min(parsed, SESSION_MAX_QTY)
                        : 1;
                }
                return { ...item, quantity };
            }).filter((item) => item && item.quantity > 0);

            this.recalculate();
        },

        lineItemFromProduct(product, quantity) {
            const price = Number(product.price) || 0;
            const imageUrl = slatesafeMediaUrl(product.image);
            const lineId = product.sku || product.handle || product.id;
            let qty = 1;
            if (this.sessionCheckout) {
                const parsed = Number(quantity);
                qty = Number.isInteger(parsed) && parsed >= 1
                    ? Math.min(parsed, SESSION_MAX_QTY)
                    : 1;
            }
            return {
                id: lineId,
                title: product.title,
                quantity: qty,
                sku: product.sku,
                handle: product.handle,
                stripePaymentLink: slatesafePaymentLink(product.stripePaymentLink),
                variant: {
                    id: lineId,
                    title: '',
                    price: { amount: String(price.toFixed(2)) },
                    image: imageUrl ? { url: imageUrl, alt: product.title } : null
                }
            };
        },

        recalculate() {
            if (!this.sessionCheckout) {
                this.items.forEach((item) => {
                    item.quantity = 1;
                });
            }
            this.itemCount = this.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
            this.total = this.items.reduce((sum, item) => {
                const amount = parseFloat(item.variant?.price?.amount || 0);
                const qty = this.sessionCheckout ? (item.quantity || 0) : 1;
                return sum + (amount * qty);
            }, 0);
            this.persistCart();
            this.checkoutNotice = '';
            this.cableBundleNotice = (!this.sessionCheckout && slatesafeHasEnclosureAndCable(this.items))
                ? CABLE_BUNDLE_NOTICE
                : '';
            this.checkoutUrl = this.getCheckoutUrl();
        },

        uniqueSkus() {
            const keys = new Set();
            this.items.forEach((item) => {
                keys.add(item.sku || item.handle || item.id);
            });
            return Array.from(keys);
        },

        async resolveCheckout() {
            await this.loadCatalog();
            if (!this.items.length) {
                return { error: 'Your cart is empty.' };
            }
            if (this.uniqueSkus().length > 1) {
                return {
                    error: 'Please check out each item separately. Mixed carts cannot use a single Stripe Payment Link.'
                };
            }
            const item = this.items[0];
            const product = this.findProduct(item.sku || item.handle || item.id);
            const link = slatesafePaymentLink(
                (product && product.stripePaymentLink) || item.stripePaymentLink
            );
            if (!link) {
                return {
                    error: 'Checkout is not configured yet. Add stripePaymentLink for this product in products.json.'
                };
            }
            return { url: link };
        },

        async resolveBuy(idOrHandle) {
            await this.loadCatalog();
            const product = this.findProduct(idOrHandle);
            if (!product) {
                return { error: 'Product not found.' };
            }
            const link = slatesafePaymentLink(product.stripePaymentLink);
            if (!link) {
                return {
                    error: 'Checkout is not configured yet. Add stripePaymentLink for this product in products.json.'
                };
            }
            return { url: link };
        },

        linePriceLabel(item) {
            const amount = parseFloat(item && item.variant && item.variant.price && item.variant.price.amount || 0);
            const qty = this.sessionCheckout ? Number(item && item.quantity) : 1;
            return slatesafeLinePriceLabel(amount, qty);
        },

        priceLabel(amount, quantity) {
            return slatesafeLinePriceLabel(amount, this.sessionCheckout ? quantity : 1);
        },

        async buyProduct(idOrHandle, quantity) {
            if (this.sessionCheckout) {
                return this.buySessionQuantity(idOrHandle, quantity);
            }
            const result = await this.resolveBuy(idOrHandle);
            if (result.error) {
                this.checkoutNotice = result.error;
                if (Alpine.store('toast')) {
                    Alpine.store('toast').show(result.error, 'error');
                }
                return result;
            }
            this.checkoutNotice = '';
            slatesafeOpenPaymentLink(result.url);
            return result;
        },

        async buySessionQuantity(idOrHandle, quantity) {
            if (this.checkoutBusy) {
                return { pending: true };
            }
            const planned = slatesafeSessionBuyQuantity(quantity);
            if (planned.error) {
                this.checkoutNotice = planned.error;
                if (Alpine.store('toast')) {
                    Alpine.store('toast').show(planned.error, 'error');
                }
                return planned;
            }
            await this.loadCatalog();
            const product = this.findProduct(idOrHandle);
            const payload = slatesafeBuyPayload(product && product.sku, planned.quantity);
            if (payload.error) {
                this.checkoutNotice = payload.error;
                if (Alpine.store('toast')) {
                    Alpine.store('toast').show(payload.error, 'error');
                }
                return payload;
            }
            // Buy posts only this product. The saved cart is not added to or cleared.
            this.checkoutBusy = true;
            return this.postCheckoutSession(payload.items, { buy: true });
        },

        async checkoutSession() {
            if (this.checkoutBusy) {
                return { error: CHECKOUT_CLIENT_ERROR };
            }
            return this.postCheckoutSession();
        },

        async postCheckoutSession(lines, options) {
            const buy = !!(options && options.buy);
            const payload = Array.isArray(lines)
                ? lines
                : this.items.map((item) => ({
                    sku: item.sku,
                    qty: item.quantity
                }));
            if (!payload.length) {
                this.checkoutBusy = false;
                const error = 'Your cart is empty.';
                this.checkoutNotice = error;
                if (Alpine.store('toast')) {
                    Alpine.store('toast').show(error, 'error');
                }
                return { error };
            }
            this.checkoutBusy = true;
            this.checkoutNotice = '';
            try {
                if (typeof SlateSafeAnalytics !== 'undefined') {
                    const tracked = buy
                        ? slatesafeBuyAnalytics(payload, (sku) => this.findProduct(sku))
                        : { items: this.items, total: this.total };
                    SlateSafeAnalytics.trackBeginCheckout(tracked);
                }
            } catch (err) {
                console.error('Error tracking checkout:', err);
            }
            try {
                const response = await fetch(slatesafeCheckoutRequestUrl(this.checkoutEndpoint, buy), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Idempotency-Key': slatesafeIdempotencyKey()
                    },
                    body: JSON.stringify(payload)
                });
                let data = null;
                try {
                    data = await response.json();
                } catch (err) {
                    data = null;
                }
                const url = data && data.url;
                if (!response.ok || typeof url !== 'string' || !url.startsWith('https://checkout.stripe.com/')) {
                    this.checkoutBusy = false;
                    this.checkoutNotice = CHECKOUT_CLIENT_ERROR;
                    if (Alpine.store('toast')) {
                        Alpine.store('toast').show(CHECKOUT_CLIENT_ERROR, 'error');
                    }
                    return { error: CHECKOUT_CLIENT_ERROR };
                }
                window.location.assign(url);
                return { url };
            } catch (err) {
                this.checkoutBusy = false;
                this.checkoutNotice = CHECKOUT_CLIENT_ERROR;
                if (Alpine.store('toast')) {
                    Alpine.store('toast').show(CHECKOUT_CLIENT_ERROR, 'error');
                }
                return { error: CHECKOUT_CLIENT_ERROR };
            }
        },

        async checkout() {
            if (this.sessionCheckout) {
                return this.checkoutSession();
            }
            if (typeof SlateSafeAnalytics !== 'undefined' && this.items.length > 0) {
                SlateSafeAnalytics.trackBeginCheckout({
                    items: this.items,
                    total: this.total
                });
            }
            const result = await this.resolveCheckout();
            if (result.error) {
                this.checkoutNotice = result.error;
                if (Alpine.store('toast')) {
                    Alpine.store('toast').show(result.error, 'error');
                }
                return result;
            }
            this.checkoutNotice = '';
            slatesafeOpenPaymentLink(result.url);
            return result;
        },

        async checkoutItem(idOrHandle) {
            const result = await this.resolveBuy(idOrHandle);
            if (result.error) {
                this.checkoutNotice = result.error;
                if (Alpine.store('toast')) {
                    Alpine.store('toast').show(result.error, 'error');
                }
                return result;
            }
            this.checkoutNotice = '';
            slatesafeOpenPaymentLink(result.url);
            return result;
        },

        handleError(error, context = 'cart operation') {
            const errorMessage = error?.message || 'An error occurred with the cart.';
            if (Alpine.store('toast')) {
                Alpine.store('toast').show(
                    `${errorMessage} Please try again or contact support if the problem persists.`,
                    'error'
                );
            }
            console.error(`Cart ${context} error:`, error);
        },

        openDrawer() {
            this.open = true;
        },

        closeDrawer() {
            this.open = false;
        },

        toggle() {
            this.open = !this.open;
        },

        async addProduct(productOrVariantId, quantity = 1, isVariantId = false, options = {}) {
            const quiet = !!(options && options.quiet);
            try {
                await this.loadCatalog();
                const requestedQty = Number(quantity);
                if (!Number.isInteger(requestedQty) || requestedQty < 1) {
                    throw new Error('Please enter a valid quantity');
                }
                const session = this.sessionCheckout;
                let qty = session ? Math.min(requestedQty, SESSION_MAX_QTY) : 1;
                let capped = session && requestedQty > SESSION_MAX_QTY;

                const product = this.findProduct(productOrVariantId);
                if (!product) {
                    throw new Error('Product not found');
                }

                const lineId = product.sku || product.handle || product.id;
                const existing = this.items.find((item) => item.id === lineId);
                if (existing) {
                    if (session) {
                        const next = (existing.quantity || 0) + qty;
                        if (next > SESSION_MAX_QTY) {
                            existing.quantity = SESSION_MAX_QTY;
                            capped = true;
                        } else {
                            existing.quantity = next;
                        }
                    } else {
                        existing.quantity = 1;
                    }
                } else {
                    this.items.push(this.lineItemFromProduct(product, qty));
                }
                this.recalculate();
                if (!quiet) {
                    this.openDrawer();
                }

                if (Alpine.store('toast')) {
                    if (!quiet) {
                        Alpine.store('toast').show('Item added to cart!', 'success');
                    }
                    if (capped) {
                        Alpine.store('toast').show('Maximum quantity is 10.', 'error');
                    }
                    if (!quiet && this.cableBundleNotice) {
                        Alpine.store('toast').show(this.cableBundleNotice, 'success');
                    }
                }

                if (typeof SlateSafeAnalytics !== 'undefined') {
                    try {
                        SlateSafeAnalytics.trackAddToCart({
                            id: product.sku || product.id,
                            title: product.title,
                            price: Number(product.price) || 0,
                            quantity: qty
                        });
                    } catch (err) {
                        console.error('Error tracking add to cart:', err);
                    }
                }
                return true;
            } catch (error) {
                this.handleError(error, 'adding product to cart');
                throw error;
            }
        },

        async updateLineItem(lineItemId, quantity) {
            const item = this.items.find((line) => line.id === lineItemId);
            if (!item) return;
            const requested = Number(quantity);
            if (this.sessionCheckout && Number.isInteger(requested) && requested > SESSION_MAX_QTY) {
                if (Alpine.store('toast')) {
                    Alpine.store('toast').show('Maximum quantity is 10.', 'error');
                }
            }
            item.quantity = slatesafeLineQuantity(requested, this.sessionCheckout);
            this.recalculate();
        },

        async removeLineItem(lineItemId) {
            this.items = this.items.filter((item) => item.id !== lineItemId);
            this.recalculate();
            if (Alpine.store('toast')) {
                Alpine.store('toast').show('Item removed from cart', 'success');
            }
        },

        getCheckoutUrl() {
            if (!this.items.length || this.uniqueSkus().length > 1) return '#';
            const item = this.items[0];
            const product = this.findProduct(item.sku || item.handle || item.id);
            return slatesafePaymentLink(
                (product && product.stripePaymentLink) || item.stripePaymentLink
            ) || '#';
        },

        async fetchAllProducts() {
            await this.loadCatalog();
            return this.catalog.map((product) => {
                const details = this.detailsFromProduct(product);
                return {
                    id: product.id,
                    handle: product.handle,
                    sku: product.sku,
                    title: product.title,
                    name: product.title,
                    price: details.price,
                    currencyCode: 'USD',
                    availableForSale: true,
                    featured: !!product.featured,
                    thumbnail: details.media[0] ? { url: details.media[0].url, alt: details.media[0].alt } : null,
                    image: details.image,
                    stripePaymentLink: slatesafePaymentLink(product.stripePaymentLink),
                    fromJson: true
                };
            });
        },

        async fetchProductDetails(productIdOrHandle) {
            await this.loadCatalog();
            const product = this.findProduct(productIdOrHandle);
            return this.detailsFromProduct(product);
        },

        async fetchProductMedia(productIdOrHandle) {
            await this.loadCatalog();
            const product = this.findProduct(productIdOrHandle);
            return this.productMedia(product);
        },

        async fetchProductThumbnail(productIdOrHandle) {
            const media = await this.fetchProductMedia(productIdOrHandle);
            if (media.length > 0 && media[0].type === 'IMAGE') {
                return { url: media[0].url, alt: media[0].alt };
            }
            return null;
        },

        stripHtmlTags(html) {
            const tmp = document.createElement('DIV');
            tmp.innerHTML = html;
            return tmp.textContent || tmp.innerText || '';
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            Alpine.nextTick(() => {
                Alpine.store('cart').init();
            });
        });
    } else {
        Alpine.nextTick(() => {
            Alpine.store('cart').init();
        });
    }
});
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        slatesafeLineQuantity,
        slatesafeOnPageShow,
        slatesafeLinePriceLabel,
        slatesafeSessionBuyQuantity,
        slatesafeBuyPayload,
        slatesafeCheckoutRequestUrl,
        slatesafeBuyAnalytics,
        slatesafeClearCartIfCheckoutSession,
        CHECKOUT_CLIENT_ERROR,
        SESSION_MAX_QTY,
        SLATESAFE_CART_KEY
    };
}
