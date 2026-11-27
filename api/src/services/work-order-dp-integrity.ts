import { hasWorkItemHistory } from './work-order-item-links.js';
import { ApiError } from '../utils/ApiError.js';

import type { WorkOrderItem } from '../models/WorkOrderItem.js';
import type { CatalogDivision, CatalogType, DpWorkQuote, ItemOperationalStatus } from '@unithor/shared';
import type { Transaction } from 'sequelize';

/** Prices, discounts, labels and configuration revisions do not change the work performed. */
export function hasDpTechnicalSelectionChanged(previous: DpWorkQuote | null, next: DpWorkQuote | null): boolean {
  const identity = (snapshot: DpWorkQuote | null): string | null => {
    if (!snapshot) return null;
    const selection = snapshot.selection;
    return JSON.stringify([
      selection.scope, selection.bodyTypeId, selection.sizeId,
      selection.pieceId ?? null, selection.positionId ?? null, selection.damageLevelId ?? null,
      selection.operations.map((operation) => operation.operationId).sort(),
    ]);
  };
  return identity(previous) !== identity(next);
}

interface DpItemUpdate {
  division: CatalogDivision;
  catalogItemId: number | null;
  tipoLinea: CatalogType;
  dpPricingSnapshot: DpWorkQuote | null;
  estadoOperativo?: ItemOperationalStatus;
}

export function assertNewDpItemPending(division: CatalogDivision, status: ItemOperationalStatus | undefined): void {
  if (division === 'DP' && status && status !== 'pendiente') {
    throw ApiError.badRequest('Los trabajos D&P nuevos deben iniciar con sus cinco etapas pendientes');
  }
}

/** Called under the OT lock before either side of the OT/COT mirror is changed. */
export async function assertDpItemIdentityUpdate(item: WorkOrderItem, next: DpItemUpdate, transaction: Transaction): Promise<boolean> {
  if (item.division !== 'DP' && next.division !== 'DP') return false;
  const selectionChanged = hasDpTechnicalSelectionChanged(item.dpPricingSnapshot ?? null, next.dpPricingSnapshot);
  const identityChanged = item.division !== next.division || item.catalogItemId !== next.catalogItemId || item.tipoLinea !== next.tipoLinea || selectionChanged;
  if (!identityChanged) return false;
  if (item.division !== 'DP') assertNewDpItemPending(next.division, next.estadoOperativo);
  if (
    item.estadoOperativo !== 'pendiente' || item.assignedUserId != null ||
    (item.ccfStatus != null && item.ccfStatus !== 'pendiente') || item.ccfReviewedAt != null ||
    item.qualityStatus !== 'pendiente' || await hasWorkItemHistory(item, transaction)
  ) {
    throw ApiError.badRequest(`No se puede sustituir el trabajo D&P "${item.descripcion}": ya tiene asignaciones o historial. Conserva esta línea y agrega un nuevo trabajo`);
  }
  return selectionChanged;
}
