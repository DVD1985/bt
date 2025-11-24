/** @type {import('tailwindcss').Config} */
module.exports = {
  // MUY IMPORTANTE: Especifica dónde debe Tailwind buscar las clases
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}