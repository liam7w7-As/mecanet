import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Vaciar las tablas transaccionales antes de cada archivo, dejando la linea
    // base del seed intacta. Ver el comentario en src/test/setup-truncate.ts.
    setupFiles: ['./src/test/setup-truncate.ts'],
  },
});
