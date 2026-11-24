import { defineConfig } from 'vitest/config';

// Deliberately bypass api/vitest.config.ts: these tests must never seed, truncate,
// connect to, or compete with the shared database integration test suite.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/services/__tests__/work-order-dp-state.unit.test.ts',
      'src/services/__tests__/catalog-division-migration.unit.test.ts',
      'src/services/__tests__/quotation-division-sync.unit.test.ts',
      'src/services/__tests__/workshop-time.unit.test.ts',
      'src/services/__tests__/workshop-time-timers.unit.test.ts',
      'src/services/__tests__/workshop-time-migration.unit.test.ts',
      'src/services/__tests__/workshop-daily-entry-migration.unit.test.ts',
      'src/services/__tests__/workshop-declared-hours-migration.unit.test.ts',
      'src/routes/__tests__/workshop-time.unit.test.ts',
      'src/services/__tests__/workshop-daily-report.unit.test.ts',
    ],
  },
});
