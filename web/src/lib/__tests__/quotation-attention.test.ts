import { describe, expect, it } from 'vitest';

import { getQuotationAttention } from '../quotation-attention';

import type { Quotation } from '../../types/entities';

const NOW = Date.parse('2026-09-30T12:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

const base: Quotation = {
  id: 1,
  codigo: 'COT-2026-0001',
  workOrderId: null,
  clientId: 1,
  vehicleId: null,
  asesorId: null,
  estadoPago: 'por_pagar',
  subtotal: 10000,
  total: 10000,
  pagado: 0,
  notas: null,
  createdAt: daysAgo(4),
  updatedAt: daysAgo(22),
};

describe('getQuotationAttention', () => {
  it('avisa y atenúa las COT sin OT según antigüedad', () => {
    expect(getQuotationAttention({ ...base, createdAt: daysAgo(2) }, NOW)).toBeNull();
    expect(getQuotationAttention({ ...base, createdAt: daysAgo(3) }, NOW)).toEqual({ kind: 'unlinked', days: 3 });
    expect(getQuotationAttention({ ...base, updatedAt: daysAgo(0) }, NOW)).toEqual({ kind: 'fading', days: 4 });
    expect(getQuotationAttention({ ...base, archivedAt: daysAgo(1) }, NOW)).toBeNull();
  });

  it('toma la última actividad de la OT vinculada', () => {
    const linked: Quotation = { ...base, workOrderId: 2, workOrder: { id: 2, codigo: 'OT-2026-0001', estado: 'en_progreso', updatedAt: daysAgo(1) } };
    expect(getQuotationAttention(linked, NOW)).toBeNull();
    expect(getQuotationAttention({ ...linked, workOrder: { ...linked.workOrder!, updatedAt: daysAgo(8) } }, NOW)).toEqual({ kind: 'linked', days: 8 });
  });

  it('no alerta por cotizaciones pagadas', () => {
    expect(getQuotationAttention({ ...base, pagado: 10000, estadoPago: 'total' }, NOW)).toBeNull();
  });
});
