import { DP_STAGE_KEYS, DP_STAGE_LABELS, DP_STAGE_SPECIALTIES } from '@unithor/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ findAll: vi.fn(), bulkCreate: vi.fn(), update: vi.fn() }));
vi.mock('../../models/WorkOrderDpStage.js', () => ({ WorkOrderDpStage: db }));
vi.mock('../../models/WorkOrderItem.js', () => ({ WorkOrderItem: {} }));
vi.mock('../dp-configuration.service.js', () => ({ getDpConfiguration: vi.fn() }));

import { getDpConfiguration } from '../dp-configuration.service.js';
import { assertDpItemStatus, assertDpStageReady, ensureDpStagesForItems, findAssignedDpStage, refreshDpItemStatus, setDpStageStatus } from '../work-order-dp-state.js';

import type { WorkOrderDpStage } from '../../models/WorkOrderDpStage.js';
import type { WorkOrderItem } from '../../models/WorkOrderItem.js';
import type { DpConfigurationRecord, DpWorkQuote } from '@unithor/shared';
import type { Transaction } from 'sequelize';

const transaction = { LOCK: { UPDATE: 'UPDATE' } } as unknown as Transaction;
const item = () => ({ id: 42, division: 'DP', update: vi.fn(async function (this: Record<string, unknown>, data) { Object.assign(this, data); }) }) as unknown as WorkOrderItem;
function stage(index: number, status: 'pendiente' | 'en_proceso' | 'completado' = 'pendiente', userId = 7): WorkOrderDpStage {
  const row = { id: index, workOrderItemId: 42, stageIndex: index, stageLabel: `Etapa ${index}`, assignedUserId: userId, status,
    startedAt: null, completedAt: null, note: 'Conservar observación',
    update: vi.fn(async (data: object) => { Object.assign(row, data); }) };
  return row as unknown as WorkOrderDpStage;
}
describe('D&P: una secuencia compartida para modal y diario', () => {
  const stages = () => DP_STAGE_KEYS.map((key) => ({ key, label: DP_STAGE_LABELS[key], specialties: [...DP_STAGE_SPECIALTIES[key]] }));
  beforeEach(() => {
    vi.clearAllMocks();
    db.findAll.mockResolvedValue([]);
    vi.mocked(getDpConfiguration).mockResolvedValue({ configuration: { stages: stages() } } as DpConfigurationRecord);
  });
  it('usa índices 1-5 y no permite avanzar sin predecesor', () => {
    expect(() => assertDpStageReady(stage(1), [])).not.toThrow();
    expect(() => assertDpStageReady(stage(3), [stage(1, 'completado'), stage(2)])).toThrow('Primero');
    expect(() => assertDpStageReady(stage(3), [])).toThrow('Primero');
  });
  it('inicializa cinco etapas por pieza D&P, nunca por un repuesto', async () => {
    await ensureDpStagesForItems(3, [item(), { id: 43, division: 'ACC' } as WorkOrderItem], transaction);
    expect(db.bulkCreate.mock.calls[0][0]).toHaveLength(5);
    expect(db.bulkCreate.mock.calls[0][0].map((entry: { stageIndex: number }) => entry.stageIndex)).toEqual([1, 2, 3, 4, 5]);
    expect(db.bulkCreate.mock.calls[0][0][0]).toMatchObject({ stageKey: 'armador_desarme', allowedSpecialties: ['armador'] });
    expect(getDpConfiguration).toHaveBeenCalledWith(transaction);
  });
  it('no reordena ni sobrescribe etapas históricas al cambiar la configuración', async () => {
    db.findAll.mockResolvedValue([stage(1, 'en_proceso')]);
    await ensureDpStagesForItems(3, [item()], transaction);
    expect(db.bulkCreate).not.toHaveBeenCalled();
    expect(getDpConfiguration).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
  it('usa la plantilla aceptada en la cotización, aunque la configuración vigente tenga otra etiqueta u orden', async () => {
    const piece = item();
    const accepted = stages().reverse();
    accepted[0] = { ...accepted[0], label: 'Terminación especializada de la pieza con acabado aprobado por el cliente', specialties: ['acabado especial'] };
    piece.dpPricingSnapshot = { stages: accepted } as DpWorkQuote;
    await ensureDpStagesForItems(3, [piece], transaction);
    expect(db.bulkCreate.mock.calls[0][0][0]).toMatchObject({ stageIndex: 1, stageKey: 'detailer', stageLabel: accepted[0].label, allowedSpecialties: ['acabado especial'] });
    expect(getDpConfiguration).not.toHaveBeenCalled();
    expect(piece.dpPricingSnapshot.stages[0].specialties).toEqual(['acabado especial']);
  });
  it('no modifica piezas ya iniciadas al incorporar un nuevo trabajo con la plantilla vigente', async () => {
    db.findAll.mockResolvedValue([stage(1, 'en_proceso')]);
    const custom = stages();
    custom[0].specialties = ['técnico de desmontaje'];
    vi.mocked(getDpConfiguration).mockResolvedValue({ configuration: { stages: custom } } as DpConfigurationRecord);
    await ensureDpStagesForItems(3, [item(), { id: 43, division: 'DP' } as WorkOrderItem], transaction);
    const created = db.bulkCreate.mock.calls[0][0] as Array<{ workOrderItemId: number; allowedSpecialties: string[] }>;
    expect(created.every((row) => row.workOrderItemId === 43)).toBe(true);
    expect(created[0].allowedSpecialties).toEqual(['técnico de desmontaje']);
    expect(db.update).not.toHaveBeenCalled();
  });
  it('no elimina la obligación de los cinco pasos si recibe un snapshot incompleto', async () => {
    const piece = item();
    piece.dpPricingSnapshot = { stages: stages().slice(0, 4) } as DpWorkQuote;
    await expect(ensureDpStagesForItems(3, [piece], transaction)).rejects.toThrow('cinco etapas');
    expect(db.bulkCreate).not.toHaveBeenCalled();
  });
  it('no permite terminar pintor desde el diario si preparación está pendiente', async () => {
    db.findAll.mockResolvedValue([stage(1, 'completado'), stage(2), stage(3)]);
    await expect(findAssignedDpStage(item(), 7, 3, transaction)).rejects.toThrow('Primero');
  });
  it('no permite actuar en la etapa de otro trabajador', async () => {
    db.findAll.mockResolvedValue([stage(1, 'pendiente', 8)]);
    await expect(findAssignedDpStage(item(), 7, 1, transaction)).rejects.toThrow('asignada');
  });
  it('exige selección explícita si el armador tiene desarme y montaje', async () => {
    db.findAll.mockResolvedValue([stage(1), stage(4)]);
    await expect(findAssignedDpStage(item(), 7, undefined, transaction)).rejects.toThrow('Selecciona');
    await expect(findAssignedDpStage(item(), 7, 1, transaction)).resolves.toHaveProperty('id', 1);
  });
  it('reabrir invalida las etapas posteriores sin borrar notas ni horas', async () => {
    const row = stage(2, 'completado');
    db.findAll.mockResolvedValue([stage(1, 'completado'), row]);
    await setDpStageStatus(row, 'pendiente', transaction);
    expect(row.note).toBe('Conservar observación');
    expect(db.update.mock.calls[0][0]).toEqual({ status: 'pendiente', startedAt: null, completedAt: null });
    expect(row.completedAt).toBeNull();
  });
  it('calidad requiere las cinco etapas completas, incluso si falta una fila', async () => {
    db.findAll.mockResolvedValue([stage(1, 'completado')]);
    await expect(assertDpItemStatus(item(), 'completado', transaction)).rejects.toThrow('cinco etapas');
    db.findAll.mockResolvedValue([1, 2, 3, 4, 5].map((index) => stage(index, 'completado')));
    await expect(assertDpItemStatus(item(), 'completado', transaction)).resolves.toBeUndefined();
  });
  it('el progreso de la pieza se completa únicamente con cinco etapas', async () => {
    const piece = item();
    db.findAll.mockResolvedValue([stage(1, 'completado')]);
    await refreshDpItemStatus(piece, transaction);
    expect(piece.estadoOperativo).toBe('en_proceso');
    db.findAll.mockResolvedValue([1, 2, 3, 4, 5].map((index) => stage(index, 'completado')));
    await refreshDpItemStatus(piece, transaction);
    expect(piece.estadoOperativo).toBe('completado');
  });
});
