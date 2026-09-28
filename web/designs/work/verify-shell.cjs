/**
 * Verificación de la Fase 1 (shell Modernize).
 *
 * A diferencia de `verify-foundation.cjs`, esta comprobación necesita una
 * sesión real: la auth vive en memoria (zustand sin persist), así que no se
 * puede inyectar un token y hay que pasar por el formulario.
 *
 * Requisitos: el dev server de web en 5173 y la API en 4000.
 * Uso:  node web/designs/work/verify-shell.cjs
 * Devuelve código de salida 1 si algo falla.
 */
const fs = require('node:fs');
const path = require('node:path');

const { chromium } = require('C:/Users/UnseR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const { startServer } = require('./serve-dist.cjs');

const REPO = path.resolve(__dirname, '../../..');
const DIST = path.join(REPO, 'web', 'dist');
const OUT = __dirname;
const PORT = 4322;
// Se verifica `dist` y no el dev server: durante la migración el dev server
// siguió sirviendo un Tailwind sin los tokens `*Ink`, con lo que las clases
// quedaban como no-op y las comprobaciones pasaban sin comprobar nada.
// Requisitos: `npm run build --workspace=web` y la API en 4000.
const BASE = process.env.SHELL_BASE_URL || `http://127.0.0.1:${PORT}`;
const WIDTHS = [1440, 1024, 768, 390, 320];

/** Lee una clave de api/.env sin imprimir el valor. */
const readEnvValue = (key) => {
  const envPath = path.join(REPO, 'api', '.env');
  const line = fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : '';
};

// Devuelve un objeto con claves en camelCase a partir de nombres kebab-case,
// para no mezclar `getPropertyValue('margin-left')` con `obj.marginLeft`.
const style = (locator, properties) =>
  locator.evaluate((element, props) => {
    const computed = window.getComputedStyle(element);
    return props.reduce((acc, prop) => {
      const key = prop.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      acc[key] = computed.getPropertyValue(prop);
      return acc;
    }, {});
  }, properties);

const login = async (page) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#identifier').fill(readEnvValue('SEED_ADMIN_EMAIL'));
  await page.locator('#password').fill(readEnvValue('SEED_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: /iniciar sesi/i }).click();
  // La auth está en memoria: el shell solo existe tras autenticarse.
  await page.locator('.sidebar .nav-item').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForLoadState('networkidle').catch(() => {});
};

(async () => {
  const failures = [];
  const pageErrors = [];
  const check = (label, actual, expected) => {
    if (actual !== expected) {
      failures.push({ label, actual, expected });
    }
  };

  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('No existe web/dist. Ejecuta antes: npm run build --workspace=web');
    process.exit(1);
  }
  const server = await startServer({ root: DIST, port: PORT });

  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await login(page);

  const sidebar = page.locator('.sidebar');
  const topbar = page.locator('.topbar');
  const shellMain = page.locator('.shell-main');

  // --- Geometría del shell a 1440px -----------------------------------------
  await page.setViewportSize({ width: 1440, height: 900 });
  const sidebarStyle = await style(sidebar, ['width', 'background-color', 'border-right-width', 'z-index']);
  const topbarStyle = await style(topbar, ['height', 'margin-left', 'position', 'background-color']);
  const mainStyle = await style(shellMain, ['margin-left']);
  const brandStyle = await style(page.locator('.brand'), ['height']);
  const navItemStyle = await style(page.locator('.nav-item').first(), ['min-height', 'border-radius']);
  const activeStyle = await style(page.locator('.nav-item.active'), ['background-color', 'color', 'font-weight']);
  const footerStyle = await style(page.locator('.profile-footer'), ['min-height', 'background-color', 'border-radius']);
  const headingStyle = await style(page.locator('.nav-heading').first(), ['text-transform', 'font-size']);

  check('sidebar width', sidebarStyle.width, '270px');
  check('sidebar background', sidebarStyle.backgroundColor, 'rgb(255, 255, 255)');
  check('sidebar border', sidebarStyle.borderRightWidth, '1px');
  check('topbar height', topbarStyle.height, '70px');
  check('topbar margin-left', topbarStyle.marginLeft, '270px');
  check('topbar background', topbarStyle.backgroundColor, 'rgb(255, 255, 255)');
  check('shell-main margin-left', mainStyle.marginLeft, '270px');
  check('brand height', brandStyle.height, '70px');
  check('nav-item min-height', navItemStyle.minHeight, '45px');
  check('nav-item radius', navItemStyle.borderRadius, '7px');
  // El activo espera rgb(37, 93, 255) y NO el rgb(93, 135, 255) de la
  // referencia: blanco sobre `--primary` da 3.29:1 y no llega a 4.5:1. Se usa la
  // variante Ink. Ver el bloque de accesibilidad en src/styles/overrides.css.
  check('nav-item activo background', activeStyle.backgroundColor, 'rgb(37, 93, 255)');
  check('nav-item activo color', activeStyle.color, 'rgb(255, 255, 255)');
  check('nav-item activo weight', activeStyle.fontWeight, '600');
  check('profile-footer min-height', footerStyle.minHeight, '72px');
  check('profile-footer background', footerStyle.backgroundColor, 'rgb(232, 247, 255)');
  check('nav-heading transform', headingStyle.textTransform, 'uppercase');
  check('nav-heading size', headingStyle.fontSize, '12px');

  const navCount = await page.locator('.nav-item').count();
  const headingCount = await page.locator('.nav-heading').count();
  if (navCount !== 10) failures.push({ label: 'nav items visibles', actual: navCount, expected: 10 });

  // El botón de menú solo debe existir con la lateral colapsada. Se comprueba
  // `display` y no visibilidad porque Playwright lo daría por visible igual.
  const menuTrigger = page.locator('.menu-trigger');
  // Ojo con el paréntesis: `await f(x).display` leería `.display` sobre el
  // Promise, porque el member access tiene más precedencia que `await`.
  check('menu-trigger oculto a 1440', (await style(menuTrigger, ['display'])).display, 'none');

  // La etiqueta larga no debe empujar el badge fuera de la lateral.
  const clipped = await page.locator('.nav-item').evaluateAll((items) =>
    items
      .filter((item) => item.scrollWidth > item.clientWidth + 1)
      .map((item) => item.textContent.trim()),
  );
  if (clipped.length) {
    failures.push({ label: 'nav items sin overflow', actual: clipped, expected: 'ninguno' });
  }

  // --- Comportamiento responsive --------------------------------------------
  const overflow = {};
  const mobileState = {};
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    overflow[width] = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    if (overflow[width].scrollWidth > overflow[width].innerWidth) {
      failures.push({ label: `overflow horizontal @${width}`, actual: overflow[width].scrollWidth, expected: `<= ${overflow[width].innerWidth}` });
    }

    if (width < 1200) {
      const offCanvas = await style(sidebar, ['transform', 'margin-left']);
      const isOpen = await page.evaluate(() => document.body.classList.contains('sidebar-open'));
      mobileState[width] = { transform: offCanvas.transform, isOpen };
      if (isOpen) {
        failures.push({ label: `sidebar cerrada por defecto @${width}`, actual: true, expected: false });
      }
      if (offCanvas.marginLeft !== '0px') {
        failures.push({ label: `--sidebar colapsa a 0 @${width}`, actual: offCanvas.marginLeft, expected: '0px' });
      }
      // No se exige `inline-flex`: `.topbar` es un contenedor flex y los flex
      // items se blockifican, así que el valor computado es `flex`. Lo que
      // importa es que el botón exista cuando la lateral está colapsada.
      const triggerDisplay = (await style(page.locator('.menu-trigger'), ['display'])).display;
      if (triggerDisplay === 'none') {
        failures.push({ label: `menu-trigger visible @${width}`, actual: triggerDisplay, expected: 'distinto de none' });
      }
    } else {
      const desktop = await style(sidebar, ['transform']);
      if (desktop.transform !== 'none') {
        failures.push({ label: `sidebar visible @${width}`, actual: desktop.transform, expected: 'none' });
      }
    }

    await page.screenshot({ path: path.join(OUT, `shell-${width}.png`), fullPage: false });
  }

  // --- Cajón móvil ----------------------------------------------------------
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: /abrir navegaci/i }).click();
  await page.waitForTimeout(350);
  const opened = await page.evaluate(() => document.body.classList.contains('sidebar-open'));
  const openTransform = (await style(sidebar, ['transform'])).transform;
  if (!opened) failures.push({ label: 'cajón: body.sidebar-open', actual: false, expected: true });
  if (/matrix/.test(openTransform) && openTransform.includes('-270')) {
    failures.push({ label: 'cajón: transform aplicado', actual: openTransform, expected: 'translateX(0)' });
  }
  await page.screenshot({ path: path.join(OUT, 'shell-390-drawer.png') });

  // Navegar debe cerrar el cajón.
  await page.locator('.sidebar .nav-item').nth(1).click();
  await page.waitForTimeout(350);
  const closedAfterNav = await page.evaluate(() => document.body.classList.contains('sidebar-open'));
  if (closedAfterNav) failures.push({ label: 'cajón se cierra al navegar', actual: true, expected: false });

  // El overlay debe cerrar el cajón. El click va a x=350 porque el sidebar
  // abierto cubre los primeros 270px y se tragaría el evento.
  await page.getByRole('button', { name: /abrir navegaci/i }).click();
  await page.waitForTimeout(350);
  await page.locator('.scrim').click({ position: { x: 350, y: 500 } });
  await page.waitForTimeout(350);
  const closedByScrim = await page.evaluate(() => document.body.classList.contains('sidebar-open'));
  if (closedByScrim) failures.push({ label: 'overlay cierra el cajón', actual: true, expected: false });

  // --- Popovers de la barra superior ----------------------------------------
  // El panel de la campanita y el menu de usuario comparten la superficie del
  // diseno (borde, radio, sombra) y se diferencian en el padding. Se fija el
  // viewport porque el bucle responsive anterior lo dejo en 320px.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(250);

  await page.getByRole('button', { name: /notificaciones/i }).click();
  const notifPanel = page.locator('.popover-notifications');
  await notifPanel.waitFor({ state: 'visible', timeout: 10000 });
  const notifStyle = await style(notifPanel, ['width', 'padding-top', 'border-radius', 'background-color', 'border-top-width']);
  check('panel notificaciones width', notifStyle.width, '352px');
  check('panel notificaciones padding', notifStyle.paddingTop, '0px');
  check('panel notificaciones radius', notifStyle.borderRadius, '8px');
  check('panel notificaciones fondo', notifStyle.backgroundColor, 'rgb(255, 255, 255)');
  check('panel notificaciones borde', notifStyle.borderTopWidth, '1px');
  await page.screenshot({ path: path.join(OUT, 'shell-1440-notificaciones.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  await page.getByRole('button', { name: 'Menú de usuario' }).click();
  const userMenu = page.locator('.popover-menu');
  await userMenu.waitFor({ state: 'visible', timeout: 10000 });
  const userMenuStyle = await style(userMenu, ['padding-top', 'padding-left', 'border-radius', 'background-color', 'z-index']);
  check('menu usuario padding-top', userMenuStyle.paddingTop, '8px');
  check('menu usuario padding-left', userMenuStyle.paddingLeft, '0px');
  check('menu usuario radius', userMenuStyle.borderRadius, '8px');
  check('menu usuario fondo', userMenuStyle.backgroundColor, 'rgb(255, 255, 255)');
  check('menu usuario z-index', userMenuStyle.zIndex, '50');
  // El menu entra con un spring de motion: sin esta espera la captura sale a
  // medio fundido y no sirve para revisar el diseno.
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, 'shell-1440-menu-usuario.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  // A 390px el panel tiene que conservar su ancho. Sin la variante al final del
  // archivo, el `width:min(300px,...)` de `.popover` en el bloque de la
  // referencia lo dejaba en 300px y se comia 52px de la lista.
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: /notificaciones/i }).click();
  const notifMobile = page.locator('.popover-notifications');
  await notifMobile.waitFor({ state: 'visible', timeout: 10000 });
  check('panel notificaciones width @390', (await style(notifMobile, ['width'])).width, '352px');
  await page.screenshot({ path: path.join(OUT, 'shell-390-notificaciones.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  await browser.close();
  server.close();

  const report = {
    shell: { sidebarStyle, topbarStyle, mainStyle, brandStyle, navItemStyle, activeStyle, footerStyle, headingStyle },
    navCount,
    headingCount,
    overflow,
    mobileState,
    pageErrors,
    failures,
    ok: failures.length === 0 && pageErrors.length === 0,
  };

  fs.writeFileSync(path.join(OUT, 'shell-verification.json'), `${JSON.stringify(report, null, 2)}\n`);

  if (pageErrors.length) {
    console.log('Errores de página:', pageErrors);
  }
  if (failures.length) {
    console.log('Fallos:');
    for (const failure of failures) {
      console.log(`  - ${failure.label}: ${JSON.stringify(failure.actual)} (esperado ${JSON.stringify(failure.expected)})`);
    }
  }
  console.log(`nav items: ${navCount}, grupos: ${headingCount}`);
  console.log(report.ok ? '\nOK: el shell coincide con el diseño.' : '\nFALLA: el shell no coincide.');
  process.exit(report.ok ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
