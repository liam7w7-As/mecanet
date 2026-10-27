import { PURCHASE_TAX_RATE } from '../constants/purchases.js';

export interface PurchasePricingItem {
  cantidad: number;
  precioUnitario: number;
}

export interface PurchasePricingResult {
  neto: number;
  iva: number;
  total: number;
  /** Subtotal de cada ítem, en el mismo orden recibido. */
  subtotales: number[];
}

const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Precios unitarios netos. El IVA se calcula una sola vez sobre el neto total
 * para que el documento calce con la suma de las líneas.
 */
export const calculatePurchaseTotals = (
  items: readonly PurchasePricingItem[],
  conIva: boolean,
): PurchasePricingResult => {
  const subtotales = items.map((item) =>
    roundMoney(Math.max(0, Number(item.cantidad) || 0) * Math.max(0, Number(item.precioUnitario) || 0)),
  );
  const neto = roundMoney(subtotales.reduce((sum, subtotal) => sum + subtotal, 0));
  const iva = conIva ? roundMoney(neto * PURCHASE_TAX_RATE) : 0;

  return {
    neto,
    iva,
    total: roundMoney(neto + iva),
    subtotales,
  };
};

/**
 * Un proveedor se considera completo cuando tiene nombre, RUT y al menos un
 * canal de contacto. Mientras no lo esté, queda marcado para que el admin lo
 * complete después.
 */
export const isSupplierDataComplete = (
  supplier: {
    nombre?: string | null;
    rut?: string | null;
    telefono?: string | null;
    email?: string | null;
  },
): boolean =>
  Boolean(supplier.nombre?.trim() && supplier.rut?.trim() && (supplier.telefono?.trim() || supplier.email?.trim()));

export const formatPurchaseCode = (sequence: number): string =>
  `COMP-${String(Math.max(0, Math.trunc(sequence))).padStart(6, '0')}`;
