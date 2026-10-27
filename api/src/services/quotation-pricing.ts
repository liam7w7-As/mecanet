import { calculateQuotationPricing } from '@unithor/shared';

import { ApiError } from '../utils/ApiError.js';

import type { DiscountInput, DiscountType, QuotationPriceLine } from '@unithor/shared';

export const priceQuotation = (items: readonly QuotationPriceLine[], discount: DiscountInput = {}) => {
  try { return calculateQuotationPricing(items, discount); } catch (error) {
    throw ApiError.badRequest(error instanceof Error ? error.message : 'Descuento inválido');
  }
};

interface MatchingLine extends DiscountInput {
  id?: number;
  workOrderItemId?: number | null;
  catalogItemId?: number | null;
  descripcion: string;
  tipoLinea: string;
}

// Operational editors replace lines; keep commercial discounts unless explicitly changed.
export function preserveLineDiscounts<T extends MatchingLine>(items: T[], previous: MatchingLine[]): Array<T & { descuentoTipo: DiscountType | null; descuentoValor: number }> {
  const remaining = [...previous];
  return items.map((item) => {
    let match = remaining.findIndex((old) => (item.workOrderItemId != null
      ? old.workOrderItemId === item.workOrderItemId
      : item.id !== undefined ? old.id === item.id : old.tipoLinea === item.tipoLinea &&
      (item.catalogItemId != null ? old.catalogItemId === item.catalogItemId : old.catalogItemId == null && old.descripcion === item.descripcion)));
    if (match < 0) {
      match = remaining.findIndex((old) => old.tipoLinea === item.tipoLinea &&
        (item.catalogItemId != null ? old.catalogItemId === item.catalogItemId : old.catalogItemId == null && old.descripcion === item.descripcion));
    }
    const old = match < 0 ? undefined : remaining.splice(match, 1)[0];
    return {
      ...item,
      descuentoTipo: item.descuentoTipo === undefined ? old?.descuentoTipo ?? null : item.descuentoTipo,
      descuentoValor: Number(item.descuentoValor === undefined ? old?.descuentoValor ?? 0 : item.descuentoValor),
    };
  });
}
