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

const taskPresentation: Record<
  OperationalTaskType,
  { icon: LucideIcon; iconClassName: string; action: string }
> = {
  work_order_approval: {
    icon: ClipboardCheck,
    iconClassName: 'bg-amber-100 text-amber-800',
    action: 'Revisar',
  },
  warehouse_delivery: {
    icon: PackageCheck,
    iconClassName: 'bg-blue-100 text-brand-blue',
    action: 'Despachar',
  },
  assigned_work_order: {
    icon: Wrench,
    iconClassName: 'bg-slate-100 text-brand-blue',
    action: 'Abrir OT',
  },
  payment_verification: {
    icon: BadgeDollarSign,
    iconClassName: 'bg-emerald-100 text-emerald-700',
    action: 'Verificar',
  },
  quotation_follow_up: {
    icon: ReceiptText,
    iconClassName: 'bg-violet-100 text-violet-700',
    action: 'Gestionar',
  },
  stock_alert: {
    icon: PackageX,
    iconClassName: 'bg-red-100 text-red-700',
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
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" aria-labelledby="operational-inbox-title">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-blue text-white">
            <BellRing className="h-5 w-5" aria-hidden="true" />
            {inbox.total > 0 && <span className="absolute -right-1.5 -top-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-brand-yellow px-1 text-[11px] font-bold text-brand-dark">{inbox.total > 99 ? '99+' : inbox.total}</span>}
          </span>
          <div className="min-w-0">
            <h2 id="operational-inbox-title" className="font-semibold text-brand-blue">Tu bandeja operativa</h2>
            <p className="truncate text-xs text-slate-500">Prioridades para {getRoleLabel(inbox.role)}</p>
          </div>
        </div>
        {visibleCounts.length > 0 && (
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:justify-end sm:overflow-visible sm:pb-0">
            {visibleCounts.map(({ key, label }) => (
              <span key={key} className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {inbox.counts[key]} {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {inbox.items.length === 0 ? (
        <div className="flex flex-col items-center px-5 py-9 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-700">Todo al día por ahora</p>
          <p className="mt-1 text-xs text-slate-500">No tienes acciones pendientes para tu rol.</p>
        </div>
      ) : (
        <div className="grid divide-y divide-slate-100 lg:grid-cols-2 lg:divide-y-0">
          {inbox.items.map((task, index) => {
            const presentation = taskPresentation[task.type];
            const Icon = presentation.icon;
            return (
              <Link
                key={task.id}
                to={task.href}
                className={`group flex min-w-0 items-center gap-3 border-slate-100 px-4 py-3.5 transition-colors hover:bg-slate-50 sm:px-5 ${index >= 2 ? 'lg:border-t' : ''} ${index % 2 === 1 ? 'lg:border-l' : ''}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${presentation.iconClassName}`}>
                  <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-800">{task.title}</span>
                    {task.priority === 'high' && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" title="Prioridad alta" />}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{task.description} · {formatTaskDate(task.createdAt)}</span>
                </span>
                <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-brand-blue sm:flex">
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
