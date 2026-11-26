import { ApiError } from '../utils/ApiError.js';

import type { WorkOrderItem } from '../models/WorkOrderItem.js';

/** Allocate the general discount proportionally, so it cannot bypass the purchase markup. */
export function assertPurchaseSaleFloors(
  items: Array<Pick<WorkOrderItem, 'descripcion' | 'cantidad' | 'minimumSalePrice'>>,
  pricing: { lines: Array<{ subtotal: number }>; total: number },
): void {
  const base = pricing.lines.reduce((sum, line) => sum + line.subtotal, 0);
  const factor = base > 0 ? pricing.total / base : 0;
  for (const [index, item] of items.entries()) {
    if (item.minimumSalePrice == null) continue;
    const actual = Math.round((pricing.lines[index]?.subtotal ?? 0) * factor * 100);
    const minimum = Math.round(Number(item.minimumSalePrice) * Number(item.cantidad) * 100);
    if (actual < minimum)
      throw ApiError.badRequest(
        `La venta de "${item.descripcion}" debe mantener el mínimo del 25% sobre su compra, también después de descuentos`,
      );
  }
}
