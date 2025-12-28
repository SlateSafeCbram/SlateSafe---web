// Product Gallery Component - Reusable gallery for Shopify product media
// Usage: Add to product page with x-data="productGallery('productId')" where productId is numeric Shopify product ID
document.addEventListener('alpine:init', () => {
    Alpine.data('productGallery', (productId) => ({
        media: [],
        selectedIndex: 0,
        loading: true,
        error: null,
        
        async init() {
            if (!productId) {
                this.error = 'Product ID not provided';
                this.loading = false;
                return;
            }
            
            try {
                const fetchedMedia = await Alpine.store('cart').fetchProductMedia(productId);
                if (fetchedMedia.length > 0) {
                    this.media = fetchedMedia;
                } else {
                    this.error = 'No media found for this product';
                }
            } catch (error) {
                this.error = 'Failed to load product gallery';
                console.error('Gallery error:', error);
            } finally {
                this.loading = false;
            }
        },
        
        selectMedia(index) {
            if (index >= 0 && index < this.media.length) {
                this.selectedIndex = index;
            }
        },
        
        getOptimizedImageUrl(url) {
            if (!url) return '';
            // Add width parameter for image optimization - only if not already present
            if (url.includes('?')) {
                // Check if width parameter already exists
                if (url.includes('width=')) {
                    return url.replace(/width=\d+/, 'width=800');
                }
                return `${url}&width=800`;
            }
            return `${url}?width=800`;
        },
        
        getThumbnailUrl(url) {
            if (!url) return '';
            // Smaller size for thumbnails
            if (url.includes('?')) {
                if (url.includes('width=')) {
                    return url.replace(/width=\d+/, 'width=200');
                }
                return `${url}&width=200`;
            }
            return `${url}?width=200`;
        },
        
        getSelectedMedia() {
            return this.media[this.selectedIndex] || null;
        }
    }));
});
