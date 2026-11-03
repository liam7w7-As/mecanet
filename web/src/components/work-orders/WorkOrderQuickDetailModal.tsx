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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';

import WorkOrderMechanicPanel from './WorkOrderMechanicPanel';
import WorkOrderStatusBadge from './WorkOrderStatusBadge';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import { useWorkOrder } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDate, formatDateTime } from '../../lib/formatters';
import {
  PROGRESS_TIER_STYLES,
  TASK_DOT_STYLES,
  getElapsedInfo,
  getWorkOrderProgress,
} from '../../lib/work-order-progress';
import { useAuthStore } from '../../stores/auth.store';
import CustomerEmailPanel from '../common/CustomerEmailPanel';
import { QUOTATION_STATUS_LABELS } from '../quotations/QuotationStatusBadge';

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
  initialView?: 'summary' | 'execution';
}

type LeaveAction = 'close' | 'pdf' | 'detail' | 'worksheet';

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
    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-pale text-brand-muted">
      {icon}
    </span>
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-brand-muted">{label}</p>
      <p className="truncate text-sm font-semibold text-brand-ink">{value}</p>
      {hint && <p className="truncate text-xs text-brand-muted">{hint}</p>}
    </div>
  </div>
);

const MetricTile = ({ label, value, hint, tone = 'text-brand-ink' }: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) => (
  <div className="rounded-lg border border-brand-line bg-brand-line/40 px-3 py-2">
    <p className="text-[10px] font-bold uppercase tracking-wide text-brand-muted">{label}</p>
    <p className={`mt-0.5 text-base font-bold leading-tight ${tone}`}>{value}</p>
    {hint && <p className="truncate text-[11px] text-brand-muted">{hint}</p>}
  </div>
);

export const WorkOrderQuickDetailModal = ({
  workOrderId,
  onClose,
  onPreviewPdf,
  initialView = 'summary',
}: WorkOrderQuickDetailModalProps) => {
  const [view, setView] = useState<'summary' | 'execution' | 'requests'>(initialView);
  const user = useAuthStore((state) => state.user);
  const dialogRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  const [hasOpenedExecution, setOpenedExecution] = useState(initialView === 'execution');
  const [hasDirtyChanges, setDirtyChanges] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [leaveAction, setLeaveAction] = useState<LeaveAction | null>(null);
  const showFinancials = user?.role !== 'mecanico';
  const workOrderQuery = useWorkOrder(workOrderId);
  const workOrder = workOrderQuery.data;
  const canOperate = Boolean(user && workOrder && (
    ['desarrollador', 'admin', 'jefe'].includes(user.role)
    || (user.role === 'mecanico' && workOrder.assignedMechanicId === user.id)
  ));
  const performLeave = (action: LeaveAction): void => {
    if (action === 'pdf' && workOrder) { onPreviewPdf(workOrder); return; }
    onClose();
    if (action === 'detail') navigate(`/work-orders/${workOrderId}`);
    if (action === 'worksheet') navigate(`/work-orders/${workOrderId}/ficha`);
  };
  const requestLeave = (action: LeaveAction): void => {
    if (savePending) return;
    if (hasDirtyChanges) { setLeaveAction(action); return; }
    performLeave(action);
  };
  const setPanelNode = useModalOverlay({ isOpen: true, onClose: () => requestLeave('close'), isPending: savePending });
  const setDialogNode = useCallback((node: HTMLElement | null) => {
    dialogRef.current = node;
    setPanelNode(node);
  }, [setPanelNode]);
  useEffect(() => {
    if (!hasDirtyChanges && !savePending) return;
    const warn = (event: BeforeUnloadEvent): void => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasDirtyChanges, savePending]);
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

  return createPortal(
    <div className="workshop-dialog-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
      <button type="button" className="fixed inset-0 bg-[#18273c55] backdrop-blur-sm transition-opacity" aria-label="Cerrar detalle" onClick={() => requestLeave('close')} disabled={savePending} />
      <motion.section
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        ref={setDialogNode}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'))
            .filter((element) => !element.closest('[hidden]'));
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
            event.preventDefault(); last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first?.focus();
          }
        }}
        className="workshop-dialog relative max-h-full w-full max-w-[1080px] overflow-y-auto rounded-2xl border border-brand-line bg-white shadow-2xl outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-order-quick-detail-title"
      >
        <header className="workshop-dialog-header sticky top-0 z-10 border-b border-brand-line bg-white px-5 py-4 sm:px-6">
          {workOrderQuery.isPending && (
            <>
              <p className="text-xs font-semibold uppercase text-brand-muted">Orden de trabajo</p>
              <h2 id="work-order-quick-detail-title" className="mt-0.5 text-xl font-bold text-brand-primaryInk">
                Cargando detalle...
              </h2>
            </>
          )}
          {!workOrder && <button type="button" onClick={() => requestLeave('close')} aria-label="Cerrar" className="absolute right-4 top-4 rounded-lg p-2 text-brand-muted"><X className="h-4 w-4" aria-hidden="true" /></button>}
          {workOrder && (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-brand-muted">
                  {ENTRY_TYPE_LABELS[workOrder.tipoIngreso ?? ''] ?? 'Orden de trabajo'}
                </p>
                <h2 id="work-order-quick-detail-title" className="mt-0.5 font-mono text-xl font-bold text-brand-primaryInk">
                  {workOrder.codigo}
                </h2>
                <p className="mt-0.5 text-xs text-brand-muted">
                  Ingreso {formatDate(workOrder.fechaIngreso)}
                  {workOrder.fechaEntrega ? ` · Entrega prometida ${formatDate(workOrder.fechaEntrega)}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <WorkOrderStatusBadge status={workOrder.estado} />
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-brand-muted hover:bg-brand-pale"
                  onClick={() => requestLeave('close')}
                  disabled={savePending}
                  aria-label="Cerrar"
                  title="Cerrar"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
          {workOrder && canOperate && (
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Vista de la orden">
              {([{ value: 'summary', label: 'Resumen' }, { value: 'execution', label: 'Avances y Checklist' }, { value: 'requests', label: 'Solicitudes' }] as const).map((option) => (
                <button key={option.value} type="button" aria-pressed={view === option.value} onClick={() => { setView(option.value); if (option.value !== 'summary') setOpenedExecution(true); }}
                  className={`inline-flex min-h-9 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${view === option.value ? 'bg-brand-primary text-white shadow-xs ring-2 ring-brand-primary/20' : 'bg-brand-pale/70 text-brand-muted hover:bg-brand-pale hover:text-brand-ink'}`}>
                  {option.label}
                  {option.value === 'requests' && workOrder.requests?.some((request) => request.estado === 'pendiente') && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${view === option.value ? 'bg-white text-brand-primary' : 'bg-brand-primary text-white'}`}>{workOrder.requests.filter((request) => request.estado === 'pendiente').length}</span>}
                </button>
              ))}
            </div>
          )}
        </header>
        <div className="workshop-dialog-body">
        {workOrder && user?.role !== 'mecanico' && <div className="workshop-communication px-5 pt-4 sm:px-6"><CustomerEmailPanel kind="work_order" id={workOrder.id} /></div>}

        {workOrder && canOperate && hasOpenedExecution && (
          <div className="workshop-execution-view p-4 sm:p-6" hidden={view === 'summary'}><WorkOrderMechanicPanel workOrder={workOrder} section={view === 'requests' ? 'requests' : 'execution'} onDirtyChange={setDirtyChanges} onPendingChange={setSavePending} /></div>
        )}

        {workOrderQuery.isPending && (
          <div className="flex min-h-72 items-center justify-center text-brand-primaryInk" role="status">
            <LoaderCircle className="h-7 w-7 animate-spin" aria-hidden="true" />
            <span className="sr-only">Cargando detalle de la orden</span>
          </div>
        )}

        {workOrderQuery.isError && (
          <div className="m-6 flex items-start gap-2 rounded-lg border border-brand-coral/30 bg-brand-coralPale p-4 text-sm text-brand-coralInk" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {getApiErrorMessage(workOrderQuery.error, 'No fue posible cargar el detalle de la orden')}
          </div>
        )}

        {workOrder && progress && tier && elapsed && (view === 'summary' || !canOperate) && (
          <div className="workshop-summary space-y-5 p-5 sm:p-6">
            {workOrder.descripcion && (
              <p className="workshop-description rounded-lg border border-brand-line bg-brand-line/40 px-4 py-3 text-sm text-brand-ink">
                {workOrder.descripcion}
              </p>
            )}

            <div className="workshop-summary-people grid gap-3 sm:grid-cols-2">
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
                hint={workOrder.assignedMechanic ? 'Ejecución técnica a su cargo' : null}
              />
              <SummaryRow
                icon={<Building2 className="h-4 w-4" aria-hidden="true" />}
                label="Facturación"
                value={workOrder.billing?.nombre ?? workOrder.billingClient?.nombre ?? 'Cliente de la orden'}
                hint={workOrder.billing?.rut ?? workOrder.billingClient?.rut ?? null}
              />
            </div>

            {workOrder.vehicleOwner && workOrder.vehicleOwner.nombre !== workOrder.client?.nombre && (
              <div className="workshop-owner-note flex items-start gap-2 rounded-lg border border-brand-line bg-brand-goldPale px-4 py-3 text-sm text-brand-ink">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Vehículo de <strong>{workOrder.vehicleOwner.nombre}</strong>
                  {workOrder.vehicleOwner.rut ? ` (${workOrder.vehicleOwner.rut})` : ''}, distinto del cliente de la orden.
                </span>
              </div>
            )}

            <div className="workshop-summary-metrics grid gap-3 sm:grid-cols-4">
              <MetricTile
                label="Avance"
                value={progress.total === 0 ? '—' : `${progress.percent}%`}
                hint={`${progress.completed}/${progress.total} tareas`}
                tone={progress.percent === 100 ? 'text-brand-mintInk' : 'text-brand-primaryInk'}
              />
              <MetricTile
                label="Tiempo en taller"
                value={elapsed.running ? elapsed.text.replace('En taller ', '') : elapsed.text.replace('Duración total: ', '')}
                hint={elapsed.overdue ? 'Entrega vencida' : workOrder.fechaEntrega ? `Entrega ${formatDate(workOrder.fechaEntrega)}` : 'Sin entrega prometida'}
                tone={elapsed.overdue ? 'text-brand-coralInk' : 'text-brand-ink'}
              />
              <MetricTile
                label="Kilometraje"
                value={workOrder.kilometrajeIngreso === null ? '—' : `${Number(workOrder.kilometrajeIngreso).toLocaleString('es-CL')} km`}
                hint="Kilometraje de ingreso"
              />
              {showFinancials && <MetricTile
                label="Total estimado"
                value={formatClp(estimatedTotal)}
                hint={workOrder.quotation ? `COT ${QUOTATION_STATUS_LABELS[workOrder.quotation.estadoPago]}` : 'Sin cotización espejo'}
                tone="text-brand-primaryInk"
              />}
            </div>

            {progress.total > 0 && (
              <div className="workshop-summary-progress">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-ink">
                    <Gauge className="h-4 w-4" aria-hidden="true" /> Avance operativo
                  </p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tier.chip}`}>
                    {tier.label}
                  </span>
                </div>
                <div
                  className="mt-2 h-2 w-full overflow-hidden rounded-full bg-brand-pale"
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
              <div className="workshop-summary-items">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-ink">
                  <ListChecks className="h-4 w-4" aria-hidden="true" />
                  Trabajos y repuestos ({workOrder.items?.length ?? 0})
                </p>
                <div className="mt-3 space-y-4">
                  {grouped.map((group) => (
                    <div key={group.type} className="overflow-hidden rounded-lg border border-brand-line">
                      <div className="flex items-center justify-between gap-2 bg-brand-line/40 px-3 py-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-brand-muted">
                          {TYPE_LABELS[group.type]}
                        </p>
                        {showFinancials && <p className="text-xs font-semibold text-brand-muted">
                          {formatClp(group.items.reduce((sum, item) => sum + Number(item.subtotal), 0))}
                        </p>}
                      </div>
                      <ul className="divide-y divide-brand-line">
                        {group.items.map((item) => (
                          <li key={item.id} className="flex items-start gap-3 px-3 py-2.5">
                            <span
                              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TASK_DOT_STYLES[item.estadoOperativo] ?? 'bg-brand-line'}`}
                              aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-brand-ink">{item.descripcion}</p>
                              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-brand-muted">
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
                                <p className="mt-1 text-xs italic text-brand-muted">{item.notasOperativas}</p>
                              )}
                            </div>
                            {showFinancials && <div className="shrink-0 text-right">
                              <p className="text-sm font-semibold text-brand-ink">{formatClp(item.subtotal)}</p>
                              <p className="text-[11px] text-brand-muted">{formatClp(item.precioUnitario)} c/u</p>
                            </div>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                {showFinancials && <div className="mt-3 flex items-center justify-between border-t-2 border-brand-primaryInk pt-2 text-sm font-bold text-brand-primaryInk">
                  <span>Total estimado</span>
                  <span>{formatClp(estimatedTotal)}</span>
                </div>}
              </div>
            )}

            <div className="workshop-summary-context grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-brand-line px-3 py-3">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-muted">
                  <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" /> Inspección
                </p>
                <p className="mt-1 text-sm font-semibold text-brand-ink">
                  {workOrder.inspection ? 'Registrada' : 'Pendiente'}
                </p>
                {workOrder.inspection?.observaciones && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-brand-muted">{workOrder.inspection.observaciones}</p>
                )}
              </div>
              <div className="rounded-lg border border-brand-line px-3 py-3">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-muted">
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Cotización
                </p>
                <p className="mt-1 text-sm font-semibold text-brand-ink">
                  {workOrder.quotation?.codigo ?? 'Sin cotización'}
                </p>
                {showFinancials && workOrder.quotation && (
                  <p className="mt-0.5 text-xs text-brand-muted">
                    {QUOTATION_STATUS_LABELS[workOrder.quotation.estadoPago]} · saldo {formatClp(workOrder.quotation.saldoPendiente)}
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-brand-line px-3 py-3">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-muted">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Entrega
                </p>
                <p className="mt-1 text-sm font-semibold text-brand-ink">
                  {workOrder.fechaEntrega ? formatDateTime(workOrder.fechaEntrega) : 'Sin fecha prometida'}
                </p>
                {workOrder.delivery && (
                  <p className="mt-0.5 text-xs text-brand-muted">
                    Entregada {formatDateTime(workOrder.delivery.deliveredAt)}
                  </p>
                )}
              </div>
            </div>

            {workOrder.inspection?.inventario && workOrder.inspection.inventario.length > 0 && (
              <div className="workshop-summary-inventory flex flex-wrap items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5 text-brand-muted" aria-hidden="true" />
                {workOrder.inspection.inventario.map((entry) => (
                  <span key={entry} className="rounded-full bg-brand-pale px-2 py-0.5 text-[11px] font-semibold text-brand-muted">
                    {entry}
                  </span>
                ))}
              </div>
            )}

            {workOrder.contact?.telefono && (
              <p className="workshop-summary-contact flex items-center gap-2 text-sm text-brand-muted">
                <Phone className="h-4 w-4 text-brand-muted" aria-hidden="true" />
                Contacto: {workOrder.contact.nombre} · {workOrder.contact.telefono}
              </p>
            )}

          </div>
        )}
        </div>
        {workOrder && <footer className="workshop-dialog-footer">
          {leaveAction && <div role="alertdialog" aria-label="Cambios sin guardar" className="workshop-discard-confirmation">
            <p>Tienes cambios sin guardar en esta orden. ¿Deseas descartarlos?</p>
            <button type="button" onClick={() => setLeaveAction(null)}>Seguir editando</button>
            <button type="button" disabled={savePending} onClick={() => performLeave(leaveAction)}>Descartar cambios</button>
          </div>}
          <span className="workshop-save-state" role="status">{savePending ? 'Guardando cambios…' : hasDirtyChanges ? 'Cambios sin guardar' : 'Sin cambios pendientes'}</span>
          <div className="workshop-dialog-footer-actions">
            {canOperate && <Link to={`/work-orders/${workOrder.id}/ficha`} onClick={(event) => { event.preventDefault(); requestLeave('worksheet'); }} className="workshop-secondary-action"><Wrench aria-hidden="true" />Ficha y horas</Link>}
            {showFinancials && <button type="button" disabled={savePending} className="workshop-secondary-action" onClick={() => requestLeave('pdf')}><Download aria-hidden="true" />Vista previa PDF</button>}
            {user?.role !== 'mecanico' && <Link to={`/work-orders/${workOrder.id}`} onClick={(event) => { event.preventDefault(); requestLeave('detail'); }} className="workshop-primary-action">Abrir detalle completo<ArrowUpRight aria-hidden="true" /></Link>}
          </div>
        </footer>}
      </motion.section>
    </div>,
    document.body,
  );
};

export default WorkOrderQuickDetailModal;
