// Theme Detection and Alpine Store Initialization
(function() {
    // Detect system preference and set initial theme
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedTheme = localStorage.getItem('theme');
    const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    
    if (shouldBeDark) {
        document.documentElement.classList.add('dark');
    }
    
    // Initialize Alpine stores
    document.addEventListener('alpine:init', () => {
        // Theme store
        Alpine.store('theme', {
            dark: shouldBeDark,
            toggle() {
                this.dark = !this.dark;
                if (this.dark) {
                    document.documentElement.classList.add('dark');
                    localStorage.setItem('theme', 'dark');
                } else {
                    document.documentElement.classList.remove('dark');
                    localStorage.setItem('theme', 'light');
                }
            }
        });
        
        // Toast notification store
        Alpine.store('toast', {
            messages: [],
            show(message, type = 'error') {
                const id = Date.now();
                this.messages.push({ id, message, type });
                // Auto-remove after 8 seconds
                setTimeout(() => {
                    this.remove(id);
                }, 8000);
            },
            remove(id) {
                this.messages = this.messages.filter(m => m.id !== id);
            }
        });
    });
})();


