/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{vue,ts,js}', './electron/**/*.{ts,js}'],
  theme: {
    extend: {
      colors: {
        'upforge-red': '#ef4444',
        'upforge-orange': '#f97316',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
