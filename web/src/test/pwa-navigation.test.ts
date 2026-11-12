// @vitest-environment node
import { VitePWA } from 'vite-plugin-pwa';
import { describe, expect, it, vi } from 'vitest';

import '../../vite.config';

vi.mock('vite-plugin-pwa', () => ({ VitePWA: vi.fn(() => []) }));

describe('PWA navigation fallback', () => {
  const denylist = vi.mocked(VitePWA).mock.calls[0]?.[0]?.workbox?.navigateFallbackDenylist ?? [];
  const isExcluded = (path: string): boolean => denylist.some((pattern) => pattern.test(path));

  it.each([
    '/api',
    '/api?check=1',
    '/api/payments/203/receipt',
    '/api/payments/203/receipt?download=1',
    '/api/work-orders/1/pdf',
    '/api/reports/commercial/excel',
    '/API/payments/203/receipt',
  ])('keeps %s out of the application shell', (path) => {
    expect(isExcluded(path)).toBe(true);
  });

  it.each(['/', '/login', '/finance', '/quotations/203', '/work-orders', '/apiculture'])(
    'preserves frontend navigation for %s',
    (path) => {
      expect(isExcluded(path)).toBe(false);
    },
  );
});

describe('PWA update and cache boundaries', () => {
  const options = vi.mocked(VitePWA).mock.calls[0]?.[0];

  it('waits for confirmation instead of activating an update over an open form', () => {
    expect(options?.registerType).toBe('prompt');
    expect(options?.workbox?.skipWaiting).toBe(false);
    expect(options?.workbox?.clientsClaim).toBe(false);
  });

  it('precaches only build assets and excludes private files', () => {
    expect(options?.workbox?.globPatterns).toEqual(['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}']);
    expect(options?.workbox?.globIgnores).toEqual(expect.arrayContaining(['**/api/**', '**/uploads/**']));
    expect(options?.workbox?.additionalManifestEntries).toBeUndefined();
  });

  it('limits runtime caching to public fonts, including for cross-origin APIs', () => {
    const routes = options?.workbox?.runtimeCaching ?? [];
    expect(routes).toHaveLength(2);
    for (const route of routes) {
      expect(route.urlPattern).toBeInstanceOf(RegExp);
      const pattern = route.urlPattern as RegExp;
      expect(pattern.test('https://fonts.googleapis.com/css2?family=Inter')
        || pattern.test('https://fonts.gstatic.com/font.woff2')).toBe(true);
      for (const url of [
        'https://unithor.example/api/auth/me',
        'https://unithor.example/api/quotations/1',
        'https://api.unithor.example/api/work-orders/1/pdf',
        'https://unithor.example/uploads/private.png',
        'https://fonts.googleapis.com.evil.example/api/auth/me',
      ]) expect(pattern.test(url), url).toBe(false);
    }
  });

  it('keeps dev service workers from intercepting navigation or caching API responses', () => {
    expect(options?.devOptions?.navigateFallbackAllowlist).toEqual([]);
    expect(options?.devOptions?.disableRuntimeConfig).toBe(true);
  });
});
