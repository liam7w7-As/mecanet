const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { chromium, webkit } = require('./playwright.cjs');

const origin = process.env.MOBILE_TEST_URL || 'http://127.0.0.1:5173';
const output = path.join(os.tmpdir(), 'unithor-mobile-viewport');
const name = 'Empresa de Servicios e Inversiones con Nombre Comercial Extenso SpA';
const user = {
  id: 1,
  nombre: 'Administrador de Pruebas',
  email: 'test@example.com',
  role: 'admin',
};
const client = {
  id: 1,
  nombre: name,
  rut: '773747881',
  tipo: 'empresa',
  telefono: '+56912345678',
  email: 'cliente@example.com',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
const vehicle = {
  id: 1,
  patente: 'TEST12',
  marca: 'Toyota',
  modelo: 'Modelo con nombre extenso',
  clientId: 1,
  client,
  ano: 2025,
  kilometraje: 123456,
};
const order = {
  id: 1,
  codigo: 'OT-26-1234',
  clientId: 1,
  vehicleId: 1,
  createdBy: 1,
  estado: 'en_progreso',
  tipoIngreso: 'normal',
  kilometrajeIngreso: null,
  fechaEntrega: null,
  fechaIngreso: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  client,
  vehicle,
  creator: user,
  items: [],
  inspection: null,
  events: [],
  progressReports: [],
  requests: [],
};
const quotation = {
  id: 1,
  codigo: 'COT-26-1234',
  clientId: 1,
  vehicleId: 1,
  asesorId: 1,
  estadoPago: 'por_pagar',
  total: 123456789,
  subtotal: 123456789,
  pagado: 0,
  saldoPendiente: 123456789,
  client,
  vehicle,
  workOrderId: null,
  items: [],
  createdAt: new Date().toISOString(),
};
const list = (items) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  totalPages: items.length ? 1 : 0,
});
const summary = {
  metrics: {
    activeWorkOrders: 12,
    waitingForParts: 2,
    pendingQuotations: 8,
    pendingBalance: 123456789,
    monthlyRevenue: 987654321,
    quotationsWithoutWorkOrder: 3,
  },
  recentWorkOrders: [order],
  lowStockCount: 0,
  lowStockItems: [],
  unlinkedQuotations: [quotation],
  operationalInbox: {
    role: 'admin',
    total: 0,
    counts: {
      approvals: 0,
      warehouseDeliveries: 0,
      assignedWorkOrders: 0,
      paymentVerifications: 0,
      quotationFollowUps: 0,
      stockAlerts: 0,
    },
    items: [],
  },
};

const mockApi = async (route) => {
  const pathname = new URL(route.request().url()).pathname.replace(/^\/api/, '');
  let data = list([]);
  if (pathname === '/auth/me') data = { user };
  else if (pathname === '/settings/branding')
    data = { nombreComercial: 'UNITHOR', tieneLogo: false };
  else if (pathname === '/dashboard/summary') data = summary;
  else if (pathname === '/notifications') data = { ...list([]), noLeidas: 0 };
  else if (pathname === '/notifications/unread-count') data = { noLeidas: 0 };
  else if (pathname === '/work-orders') data = list([order]);
  else if (pathname === '/work-orders/1') data = { workOrder: order };
  else if (pathname === '/work-orders/mechanics') data = { mechanics: [] };
  else if (pathname === '/quotations') data = list([quotation]);
  else if (pathname === '/quotations/1') data = { quotation };
  else if (pathname === '/clients') data = list([client]);
  else if (pathname === '/clients/1') data = { client: { ...client, vehicles: [vehicle] } };
  else if (pathname === '/vehicles') data = list([vehicle]);
  else if (pathname === '/vehicles/1') data = { vehicle };
  else if (pathname === '/users') data = list([user]);
  else if (pathname === '/roles') data = { roles: [] };
  else if (pathname === '/warehouses') data = { items: [], total: 0 };
  else if (pathname === '/search/quick') data = { clients: [], vehicles: [] };
  await route.fulfill({ json: data });
};

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const results = [];
  const useWebkit = fs.existsSync(webkit.executablePath());
  const browser = await (useWebkit ? webkit : chromium).launch({
    headless: true,
    ...(useWebkit ? {} : { channel: 'msedge' }),
  });
  try {
    for (const [width, height] of [
      [320, 740],
      [393, 852],
      [402, 874],
      [430, 932],
      [852, 393],
      [768, 1024],
      [1440, 900],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        isMobile: width < 900,
        hasTouch: width < 900,
        reducedMotion: 'reduce',
      });
      await context.addCookies([{ name: 'csrf_token', value: 'viewport-test-only', url: origin }]);
      await context.route('**/api/**', mockApi);
      const page = await context.newPage();
      page.on('pageerror', (error) => console.error('Page error:', error.message));
      for (const target of [
        '/dashboard',
        '/quotations',
        '/work-orders',
        '/clients',
        '/vehicles',
        '/catalog',
        '/reports?section=commercial',
        '/work-orders/new',
        '/quotations/new',
        '/work-orders/1',
      ]) {
        console.log(`Checking ${width}x${height} ${target}`);
        await page.goto(`${origin}${target}`, { waitUntil: 'networkidle' });
        await page.locator('.shell-main').waitFor({ state: 'visible' });
        await page.evaluate(() => document.fonts.ready);
        const geometry = await page.evaluate(() => {
          const viewport = document.documentElement.clientWidth;
          const main = document.querySelector('.shell-main');
          return {
            viewport,
            documentWidth: document.documentElement.scrollWidth,
            mainWidth: main?.getBoundingClientRect().width,
            smallInputs: [
              ...document.querySelectorAll(
                'input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]), select, textarea',
              ),
            ]
              .filter(
                (element) =>
                  element.getBoundingClientRect().width > 0 &&
                  parseFloat(getComputedStyle(element).fontSize) < 16,
              )
              .map((element) => ({
                tag: element.tagName,
                fontSize: getComputedStyle(element).fontSize,
              })),
            offenders: [...document.querySelectorAll('main *, .topbar *, .tabbar *')]
              .filter((element) => {
                const rect = element.getBoundingClientRect();
                if (rect.width < 1 || rect.left >= viewport || rect.right <= 0) return false;
                let parent = element.parentElement;
                while (parent && parent !== document.body) {
                  const style = getComputedStyle(parent);
                  if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX)) return false;
                  parent = parent.parentElement;
                }
                return rect.right > viewport + 1 || rect.left < -1;
              })
              .slice(0, 6)
              .map((element) => ({
                tag: element.tagName,
                class: element.className,
                text: element.textContent?.slice(0, 70),
              })),
          };
        });
        results.push({ width, height, target, ...geometry });
        if (width === 393 && ['/dashboard', '/quotations', '/work-orders'].includes(target))
          await page.screenshot({
            path: path.join(output, `${target.slice(1)}-${width}.png`),
            fullPage: true,
          });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const failed = results.filter(
    (result) =>
      result.documentWidth > result.viewport + 1 ||
      result.mainWidth > result.viewport + 1 ||
      result.offenders.length ||
      (result.width < 900 && result.smallInputs.length),
  );
  fs.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify({ engine: useWebkit ? 'webkit' : 'chromium', results }, null, 2),
  );
  console.log(JSON.stringify({ output, checked: results.length, failed }, null, 2));
  if (failed.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
