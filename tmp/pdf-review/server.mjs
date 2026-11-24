import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const root = 'C:/xampp/htdocs/x9_unithor';
process.chdir(`${root}/web`);
const server = await createServer({
  root,
  configFile: false,
  publicDir: `${root}/web/public`,
  plugins: [react()],
  css: { postcss: { plugins: [tailwind(`${root}/web/tailwind.config.ts`), autoprefixer()] } },
  server: { host: '127.0.0.1', port: 5187, strictPort: true },
});
await server.listen();
server.printUrls();
