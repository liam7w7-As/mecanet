import { defineConfig } from 'vitest/config';

/** Never loads the default API setup, migrations, seeds or truncation hooks. */
export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: [],
    setupFiles: [],
    include: [
      'src/services/__tests__/workshop-cost-report.unit.test.ts',
      'src/services/__tests__/workshop-cost-report.service.unit.test.ts',
    ],
  },
});
