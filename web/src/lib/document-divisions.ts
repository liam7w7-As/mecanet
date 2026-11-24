import { CATALOG_DIVISIONS } from '@unithor/shared';

import type { CatalogDivision, CatalogSubtype } from '@unithor/shared';

interface DivisionSource {
  division?: CatalogDivision | null;
  subtipo?: CatalogSubtype | null;
  tipoLinea?: string;
  catalogItem?: { division?: CatalogDivision | null; subtipo?: CatalogSubtype | null; tipo?: string } | null;
}

export const DOCUMENT_DIVISION_LABELS: Record<CatalogDivision, string> = {
  DP: 'D&P - Desabolladura y pintura',
  ACC: 'ACC - Accesorios y repuestos',
  MEC: 'MEC - Mecánica',
};

// A document uses the line's classification, not a later change to its catalogue.
// Legacy lines without division metadata keep the original parts/services mapping.
export function getDocumentDivision(item: DivisionSource): CatalogDivision {
  if (item.division) return item.division;
  const subtype = item.subtipo ?? item.catalogItem?.subtipo;
  if (subtype === 'servicio_dp') return 'DP';
  if (subtype === 'en_stock' || subtype === 'a_pedido') return 'ACC';
  if (subtype === 'estandar' || subtype === 'especifico') return 'MEC';
  return item.catalogItem?.division ?? ((item.tipoLinea ?? item.catalogItem?.tipo) === 'parte' ? 'ACC' : 'MEC');
}

export function groupDocumentItems<T extends DivisionSource>(
  items: readonly T[],
  netSubtotal: (item: T, index: number) => number,
) {
  const lines = items.map((item, originalIndex) => ({ item, originalIndex, division: getDocumentDivision(item) }));
  return CATALOG_DIVISIONS.flatMap((division) => {
    const grouped = lines.filter((line) => line.division === division);
    return grouped.length ? [{
      division,
      label: DOCUMENT_DIVISION_LABELS[division],
      lines: grouped,
      // Line discounts are already included. The general discount and IVA stay
      // in the existing financial summary, without allocating or applying twice.
      subtotal: grouped.reduce((sum, line) => sum + netSubtotal(line.item, line.originalIndex), 0),
    }] : [];
  });
}
