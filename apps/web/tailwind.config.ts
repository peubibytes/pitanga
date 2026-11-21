import type { Config } from 'tailwindcss';

// Cores vêm de variáveis CSS (src/styles/tokens.css), no formato "R G B", para aceitar opacidade.
const cor = (nome: string) => `rgb(var(--${nome}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pitanga: {
          50: cor('pitanga-50'),
          100: cor('pitanga-100'),
          200: cor('pitanga-200'),
          400: cor('pitanga-400'),
          500: cor('pitanga-500'),
          600: cor('pitanga-600'),
          700: cor('pitanga-700'),
          800: cor('pitanga-800'),
        },
        folha: {
          50: cor('folha-50'),
          100: cor('folha-100'),
          500: cor('folha-500'),
          600: cor('folha-600'),
          700: cor('folha-700'),
        },
        ambar: {
          50: cor('ambar-50'),
          100: cor('ambar-100'),
          600: cor('ambar-600'),
          700: cor('ambar-700'),
        },
        creme: {
          50: cor('creme-50'),
          100: cor('creme-100'),
          200: cor('creme-200'),
          300: cor('creme-300'),
        },
        tinta: {
          400: cor('tinta-400'),
          500: cor('tinta-500'),
          600: cor('tinta-600'),
          700: cor('tinta-700'),
          900: cor('tinta-900'),
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'system-ui', 'sans-serif'],
        titulo: ['"Fraunces Variable"', 'Georgia', 'serif'],
      },
      borderRadius: { cartao: '14px', campo: '10px' },
      boxShadow: {
        cartao: '0 1px 2px rgb(60 30 20 / 0.06), 0 4px 14px rgb(60 30 20 / 0.05)',
        elevado: '0 12px 40px rgb(60 30 20 / 0.18)',
      },
    },
  },
  plugins: [],
} satisfies Config;
