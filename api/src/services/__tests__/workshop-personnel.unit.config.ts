import { defineConfig } from 'vitest/config';

/** Explicit DB-free runner; the default API vitest config initializes/truncates MySQL. */
export default defineConfig({
  test: { environment: 'node', include: ['src/services/__tests__/workshop-personnel.unit.test.ts', 'src/models/__tests__/workshop-schedule.unit.test.ts'], globalSetup: [], setupFiles: [] },
});
