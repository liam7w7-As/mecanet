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
  borrador: 'bg-brand-pale text-brand-ink ring-brand-line',
  en_progreso: 'bg-brand-pale text-brand-primaryInk ring-brand-line',
  esperando_repuesto: 'bg-brand-goldPale text-brand-goldInk ring-brand-line',
  finalizada: 'bg-brand-mintPale text-brand-mintInk ring-brand-line',
  entregada: 'bg-brand-mintPale text-brand-mintInk ring-brand-line',
  cancelada: 'bg-brand-coralPale text-brand-coralInk ring-brand-line',
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
