import { describe, expect, it, vi } from 'vitest';

import { getCardColourTier, getElapsedInfo, getWorkOrderProgress } from '../work-order-progress';

import type { WorkOrder, WorkOrderItem } from '../../types/entities';
import type { ItemOperationalStatus } from '@unithor/shared';

const baseOrder = {
  estado: 'en_progreso',
  fechaIngreso: '2026-09-20T10:00:00.000Z',
  fechaEntrega: null,
  updatedAt: '2026-09-20T10:00:00.000Z',
} as Pick<WorkOrder, 'estado' | 'fechaIngreso' | 'fechaEntrega' | 'updatedAt'>;

const item = (estadoOperativo: ItemOperationalStatus, id: number): WorkOrderItem => ({
  id,
  catalogItemId: null,
  descripcion: `Tarea ${id}`,
  tipoLinea: 'estandar',
  unidadMedida: 'unidad',
  cantidad: 1,
  precioUnitario: 1000,
  subtotal: 1000,
  estadoOperativo,
  notasOperativas: null,
  horasHombreEstimadas: null,
  horasHombreReales: null,
  assignedUserId: null,
  laborValidatedBy: null,
  laborValidatedAt: null,
  laborValidationNote: null,
  stockConsumido: false,
  stockConsumidoCantidad: 0,
  stockConsumidoAt: null,
});

describe('getCardColourTier', () => {
  const now = Date.parse('2026-11-05T12:00:00.000Z');
  const recentOrder = {
    estado: 'en_progreso',
    fechaIngreso: '2026-11-03T12:00:00.000Z',
    updatedAt: '2026-11-03T12:00:00.000Z',
  } satisfies Pick<WorkOrder, 'estado' | 'fechaIngreso' | 'updatedAt'>;

  it('mantiene verde claro una OT reciente sin tareas, sin avance o con avance parcial', () => {
    for (const items of [undefined, [], [item('pendiente', 1)], [item('completado', 1), item('en_proceso', 2)]]) {
      expect(getCardColourTier({ ...recentOrder, items }, now)).toBe('active');
    }
  });

  it('muestra verde oscuro al completar todos los trabajos aunque siga iniciada y antigua', () => {
    expect(getCardColourTier({
      ...recentOrder,
      fechaIngreso: '2026-09-01T12:00:00.000Z',
      updatedAt: '2026-09-01T12:00:00.000Z',
      items: [item('completado', 1), item('completado', 2)],
    }, now)).toBe('done');
  });

  it('conserva los estados terminales por encima del avance del checklist', () => {
    expect(getCardColourTier({ ...recentOrder, estado: 'cancelada', items: [item('completado', 1)] }, now)).toBe('cancelled');
    expect(getCardColourTier({ ...recentOrder, estado: 'entregada', items: [item('completado', 1)] }, now)).toBe('delivered');
    expect(getCardColourTier({ ...recentOrder, estado: 'finalizada' }, now)).toBe('done');
  });

  it('los omitidos no penalizan el avance, pero omitir todas las tareas no equivale a completarlas', () => {
    expect(getCardColourTier({ ...recentOrder, items: [item('completado', 1), item('omitido', 2)] }, now)).toBe('done');
    expect(getCardColourTier({ ...recentOrder, items: [item('omitido', 1)] }, now)).toBe('active');
  });

  it('no muestra 100% ni verde oscuro mientras quede un trabajo pendiente, incluso con 200 tareas', () => {
    const items = [...Array.from({ length: 199 }, (_, i) => item('completado', i + 1)), item('pendiente', 200)];
    expect(getWorkOrderProgress({ ...recentOrder, items }).percent).toBe(99);
    expect(getCardColourTier({ ...recentOrder, items }, now)).toBe('active');
  });

  it('mantiene la espera amarilla mientras tenga trabajos pendientes', () => {
    expect(getCardColourTier({ ...recentOrder, estado: 'esperando_repuesto', items: [item('pendiente', 1)] }, now)).toBe('waiting');
    expect(getCardColourTier({ ...recentOrder, estado: 'esperando_repuesto', items: [item('completado', 1)] }, now)).toBe('done');
  });

  it('conserva las alertas por antigüedad y la gracia de actividad reciente en órdenes incompletas', () => {
    const items = [item('pendiente', 1)];
    expect(getCardColourTier({ ...recentOrder, fechaIngreso: '2026-10-15T12:00:00.000Z', items }, now)).toBe('warning');
    expect(getCardColourTier({ ...recentOrder, fechaIngreso: '2026-09-01T12:00:00.000Z', updatedAt: '2026-09-01T12:00:00.000Z', items }, now)).toBe('danger');
    expect(getCardColourTier({ ...recentOrder, fechaIngreso: '2026-09-01T12:00:00.000Z', lastWorkActivityAt: '2026-11-04T12:00:00.000Z', items }, now)).toBe('warning');
  });

  it('editar la cabecera no saca del rojo una OT de más de 30 días', () => {
    const editedOrder = { ...recentOrder, fechaIngreso: '2026-09-01T12:00:00.000Z', updatedAt: new Date(now).toISOString(), lastWorkActivityAt: null };
    expect(getCardColourTier(editedOrder, now)).toBe('danger');
    expect(getCardColourTier({ ...editedOrder, lastWorkActivityAt: '2026-10-31T12:00:00.000Z' }, now)).toBe('danger');
  });

  it('vuelve a rojo exactamente a las 48 horas del último trabajo sin reiniciar la antigüedad', () => {
    const order = { ...recentOrder, fechaIngreso: '2026-09-01T12:00:00.000Z', lastWorkActivityAt: new Date(now - 48 * 60 * 60 * 1000).toISOString() };
    expect(getCardColourTier(order, now - 1)).toBe('warning');
    expect(getCardColourTier(order, now)).toBe('danger');
    expect(order.fechaIngreso).toBe('2026-09-01T12:00:00.000Z');
  });

  it('respeta los límites de 20 y 30 días e ignora fechas de actividad inválidas o futuras', () => {
    const day = 86400000;
    const order = { ...recentOrder, fechaIngreso: new Date(now - 20 * day).toISOString() };
    expect(getCardColourTier(order, now)).toBe('active');
    expect(getCardColourTier(order, now + 1)).toBe('warning');
    expect(getCardColourTier({ ...order, fechaIngreso: new Date(now - 30 * day).toISOString() }, now)).toBe('warning');
    expect(getCardColourTier({ ...order, fechaIngreso: new Date(now - 30 * day).toISOString() }, now + 1)).toBe('danger');
    const old = { ...order, fechaIngreso: '2026-09-01T12:00:00.000Z' };
    expect(getCardColourTier({ ...old, lastWorkActivityAt: 'invalid' }, now)).toBe('danger');
    expect(getCardColourTier({ ...old, lastWorkActivityAt: new Date(now + day).toISOString() }, now)).toBe('danger');
  });
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
    const progress = getWorkOrderProgress({ estado: 'en_progreso', items: [] } as Pick<WorkOrder, 'estado' | 'items'>);
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
