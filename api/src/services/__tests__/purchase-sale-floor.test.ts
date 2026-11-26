import { describe, expect, it } from 'vitest';

import { assertPurchaseSaleFloors } from '../purchase-sale-floor.js';

describe('minimum sale protection', () => {
  const items = [{ descripcion: 'Accesorio comprado', cantidad: 2, minimumSalePrice: 12500 }];
  it('accepts the exact minimum and legacy lines without a floor', () => {
    expect(() =>
      assertPurchaseSaleFloors(items, { lines: [{ subtotal: 25000 }], total: 25000 }),
    ).not.toThrow();
    expect(() =>
      assertPurchaseSaleFloors([{ ...items[0], minimumSalePrice: null }], {
        lines: [{ subtotal: 0 }],
        total: 0,
      }),
    ).not.toThrow();
  });
  it('rejects a reduced price, a line discount and a proportional general discount', () => {
    for (const pricing of [
      { lines: [{ subtotal: 24999 }], total: 24999 },
      { lines: [{ subtotal: 25000 }], total: 24000 },
    ])
      expect(() => assertPurchaseSaleFloors(items, pricing)).toThrow(/25%/);
  });
  it('allows a discount when the effective price still exceeds the floor', () => {
    expect(() =>
      assertPurchaseSaleFloors(items, { lines: [{ subtotal: 30000 }], total: 26000 }),
    ).not.toThrow();
  });
});
