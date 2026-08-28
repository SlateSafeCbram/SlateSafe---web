// Local cart store. Catalog source of truth is products.json.
// Checkout uses Stripe Payment Links on each product (stripePaymentLink).
// Filename kept so existing <script src="shopify-cart.js"> tags keep working.
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
        checkoutUrl: '#',

        async init() {
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
                    return {
                        type: (item.type || 'IMAGE').toUpperCase(),
                        url,
                        alt: item.alt || product.title || '',
                        id: item.id || url || `${product.sku || product.handle}-media-${index}`
                    };
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
                descriptionHtml: description ? `<p>${slatesafeEscapeHtml(description)}</p>` : '',
                price,
                priceFormatted: slatesafeFormatPrice(price),
                currencyCode: 'USD',
                image: slatesafeMediaUrl(product.image),
                stripePaymentLink: product.stripePaymentLink || null,
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
                if (product) {
                    return this.lineItemFromProduct(product, item.quantity || 1);
                }
                return item;
            }).filter((item) => item && item.quantity > 0);

            this.recalculate();
        },

        lineItemFromProduct(product, quantity) {
            const qty = Number(quantity);
            const safeQty = Number.isInteger(qty) && qty > 0 ? qty : 1;
            const price = Number(product.price) || 0;
            const imageUrl = slatesafeMediaUrl(product.image);
            const lineId = product.sku || product.handle || product.id;
            return {
                id: lineId,
                title: product.title,
                quantity: safeQty,
                sku: product.sku,
                handle: product.handle,
                stripePaymentLink: product.stripePaymentLink || null,
                variant: {
                    id: lineId,
                    title: '',
                    price: { amount: String(price.toFixed(2)) },
                    image: imageUrl ? { url: imageUrl, alt: product.title } : null
                }
            };
        },

        recalculate() {
            this.itemCount = this.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
            this.total = this.items.reduce((sum, item) => {
                const amount = parseFloat(item.variant?.price?.amount || 0);
                return sum + (amount * (item.quantity || 0));
            }, 0);
            this.persistCart();
            this.checkoutNotice = '';
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
            const link = (product && product.stripePaymentLink) || item.stripePaymentLink;
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
            if (!product.stripePaymentLink) {
                return {
                    error: 'Checkout is not configured yet. Add stripePaymentLink for this product in products.json.'
                };
            }
            return { url: product.stripePaymentLink };
        },

        async buyProduct(idOrHandle) {
            const result = await this.resolveBuy(idOrHandle);
            if (result.error) {
                this.checkoutNotice = result.error;
                if (Alpine.store('toast')) {
                    Alpine.store('toast').show(result.error, 'error');
                }
                return result;
            }
            this.checkoutNotice = '';
            window.location.href = result.url;
            return result;
        },

        async checkout() {
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
            window.location.href = result.url;
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

        async addProduct(productOrVariantId, quantity = 1, isVariantId = false) {
            try {
                await this.loadCatalog();
                const qty = Number(quantity);
                if (!Number.isInteger(qty) || qty < 1) {
                    throw new Error('Please enter a valid quantity');
                }

                const product = this.findProduct(productOrVariantId);
                if (!product) {
                    throw new Error('Product not found');
                }

                const lineId = product.sku || product.handle || product.id;
                const existing = this.items.find((item) => item.id === lineId);
                if (existing) {
                    existing.quantity += qty;
                } else {
                    this.items.push(this.lineItemFromProduct(product, qty));
                }
                this.recalculate();
                this.openDrawer();

                if (Alpine.store('toast')) {
                    Alpine.store('toast').show('Item added to cart!', 'success');
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
            const qty = Number(quantity);
            if (!Number.isInteger(qty) || qty < 1) {
                await this.removeLineItem(lineItemId);
                return;
            }
            const item = this.items.find((line) => line.id === lineItemId);
            if (!item) return;
            item.quantity = qty;
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
            return (product && product.stripePaymentLink) || item.stripePaymentLink || '#';
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
                    stripePaymentLink: product.stripePaymentLink || null,
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
