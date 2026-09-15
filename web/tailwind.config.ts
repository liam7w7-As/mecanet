import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}', '../shared/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#0E2B4E',
          yellow: '#FFD600',
          dark: '#081B31',
          light: '#F4F6F9',
        },
        primary: {
          DEFAULT: '#0E2B4E',
          foreground: '#FFFFFF',
          dark: '#081D35',
          light: '#1B477A',
        },
        accent: {
          DEFAULT: '#FFD600',
          foreground: '#0E2B4E',
          hover: '#E5C000',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
