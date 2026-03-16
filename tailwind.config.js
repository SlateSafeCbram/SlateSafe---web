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
        'midnight-black': '#000000',
        'midnight-gray': '#121212',
        'brand-orange': '#e69137',
        'brand-blue': '#6ea6db',
        'header-blue': '#073763'
      },
      fontFamily: {
        'sans': ['Inter', 'Geist', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.8s ease-out',
        'fade-in': 'fadeIn 0.6s ease-out',
      },
      keyframes: {
        fadeInUp: {
          '0%': {
            opacity: '0',
            transform: 'translateY(30px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        fadeIn: {
          '0%': {
            opacity: '0',
          },
          '100%': {
            opacity: '1',
          },
        },
      },
      backdropBlur: {
        'glass': '10px',
      },
    }
  },
  plugins: []
}



