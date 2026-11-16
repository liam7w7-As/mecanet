import { defineConfig } from 'vitest/config';

// Intentionally excludes API database setup/migrations/truncation.
export default defineConfig({ test: { environment: 'node', globalSetup: [], setupFiles: [], include: ['src/services/__tests__/workshop-session-precision.unit.test.ts'] } });
