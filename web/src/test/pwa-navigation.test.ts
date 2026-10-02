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
