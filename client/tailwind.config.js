/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
        },
        ink: {
          900: '#111827',
          700: '#374151',
          500: '#6b7280',
        },
      },
      boxShadow: {
        panel: '0 1px 2px rgba(17, 24, 39, 0.06)',
      },
    },
  },
  plugins: [],
};
