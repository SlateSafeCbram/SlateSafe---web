// Scroll-triggered animations using Intersection Observer API
// Provides Framer Motion-style fade-in-up animations for Alpine.js

(function() {
    'use strict';

    // Initialize scroll animations when DOM is ready
    function initScrollAnimations() {
        // Check if Intersection Observer is supported
        if (!('IntersectionObserver' in window)) {
            // Fallback: show all elements immediately
            document.querySelectorAll('.scroll-fade-in').forEach(el => {
                el.classList.add('visible');
            });
            return;
        }

        // Create Intersection Observer
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    // Optional: unobserve after animation to improve performance
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1, // Trigger when 10% of element is visible
            rootMargin: '0px 0px -50px 0px' // Trigger slightly before element enters viewport
        });

        // Observe all elements with scroll-fade-in class
        document.querySelectorAll('.scroll-fade-in').forEach(el => {
            observer.observe(el);
        });
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initScrollAnimations);
    } else {
        initScrollAnimations();
    }

    // Re-initialize when Alpine.js finishes loading (for dynamically added content)
    document.addEventListener('alpine:init', () => {
        setTimeout(initScrollAnimations, 100);
    });
})();
