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
      keyframes: {
        'notch-arrive': {
          from: { opacity: '0', transform: 'translate3d(0, -1rem, 0) scale(0.965)' },
          to: { opacity: '1', transform: 'translate3d(0, var(--notch-y, 0px), 0) scale(var(--notch-scale, 1))' },
        },
        'notch-liquid': {
          '0%, 100%': { opacity: '0.46', transform: 'translateX(-50%) scaleX(0.96) scaleY(0.9)' },
          '50%': { opacity: '0.68', transform: 'translateX(-50%) scaleX(1.04) scaleY(1.04)' },
        },
      },
      animation: {
        'notch-arrive': 'notch-arrive 720ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'notch-liquid': 'notch-liquid 5.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
