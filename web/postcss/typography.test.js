// @vitest-environment node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { describe, expect, it } from 'vitest';

import config from '../postcss.config.js';
import typography from './typography.js';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const step = 'var(--ui-font-size-step, 1pt)';
const normal = 'var(--ui-font-weight-normal, 600)';
const transform = (css) => postcss([typography()]).process(css, { from: undefined });

function declarations(root, selector) {
  const values = {};
  root.walkRules((rule) => {
    if (rule.selector === selector) {
      rule.walkDecls((decl) => {
        values[decl.prop] = decl.value;
      });
    }
  });
  return values;
}

describe('global UI typography', () => {
  it.each([
    '9.5px',
    '14px',
    '.75rem',
    '1.25rem',
    '10pt',
    '3vw',
    '2cqw',
    'clamp(12px, 3.6vw, 14px)',
    'calc(1rem + 2px)',
    'var(--text-size)',
  ])('adds one physical point to %s', async (size) => {
    const result = await transform(`.text { font-size: ${size} !important; }`);
    expect(declarations(result.root, '.text')['font-size']).toBe(`calc(${size} + ${step})`);
    expect(result.root.first.first.important).toBe(true);
  });

  it('preserves root sizes, inherited sizes and hidden text', async () => {
    const css = `
      :root { font-size: 14px; }
      html, :host { font-size: 14px; }
      .inherit { font: inherit; font-size: inherit; font-weight: inherit; }
      .zero { font-size: 0; }
      .zero-px { font-size: 0px; }
      .zero-em { font-size: 0em; }
      .percent { font-size: 100%; }
      .em { font-size: 1em; }
    `;
    expect((await transform(css)).css).toBe(css);
    const result = await transform('html .nested { font-size: 14px; }');
    expect(declarations(result.root, 'html .nested')['font-size']).toBe(`calc(14px + ${step})`);
  });

  it('compensates relative sizes for the point already inherited from their parent', async () => {
    const result = await transform(`
      small { font-size: 80%; }
      sub, sup { font-size: 75%; }
      .relative { font-size: 1.25em; }
    `);
    expect(declarations(result.root, 'small')['font-size']).toBe(`calc(80% + 0.2 * ${step})`);
    expect(declarations(result.root, 'sub, sup')['font-size']).toBe(`calc(75% + 0.25 * ${step})`);
    expect(declarations(result.root, '.relative')['font-size']).toBe(
      `calc(1.25em + -0.25 * ${step})`,
    );
  });

  it('changes only regular weights, preserving explicit medium and heavier weights', async () => {
    const result = await transform(`
      .normal { font-weight: normal; }
      .regular { font-weight: 400 !important; }
      .medium { font-weight: 500; }
      .semibold { font-weight: 600; }
      .custom { font-weight: 650; }
      .bold { font-weight: 700; }
      .black { font-weight: 900; }
      strong { font-weight: bolder; }
    `);
    expect(declarations(result.root, '.normal')['font-weight']).toBe(normal);
    expect(declarations(result.root, '.regular')['font-weight']).toBe(normal);
    expect(result.root.nodes[1].first.important).toBe(true);
    for (const [selector, weight] of [
      ['.medium', '500'],
      ['.semibold', '600'],
      ['.custom', '650'],
      ['.bold', '700'],
      ['.black', '900'],
      ['strong', 'bolder'],
    ]) {
      expect(declarations(result.root, selector)['font-weight']).toBe(weight);
    }
  });

  it('handles the body shorthand without changing family, style or line-height', async () => {
    const result = await transform(`
      body { font: 14px/1.5 'Poppins',sans-serif; }
      .regular { font: italic 400 12px / 18px 'Poppins', sans-serif; }
      .normal { font: normal italic 12px/1.5 'Poppins'; }
      .medium { font: 500 12px/1.5 'Poppins'; }
      .bold { font: bold 12px/1.5 'Poppins'; }
    `);
    expect(declarations(result.root, 'body').font).toBe(
      `${normal} calc(14px + ${step})/1.5 'Poppins',sans-serif`,
    );
    expect(declarations(result.root, '.regular').font).toBe(
      `italic ${normal} calc(12px + ${step}) / 18px 'Poppins', sans-serif`,
    );
    expect(declarations(result.root, '.normal').font).toBe(
      `${normal} italic calc(12px + ${step})/1.5 'Poppins'`,
    );
    expect(declarations(result.root, '.medium').font).toBe(
      `500 calc(12px + ${step})/1.5 'Poppins'`,
    );
    expect(declarations(result.root, '.bold').font).toBe(`bold calc(12px + ${step})/1.5 'Poppins'`);
  });

  it('leaves font faces, document styles and print typography unchanged', async () => {
    const css = `
      @font-face { font-family: 'Poppins'; src: url('/fonts/poppins-400.woff2'); font-weight: 400; }
      @font-face { font-family: 'Poppins'; src: url('/fonts/poppins-700.woff2'); font-weight: 700; }
      .pdf-paper-sheet { --ui-font-size-step: 0pt; --ui-font-weight-normal: 400; font-size: 1rem; font-weight: 400; }
      .pdf-paper-sheet h2 { font-size: 12px; font-weight: normal; }
      #unithor-print-portal .title { font: 14px/1.5 Arial; }
      @media print { body { font-size: 12pt; font-weight: 400; } }
      @media only print and (color) { .title { font-size: 18pt; } }
      @page { font-size: 10pt; font-weight: normal; }
    `;
    expect((await transform(css)).css).toBe(css);
  });

  it('keeps spacing, line-height, colors and other declarations byte-for-byte', async () => {
    const css = `.panel { padding: 1rem 14px; margin: .5rem; gap: 2rem; width: 20rem; line-height: 1.5; letter-spacing: .01em; color: #33465b; --text-size: 12px; }`;
    expect((await transform(css)).css).toBe(css);
  });

  it('does not add another point when transformed CSS is processed again', async () => {
    const first = await transform(
      `body { font: 14px/1.5 'Poppins'; } .text { font-size: .75rem; font-weight: 400; }`,
    );
    expect((await transform(first.css)).css).toBe(first.css);
  });
});

describe('Tailwind and application integration', () => {
  const candidates =
    'text-xs text-sm text-base text-2xl text-[10.5px] md:text-[13px] hover:text-xl !text-[11px] font-normal font-[400] font-medium font-bold font-black p-4 gap-4 leading-6';

  it('runs after Tailwind for standard, arbitrary, important and responsive utilities', async () => {
    const plugins = [
      tailwindcss({ content: [{ raw: candidates }], corePlugins: { preflight: false } }),
      typography(),
    ];
    const input = '@tailwind utilities;';
    const first = await postcss(plugins).process(input, { from: undefined });
    const second = await postcss(plugins).process(input, { from: undefined });
    expect(second.css).toBe(first.css);
    expect(declarations(first.root, '.text-xs')['font-size']).toBe(`calc(0.75rem + ${step})`);
    expect(declarations(first.root, '.text-sm')['font-size']).toBe(`calc(0.875rem + ${step})`);
    expect(declarations(first.root, '.text-base')['font-size']).toBe(`calc(1rem + ${step})`);
    expect(declarations(first.root, '.text-2xl')['font-size']).toBe(`calc(1.5rem + ${step})`);
    expect(declarations(first.root, '.text-\\[10\\.5px\\]')['font-size']).toBe(
      `calc(10.5px + ${step})`,
    );
    expect(declarations(first.root, '.md\\:text-\\[13px\\]')['font-size']).toBe(
      `calc(13px + ${step})`,
    );
    expect(declarations(first.root, '.hover\\:text-xl:hover')['font-size']).toBe(
      `calc(1.25rem + ${step})`,
    );
    expect(declarations(first.root, '.\\!text-\\[11px\\]')['font-size']).toBe(
      `calc(11px + ${step})`,
    );
    expect(declarations(first.root, '.font-normal')['font-weight']).toBe(normal);
    expect(declarations(first.root, '.font-\\[400\\]')['font-weight']).toBe(normal);
    expect(declarations(first.root, '.font-medium')['font-weight']).toBe('500');
    expect(declarations(first.root, '.font-bold')['font-weight']).toBe('700');
    expect(declarations(first.root, '.font-black')['font-weight']).toBe('900');
    expect(declarations(first.root, '.p-4').padding).toBe('1rem');
    expect(declarations(first.root, '.gap-4').gap).toBe('1rem');
    expect(declarations(first.root, '.leading-6')['line-height']).toBe('1.5rem');
  });

  it('keeps preflight bold at 700 without changing other relative weight declarations', async () => {
    const result = await postcss([
      tailwindcss({ content: [{ raw: '<b>Bold</b><strong>Strong</strong>' }] }),
      typography(),
    ]).process('@tailwind base; .relative { font-weight: bolder; }', { from: undefined });
    const preflight = [];
    result.root.walkRules((rule) => {
      if (
        rule.selectors.length === 2 &&
        rule.selectors.every((selector) => ['b', 'strong'].includes(selector))
      ) {
        rule.walkDecls('font-weight', (decl) => preflight.push(decl.value));
      }
    });
    expect(preflight).toEqual(['var(--ui-font-weight-bold, 700)']);
    expect(declarations(result.root, '.relative')['font-weight']).toBe('bolder');
  });

  it('uses the same configured pipeline for Vite dev and build', () => {
    expect(config.plugins.map((plugin) => plugin.postcssPlugin)).toEqual([
      'tailwindcss',
      'autoprefixer',
      'unithor-ui-typography',
    ]);
  });

  it('covers every current stylesheet while retaining the root and document baselines', async () => {
    const src = path.join(webRoot, 'src');
    const files = (await readdir(src, { recursive: true })).filter((file) => file.endsWith('.css'));
    let sizes = 0;
    for (const file of files) {
      const original = postcss.parse(await readFile(path.join(src, file), 'utf8'));
      const transformed = await postcss([typography()]).process(original.clone(), {
        from: path.join(src, file),
      });
      const before = [];
      const after = [];
      original.walkDecls((decl) => before.push(decl));
      transformed.root.walkDecls((decl) => after.push(decl));
      expect(after).toHaveLength(before.length);
      before.forEach((decl, index) => {
        if (!['font-size', 'font-weight', 'font'].includes(decl.prop)) {
          expect(after[index].toString(), file).toBe(decl.toString());
        } else if (
          decl.prop === 'font-size' &&
          /^\d+(?:\.\d+)?px$/.test(decl.value) &&
          decl.parent.selector !== ':root'
        ) {
          sizes += 1;
          expect(after[index].value, `${file}: ${decl.parent.selector}`).toBe(
            `calc(${decl.value} + ${step})`,
          );
        }
      });
      if (file === 'index.css') {
        expect(declarations(transformed.root, ':root')['font-size']).toBe('14px');
        expect(declarations(transformed.root, 'body')['font-size']).toBe(`calc(1rem + ${step})`);
        expect(declarations(transformed.root, '.pdf-paper-sheet')).toEqual({
          '--ui-font-size-step': '0pt',
          '--ui-font-weight-normal': '400',
          '--ui-font-weight-bold': 'bolder',
          'font-size': '1rem',
          'font-weight': '400',
        });
        const fontFaces = [];
        original.walkAtRules('font-face', (face) => fontFaces.push(face.toString()));
        const transformedFaces = [];
        transformed.root.walkAtRules('font-face', (face) => transformedFaces.push(face.toString()));
        expect(transformedFaces).toEqual(fontFaces);
      }
    }
    expect(sizes).toBeGreaterThan(1000);
  });
});
