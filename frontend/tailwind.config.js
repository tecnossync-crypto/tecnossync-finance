/** Tecnossync Ledger — tokens de diseño. Tinta morado-noche, papel lavanda y el degradado
 *  rosa→morado de Tecnossync como firma. ("lime" es el acento claro sobre fondos oscuros.) */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0B0918', 2: '#13102A', 3: '#1C1838', line: '#2A2547' },
        paper: '#F5F3F9',
        surface: '#FFFFFF',
        line: { DEFAULT: '#E6E2EE', strong: '#D3CDE0' },
        text: { DEFAULT: '#15111F', muted: '#625B75', faint: '#948DA6' },
        brand: { DEFAULT: '#8B2FC9', 600: '#7A26B3', 700: '#65209A', 50: '#F5EDFC', 100: '#E9D8F8' },
        pink: { DEFAULT: '#E0359A', soft: '#FCE7F3' },
        lime: { DEFAULT: '#D3B5FF', soft: '#F1E9FF' },
        danger: { DEFAULT: '#C8423B', 50: '#FBECEA' },
        warn: { DEFAULT: '#B7790F', 50: '#FBF1DD' },
        info: { DEFAULT: '#2B62C9', 50: '#E8EFFB' },
      },
      backgroundImage: {
        grad: 'linear-gradient(135deg, #E0359A 0%, #8B2FC9 100%)',
        grad2: 'linear-gradient(135deg, #F472B6 0%, #A855F7 100%)',
      },
      fontFamily: {
        display: ['Outfit', 'system-ui', 'sans-serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { xl: '14px', '2xl': '18px' },
      boxShadow: {
        card: '0 1px 0 rgba(21,17,31,0.04), 0 1px 2px rgba(21,17,31,0.04)',
        pop: '0 12px 40px -12px rgba(11,9,24,0.4), 0 2px 6px rgba(11,9,24,0.08)',
      },
    },
  },
  plugins: [],
};
