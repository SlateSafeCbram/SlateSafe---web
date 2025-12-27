// Shopify Cart Store - Reusable cart management
document.addEventListener('alpine:init', () => {
    Alpine.store('cart', {
        open: false,
        itemCount: 0,
        items: [],
        total: 0,
        checkoutId: null,
        storefrontAccessToken: '75e4e67eaa1ccfac75a92ed70438e6ad',
        shopDomain: 'uiy2z8-eu.myshopify.com',
        apiVersion: '2024-01',
        
        async init() {
            // Ensure drawer is closed on init
            this.open = false;
            // Load checkout from localStorage if available
            const savedCheckoutId = localStorage.getItem('shopify_checkout_id');
            if (savedCheckoutId) {
                this.checkoutId = savedCheckoutId;
                await this.fetchCart();
            }
        },
        
        handleError(error, context = 'cart operation') {
            let errorMessage = 'An error occurred with the checkout system.';
            let errorDetails = '';
            
            if (error instanceof TypeError && error.message.includes('fetch')) {
                errorMessage = 'Unable to connect to the checkout server.';
                errorDetails = 'This may be due to network issues, CORS restrictions, or the server being unavailable.';
            } else if (error.errors) {
                // GraphQL errors
                errorMessage = error.errors[0]?.message || errorMessage;
                errorDetails = error.errors.map(e => e.message).join('; ');
            } else if (error.message) {
                errorMessage = error.message;
                errorDetails = error.toString();
            }
            
            // Show toast notification
            Alpine.store('toast').show(
                `${errorMessage} Please try again or contact support if the problem persists.`,
                'error'
            );
            
            // Log detailed error for debugging
            console.error(`Shopify ${context} error:`, {
                message: errorMessage,
                details: errorDetails,
                fullError: error,
                context: context,
                timestamp: new Date().toISOString()
            });
            
            // Store error for potential reporting
            this.lastError = {
                message: errorMessage,
                details: errorDetails,
                context: context,
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                url: window.location.href
            };
        },
        
        async shopifyRequest(query, variables = {}) {
            try {
                const response = await fetch(`https://${this.shopDomain}/api/${this.apiVersion}/graphql.json`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Storefront-Access-Token': this.storefrontAccessToken
                    },
                    body: JSON.stringify({ query, variables })
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();
                
                // Check for GraphQL errors
                if (data.errors) {
                    throw { errors: data.errors, response: data };
                }
                
                return data;
            } catch (error) {
                this.handleError(error, 'API request');
                throw error;
            }
        },
        
        async createCart() {
            try {
                const query = `
                    mutation cartCreate {
                        cartCreate {
                            cart {
                                id
                                checkoutUrl
                                lines(first: 100) {
                                    edges {
                                        node {
                                            id
                                            quantity
                                            merchandise {
                                                ... on ProductVariant {
                                                    id
                                                    title
                                                    price {
                                                        amount
                                                    }
                                                    product {
                                                        title
                                                        images(first: 1) {
                                                            edges {
                                                                node {
                                                                    url
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                cost {
                                    totalAmount {
                                        amount
                                    }
                                }
                            }
                        }
                    }
                `;
                
                const result = await this.shopifyRequest(query);
                
                if (result.data?.cartCreate?.cart) {
                    this.checkoutId = result.data.cartCreate.cart.id;
                    localStorage.setItem('shopify_checkout_id', this.checkoutId);
                    this.checkoutUrl = result.data.cartCreate.cart.checkoutUrl;
                    await this.fetchCart();
                } else {
                    throw new Error('Failed to create cart: Invalid response from server');
                }
            } catch (error) {
                this.handleError(error, 'creating cart');
                throw error;
            }
        },
        
        async fetchCart() {
            try {
                if (!this.checkoutId) {
                    await this.createCart();
                    return;
                }
                
                const query = `
                    query getCart($id: ID!) {
                        cart(id: $id) {
                            id
                            checkoutUrl
                            lines(first: 100) {
                                edges {
                                    node {
                                        id
                                        quantity
                                        merchandise {
                                            ... on ProductVariant {
                                                id
                                                title
                                                price {
                                                    amount
                                                }
                                                product {
                                                    title
                                                    images(first: 1) {
                                                        edges {
                                                            node {
                                                                url
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            cost {
                                totalAmount {
                                    amount
                                }
                            }
                        }
                    }
                `;
                
                const result = await this.shopifyRequest(query, {
                    id: this.checkoutId
                });
                
                if (result.data?.cart) {
                    const cart = result.data.cart;
                    this.items = cart.lines.edges.map(edge => ({
                        id: edge.node.id,
                        title: edge.node.merchandise.product.title,
                        quantity: edge.node.quantity,
                        variant: {
                            id: edge.node.merchandise.id,
                            title: edge.node.merchandise.title,
                            price: edge.node.merchandise.price,
                            image: edge.node.merchandise.product.images.edges[0]?.node
                        }
                    }));
                    this.itemCount = this.items.reduce((sum, item) => sum + item.quantity, 0);
                    this.total = parseFloat(cart.cost.totalAmount.amount);
                    this.checkoutUrl = cart.checkoutUrl;
                }
            } catch (error) {
                this.handleError(error, 'fetching cart');
            }
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
        
        async getVariantIdFromProduct(productId) {
            try {
                const query = `
                    query getProduct($id: ID!) {
                        product(id: $id) {
                            variants(first: 1) {
                                edges {
                                    node {
                                        id
                                    }
                                }
                            }
                        }
                    }
                `;
                
                const result = await this.shopifyRequest(query, {
                    id: `gid://shopify/Product/${productId}`
                });
                
                if (result.data?.product?.variants?.edges?.length > 0) {
                    return result.data.product.variants.edges[0].node.id;
                }
                throw new Error(`No variants found for product: ${productId}`);
            } catch (error) {
                this.handleError(error, 'fetching product variant');
                return null;
            }
        },
        
        async addProduct(productOrVariantId, quantity = 1, isVariantId = false) {
            try {
                if (!this.checkoutId) {
                    await this.createCart();
                }
                
                let variantId = productOrVariantId;
                if (!isVariantId) {
                    variantId = await this.getVariantIdFromProduct(productOrVariantId);
                    if (!variantId) {
                        throw new Error(`Could not find variant for product: ${productOrVariantId}`);
                    }
                }
                
                const query = `
                    mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
                        cartLinesAdd(cartId: $cartId, lines: $lines) {
                            cart {
                                id
                                checkoutUrl
                                lines(first: 100) {
                                    edges {
                                        node {
                                            id
                                            quantity
                                            merchandise {
                                                ... on ProductVariant {
                                                    id
                                                    title
                                                    price {
                                                        amount
                                                    }
                                                    product {
                                                        title
                                                        images(first: 1) {
                                                            edges {
                                                                node {
                                                                    url
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                cost {
                                    totalAmount {
                                        amount
                                    }
                                }
                            }
                        }
                    }
                `;
                
                const result = await this.shopifyRequest(query, {
                    cartId: this.checkoutId,
                    lines: [{ merchandiseId: variantId, quantity }]
                });
                
                if (result.data?.cartLinesAdd?.cart) {
                    await this.fetchCart();
                    this.openDrawer();
                    Alpine.store('toast').show('Item added to cart!', 'success');
                } else {
                    throw new Error('Failed to add item to cart');
                }
            } catch (error) {
                this.handleError(error, 'adding product to cart');
                throw error;
            }
        },
        
        async updateLineItem(lineItemId, quantity) {
            try {
                if (!this.checkoutId) return;
                
                const query = `
                    mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
                        cartLinesUpdate(cartId: $cartId, lines: $lines) {
                            cart {
                                id
                                lines(first: 100) {
                                    edges {
                                        node {
                                            id
                                            quantity
                                            merchandise {
                                                ... on ProductVariant {
                                                    id
                                                    title
                                                    price {
                                                        amount
                                                    }
                                                    product {
                                                        title
                                                        images(first: 1) {
                                                            edges {
                                                                node {
                                                                    url
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                cost {
                                    totalAmount {
                                        amount
                                    }
                                }
                            }
                        }
                    }
                `;
                
                const result = await this.shopifyRequest(query, {
                    cartId: this.checkoutId,
                    lines: [{ id: lineItemId, quantity }]
                });
                
                if (result.data?.cartLinesUpdate?.cart) {
                    await this.fetchCart();
                } else {
                    throw new Error('Failed to update cart item');
                }
            } catch (error) {
                this.handleError(error, 'updating cart item');
                throw error;
            }
        },
        
        async removeLineItem(lineItemId) {
            try {
                if (!this.checkoutId) return;
                
                const query = `
                    mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
                        cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
                            cart {
                                id
                                lines(first: 100) {
                                    edges {
                                        node {
                                            id
                                            quantity
                                            merchandise {
                                                ... on ProductVariant {
                                                    id
                                                    title
                                                    price {
                                                        amount
                                                    }
                                                    product {
                                                        title
                                                        images(first: 1) {
                                                            edges {
                                                                node {
                                                                    url
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                cost {
                                    totalAmount {
                                        amount
                                    }
                                }
                            }
                        }
                    }
                `;
                
                const result = await this.shopifyRequest(query, {
                    cartId: this.checkoutId,
                    lineIds: [lineItemId]
                });
                
                if (result.data?.cartLinesRemove?.cart) {
                    await this.fetchCart();
                    Alpine.store('toast').show('Item removed from cart', 'success');
                } else {
                    throw new Error('Failed to remove item from cart');
                }
            } catch (error) {
                this.handleError(error, 'removing cart item');
                throw error;
            }
        },
        
        checkoutUrl: '#',
        getCheckoutUrl() {
            return this.checkoutUrl || '#';
        }
    });
    
    // Initialize cart on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            Alpine.nextTick(() => {
                Alpine.store('cart').init();
            });
        });
    } else {
        // Use setTimeout to ensure Alpine is ready
        Alpine.nextTick(() => {
            Alpine.store('cart').init();
        });
    }
});

