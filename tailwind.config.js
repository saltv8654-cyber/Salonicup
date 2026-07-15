/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pitch:  '#0B0B0E',
        turf:   '#16161B',
        brand:  '#E05B1F',
        lit:    '#FF7A2F',
        chalk:  '#EDEDF0',
        silver: '#A3A3AD',
        dim:    '#63636E',
        off:    '#2C2C33',
        live:   '#E23B2E',
        card:   '#F2C230',
        danger: '#D93A2B',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
}
