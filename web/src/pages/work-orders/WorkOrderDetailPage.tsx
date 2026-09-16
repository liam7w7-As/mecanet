import {
  VEHICLE_INVENTORY_ITEMS,
  WORK_ORDER_INSPECTION_PHOTO_SLOTS,
  WORK_ORDER_STATUS,
  isValidWorkOrderTransition,
} from '@unithor/shared';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Camera,
  ClipboardCheck,
  Download,
  Eye,
  Gauge,
  ImagePlus,
  LoaderCircle,
  Pencil,
  Mail,
  Phone,
  Printer,
  ReceiptText,
  Trash2,
  UserRound,
  Wrench,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import CancelStatusModal from '../../components/work-orders/CancelStatusModal';
import WorkOrderReceptionInspectionModal from '../../components/work-orders/WorkOrderReceptionInspectionModal';
import WorkOrderStatusBadge, { WORK_ORDER_STATUS_LABELS } from '../../components/work-orders/WorkOrderStatusBadge';
import {
  useChangeWorkOrderStatusMutation,
  useDeleteWorkOrderInspectionPhotoMutation,
  useDownloadWorkOrderPdf,
  useUploadWorkOrderInspectionPhotosMutation,
  useWorkOrder,
} from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDateTime } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

import type {
  FuelLevel,
  TireCondition,
  VehicleInventoryItem,
  WorkOrderInspectionPhotoSlot,
  WorkOrderStatus,
} from '@unithor/shared';

const ITEM_OPERATIONAL_STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  completado: 'Completado',
  omitido: 'Omitido',
};

const fuelLabels: Record<FuelLevel, string> = {
  vacio: 'Vacío',
  cuarto: '1/4',
  medio: '1/2',
  tres_cuartos: '3/4',
  lleno: 'Lleno',
};

const tireLabels: Record<TireCondition, string> = {
  no_revisado: 'No revisado',
  bueno: 'Bueno',
  regular: 'Regular',
  desgaste_severo: 'Desgaste severo',
  baja_presion: 'Baja presión',
};

const inventoryLabels: Record<VehicleInventoryItem, string> = {
  botiquin: 'Botiquín',
  chaleco_reflectante: 'Chaleco reflectante',
  extintor: 'Extintor',
  triangulo: 'Triángulo',
  control_remoto: 'Control remoto',
  manual: 'Manual',
  radio: 'Radio',
  usb: 'USB',
  rueda_repuesto: 'Rueda de repuesto',
  llave_ruedas: 'Llave de ruedas',
  gata: 'Gata',
  herramientas: 'Herramientas',
  perno_seguridad: 'Perno de seguridad',
  enganche: 'Enganche',
  antena: 'Antena',
  tapa_combustible: 'Tapa combustible',
  tapas_ruedas: 'Tapas de ruedas',
  limpiaparabrisas: 'Limpiaparabrisas',
};

const photoSlotLabels: Record<WorkOrderInspectionPhotoSlot, string> = {
  frontal: 'Frontal',
  trasera: 'Trasera',
  lateral_izquierdo: 'Lateral izquierdo',
  lateral_derecho: 'Lateral derecho',
  frontal_izquierdo: 'Frontal izq.',
  frontal_derecho: 'Frontal der.',
  trasero_izquierdo: 'Trasero izq.',
  trasero_derecho: 'Trasero der.',
  interior: 'Interior',
};

const getContactLine = (value: string | null | undefined, fallback = 'Sin registrar'): string =>
  value && value.trim().length > 0 ? value : fallback;

export const WorkOrderDetailPage = () => {
  const { id } = useParams();
  const workOrderId = Number(id);
  const workOrderQuery = useWorkOrder(workOrderId);
  const statusMutation = useChangeWorkOrderStatusMutation();
  const pdfMutation = useDownloadWorkOrderPdf();
  const uploadPhotosMutation = useUploadWorkOrderInspectionPhotosMutation();
  const deletePhotoMutation = useDeleteWorkOrderInspectionPhotoMutation();
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showReceptionModal, setShowReceptionModal] = useState(false);
  const user = useAuthStore((state) => state.user);
  const canUpdate = Boolean(user && hasUserPermission(user, 'taller', 'update'));
  const workOrder = workOrderQuery.data;
  const validTransitions = useMemo(
    () => workOrder ? WORK_ORDER_STATUS.filter((candidate) => isValidWorkOrderTransition(workOrder.estado, candidate)) : [],
    [workOrder],
  );
  const total = workOrder?.items?.reduce((sum, item) => sum + Number(item.subtotal), 0) ?? 0;
  const canEditInspection = Boolean(
    workOrder && canUpdate && workOrder.estado !== 'entregada' && workOrder.estado !== 'cancelada',
  );
  const inspectionPhotoMap = useMemo(
    () => new Map((workOrder?.inspection?.photos ?? []).map((photo) => [photo.slot, photo])),
    [workOrder?.inspection?.photos],
  );

  const changeStatus = (nextStatus: WorkOrderStatus): void => {
    statusMutation.reset();
    if (nextStatus === 'cancelada') {
      setShowCancelModal(true);
      return;
    }
    statusMutation.mutate({ id: workOrderId, data: { nuevoEstado: nextStatus } });
  };

  const uploadInspectionPhoto = (slot: WorkOrderInspectionPhotoSlot, file: File | undefined): void => {
    if (!file) return;
    uploadPhotosMutation.mutate({ id: workOrderId, photos: [{ slot, file }] });
  };

  if (workOrderQuery.isPending) {
    return <div className="flex min-h-72 items-center justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-brand-blue" aria-label="Cargando orden de trabajo" /></div>;
  }

  if (workOrderQuery.isError || !workOrder) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-700" role="alert"><p className="font-semibold">No fue posible cargar la orden</p><p className="mt-1 text-sm">{getApiErrorMessage(workOrderQuery.error, 'Orden de trabajo no encontrada.')}</p><Link to="/work-orders" className="mt-4 inline-flex text-sm font-semibold underline">Volver al listado</Link></div>;
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex items-start gap-3">
          <Link to="/work-orders" className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50" aria-label="Volver a órdenes" title="Volver"><ArrowLeft className="h-4 w-4" aria-hidden="true" /></Link>
          <div><p className="text-sm font-medium text-slate-500">Seguimiento operativo</p><div className="mt-1 flex flex-wrap items-center gap-3"><h1 className="font-mono text-2xl font-bold text-brand-blue sm:text-3xl">{workOrder.codigo}</h1><WorkOrderStatusBadge status={workOrder.estado} /></div></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEditInspection && <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setShowReceptionModal(true)}><Pencil className="h-4 w-4" aria-hidden="true" /> Editar ficha</button>}
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-brand-blue bg-white px-4 text-sm font-semibold text-brand-blue hover:bg-brand-light disabled:opacity-60" onClick={() => pdfMutation.openPdf(workOrder.id, workOrder.codigo)} disabled={pdfMutation.isPending}><Eye className="h-4 w-4" aria-hidden="true" /> Ver PDF</button>
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-yellow px-4 text-sm font-bold text-brand-dark hover:bg-yellow-400 disabled:opacity-60" onClick={() => pdfMutation.downloadPdf(workOrder.id, workOrder.codigo)} disabled={pdfMutation.isPending}>{pdfMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />} Descargar comprobante PDF</button>
        </div>
      </header>

      {(statusMutation.isError || pdfMutation.isError || uploadPhotosMutation.isError || deletePhotoMutation.isError) && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{getApiErrorMessage(statusMutation.error ?? pdfMutation.error ?? uploadPhotosMutation.error ?? deletePhotoMutation.error)}</div>}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="work-order-summary-title">
        <div className="border-b border-slate-200 px-5 py-4"><h2 id="work-order-summary-title" className="font-bold text-brand-blue">Resumen de la orden</h2></div>
        <div className="grid divide-y divide-slate-200 md:grid-cols-3 md:divide-x md:divide-y-0">
          <div className="p-5"><div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Wrench className="h-4 w-4" aria-hidden="true" />Vehículo</div><p className="mt-3 font-mono text-xl font-bold text-brand-blue">{workOrder.vehicle?.patente ?? 'Sin vehículo'}</p><p className="mt-1 text-sm text-slate-600">{[workOrder.vehicle?.marca, workOrder.vehicle?.modelo].filter(Boolean).join(' ') || 'Sin datos técnicos'}</p><p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><Gauge className="h-3.5 w-3.5" aria-hidden="true" />{workOrder.kilometrajeIngreso === null ? 'Kilometraje no registrado' : `${workOrder.kilometrajeIngreso.toLocaleString('es-CL')} km`}</p></div>
          <div className="p-5"><div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><UserRound className="h-4 w-4" aria-hidden="true" />Cliente</div><p className="mt-3 font-semibold text-slate-900">{workOrder.client?.nombre ?? 'Sin cliente asignado'}</p><p className="mt-1 text-sm text-slate-600">{workOrder.client?.rut ?? 'Sin identificación'}</p><p className="mt-2 text-xs text-slate-500">{workOrder.client?.telefono ?? 'Sin teléfono'}</p></div>
          <div className="p-5"><p className="text-sm font-semibold text-slate-500">Registro</p><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-500">Ingreso</dt><dd className="text-right font-medium text-slate-800">{formatDateTime(workOrder.fechaIngreso)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Entrega</dt><dd className="text-right font-medium text-slate-800">{formatDateTime(workOrder.fechaEntrega)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Creada por</dt><dd className="text-right font-medium text-slate-800">{workOrder.creator?.nombre ?? 'Sin registro'}</dd></div></dl></div>
        </div>
        <div className="border-t border-slate-200 px-5 py-4"><p className="text-xs font-semibold uppercase text-slate-500">Motivo de ingreso / diagnóstico</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{workOrder.descripcion ?? 'Sin observaciones registradas.'}</p></div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="reception-billing-title">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 id="reception-billing-title" className="font-bold text-brand-blue">Recepción y facturación</h2>
          <p className="mt-1 text-sm text-slate-500">Diferencia entre quien deja físicamente el vehículo y los datos usados para emitir la factura.</p>
        </div>
        <div className="grid divide-y divide-slate-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <div className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><UserRound className="h-4 w-4" aria-hidden="true" />Contacto de recepción</div>
            <p className="mt-3 text-lg font-bold text-slate-900">{getContactLine(workOrder.contact?.nombre, workOrder.client?.nombre ?? 'Sin contacto')}</p>
            <dl className="mt-3 grid gap-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">RUT/ID</dt><dd className="text-right font-medium text-slate-800">{getContactLine(workOrder.contact?.rut, workOrder.client?.rut ?? 'Sin identificación')}</dd></div>
              <div className="flex justify-between gap-3"><dt className="flex items-center gap-1 text-slate-500"><Phone className="h-3.5 w-3.5" aria-hidden="true" />Teléfono</dt><dd className="text-right font-medium text-slate-800">{getContactLine(workOrder.contact?.telefono, workOrder.client?.telefono ?? 'Sin teléfono')}</dd></div>
              <div className="flex justify-between gap-3"><dt className="flex items-center gap-1 text-slate-500"><Mail className="h-3.5 w-3.5" aria-hidden="true" />Email</dt><dd className="text-right font-medium text-slate-800">{getContactLine(workOrder.contact?.email, 'Sin email')}</dd></div>
            </dl>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Building2 className="h-4 w-4" aria-hidden="true" />Datos de facturación</div>
            <p className="mt-3 text-lg font-bold text-slate-900">{getContactLine(workOrder.billing?.nombre, workOrder.client?.nombre ?? 'Sin facturación')}</p>
            <dl className="mt-3 grid gap-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Tipo</dt><dd className="text-right font-medium text-slate-800">{workOrder.billing?.tipo === 'empresa' ? 'Empresa' : workOrder.billing?.tipo === 'cliente' ? 'Persona natural' : 'Sin tipo'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">RUT/ID</dt><dd className="text-right font-medium text-slate-800">{getContactLine(workOrder.billing?.rut, workOrder.client?.rut ?? 'Sin identificación')}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Dirección</dt><dd className="text-right font-medium text-slate-800">{getContactLine(workOrder.billing?.direccion, 'Sin dirección')}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Comuna/Región</dt><dd className="text-right font-medium text-slate-800">{[workOrder.billing?.comuna, workOrder.billing?.region].filter(Boolean).join(', ') || 'Sin ubicación'}</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="inspection-title">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <ClipboardCheck className="mt-0.5 h-5 w-5 text-brand-blue" aria-hidden="true" />
            <div>
              <h2 id="inspection-title" className="font-bold text-brand-blue">Inspección de ingreso</h2>
              <p className="mt-1 text-sm text-slate-500">Estado físico, inventario interno y registro fotográfico tomado en recepción.</p>
            </div>
          </div>
          {!canEditInspection && <span className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">Inspección bloqueada por estado</span>}
        </div>
        {workOrder.inspection ? (
          <>
            <div className="grid gap-5 p-5 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Combustible</p>
                  <p className="mt-2 text-xl font-bold text-brand-blue">{workOrder.inspection.nivelCombustible ? fuelLabels[workOrder.inspection.nivelCombustible] : 'Sin registrar'}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Llantas</p>
                  <dl className="mt-3 grid gap-2 text-sm">
                    {([
                      ['llantaDelanteraIzquierda', 'Delantera izquierda'],
                      ['llantaDelanteraDerecha', 'Delantera derecha'],
                      ['llantaTraseraIzquierda', 'Trasera izquierda'],
                      ['llantaTraseraDerecha', 'Trasera derecha'],
                    ] as const).map(([key, label]) => (
                      <div key={key} className="flex justify-between gap-3">
                        <dt className="text-slate-500">{label}</dt>
                        <dd className="font-semibold text-slate-800">{workOrder.inspection?.[key] ? tireLabels[workOrder.inspection[key]] : 'Sin revisar'}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Inventario interno</p>
                  {workOrder.inspection.inventario.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {VEHICLE_INVENTORY_ITEMS.filter((item) => workOrder.inspection?.inventario.includes(item)).map((item) => (
                        <span key={item} className="rounded-md bg-brand-light px-2.5 py-1 text-xs font-semibold text-brand-blue">{inventoryLabels[item]}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">Sin elementos marcados.</p>
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Objetos de valor</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{workOrder.inspection.objetosValor ?? 'Sin objetos declarados.'}</p></div>
                  <div className="rounded-lg border border-slate-200 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Observaciones</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{workOrder.inspection.observaciones ?? 'Sin observaciones.'}</p></div>
                </div>
              </div>
            </div>
            <div className="border-t border-slate-200 px-5 py-4">
              <div className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-brand-blue" aria-hidden="true" />
                <h3 className="font-bold text-brand-blue">Registro fotográfico</h3>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {WORK_ORDER_INSPECTION_PHOTO_SLOTS.map((slot) => {
                  const photo = inspectionPhotoMap.get(slot);
                  const busy = (uploadPhotosMutation.isPending && uploadPhotosMutation.variables?.photos.some((item) => item.slot === slot)) || (deletePhotoMutation.isPending && deletePhotoMutation.variables?.slot === slot);
                  return (
                    <div key={slot} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                        <p className="text-sm font-semibold text-slate-700">{photoSlotLabels[slot]}</p>
                        {photo && canEditInspection && (
                          <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-50" onClick={() => deletePhotoMutation.mutate({ id: workOrder.id, slot })} disabled={busy} aria-label={`Eliminar foto ${photoSlotLabels[slot]}`} title="Eliminar foto">
                            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                          </button>
                        )}
                      </div>
                      {photo ? (
                        <div className="relative">
                          <img src={photo.url} alt={photoSlotLabels[slot]} className="h-40 w-full object-cover" />
                          {canEditInspection && (
                            <label className="absolute bottom-2 right-2 inline-flex h-9 cursor-pointer items-center justify-center rounded-lg bg-white/95 px-3 text-xs font-bold text-brand-blue shadow hover:bg-brand-light">
                              Reemplazar
                              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => uploadInspectionPhoto(slot, event.target.files?.[0])} aria-label={`Reemplazar foto ${photoSlotLabels[slot]}`} />
                            </label>
                          )}
                        </div>
                      ) : (
                        <label className={`flex h-40 flex-col items-center justify-center gap-2 bg-slate-50 text-sm font-semibold ${canEditInspection ? 'cursor-pointer text-slate-500 hover:bg-brand-light hover:text-brand-blue' : 'text-slate-400'}`}>
                          <ImagePlus className="h-7 w-7" aria-hidden="true" />
                          {canEditInspection ? 'Subir foto' : 'Sin foto'}
                          {canEditInspection && <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => uploadInspectionPhoto(slot, event.target.files?.[0])} aria-label={`Subir foto ${photoSlotLabels[slot]}`} />}
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Esta orden aún no tiene inspección registrada.</p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5" aria-labelledby="status-control-title">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="text-xs font-semibold uppercase text-slate-500">Control operativo</p><h2 id="status-control-title" className="mt-1 text-lg font-bold text-brand-blue">Cambiar estado</h2><p className="mt-1 text-sm text-slate-500">Estado actual: {WORK_ORDER_STATUS_LABELS[workOrder.estado]}</p></div>
          <div className="flex flex-wrap gap-2">
            {canUpdate && validTransitions.map((nextStatus) => (
              <button key={nextStatus} type="button" className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition disabled:opacity-60 ${nextStatus === 'cancelada' ? 'border border-red-300 bg-white text-red-700 hover:bg-red-50' : 'bg-brand-blue text-white hover:bg-brand-dark'}`} onClick={() => changeStatus(nextStatus)} disabled={statusMutation.isPending}>{statusMutation.isPending && statusMutation.variables?.data.nuevoEstado === nextStatus ? 'Actualizando...' : WORK_ORDER_STATUS_LABELS[nextStatus]}</button>
            ))}
            {validTransitions.length === 0 && <p className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600">Esta orden está en un estado terminal.</p>}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="mirror-quotation-title">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <ReceiptText className="mt-0.5 h-5 w-5 text-brand-blue" aria-hidden="true" />
            <div>
              <h2 id="mirror-quotation-title" className="font-bold text-brand-blue">Cotización espejo</h2>
              <p className="mt-1 text-sm text-slate-500">Copia comercial editable vinculada a esta orden de taller.</p>
            </div>
          </div>
          {workOrder.quotation && <Link to={`/quotations/${workOrder.quotation.id}`} className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-yellow px-4 text-sm font-bold text-brand-dark hover:bg-yellow-400">Abrir COT</Link>}
        </div>
        {workOrder.quotation ? (
          <div className="grid divide-y divide-slate-200 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <div className="p-5"><p className="text-xs font-semibold uppercase text-slate-500">Código</p><p className="mt-2 font-mono text-lg font-bold text-brand-blue">{workOrder.quotation.codigo}</p></div>
            <div className="p-5"><p className="text-xs font-semibold uppercase text-slate-500">Total COT</p><p className="mt-2 text-lg font-bold text-slate-900">{formatClp(workOrder.quotation.total)}</p></div>
            <div className="p-5"><p className="text-xs font-semibold uppercase text-slate-500">Pagado</p><p className="mt-2 text-lg font-bold text-emerald-700">{formatClp(workOrder.quotation.pagado)}</p></div>
            <div className="bg-brand-light p-5"><p className="text-xs font-semibold uppercase text-brand-blue">Saldo</p><p className="mt-2 text-lg font-bold text-brand-blue">{formatClp(workOrder.quotation.saldoPendiente)}</p></div>
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-slate-500">Esta orden aún no tiene una cotización espejo vinculada.</p>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="work-order-items-title">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 id="work-order-items-title" className="font-bold text-brand-blue">Trabajos y repuestos</h2><p className="mt-1 text-sm text-slate-500">Detalle económico registrado en la orden.</p></div><Printer className="h-5 w-5 text-slate-400" aria-hidden="true" /></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3 font-semibold">Descripción</th><th className="px-4 py-3 font-semibold">Avance</th><th className="px-4 py-3 font-semibold">Nota</th><th className="px-4 py-3 text-right font-semibold">Cantidad</th><th className="px-4 py-3 text-right font-semibold">Precio unitario</th><th className="px-4 py-3 text-right font-semibold">Subtotal</th></tr></thead><tbody>{workOrder.items?.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="px-4 py-3 font-medium text-slate-800">{item.descripcion}</td><td className="px-4 py-3"><span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{ITEM_OPERATIONAL_STATUS_LABELS[item.estadoOperativo] ?? item.estadoOperativo}</span></td><td className="max-w-64 px-4 py-3 text-slate-600">{item.notasOperativas ?? '-'}</td><td className="px-4 py-3 text-right text-slate-600">{item.cantidad}</td><td className="px-4 py-3 text-right text-slate-600">{formatClp(item.precioUnitario)}</td><td className="px-4 py-3 text-right font-semibold text-brand-blue">{formatClp(item.subtotal)}</td></tr>)}</tbody></table></div>
        {workOrder.items?.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-500">Diagnóstico inicial, sin trabajos o repuestos cargados.</p>}
        <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-4"><div className="text-right"><p className="text-xs font-semibold uppercase text-slate-500">Total estimado</p><p className="mt-1 text-2xl font-bold text-brand-blue">{formatClp(total)}</p></div></div>
      </section>

      {showCancelModal && <CancelStatusModal codigo={workOrder.codigo} isPending={statusMutation.isPending} errorMessage={statusMutation.isError ? getApiErrorMessage(statusMutation.error) : null} onClose={() => setShowCancelModal(false)} onConfirm={(motivo) => statusMutation.mutate({ id: workOrder.id, data: { nuevoEstado: 'cancelada', motivo } }, { onSuccess: () => setShowCancelModal(false) })} />}
      {showReceptionModal && <WorkOrderReceptionInspectionModal workOrder={workOrder} onClose={() => setShowReceptionModal(false)} />}
    </div>
  );
};

export default WorkOrderDetailPage;
