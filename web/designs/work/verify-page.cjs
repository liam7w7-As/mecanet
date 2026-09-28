/**
 * Auditor de páginas migradas.
 *
 * Recorre una o más rutas y comprueba tres cosas que a ojo no se detectan:
 *
 *  1. Contraste WCAG AA de todo texto visible. El diseño Modernize usa acentos
 *     claros sobre pastel y varios de ellos no llegaban al mínimo, así que esto
 *     se automatiza en vez de confiar en la revisión visual.
 *  2. Que no queden clases legacy (`slate-*`, `brand-blue`, `brand-yellow`,
 *     `brand-dark`, `brand-light`) en el DOM de la página.
 *  3. Que no haya desbordamiento horizontal en cinco anchos.
 *
 * Requisitos: dev server de web en 5173 y API en 4000.
 * Uso:  node web/designs/work/verify-page.cjs /clients [/quotations ...]
 */
const fs = require('node:fs');
const path = require('node:path');

const { chromium } = require('C:/Users/UnseR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const { startServer } = require('./serve-dist.cjs');

const REPO = path.resolve(__dirname, '../../..');
const DIST = path.join(REPO, 'web', 'dist');
const OUT = __dirname;
const PORT = 4321;
// Se sirve `dist` y no el dev server: durante esta migracion el dev server
// siguio sirviendo un Tailwind sin los tokens `*Ink` y las clases quedaban como
// no-op, lo que hacia pasar verificaciones que en realidad no se cumplian.
// Requisitos: `npm run build --workspace=web` y la API en 4000.
const BASE = process.env.PAGE_BASE_URL || `http://127.0.0.1:${PORT}`;
const WIDTHS = [1440, 1024, 768, 390, 320];
const LEGACY = /\b(slate|emerald|amber|violet|indigo|yellow|red|green|blue)-\d{2,3}\b|\bbrand-(blue|yellow|dark|light)\b/;

/**
 * Se inyecta en la página. Devuelve los nodos de texto que no cumplen el
 * mínimo de contraste, saltando los que el diseño declara decorativos.
 *
 * El fondo efectivo se resuelve subiendo por el árbol: `background-color` es
 * transparente en la mayoría de los contenedores, así que comparar solo contra
 * el fondo propio daría falsos positivos en cada celda.
 */
const auditContrast = () => {
  const parseColor = (value) => {
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const luminance = ({ r, g, b }) => {
    const channel = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  /**
   * Fondo efectivo de un nodo. Sube por el árbol y, en cada nivel, mira tambien
   * a los hermanos anteriores SOLO si son overlays posicionados: hay fondos
   * pintados como siblings (el indicador animado de las tabs, un `motion.span`
   * con `position:absolute`) que no son ancestros y que si se ven detras del
   * texto.
   *
   * La restriccion a `absolute`/`fixed` es necesaria: sin ella, cualquier
   * boton anterior de una fila flex se tomaria como fondo y el texto del
   * siguiente se mediria sobre indigo, produciendo falsos positivos.
   */
  const effectiveBackground = (node) => {
    const overlayBehind = (element) => {
      let sibling = element.previousElementSibling;
      while (sibling) {
        const style = window.getComputedStyle(sibling);
        const color = parseColor(style.backgroundColor);
        const isOverlay = style.position === 'absolute' || style.position === 'fixed';
        if (isOverlay && color && color.a >= 0.9) return color;
        sibling = sibling.previousElementSibling;
      }
      return null;
    };

    const stack = [];
    let current = node;
    while (current && current !== document.documentElement.parentNode) {
      const color = parseColor(window.getComputedStyle(current).backgroundColor);
      if (color && color.a > 0) {
        stack.push(color);
        if (color.a === 1) break;
      }
      const overlay = overlayBehind(current);
      if (overlay) {
        stack.push(overlay);
        break;
      }
      current = current.parentElement;
    }
    let result = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i -= 1) result = over(stack[i], result);
    return result;
  };

  const failures = [];
  const seen = new Set();

  for (const element of document.querySelectorAll('body *')) {
    // Solo elementos con texto propio: los contenedores no se miden.
    const text = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent.trim())
      .join(' ')
      .trim();
    if (!text) continue;

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const style = window.getComputedStyle(element);
    if (style.visibility === 'hidden' || style.opacity === '0') continue;

    const foreground = parseColor(style.color);
    if (!foreground) continue;
    const background = effectiveBackground(element);
    const composited = foreground.a < 1 ? over(foreground, background) : foreground;

    const lighter = Math.max(luminance(composited), luminance(background));
    const darker = Math.min(luminance(composited), luminance(background));
    const ratio = (lighter + 0.05) / (darker + 0.05);

    const size = parseFloat(style.fontSize);
    const weight = Number(style.fontWeight) || 400;
    // Texto grande segun WCAG: 18.66px+ en negrita, o 24px+.
    const isLarge = size >= 24 || (size >= 18.66 && weight >= 700);
    const required = isLarge ? 3 : 4.5;

    if (ratio < required) {
      const key = `${element.className}|${text.slice(0, 30)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      failures.push({
        text: text.slice(0, 48),
        className: String(element.className).slice(0, 90),
        fontSize: `${size}px/${weight}`,
        ratio: Number(ratio.toFixed(2)),
        required,
        color: style.color,
      });
    }
  }

  return failures;
};

const readEnvValue = (key) => {
  const line = fs
    .readFileSync(path.join(REPO, 'api', '.env'), 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : '';
};

(async () => {
  const routes = process.argv.slice(2);
  if (routes.length === 0) {
    console.error('Uso: node verify-page.cjs /ruta [/otra ...]');
    process.exit(1);
  }

  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error(`No existe web/dist. Ejecuta antes: npm run build --workspace=web`);
    process.exit(1);
  }
  const server = await startServer({ root: DIST, port: PORT });

  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const pageErrors = [];

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#identifier').fill(readEnvValue('SEED_ADMIN_EMAIL'));
  await page.locator('#password').fill(readEnvValue('SEED_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: /iniciar sesi/i }).click();
  await page.locator('.sidebar .nav-item').first().waitFor({ state: 'visible', timeout: 20000 });

  const report = {};

  for (const route of routes) {
    const slug = route.replace(/[^\w-]/g, '') || 'root';
    const entry = { contrast: [], legacy: [], overflow: {}, pageErrors: [] };
    page.removeAllListeners('pageerror');
    page.on('pageerror', (error) => entry.pageErrors.push(String(error)));

    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(700);

    entry.contrast = await page.evaluate(auditContrast);

    entry.legacy = await page.evaluate((pattern) => {
      const re = new RegExp(pattern);
      const found = new Set();
      for (const element of document.querySelectorAll('body *')) {
        for (const token of String(element.className).split(/\s+/)) {
          if (token && re.test(token)) found.add(token);
        }
      }
      return [...found].sort();
    }, LEGACY.source);

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      const measured = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      entry.overflow[width] = measured;
      if (measured.scrollWidth > measured.innerWidth) {
        entry.legacy.push(`overflow horizontal @${width}: ${measured.scrollWidth} > ${measured.innerWidth}`);
      }
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `page-${slug}-1440.png`), fullPage: true });

    report[route] = entry;

    console.log(`\n=== ${route} ===`);
    if (entry.legacy.length === 0) {
      console.log('  clases legacy: ninguna');
    } else {
      console.log(`  clases legacy (${entry.legacy.length}): ${entry.legacy.join(', ')}`);
    }
    if (entry.contrast.length === 0) {
      console.log('  contraste: todo cumple AA');
    } else {
      console.log(`  contraste: ${entry.contrast.length} textos por debajo de AA`);
      for (const item of entry.contrast.slice(0, 12)) {
        console.log(`    ${item.ratio}:1 (exige ${item.required}) ${item.fontSize} "${item.text}"`);
        console.log(`       ${item.className}`);
      }
      if (entry.contrast.length > 12) console.log(`    ... y ${entry.contrast.length - 12} mas`);
    }
    if (entry.pageErrors.length) console.log(`  errores de pagina: ${entry.pageErrors.join(' | ')}`);
  }

  await browser.close();
  server.close();

  const totalContrast = Object.values(report).reduce((acc, e) => acc + e.contrast.length, 0);
  const totalLegacy = Object.values(report).reduce((acc, e) => acc + e.legacy.length, 0);
  fs.writeFileSync(path.join(OUT, 'pages-verification.json'), `${JSON.stringify(report, null, 2)}\n`);

  console.log(`\nTotal: ${totalContrast} textos con contraste bajo, ${totalLegacy} clases legacy.`);
  process.exit(totalContrast + totalLegacy === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
