import { Transaction } from 'sequelize';

import { QuotationItem } from '../models/QuotationItem.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderItemProgressEvent } from '../models/WorkOrderItemProgressEvent.js';
import { WorkOrderItemSession } from '../models/WorkOrderItemSession.js';
import { WorkOrderObservation } from '../models/WorkOrderObservation.js';
import { WorkOrderPriceSuggestion } from '../models/WorkOrderPriceSuggestion.js';
import { ApiError } from '../utils/ApiError.js';

interface ItemIdentity {
  catalogItemId?: number | null;
  descripcion: string;
  tipoLinea: string;
  unidadMedida: string;
}

export const itemIdentity = (item: ItemIdentity): string =>
  JSON.stringify([item.catalogItemId ?? null, item.tipoLinea, item.unidadMedida, item.descripcion]);

// Old documents have no link. Only unambiguous matches may acquire one;
// guessing by position could move one mechanic's hours onto another service.
export const ensureQuotationItemLinks = async (
  quotationId: number,
  workOrderId: number,
  transaction: Transaction,
): Promise<{ quotationItems: QuotationItem[]; workOrderItems: WorkOrderItem[] }> => {
  const workOrderItems = await WorkOrderItem.findAll({
    where: { workOrderId },
    order: [['id', 'ASC']],
    transaction,
    lock: Transaction.LOCK.UPDATE,
  });
  const quotationItems = await QuotationItem.findAll({
    where: { quotationId },
    order: [['id', 'ASC']],
    transaction,
    lock: Transaction.LOCK.UPDATE,
  });
  const used = new Set<number>();
  for (const line of quotationItems) {
    if (line.workOrderItemId == null) continue;
    if (
      used.has(line.workOrderItemId) ||
      !workOrderItems.some((item) => item.id === line.workOrderItemId)
    ) {
      throw ApiError.badRequest('La vinculación de los trabajos de la cotización no es válida');
    }
    used.add(line.workOrderItemId);
  }
  const unlinked = quotationItems.filter((line) => line.workOrderItemId == null);
  for (const line of unlinked) {
    const key = itemIdentity(line);
    const matches = workOrderItems.filter(
      (item) => !used.has(item.id) && itemIdentity(item) === key,
    );
    if (
      matches.length > 1 ||
      (matches.length > 0 && unlinked.filter((other) => itemIdentity(other) === key).length > 1)
    ) {
      throw ApiError.badRequest(
        `La vinculación de "${line.descripcion}" es ambigua: hay trabajos antiguos duplicados. No se modificaron sus horas ni su historial`,
      );
    }
    if (matches.length !== 1) continue;
    await line.update({ workOrderItemId: matches[0].id }, { transaction });
    used.add(matches[0].id);
  }
  return { quotationItems, workOrderItems };
};

export const assertWorkItemsRemovable = async (
  items: WorkOrderItem[],
  transaction: Transaction,
): Promise<void> => {
  for (const item of items) {
    const where = { workOrderItemId: item.id };
    const counts = await Promise.all([
      WorkOrderItemSession.count({ where, transaction }),
      WorkOrderItemProgressEvent.count({ where, transaction }),
      WorkOrderObservation.count({ where, transaction }),
      WorkOrderPriceSuggestion.count({ where, transaction }),
    ]);
    if (
      item.horasHombreReales !== null ||
      item.laborValidatedAt !== null ||
      counts.some((count) => count > 0)
    ) {
      throw ApiError.badRequest(
        `No se puede quitar "${item.descripcion}": ya tiene horas o historial de trabajo registrado`,
      );
    }
  }
};
