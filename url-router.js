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
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/3c34470d-74b7-4ebc-bc6d-b4d99fcd0496',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'url-router.js:13',message:'getProductHandle called',data:{pathname:window.location.pathname,search:window.location.search,hash:window.location.hash,href:window.location.href},timestamp:Date.now(),runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
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
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/3c34470d-74b7-4ebc-bc6d-b4d99fcd0496',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'url-router.js:22',message:'Handle extracted from query param',data:{handle:handleParam},timestamp:Date.now(),runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                return handleParam;
            }
            
            // PRIORITY 2: Try clean URL path: /product/PRODUCT_HANDLE or /product/PRODUCT_HANDLE/ or /product/PRODUCT_HANDLE.html
            // This handles cases where GitHub Pages might serve 404.html and we need to parse the original pathname
            const pathMatch = pathname.match(/\/product\/([^\/\?]+?)(?:\.html)?\/?$/);
            if (pathMatch) {
                const handle = decodeURIComponent(pathMatch[1]);
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/3c34470d-74b7-4ebc-bc6d-b4d99fcd0496',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'url-router.js:30',message:'Handle extracted from pathname',data:{handle:handle,pathMatch:pathMatch[1]},timestamp:Date.now(),runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                return handle;
            }
            
            // PRIORITY 3: Try hash: #/PRODUCT_HANDLE
            const hashMatch = hash.match(/#\/(.+)/);
            if (hashMatch) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/3c34470d-74b7-4ebc-bc6d-b4d99fcd0496',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'url-router.js:37',message:'Handle extracted from hash',data:{handle:hashMatch[1]},timestamp:Date.now(),runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                return hashMatch[1];
            }
            
            // PRIORITY 4: Try sessionStorage (fallback if query string was lost during redirect)
            try {
                const storedHandle = sessionStorage.getItem('productHandle');
                if (storedHandle) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/3c34470d-74b7-4ebc-bc6d-b4d99fcd0496',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'url-router.js:45',message:'Handle extracted from sessionStorage',data:{handle:storedHandle},timestamp:Date.now(),runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
                    // #endregion
                    // Clear it after use
                    sessionStorage.removeItem('productHandle');
                    return storedHandle;
                }
            } catch (e) {
                // Ignore if sessionStorage not available
            }
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/3c34470d-74b7-4ebc-bc6d-b4d99fcd0496',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'url-router.js:55',message:'No handle found',data:{},timestamp:Date.now(),runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            return null;
        },
        
        /**
         * Get clean URL for a product handle
         * @param {string} handle - Product handle
         * @returns {string} Clean URL
         */
        getProductUrl: function(handle) {
            if (!handle) return '#';
            // Use clean URL format: /product/PRODUCT_HANDLE
            const url = `/product/${handle}`;
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/3c34470d-74b7-4ebc-bc6d-b4d99fcd0496',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'url-router.js:47',message:'getProductUrl called',data:{handle:handle,url:url},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            return url;
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
