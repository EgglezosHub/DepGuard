/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Geist"', '-apple-system', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        ink: {
          900: '#ffffff', // App background (Pure White)
          800: '#f8fafc', // Panel backgrounds
          700: '#e2e8f0', // Borders
          600: '#cbd5e1', // Muted elements
          500: '#64748b', // Muted text
          400: '#475569', // Standard text
          300: '#334155', // Dark text
          200: '#1e293b', // Headings
          100: '#0f172a', // High contrast text
          50: '#000000',  // Pure Black
        },
        signal: {
          DEFAULT: '#e84a3b', // The bright red you want
          soft: '#fbe5e2',
          deep: '#991b1b',
        },
        safe: {
          DEFAULT: '#1f8a7a',
          soft: '#d8ece9',
          deep: '#0a3a34',
        },
      },
      letterSpacing: {
        microcaps: '0.18em',
      },
    },
  },
  plugins: [],
};
