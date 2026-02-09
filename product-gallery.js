// Product Gallery Component - Reusable gallery for Shopify product media
// Usage: Add to product page with x-data="productGallery(productId, selectedVariantId, selectedVariantImage)" 
document.addEventListener('alpine:init', () => {
    Alpine.data('productGallery', (productId, selectedVariantId = null, selectedVariantImage = null) => ({
        media: [],
        selectedIndex: 0,
        loading: true,
        error: null,
        userHasInteracted: false,
        currentProductId: productId,
        currentVariantId: selectedVariantId,
        variantImage: selectedVariantImage,
        
        async init() {
            if (!this.currentProductId) {
                this.error = 'Product ID not provided';
                this.loading = false;
                return;
            }
            
            await this.loadMedia();
        },
        
        async loadMedia() {
            if (!this.currentProductId) return;
            
            this.loading = true;
            try {
                const fetchedMedia = await Alpine.store('cart').fetchProductMedia(
                    this.currentProductId,
                    null // Don't filter by variant - we'll prioritize variant image instead
                );
                
                // If variant has a featured image, prioritize it
                if (this.variantImage && this.variantImage.url) {
                    // Check if variant image is already in media array
                    const variantImageInMedia = fetchedMedia.find(m => 
                        m.type === 'IMAGE' && m.url === this.variantImage.url
                    );
                    
                    if (!variantImageInMedia) {
                        // Add variant image as first item
                        fetchedMedia.unshift({
                            type: 'IMAGE',
                            url: this.variantImage.url,
                            alt: this.variantImage.alt || '',
                            id: this.variantImage.url,
                            variantId: this.currentVariantId,
                            isVariantImage: true
                        });
                    } else {
                        // Move variant image to front
                        const index = fetchedMedia.indexOf(variantImageInMedia);
                        if (index > 0) {
                            fetchedMedia.splice(index, 1);
                            fetchedMedia.unshift(variantImageInMedia);
                        }
                    }
                }
                
                if (fetchedMedia.length > 0) {
                    this.media = fetchedMedia;
                    // Reset to first image when media changes
                    this.selectedIndex = 0;
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
        
        // Method to update variant and reload media
        updateVariant(newVariantId, newVariantImage) {
            if (newVariantId !== this.currentVariantId || newVariantImage !== this.variantImage) {
                this.currentVariantId = newVariantId;
                this.variantImage = newVariantImage;
                this.loadMedia();
            }
        },
        
        selectMedia(index) {
            if (index >= 0 && index < this.media.length) {
                this.userHasInteracted = true;
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
