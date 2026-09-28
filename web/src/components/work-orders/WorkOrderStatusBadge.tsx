import { cn } from '../../lib/utils';

import type { WorkOrderStatus } from '@unithor/shared';

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  borrador: 'Borrador',
  en_progreso: 'En progreso',
  esperando_repuesto: 'Esperando repuesto',
  finalizada: 'Finalizada',
  entregada: 'Entregada',
  cancelada: 'Cancelada',
};

const STATUS_STYLES: Record<WorkOrderStatus, string> = {
  borrador: 'bg-brand-pale text-brand-ink ring-slate-200',
  en_progreso: 'bg-brand-pale text-brand-primaryInk ring-brand-line',
  esperando_repuesto: 'bg-amber-100 text-brand-goldInk ring-amber-200',
  finalizada: 'bg-green-100 text-green-800 ring-green-200',
  entregada: 'bg-brand-mintPale text-emerald-900 ring-emerald-200',
  cancelada: 'bg-brand-coralPale text-brand-coralInk ring-red-200',
};

interface WorkOrderStatusBadgeProps {
  status: WorkOrderStatus;
  className?: string;
}

export const WorkOrderStatusBadge = ({ status, className }: WorkOrderStatusBadgeProps) => (
  <span
    className={cn(
      'inline-flex min-h-7 items-center whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
      STATUS_STYLES[status],
      className,
    )}
  >
    {WORK_ORDER_STATUS_LABELS[status]}
  </span>
);

export default WorkOrderStatusBadge;
