# SlateSafe.com

A modern e-commerce website for SlateSafe, providing cost-effective tablet accessories for visitor check-in kiosks, POS systems, and home automation mounts.

## Overview

SlateSafe offers practical, professionally designed tablet accessories including low-profile USB-C cables and tamper-resistant tablet enclosures. The website is built as a static site optimized for performance and reliability.

## Technology Stack

- **Alpine.js** - Lightweight JavaScript framework for interactive components
- **Tailwind CSS** - Utility-first CSS framework (compiled via PostCSS)
- **Shopify Storefront API** - E-commerce functionality and checkout integration
- **GitHub Pages** - Static site hosting

## Development Setup

### Prerequisites

- Node.js (LTS version recommended)
- npm (included with Node.js)

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build CSS for production:
   ```bash
   npm run build-css
   ```

3. For development with auto-rebuild:
   ```bash
   npm run watch-css
   ```

## Project Structure

```
├── index.html                    # Landing page
├── products.html                 # Product catalog
├── product-*.html                # Individual product pages
├── about.html                    # Company information
├── contact.html                  # Contact form
├── shopify-cart.js               # Cart functionality
├── app-init.js                   # Application initialization
├── styles.css                    # Custom styles
├── src/
│   └── input.css                 # Tailwind CSS source
├── dist/
│   └── output.css                # Compiled CSS (generated)
├── tailwind.config.js            # Tailwind configuration
├── postcss.config.js             # PostCSS configuration
└── package.json                  # Dependencies and scripts
```

## Key Features

- Fully responsive design with mobile-first approach
- Dark mode support
- Shopping cart with slide-out drawer
- Shopify checkout integration
- Product filtering and search
- Form handling via Formspree
- Optimized for performance and SEO

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers (iOS Safari, Chrome Mobile)
- Progressive enhancement ensures functionality across devices

## Deployment

The site is configured for GitHub Pages deployment. The compiled CSS file (`dist/output.css`) is included in the repository for static hosting.

1. Push to GitHub repository
2. Configure GitHub Pages in repository settings
3. Select the appropriate branch (typically `main`)
4. Site will be available at your GitHub Pages URL

For custom domain configuration, refer to GitHub Pages documentation.

## License

All rights reserved. SlateSafe 2024.
