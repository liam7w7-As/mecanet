import { UNIT_MEASURE_LABELS } from '@unithor/shared';
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  CalendarClock,
  Car,
  ClipboardCheck,
  Download,
  FileText,
  Gauge,
  ListChecks,
  LoaderCircle,
  Phone,
  UserCog,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import WorkOrderStatusBadge from './WorkOrderStatusBadge';
import { useWorkOrder } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDate, formatDateTime } from '../../lib/formatters';
import {
  PROGRESS_TIER_STYLES,
  TASK_DOT_STYLES,
  getElapsedInfo,
  getWorkOrderProgress,
} from '../../lib/work-order-progress';

import type { WorkOrder } from '../../types/entities';
import type { CatalogType, ItemOperationalStatus } from '@unithor/shared';

const TYPE_LABELS: Record<CatalogType, string> = {
  parte: 'Repuestos',
  estandar: 'Estándar',
  especifico: 'Específicos',
};

const TYPE_ORDER: CatalogType[] = ['parte', 'estandar', 'especifico'];

const STATUS_LABELS: Record<ItemOperationalStatus, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  completado: 'Completado',
  omitido: 'Omitido',
};

const ENTRY_TYPE_LABELS: Record<string, string> = {
  primera: 'Primera visita',
  garantia: 'Garantía',
  reingreso: 'Reingreso',
};

interface WorkOrderQuickDetailModalProps {
  workOrderId: number;
  onClose: () => void;
  onPreviewPdf: (workOrder: WorkOrder) => void;
}

const SummaryRow = ({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string | null;
}) => (
  <div className="flex items-start gap-3">
    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
      {icon}
    </span>
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="truncate text-sm font-semibold text-slate-800">{value}</p>
      {hint && <p className="truncate text-xs text-slate-500">{hint}</p>}
    </div>
  </div>
);

const MetricTile = ({ label, value, hint, tone = 'text-slate-900' }: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) => (
  <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-0.5 text-base font-bold leading-tight ${tone}`}>{value}</p>
    {hint && <p className="truncate text-[11px] text-slate-500">{hint}</p>}
  </div>
);

export const WorkOrderQuickDetailModal = ({
  workOrderId,
  onClose,
  onPreviewPdf,
}: WorkOrderQuickDetailModalProps) => {
  const workOrderQuery = useWorkOrder(workOrderId);
  const workOrder = workOrderQuery.data;
  const now = Date.now();

  const grouped = useMemo(() => {
    const items = workOrder?.items ?? [];
    return TYPE_ORDER
      .map((type) => ({ type, items: items.filter((item) => item.tipoLinea === type) }))
      .filter((group) => group.items.length > 0);
  }, [workOrder?.items]);

  const progress = workOrder ? getWorkOrderProgress(workOrder) : null;
  const tier = progress ? PROGRESS_TIER_STYLES[progress.tier] : null;
  const elapsed = workOrder ? getElapsedInfo(workOrder, now) : null;
  const estimatedTotal = (workOrder?.items ?? []).reduce(
    (total, item) => total + Number(item.subtotal),
    0,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
      <button type="button" className="absolute inset-0 bg-slate-950/60" aria-label="Cerrar detalle" onClick={onClose} />
      <motion.section
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative max-h-full w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-order-quick-detail-title"
      >
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          {workOrderQuery.isPending && (
            <>
              <p className="text-xs font-semibold uppercase text-slate-500">Orden de trabajo</p>
              <h2 id="work-order-quick-detail-title" className="mt-0.5 text-xl font-bold text-brand-blue">
                Cargando detalle...
              </h2>
            </>
          )}
          {workOrder && (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  {ENTRY_TYPE_LABELS[workOrder.tipoIngreso ?? ''] ?? 'Orden de trabajo'}
                </p>
                <h2 id="work-order-quick-detail-title" className="mt-0.5 font-mono text-xl font-bold text-brand-blue">
                  {workOrder.codigo}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Ingreso {formatDate(workOrder.fechaIngreso)}
                  {workOrder.fechaEntrega ? ` · Entrega prometida ${formatDate(workOrder.fechaEntrega)}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <WorkOrderStatusBadge status={workOrder.estado} />
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                  onClick={onClose}
                  aria-label="Cerrar"
                  title="Cerrar"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </header>

        {workOrderQuery.isPending && (
          <div className="flex min-h-72 items-center justify-center text-brand-blue" role="status">
            <LoaderCircle className="h-7 w-7 animate-spin" aria-hidden="true" />
            <span className="sr-only">Cargando detalle de la orden</span>
          </div>
        )}

        {workOrderQuery.isError && (
          <div className="m-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {getApiErrorMessage(workOrderQuery.error, 'No fue posible cargar el detalle de la orden')}
          </div>
        )}

        {workOrder && progress && tier && elapsed && (
          <div className="space-y-5 p-5 sm:p-6">
            {workOrder.descripcion && (
              <p className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {workOrder.descripcion}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryRow
                icon={<Car className="h-4 w-4" aria-hidden="true" />}
                label="Vehículo"
                value={workOrder.vehicle?.patente ?? 'Sin patente'}
                hint={[workOrder.vehicle?.marca, workOrder.vehicle?.modelo].filter(Boolean).join(' ') || 'Sin datos'}
              />
              <SummaryRow
                icon={<UserRound className="h-4 w-4" aria-hidden="true" />}
                label="Cliente"
                value={workOrder.client?.nombre ?? 'Sin cliente'}
                hint={workOrder.client?.telefono ?? workOrder.client?.rut ?? null}
              />
              <SummaryRow
                icon={<UserCog className="h-4 w-4" aria-hidden="true" />}
                label="Mecánico responsable"
                value={workOrder.assignedMechanic?.nombre ?? 'Sin asignar'}
                hint={workOrder.assignedMechanic ? 'Ejecución técnica a su cargo' : 'Asignar desde el detalle completo'}
              />
              <SummaryRow
                icon={<Building2 className="h-4 w-4" aria-hidden="true" />}
                label="Facturación"
                value={workOrder.billing?.nombre ?? workOrder.billingClient?.nombre ?? 'Cliente de la orden'}
                hint={workOrder.billing?.rut ?? workOrder.billingClient?.rut ?? null}
              />
            </div>

            {workOrder.vehicleOwner && workOrder.vehicleOwner.nombre !== workOrder.client?.nombre && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Vehículo de <strong>{workOrder.vehicleOwner.nombre}</strong>
                  {workOrder.vehicleOwner.rut ? ` (${workOrder.vehicleOwner.rut})` : ''}, distinto del cliente de la orden.
                </span>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-4">
              <MetricTile
                label="Avance"
                value={progress.total === 0 ? '—' : `${progress.percent}%`}
                hint={`${progress.completed}/${progress.total} tareas`}
                tone={progress.percent === 100 ? 'text-emerald-700' : 'text-brand-blue'}
              />
              <MetricTile
                label="Tiempo en taller"
                value={elapsed.running ? elapsed.text.replace('En taller ', '') : elapsed.text.replace('Duración total: ', '')}
                hint={elapsed.overdue ? 'Entrega vencida' : workOrder.fechaEntrega ? `Entrega ${formatDate(workOrder.fechaEntrega)}` : 'Sin entrega prometida'}
                tone={elapsed.overdue ? 'text-red-700' : 'text-slate-900'}
              />
              <MetricTile
                label="Kilometraje"
                value={workOrder.kilometrajeIngreso === null ? '—' : `${Number(workOrder.kilometrajeIngreso).toLocaleString('es-CL')} km`}
                hint="Kilometraje de ingreso"
              />
              <MetricTile
                label="Total estimado"
                value={formatClp(estimatedTotal)}
                hint={workOrder.quotation ? `COT ${workOrder.quotation.estadoPago}` : 'Sin cotización espejo'}
                tone="text-brand-blue"
              />
            </div>

            {progress.total > 0 && (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                    <Gauge className="h-4 w-4" aria-hidden="true" /> Avance operativo
                  </p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tier.chip}`}>
                    {tier.label}
                  </span>
                </div>
                <div
                  className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress.percent}
                  aria-label={`Avance de ${workOrder.codigo}`}
                >
                  <div className={`h-full rounded-full ${tier.bar}`} style={{ width: `${progress.percent}%` }} />
                </div>
              </div>
            )}

            {grouped.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  <ListChecks className="h-4 w-4" aria-hidden="true" />
                  Trabajos y repuestos ({workOrder.items?.length ?? 0})
                </p>
                <div className="mt-3 space-y-4">
                  {grouped.map((group) => (
                    <div key={group.type} className="overflow-hidden rounded-lg border border-slate-200">
                      <div className="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                          {TYPE_LABELS[group.type]}
                        </p>
                        <p className="text-xs font-semibold text-slate-500">
                          {formatClp(group.items.reduce((sum, item) => sum + Number(item.subtotal), 0))}
                        </p>
                      </div>
                      <ul className="divide-y divide-slate-100">
                        {group.items.map((item) => (
                          <li key={item.id} className="flex items-start gap-3 px-3 py-2.5">
                            <span
                              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TASK_DOT_STYLES[item.estadoOperativo] ?? 'bg-slate-300'}`}
                              aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-800">{item.descripcion}</p>
                              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                                <span>
                                  {item.cantidad} {UNIT_MEASURE_LABELS[item.unidadMedida]?.toLowerCase() ?? item.unidadMedida}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{STATUS_LABELS[item.estadoOperativo]}</span>
                                {item.catalogItem?.codigo && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-mono">{item.catalogItem.codigo}</span>
                                  </>
                                )}
                              </p>
                              {item.notasOperativas && (
                                <p className="mt-1 text-xs italic text-slate-500">{item.notasOperativas}</p>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-semibold text-slate-800">{formatClp(item.subtotal)}</p>
                              <p className="text-[11px] text-slate-500">{formatClp(item.precioUnitario)} c/u</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between border-t-2 border-brand-blue pt-2 text-sm font-bold text-brand-blue">
                  <span>Total estimado</span>
                  <span>{formatClp(estimatedTotal)}</span>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 px-3 py-3">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" /> Inspección
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {workOrder.inspection ? 'Registrada' : 'Pendiente'}
                </p>
                {workOrder.inspection?.observaciones && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{workOrder.inspection.observaciones}</p>
                )}
              </div>
              <div className="rounded-lg border border-slate-200 px-3 py-3">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Cotización
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {workOrder.quotation?.codigo ?? 'Sin cotización'}
                </p>
                {workOrder.quotation && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {workOrder.quotation.estadoPago} · saldo {formatClp(workOrder.quotation.saldoPendiente)}
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-slate-200 px-3 py-3">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Entrega
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {workOrder.fechaEntrega ? formatDateTime(workOrder.fechaEntrega) : 'Sin fecha prometida'}
                </p>
                {workOrder.delivery && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Entregada {formatDateTime(workOrder.delivery.deliveredAt)}
                  </p>
                )}
              </div>
            </div>

            {workOrder.inspection?.inventario && workOrder.inspection.inventario.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                {workOrder.inspection.inventario.map((entry) => (
                  <span key={entry} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {entry}
                  </span>
                ))}
              </div>
            )}

            {workOrder.contact?.telefono && (
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <Phone className="h-4 w-4 text-slate-400" aria-hidden="true" />
                Contacto: {workOrder.contact.nombre} · {workOrder.contact.telefono}
              </p>
            )}

            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => onPreviewPdf(workOrder)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Vista previa PDF
              </button>
              <Link
                to={`/work-orders/${workOrder.id}`}
                onClick={onClose}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                Abrir detalle completo
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </footer>
          </div>
        )}
      </motion.section>
    </div>
  );
};

export default WorkOrderQuickDetailModal;
