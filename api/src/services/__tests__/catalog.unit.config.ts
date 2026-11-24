import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Never load api/vitest.config.ts: its global setup seeds/truncates MySQL.
export default defineConfig({
  root: fileURLToPath(new URL('../../../', import.meta.url)),
  resolve: {
    alias: { '@unithor/shared': fileURLToPath(new URL('../../../../shared/src/index.ts', import.meta.url)) },
  },
  test: {
    environment: 'node', setupFiles: [], globalSetup: [],
    include: [
      'src/services/__tests__/catalog-division-migration.unit.test.ts',
      'src/services/__tests__/catalog-import.unit.test.ts',
      'src/services/__tests__/catalog-service.unit.test.ts',
      'src/services/__tests__/catalog-events.unit.test.ts',
    ],
  },
});
