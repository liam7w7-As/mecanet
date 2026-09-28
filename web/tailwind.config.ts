import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}', '../shared/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          // --- Sistema Modernize -------------------------------------------------
          // Los roles están separados a propósito. `brand-blue` (#0E2B4E) se
          // usaba para texto, fondo, borde y ring a la vez; aquí cada rol tiene
          // su token y migrarlos es parte del trabajo, no un renombre.
          /** Texto principal y encabezados. */
          ink: '#2A3547',
          /** Texto secundario. */
          muted: '#5A6A85',
          /** Bordes y separadores. */
          line: '#EBF1F6',
          surface: '#FFFFFF',
          page: '#FFFFFF',
          /**
           * Superficie oscura. No es un color inventado: es el `--surface` del
           * tema `body.dark` del propio diseño Modernize. La necesitan las cards
           * oscuras (la de vehículo), donde los acentos claros del diseño sí
           * contrastan y sobre superficie clara no.
           */
          surfaceDark: '#202936',
          /**
           * Texto secundario SOBRE `surfaceDark`. El `--muted` claro (#5A6A85)
           * da solo 2.68:1 sobre la superficie oscura; este es el `--muted` del
           * tema `body.dark` del propio diseño.
           */
          mutedOnDark: '#A8B5C8',
          /**
           * Velo de los modales. Es el `.scrim` de la referencia
           * (`background:#18273c55`), no un gris neutro: el `slate-950` que se
           * usaba antes es mas frio y mas opaco.
           */
          scrim: '#18273C',
          /** Acento: CTA, estado activo, foco. Nunca para texto corrido. */
          primary: '#5D87FF',
          primaryHover: '#4576F6',
          /** Fondos teñidos para KPIs y chips. */
          pale: '#ECF2FF',
          bluePale: '#E8F7FF',
          mintPale: '#E6FFFA',
          coralPale: '#FDEDE8',
          goldPale: '#FEF5E5',
          /** Acentos secundarios para KPI y gráficos. */
          cyan: '#49BEFF',
          mint: '#13DEB9',
          coral: '#FA896B',
          gold: '#FFAE1F',
          /** Hover de `gold`. Un paso apenas más oscuro, como con `primaryInkHover`. */
          goldHover: '#E09200',
          /**
           * Variantes accesibles de los acentos, para TEXTO sobre fondos
           * pastel. Los de arriba se quedan para superficies e iconos: como
           * texto no llegan al minimo de WCAG AA, ni en su propio pastel.
           * Medido sobre su fondo: primary 2.94:1, gold 1.99:1, mint 1.94:1,
           * cyan 2.05:1, coral 2.08:1 (se exige 4.5:1). Estos valores se
           * derivaron oscureciendo cada matiz hasta cumplir 4.5:1, sin
           * cambiar el tono: 4.5-4.6:1 en los cinco.
           */
          primaryInk: '#255DFF',
          /**
           * Hover de `primaryInk`. Necesario porque `primaryHover` (#4576F6) es
           * mas CLARO que `primaryInk`, y aplicarlo dejaba el hover mas claro
           * que el estado normal.
           */
          primaryInkHover: '#1A4AE0',
          goldInk: '#9C6400',
          coralInk: '#CD3007',
          mintInk: '#0B826D',
          cyanInk: '#0075B7',
          // --- Legacy ----------------------------------------------------------
          // Se eliminan al terminar la migración. Ver brand.ink / brand.primary.
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
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        // El template usa radios de 6-8px casi en todas partes.
        field: '6px',
        panel: '8px',
      },
      boxShadow: {
        // 0 2px 6px -1px #afb6c917, tal cual el :root del diseño.
        panel: '0 2px 6px -1px #afb6c917',
      },
    },
  },
  plugins: [],
};

export default config;
