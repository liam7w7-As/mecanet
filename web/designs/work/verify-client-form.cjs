const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('./playwright.cjs');

const base = process.env.CLIENT_FORM_BASE_URL || 'http://localhost:5173';
const output = path.join(os.tmpdir(), 'unithor-client-form-qa');

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });
    await context.addCookies([{ name: 'csrf_token', value: 'client-form-qa', url: base }]);
    const page = await context.newPage();
    const errors = [];
    const submissions = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      let body;
      if (pathname === '/api/auth/me') {
        body = {
          user: { id: 1, nombre: 'Prueba visual', role: 'desarrollador', email: 'qa@example.test' },
        };
      } else if (pathname === '/api/clients' && request.method() === 'POST') {
        const data = request.postDataJSON();
        submissions.push(data);
        body = { client: { ...data, id: 999, createdAt: '', updatedAt: '' } };
      } else if (pathname === '/api/clients') {
        body = { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
      } else if (pathname.startsWith('/api/notifications')) {
        body = { noLeidas: 0, items: [] };
      } else {
        body = {};
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });
    await page.goto(`${base}/clients`);
    await page.getByRole('button', { name: 'Nuevo cliente', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo cliente' });
    const rut = dialog.getByRole('textbox', { name: 'RUN / RUT' });
    await dialog.getByRole('textbox', { name: 'Nombre completo' }).fill('Ana Perez');
    await rut.pressSequentially('123456785');
    assert.equal(await rut.inputValue(), '12.345.678-5');
    await rut.press('Home');
    await rut.press('ArrowRight');
    await rut.press('ArrowRight');
    await rut.press('ArrowRight');
    await rut.press('Backspace');
    assert.equal(await rut.inputValue(), '1.345.678-5');
    await rut.fill('6000000k');
    assert.equal(await rut.inputValue(), '6.000.000-K');
    await rut.fill('123456789');
    await dialog.getByRole('button', { name: 'Crear cliente' }).click();
    assert.equal(await rut.getAttribute('aria-invalid'), 'true');
    assert.equal(submissions.length, 0);
    await rut.fill('123456785');
    await dialog.getByRole('textbox', { name: 'Teléfono' }).fill('55 234 5678');
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector('[role="dialog"]')).opacity === '1',
    );

    const viewports = [
      { width: 1440, height: 900 },
      { width: 768, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ];
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.screenshot({ path: path.join(output, `client-${viewport.width}.png`) });
      const geometry = await dialog.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const button = element.querySelector('button[type="submit"]').getBoundingClientRect();
        return {
          horizontalOverflow: element.scrollWidth > element.clientWidth,
          inViewport:
            box.x >= 0 && box.right <= innerWidth && box.y >= 0 && box.bottom <= innerHeight,
          submitVisible: button.y >= 0 && button.bottom <= innerHeight,
        };
      });
      assert.equal(geometry.horizontalOverflow, false, `${viewport.width}: horizontal overflow`);
      assert.equal(geometry.inViewport, true, `${viewport.width}: dialog outside viewport`);
      assert.equal(geometry.submitVisible, true, `${viewport.width}: submit outside viewport`);
      console.log(JSON.stringify({ width: viewport.width, ...geometry }));
    }
    await dialog.getByRole('button', { name: 'Dirección y notas' }).click();
    const commune = dialog.getByRole('combobox', { name: 'Comuna' });
    await commune.fill('antofagasta');
    await page
      .getByRole('option', { name: 'Antofagasta Región de Antofagasta', exact: true })
      .click();
    assert.equal(
      await dialog.getByRole('combobox', { name: 'Región' }).inputValue(),
      'Región de Antofagasta',
    );
    const expanded = await dialog.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const title = element.querySelector('h2').getBoundingClientRect();
      const button = element.querySelector('button[type="submit"]').getBoundingClientRect();
      const input = element.querySelector('[name="comuna"]');
      const inputBox = input.getBoundingClientRect();
      return {
        titleVisible: title.y >= box.y,
        submitAtBottom: button.y > box.bottom - 100 && button.bottom <= innerHeight,
        fieldNotObscured:
          document.elementFromPoint(inputBox.x + 10, inputBox.y + inputBox.height / 2) === input,
      };
    });
    assert.deepEqual(expanded, {
      titleVisible: true,
      submitAtBottom: true,
      fieldNotObscured: true,
    });
    await page.screenshot({ path: path.join(output, 'client-320-expanded.png') });
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await commune.click();
      const list = page.getByRole('listbox', { name: 'Comunas de Chile' });
      await list.waitFor({ state: 'visible' });
      const popup = await list.boundingBox();
      assert(popup.x >= 0 && popup.x + popup.width <= viewport.width);
      assert(popup.y >= 0 && popup.y + popup.height <= viewport.height);
      await page.screenshot({ path: path.join(output, `chile-select-${viewport.width}.png`) });
      await commune.press('Escape');
      assert.equal(await dialog.isVisible(), true);
    }
    await dialog.getByRole('button', { name: 'Crear cliente' }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(submissions.length, 1);
    assert.equal(submissions[0].rut, '123456785');
    assert.equal(submissions[0].telefono, '+56552345678');
    assert.equal(submissions[0].comuna, 'Antofagasta');
    assert.deepEqual(errors, []);
    console.log(`Client form verified. Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
