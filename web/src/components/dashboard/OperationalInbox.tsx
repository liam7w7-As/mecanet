import {
  ArrowRight,
  BadgeDollarSign,
  BellRing,
  ClipboardCheck,
  PackageCheck,
  PackageX,
  ReceiptText,
  Wrench,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { getRoleLabel } from '../../lib/permissions';

import type { DashboardSummary, OperationalTaskType } from '@unithor/shared';
import type { LucideIcon } from 'lucide-react';

interface OperationalInboxProps {
  inbox: DashboardSummary['operationalInbox'];
}

/**
 * Tinte de cada tipo de tarea. Se eligen los fondos tenues y los colores de
 * texto del diseño (`--pale`, `--mint-pale`, `--gold-pale`, `--coral-pale`,
 * `--blue-pale`) en vez de la escala `slate`/`emerald` de Tailwind, para que la
 * bandeja se lea como parte de la misma paleta que el shell.
 */
const taskPresentation: Record<
  OperationalTaskType,
  { icon: LucideIcon; iconClassName: string; action: string }
> = {
  work_order_approval: {
    icon: ClipboardCheck,
    iconClassName: 'bg-brand-goldPale text-brand-goldInk',
    action: 'Revisar',
  },
  warehouse_delivery: {
    icon: PackageCheck,
    iconClassName: 'bg-brand-bluePale text-brand-cyanInk',
    action: 'Despachar',
  },
  assigned_work_order: {
    icon: Wrench,
    iconClassName: 'bg-brand-pale text-brand-primaryInk',
    action: 'Abrir OT',
  },
  payment_verification: {
    icon: BadgeDollarSign,
    iconClassName: 'bg-brand-mintPale text-[#00cdae]',
    action: 'Verificar',
  },
  quotation_follow_up: {
    icon: ReceiptText,
    iconClassName: 'bg-brand-pale text-brand-primaryInk',
    action: 'Gestionar',
  },
  stock_alert: {
    icon: PackageX,
    iconClassName: 'bg-brand-coralPale text-brand-coralInk',
    action: 'Revisar stock',
  },
};

const countLabels: Array<{
  key: keyof DashboardSummary['operationalInbox']['counts'];
  label: string;
}> = [
  { key: 'approvals', label: 'Por aprobar' },
  { key: 'warehouseDeliveries', label: 'Por entregar' },
  { key: 'assignedWorkOrders', label: 'OT asignadas' },
  { key: 'paymentVerifications', label: 'Abonos por verificar' },
  { key: 'quotationFollowUps', label: 'COT sin OT' },
  { key: 'stockAlerts', label: 'Stock crítico' },
];

const formatTaskDate = (value: string): string =>
  new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

export const OperationalInbox = ({ inbox }: OperationalInboxProps) => {
  const visibleCounts = countLabels.filter(({ key }) => inbox.counts[key] > 0);

  return (
    <section className="view-panel" aria-labelledby="operational-inbox-title">
      <div className="view-panel-title flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-white">
            <BellRing className="h-5 w-5" aria-hidden="true" />
            {/* `bg-brand-coralInk` y no `bg-brand-coral`: el badge lleva texto
                blanco de 11px y el coral claro solo da 2.3:1. */}
            {inbox.total > 0 && <span className="absolute -right-1.5 -top-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-brand-coralInk px-1 text-[11px] font-semibold text-white">{inbox.total > 99 ? '99+' : inbox.total}</span>}
          </span>
          <div className="min-w-0">
            <h2 id="operational-inbox-title" className="text-base font-semibold text-brand-ink">Tu bandeja operativa</h2>
            <p className="truncate text-sm text-brand-muted">Prioridades para {getRoleLabel(inbox.role)}</p>
          </div>
        </div>
        {visibleCounts.length > 0 && (
          <div className="flex max-w-full flex-wrap gap-2 sm:justify-end">
            {visibleCounts.map(({ key, label }) => (
              <span key={key} className="status-chip round whitespace-nowrap">
                {inbox.counts[key]} {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {inbox.items.length === 0 ? (
        <div className="flex flex-col items-center px-5 py-9 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-mintPale text-[#00cdae]">
            <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-semibold text-brand-ink">Todo al día por ahora</p>
          <p className="mt-1 text-sm text-brand-muted">No tienes acciones pendientes para tu rol.</p>
        </div>
      ) : (
        <div className="grid divide-y divide-brand-line lg:grid-cols-2 lg:divide-y-0">
          {inbox.items.map((task, index) => {
            const presentation = taskPresentation[task.type];
            const Icon = presentation.icon;
            return (
              <Link
                key={task.id}
                to={task.href}
                className={`group flex min-w-0 items-center gap-3 px-4 py-3.5 transition-colors hover:bg-brand-pale ${index >= 2 ? 'lg:border-t lg:border-brand-line' : ''} ${index % 2 === 1 ? 'lg:border-l lg:border-brand-line' : ''}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${presentation.iconClassName}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold text-brand-ink">{task.title}</span>
                    {task.priority === 'high' && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-coral" title="Prioridad alta" />}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-brand-muted">{task.description} · {formatTaskDate(task.createdAt)}</span>
                </span>
                <span className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-brand-primaryInk sm:flex">
                  {presentation.action}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default OperationalInbox;
