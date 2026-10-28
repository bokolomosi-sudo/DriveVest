/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Bleu nuit : sérieux et confiance
        night: {
          50: '#eef3fb',
          100: '#d9e3f4',
          200: '#b3c6e8',
          300: '#7f9fd3',
          400: '#4f76b8',
          500: '#2f569b',
          600: '#21417d',
          700: '#183262',
          800: '#11244a',
          900: '#0b1a36',
          950: '#060f22',
        },
        // Turquoise : actions positives
        accent: {
          50: '#ecfdf8',
          100: '#d1faef',
          200: '#a6f3df',
          300: '#6ae6ca',
          400: '#2fd0b0',
          500: '#14b897',
          600: '#0a947b',
          700: '#0b7665',
          800: '#0e5d52',
          900: '#0f4d45',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      // Barre de chargement réseau (va-et-vient en haut de l'écran)
      keyframes: {
        'network-bar': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(300%)' },
        },
      },
      animation: {
        'network-bar': 'network-bar 1.1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
