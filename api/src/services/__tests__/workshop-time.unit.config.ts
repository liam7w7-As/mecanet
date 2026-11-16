import { defineConfig } from 'vitest/config';

// Deliberately bypass api/vitest.config.ts: these tests must never seed, truncate,
// connect to, or compete with the shared database integration test suite.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/services/__tests__/workshop-time.unit.test.ts',
      'src/routes/__tests__/workshop-time.unit.test.ts',
    ],
  },
});
