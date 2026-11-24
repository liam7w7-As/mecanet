import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import typography from '../../web/postcss/typography.js';
import sharp from 'sharp';

const rootDir = process.cwd();
const main = fs.readFileSync('tmp/pdf-review/main.tsx', 'utf8').replace("import '../../web/src/index.css';", '');
const bundle = await build({ stdin: { contents: main, resolveDir: `${rootDir}/tmp/pdf-review`, loader: 'tsx' }, bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
process.chdir(`${rootDir}/web`);
const css = (await postcss([tailwind(`${rootDir}/web/tailwind.config.ts`), autoprefixer(), typography()]).process(fs.readFileSync('src/index.css', 'utf8'), { from: 'src/index.css' })).css;
process.chdir(rootDir);
for (let index = 0; index < 9; index += 1) {
  const width = index % 2 ? 400 : 240;
  const height = index % 2 ? 240 : 400;
  await sharp({ create: { width, height, channels: 3, background: ['#397286', '#31577a', '#4a7778'][index % 3] } })
    .composite([{ input: Buffer.from(`<svg width="${width}" height="${height}"><rect x="24" y="130" width="${width - 48}" height="50" fill="white"/><text x="12" y="64" fill="white" font-size="26">Vista ${index + 1}</text></svg>`) }])
    .png().toFile(`tmp/pdf-review/qa-photo-${index}.png`);
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => console.error(error.message));
  await page.route('http://pdf-qa.local/**', async (route) => {
    const name = new URL(route.request().url()).pathname;
    if (/^\/qa-photo-\d\.png$/.test(name)) return route.fulfill({ path: path.join(rootDir, 'tmp/pdf-review', name.slice(1)) });
    const file = path.resolve(rootDir, 'web/public', '.' + new URL(route.request().url()).pathname);
    if (!file.startsWith(path.resolve(rootDir, 'web/public') + path.sep) || !fs.existsSync(file)) return route.abort();
    await route.fulfill({ path: file });
  });
  await page.setContent('<html lang="es"><head><meta charset="UTF-8"><base href="http://pdf-qa.local/"><style>' + css + '</style></head><body><div id="root"></div></body></html>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.waitForSelector('[data-qa="ot"] .pdf-paper-sheet');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete));
  for (const name of process.argv.includes('--long-only') ? ['long'] : ['ot', 'cot', 'long']) {
    const root = page.locator(`[data-qa="${name}"]`);
    const sheets = root.locator('.pdf-paper-sheet');
    console.log(name, 'pages', await sheets.count());
    await sheets.first().screenshot({ path: `tmp/pdf-review/${name}.png` });
    if (name === 'long') await sheets.nth((await sheets.count()) - 2).screenshot({ path: 'tmp/pdf-review/long-summary.png' });
    if (name !== 'long') await sheets.last().screenshot({ path: `tmp/pdf-review/${name}-last.png` });
    if (name !== 'long') {
      const bytes = await page.evaluate((key) => window.qa.export(key), name);
      fs.writeFileSync(`tmp/pdf-review/${name}.pdf`, Buffer.from(bytes, 'base64'));
    }
    console.log(await sheets.evaluateAll((pages) => pages.map((sheet) => ({ width: sheet.clientWidth, height: sheet.clientHeight, overflowX: sheet.scrollWidth > sheet.clientWidth, rows: sheet.querySelectorAll('[data-document-item]').length, photos: sheet.querySelectorAll('[data-inspection-photo]').length }))));
  }
} finally {
  await browser.close();
}
