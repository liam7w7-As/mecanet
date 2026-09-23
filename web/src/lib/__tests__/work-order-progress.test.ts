import { describe, expect, it, vi } from 'vitest';

import { getElapsedInfo, getWorkOrderProgress } from '../work-order-progress';

import type { WorkOrder } from '../../types/entities';

const baseOrder = {
  estado: 'en_progreso',
  fechaIngreso: '2026-09-20T10:00:00.000Z',
  fechaEntrega: null,
  updatedAt: '2026-09-20T10:00:00.000Z',
} as Pick<WorkOrder, 'estado' | 'fechaIngreso' | 'fechaEntrega' | 'updatedAt'>;

const item = (estadoOperativo: string, id: number) => ({
  id,
  catalogItemId: null,
  descripcion: `Tarea ${id}`,
  cantidad: 1,
  precioUnitario: 1000,
  subtotal: 1000,
  estadoOperativo,
  notasOperativas: null,
});

describe('getWorkOrderProgress', () => {
  it('0% sin iniciar cuando todo está pendiente', () => {
    const progress = getWorkOrderProgress({
      estado: 'en_progreso',
      items: [item('pendiente', 1)],
    } as Pick<WorkOrder, 'estado' | 'items'>);
    expect(progress.percent).toBe(0);
    expect(progress.tier).toBe('none');
  });

  it('los omitidos no penalizan', () => {
    const progress = getWorkOrderProgress({
      estado: 'en_progreso',
      items: [item('completado', 1), item('omitido', 2)],
    } as Pick<WorkOrder, 'estado' | 'items'>);
    expect(progress.percent).toBe(100);
    expect(progress.tier).toBe('done');
  });

  it('tier medio entre 30 y 69', () => {
    const progress = getWorkOrderProgress({
      estado: 'en_progreso',
      items: [item('completado', 1), item('pendiente', 2)],
    } as Pick<WorkOrder, 'estado' | 'items'>);
    expect(progress.percent).toBe(50);
    expect(progress.tier).toBe('mid');
  });

  it('diagnóstico neutral sin tareas', () => {
    const progress = getWorkOrderProgress({ estado: 'borrador', items: [] } as Pick<WorkOrder, 'estado' | 'items'>);
    expect(progress.tier).toBe('neutral');
  });
});

describe('getElapsedInfo', () => {
  it('reloj corriendo desde el ingreso', () => {
    vi.setSystemTime(new Date('2026-09-22T10:00:00.000Z'));
    const info = getElapsedInfo(baseOrder, Date.now());
    expect(info.text).toContain('En taller');
    expect(info.text).toContain('2d');
    expect(info.running).toBe(true);
    vi.useRealTimers();
  });

  it('avisa vencida si pasa la fecha prometida', () => {
    vi.setSystemTime(new Date('2026-09-25T10:00:00.000Z'));
    const info = getElapsedInfo(
      { ...baseOrder, fechaEntrega: '2026-09-21T10:00:00.000Z' },
      Date.now(),
    );
    expect(info.overdue).toBe(true);
    vi.useRealTimers();
  });

  it('congela el reloj en terminales', () => {
    const info = getElapsedInfo(
      { ...baseOrder, estado: 'entregada', updatedAt: '2026-09-21T10:00:00.000Z' },
      new Date('2026-09-30T10:00:00.000Z').getTime(),
    );
    expect(info.text).toContain('Duración total');
    expect(info.running).toBe(false);
  });
});
