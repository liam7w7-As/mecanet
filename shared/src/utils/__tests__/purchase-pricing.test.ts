import { describe, expect, it } from 'vitest';

import { calculatePurchaseTotals } from '../purchase-pricing.js';

describe('calculatePurchaseTotals', () => {
  it('calcula el IVA una sola vez sobre el neto total', () => {
    expect(
      calculatePurchaseTotals(
        [
          { cantidad: 2, precioUnitario: 5000 },
          { cantidad: 1, precioUnitario: 1990 },
        ],
        true,
      ),
    ).toEqual({
      neto: 11990,
      iva: 2278.1,
      total: 14268.1,
      subtotales: [10000, 1990],
    });
  });

  it('deja el IVA en cero cuando la compra no lo incluye', () => {
    expect(calculatePurchaseTotals([{ cantidad: 1, precioUnitario: 10000 }], false)).toEqual({
      neto: 10000,
      iva: 0,
      total: 10000,
      subtotales: [10000],
    });
  });

  it('redondea subtotales, neto e IVA a dos decimales', () => {
    const result = calculatePurchaseTotals(
      [
        { cantidad: 3, precioUnitario: 0.1 },
        { cantidad: 1, precioUnitario: 0.2 },
      ],
      true,
    );

    expect(result.subtotales).toEqual([0.3, 0.2]);
    expect(result.neto).toBe(0.5);
    expect(result.iva).toBe(0.1);
    expect(result.total).toBe(0.6);
  });

  it('ignora cantidades y precios inválidos o negativos', () => {
    expect(
      calculatePurchaseTotals(
        [
          { cantidad: -2, precioUnitario: 1000 },
          { cantidad: Number.NaN, precioUnitario: 500 },
        ],
        true,
      ),
    ).toEqual({
      neto: 0,
      iva: 0,
      total: 0,
      subtotales: [0, 0],
    });
  });

  it('devuelve ceros cuando no hay ítems', () => {
    expect(calculatePurchaseTotals([], true)).toEqual({
      neto: 0,
      iva: 0,
      total: 0,
      subtotales: [],
    });
  });
});
