/**
 * Verificación del Dashboard migrado a Modernize.
 *
 * Aplica las mismas reglas que `verify-shell.cjs` (sesión real, la auth vive en
 * memoria) y se concentra en las primitivas del diseño que este archivo usa:
 * `.page-banner`, `.stats`/`.stat`, `.view-panel` y `.data-table`.
 *
 * Requisitos: dev server de web en 5173 y API en 4000.
 * Uso:  node web/designs/work/verify-dashboard.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const { chromium } = require('C:/Users/UnseR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const { startServer } = require('./serve-dist.cjs');

const REPO = path.resolve(__dirname, '../../..');
const DIST = path.join(REPO, 'web', 'dist');
const OUT = __dirname;
const PORT = 4323;
// Se verifica `dist` y no el dev server, por el mismo motivo que en
// verify-shell.cjs: el dev server no recarga `tailwind.config.ts` y dejaba los
// tokens `*Ink` como clases inexistentes.
const BASE = process.env.SHELL_BASE_URL || `http://127.0.0.1:${PORT}`;
const WIDTHS = [1440, 1024, 768, 390, 320];

const readEnvValue = (key) => {
  const line = fs
    .readFileSync(path.join(REPO, 'api', '.env'), 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : '';
};

// Claves en camelCase a partir de nombres kebab-case, para no mezclar
// `getPropertyValue('margin-left')` con `obj.marginLeft`.
const style = (locator, properties) =>
  locator.evaluate((element, props) => {
    const computed = window.getComputedStyle(element);
    return props.reduce((acc, prop) => {
      const key = prop.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      acc[key] = computed.getPropertyValue(prop);
      return acc;
    }, {});
  }, properties);

(async () => {
  const failures = [];
  const pageErrors = [];
  const check = (label, actual, expected) => {
    if (actual !== expected) failures.push({ label, actual, expected });
  };

  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('No existe web/dist. Ejecuta antes: npm run build --workspace=web');
    process.exit(1);
  }
  const server = await startServer({ root: DIST, port: PORT });

  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#identifier').fill(readEnvValue('SEED_ADMIN_EMAIL'));
  await page.locator('#password').fill(readEnvValue('SEED_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: /iniciar sesi/i }).click();
  await page.locator('.sidebar .nav-item').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  // Los KPI solo aparecen cuando el resumen carga.
  await page.locator('.stat').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(600);

  // --- Encabezado ------------------------------------------------------------
  const banner = page.locator('.page-banner');
  const bannerStyle = await style(banner, ['height', 'background-color', 'border-radius']);
  check('banner height', bannerStyle.height, '115px');
  check('banner fondo', bannerStyle.backgroundColor, 'rgb(236, 242, 255)');
  check('banner radio', bannerStyle.borderRadius, '12px');

  // --- Tarjetas KPI ---------------------------------------------------------
  // Seis columnas como en la referencia, una por tinte.
  const stats = page.locator('.stats > .stat');
  const statCount = await stats.count();
  if (statCount !== 6) failures.push({ label: 'cantidad de KPI', actual: statCount, expected: 6 });

  const firstStat = await style(stats.first(), ['border-radius', 'background-color', 'min-height']);
  check('stat radio', firstStat.borderRadius, '7px');
  check('stat fondo (tinte base)', firstStat.backgroundColor, 'rgb(236, 242, 255)');
  check('stat min-height', firstStat.minHeight, '161px');

  // Cada tinte debe pintar su fondo tenue del diseño.
  const tints = {
    gold: 'rgb(254, 245, 229)',
    green: 'rgb(230, 255, 250)',
    sky: 'rgb(232, 247, 255)',
    coral: 'rgb(253, 237, 232)',
    blue: 'rgb(234, 243, 254)',
  };
  const seenTints = {};
  for (const [name, expectedColor] of Object.entries(tints)) {
    const tinted = page.locator(`.stats > .stat.${name}`).first();
    if ((await tinted.count()) === 0) {
      failures.push({ label: `falta tinte ${name}`, actual: 0, expected: 1 });
      continue;
    }
    const color = (await style(tinted, ['background-color'])).backgroundColor;
    seenTints[name] = color;
    check(`tinte ${name}`, color, expectedColor);
  }

  // El icono debe medir 50px como en la referencia y heredar el color del tinte.
  const iconBox = await page.locator('.stat svg').first().boundingBox();
  if (!iconBox || Math.round(iconBox.width) !== 50 || Math.round(iconBox.height) !== 50) {
    failures.push({ label: 'icono KPI 50x50', actual: iconBox && `${Math.round(iconBox.width)}x${Math.round(iconBox.height)}`, expected: '50x50' });
  }
  const iconColor = await page.locator('.stats > .stat.gold svg').first().evaluate((el) => window.getComputedStyle(el).color);
  check('icono hereda color del tinte', iconColor, 'rgb(255, 152, 0)');

  const labelStyle = await style(page.locator('.stat-label').first(), ['font-size', 'font-weight', 'color']);
  check('stat-label font-size', labelStyle.fontSize, '14px');
  check('stat-label font-weight', labelStyle.fontWeight, '600');
  const valueStyle = await style(page.locator('.stat-value').first(), ['font-size', 'font-weight', 'color']);
  check('stat-value font-size', valueStyle.fontSize, '21px');
  check('stat-value font-weight', valueStyle.fontWeight, '600');
  // El numero y la etiqueta van en tinta/muted para cumplir WCAG AA; el icono
  // es el que conserva el color del tinte. Ver el comentario de `.stat-value`
  // en shell.css para los ratios medidos.
  check('stat-value color', valueStyle.color, 'rgb(42, 53, 71)');
  check('stat-label color', labelStyle.color, 'rgb(90, 106, 133)');

  // Ninguna tarjeta puede desbordar su propia caja.
  const overflowingStats = await stats.evaluateAll((nodes) =>
    nodes.filter((node) => node.scrollHeight > node.clientHeight + 1).map((node) => node.textContent.trim().slice(0, 40)),
  );
  if (overflowingStats.length) {
    failures.push({ label: 'KPI sin desbordamiento vertical', actual: overflowingStats, expected: 'ninguno' });
  }

  // --- Paneles y tabla ------------------------------------------------------
  const panelCount = await page.locator('.view-panel').count();
  if (panelCount < 3) failures.push({ label: 'view-panel presentes', actual: panelCount, expected: '>= 3' });
  const panelStyle = await style(page.locator('.view-panel').first(), ['border-radius', 'border-top-width', 'background-color']);
  check('view-panel radio', panelStyle.borderRadius, '8px');
  check('view-panel borde', panelStyle.borderTopWidth, '1px');
  check('view-panel fondo', panelStyle.backgroundColor, 'rgb(255, 255, 255)');

  const tableStyle = await style(page.locator('.data-table').first(), ['border-collapse']);
  check('data-table collapse', tableStyle.borderCollapse, 'separate');
  const cellStyle = await style(page.locator('.data-table th').first(), ['padding-top', 'font-weight']);
  check('data-table th padding', cellStyle.paddingTop, '16px');
  check('data-table th peso', cellStyle.fontWeight, '600');

  // Los codigos de OT y COT no pueden partirse a mitad: con la columna fija de
  // 98px de la referencia, "OT-2026-0003" se partia en dos lineas.
  const wrapped = await page.locator('.data-table td').evaluateAll((cells) =>
    cells
      .filter((cell) => cell.getClientRects().length > 1 && cell.textContent.trim().length > 0)
      .map((cell) => cell.textContent.trim()),
  );
  if (wrapped.length) {
    failures.push({ label: 'celdas sin salto de linea', actual: wrapped, expected: 'ninguna' });
  }

  // Acciones rápidas: dos primarias y una secundaria.
  const primaryButtons = await page.locator('a.primary-button').count();
  if (primaryButtons < 2) failures.push({ label: 'botones primarios', actual: primaryButtons, expected: '>= 2' });
  const primaryStyle = await style(page.locator('a.primary-button').first(), ['background-color', 'border-radius', 'color']);
  check('primary-button fondo', primaryStyle.backgroundColor, 'rgb(37, 93, 255)');
  check('primary-button radio', primaryStyle.borderRadius, '7px');
  check('primary-button texto', primaryStyle.color, 'rgb(255, 255, 255)');
  const secondaryStyle = await style(page.locator('button.secondary-button').first(), ['border-top-width', 'border-radius']);
  check('secondary-button borde', secondaryStyle.borderTopWidth, '1px');
  check('secondary-button radio', secondaryStyle.borderRadius, '6px');

  // En escritorio la tabla debe entrar completa: si necesita scroll horizontal
  // a 1440 lo que se ve es una columna cortada, no una tabla desplazable.
  const desktopScroll = await page.locator('.data-scroll').first().evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
  }));
  if (desktopScroll.scrollWidth > desktopScroll.clientWidth + 1) {
    failures.push({ label: 'tabla sin scroll horizontal @1440', actual: desktopScroll.scrollWidth, expected: `<= ${desktopScroll.clientWidth}` });
  }

  await page.screenshot({ path: path.join(OUT, 'dashboard-1440.png'), fullPage: true });

  // La captura de pantalla completa no siempre abarca la pagina entera cuando
  // el documento no hace scroll propio, asi que la parte baja (tabla y panel de
  // alertas) se captura aparte, que es donde vive el sistema de tablas.
  await page.locator('.data-table').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'dashboard-1440-tabla.png') });

  // --- Responsive ------------------------------------------------------------
  const overflow = {};
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 1000 });
    // La captura de la tabla dejo la pagina scrolleada; sin volver arriba los
    // artefactos responsive salen cortados por la mitad.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(350);
    overflow[width] = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    if (overflow[width].scrollWidth > overflow[width].innerWidth) {
      failures.push({ label: `overflow horizontal @${width}`, actual: overflow[width].scrollWidth, expected: `<= ${overflow[width].innerWidth}` });
    }
    // La tabla debe tener su propio scroll, no empujar la pagina.
    const scroller = await page.locator('.data-scroll').first().evaluate((node) => ({
      overflowX: window.getComputedStyle(node).overflowX,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }));
    if (width < 1200 && scroller.overflowX !== 'auto') {
      failures.push({ label: `data-scroll con scroll propio @${width}`, actual: scroller.overflowX, expected: 'auto' });
    }
    await page.screenshot({ path: path.join(OUT, `dashboard-${width}.png`), fullPage: false });
  }

  await browser.close();
  server.close();

  const report = {
    bannerStyle,
    firstStat,
    seenTints,
    statCount,
    labelStyle,
    valueStyle,
    panelStyle,
    tableStyle,
    cellStyle,
    primaryStyle,
    secondaryStyle,
    overflow,
    pageErrors,
    failures,
    ok: failures.length === 0 && pageErrors.length === 0,
  };

  fs.writeFileSync(path.join(OUT, 'dashboard-verification.json'), `${JSON.stringify(report, null, 2)}\n`);

  if (pageErrors.length) console.log('Errores de página:', pageErrors);
  if (failures.length) {
    console.log('Fallos:');
    for (const failure of failures) {
      console.log(`  - ${failure.label}: ${JSON.stringify(failure.actual)} (esperado ${JSON.stringify(failure.expected)})`);
    }
  }
  console.log(`KPI: ${statCount}, view-panels: ${panelCount}`);
  console.log(report.ok ? '\nOK: el dashboard coincide con el diseño.' : '\nFALLA: el dashboard no coincide.');
  process.exit(report.ok ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
