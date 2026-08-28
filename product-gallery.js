// Product Gallery Component - local first-party media from products.json
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
                const fetchedMedia = await Alpine.store('cart').fetchProductMedia(this.currentProductId);

                if (this.variantImage && this.variantImage.url) {
                    const variantImageInMedia = fetchedMedia.find((m) =>
                        m.type === 'IMAGE' && m.url === this.variantImage.url
                    );

                    if (!variantImageInMedia) {
                        fetchedMedia.unshift({
                            type: 'IMAGE',
                            url: this.variantImage.url,
                            alt: this.variantImage.alt || '',
                            id: this.variantImage.url,
                            variantId: this.currentVariantId,
                            isVariantImage: true
                        });
                    } else {
                        const index = fetchedMedia.indexOf(variantImageInMedia);
                        if (index > 0) {
                            fetchedMedia.splice(index, 1);
                            fetchedMedia.unshift(variantImageInMedia);
                        }
                    }
                }

                if (fetchedMedia.length > 0) {
                    this.media = fetchedMedia;
                    this.selectedIndex = 0;
                    this.error = null;
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

        isRemoteCdn(url) {
            return /^https?:\/\//i.test(url || '');
        },

        getOptimizedImageUrl(url) {
            if (!url) return '';
            // First-party files on GitHub Pages do not accept Shopify-style width params.
            if (!this.isRemoteCdn(url)) return url;
            if (url.includes('?')) {
                if (url.includes('width=')) {
                    return url.replace(/width=\d+/, 'width=800');
                }
                return `${url}&width=800`;
            }
            return `${url}?width=800`;
        },

        getThumbnailUrl(url) {
            if (!url) return '';
            if (!this.isRemoteCdn(url)) return url;
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
