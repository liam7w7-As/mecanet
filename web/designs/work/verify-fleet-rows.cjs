/**
 * Verificación visual de las filas de Flota.
 *
 * Comprueba en un navegador real dos correcciones que la suite de jsdom no
 * puede confirmar por sí sola (no aplica CSS):
 *
 *  1. El resumen es un acordeón: al abrir otra fila se cierra la anterior y
 *     nunca queda más de un `details[open]`.
 *  2. El estado operativo tiñe la fila completa: rojo suave para
 *     `fuera_de_servicio` y gris claro para `dado_de_baja`, con su color
 *     efectivo calculado.
 *
 * La API se intercepta, así que no se crean ni modifican registros reales.
 * Requisitos: `npm run build --workspace=web`.
 *
 * Uso:
 *   node verify-fleet-rows.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { chromium } = require('./playwright.cjs');
const { startServer } = require('./serve-dist.cjs');

const REPO = path.resolve(__dirname, '../../..');
const DIST = path.join(REPO, 'web', 'dist');
const OUT = __dirname;
const PORT = 4322;
const base = process.env.FLEET_ROWS_BASE_URL || `http://127.0.0.1:${PORT}`;

const summary = (overrides = {}) => ({
  total: 1,
  expired: 0,
  expiringSoon: 1,
  nextExpiry: null,
  ...overrides,
});

const vehicle = (id, patente, estadoOperativo) => ({
  id,
  patente,
  codigoInterno: `FLT-00${id}`,
  marca: 'Toyota',
  modelo: 'Hilux',
  ano: 2024,
  color: 'Blanco',
  vinChasis: `VIN${id}`,
  motor: null,
  kilometraje: 12000 + id,
  combustible: 'diesel',
  transmision: 'manual',
  estadoOperativo,
  sucursal: 'Casa matriz',
  responsable: `Responsable ${id}`,
  propietario: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  documentSummary: summary(),
});

const vehicles = [
  vehicle(1, 'AAAA11', 'disponible'),
  vehicle(2, 'BBBB22', 'fuera_de_servicio'),
  vehicle(3, 'CCCC33', 'dado_de_baja'),
  vehicle(4, 'DDDD44', 'en_mantencion'),
];

const row = (page, plate) =>
  page.locator('article.vehicle-reference-row').filter({ hasText: plate });

const openState = (page, plate) => row(page, plate).locator('details').evaluate((el) => el.open);
const backgroundColor = (page, plate) =>
  row(page, plate).evaluate((el) => getComputedStyle(el).backgroundColor);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = process.env.FLEET_ROWS_BASE_URL
    ? null
    : await startServer({ root: DIST, port: PORT });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });
    await context.addCookies([{ name: 'csrf_token', value: 'fleet-rows-qa', url: base }]);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      let body;
      if (pathname === '/api/auth/me') {
        body = {
          user: {
            id: 1,
            nombre: 'Verificación visual',
            username: 'qa',
            role: 'desarrollador',
            email: 'qa@example.test',
          },
        };
      } else if (pathname === '/api/fleet-vehicles') {
        body = { items: vehicles, total: vehicles.length, page: 1, pageSize: 20, totalPages: 1 };
      } else if (pathname.startsWith('/api/notifications')) {
        body = { noLeidas: 0, items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
      } else {
        body = {};
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });

    await page.goto(`${base}/vehicles?tab=flota`);
    await page.getByText('AAAA11').waitFor();

    // 1. Colores efectivos por estado operativo.
    assert.equal(await backgroundColor(page, 'AAAA11'), 'rgb(255, 255, 255)');
    assert.equal(await backgroundColor(page, 'BBBB22'), 'rgb(253, 238, 234)');
    assert.equal(await backgroundColor(page, 'CCCC33'), 'rgb(243, 245, 248)');
    assert.equal(await row(page, 'BBBB22').getAttribute('data-tone'), 'danger');
    assert.equal(await row(page, 'CCCC33').getAttribute('data-tone'), 'muted');
    assert.equal(await row(page, 'AAAA11').getAttribute('data-tone'), null);

    await page.screenshot({
      path: path.join(OUT, 'fleet-rows-default.png'),
      fullPage: true,
    });

    // 2. Acordeón: abrir BBBB22 cierra AAAA11 y deja un solo details[open].
    await page.getByLabel('Desplegar resumen de AAAA11').click();
    assert.equal(await openState(page, 'AAAA11'), true);
    await page.screenshot({
      path: path.join(OUT, 'fleet-rows-open-first.png'),
      fullPage: true,
    });

    await page.getByLabel('Desplegar resumen de BBBB22').click();
    assert.equal(await openState(page, 'AAAA11'), false);
    assert.equal(await openState(page, 'BBBB22'), true);
    assert.equal(await page.locator('article.vehicle-reference-row details[open]').count(), 1);

    // La fila abierta conserva el tinte rojo, no el azul genérico del acordeón.
    assert.equal(await backgroundColor(page, 'BBBB22'), 'rgb(251, 222, 213)');
    await page.screenshot({
      path: path.join(OUT, 'fleet-rows-open-second.png'),
      fullPage: true,
    });

    // Volver a pulsar la misma fila la cierra: no queda ninguna abierta.
    await page.getByLabel('Desplegar resumen de BBBB22').click();
    assert.equal(await page.locator('article.vehicle-reference-row details[open]').count(), 0);

    // 3. El clic en el resumen no abre la ficha ni navega.
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.match(page.url(), /tab=flota/);
    assert.deepEqual(pageErrors, []);

    const evidence = ['fleet-rows-default.png', 'fleet-rows-open-first.png', 'fleet-rows-open-second.png'];
    console.log('OK: acordeón exclusivo y tonos por estado verificados en navegador real.');
    for (const name of evidence) console.log(`  captura: ${path.join(OUT, name)}`);
  } finally {
    await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
