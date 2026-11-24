import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({ root: fileURLToPath(new URL("../api/", import.meta.url)), test: { environment: "node", include: ["src/services/reports/__tests__/work-order-document-pdf.test.ts"], setupFiles: [], globalSetup: [] } });
