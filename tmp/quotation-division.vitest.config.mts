import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['api/src/services/__tests__/quotation-division-sync.unit.test.ts'], globalSetup: [], setupFiles: [] } });
