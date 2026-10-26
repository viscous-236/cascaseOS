/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        finops: {
          bg: '#07090e',
          card: '#0c0e14',
          surface: '#11151f',
          border: 'rgba(255, 255, 255, 0.08)',
          hover: 'rgba(255, 255, 255, 0.04)',
          accent: '#10B981',
          warning: '#F59E0B',
          danger: '#EF4444',
          info: '#38BDF8',
          muted: '#94A3B8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'shimmer-slide': 'shimmer-slide var(--speed) ease-in-out infinite alternate',
        'spin-around': 'spin-around calc(var(--speed) * 2) infinite linear',
      },
      keyframes: {
        'shimmer-slide': {
          to: {
            transform: 'translate(calc(100cqw - 100%), 0)',
          },
        },
        'spin-around': {
          '0%': {
            transform: 'translateZ(0) rotate(0)',
          },
          '15%, 35%': {
            transform: 'translateZ(0) rotate(90deg)',
          },
          '65%, 85%': {
            transform: 'translateZ(0) rotate(270deg)',
          },
          '100%': {
            transform: 'translateZ(0) rotate(360deg)',
          },
        },
      },
      boxShadow: {
        'subtle-card': '0 1px 2px 0 rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        'elevated-card': '0 10px 30px -10px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.08)',
      },
    },
  },
  plugins: [],
};
