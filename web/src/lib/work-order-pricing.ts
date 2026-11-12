import { calculateQuotationPricing, getQuotationTaxBreakdown } from '@unithor/shared';

import type { WorkOrder } from '../types/entities';

/** The commercial mirror owns discounts; operational quantities and prices stay intact. */
export const getWorkOrderPricing = (order: WorkOrder) => {
  const pricing = calculateQuotationPricing(order.items ?? [], order);
  return { ...pricing, ...getQuotationTaxBreakdown(pricing.total) };
};

/** A loaded commercial summary already includes IVA. Never apply it twice. */
export const getWorkOrderTotal = (order: WorkOrder): number =>
  order.quotation?.total ?? getWorkOrderPricing(order).total;
