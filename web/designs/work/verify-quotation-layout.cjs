const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('./playwright.cjs');

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const output = path.join(os.tmpdir(), 'unithor-quotation-layout-qa');
  fs.mkdirSync(output, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(15000);
    await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
    await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
    await page.context().addCookies([{ name: 'csrf_token', value: 'quotation-layout-qa', url: 'http://localhost:5173' }]);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const client = { id: 7, nombre: 'Cliente Repuestos y Servicios Integrales de Transporte Limitada', rut: '123456785', tipo: 'cliente', vehiclesCount: 1 };
    const vehicle = { id: 4, patente: 'ABCD12', marca: 'Toyota', modelo: 'Corolla', ano: 2020, client };
    const quotation = { id: 31, codigo: 'COT-26-31', clientId: 7, client, vehicleId: null, vehicle: null,
      workOrderId: null, workOrder: null, estadoPago: 'por_pagar', total: 5000, subtotal: 5000, pagado: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const items = [quotation, { ...quotation, id: 32, codigo: 'COT-26-32', vehicle, vehicleId: 4,
      workOrderId: 12, workOrder: { id: 12, codigo: 'OT-26-12', estado: 'borrador' } }];
    const mutations = [];
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      let body = {};
      if (url.pathname === '/api/auth/me') body = { user: { id: 1, nombre: 'Prueba visual', email: 'qa@example.test', role: 'desarrollador' } };
      else if (url.pathname === '/api/search/quick') body = { clients: [client], vehicles: [vehicle] };
      else if (url.pathname === '/api/catalog') body = { items: [{ id: 9, tipo: 'parte', codigo: 'FIL-01', nombre: 'Filtro de aceite', stock: 10, precio: 5000, unidadMedida: 'unidad' }], page: 1, pageSize: 12, total: 1, totalPages: 1 };
      else if (url.pathname === '/api/quotations' && request.method() === 'POST') {
        mutations.push(request.postDataJSON());
        body = { quotation };
      } else if (url.pathname === '/api/quotations') body = { items, total: 2, totalPages: 1, page: 1, pageSize: 20 };
      else if (url.pathname.startsWith('/api/notifications')) body = { noLeidas: 0, items: [] };
      else if (url.pathname.startsWith('/api/work-orders')) throw new Error('Unexpected work-order request');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    for (const width of [1440, 1280, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('http://localhost:5173/quotations', { waitUntil: 'domcontentloaded' });
      await page.getByRole('link', { name: 'OT-26-12', exact: true }).waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('tbody tr')].length === 2
        && [...document.querySelectorAll('tbody tr')].every((row) => Number(getComputedStyle(row).opacity) >= 0.99));
      assert.equal(await page.getByRole('columnheader', { includeHidden: true }).count(), 9);
      const codeCell = page.getByRole('link', { name: 'COT-26-32', exact: true }).locator('..');
      assert.equal(await codeCell.getByRole('link', { name: 'OT-26-12' }).count(), 1);
      assert.equal(await page.getByText('ABCD12', { exact: true }).locator('..').getByText(client.rut).count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.locator('table').evaluate((table) => table.scrollWidth > table.clientWidth), false);
      await page.screenshot({ path: path.join(output, `list-${width}.png`), fullPage: true });
      await page.goto('http://localhost:5173/quotations/new', { waitUntil: 'domcontentloaded' });
      await page.getByRole('combobox', { name: 'Buscar cliente', exact: true }).waitFor();
      assert.equal(await page.getByText('Origen de la cotización').count(), 0);
      assert.equal(await page.getByRole('combobox', { name: 'Buscar vehículo', exact: true }).count(), 0);
      await page.getByRole('combobox', { name: 'Buscar cliente' }).fill('Cliente');
      await page.getByRole('button', { name: /Cliente Repuestos/ }).click();
      await page.getByRole('button', { name: 'Repuestos', exact: true }).click();
      await page.getByRole('button', { name: 'Agregar Filtro de aceite', exact: true }).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(output, `create-${width}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(mutations, []);
    console.log(`Quotation layout verified at 1440, 1280, 1024, 768 and 390px. Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
