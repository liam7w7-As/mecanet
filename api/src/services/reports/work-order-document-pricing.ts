import { calculateQuotationPricing, getQuotationTaxBreakdown } from '@unithor/shared';

import type { DiscountInput } from '@unithor/shared';

interface DocumentLine {
  id: number;
  catalogItemId?: number | null;
  tipoLinea: string;
  unidadMedida: string;
  descripcion: string;
  cantidad: number | string;
  precioUnitario: number | string;
}

interface DiscountLine extends DiscountInput {
  workOrderItemId?: number | null;
  catalogItemId?: number | null;
  tipoLinea: string;
  unidadMedida: string;
  descripcion: string;
}

const identity = (item: Pick<DocumentLine, 'catalogItemId' | 'tipoLinea' | 'unidadMedida' | 'descripcion'>): string =>
  JSON.stringify([item.catalogItemId ?? null, item.tipoLinea, item.unidadMedida, item.descripcion]);

/** OT lines own quantities/prices; their commercial mirror owns discounts. */
export function getWorkOrderDocumentPricing(
  items: readonly DocumentLine[],
  quotation?: (DiscountInput & { items?: readonly DiscountLine[] }) | null,
) {
  const quotationItems = quotation?.items ?? [];
  const linked = new Map(quotationItems.filter((item) => item.workOrderItemId != null)
    .map((item) => [item.workOrderItemId, item]));
  const pricing = calculateQuotationPricing(items.map((item) => {
    let discount = linked.get(item.id);
    if (!discount) {
      const key = identity(item);
      const matches = quotationItems.filter((line) => line.workOrderItemId == null && identity(line) === key);
      // Legacy documents without explicit links must never guess between duplicates.
      if (matches.length === 1 && items.filter((line) => identity(line) === key).length === 1) discount = matches[0];
    }
    return {
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
      descuentoTipo: discount?.descuentoTipo ?? null,
      descuentoValor: discount?.descuentoValor ?? 0,
    };
  }), quotation ?? {});
  return { pricing, tax: getQuotationTaxBreakdown(pricing.total) };
}
