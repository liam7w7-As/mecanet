/**
 * Servidor estatico de `web/dist` con proxy de `/api` hacia la API.
 *
 * Los verificadores apuntan aqui y no al dev server a proposito. Vite sirve el
 * CSS como modulo JS y no siempre recarga `tailwind.config.ts`: durante esta
 * migracion seguia sirviendo una hoja de estilos sin los tokens `*Ink`, y las
 * clases se veian como no-ops. Verificar contra `dist` tiene dos ventajas:
 * comprueba lo que realmente se shippea y no depende del estado del dev
 * server.
 *
 * Se reimplementa en vez de usar `vite preview` para no depender de spawnear
 * un shell en este entorno.
 */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const startServer = ({ root, port, apiPort = 4000 }) =>
  new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requested = decodeURIComponent((req.url || '/').split('?')[0]);

      // Proxy de la API: la app llama a `/api/...` en relativo.
      if (requested.startsWith('/api/')) {
        const proxy = http.request(
          { host: '127.0.0.1', port: apiPort, path: req.url, method: req.method, headers: req.headers },
          (upstream) => {
            res.writeHead(upstream.statusCode || 502, upstream.headers);
            upstream.pipe(res);
          },
        );
        proxy.on('error', () => {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'La API no esta escuchando en ' + apiPort }));
        });
        req.pipe(proxy);
        return;
      }

      const candidate = path.join(root, requested);
      const safe = path.normalize(candidate).startsWith(path.normalize(root));
      let file = safe ? candidate : root;
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = path.join(root, 'index.html');
      }
      res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    });

    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });

module.exports = { startServer };
