import {
  QUOTATION_ARCHIVE_DAYS,
  QUOTATION_LINKED_WARNING_DAYS,
  QUOTATION_UNLINKED_FADING_DAYS,
  QUOTATION_UNLINKED_WARNING_DAYS,
} from '@unithor/shared';

import type { Quotation } from '../types/entities';

export type QuotationAttention = {
  kind: 'linked' | 'unlinked' | 'fading';
  days: number;
} | null;

export const getQuotationAttention = (quotation: Quotation, now = Date.now()): QuotationAttention => {
  if (Number(quotation.pagado) >= Number(quotation.total)) return null;

  const latestActivity = Math.max(
    new Date(quotation.updatedAt).getTime(),
    quotation.workOrder?.updatedAt ? new Date(quotation.workOrder.updatedAt).getTime() : 0,
  );
  if (!Number.isFinite(latestActivity)) return null;
  const days = Math.max(0, Math.floor((now - latestActivity) / 86_400_000));

  if (quotation.workOrderId !== null) {
    return days >= QUOTATION_LINKED_WARNING_DAYS ? { kind: 'linked', days } : null;
  }
  if (quotation.estadoPago === 'por_pagar' && Number(quotation.pagado) === 0 && days >= QUOTATION_UNLINKED_FADING_DAYS && days < QUOTATION_ARCHIVE_DAYS) {
    return { kind: 'fading', days };
  }
  return days >= QUOTATION_UNLINKED_WARNING_DAYS ? { kind: 'unlinked', days } : null;
};
