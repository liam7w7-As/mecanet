import { calculateDpWorkQuote, calculateQuotationPricing } from '@unithor/shared';

import type { DpQuotationLine } from './dp-quotation-recovery';
import type { DiscountInput, DpConfiguration, DpQuoteInput, QuotationPriceLine } from '@unithor/shared';

const detail = (error: unknown) => error instanceof Error ? error.message : 'Revisa la tarifa y los descuentos.';

export function previewDpQuotationPricing(items: readonly QuotationPriceLine[], discount: DiscountInput = {}) {
  try {
    return { pricing: calculateQuotationPricing(items, discount), error: '' };
  } catch (error) {
    return { pricing: null, error: detail(error) };
  }
}

/** Prepare the entire change without mutating or dropping any existing line. */
export function reclassifyDpQuotation({ configuration, revision, items, bodyTypeId, sizeId, discount, editor }: {
  configuration: DpConfiguration;
  revision: number;
  items: readonly DpQuotationLine[];
  bodyTypeId: string;
  sizeId: string;
  discount: DiscountInput;
  editor?: { pieceKey: string | null; selection: DpQuoteInput | null; discount: DiscountInput };
}): { ok: true; items: DpQuotationLine[] } | { ok: false; error: string } {
  const body = configuration.bodyTypes.find((entry) => entry.id === bodyTypeId && entry.active);
  if (!body?.sizes.some((entry) => entry.id === sizeId && entry.active)) {
    return { ok: false, error: 'La carrocería o el tamaño no están disponibles. Se conservó la clasificación anterior.' };
  }

  const nextItems: DpQuotationLine[] = [];
  for (const line of items) {
    if (line.division !== 'DP' || !line.dpPricing) {
      nextItems.push(line);
      continue;
    }
    try {
      const quote = calculateDpWorkQuote(configuration, { ...line.dpPricing, configurationRevision: revision, bodyTypeId, sizeId }, revision);
      const nextLine = { ...line, precioUnitario: String(quote.precioUnitario), dpPricing: quote.selection, dpPricingSnapshot: quote };
      calculateQuotationPricing([nextLine]);
      nextItems.push(nextLine);
    } catch (error) {
      return { ok: false, error: `No se cambió la clasificación: «${line.descripcion}». ${detail(error)} Revisa su descuento o quita esta línea antes de intentar nuevamente.` };
    }
  }

  if (editor) {
    const [pieceId, positionId] = editor.pieceKey?.split(':') ?? [];
    const label = configuration.pieces.find((piece) => piece.id === pieceId)?.label ?? pieceId;
    if (pieceId && !configuration.rates.some((rate) => rate.active && rate.bodyTypeId === bodyTypeId && rate.pieceId === pieceId && rate.positionId === positionId)) {
      return { ok: false, error: `No se cambió la clasificación: la pieza en edición «${label}» no está disponible. Conserva la clasificación o limpia el editor antes de cambiar.` };
    }
    if (editor.selection) {
      try {
        const quote = calculateDpWorkQuote(configuration, { ...editor.selection, configurationRevision: revision, bodyTypeId, sizeId }, revision);
        calculateQuotationPricing([{ cantidad: 1, precioUnitario: quote.precioUnitario,
          descuentoTipo: editor.discount.descuentoTipo, descuentoValor: editor.discount.descuentoValor }]);
      } catch (error) {
        return { ok: false, error: `No se cambió la clasificación: revisa la pieza o servicio en edición${label ? ` «${label}»` : ''}. ${detail(error)}` };
      }
    }
  }

  const preview = previewDpQuotationPricing(nextItems, discount);
  if (preview.error) return { ok: false, error: `No se cambió la clasificación. Revisa el descuento general y los importes: ${preview.error}` };
  return { ok: true, items: nextItems };
}
