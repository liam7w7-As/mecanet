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
  FileCheck2,
  Gauge,
  History,
  LoaderCircle,
  Pencil,
  Mail,
  PackageCheck,
  Phone,
  Printer,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserRound,
  Wrench,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AnimateIcon } from '../../components/animate-ui';
import { PageLoader, ProgressBar } from '../../components/common/LoadingIndicator';
import PdfPreviewModal from '../../components/common/PdfPreviewModal';
import CancelStatusModal from '../../components/work-orders/CancelStatusModal';
import PhotoSlotInput from '../../components/work-orders/PhotoSlotInput';
import WorkOrderDeliveryModal from '../../components/work-orders/WorkOrderDeliveryModal';
import WorkOrderDeliveryReceiptModal from '../../components/work-orders/WorkOrderDeliveryReceiptModal';
import WorkOrderItemsModal from '../../components/work-orders/WorkOrderItemsModal';
import WorkOrderMechanicPanel from '../../components/work-orders/WorkOrderMechanicPanel';
import WorkOrderReceptionInspectionModal from '../../components/work-orders/WorkOrderReceptionInspectionModal';
import WorkOrderReentryModal from '../../components/work-orders/WorkOrderReentryModal';
import WorkOrderStatusBadge, { WORK_ORDER_STATUS_LABELS } from '../../components/work-orders/WorkOrderStatusBadge';
import {
  useChangeWorkOrderStatusMutation,
  useDeleteWorkOrderInspectionPhotoMutation,
  useDownloadWorkOrderReceptionPdf,
  useUploadWorkOrderInspectionPhotosMutation,
  useWorkOrder,
} from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDateTime } from '../../lib/formatters';
import { validateInspectionFile } from '../../lib/inspection-photos';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import { notifyError, notifySuccess } from '../../stores/toast.store';

import type {
  FuelLevel,
  TireCondition,
  VehicleInventoryItem,
  WorkOrderInspectionPhotoSlot,
  WorkOrderEventType,
  WorkOrderStatus,
} from '@unithor/shared';

const ITEM_OPERATIONAL_STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  completado: 'Completado',
  omitido: 'Omitido',
};

const WORK_ORDER_EVENT_LABELS: Record<WorkOrderEventType, string> = {
  creacion: 'Creación',
  actualizacion: 'Actualización',
  cambio_estado: 'Cambio de estado',
  entrega: 'Entrega',
  garantia_creada: 'Garantía',
  reingreso_creado: 'Reingreso',
  asignacion_mecanico: 'Asignación',
  reporte_avance: 'Avance técnico',
  solicitud_creada: 'Solicitud',
  solicitud_revisada: 'Revisión',
  eliminacion: 'Eliminación',
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
  const uploadPhotosMutation = useUploadWorkOrderInspectionPhotosMutation();
  const deletePhotoMutation = useDeleteWorkOrderInspectionPhotoMutation();
  const receptionPdfMutation = useDownloadWorkOrderReceptionPdf();
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showReceptionModal, setShowReceptionModal] = useState(false);
  const [showItemsModal, setShowItemsModal] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showDeliveryReceipt, setShowDeliveryReceipt] = useState(false);
  const [showReentryModal, setShowReentryModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Partial<Record<WorkOrderInspectionPhotoSlot, number>>>({});
  const user = useAuthStore((state) => state.user);
  const canUpdate = Boolean(user && hasUserPermission(user, 'taller', 'update'));
  const canManage = Boolean(canUpdate && user?.role !== 'mecanico');
  const canCreate = Boolean(user && hasUserPermission(user, 'taller', 'create'));
  const workOrder = workOrderQuery.data;
  const validTransitions = useMemo(
    () => workOrder ? WORK_ORDER_STATUS.filter((candidate) => isValidWorkOrderTransition(workOrder.estado, candidate)) : [],
    [workOrder],
  );
  const total = workOrder?.items?.reduce((sum, item) => sum + Number(item.subtotal), 0) ?? 0;
  const canEditInspection = Boolean(
    workOrder && canManage && workOrder.estado !== 'entregada' && workOrder.estado !== 'cancelada',
  );
  const itemProgress = useMemo(() => {
    const items = workOrder?.items ?? [];
    return {
      active: items.filter((item) => item.estadoOperativo === 'en_proceso').length,
      completed: items.filter((item) => item.estadoOperativo === 'completado').length,
      total: items.length,
    };
  }, [workOrder?.items]);
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
    if (nextStatus === 'entregada') {
      setShowDeliveryModal(true);
      return;
    }
    statusMutation.mutate(
      { id: workOrderId, data: { nuevoEstado: nextStatus } },
      {
        onSuccess: () => notifySuccess('Estado de la orden actualizado.'),
        onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo cambiar el estado.')),
      },
    );
  };

  const uploadInspectionPhoto = (slot: WorkOrderInspectionPhotoSlot, file: File | undefined): void => {
    if (!file) return;
    const validationError = validateInspectionFile(file);
    if (validationError) {
      notifyError(`${photoSlotLabels[slot]}: ${validationError}`);
      return;
    }
    setUploadProgress((current) => ({ ...current, [slot]: 0 }));
    uploadPhotosMutation.mutate(
      {
        id: workOrderId,
        photos: [{ slot, file }],
        onProgress: (activeSlot, percent) =>
          setUploadProgress((current) => ({ ...current, [activeSlot]: percent })),
      },
      {
        onSuccess: () => {
          notifySuccess(`Foto ${photoSlotLabels[slot]} subida.`);
          setUploadProgress((current) => {
            const next = { ...current };
            delete next[slot];
            return next;
          });
        },
        onError: (error) => {
          notifyError(getApiErrorMessage(error, 'No se pudo subir la foto.'));
          setUploadProgress((current) => {
            const next = { ...current };
            delete next[slot];
            return next;
          });
        },
      },
    );
  };

  const handleDeletePhoto = (slot: WorkOrderInspectionPhotoSlot): void => {
    deletePhotoMutation.mutate(
      { id: workOrderId, slot },
      {
        onSuccess: () => notifySuccess(`Foto ${photoSlotLabels[slot]} eliminada.`),
        onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo eliminar la foto.')),
      },
    );
  };

  if (workOrderQuery.isPending) {
    return <PageLoader label="Cargando orden de trabajo..." />;
  }

  if (workOrderQuery.isError || !workOrder) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-700" role="alert"><p className="font-semibold">No fue posible cargar la orden</p><p className="mt-1 text-sm">{getApiErrorMessage(workOrderQuery.error, 'Orden de trabajo no encontrada.')}</p><Link to="/work-orders" className="mt-4 inline-flex text-sm font-semibold underline">Volver al listado</Link></div>;
  }

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex items-start gap-3">
          <Link to="/work-orders" className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50" aria-label="Volver a órdenes" title="Volver">
            <AnimateIcon variant="slide-left" animateOnHover>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </AnimateIcon>
          </Link>
          <div>
            <p className="text-sm font-medium text-slate-500">Seguimiento operativo</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-2xl font-bold text-brand-blue sm:text-3xl">{workOrder.codigo}</h1>
              <WorkOrderStatusBadge status={workOrder.estado} />
              {workOrder.tipoIngreso && workOrder.tipoIngreso !== 'normal' && <span className={`rounded-md px-2.5 py-1 text-xs font-bold ${workOrder.tipoIngreso === 'garantia' ? 'bg-amber-100 text-amber-800' : 'bg-blue-50 text-blue-700'}`}>{workOrder.tipoIngreso === 'garantia' ? 'Garantía' : 'Reingreso'}{workOrder.coberturaGarantia ? ' cubierta' : ''}</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEditInspection && (
            <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:shadow" onClick={() => setShowReceptionModal(true)}>
              <AnimateIcon variant="wiggle" animateOnHover>
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </AnimateIcon>
              Editar ficha
            </button>
          )}
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-brand-blue bg-white px-4 text-sm font-semibold text-brand-blue shadow-sm transition-all hover:bg-brand-light hover:shadow" onClick={() => receptionPdfMutation.downloadPdf(workOrder.id, workOrder.codigo)} disabled={receptionPdfMutation.isPending}>
            {receptionPdfMutation.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <AnimateIcon variant="bounce" animateOnHover>
                <Download className="h-4 w-4" aria-hidden="true" />
              </AnimateIcon>
            )}
            Comprobante de recepción
          </button>
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-dark hover:shadow" onClick={() => setShowPdfModal(true)}>
            <AnimateIcon variant="bounce" animateOnHover>
              <Eye className="h-4 w-4" aria-hidden="true" />
            </AnimateIcon>
            OT oficial / Imprimir
          </button>
        </div>
      </header>

      {(statusMutation.isError || uploadPhotosMutation.isError || deletePhotoMutation.isError || receptionPdfMutation.isError) && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{getApiErrorMessage(statusMutation.error ?? uploadPhotosMutation.error ?? deletePhotoMutation.error ?? receptionPdfMutation.error)}</div>}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="work-order-summary-title">
        <div className="border-b border-slate-200 px-5 py-4"><h2 id="work-order-summary-title" className="font-bold text-brand-blue">Resumen de la orden</h2></div>
        <div className="grid divide-y divide-slate-200 md:grid-cols-3 md:divide-x md:divide-y-0">
          <div className="p-5"><div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Wrench className="h-4 w-4" aria-hidden="true" />Vehículo</div><p className="mt-3 font-mono text-xl font-bold text-brand-blue">{workOrder.vehicle?.patente ?? 'Sin vehículo'}</p><p className="mt-1 text-sm text-slate-600">{[workOrder.vehicle?.marca, workOrder.vehicle?.modelo].filter(Boolean).join(' ') || 'Sin datos técnicos'}</p><p className="mt-2 text-xs text-slate-500">Propietario registrado: {workOrder.vehicleOwner?.nombre ?? 'Sin propietario'}</p><p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><Gauge className="h-3.5 w-3.5" aria-hidden="true" />{workOrder.kilometrajeIngreso === null ? 'Kilometraje no registrado' : `${workOrder.kilometrajeIngreso.toLocaleString('es-CL')} km`}</p></div>
          <div className="p-5"><div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><UserRound className="h-4 w-4" aria-hidden="true" />Cliente</div><p className="mt-3 font-semibold text-slate-900">{workOrder.client?.nombre ?? 'Sin cliente asignado'}</p><p className="mt-1 text-sm text-slate-600">{workOrder.client?.rut ?? 'Sin identificación'}</p><p className="mt-2 text-xs text-slate-500">{workOrder.client?.telefono ?? 'Sin teléfono'}</p></div>
          <div className="p-5"><p className="text-sm font-semibold text-slate-500">Registro</p><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-500">Ingreso</dt><dd className="text-right font-medium text-slate-800">{formatDateTime(workOrder.fechaIngreso)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Entrega</dt><dd className="text-right font-medium text-slate-800">{formatDateTime(workOrder.fechaEntrega)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Creada por</dt><dd className="text-right font-medium text-slate-800">{workOrder.creator?.nombre ?? 'Sin registro'}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Mecánico</dt><dd className="text-right font-medium text-slate-800">{workOrder.assignedMechanic?.nombre ?? 'Sin asignar'}</dd></div></dl></div>
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
                  const progress = uploadProgress[slot] ?? null;
                  return (
                    <div key={slot} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                        <p className="text-sm font-semibold text-slate-700">{photoSlotLabels[slot]}</p>
                        {photo && canEditInspection && (
                          <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-50" onClick={() => handleDeletePhoto(slot)} disabled={busy} aria-label={`Eliminar foto ${photoSlotLabels[slot]}`} title="Eliminar foto">
                            {busy && progress === null ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                          </button>
                        )}
                      </div>
                      {progress !== null && (
                        <div className="px-3 pt-2">
                          <ProgressBar value={progress} label={`Subiendo ${photoSlotLabels[slot]}`} />
                        </div>
                      )}
                      {photo ? (
                        <div className="relative">
                          <img src={photo.url} alt={photoSlotLabels[slot]} className="h-40 w-full object-cover" loading="lazy" />
                          {canEditInspection && (
                            <PhotoSlotInput
                              slotLabel={photoSlotLabels[slot]}
                              variant="replace"
                              disabled={!canEditInspection}
                              busy={busy}
                              onSelect={(file) => uploadInspectionPhoto(slot, file)}
                            />
                          )}
                        </div>
                      ) : (
                        <div>
                          {canEditInspection ? (
                            <PhotoSlotInput
                              slotLabel={photoSlotLabels[slot]}
                              variant="empty"
                              busy={busy}
                              progress={progress}
                              onSelect={(file) => uploadInspectionPhoto(slot, file)}
                            />
                          ) : (
                            <p className="flex h-40 items-center justify-center bg-slate-50 text-sm font-semibold text-slate-400">Sin foto</p>
                          )}
                        </div>
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
            {canManage && validTransitions.map((nextStatus) => (
              <button key={nextStatus} type="button" className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition disabled:opacity-60 ${nextStatus === 'cancelada' ? 'border border-red-300 bg-white text-red-700 hover:bg-red-50' : 'bg-brand-blue text-white hover:bg-brand-dark'}`} onClick={() => changeStatus(nextStatus)} disabled={statusMutation.isPending}>{statusMutation.isPending && statusMutation.variables?.data.nuevoEstado === nextStatus ? 'Actualizando...' : WORK_ORDER_STATUS_LABELS[nextStatus]}</button>
            ))}
            {(!canManage || validTransitions.length === 0) && <p className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600">{canManage ? 'Esta orden está en un estado terminal.' : 'El jefe de taller administra los cambios de estado.'}</p>}
          </div>
        </div>
      </section>

      <WorkOrderMechanicPanel workOrder={workOrder} />

      {workOrder.delivery && (
        <section className="overflow-hidden rounded-lg border border-emerald-200 bg-white" aria-labelledby="delivery-record-title">
          <div className="flex flex-col gap-4 border-b border-emerald-100 bg-emerald-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <PackageCheck className="mt-0.5 h-5 w-5 text-emerald-700" aria-hidden="true" />
              <div><h2 id="delivery-record-title" className="font-bold text-emerald-900">Entrega registrada</h2><p className="mt-1 text-sm text-emerald-800">Acta de cierre confirmada el {formatDateTime(workOrder.delivery.deliveredAt)}.</p></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowDeliveryReceipt(true)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"><FileCheck2 className="h-4 w-4" aria-hidden="true" />Imprimir acta</button>
              {canCreate && <button type="button" onClick={() => setShowReentryModal(true)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-blue px-3 text-sm font-semibold text-white hover:bg-brand-dark"><RotateCcw className="h-4 w-4" aria-hidden="true" />Garantía / reingreso</button>}
            </div>
          </div>
          <div className="grid divide-y divide-slate-200 md:grid-cols-4 md:divide-x md:divide-y-0">
            <div className="p-5"><p className="text-xs font-semibold uppercase text-slate-500">Receptor</p><p className="mt-2 font-bold text-slate-900">{workOrder.delivery.receptorNombre}</p><p className="mt-1 text-sm text-slate-500">{workOrder.delivery.receptorRut || 'Sin identificación'}</p></div>
            <div className="p-5"><p className="text-xs font-semibold uppercase text-slate-500">Kilometraje salida</p><p className="mt-2 text-xl font-bold text-brand-blue">{workOrder.delivery.kilometrajeSalida.toLocaleString('es-CL')} km</p></div>
            <div className="p-5"><p className="text-xs font-semibold uppercase text-slate-500">Entregado por</p><p className="mt-2 font-bold text-slate-900">{workOrder.delivery.deliverer?.nombre ?? 'Usuario no disponible'}</p><p className="mt-1 text-sm text-slate-500">Checklist {workOrder.delivery.checklist.length}/4</p></div>
            <div className="p-5"><p className="text-xs font-semibold uppercase text-slate-500">Firma de conformidad</p><p className="mt-2 font-medium italic text-slate-900">{workOrder.delivery.firmaRecepcion}</p><p className="mt-1 text-sm text-emerald-700">Conformidad aceptada</p></div>
          </div>
          {workOrder.delivery.observaciones && <p className="border-t border-slate-200 px-5 py-4 text-sm text-slate-600"><strong className="text-slate-800">Observaciones:</strong> {workOrder.delivery.observaciones}</p>}
        </section>
      )}

      {(workOrder.sourceWorkOrder || (workOrder.relatedWorkOrders?.length ?? 0) > 0) && (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="history-title">
          <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4"><History className="mt-0.5 h-5 w-5 text-brand-blue" aria-hidden="true" /><div><h2 id="history-title" className="font-bold text-brand-blue">Historial relacionado</h2><p className="mt-1 text-sm text-slate-500">Cadena de órdenes asociadas al mismo caso.</p></div></div>
          <div className="divide-y divide-slate-100">
            {workOrder.sourceWorkOrder && <Link to={`/work-orders/${workOrder.sourceWorkOrder.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><History className="h-4 w-4" aria-hidden="true" /></span><div><p className="text-xs font-semibold uppercase text-slate-500">Orden de origen</p><p className="mt-1 font-mono font-bold text-brand-blue">{workOrder.sourceWorkOrder.codigo}</p></div></div><WorkOrderStatusBadge status={workOrder.sourceWorkOrder.estado} /></Link>}
            {workOrder.relatedWorkOrders?.map((related) => <Link key={related.id} to={`/work-orders/${related.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50"><div className="flex items-center gap-3"><span className={`flex h-9 w-9 items-center justify-center rounded-lg ${related.tipoIngreso === 'garantia' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{related.tipoIngreso === 'garantia' ? <ShieldCheck className="h-4 w-4" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}</span><div><p className="text-xs font-semibold uppercase text-slate-500">{related.tipoIngreso === 'garantia' ? 'Garantía' : 'Reingreso'}{related.coberturaGarantia ? ' cubierta' : ''}</p><p className="mt-1 font-mono font-bold text-brand-blue">{related.codigo}</p></div></div><WorkOrderStatusBadge status={related.estado} /></Link>)}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="audit-title">
        <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          <ClipboardCheck className="mt-0.5 h-5 w-5 text-brand-blue" aria-hidden="true" />
          <div>
            <h2 id="audit-title" className="font-bold text-brand-blue">Bitácora de actividad</h2>
            <p className="mt-1 text-sm text-slate-500">Registro cronológico de acciones críticas realizadas sobre esta orden.</p>
          </div>
        </div>
        {(workOrder.events?.length ?? 0) > 0 ? (
          <ol className="divide-y divide-slate-100">
            {workOrder.events?.map((event) => (
              <li key={event.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[10rem_1fr_auto] sm:items-center">
                <span className="w-fit rounded-md bg-brand-light px-2 py-1 text-xs font-bold text-brand-blue">
                  {WORK_ORDER_EVENT_LABELS[event.tipo]}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{event.descripcion}</p>
                  <p className="mt-1 text-xs text-slate-500">Por {event.actor?.nombre ?? 'Usuario no disponible'}</p>
                </div>
                <time className="text-xs font-medium text-slate-500" dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="px-5 py-6 text-sm text-slate-500">No existen eventos auditables registrados para esta orden.</p>
        )}
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
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 id="work-order-items-title" className="font-bold text-brand-blue">Trabajos y repuestos</h2><p className="mt-1 text-sm text-slate-500">Checklist operativo y detalle económico registrado en la orden.</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-brand-light px-3 py-1.5 text-xs font-bold text-brand-blue">{itemProgress.completed}/{itemProgress.total} completados</span>{itemProgress.active > 0 && <span className="rounded-md bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">{itemProgress.active} en proceso</span>}{canManage && workOrder.estado !== 'entregada' && workOrder.estado !== 'cancelada' ? <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg border border-brand-blue bg-white px-3 text-sm font-semibold text-brand-blue hover:bg-brand-light" onClick={() => setShowItemsModal(true)}><Pencil className="h-4 w-4" aria-hidden="true" />Editar trabajos y precios</button> : <Printer className="h-5 w-5 text-slate-400" aria-hidden="true" />}</div></div>
        <div className="max-w-full overflow-x-auto overscroll-x-contain"><table className="w-full min-w-[1060px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3 font-semibold">Descripción</th><th className="px-4 py-3 font-semibold">Avance</th><th className="px-4 py-3 font-semibold">Stock</th><th className="px-4 py-3 font-semibold">Nota</th><th className="px-4 py-3 text-right font-semibold">Cantidad</th><th className="px-4 py-3 text-right font-semibold">Precio unitario</th><th className="px-4 py-3 text-right font-semibold">Subtotal</th></tr></thead><tbody>{workOrder.items?.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="px-4 py-3 font-medium text-slate-800"><span>{item.descripcion}</span>{item.catalogItem?.codigo && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">{item.catalogItem.codigo}</span>}</td><td className="px-4 py-3"><span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{ITEM_OPERATIONAL_STATUS_LABELS[item.estadoOperativo] ?? item.estadoOperativo}</span></td><td className="px-4 py-3">{item.catalogItem?.tipo === 'parte' ? <div className="flex flex-col gap-1"><span className={`w-fit rounded-md px-2 py-1 text-xs font-bold ${item.stockConsumido ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{item.stockConsumido ? `Consumido: ${item.stockConsumidoCantidad}` : 'Pendiente consumo'}</span><span className="text-xs text-slate-500">Disponible: {item.catalogItem.stock ?? 0}</span></div> : <span className="text-slate-400">-</span>}</td><td className="max-w-64 px-4 py-3 text-slate-600">{item.notasOperativas ?? '-'}</td><td className="px-4 py-3 text-right text-slate-600">{item.cantidad}</td><td className="px-4 py-3 text-right text-slate-600">{formatClp(item.precioUnitario)}</td><td className="px-4 py-3 text-right font-semibold text-brand-blue">{formatClp(item.subtotal)}</td></tr>)}</tbody></table></div>
        {workOrder.items?.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-500">Diagnóstico inicial, sin trabajos o repuestos cargados.</p>}
        <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-4"><div className="text-right"><p className="text-xs font-semibold uppercase text-slate-500">Total estimado</p><p className="mt-1 text-2xl font-bold text-brand-blue">{formatClp(total)}</p></div></div>
      </section>

      {showCancelModal && <CancelStatusModal codigo={workOrder.codigo} isPending={statusMutation.isPending} errorMessage={statusMutation.isError ? getApiErrorMessage(statusMutation.error) : null} onClose={() => setShowCancelModal(false)} onConfirm={(motivo) => statusMutation.mutate({ id: workOrder.id, data: { nuevoEstado: 'cancelada', motivo } }, { onSuccess: () => setShowCancelModal(false) })} />}
      {showReceptionModal && <WorkOrderReceptionInspectionModal workOrder={workOrder} onClose={() => setShowReceptionModal(false)} />}
      {showItemsModal && <WorkOrderItemsModal workOrder={workOrder} onClose={() => setShowItemsModal(false)} />}
      {showDeliveryModal && <WorkOrderDeliveryModal workOrder={workOrder} onClose={() => setShowDeliveryModal(false)} />}
      {showDeliveryReceipt && <WorkOrderDeliveryReceiptModal workOrder={workOrder} onClose={() => setShowDeliveryReceipt(false)} />}
      {showReentryModal && <WorkOrderReentryModal workOrder={workOrder} onClose={() => setShowReentryModal(false)} />}
      {showPdfModal && (
        <PdfPreviewModal
          type="work-order"
          workOrder={workOrder}
          onClose={() => setShowPdfModal(false)}
        />
      )}
    </div>
  );
};

export default WorkOrderDetailPage;
