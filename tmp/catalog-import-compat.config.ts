import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('../api/', import.meta.url)),
  resolve: { alias: { '@unithor/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) } },
  test: {
    environment: 'node', setupFiles: [], globalSetup: [],
    include: ['src/services/__tests__/catalog-import-compat.unit.test.ts', 'src/services/__tests__/catalog-import.unit.test.ts'],
  },
});
