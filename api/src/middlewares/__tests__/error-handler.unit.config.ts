import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { environment: 'node', globalSetup: [], setupFiles: [], include: [
  'src/middlewares/__tests__/error-handler.test.ts', 'src/utils/__tests__/error-diagnostic.test.ts',
] } });
