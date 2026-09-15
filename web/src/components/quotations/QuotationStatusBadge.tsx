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
  por_pagar: 'bg-amber-50 text-amber-800 ring-amber-200',
  parcial: 'bg-blue-100 text-brand-blue ring-blue-200',
  total: 'bg-emerald-100 text-emerald-900 ring-emerald-200',
  por_verificar: 'bg-purple-100 text-purple-800 ring-purple-200',
  ot_finalizado: 'bg-slate-800 text-white ring-slate-700',
};

interface QuotationStatusBadgeProps {
  status: QuotationStatus;
  className?: string;
}

export const QuotationStatusBadge = ({ status, className }: QuotationStatusBadgeProps) => (
  <span className={cn('inline-flex min-h-7 items-center whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', STATUS_STYLES[status], className)}>
    {QUOTATION_STATUS_LABELS[status]}
  </span>
);

export default QuotationStatusBadge;
