import { defineConfig } from 'vitest/config';

// DB-free only: never inherit API migration, seed or truncation setup.
export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: [],
    setupFiles: [],
    include: ['src/services/__tests__/workshop-alert*.unit.test.ts'],
  },
});
