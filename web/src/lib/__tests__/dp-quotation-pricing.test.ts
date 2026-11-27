import { calculateDpWorkQuote, createDefaultDpConfiguration, dpQuoteInputSchema } from '@unithor/shared';
import { describe, expect, it } from 'vitest';

import { previewDpQuotationPricing, reclassifyDpQuotation } from '../dp-quotation-pricing';
import { dpQuotationRecoverySchema } from '../dp-quotation-recovery';

import type { DpQuotationLine } from '../dp-quotation-recovery';
import type { DpQuoteInput } from '@unithor/shared';

function line(patch: Partial<DpQuoteInput> = {}, discount = '0'): DpQuotationLine {
  const quote = calculateDpWorkQuote(createDefaultDpConfiguration(), dpQuoteInputSchema.parse({
    configurationRevision: 2, bodyTypeId: 'hatchback', sizeId: 'M', pieceId: 'retrovisor', positionId: 'L',
    operations: [{ operationId: 'painting_full' }], ...patch,
  }), 2);
  return {
    key: 'piece-' + quote.selection.pieceId, division: 'DP', subtipo: 'servicio_dp', tipoLinea: 'estandar',
    catalogItemId: null, descripcion: `${quote.pieceLabel} · ${quote.positionLabel}`, unidadMedida: 'unidad',
    cantidad: '1', precioUnitario: String(quote.precioUnitario), descuentoTipo: 'fijo', descuentoValor: discount,
    dpPricing: quote.selection, dpPricingSnapshot: quote,
  };
}

const classify = (items: DpQuotationLine[], extra: Partial<Parameters<typeof reclassifyDpQuotation>[0]> = {}) => reclassifyDpQuotation({
  configuration: createDefaultDpConfiguration(), revision: 2, items, bodyTypeId: 'hatchback', sizeId: 'S', discount: {}, ...extra,
});

describe('Reclasificación D&P sin pérdida de captura', () => {
  it('no modifica ninguna fila si una pieza posterior es incompatible', () => {
    const items = [line({ bodyTypeId: 'pickup', pieceId: 'capo', positionId: 'UNICA' }), line({ bodyTypeId: 'pickup', pieceId: 'lateral_pickup' })];
    const before = structuredClone(items);
    expect(classify(items, { bodyTypeId: 'suv', sizeId: 'M' })).toMatchObject({ ok: false, error: expect.stringContaining('Lateral de pickup') });
    expect(items).toEqual(before);
  });

  it('rechaza descuentos por línea que superen la nueva tarifa', () => {
    const items = [line({}, '17000')];
    expect(classify(items)).toMatchObject({ ok: false, error: expect.stringMatching(/Retrovisor.*descuento/) });
    expect(items[0].precioUnitario).toBe('18000');
    expect(items[0].dpPricingSnapshot?.selection.sizeId).toBe('M');
  });

  it('también rechaza un descuento general que supere el nuevo presupuesto', () => {
    expect(classify([line()], { discount: { descuentoTipo: 'fijo', descuentoValor: '17000' } })).toMatchObject({
      ok: false, error: expect.stringContaining('descuento general'),
    });
  });

  it('recalcula las tarifas y snapshots válidos manteniendo descuentos y repuestos ACC', () => {
    const dp = line({}, '1000');
    const acc: DpQuotationLine = {
      key: 'acc-1', division: 'ACC', subtipo: 'a_pedido', tipoLinea: 'parte', catalogItemId: 50,
      descripcion: 'Manilla', unidadMedida: 'unidad', cantidad: '2', precioUnitario: '45000',
      descuentoTipo: 'porcentaje', descuentoValor: '10', esAPedido: true,
    };
    const result = classify([dp, acc]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items[0]).toMatchObject({ precioUnitario: '15300', descuentoTipo: 'fijo', descuentoValor: '1000', dpPricing: { sizeId: 'S' }, dpPricingSnapshot: { precioUnitario: 15300, sizeLabel: 'S' } });
    expect(result.items[1]).toBe(acc);
    expect(dp.precioUnitario).toBe('18000');
    expect(previewDpQuotationPricing(result.items).pricing?.total).toBe(95300);
  });

  it('conserva el editor si su descuento o su pieza no son compatibles con el cambio', () => {
    const dp = line({}, '17000');
    expect(classify([], { editor: { pieceKey: 'retrovisor:L', selection: dp.dpPricing!, discount: dp } })).toMatchObject({ ok: false, error: expect.stringMatching(/edición.*Retrovisor.*descuento/) });
    const pickup = line({ bodyTypeId: 'pickup', pieceId: 'lateral_pickup' });
    expect(classify([], { editor: { pieceKey: 'lateral_pickup:L', selection: pickup.dpPricing!, discount: {} } })).toMatchObject({ ok: false, error: expect.stringContaining('Lateral de pickup') });
  });

  it.each([{ precioUnitario: 'inválido' }, { descuentoValor: '19000' }])('devuelve un error de vista previa sin lanzar para %j', (patch) => {
    expect(previewDpQuotationPricing([{ ...line(), ...patch }])).toMatchObject({ pricing: null, error: expect.any(String) });
  });

  it('excluye credenciales de los datos de recuperación de cliente y vehículo', () => {
    const client = dpQuotationRecoverySchema.shape.client.parse({ id: 3, nombre: 'Cliente', rut: null, jwt: 'session-secret' });
    const vehicle = dpQuotationRecoverySchema.shape.selectedVehicle.parse({
      id: 21, patente: 'ABCD12', marca: null, modelo: null, ano: null, client,
      accessToken: 'session-secret',
    });
    expect(JSON.stringify({ client, vehicle })).not.toContain('session-secret');
  });
});
