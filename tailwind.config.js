/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
    "./src/**/*.{html,js}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'slate-deep': '#1a1a1a',
        'slate-dark': '#2d2d2d',
        'matte-black': '#0a0a0a',
        'brand-orange': '#e69137',
        'brand-blue': '#6ea6db',
        'header-blue': '#073763'
      }
    }
  },
  plugins: []
}



