/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "primary": "#1e88e5",
        "primary-dark": "#1565c0",
        "primary-light": "#e3f2fd",
      },
      fontFamily: {
        "display": ["Manrope", "sans-serif"]
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem", 
        "xl": "0.75rem", 
        "2xl": "1rem",
        "full": "9999px"
      },
      boxShadow: {
        "soft": "0 2px 12px rgba(0, 0, 0, 0.08)",
        "card": "0 1px 3px rgba(0, 0, 0, 0.1)",
      }
    },
  },
  plugins: [],
};
