import { cn } from '../../lib/utils';

import type { QuotationStatus } from '@unithor/shared';

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  por_pagar: 'Por pagar',
  parcial: 'Abono parcial',
  total: 'Pagada total',
  por_verificar: 'Por verificar',
  ot_finalizado: 'OT finalizada',
};

const STATUS_STYLES: Record<QuotationStatus, string> = {
  por_pagar: 'text-brand-muted',
  parcial: 'bg-brand-pale text-brand-primaryInk ring-brand-line',
  total: 'bg-brand-mintPale text-brand-mintInk ring-brand-line',
  por_verificar: 'bg-purple-100 text-purple-800 ring-purple-200',
  ot_finalizado: 'bg-brand-ink text-white ring-brand-line/30',
};

interface QuotationStatusBadgeProps {
  status: QuotationStatus;
  className?: string;
}

export const QuotationStatusBadge = ({ status, className }: QuotationStatusBadgeProps) => (
  <span className={cn(status === 'por_pagar' ? 'text-sm font-normal' : 'inline-flex min-h-7 items-center whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', STATUS_STYLES[status], className)}>
    {QUOTATION_STATUS_LABELS[status]}
  </span>
);

export default QuotationStatusBadge;
