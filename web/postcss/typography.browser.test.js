// @vitest-environment node
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { createServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import config from '../postcss.config.js';
import typography from './typography.js';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  chromium.executablePath(),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((candidate) => candidate && existsSync(candidate));

it('transforms CSS through the Vite development pipeline', async () => {
  const server = await createServer({
    root: webRoot,
    configFile: false,
    logLevel: 'silent',
    css: { postcss: config },
    server: { middlewareMode: true, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const result = await server.transformRequest('/src/index.css?direct');
    const css = postcss.parse(result.code);
    const values = {};
    css.walkRules((rule) => {
      if ([':root', 'body', '.text-xs', '.font-normal'].includes(rule.selector)) {
        rule.walkDecls((decl) => {
          values[`${rule.selector}:${decl.prop}`] = decl.value;
        });
      }
    });
    expect(values[':root:font-size']).toBe('14px');
    expect(values['body:font-size']).toBe('calc(1rem + var(--ui-font-size-step, 1pt))');
    expect(values['.text-xs:font-size']).toBe('calc(0.75rem + var(--ui-font-size-step, 1pt))');
    expect(values['.font-normal:font-weight']).toBe('var(--ui-font-weight-normal, 600)');
  } finally {
    await server.close();
  }
}, 30000);

// playwright-core intentionally does not download a browser. Run these checks
// with an installed Chrome/Edge or PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
describe.skipIf(!executablePath)('computed typography in Chromium', () => {
  let browser;
  let baseline;
  let increased;

  const samples = `
    <p data-sample="inherited">Inherited text <span data-sample="nested">nested</span></p>
    <p data-sample="regular" class="font-normal">Regular</p>
    <p data-sample="numeric-regular" class="font-[400]">Regular numeric</p>
    <p data-sample="medium" class="font-medium">Medium</p>
    <p data-sample="bold" class="font-bold">Bold</p>
    <p data-sample="black" class="font-black">Black</p>
    <b data-sample="b">Default bold</b>
    <strong data-sample="strong">Default strong</strong>
    <strong data-sample="medium-strong" class="font-medium">Explicit medium strong</strong>
    <p data-sample="rem" class="text-xs">Rem text</p>
    <p data-sample="pixels" class="text-[10.5px]">Fractional pixel text</p>
    <p data-sample="important" class="!text-[11px]">Important pixel text</p>
    <p data-sample="responsive" class="text-xs md:text-[13px]">Responsive text</p>
    <p data-sample="fluid" class="fixture-fluid">Fluid text</p>
    <p data-sample="relative" class="fixture-relative">Relative text</p>
    <small data-sample="small">Relative small text</small>
    <p class="text-lg"><sup data-sample="sup">Nested superscript</sup></p>
    <button data-sample="button">Inherited button</button>
    <input data-sample="input" value="Inherited input">
    <span data-sample="hidden" class="fixture-hidden">Hidden compact label</span>
    <h2 data-sample="heading" class="text-xl font-bold">Document heading</h2>
    <table><thead><tr><th data-sample="th">Table heading</th></tr></thead>
      <tbody><tr><td data-sample="td">Table text</td></tr></tbody></table>
  `;
  const markup = `
    <div data-scope="ui">${samples}</div>
    <div data-scope="document" class="pdf-paper-sheet" style="font-family: Arial, sans-serif">${samples}
      <p class="font-semibold"><strong data-sample="relative-bold">Original relative document bold</strong></p>
    </div>
    <div data-spacing class="w-64 p-4 m-2 grid gap-4 rounded-lg">Spacing</div>
  `;

  beforeAll(async () => {
    const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
    const imports = [...main.matchAll(/import '\.\/(.+\.css)';/g)].map((match) => match[1]);
    const sources = await Promise.all(
      imports.map((file) => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8')),
    );
    const source =
      sources.join('\n') +
      `
      .fixture-fluid { font-size: clamp(12px, 3.6vw, 26px); }
      .fixture-relative { font-size: 1.25em; }
      .fixture-hidden { font-size: 0; }
    `;
    const compile = (plugins) =>
      postcss([tailwindcss({ content: [{ raw: markup }] }), ...plugins]).process(source, {
        from: new URL('../src/index.css', import.meta.url).pathname,
      });
    baseline = (await compile([])).css;
    increased = (await compile([typography()])).css;
    browser = await chromium.launch({ executablePath, headless: true });
  }, 30000);

  afterAll(async () => {
    await browser?.close();
  });

  async function snapshot(css, width) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      await page.route('http://typography.test/fonts/*', async (route) => {
        const name = new URL(route.request().url()).pathname.split('/').pop();
        const font = await readFile(new URL(`../public/fonts/${name}`, import.meta.url));
        await route.fulfill({ body: font, contentType: 'font/woff2' });
      });
      await page.setContent(`<base href="http://typography.test/"><style>${css}</style>${markup}`);
      await page.evaluate(() => document.fonts.ready);
      return await page.evaluate(() => {
        const nodes = {};
        document.querySelectorAll('[data-sample]').forEach((node) => {
          const css = getComputedStyle(node);
          const key = `${node.closest('[data-scope]').dataset.scope}:${node.dataset.sample}`;
          nodes[key] = {
            size: parseFloat(css.fontSize),
            weight: css.fontWeight,
            family: css.fontFamily,
          };
        });
        const spacing = getComputedStyle(document.querySelector('[data-spacing]'));
        return {
          root: getComputedStyle(document.documentElement).fontSize,
          nodes,
          spacing: [
            spacing.width,
            spacing.padding,
            spacing.margin,
            spacing.gap,
            spacing.borderRadius,
          ],
        };
      });
    } finally {
      await page.close();
    }
  }

  it.each([320, 1366])(
    'adds exactly 4/3px at %ipx while preserving document fonts and rem spacing',
    async (width) => {
      const before = await snapshot(baseline, width);
      const after = await snapshot(increased, width);
      expect(before.root).toBe('14px');
      expect(after.root).toBe(before.root);
      expect(after.spacing).toEqual(before.spacing);
      for (const [key, previous] of Object.entries(before.nodes)) {
        const current = after.nodes[key];
        if (key.startsWith('document:')) {
          expect(current, key).toEqual(previous);
        } else {
          if (key === 'ui:hidden') expect(current.size, key).toBe(0);
          else expect(current.size - previous.size, key).toBeCloseTo(4 / 3, 2);
          expect(current.family, key).toBe(previous.family);
          expect(current.weight, key).toBe(previous.weight === '400' ? '600' : previous.weight);
        }
      }
    },
    30000,
  );
});
