import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { environment: 'node', globalSetup: [], setupFiles: [],
  include: ['src/services/__tests__/workshop-performance.calculator.unit.test.ts', 'src/services/__tests__/workshop-performance-export.unit.test.ts'] } });
