/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'glass': 'rgba(255, 255, 255, 0.1)',
        'glass-hover': 'rgba(255, 255, 255, 0.15)',
        'deep-bg': '#121212',
        'panel-bg': '#181818',
        'accent': '#1db954',
        'crimson': '#e11d48',
      }
    },
  },
  plugins: [],
}
