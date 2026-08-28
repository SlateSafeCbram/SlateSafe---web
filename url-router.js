// URL Router for Product Pages
// Handles clean URLs and query parameter fallback for GitHub Pages

(function() {
    window.ProductRouter = {
        /**
         * Extract product handle from URL
         * Supports multiple formats:
         * - Clean URL: /product/PRODUCT_HANDLE or /product/PRODUCT_HANDLE/
         * - Query parameter: /product.html?handle=PRODUCT_HANDLE
         * - Hash: /product.html#/PRODUCT_HANDLE
         */
        getProductHandle: function() {
            const pathname = window.location.pathname;
            // Try to get search params from search string, or parse from full href if search is empty
            let searchParams = new URLSearchParams(window.location.search);
            if (window.location.search === '' && window.location.href.includes('?')) {
                // Query string might be in href but not in search (server rewriting issue)
                const hrefMatch = window.location.href.match(/\?([^#]+)/);
                if (hrefMatch) {
                    searchParams = new URLSearchParams(hrefMatch[1]);
                }
            }
            const hash = window.location.hash;
            
            // PRIORITY 1: Try query parameter FIRST (most reliable, won't be lost by URL rewriting)
            // This is important because static servers might rewrite /product.html?handle=X to /product and lose query string
            const handleParam = searchParams.get('handle');
            if (handleParam) {
                return handleParam;
            }
            
            // PRIORITY 2: Try clean URL path: /product/PRODUCT_HANDLE or /product/PRODUCT_HANDLE/ or /product/PRODUCT_HANDLE.html
            // This handles cases where GitHub Pages might serve 404.html and we need to parse the original pathname
            const pathMatch = pathname.match(/\/product\/([^\/\?]+?)(?:\.html)?\/?$/);
            if (pathMatch) {
                const handle = decodeURIComponent(pathMatch[1]);
                return handle;
            }
            
            // PRIORITY 3: Try hash: #/PRODUCT_HANDLE
            const hashMatch = hash.match(/#\/(.+)/);
            if (hashMatch) {
                return hashMatch[1];
            }
            
            // PRIORITY 4: Try sessionStorage (fallback if query string was lost during redirect)
            try {
                const storedHandle = sessionStorage.getItem('productHandle');
                if (storedHandle) {
                    // Clear it after use
                    sessionStorage.removeItem('productHandle');
                    return storedHandle;
                }
            } catch (e) {
                // Ignore if sessionStorage not available
            }
            
            return null;
        },
        
        /**
         * Get clean URL for a product handle
         * @param {string} handle - Product handle
         * @returns {string} Clean URL
         */
        getProductUrl: function(handle) {
            if (!handle) return '#';
            // Use clean URL format: /product/PRODUCT_HANDLE/
            return `/product/${handle}/`;
        },
        
        /**
         * Update browser URL to clean format without page reload
         * @param {string} handle - Product handle
         * @param {string} title - Page title
         */
        updateUrl: function(handle, title) {
            if (!handle) return;
            
            const cleanUrl = this.getProductUrl(handle);
            const currentPath = window.location.pathname;
            const currentSearch = window.location.search;
            
            // Only update if current URL is not already the clean format
            // Check if we're on product.html with query params or 404.html
            const needsUpdate = currentPath.includes('product.html') || 
                              currentPath.includes('404.html') ||
                              (currentSearch && currentSearch.includes('handle='));
            
            if (needsUpdate && !currentPath.match(/^\/product\/[^\/]+$/)) {
                // Update URL using History API (replaceState to avoid adding to history)
                window.history.replaceState(
                    { handle: handle, title: title },
                    title || 'Product',
                    cleanUrl
                );
                
                // Update page title if provided
                if (title) {
                    document.title = `${title} | SlateSafe - Modern Tablet Solutions`;
                }
            }
        },
        
        /**
         * Initialize router - set up popstate listener for back/forward navigation
         */
        init: function() {
            // Handle browser back/forward buttons
            window.addEventListener('popstate', function(event) {
                // If state exists, we can restore it
                // Otherwise, let the page handle the URL change
                if (event.state && event.state.handle) {
                    // Trigger page reload or update content
                    // The product page will re-initialize and read the new URL
                    window.location.reload();
                }
            });
        }
    };
    
    // Initialize router on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ProductRouter.init();
        });
    } else {
        ProductRouter.init();
    }
})();
