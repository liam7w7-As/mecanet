import {
  PURCHASE_DOCUMENT_TYPES,
  PURCHASE_DOCUMENT_TYPE_LABELS,
  PURCHASE_PAYMENT_TYPES,
  PURCHASE_PAYMENT_TYPE_LABELS,
  PURCHASE_STATUSES,
  PURCHASE_STATUS_LABELS,
} from '@unithor/shared';
import {
  AlertCircle,
  Ban,
  FileSpreadsheet,
  FileText,
  Landmark,
  LoaderCircle,
  Plus,
  ReceiptText,
  Search,
  ShoppingCart,
  Truck,
  WalletCards,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Pagination from '../../components/common/Pagination';
import SupplierListModal from '../../components/purchases/SupplierListModal';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDownloadPurchaseReport, usePurchases } from '../../hooks/usePurchases';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDate, formatDateTime } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import { notifyError, notifySuccess } from '../../stores/toast.store';

import type { PurchaseQueryParams } from '../../hooks/usePurchases';
import type { Purchase } from '../../types/entities';
import type {
  PurchaseDocumentType,
  PurchasePaymentType,
  PurchaseReportQueryInput,
  PurchaseStatus,
} from '@unithor/shared';

type StatusFilter = PurchaseStatus | 'all';
type PaymentFilter = PurchasePaymentType | 'all';
type DocumentFilter = PurchaseDocumentType | 'all';

const statusBadge = (purchase: Purchase) =>
  purchase.estado === 'registrada' ? (
    <span className="inline-flex items-center gap-1 rounded-md bg-brand-mintPale px-2 py-1 text-xs font-bold text-brand-mintInk">
      <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
      {PURCHASE_STATUS_LABELS[purchase.estado]}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md bg-brand-coralPale px-2 py-1 text-xs font-bold text-brand-coralInk">
      <Ban className="h-3.5 w-3.5" aria-hidden="true" />
      {PURCHASE_STATUS_LABELS[purchase.estado]}
    </span>
  );

const PurchaseSkeleton = () => (
  <>
    {Array.from({ length: 6 }, (_, index) => (
      <tr key={index} className="border-t border-brand-line">
        {Array.from({ length: 8 }, (_, cell) => (
          <td key={cell} className="px-3 py-3.5">
            <div className="h-4 animate-pulse rounded bg-brand-pale" />
          </td>
        ))}
      </tr>
    ))}
  </>
);

export const PurchasesPage = () => {
  const user = useAuthStore((state) => state.user);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [payment, setPayment] = useState<PaymentFilter>('all');
  const [documentType, setDocumentType] = useState<DocumentFilter>('all');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [page, setPage] = useState(1);
  const [showSuppliers, setShowSuppliers] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 350);

  const queryParams: PurchaseQueryParams = {
    page,
    pageSize: 20,
    search: debouncedSearch || undefined,
    estado: status === 'all' ? undefined : status,
    formaPago: payment === 'all' ? undefined : payment,
    tipoDocumento: documentType === 'all' ? undefined : documentType,
    fechaDesde: fechaDesde || undefined,
    fechaHasta: fechaHasta || undefined,
  };
  const purchasesQuery = usePurchases(queryParams);
  const reportMutation = useDownloadPurchaseReport();
  const canCreate = Boolean(user && hasUserPermission(user, 'compras', 'create'));
  const canExport = Boolean(user && hasUserPermission(user, 'compras', 'export'));

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, payment, documentType, fechaDesde, fechaHasta]);

  const purchaseFilters: PurchaseReportQueryInput = {
    search: debouncedSearch || undefined,
    estado: status === 'all' ? undefined : status,
    formaPago: payment === 'all' ? undefined : payment,
    tipoDocumento: documentType === 'all' ? undefined : documentType,
    fechaDesde: fechaDesde || undefined,
    fechaHasta: fechaHasta || undefined,
  };

  const downloadReport = (format: 'pdf' | 'excel'): void => {
    reportMutation.mutate(
      { format, filters: purchaseFilters },
      {
        onSuccess: () =>
          notifySuccess(
            format === 'pdf'
              ? 'Reporte PDF de compras descargado.'
              : 'Reporte Excel de compras descargado.',
          ),
        onError: (error) =>
          notifyError(getApiErrorMessage(error, 'No fue posible generar el reporte de compras.')),
      },
    );
  };

  const summary = purchasesQuery.data?.summary;
  const purchases = purchasesQuery.data?.items ?? [];

  return (
    <div className="min-w-0 space-y-5">
      <header className="page-banner max-sm:!h-auto max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <div className="min-w-0">
          <p className="text-sm text-brand-muted">Egresos con comprobante</p>
          <h1 className="mt-1">Compras</h1>
        </div>
        <div className="relative z-[1] ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            className="secondary-button text-sm font-medium"
            onClick={() => setShowSuppliers(true)}
          >
            <Truck className="h-4 w-4" aria-hidden="true" />
            Proveedores
          </button>
          {canExport && (
            <>
              <button
                type="button"
                className="secondary-button text-sm font-medium"
                onClick={() => downloadReport('pdf')}
                disabled={reportMutation.isPending}
                title="Descargar reporte PDF con el filtro actual"
              >
                {reportMutation.isPending && reportMutation.variables?.format === 'pdf' ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <FileText className="h-4 w-4" aria-hidden="true" />
                )}
                PDF
              </button>
              <button
                type="button"
                className="secondary-button text-sm font-medium"
                onClick={() => downloadReport('excel')}
                disabled={reportMutation.isPending}
                title="Descargar reporte Excel con el filtro actual"
              >
                {reportMutation.isPending && reportMutation.variables?.format === 'excel' ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                )}
                Excel
              </button>
            </>
          )}
          {canCreate && (
            <Link to="/purchases/new" className="primary-button">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nueva compra
            </Link>
          )}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen de compras">
        <article className="rounded-xl border border-brand-line bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
              Compras
            </p>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-pale text-brand-primaryInk">
              <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-brand-primaryInk">{summary?.count ?? 0}</p>
          <p className="mt-1 text-xs text-brand-muted">Según los filtros aplicados</p>
        </article>
        <article className="rounded-xl border border-brand-line bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Neto</p>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-mintPale text-brand-mintInk">
              <Landmark className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-brand-primaryInk">
            {formatClp(summary?.neto ?? 0)}
          </p>
          <p className="mt-1 text-xs text-brand-muted">Compras registradas, sin anuladas</p>
        </article>
        <article className="rounded-xl border border-brand-line bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">IVA 19%</p>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-goldPale text-brand-goldInk">
              <ReceiptText className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-brand-primaryInk">
            {formatClp(summary?.iva ?? 0)}
          </p>
          <p className="mt-1 text-xs text-brand-muted">Solo compras con IVA</p>
        </article>
        <article className="rounded-xl border border-brand-line bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
              Total comprado
            </p>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-coralPale text-brand-coralInk">
              <WalletCards className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-brand-primaryInk">
            {formatClp(summary?.total ?? 0)}
          </p>
          <p className="mt-1 text-xs text-brand-muted">
            Crédito pendiente: {formatClp(summary?.pendiente ?? 0)}
          </p>
        </article>
      </section>

      <section
        className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm"
        aria-label="Listado de compras"
      >
        <div className="border-b border-brand-line p-4 sm:p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_150px_160px_170px_150px_150px]">
            <label className="relative">
              <span className="sr-only">Buscar compras</span>
              <Search
                className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-brand-muted"
                aria-hidden="true"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-11 w-full rounded-xl border border-brand-line pl-9 pr-3 text-sm outline-none transition-shadow focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15"
                placeholder="Buscar código, proveedor, folio o patente"
              />
            </label>
            <label>
              <span className="sr-only">Filtrar por estado</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as StatusFilter)}
                className="h-11 w-full rounded-xl border border-brand-line bg-white px-3 text-sm text-brand-ink outline-none focus:border-brand-primary"
              >
                <option value="all">Todos los estados</option>
                {PURCHASE_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {PURCHASE_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Filtrar por forma de pago</span>
              <select
                value={payment}
                onChange={(event) => setPayment(event.target.value as PaymentFilter)}
                className="h-11 w-full rounded-xl border border-brand-line bg-white px-3 text-sm text-brand-ink outline-none focus:border-brand-primary"
              >
                <option value="all">Toda forma de pago</option>
                {PURCHASE_PAYMENT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {PURCHASE_PAYMENT_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Filtrar por documento</span>
              <select
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value as DocumentFilter)}
                className="h-11 w-full rounded-xl border border-brand-line bg-white px-3 text-sm text-brand-ink outline-none focus:border-brand-primary"
              >
                <option value="all">Todo documento</option>
                {PURCHASE_DOCUMENT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {PURCHASE_DOCUMENT_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Fecha de registro desde</span>
              <input
                type="date"
                value={fechaDesde}
                max={fechaHasta || undefined}
                onChange={(event) => setFechaDesde(event.target.value)}
                className="h-11 w-full rounded-xl border border-brand-line px-3 text-sm text-brand-ink outline-none focus:border-brand-primary"
                aria-label="Fecha de registro desde"
              />
            </label>
            <label>
              <span className="sr-only">Fecha de registro hasta</span>
              <input
                type="date"
                value={fechaHasta}
                min={fechaDesde || undefined}
                onChange={(event) => setFechaHasta(event.target.value)}
                className="h-11 w-full rounded-xl border border-brand-line px-3 text-sm text-brand-ink outline-none focus:border-brand-primary"
                aria-label="Fecha de registro hasta"
              />
            </label>
          </div>
        </div>

        {(purchasesQuery.isError || reportMutation.isError) && (
          <div
            className="flex items-center gap-2 border-b border-brand-coral/30 bg-brand-coralPale px-4 py-3 text-sm text-brand-coralInk"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {getApiErrorMessage(
              purchasesQuery.error ?? reportMutation.error,
              'No fue posible cargar las compras.',
            )}
          </div>
        )}

        <div className="max-w-full overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="bg-brand-line/40 text-[11px] uppercase text-brand-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Compra</th>
                <th className="px-4 py-3 font-semibold">Registro</th>
                <th className="px-4 py-3 font-semibold">Proveedor</th>
                <th className="px-4 py-3 font-semibold">Comprobante</th>
                <th className="px-4 py-3 font-semibold">Asociación</th>
                <th className="px-4 py-3 font-semibold">Pago</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {purchasesQuery.isPending ? (
                <PurchaseSkeleton />
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-14 text-center text-brand-muted">
                    <ShoppingCart
                      className="mx-auto h-10 w-10 text-brand-muted/40"
                      aria-hidden="true"
                    />
                    <p className="mt-2 text-sm font-semibold text-brand-ink">
                      No hay compras que coincidan con el filtro.
                    </p>
                    <p className="mt-1 text-xs">
                      Registra una compra con su comprobante para verla aquí.
                    </p>
                  </td>
                </tr>
              ) : (
                purchases.map((purchase) => {
                  const pendingCredit =
                    purchase.formaPago === 'credito' &&
                    !purchase.pagadoAt &&
                    purchase.estado === 'registrada';
                  const vehicle = purchase.vehicle ?? purchase.fleetVehicle;

                  return (
                    <tr
                      key={purchase.id}
                      className="border-t border-brand-line align-top transition-colors hover:bg-brand-pale/30"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/purchases/${purchase.id}`}
                          className="font-mono text-xs font-bold text-brand-primaryInk hover:underline"
                        >
                          {purchase.codigo}
                        </Link>
                        <span className="mt-0.5 block text-xs text-brand-muted">
                          {purchase.items.length}{' '}
                          {purchase.items.length === 1 ? 'ítem' : 'ítems'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-brand-muted">
                        {formatDateTime(purchase.createdAt)}
                      </td>
                      <td className="max-w-[210px] px-4 py-3">
                        <span className="block truncate font-semibold text-brand-ink">
                          {purchase.supplier.nombre}
                        </span>
                        {!purchase.supplier.datosCompletos && (
                          <span className="mt-1 inline-flex rounded bg-brand-goldPale px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-goldInk">
                            Datos incompletos
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-brand-muted">
                        <span className="block font-semibold text-brand-ink">
                          {PURCHASE_DOCUMENT_TYPE_LABELS[purchase.tipoDocumento]}
                        </span>
                        <span className="block font-mono">Folio {purchase.folio}</span>
                        <span className="block">Emitido {formatDate(purchase.fechaEmision)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-brand-muted">
                        {vehicle ? (
                          <>
                            <span className="block font-mono font-bold uppercase text-brand-ink">
                              {vehicle.patente}
                            </span>
                            <span className="block">
                              {purchase.origenVehiculo === 'flota' ? 'Flota' : 'Taller'}
                              {vehicle.marca ? ` · ${vehicle.marca}` : ''}
                            </span>
                          </>
                        ) : (
                          <span className="block">Sin vehículo</span>
                        )}
                        {purchase.workOrder && (
                          <span className="mt-1 block font-mono text-[11px] text-brand-primaryInk">
                            {purchase.workOrder.codigo}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-brand-muted">
                        <span className="block font-semibold text-brand-ink">
                          {PURCHASE_PAYMENT_TYPE_LABELS[purchase.formaPago]}
                        </span>
                        {pendingCredit ? (
                          <span className="mt-1 inline-flex rounded bg-brand-goldPale px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-goldInk">
                            Pendiente
                          </span>
                        ) : purchase.formaPago === 'credito' ? (
                          <span className="mt-1 inline-flex rounded bg-brand-mintPale px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-mintInk">
                            Pagada
                          </span>
                        ) : (
                          <span className="mt-1 inline-flex rounded bg-brand-pale px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-primaryInk">
                            Egreso al registrar
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <span className="block font-semibold text-brand-primaryInk">
                          {formatClp(purchase.total)}
                        </span>
                        <span className="block text-[11px] text-brand-muted">
                          Neto {formatClp(purchase.neto)}
                        </span>
                      </td>
                      <td className="px-4 py-3">{statusBadge(purchase)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            to={`/purchases/${purchase.id}`}
                            className="inline-flex h-9 items-center rounded-lg border border-brand-line px-2.5 text-xs font-semibold text-brand-primaryInk hover:bg-brand-pale"
                          >
                            Ver
                          </Link>
                          <a
                            href={`/api/purchases/${purchase.id}/receipt`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-brand-line text-brand-muted hover:bg-brand-pale hover:text-brand-primaryInk"
                            title="Ver comprobante"
                            aria-label={`Ver comprobante de ${purchase.codigo}`}
                          >
                            <ReceiptText className="h-4 w-4" aria-hidden="true" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          totalPages={purchasesQuery.data?.totalPages ?? 0}
          total={purchasesQuery.data?.total ?? 0}
          onPageChange={setPage}
        />
      </section>

      {showSuppliers && <SupplierListModal onClose={() => setShowSuppliers(false)} />}
    </div>
  );
};

export default PurchasesPage;
