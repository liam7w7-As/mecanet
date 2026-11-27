import { calculateDpWorkQuote, createDefaultDpConfiguration } from '@unithor/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../work-order-item-links.js', () => ({ hasWorkItemHistory: vi.fn() }));

import { assertDpItemIdentityUpdate, assertNewDpItemPending, hasDpTechnicalSelectionChanged } from '../work-order-dp-integrity.js';
import { hasWorkItemHistory } from '../work-order-item-links.js';

import type { WorkOrderItem } from '../../models/WorkOrderItem.js';
import type { DpQuoteInput, DpWorkQuote } from '@unithor/shared';
import type { Transaction } from 'sequelize';

const transaction = {} as Transaction;
const quote = (): DpWorkQuote => calculateDpWorkQuote(createDefaultDpConfiguration(), {
  configurationRevision: 1, scope: 'piece', bodyTypeId: 'hatchback', sizeId: 'M',
  pieceId: 'parachoque', positionId: 'F', damageLevelId: 'D1',
  operations: [{ operationId: 'painting_full' }, { operationId: 'repair_plastic' }],
}, 1);
const item = (snapshot = quote()): WorkOrderItem => ({
  id: 7, descripcion: 'Parachoque delantero', division: 'DP', tipoLinea: 'estandar',
  catalogItemId: null, dpPricingSnapshot: snapshot, estadoOperativo: 'pendiente',
  assignedUserId: null, ccfStatus: 'pendiente', ccfReviewedAt: null, qualityStatus: 'pendiente',
}) as WorkOrderItem;
const update = (snapshot: DpWorkQuote | null) => ({
  division: 'DP' as const, catalogItemId: null, tipoLinea: 'estandar' as const,
  dpPricingSnapshot: snapshot, estadoOperativo: 'pendiente' as const,
});

describe('Identidad técnica D&P y conservación del historial', () => {
  beforeEach(() => { vi.mocked(hasWorkItemHistory).mockReset().mockResolvedValue(false); });

  it.each<Partial<DpQuoteInput>>([
    { scope: 'global' }, { bodyTypeId: 'sedan' }, { sizeId: 'S' },
    { pieceId: 'capo' }, { positionId: 'R' }, { damageLevelId: 'D2' },
    { operations: [{ operationId: 'dismantling' }] },
  ])('detecta una sustitución aunque no cambie la descripción: %j', (selection) => {
    const previous = quote();
    const next = { ...previous, selection: { ...previous.selection, ...selection } };
    expect(hasDpTechnicalSelectionChanged(previous, next)).toBe(true);
  });

  it('conserva el CCF y las etapas al variar solo revisión, precios, descuentos o el orden de las operaciones', async () => {
    const previous = quote();
    const next = { ...previous, configurationRevision: 2, precioUnitario: previous.precioUnitario + 1000,
      selection: { ...previous.selection, configurationRevision: 2,
        operations: [...previous.selection.operations].reverse().map((operation) => ({ ...operation, descuentoTipo: 'porcentaje' as const, descuentoValor: 10 })) } };
    expect(hasDpTechnicalSelectionChanged(previous, next)).toBe(false);
    const completed = item(previous);
    completed.estadoOperativo = 'completado';
    completed.ccfStatus = 'aprobado';
    await expect(assertDpItemIdentityUpdate(completed, update(next), transaction)).resolves.toBe(false);
    expect(completed.ccfStatus).toBe('aprobado');
    expect(hasWorkItemHistory).not.toHaveBeenCalled();
  });

  it('identifica cuando se añade o quita el cálculo en un trabajo antiguo', () => {
    expect(hasDpTechnicalSelectionChanged(null, quote())).toBe(true);
    expect(hasDpTechnicalSelectionChanged(quote(), null)).toBe(true);
    expect(hasDpTechnicalSelectionChanged(null, null)).toBe(false);
  });

  it('permite corregir la pieza sin actividad para que el servicio vuelva a validar su calidad', async () => {
    const previous = item();
    const next = quote();
    next.selection.pieceId = 'capo';
    await expect(assertDpItemIdentityUpdate(previous, update(next), transaction)).resolves.toBe(true);
  });

  it('bloquea la sustitución si existen notas, asignaciones u horas, incluso con etapas pendientes', async () => {
    vi.mocked(hasWorkItemHistory).mockResolvedValue(true);
    const previous = item();
    const next = quote();
    next.selection.damageLevelId = 'D3';
    await expect(assertDpItemIdentityUpdate(previous, update(next), transaction)).rejects.toThrow('Conserva esta línea');
    expect(previous.dpPricingSnapshot?.selection.damageLevelId).toBe('D1');
  });

  it('no permite conservar un CCF aprobado de otra pieza', async () => {
    const previous = item();
    previous.ccfStatus = 'aprobado';
    const next = quote();
    next.selection.positionId = 'R';
    await expect(assertDpItemIdentityUpdate(previous, update(next), transaction)).rejects.toThrow('historial');
    expect(previous.ccfStatus).toBe('aprobado');
  });

  it('los trabajos D&P nuevos y las reclasificaciones comienzan pendientes', async () => {
    expect(() => assertNewDpItemPending('DP', 'completado')).toThrow('cinco etapas pendientes');
    expect(() => assertNewDpItemPending('DP', 'en_proceso')).toThrow('cinco etapas pendientes');
    expect(() => assertNewDpItemPending('DP', 'pendiente')).not.toThrow();
    const previous = item();
    previous.division = 'MEC';
    await expect(assertDpItemIdentityUpdate(previous, { ...update(quote()), estadoOperativo: 'completado' }, transaction)).rejects.toThrow('cinco etapas pendientes');
  });
});
