/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: { extend: { colors: { brand: { DEFAULT: "#4f46e5", soft: "#eef2ff" } } } },
  plugins: [],
};
