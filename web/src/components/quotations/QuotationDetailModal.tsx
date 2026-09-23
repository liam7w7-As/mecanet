import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  Calendar,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FileText,
  LoaderCircle,
  Lock,
  Pencil,
  Plus,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserRound,
  WalletCards,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { AnimateIcon } from '../animate-ui';
import ConvertQuotationModal from './ConvertQuotationModal';
import PaymentFormModal from './PaymentFormModal';
import QuotationStatusBadge from './QuotationStatusBadge';
import PdfPreviewModal from '../common/PdfPreviewModal';
import { useCatalogItems } from '../../hooks/useCatalog';
import { useQuotationPayments } from '../../hooks/usePayments';
import { useQuotation, useUpdateQuotationMutation } from '../../hooks/useQuotations';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDate, formatDateTime } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import { notifyError, notifySuccess } from '../../stores/toast.store';

import type { CatalogItem, Quotation, QuotationItem } from '../../types/entities';
import type { CatalogType, ItemOperationalStatus, QuotationItemInput } from '@unithor/shared';

export type ItemApprovalStatus = 'aprobado' | 'pendiente' | 'rechazado' | 'normal';

export const parseItemApproval = (notas: string | null | undefined): ItemApprovalStatus => {
  if (!notas) return 'normal';
  if (notas.includes('[Sugerido: Pendiente]')) return 'pendiente';
  if (notas.includes('[Sugerido: Aprobado]')) return 'aprobado';
  if (notas.includes('[Sugerido: Rechazado]')) return 'rechazado';
  return 'normal';
};

export const cleanItemNote = (notas: string | null | undefined): string => {
  if (!notas) return '';
  return notas
    .replace(/\[Sugerido: (Pendiente|Aprobado|Rechazado)\]\s*/g, '')
    .trim();
};

const formatItemNoteWithApproval = (
  status: 'aprobado' | 'pendiente' | 'rechazado',
  rawNote: string,
): string => {
  const clean = cleanItemNote(rawNote);
  const tag =
    status === 'pendiente'
      ? '[Sugerido: Pendiente]'
      : status === 'aprobado'
        ? '[Sugerido: Aprobado]'
        : '[Sugerido: Rechazado]';
  return clean ? `${tag} ${clean}` : tag;
};

const getInitials = (name?: string | null): string => {
  if (!name) return 'CL';
  const clean = name.trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CL';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

interface QuotationDetailModalProps {
  quotationId: number;
  onClose: () => void;
  onConverted?: (workOrderId: number) => void;
}

export const QuotationDetailModal = ({
  quotationId,
  onClose,
  onConverted,
}: QuotationDetailModalProps) => {
  const user = useAuthStore((state) => state.user);
  const quotationQuery = useQuotation(quotationId);
  const paymentsQuery = useQuotationPayments(quotationId);
  const updateMutation = useUpdateQuotationMutation();

  // Filter tabs: 'todos', 'estandar', 'especifico', 'parte'
  const [activeCategory, setActiveCategory] = useState<'todos' | CatalogType>('todos');

  // Inline editing state for service price
  const [editingPriceIndex, setEditingPriceIndex] = useState<number | null>(null);
  const [newPriceValue, setNewPriceValue] = useState<string>('');

  // Sub-modal triggers
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showConversionModal, setShowConversionModal] = useState(false);
  const [showAddSuggestedForm, setShowAddSuggestedForm] = useState(false);
  const [showPaymentsHistory, setShowPaymentsHistory] = useState(false);

  // Suggested item form state
  const [suggestedType, setSuggestedType] = useState<CatalogType>('parte');
  const [suggestedCatalogItemId, setSuggestedCatalogItemId] = useState<number | null>(null);
  const [suggestedDescripcion, setSuggestedDescripcion] = useState('');
  const [suggestedCantidad, setSuggestedCantidad] = useState('1');
  const [suggestedPrecio, setSuggestedPrecio] = useState('');
  const [suggestedMotivo, setSuggestedMotivo] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');

  // Catalog search for suggesting items
  const catalogQuery = useCatalogItems({
    search: catalogSearch || undefined,
    tipo: suggestedType,
    pageSize: 8,
  });

  const quotation = quotationQuery.data;
  const summary = paymentsQuery.data;

  // Permissions
  const isWorkshopLead =
    user?.role === 'jefe' || user?.role === 'admin' || user?.role === 'desarrollador';
  const isSales = user?.role === 'vendedor';
  const canUpdate = Boolean(user && hasUserPermission(user, 'comercial', 'update'));
  const canCheckDelivery = isWorkshopLead || isSales || canUpdate;
  const canEditPrice = isWorkshopLead;
  const canSuggest = isWorkshopLead || isSales || canUpdate;
  const canApprove = isSales || isWorkshopLead || canUpdate;
  const canConvert = Boolean(
    user && (hasUserPermission(user, 'comercial', 'update') || hasUserPermission(user, 'taller', 'create')),
  );

  const rawItems = quotation?.items ?? [];

  // Categorize items
  const categorizedItems = useMemo(() => {
    return rawItems.map((item, index) => {
      let tipo: CatalogType = 'parte';
      if (item.catalogItem?.tipo) {
        tipo = item.catalogItem.tipo;
      } else if (
        /servicio|mantenimiento|alineacion|balanceo|revision|diagnostico|scanner|mano\s*de\s*obra|instalacion/i.test(
          item.descripcion,
        )
      ) {
        tipo = /especifico|scanner|electronico|rectificado/i.test(item.descripcion)
          ? 'especifico'
          : 'estandar';
      }
      const approval = parseItemApproval(item.notasOperativas);
      const cleanNote = cleanItemNote(item.notasOperativas);
      return {
        ...item,
        originalIndex: index,
        computedType: tipo,
        approval,
        cleanNote,
      };
    });
  }, [rawItems]);

  const filteredItems = useMemo(() => {
    if (activeCategory === 'todos') return categorizedItems;
    return categorizedItems.filter((item) => item.computedType === activeCategory);
  }, [categorizedItems, activeCategory]);

  // Counts
  const counts = useMemo(() => {
    return {
      todos: categorizedItems.length,
      estandar: categorizedItems.filter((i) => i.computedType === 'estandar').length,
      especifico: categorizedItems.filter((i) => i.computedType === 'especifico').length,
      parte: categorizedItems.filter((i) => i.computedType === 'parte').length,
      pendientesAprobacion: categorizedItems.filter((i) => i.approval === 'pendiente').length,
    };
  }, [categorizedItems]);

  // Financial calculations
  const total = Number(quotation?.total ?? summary?.total ?? 0);
  const paid = Number(summary?.pagado ?? quotation?.pagado ?? 0);
  const balance = summary?.saldoPendiente ?? Math.max(0, total - paid);
  const paidPercent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

  // Toggle delivery / application on vehicle
  const handleToggleDelivered = (itemIndex: number) => {
    if (!quotation) return;
    const currentStatus = rawItems[itemIndex]?.estadoOperativo;
    const nextStatus: ItemOperationalStatus = currentStatus === 'completado' ? 'pendiente' : 'completado';

    const updatedItems: QuotationItemInput[] = rawItems.map((item, idx) =>
      idx === itemIndex
        ? {
            catalogItemId: item.catalogItemId,
            descripcion: item.descripcion,
            cantidad: Number(item.cantidad),
            precioUnitario: Number(item.precioUnitario),
            estadoOperativo: nextStatus,
            notasOperativas: item.notasOperativas,
          }
        : {
            catalogItemId: item.catalogItemId,
            descripcion: item.descripcion,
            cantidad: Number(item.cantidad),
            precioUnitario: Number(item.precioUnitario),
            estadoOperativo: item.estadoOperativo,
            notasOperativas: item.notasOperativas,
          },
    );

    updateMutation.mutate(
      { id: quotation.id, data: { items: updatedItems } },
      {
        onSuccess: () => {
          notifySuccess(
            nextStatus === 'completado'
              ? 'Concepto marcado como entregado / aplicado al vehículo.'
              : 'Concepto marcado como pendiente.',
          );
        },
        onError: (err) => notifyError(getApiErrorMessage(err, 'No fue posible actualizar el estado.')),
      },
    );
  };

  // Adjust service price (Jefe de Taller only)
  const handleSavePrice = (itemIndex: number) => {
    if (!quotation) return;
    const numericPrice = Number(newPriceValue);
    if (isNaN(numericPrice) || numericPrice < 0) {
      notifyError('El precio ingresado debe ser válido y mayor o igual a 0.');
      return;
    }

    const updatedItems: QuotationItemInput[] = rawItems.map((item, idx) =>
      idx === itemIndex
        ? {
            catalogItemId: item.catalogItemId,
            descripcion: item.descripcion,
            cantidad: Number(item.cantidad),
            precioUnitario: numericPrice,
            estadoOperativo: item.estadoOperativo,
            notasOperativas: item.notasOperativas,
          }
        : {
            catalogItemId: item.catalogItemId,
            descripcion: item.descripcion,
            cantidad: Number(item.cantidad),
            precioUnitario: Number(item.precioUnitario),
            estadoOperativo: item.estadoOperativo,
            notasOperativas: item.notasOperativas,
          },
    );

    updateMutation.mutate(
      { id: quotation.id, data: { items: updatedItems } },
      {
        onSuccess: () => {
          notifySuccess(`Precio actualizado a ${formatClp(numericPrice)} correctamente.`);
          setEditingPriceIndex(null);
        },
        onError: (err) => notifyError(getApiErrorMessage(err, 'No fue posible actualizar el precio.')),
      },
    );
  };

  // Customer approval decision for suggested items
  const handleCustomerApproval = (itemIndex: number, decision: 'aprobado' | 'rechazado') => {
    if (!quotation) return;
    const target = rawItems[itemIndex];
    if (!target) return;

    const newNote = formatItemNoteWithApproval(decision, target.notasOperativas ?? '');

    let updatedItems: QuotationItemInput[] = [];
    if (decision === 'rechazado') {
      // If customer rejected: keep record with 0 price so it doesn't inflate total or remove if needed
      // Keeping with note allows legal/liability transparency
      updatedItems = rawItems.map((item, idx) =>
        idx === itemIndex
          ? {
              catalogItemId: item.catalogItemId,
              descripcion: item.descripcion,
              cantidad: Number(item.cantidad),
              precioUnitario: 0, // No cost applied
              estadoOperativo: 'omitido' as const,
              notasOperativas: newNote,
            }
          : {
              catalogItemId: item.catalogItemId,
              descripcion: item.descripcion,
              cantidad: Number(item.cantidad),
              precioUnitario: Number(item.precioUnitario),
              estadoOperativo: item.estadoOperativo,
              notasOperativas: item.notasOperativas,
            },
      );
    } else {
      // Approved by client: activate normally
      updatedItems = rawItems.map((item, idx) =>
        idx === itemIndex
          ? {
              catalogItemId: item.catalogItemId,
              descripcion: item.descripcion,
              cantidad: Number(item.cantidad),
              precioUnitario: Number(item.precioUnitario),
              estadoOperativo: item.estadoOperativo,
              notasOperativas: newNote,
            }
          : {
              catalogItemId: item.catalogItemId,
              descripcion: item.descripcion,
              cantidad: Number(item.cantidad),
              precioUnitario: Number(item.precioUnitario),
              estadoOperativo: item.estadoOperativo,
              notasOperativas: item.notasOperativas,
            },
      );
    }

    updateMutation.mutate(
      { id: quotation.id, data: { items: updatedItems } },
      {
        onSuccess: () => {
          notifySuccess(
            decision === 'aprobado'
              ? 'Ítem aprobado por el cliente e integrado al presupuesto.'
              : 'Ítem marcado como rechazado por el cliente (sin cobro).',
          );
        },
        onError: (err) => notifyError(getApiErrorMessage(err, 'No fue posible registrar la decisión.')),
      },
    );
  };

  // Add suggested item from workshop
  const handleAddSuggestedItem = (event: React.FormEvent) => {
    event.preventDefault();
    if (!quotation) return;

    if (!suggestedDescripcion.trim()) {
      notifyError('Ingrese una descripción para el concepto.');
      return;
    }
    const qty = Number(suggestedCantidad);
    const price = Number(suggestedPrecio);
    if (isNaN(qty) || qty <= 0) {
      notifyError('La cantidad debe ser mayor a 0.');
      return;
    }
    if (isNaN(price) || price < 0) {
      notifyError('El precio debe ser un número válido.');
      return;
    }

    const note = formatItemNoteWithApproval(
      'pendiente',
      suggestedMotivo ? `Diagnóstico: ${suggestedMotivo.trim()}` : '',
    );

    const newItem: QuotationItemInput = {
      catalogItemId: suggestedCatalogItemId,
      descripcion: suggestedDescripcion.trim(),
      cantidad: qty,
      precioUnitario: price,
      estadoOperativo: 'pendiente',
      notasOperativas: note,
    };

    const updatedItems: QuotationItemInput[] = [
      ...rawItems.map((item) => ({
        catalogItemId: item.catalogItemId,
        descripcion: item.descripcion,
        cantidad: Number(item.cantidad),
        precioUnitario: Number(item.precioUnitario),
        estadoOperativo: item.estadoOperativo,
        notasOperativas: item.notasOperativas,
      })),
      newItem,
    ];

    updateMutation.mutate(
      { id: quotation.id, data: { items: updatedItems } },
      {
        onSuccess: () => {
          notifySuccess('Concepto sugerido agregado. Queda pendiente de aprobación del cliente.');
          setShowAddSuggestedForm(false);
          setSuggestedCatalogItemId(null);
          setSuggestedDescripcion('');
          setSuggestedCantidad('1');
          setSuggestedPrecio('');
          setSuggestedMotivo('');
          setCatalogSearch('');
        },
        onError: (err) => notifyError(getApiErrorMessage(err, 'No fue posible agregar el concepto.')),
      },
    );
  };

  const handleSelectCatalogItem = (item: CatalogItem) => {
    setSuggestedCatalogItemId(item.id);
    setSuggestedDescripcion(item.nombre);
    setSuggestedPrecio(String(item.precio));
    setSuggestedType(item.tipo);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto">
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
        aria-label="Cerrar modal de detalle"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <motion.section
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 16 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quotation-detail-title"
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-slate-50/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-blue text-white shadow-xs">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="quotation-detail-title" className="font-mono text-xl font-bold tracking-tight text-brand-blue">
                  {quotation?.codigo ?? 'Cargando cotización...'}
                </h2>
                {quotation && <QuotationStatusBadge status={quotation.estadoPago} />}
                {quotation?.workOrder ? (
                  <Link
                    to={`/work-orders/${quotation.workOrder.id}`}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-xs font-bold text-emerald-800 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100 transition-colors"
                    title={`Orden de Trabajo ${quotation.workOrder.codigo}`}
                  >
                    <Wrench className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                    <span>OT · {quotation.workOrder.codigo}</span>
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-200/70 px-2 py-0.5 text-xs font-medium text-slate-600">
                    <Clock className="h-3 w-3 text-slate-400" aria-hidden="true" />
                    Sin OT
                  </span>
                )}
              </div>
              <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                <span>Fecha: {quotation ? formatDate(quotation.createdAt) : '-'}</span>
                {quotation?.asesor?.nombre && (
                  <>
                    <span>·</span>
                    <span>Asesor: <strong>{quotation.asesor.nombre}</strong></span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
              onClick={onClose}
              aria-label="Cerrar modal"
            >
              <AnimateIcon icon={X} animation="spin" size={18} />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {quotationQuery.isPending && (
            <div className="flex min-h-64 items-center justify-center">
              <LoaderCircle className="h-8 w-8 animate-spin text-brand-blue" aria-label="Cargando datos" />
            </div>
          )}

          {quotationQuery.isError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-bold">Error al cargar la cotización</p>
              <p className="mt-1">{getApiErrorMessage(quotationQuery.error, 'No fue posible cargar el detalle.')}</p>
            </div>
          )}

          {quotation && (
            <>
              {/* Client, Vehicle & Financial KPI strip */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {/* Client Box */}
                <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-xs font-black text-brand-blue">
                    {getInitials(quotation.client?.nombre)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cliente</p>
                    <p className="truncate text-sm font-bold text-slate-900" title={quotation.client?.nombre ?? 'Sin cliente'}>
                      {quotation.client?.nombre ?? 'Sin cliente registrado'}
                    </p>
                    <p className="font-mono text-xs text-slate-500 truncate">
                      {quotation.client?.rut || quotation.client?.telefono || 'Sin identificación'}
                    </p>
                  </div>
                </div>

                {/* Vehicle Box */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vehículo</p>
                    <p className="truncate text-sm font-bold text-slate-900" title={[quotation.vehicle?.marca, quotation.vehicle?.modelo].filter(Boolean).join(' ') || 'Sin datos'}>
                      {[quotation.vehicle?.marca, quotation.vehicle?.modelo].filter(Boolean).join(' ') || 'Sin vehículo'}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      ID #{quotation.vehicleId ?? '-'}
                    </p>
                  </div>
                  {quotation.vehicle?.patente ? (
                    <span className="shrink-0 rounded bg-brand-yellow px-2.5 py-1 font-mono text-xs font-extrabold text-brand-dark shadow-2xs">
                      {quotation.vehicle.patente}
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-slate-400">Sin patente</span>
                  )}
                </div>

                {/* Financial Overview */}
                <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Cotizado</p>
                      <p className="text-base font-black text-slate-900">{formatClp(total)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-brand-blue">Saldo Pendiente</p>
                      <p className={`text-base font-black ${balance === 0 ? 'text-emerald-600' : 'text-brand-blue'}`}>
                        {formatClp(balance)}
                      </p>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2">
                    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${paidPercent}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                        className="h-full rounded-full bg-emerald-500"
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                      <span>Pagado: {formatClp(paid)}</span>
                      <span className="font-mono font-bold">{paidPercent}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Items Management Section */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                {/* Tabs & Add Action */}
                <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* Filter category pills */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setActiveCategory('todos')}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold transition-colors ${
                        activeCategory === 'todos'
                          ? 'bg-brand-blue text-white shadow-2xs'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      <Boxes className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Todos</span>
                      <span className="ml-1 rounded-full bg-black/10 px-1.5 py-0.2 text-[10px]">
                        {counts.todos}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveCategory('estandar')}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold transition-colors ${
                        activeCategory === 'estandar'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Servicios Estándar</span>
                      <span className="ml-1 rounded-full bg-black/10 px-1.5 py-0.2 text-[10px]">
                        {counts.estandar}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveCategory('especifico')}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold transition-colors ${
                        activeCategory === 'especifico'
                          ? 'bg-purple-600 text-white shadow-2xs'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Servicios Específicos</span>
                      <span className="ml-1 rounded-full bg-black/10 px-1.5 py-0.2 text-[10px]">
                        {counts.especifico}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveCategory('parte')}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold transition-colors ${
                        activeCategory === 'parte'
                          ? 'bg-amber-600 text-white shadow-2xs'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      <Boxes className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Repuestos y Accesorios</span>
                      <span className="ml-1 rounded-full bg-black/10 px-1.5 py-0.2 text-[10px]">
                        {counts.parte}
                      </span>
                    </button>
                  </div>

                  {/* Suggest Item Button */}
                  {canSuggest && (
                    <button
                      type="button"
                      onClick={() => setShowAddSuggestedForm(!showAddSuggestedForm)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-yellow px-3 py-1.5 text-xs font-bold text-brand-dark shadow-xs hover:bg-yellow-400 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Sugerir Repuesto / Servicio</span>
                    </button>
                  )}
                </div>

                {/* Suggested Items Notice if any pending */}
                {counts.pendientesAprobacion > 0 && (
                  <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50/80 px-4 py-2.5 text-xs text-amber-900">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" aria-hidden="true" />
                      <span>
                        Hay <strong>{counts.pendientesAprobacion}</strong> {counts.pendientesAprobacion === 1 ? 'concepto sugerido' : 'conceptos sugeridos'} por el taller pendientes de aprobación del cliente.
                      </span>
                    </div>
                  </div>
                )}

                {/* Add Suggested Item Drawer Form */}
                <AnimatePresence>
                  {showAddSuggestedForm && (
                    <motion.form
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      onSubmit={handleAddSuggestedItem}
                      className="border-b border-slate-200 bg-amber-50/40 p-4 overflow-hidden"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Wrench className="h-4 w-4 text-brand-blue" aria-hidden="true" />
                          <h3 className="text-sm font-bold text-slate-800">
                            Sugerir nuevo concepto técnico (Hallazgo en taller)
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAddSuggestedForm(false)}
                          className="text-xs text-slate-500 hover:text-slate-800"
                        >
                          Cancelar
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                        <div>
                          <label className="block text-[11px] font-bold uppercase text-slate-600">Tipo</label>
                          <select
                            value={suggestedType}
                            onChange={(e) => {
                              setSuggestedType(e.target.value as CatalogType);
                              setSuggestedCatalogItemId(null);
                            }}
                            className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-medium outline-none focus:border-brand-blue"
                          >
                            <option value="parte">Repuesto / Accesorio</option>
                            <option value="estandar">Servicio Estándar</option>
                            <option value="especifico">Servicio Específico</option>
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-bold uppercase text-slate-600">
                            Buscar en catálogo o escribir descripción
                          </label>
                          <input
                            type="text"
                            value={suggestedDescripcion}
                            onChange={(e) => {
                              setSuggestedDescripcion(e.target.value);
                              setCatalogSearch(e.target.value);
                            }}
                            placeholder="Ej. Pastillas de freno delanteras..."
                            className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-xs outline-none focus:border-brand-blue"
                          />
                          {/* Quick catalog match results dropdown */}
                          {catalogSearch && catalogQuery.data && catalogQuery.data.items.length > 0 && (
                            <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-md text-xs">
                              {catalogQuery.data.items.map((catItem) => (
                                <button
                                  key={catItem.id}
                                  type="button"
                                  onClick={() => handleSelectCatalogItem(catItem)}
                                  className="w-full text-left px-2 py-1.5 hover:bg-slate-100 rounded flex items-center justify-between"
                                >
                                  <span className="font-semibold text-slate-800">{catItem.nombre}</span>
                                  <span className="font-mono text-emerald-700">{formatClp(catItem.precio)}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold uppercase text-slate-600">Cantidad</label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={suggestedCantidad}
                            onChange={(e) => setSuggestedCantidad(e.target.value)}
                            className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-xs outline-none focus:border-brand-blue"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold uppercase text-slate-600">Precio Unitario</label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={suggestedPrecio}
                            onChange={(e) => setSuggestedPrecio(e.target.value)}
                            placeholder="0"
                            className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-xs outline-none focus:border-brand-blue"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-bold uppercase text-slate-600">
                            Motivo / Diagnóstico técnico del taller (Justificación)
                          </label>
                          <input
                            type="text"
                            value={suggestedMotivo}
                            onChange={(e) => setSuggestedMotivo(e.target.value)}
                            placeholder="Ej. Desgaste 90%, riesgo de rotura inminente detectado en inspección..."
                            className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-xs outline-none focus:border-brand-blue"
                          />
                        </div>

                        <div className="sm:col-span-4 flex justify-end gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setShowAddSuggestedForm(false)}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={updateMutation.isPending}
                            className="rounded-lg bg-brand-blue px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-brand-dark disabled:opacity-50"
                          >
                            {updateMutation.isPending ? 'Guardando...' : 'Agregar como Sugerido'}
                          </button>
                        </div>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>

                {/* Items Table */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="bg-slate-50 text-[11px] uppercase font-bold text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-3.5 py-2.5 w-10 text-center">Aplicado</th>
                        <th className="px-3.5 py-2.5">Concepto / Categoría</th>
                        <th className="px-3.5 py-2.5">Estado Aprobación Cliente</th>
                        <th className="px-3.5 py-2.5 text-center">Cant.</th>
                        <th className="px-3.5 py-2.5 text-right">Precio Unitario</th>
                        <th className="px-3.5 py-2.5 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
                            No hay conceptos en esta categoría.
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map((item) => {
                          const isDelivered = item.estadoOperativo === 'completado';
                          const isSuggested = item.approval !== 'normal';
                          const isPendingApproval = item.approval === 'pendiente';
                          const isApproved = item.approval === 'aprobado' || item.approval === 'normal';
                          const isRejected = item.approval === 'rechazado';
                          const isService = item.computedType === 'estandar' || item.computedType === 'especifico';
                          const isEditingPrice = editingPriceIndex === item.originalIndex;

                          return (
                            <tr
                              key={item.id ?? item.originalIndex}
                              className={`transition-colors ${
                                isRejected
                                  ? 'bg-slate-50/50 opacity-60'
                                  : isPendingApproval
                                    ? 'bg-amber-50/40 hover:bg-amber-50/70'
                                    : 'hover:bg-slate-50/60'
                              }`}
                            >
                              {/* 1. Check de Entrega / Aplicación al Vehículo */}
                              <td className="px-3.5 py-3 text-center">
                                {canCheckDelivery && !isRejected ? (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleDelivered(item.originalIndex)}
                                    disabled={updateMutation.isPending}
                                    title={
                                      isDelivered
                                        ? 'Marcar como pendiente'
                                        : 'Marcar como aplicado / entregado al vehículo'
                                    }
                                    className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-all ${
                                      isDelivered
                                        ? 'border-emerald-500 bg-emerald-500 text-white shadow-2xs hover:bg-emerald-600'
                                        : 'border-slate-300 bg-white text-slate-300 hover:border-slate-400 hover:text-slate-500'
                                    }`}
                                  >
                                    <Check className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
                                  </button>
                                ) : (
                                  <span className="inline-flex h-6 w-6 items-center justify-center text-slate-300">
                                    -
                                  </span>
                                )}
                              </td>

                              {/* 2. Concept Description & Category Badge */}
                              <td className="px-3.5 py-3">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-slate-900">{item.descripcion}</span>
                                    {/* Category badge */}
                                    {item.computedType === 'estandar' ? (
                                      <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 ring-1 ring-inset ring-blue-200">
                                        <Wrench className="h-2.5 w-2.5" />
                                        Estándar
                                      </span>
                                    ) : item.computedType === 'especifico' ? (
                                      <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 ring-1 ring-inset ring-purple-200">
                                        <Zap className="h-2.5 w-2.5" />
                                        Específico
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-inset ring-amber-200">
                                        <Boxes className="h-2.5 w-2.5" />
                                        Repuesto
                                      </span>
                                    )}

                                    {/* Physical delivery status pill */}
                                    {isDelivered && (
                                      <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                                        <CheckCircle2 className="h-2.5 w-2.5" />
                                        Aplicado
                                      </span>
                                    )}
                                  </div>

                                  {/* Custom Note or Justification */}
                                  {item.cleanNote && (
                                    <p className="text-[11px] text-slate-500 italic">
                                      <span className="font-semibold not-italic text-slate-400">Nota:</span> {item.cleanNote}
                                    </p>
                                  )}
                                </div>
                              </td>

                              {/* 3. Customer Approval Status & Decision Actions */}
                              <td className="px-3.5 py-3">
                                {isPendingApproval ? (
                                  <div className="flex flex-col gap-1.5">
                                    <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 font-bold text-amber-800">
                                      <Clock className="h-3 w-3 text-amber-600" />
                                      Pendiente Aprobación Cliente
                                    </span>
                                    {canApprove && (
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => handleCustomerApproval(item.originalIndex, 'aprobado')}
                                          disabled={updateMutation.isPending}
                                          className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-2xs hover:bg-emerald-700 transition-colors"
                                          title="Registrar que el cliente aprobó este concepto"
                                        >
                                          <ThumbsUp className="h-2.5 w-2.5" />
                                          Aprobar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleCustomerApproval(item.originalIndex, 'rechazado')}
                                          disabled={updateMutation.isPending}
                                          className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 hover:bg-red-200 transition-colors"
                                          title="Registrar que el cliente rechazó este concepto"
                                        >
                                          <ThumbsDown className="h-2.5 w-2.5" />
                                          Rechazar
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ) : isApproved && isSuggested ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                    Aprobado por Cliente
                                  </span>
                                ) : isRejected ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-slate-200 px-2 py-0.5 font-semibold text-slate-600 line-through">
                                    Rechazado por Cliente
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-medium">Cotizado original</span>
                                )}
                              </td>

                              {/* 4. Quantity */}
                              <td className="px-3.5 py-3 text-center font-mono font-medium text-slate-700">
                                {item.cantidad}
                              </td>

                              {/* 5. Unit Price & Jefe de Taller Adjustment */}
                              <td className="px-3.5 py-3 text-right">
                                {isEditingPrice ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <input
                                      type="number"
                                      min="0"
                                      value={newPriceValue}
                                      onChange={(e) => setNewPriceValue(e.target.value)}
                                      className="h-7 w-24 rounded border border-brand-blue px-1.5 text-right font-mono text-xs font-bold outline-none"
                                      autoFocus
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleSavePrice(item.originalIndex)}
                                      disabled={updateMutation.isPending}
                                      className="flex h-7 w-7 items-center justify-center rounded bg-emerald-600 text-white hover:bg-emerald-700"
                                      title="Guardar precio"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingPriceIndex(null)}
                                      className="flex h-7 w-7 items-center justify-center rounded bg-slate-200 text-slate-600 hover:bg-slate-300"
                                      title="Cancelar"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-1.5 font-mono">
                                    <span className="font-semibold text-slate-800">
                                      {formatClp(item.precioUnitario)}
                                    </span>
                                    {/* Edit price action (Only Jefe de Taller, Admin, Dev on services) */}
                                    {isService && canEditPrice && !isRejected && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingPriceIndex(item.originalIndex);
                                          setNewPriceValue(String(item.precioUnitario));
                                        }}
                                        className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-brand-blue transition-colors"
                                        title="Ajustar precio de servicio (Jefe de Taller)"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                    )}
                                    {/* Lock indicator for sales on service price */}
                                    {isService && !canEditPrice && (
                                      <span
                                        className="text-slate-300"
                                        title="Solo el Jefe de Taller puede ajustar precios de servicio"
                                      >
                                        <Lock className="h-3 w-3" />
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* 6. Subtotal */}
                              <td className="px-3.5 py-3 text-right font-mono font-bold text-slate-900">
                                {formatClp(item.subtotal)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payments History Toggle & Quick Action */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                <button
                  type="button"
                  onClick={() => setShowPaymentsHistory(!showPaymentsHistory)}
                  className="flex w-full items-center justify-between p-3.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <WalletCards className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                    <span>Historial de Abonos y Pagos ({summary?.payments.length ?? 0})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-emerald-700 font-bold">
                      Abonado: {formatClp(paid)}
                    </span>
                    {showPaymentsHistory ? (
                      <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {showPaymentsHistory && (
                  <div className="border-t border-slate-200 p-3.5 bg-slate-50/50">
                    {summary?.payments && summary.payments.length > 0 ? (
                      <div className="divide-y divide-slate-200 text-xs">
                        {summary.payments.map((p) => (
                          <div key={p.id} className="py-2 flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-slate-800">
                                {formatClp(p.monto)} · <span className="capitalize">{p.metodo}</span>
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {formatDateTime(p.fecha)} por {p.creator?.nombre ?? 'Sistema'}
                              </p>
                            </div>
                            <span className="rounded bg-emerald-100 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-800">
                              Registrado
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center py-4 text-xs text-slate-400">
                        Aún no hay abonos registrados para esta cotización.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Sticky Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/90 px-5 py-3.5">
          {/* Left Actions: Abono & Convertir */}
          <div className="flex items-center gap-2">
            {balance > 0 && (
              <button
                type="button"
                onClick={() => setShowPaymentModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors"
              >
                <WalletCards className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Registrar Abono</span>
              </button>
            )}

            {quotation && canConvert && quotation.workOrderId === null && (
              <button
                type="button"
                onClick={() => setShowConversionModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-yellow px-3 py-2 text-xs font-bold text-brand-dark shadow-xs hover:bg-yellow-400 transition-colors"
              >
                <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Convertir a OT</span>
              </button>
            )}
          </div>

          {/* Right Actions: PDF & Close */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPdfModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-brand-blue" aria-hidden="true" />
              <span>Ver PDF / Imprimir</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-300 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </motion.section>

      {/* Sub-Modals */}
      {showPaymentModal && quotation && (
        <PaymentFormModal
          quotationId={quotation.id}
          codigo={quotation.codigo}
          saldoPendiente={balance}
          onClose={() => setShowPaymentModal(false)}
        />
      )}

      {showConversionModal && quotation && (
        <ConvertQuotationModal
          quotationId={quotation.id}
          codigo={quotation.codigo}
          notas={quotation.notas}
          onClose={() => setShowConversionModal(false)}
          onConverted={(workOrderId) => {
            setShowConversionModal(false);
            if (onConverted) onConverted(workOrderId);
          }}
        />
      )}

      {showPdfModal && quotation && (
        <PdfPreviewModal
          type="quotation"
          quotation={quotation}
          onClose={() => setShowPdfModal(false)}
        />
      )}
    </div>
  );
};

export default QuotationDetailModal;
