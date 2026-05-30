export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary-blue': '#00a8e8',
        'primary-light-blue': '#4cc2ff',
        'light-blue': '#99ccf5',
        'pale-blue': '#eccefa',
        'navy-dark': '#003543',
        'navy-medium': '#00435c',
        'navy-light': '#2d6180',
        'gray-dark': '#2d3132',
        'gray-medium': '#6a7a8e',
        'gray-light': '#9a9eab',
        'visio-white': '#f5f7f9',
        'text-primary': '#1a2734',
        'text-secondary': '#475569',
        'danger': '#d32f2f',
        'success': '#2e7d32'
      }
    }
  },
  plugins: []
}