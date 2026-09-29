module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'error',
    'import/order': [
      'warn',
      {
        groups: [
          'builtin',
          'external',
          'internal',
          ['parent', 'sibling', 'index'],
          'object',
          'type',
        ],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
  },
  overrides: [
    {
      // Los `.cjs` son CommonJS. Sin esto heredan `sourceType: 'module'` de la
      // config base y el parser de TypeScript los interpreta como ESM, lo que
      // rompe los scripts de verificacion de web/designs/work.
      files: ['*.cjs'],
      parserOptions: {
        sourceType: 'script',
      },
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
  ignorePatterns: [
    'dist',
    'node_modules',
    '*.min.js',
    'coverage',
    // No es codigo: es la plantilla que `build.cjs` rellena con los marcadores
    // {{tableAssets}} y {{tableData}} antes de emitirla. ESLint la leia como
    // JavaScript y se quejaba de una linea 3 que jamas se ejecuta tal cual.
    'web/designs/work/views.js',
  ],
};
