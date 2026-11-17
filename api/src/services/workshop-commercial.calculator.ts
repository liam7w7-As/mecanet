import { calculateQuotationPricing, getQuotationGrossTotal } from '@unithor/shared';

import type { WorkshopCommercialSnapshot } from '@unithor/shared';

export interface CommercialPriceLine {
  id: number; workOrderItemId: number | null; cantidad: number | string; precioUnitario: number | string;
  descuentoTipo: 'porcentaje' | 'fijo' | null; descuentoValor: number | string;
}

/** Allocate a general discount in cents once, preserving the exact net total. */
export function discountedLineNets(lines: CommercialPriceLine[], general: {
  descuentoTipo?: 'porcentaje' | 'fijo' | null; descuentoValor?: number | string;
}): Map<number, number> {
  const pricing = calculateQuotationPricing(lines, general);
  const weights = pricing.lines.map((line) => Math.round(line.subtotal * 100));
  const base = weights.reduce((a, b) => a + b, 0);
  const target = Math.round(pricing.total * 100);
  if (!base) return new Map(lines.map((line) => [line.id, 0]));
  const shares = weights.map((weight, index) => {
    const exact = target * weight / base;
    return { index, cents: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = target - shares.reduce((sum, share) => sum + share.cents, 0);
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (remaining-- <= 0) break;
    share.cents += 1;
  }
  return new Map(shares.map((share) => [lines[share.index]!.id, share.cents / 100]));
}

export const roundMetric = (value: number): number => Math.round((value + Math.sign(value) * Number.EPSILON) * 100) / 100;

/** Cash is read from the existing COT balance, never created/recalculated here. */
export function collectedServiceNet(quotedServiceNet: number, quotationNet: number, paidGross: number): number {
  const gross = getQuotationGrossTotal(quotationNet);
  if (gross <= 0) return 0;
  return roundMetric(quotedServiceNet * Math.min(1, Math.max(0, paidGross) / gross));
}

export function commercialSnapshot(input: {
  actualMinutes: number; theoreticalNet: number | null; quotedNet: number | null; receivedNet: number | null;
  actualCost: number | null; referenceHourlyRate?: number | null;
}): WorkshopCommercialSnapshot {
  const hours = input.actualMinutes / 60;
  const rate = input.referenceHourlyRate ?? (hours > 0 && input.theoreticalNet !== null ? input.theoreticalNet / hours : null);
  const usableRate = rate !== null && Number.isFinite(rate) && rate > 0 ? rate : null;
  const equivalent = usableRate !== null && input.quotedNet !== null ? input.quotedNet / usableRate : null;
  return {
    actualMinutes: input.actualMinutes,
    actualHours: roundMetric(hours), theoreticalNet: input.theoreticalNet,
    quotedNet: input.quotedNet, receivedNet: input.receivedNet,
    referenceHourlyRate: usableRate === null ? null : roundMetric(usableRate),
    equivalentQuotedHours: equivalent === null ? null : roundMetric(equivalent),
    equivalentReceivedHours: usableRate !== null && input.receivedNet !== null ? roundMetric(input.receivedNet / usableRate) : null,
    hoursDifference: equivalent === null ? null : roundMetric(equivalent - hours),
    netDifference: input.quotedNet !== null && input.theoreticalNet !== null ? roundMetric(input.quotedNet - input.theoreticalNet) : null,
    actualCost: input.actualCost,
    commercialMargin: input.quotedNet !== null && input.actualCost !== null ? roundMetric(input.quotedNet - input.actualCost) : null,
  };
}

export function totalCommercialSnapshots(rows: WorkshopCommercialSnapshot[]): WorkshopCommercialSnapshot {
  const sum = (key: 'theoreticalNet' | 'quotedNet' | 'receivedNet' | 'actualCost') =>
    rows.some((row) => row[key] === null) ? null : roundMetric(rows.reduce((value, row) => value + row[key]!, 0));
  const result = commercialSnapshot({ actualMinutes: rows.reduce((sum, row) => sum + (row.actualMinutes ?? row.actualHours * 60), 0),
    theoreticalNet: sum('theoreticalNet'), quotedNet: sum('quotedNet'), receivedNet: sum('receivedNet'), actualCost: sum('actualCost') });
  // Each service may use a different specialty/reference. Sum equivalent hours; never divide all sales by an arbitrary average.
  for (const key of ['equivalentQuotedHours', 'equivalentReceivedHours', 'hoursDifference'] as const) {
    result[key] = rows.some((row) => row[key] === null) ? null : roundMetric(rows.reduce((sum, row) => sum + row[key]!, 0));
  }
  return result;
}
