// Cookie Consent Management for GDPR Compliance
(function() {
    const CONSENT_KEY = 'slatesafe_cookie_consent';
    const CONSENT_EXPIRY_DAYS = 365;
    
    // Initialize cookie consent store
    document.addEventListener('alpine:init', () => {
        Alpine.store('cookieConsent', {
            consented: false,
            consentType: null, // 'accepted', 'rejected', or null
            showBanner: false,
            
            init() {
                // Check for existing consent
                const savedConsent = this.getSavedConsent();
                if (savedConsent) {
                    this.consented = savedConsent.consented;
                    this.consentType = savedConsent.type;
                    this.showBanner = false;
                } else {
                    // No consent saved, show banner
                    this.showBanner = true;
                }
            },
            
            getSavedConsent() {
                try {
                    const saved = localStorage.getItem(CONSENT_KEY);
                    if (!saved) return null;
                    
                    const consent = JSON.parse(saved);
                    const now = Date.now();
                    
                    // Check if consent has expired
                    if (consent.expiry && consent.expiry < now) {
                        localStorage.removeItem(CONSENT_KEY);
                        return null;
                    }
                    
                    return consent;
                } catch (e) {
                    console.error('Error reading consent:', e);
                    return null;
                }
            },
            
            saveConsent(consented, type) {
                const expiry = Date.now() + (CONSENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
                const consent = {
                    consented,
                    type,
                    timestamp: Date.now(),
                    expiry
                };
                
                try {
                    localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
                    this.consented = consented;
                    this.consentType = type;
                    this.showBanner = false;
                    
                    // Trigger consent change event
                    window.dispatchEvent(new CustomEvent('cookieConsentChanged', { 
                        detail: { consented, type } 
                    }));
                } catch (e) {
                    console.error('Error saving consent:', e);
                }
            },
            
            accept() {
                this.saveConsent(true, 'accepted');
            },
            
            reject() {
                this.saveConsent(false, 'rejected');
            },
            
            hasConsented() {
                return this.consented === true;
            },
            
            showBannerAgain() {
                this.showBanner = true;
            },
            
            clearConsent() {
                localStorage.removeItem(CONSENT_KEY);
                this.consented = false;
                this.consentType = null;
                this.showBanner = true;
            }
        });
    });
})();
