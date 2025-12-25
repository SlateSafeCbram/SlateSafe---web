# SlateSafe.com - Static B2B E-commerce Website

A professional, high-performance static website for SlateSafe, built for GitHub Pages hosting.

## 🚀 Features

- **Multi-page static site** with clean, industrial design
- **Fully responsive** mobile-first approach
- **Alpine.js** for lightweight interactivity
- **Tailwind CSS** via CDN for styling
- **Formspree.io** integration for contact form
- **Professional UI/UX** with Apple-esque B2B aesthetics

## 📁 Site Structure

```
├── index.html                    # Main landing page
├── products.html                 # Product catalog with filter/sort
├── product-usb-c-cable.html      # USB-C Right Angle Cable product page
├── product-tablet-enclosure.html # Industrial Tablet Enclosure product page
├── about.html                    # Founder's story and company values
├── contact.html                  # Contact form with Formspree integration
└── README.md                     # This file
```

## 🎨 Design System

### Colors
- **Deep Slate**: `#1a1a1a`
- **Slate Dark**: `#2d2d2d`
- **Matte Black**: `#0a0a0a`
- **Safety Orange**: `#ff6b35` (Accent)
- **Electric Blue**: `#00a8ff` (Accent)

### Typography
- Clean, modern sans-serif fonts
- Clear hierarchy with bold headings
- Excellent readability with proper contrast

## ⚙️ Setup Instructions

### 1. Formspree Configuration

The contact form uses Formspree.io for email delivery. To configure:

1. Go to [formspree.io](https://formspree.io) and create an account
2. Create a new form
3. Copy your form ID
4. Open `contact.html` and replace `YOUR_FORM_ID` in the form action:
   ```html
   <form action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
   ```
5. Set the email destination to `slatesafe@gmail.com` in your Formspree dashboard

### 2. GitHub Pages Deployment

1. Push this repository to GitHub
2. Go to repository Settings → Pages
3. Select the branch (usually `main` or `gh-pages`)
4. Select the root directory
5. Your site will be live at `https://yourusername.github.io/SlateSafe.com/`

### 3. Custom Domain (Optional)

If you have a custom domain:

1. Add a `CNAME` file in the root with your domain name
2. Configure DNS records as per GitHub Pages instructions
3. Update the repository settings in GitHub

## 📝 Product Pages

Each product page includes:
- **Image gallery** with thumbnail navigation
- **Product specifications** and features
- **Shipping notice** (Limited Batch Shipping - Sundays)
- **Buy button placeholder** (TODO: Integrate with payment processor)
- **Related products** section

## 🔒 Security

- All links use HTTPS
- Assets loaded via secure CDNs
- No backend database required
- Formspree handles form submissions securely

## 🛒 E-commerce Integration

Currently, the buy buttons are placeholders. To integrate:

1. **Stripe Checkout**: Add Stripe Checkout session creation
2. **Shopify Buy Button**: Embed Shopify buy buttons
3. **Custom Payment**: Integrate your preferred payment processor

Update the buy button sections in product pages with your chosen solution.

## 📱 Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile-responsive design
- Progressive enhancement

## 🔧 Customization

### Adding New Products

1. Create a new product page based on `product-template.html`
2. Add product details to `products.html` array in Alpine.js data
3. Update navigation and footer links as needed

### Modifying Colors

Update the Tailwind config in each HTML file's `<script>` tag to change the color scheme.

### Adding Images

Replace placeholder gradient divs with actual product images:
- Recommended size: 800x800px for product images
- Format: WebP, JPG, or PNG
- Optimize for web performance

## 📄 Legal Pages

The site references these pages (create as needed):
- `privacy-policy.html`
- `shipping-policy.html`

## 🚀 Performance

- Static HTML files (fast loading)
- CDN-delivered assets
- Minimal JavaScript (Alpine.js is lightweight)
- Optimized for GitHub Pages

## 📧 Contact

For questions or support, use the contact form or email: cbrammell@slatesafe.com

## 📜 License

All rights reserved. SlateSafe 2024.

