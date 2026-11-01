/** Cuadre — tokens de diseño. Tinta verde-negra, papel frío, esmeralda y lima como firma. */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0B1512', 2: '#121F1A', 3: '#1B2B25', line: '#24362F' },
        paper: '#F3F4EF',
        surface: '#FFFFFF',
        line: { DEFAULT: '#E2E5DD', strong: '#CDD2C7' },
        text: { DEFAULT: '#0E1712', muted: '#5B675F', faint: '#8A958D' },
        brand: { DEFAULT: '#0F7B5F', 600: '#0C6650', 700: '#0A5242', 50: '#E7F3EE', 100: '#CFE8DE' },
        lime: { DEFAULT: '#C6F16A', soft: '#EEFBD0' },
        danger: { DEFAULT: '#C8423B', 50: '#FBECEA' },
        warn: { DEFAULT: '#B7790F', 50: '#FBF1DD' },
        info: { DEFAULT: '#2B62C9', 50: '#E8EFFB' },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        sans: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { xl: '14px', '2xl': '18px' },
      boxShadow: {
        card: '0 1px 0 rgba(14,23,18,0.04), 0 1px 2px rgba(14,23,18,0.04)',
        pop: '0 12px 40px -12px rgba(11,21,18,0.35), 0 2px 6px rgba(11,21,18,0.08)',
      },
    },
  },
  plugins: [],
};
