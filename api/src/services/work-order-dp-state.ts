import { DP_STAGE_KEYS } from '@unithor/shared';
import { Op } from 'sequelize';

import { getDpConfiguration } from './dp-configuration.service.js';
import { WorkOrderDpStage } from '../models/WorkOrderDpStage.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { ApiError } from '../utils/ApiError.js';

import type { DpStageStatus } from '../models/WorkOrderDpStage.js';
import type { DpStageDefinition, ItemOperationalStatus } from '@unithor/shared';
import type { Transaction } from 'sequelize';

export async function ensureDpStagesForItems(workOrderId: number, items: WorkOrderItem[], transaction: Transaction): Promise<void> {
  const dpItems = items.filter((item) => item.division === 'DP');
  if (!dpItems.length) return;
  const existing = await WorkOrderDpStage.findAll({
    where: { workOrderItemId: dpItems.map((item) => item.id) }, transaction, lock: transaction.LOCK.UPDATE,
  });
  const initialized = new Set(existing.map((stage) => stage.workOrderItemId));
  let configuredStages: DpStageDefinition[] | undefined;
  for (const item of dpItems) {
    // Never rewrite or reorder a historical workflow, including a partially migrated one.
    if (initialized.has(item.id)) continue;
    let definitions = item.dpPricingSnapshot?.stages;
    if (!definitions) {
      configuredStages ??= (await getDpConfiguration(transaction)).configuration.stages;
      definitions = configuredStages;
    }
    if (definitions.length !== DP_STAGE_KEYS.length || new Set(definitions.map((stage) => stage.key)).size !== DP_STAGE_KEYS.length ||
      definitions.some((stage) => !DP_STAGE_KEYS.includes(stage.key))) {
      throw ApiError.badRequest('La plantilla D&P debe conservar sus cinco etapas obligatorias');
    }
    await WorkOrderDpStage.bulkCreate(definitions.map((stage, index) => ({
      workOrderId, workOrderItemId: item.id, stageIndex: index + 1,
      stageKey: stage.key, stageLabel: stage.label, allowedSpecialties: [...stage.specialties],
      status: 'pendiente' as const,
    })), { transaction });
  }
}

export async function getDpStages(itemId: number, transaction: Transaction): Promise<WorkOrderDpStage[]> {
  return WorkOrderDpStage.findAll({ where: { workOrderItemId: itemId }, order: [['stageIndex', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
}

export function assertDpStageReady(stage: WorkOrderDpStage, stages: WorkOrderDpStage[]): void {
  if (stage.stageIndex > 1) {
    const previous = stages.find((entry) => entry.stageIndex === stage.stageIndex - 1);
    if (!previous || previous.status !== 'completado') throw ApiError.badRequest(`Primero debe completarse la etapa anterior a "${stage.stageLabel}"`);
  }
}

/** A legacy request without an ID is accepted only when exactly one unfinished stage belongs to the worker. */
export async function findAssignedDpStage(item: WorkOrderItem, userId: number, stageId: number | undefined | null, transaction: Transaction): Promise<WorkOrderDpStage | null> {
  if (item.division !== 'DP') {
    if (stageId != null) throw ApiError.badRequest('La etapa seleccionada no corresponde a este servicio');
    return null;
  }
  const stages = await getDpStages(item.id, transaction);
  const candidates = stages.filter((stage) => stage.assignedUserId === userId && stage.status !== 'completado');
  const stage = stageId != null ? stages.find((entry) => entry.id === stageId) : candidates.length === 1 ? candidates[0] : undefined;
  if (!stage || stage.assignedUserId !== userId) throw ApiError.forbidden('Selecciona una etapa D&P asignada a este trabajador');
  if (stage.status === 'completado') throw ApiError.badRequest('El jefe debe reabrir esta etapa antes de registrar más actividad');
  assertDpStageReady(stage, stages);
  return stage;
}

export async function setDpStageStatus(stage: WorkOrderDpStage, status: DpStageStatus, transaction: Transaction, note?: string | null): Promise<void> {
  const stages = await getDpStages(stage.workOrderItemId, transaction);
  if (status !== 'pendiente') assertDpStageReady(stage, stages);
  const now = new Date();
  await stage.update({ status, startedAt: status === 'pendiente' ? null : (stage.startedAt ?? now),
    completedAt: status === 'completado' ? (stage.completedAt ?? now) : null,
    ...(note !== undefined ? { note: note?.trim() || null } : {}) }, { transaction });
  if (status === 'pendiente') {
    // Preserve technician notes and all recorded hours; later stages require execution again.
    await WorkOrderDpStage.update({ status: 'pendiente', startedAt: null, completedAt: null }, {
      where: { workOrderItemId: stage.workOrderItemId, stageIndex: { [Op.gt]: stage.stageIndex } }, transaction,
    });
  }
}

export async function refreshDpItemStatus(item: WorkOrderItem, transaction: Transaction): Promise<void> {
  const stages = await getDpStages(item.id, transaction);
  const complete = stages.length === DP_STAGE_KEYS.length && stages.every((stage) => stage.status === 'completado');
  const status = complete ? 'completado' : stages.some((stage) => stage.status !== 'pendiente') ? 'en_proceso' : 'pendiente';
  await item.update({ estadoOperativo: status }, { transaction });
}

export async function assertDpItemStatus(item: WorkOrderItem, status: ItemOperationalStatus | undefined, transaction: Transaction): Promise<void> {
  if (item.division !== 'DP' || status !== 'completado') return;
  const stages = await getDpStages(item.id, transaction);
  if (stages.length !== DP_STAGE_KEYS.length || stages.some((stage) => stage.status !== 'completado'))
    throw ApiError.badRequest('Completa las cinco etapas D&P antes de finalizar el trabajo');
}
