// Google Analytics Event Tracking Helper
// Consent-aware analytics tracking

(function() {
    const GA_MEASUREMENT_ID = 'G-1XB9ZLWTV0';
    let gtagLoaded = false;
    let gtagQueue = [];
    
    // Initialize gtag if consent is given
    function initGA() {
        if (gtagLoaded) return;
        
        // Check if user has consented
        if (typeof Alpine !== 'undefined' && Alpine.store('cookieConsent')) {
            if (!Alpine.store('cookieConsent').hasConsented()) {
                return;
            }
        }
        
        // Load Google Analytics script
        const script1 = document.createElement('script');
        script1.async = true;
        script1.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
        document.head.appendChild(script1);
        
        // Initialize dataLayer and gtag
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        window.gtag = gtag;
        
        gtag('js', new Date());
        gtag('config', GA_MEASUREMENT_ID, {
            'anonymize_ip': true, // GDPR: anonymize IP addresses
            'allow_google_signals': false, // Disable Google Signals for GDPR
            'allow_ad_personalization_signals': false
        });
        
        gtagLoaded = true;
        
        // Process queued events
        if (gtagQueue.length > 0) {
            gtagQueue.forEach(event => {
                if (event.type === 'event') {
                    window.gtag('event', event.name, event.params);
                } else {
                    window.gtag(event.name, event.params);
                }
            });
            gtagQueue = [];
        }
    }
    
    // Check consent and send event
    function trackEvent(eventType, eventName, eventParams = {}) {
        // Check if consent is given
        if (typeof Alpine !== 'undefined' && Alpine.store('cookieConsent')) {
            if (!Alpine.store('cookieConsent').hasConsented()) {
                // Queue event if consent not yet given (user might accept later)
                gtagQueue.push({ type: eventType, name: eventName, params: eventParams });
                return;
            }
        }
        
        // If gtag is not loaded yet, initialize it
        if (!gtagLoaded && typeof window !== 'undefined') {
            initGA();
        }
        
        // Send event if gtag is available
        if (typeof window !== 'undefined' && window.gtag) {
            // GA4 format: gtag('event', eventName, eventParams)
            window.gtag('event', eventName, eventParams);
        } else {
            // Queue for later if gtag not ready
            gtagQueue.push({ type: eventType, name: eventName, params: eventParams });
        }
    }
    
    // Public API
    window.SlateSafeAnalytics = {
        // Initialize GA (call after consent is given)
        init: initGA,
        
        // Track page view (GA4 tracks this automatically, but we can track custom page views)
        trackPageView: function(path, title) {
            // GA4 automatically tracks page views, but we can send custom page_view events
            if (typeof window !== 'undefined' && window.gtag) {
                window.gtag('event', 'page_view', {
                    page_path: path || window.location.pathname,
                    page_title: title || document.title
                });
            }
        },
        
        // Track product view
        trackProductView: function(productData) {
            trackEvent('event', 'view_item', {
                currency: 'USD',
                value: productData.price || 0,
                items: [{
                    item_id: productData.id,
                    item_name: productData.title,
                    price: productData.price || 0,
                    quantity: 1
                }]
            });
        },
        
        // Track add to cart
        trackAddToCart: function(productData) {
            trackEvent('event', 'add_to_cart', {
                currency: 'USD',
                value: (productData.price || 0) * (productData.quantity || 1),
                items: [{
                    item_id: productData.id,
                    item_name: productData.title,
                    price: productData.price || 0,
                    quantity: productData.quantity || 1
                }]
            });
        },
        
        // Track begin checkout
        trackBeginCheckout: function(cartData) {
            const items = cartData.items || [];
            trackEvent('event', 'begin_checkout', {
                currency: 'USD',
                value: cartData.total || 0,
                items: items.map(item => ({
                    item_id: item.variant?.id || item.id,
                    item_name: item.title,
                    price: item.variant?.price?.amount || 0,
                    quantity: item.quantity || 1
                }))
            });
        },
        
        // Track contact form submission
        trackContactForm: function() {
            trackEvent('event', 'generate_lead', {
                currency: 'USD',
                value: 0,
                form_id: 'contact_form',
                form_name: 'Contact Form'
            });
        },
        
        // Generic event tracking
        trackEvent: trackEvent
    };
    
    // Listen for consent changes
    if (typeof window !== 'undefined') {
        window.addEventListener('cookieConsentChanged', function(event) {
            if (event.detail.consented) {
                initGA();
            }
        });
    }
})();
