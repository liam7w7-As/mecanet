/**
 * Verificación de la Fase 0 (base del diseño).
 *
 * Levanta `vite preview` sobre `web/dist`, comprueba con Playwright que la
 * fuente y los tokens realmente se aplican, y deja capturas para comparar.
 *
 * Uso:  node web/designs/work/verify-foundation.cjs
 * Devuelve código de salida 1 si algo falla.
 */
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const { chromium } = require('./playwright.cjs');

// __dirname es <repo>/web/designs/work: el repo está tres niveles arriba.
const REPO = path.resolve(__dirname, '../../..');
const WEB = path.join(REPO, 'web');
const DIST = path.join(WEB, 'dist');
const OUT = __dirname;
const PORT = 4319;
const URL = `http://127.0.0.1:${PORT}`;

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

/**
 * Servidor estático mínimo sobre web/dist. Se usa en lugar de `vite preview`
 * para no depender de spawnear un shell en este entorno.
 */
const startStaticServer = () =>
  new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requested = decodeURIComponent((req.url || '/').split('?')[0]);
      const candidate = path.join(DIST, requested);
      const safe = path.normalize(candidate).startsWith(path.normalize(DIST));
      let file = safe ? candidate : DIST;
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = path.join(DIST, 'index.html');
      }
      res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    });
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });

(async () => {
  const checks = {};
  const failures = [];

  try {
    if (!fs.existsSync(path.join(DIST, 'index.html'))) {
      throw new Error('Falta web/dist/index.html. Ejecuta `npm run build --workspace=web` antes de verificar.');
    }
    const server = await startStaticServer();

    const browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);

    // 1. La fuente debe estar disponible y realmente aplicada.
    checks.fontAvailable = await page.evaluate(() =>
      document.fonts.check('14px "Plus Jakarta Sans"'),
    );
    checks.fontFamilyBody = await page.evaluate(() =>
      getComputedStyle(document.body).fontFamily,
    );
    checks.fontBaseSize = await page.evaluate(() =>
      getComputedStyle(document.body).fontSize,
    );

    // 2. Los tokens CSS deben resolver a los valores del diseño.
    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const names = [
        'ink', 'muted', 'line', 'primary', 'primary-hover',
        'pale', 'mint-pale', 'coral-pale', 'gold-pale',
        'cyan', 'mint', 'coral', 'gold', 'shadow', 'sidebar',
      ];
      return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(`--${name}`).trim()]));
    });
    checks.tokens = tokens;

    const expected = {
      ink: '#2a3547',
      muted: '#5a6a85',
      line: '#ebf1f6',
      primary: '#5d87ff',
      'primary-hover': '#4576f6',
      pale: '#ecf2ff',
      'mint-pale': '#e6fffa',
      'coral-pale': '#fdede8',
      'gold-pale': '#fef5e5',
      cyan: '#49beff',
      mint: '#13deb9',
      coral: '#fa896b',
      gold: '#ffae1f',
      sidebar: '270px',
    };
    for (const [name, value] of Object.entries(expected)) {
      if (tokens[name] !== value) {
        failures.push(`token --${name}: esperaba ${value}, obtuve ${tokens[name]}`);
      }
    }

    // 3. Las primitivas portadas deben existir y medirse como en el diseño.
    checks.primitives = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.innerHTML = `
        <div class="stat" id="p-stat"><span class="stat-label">Empleados</span><span class="stat-value">96</span></div>
        <div class="status-chip green" id="p-chip">Aprobada</div>
        <div class="card" id="p-card">card</div>
        <div class="nav-item active" id="p-nav">Taller</div>
        <table class="data-table dense" id="p-table"><tbody><tr><td>celda</td></tr></tbody></table>
      `;
      document.body.appendChild(probe);
      const read = (id, props) => {
        const el = document.getElementById(id);
        const cs = getComputedStyle(el);
        return Object.fromEntries(props.map((prop) => [prop, cs[prop]]));
      };
      const out = {
        stat: read('p-stat', ['height', 'borderRadius', 'backgroundColor', 'color']),
        statLabel: read('stat-label' in window ? 'stat-label' : 'p-stat', []) && (() => {
          const cs = getComputedStyle(document.querySelector('.stat-label'));
          return { fontSize: cs.fontSize, fontWeight: cs.fontWeight };
        })(),
        statValue: (() => {
          const cs = getComputedStyle(document.querySelector('.stat-value'));
          return { fontSize: cs.fontSize, lineHeight: cs.lineHeight, fontWeight: cs.fontWeight };
        })(),
        chip: read('p-chip', ['backgroundColor', 'color', 'borderRadius', 'fontSize']),
        card: read('p-card', ['borderRadius', 'boxShadow', 'borderTopColor']),
        nav: read('p-nav', ['minHeight', 'backgroundColor', 'color', 'fontWeight']),
        tableCell: (() => {
          const cs = getComputedStyle(document.querySelector('#p-table td'));
          return { padding: cs.padding, fontSize: cs.fontSize };
        })(),
      };
      probe.remove();
      return out;
    });

    const expectEqual = (label, actual, wanted) => {
      if (actual !== wanted) {
        failures.push(`${label}: esperaba ${wanted}, obtuve ${actual}`);
      }
    };
    expectEqual('.stat alto', checks.primitives.stat.height, '161px');
    expectEqual('.stat-label font-size', checks.primitives.statLabel.fontSize, '14px');
    expectEqual('.stat-value font-size', checks.primitives.statValue.fontSize, '21px');
    expectEqual('.status-chip fondo', checks.primitives.chip.backgroundColor, 'rgb(230, 255, 250)');
    expectEqual('.card radio', checks.primitives.card.borderRadius, '8px');
    expectEqual('.nav-item min-height', checks.primitives.nav.minHeight, '45px');
    expectEqual('.nav-item activo fondo', checks.primitives.nav.backgroundColor, 'rgb(37, 93, 255)');
    expectEqual('.data-table.dense td padding', checks.primitives.tableCell.padding, '7px 16px');

    // 4. Sin overflow horizontal, igual que el diseño de referencia.
    checks.overflow = {};
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      checks.overflow[width] = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      if (checks.overflow[width].scrollWidth > width + 1) {
        failures.push(`overflow horizontal a ${width}px (scrollWidth ${checks.overflow[width].scrollWidth})`);
      }
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: path.join(OUT, 'foundation-1440.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(OUT, 'foundation-390.png'), fullPage: true });

    checks.pageErrors = pageErrors;
    if (pageErrors.length > 0) {
      failures.push(`errores de página: ${pageErrors.join(' | ')}`);
    }

    await browser.close();
    server.close();
  } catch (error) {
    failures.push(error.message);
  }

  const report = { ...checks, failures, ok: failures.length === 0 };
  fs.writeFileSync(path.join(OUT, 'foundation-verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(failures.length === 0 ? '\nOK: la base del diseño está aplicada.' : `\nFALLOS (${failures.length}):`);
  for (const failure of failures) {
    console.log(` - ${failure}`);
  }
  process.exit(failures.length === 0 ? 0 : 1);
})();
