import {
  PURCHASE_DOCUMENT_TYPE_LABELS,
  PURCHASE_PAYMENT_TYPE_LABELS,
  PURCHASE_STATUS_LABELS,
} from '@unithor/shared';
import {
  AlertCircle,
  ArrowLeft,
  BadgeAlert,
  BadgeCheck,
  Ban,
  Boxes,
  Building2,
  Car,
  Download,
  FileText,
  Pencil,
  ReceiptText,
  Truck,
  WalletCards,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import PurchasePaymentModal from '../../components/purchases/PurchasePaymentModal';
import PurchaseVoidModal from '../../components/purchases/PurchaseVoidModal';
import SupplierFormModal from '../../components/purchases/SupplierFormModal';
import { usePurchase, useSupplier } from '../../hooks/usePurchases';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDate, formatDateTime } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import {
  PAYMENT_METHOD_LABELS,
  formatFileSize,
} from '../../lib/purchase-labels';
import { useAuthStore } from '../../stores/auth.store';

import type { ReactNode } from 'react';

const DetailItem = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">{label}</dt>
    <dd className="mt-0.5 break-words text-sm font-medium text-brand-ink">{children}</dd>
  </div>
);

const DetailSkeleton = () => (
  <div className="min-w-0 space-y-5" aria-label="Cargando compra">
    <div className="h-20 animate-pulse rounded-xl bg-brand-pale" />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="h-28 animate-pulse rounded-xl bg-brand-pale" />
      ))}
    </div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="h-80 animate-pulse rounded-xl bg-brand-pale" />
      <div className="h-80 animate-pulse rounded-xl bg-brand-pale" />
    </div>
  </div>
);

export const PurchaseDetailPage = () => {
  const { id } = useParams();
  const user = useAuthStore((state) => state.user);
  const purchaseId = Number(id);
  const validId = Number.isInteger(purchaseId) && purchaseId > 0 ? purchaseId : null;
  const purchaseQuery = usePurchase(validId);
  const purchase = purchaseQuery.data;
  const supplierQuery = useSupplier(purchase?.supplierId ?? null);
  const [showVoid, setShowVoid] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showSupplierForm, setShowSupplierForm] = useState(false);

  if (purchaseQuery.isPending) {
    return <DetailSkeleton />;
  }

  if (purchaseQuery.isError || !purchase) {
    return (
      <div className="min-w-0 space-y-5">
        <Link
          to="/purchases"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-brand-line bg-white px-4 text-sm font-semibold text-brand-ink hover:bg-brand-pale"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver a compras
        </Link>
        <div
          className="flex items-center gap-2 rounded-xl border border-brand-coral/30 bg-brand-coralPale px-4 py-3 text-sm text-brand-coralInk"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {getApiErrorMessage(purchaseQuery.error, 'No fue posible cargar la compra.')}
        </div>
      </div>
    );
  }

  const canUpdate = Boolean(user && hasUserPermission(user, 'compras', 'update'));
  const canVoid = Boolean(
    user &&
      (user.role === 'admin' || user.role === 'desarrollador') &&
      hasUserPermission(user, 'compras', 'delete'),
  );
  const canEditSupplier = Boolean(
    user && (user.role === 'admin' || user.role === 'desarrollador'),
  );
  const pendingCredit =
    purchase.formaPago === 'credito' &&
    !purchase.pagadoAt &&
    purchase.estado === 'registrada';
  const vehicle = purchase.vehicle ?? purchase.fleetVehicle;
  const isFleet = purchase.origenVehiculo === 'flota';
  const paymentStatus =
    purchase.formaPago === 'contado'
      ? 'Pagada al registrar'
      : purchase.pagadoAt
        ? 'Pagada'
        : 'Pendiente';

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Link
            to="/purchases"
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-brand-line bg-white text-brand-muted transition-colors hover:bg-brand-pale"
            aria-label="Volver a compras"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-brand-muted">Detalle de compra</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-2xl font-bold text-brand-primaryInk sm:text-3xl">
                {purchase.codigo}
              </h1>
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ${
                  purchase.estado === 'registrada'
                    ? 'bg-brand-mintPale text-brand-mintInk'
                    : 'bg-brand-coralPale text-brand-coralInk'
                }`}
              >
                {purchase.estado === 'registrada' ? (
                  <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {PURCHASE_STATUS_LABELS[purchase.estado]}
              </span>
            </div>
            <p className="mt-1 text-sm text-brand-muted">
              Registrada el {formatDateTime(purchase.createdAt)}
              {purchase.creator ? ` por ${purchase.creator.nombre}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 sm:justify-end">
          <a
            href={`/api/purchases/${purchase.id}/receipt`}
            target="_blank"
            rel="noreferrer"
            className="secondary-button"
          >
            <ReceiptText className="h-4 w-4" aria-hidden="true" />
            Ver comprobante
          </a>
          <a
            href={`/api/purchases/${purchase.id}/receipt?download=1`}
            className="secondary-button"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Descargar
          </a>
          {canUpdate && pendingCredit && (
            <button
              type="button"
              className="primary-button"
              onClick={() => setShowPayment(true)}
            >
              <WalletCards className="h-4 w-4" aria-hidden="true" />
              Registrar pago
            </button>
          )}
          {canVoid && purchase.estado === 'registrada' && (
            <button
              type="button"
              className="danger-button"
              onClick={() => setShowVoid(true)}
            >
              <Ban className="h-4 w-4" aria-hidden="true" />
              Anular compra
            </button>
          )}
        </div>
      </header>

      {purchase.estado === 'anulada' && (
        <div
          className="flex items-start gap-2 rounded-xl border border-brand-coral/30 bg-brand-coralPale px-4 py-3 text-sm text-brand-coralInk"
          role="alert"
        >
          <Ban className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">
              Compra anulada el {formatDateTime(purchase.voidedAt)}
              {purchase.voider ? ` por ${purchase.voider.nombre}` : ''}.
            </p>
            {purchase.voidReason && (
              <p className="mt-0.5 text-xs">Motivo: {purchase.voidReason}</p>
            )}
          </div>
        </div>
      )}

      {!purchase.supplier.datosCompletos && purchase.estado === 'registrada' && (
        <div className="flex flex-col gap-3 rounded-xl border border-brand-gold/40 bg-brand-goldPale px-4 py-3 text-sm text-brand-goldInk sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <BadgeAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">El proveedor tiene datos incompletos.</p>
              <p className="text-xs">
                La compra es válida. Administración puede completar RUT y contacto sin editarla.
              </p>
            </div>
          </div>
          {canEditSupplier && (
            <button
              type="button"
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-brand-gold/50 bg-white px-3 text-xs font-bold text-brand-goldInk hover:bg-brand-goldPale"
              onClick={() => setShowSupplierForm(true)}
              disabled={supplierQuery.isPending}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Completar proveedor
            </button>
          )}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Totales de la compra">
        <article className="rounded-xl border border-brand-line bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Total</p>
          <p className="mt-2 text-2xl font-bold text-brand-primaryInk">
            {formatClp(purchase.total)}
          </p>
          <p className="mt-1 text-xs text-brand-muted">
            {purchase.items.length} {purchase.items.length === 1 ? 'ítem' : 'ítems'}
          </p>
        </article>
        <article className="rounded-xl border border-brand-line bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Neto</p>
          <p className="mt-2 text-2xl font-bold text-brand-primaryInk">{formatClp(purchase.neto)}</p>
          <p className="mt-1 text-xs text-brand-muted">
            {purchase.conIva ? 'Precios netos + IVA' : 'Compra sin IVA'}
          </p>
        </article>
        <article className="rounded-xl border border-brand-line bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">IVA 19%</p>
          <p className="mt-2 text-2xl font-bold text-brand-primaryInk">{formatClp(purchase.iva)}</p>
          <p className="mt-1 text-xs text-brand-muted">
            {purchase.conIva ? 'Calculado sobre el neto' : 'No aplica'}
          </p>
        </article>
        <article className="rounded-xl border border-brand-line bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Pago</p>
          <p
            className={`mt-2 text-lg font-bold ${
              pendingCredit ? 'text-brand-goldInk' : 'text-brand-primaryInk'
            }`}
          >
            {paymentStatus}
          </p>
          <p className="mt-1 text-xs text-brand-muted">
            {PURCHASE_PAYMENT_TYPE_LABELS[purchase.formaPago]} ·{' '}
            {PAYMENT_METHOD_LABELS[purchase.metodoPago]}
          </p>
        </article>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <section className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-line p-4 sm:p-5">
              <div>
                <h2 className="font-bold text-brand-primaryInk">Ítems de la compra</h2>
                <p className="mt-0.5 text-xs text-brand-muted">
                  El stock se recibe solo en los ítems con repuesto de catálogo y almacén.
                </p>
              </div>
              <span className="rounded-md bg-brand-pale px-2 py-1 text-xs font-semibold text-brand-primaryInk">
                {purchase.items.length} {purchase.items.length === 1 ? 'ítem' : 'ítems'}
              </span>
            </div>
            <div className="max-w-full overflow-x-auto overscroll-x-contain">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-brand-line/40 text-[11px] uppercase text-brand-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">#</th>
                    <th className="px-4 py-3 font-semibold">Descripción</th>
                    <th className="px-4 py-3 text-right font-semibold">Cantidad</th>
                    <th className="px-4 py-3 text-right font-semibold">Unitario neto</th>
                    <th className="px-4 py-3 text-right font-semibold">Subtotal</th>
                    <th className="px-4 py-3 font-semibold">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {purchase.items.map((item, index) => (
                    <tr key={item.id} className="border-t border-brand-line align-top">
                      <td className="px-4 py-3 text-xs text-brand-muted">{index + 1}</td>
                      <td className="px-4 py-3">
                        <span className="block font-semibold text-brand-ink">
                          {item.descripcion}
                        </span>
                        {item.catalogItem && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded bg-brand-pale px-1.5 py-0.5 font-mono text-[10px] font-bold text-brand-primaryInk">
                            {item.catalogItem.codigo ?? 'Sin código'} · {item.catalogItem.nombre}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-brand-ink">
                        {item.cantidad.toLocaleString('es-CL')}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-brand-ink">
                        {formatClp(item.precioUnitario)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-brand-primaryInk">
                        {formatClp(item.subtotal)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {item.afectaStock ? (
                          <span className="inline-flex items-start gap-1 rounded bg-brand-mintPale px-2 py-1 font-semibold text-brand-mintInk">
                            <Boxes className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>
                              Recibido
                              {item.warehouse ? ` en ${item.warehouse.codigo}` : ''}
                            </span>
                          </span>
                        ) : (
                          <span className="text-brand-muted">Sin ingreso a stock</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-brand-line bg-brand-pale/30">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right text-xs font-semibold uppercase text-brand-muted">
                      Neto
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-brand-ink">
                      {formatClp(purchase.neto)}
                    </td>
                    <td />
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right text-xs font-semibold uppercase text-brand-muted">
                      IVA 19%
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-brand-ink">
                      {formatClp(purchase.iva)}
                    </td>
                    <td />
                  </tr>
                  <tr className="border-t border-brand-line">
                    <td colSpan={4} className="px-4 py-3 text-right text-sm font-bold uppercase text-brand-primaryInk">
                      Total
                    </td>
                    <td className="px-4 py-3 text-right text-base font-bold text-brand-primaryInk">
                      {formatClp(purchase.total)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-brand-line bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-bold text-brand-primaryInk">Comprobante</h2>
                <p className="mt-0.5 text-xs text-brand-muted">
                  Archivo y metadata tal como fueron registrados.
                </p>
              </div>
              <FileText className="h-5 w-5 text-brand-muted" aria-hidden="true" />
            </div>

            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <DetailItem label="Tipo de documento">
                {PURCHASE_DOCUMENT_TYPE_LABELS[purchase.tipoDocumento]}
              </DetailItem>
              <DetailItem label="Folio">{purchase.folio}</DetailItem>
              <DetailItem label="Fecha de emisión">{formatDate(purchase.fechaEmision)}</DetailItem>
              <DetailItem label="Monto del comprobante">
                {formatClp(purchase.montoComprobante)}
              </DetailItem>
              <DetailItem label="N.º de depósito u operación">
                {purchase.numeroOperacion}
              </DetailItem>
              <DetailItem label="Banco">{purchase.banco}</DetailItem>
            </dl>

            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-brand-line bg-brand-pale/30 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-brand-ink">
                  {purchase.comprobanteNombre}
                </p>
                <p className="text-xs text-brand-muted">
                  {purchase.comprobanteMimeType} · {formatFileSize(purchase.comprobanteSizeBytes)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <a
                  href={`/api/purchases/${purchase.id}/receipt`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-line bg-white px-3 text-xs font-semibold text-brand-primaryInk hover:bg-brand-pale"
                >
                  <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
                  Ver
                </a>
                <a
                  href={`/api/purchases/${purchase.id}/receipt?download=1`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-line bg-white px-3 text-xs font-semibold text-brand-primaryInk hover:bg-brand-pale"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Descargar
                </a>
              </div>
            </div>
          </section>

          {purchase.observaciones && (
            <section className="rounded-xl border border-brand-line bg-white p-4 shadow-sm sm:p-5">
              <h2 className="font-bold text-brand-primaryInk">Observaciones</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-brand-ink">
                {purchase.observaciones}
              </p>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-brand-line bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-bold text-brand-primaryInk">Proveedor</h2>
                <p className="mt-0.5 text-xs text-brand-muted">Datos comerciales registrados</p>
              </div>
              <Building2 className="h-5 w-5 text-brand-muted" aria-hidden="true" />
            </div>

            <div className="mt-3">
              <p className="break-words font-semibold text-brand-ink">
                {purchase.supplier.nombre}
              </p>
              {purchase.supplier.datosCompletos ? (
                <span className="mt-1 inline-flex items-center gap-1 rounded bg-brand-mintPale px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-mintInk">
                  <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                  Datos completos
                </span>
              ) : (
                <span className="mt-1 inline-flex items-center gap-1 rounded bg-brand-goldPale px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-goldInk">
                  <BadgeAlert className="h-3 w-3" aria-hidden="true" />
                  Datos incompletos
                </span>
              )}
            </div>

            <dl className="mt-4 space-y-2.5">
              <DetailItem label="RUT">{purchase.supplier.rut ?? 'Sin registrar'}</DetailItem>
              <DetailItem label="Teléfono">
                {purchase.supplier.telefono ?? 'Sin registrar'}
              </DetailItem>
              <DetailItem label="Email">{purchase.supplier.email ?? 'Sin registrar'}</DetailItem>
              <DetailItem label="Contacto">
                {purchase.supplier.contactoNombre ?? 'Sin registrar'}
              </DetailItem>
              <DetailItem label="Dirección">
                {purchase.supplier.direccion ?? 'Sin registrar'}
              </DetailItem>
            </dl>

            {canEditSupplier && (
              <button
                type="button"
                className="mt-4 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-brand-line text-xs font-semibold text-brand-primaryInk hover:bg-brand-pale"
                onClick={() => setShowSupplierForm(true)}
                disabled={supplierQuery.isPending}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                {purchase.supplier.datosCompletos ? 'Editar proveedor' : 'Completar proveedor'}
              </button>
            )}
          </section>

          <section className="rounded-xl border border-brand-line bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-bold text-brand-primaryInk">Asociación</h2>
                <p className="mt-0.5 text-xs text-brand-muted">Vehículo y orden de trabajo</p>
              </div>
              {isFleet ? (
                <Truck className="h-5 w-5 text-brand-muted" aria-hidden="true" />
              ) : (
                <Car className="h-5 w-5 text-brand-muted" aria-hidden="true" />
              )}
            </div>

            {vehicle ? (
              <dl className="mt-3 space-y-2.5">
                <DetailItem label={isFleet ? 'Vehículo de flota' : 'Vehículo de taller'}>
                  <span className="font-mono uppercase">{vehicle.patente}</span>
                </DetailItem>
                <DetailItem label="Marca / modelo">
                  {[vehicle.marca, vehicle.modelo].filter(Boolean).join(' ') || 'Sin registrar'}
                </DetailItem>
                {purchase.workOrder && (
                  <DetailItem label="Orden de trabajo">
                    <Link
                      to={`/work-orders/${purchase.workOrder.id}`}
                      className="inline-flex items-center gap-1 font-mono text-xs font-bold text-brand-primaryInk hover:underline"
                    >
                      <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                      {purchase.workOrder.codigo}
                    </Link>
                  </DetailItem>
                )}
              </dl>
            ) : (
              <p className="mt-3 text-sm text-brand-muted">Sin vehículo asociado.</p>
            )}

            <p className="mt-3 border-t border-brand-line pt-3 text-xs text-brand-muted">
              La compra no se edita. La asociación queda tal como fue registrada.
            </p>
          </section>

          <section className="rounded-xl border border-brand-line bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-bold text-brand-primaryInk">Pago y caja</h2>
                <p className="mt-0.5 text-xs text-brand-muted">Egreso vinculado a la compra</p>
              </div>
              <WalletCards className="h-5 w-5 text-brand-muted" aria-hidden="true" />
            </div>

            <dl className="mt-3 space-y-2.5">
              <DetailItem label="Forma de pago">
                {PURCHASE_PAYMENT_TYPE_LABELS[purchase.formaPago]}
              </DetailItem>
              <DetailItem label="Método">
                {PAYMENT_METHOD_LABELS[purchase.metodoPago]}
              </DetailItem>
              <DetailItem label="Fecha de pago">
                {purchase.pagadoAt ? formatDateTime(purchase.pagadoAt) : 'Pendiente'}
              </DetailItem>
              {purchase.cashMovement && (
                <>
                  <DetailItem label="Egreso de caja">
                    {formatClp(purchase.cashMovement.monto)} ·{' '}
                    {PAYMENT_METHOD_LABELS[purchase.cashMovement.metodo]}
                  </DetailItem>
                  <DetailItem label="Fecha del egreso">
                    {formatDateTime(purchase.cashMovement.fecha)}
                  </DetailItem>
                  {purchase.cashMovement.voidedAt && (
                    <DetailItem label="Estado del egreso">
                      <span className="font-semibold text-brand-coralInk">
                        Anulado el {formatDateTime(purchase.cashMovement.voidedAt)}
                      </span>
                    </DetailItem>
                  )}
                </>
              )}
            </dl>

            {pendingCredit && canUpdate && (
              <button
                type="button"
                className="primary-button mt-4 w-full"
                onClick={() => setShowPayment(true)}
              >
                <WalletCards className="h-4 w-4" aria-hidden="true" />
                Pagar compra completa
              </button>
            )}
            {pendingCredit && !canUpdate && (
              <p className="mt-3 rounded-lg bg-brand-goldPale px-3 py-2 text-xs font-semibold text-brand-goldInk">
                El pago total está pendiente.
              </p>
            )}
            <p className="mt-3 text-xs text-brand-muted">
              El cierre de caja no bloquea compras ni pagos.
            </p>
          </section>

          <section className="rounded-xl border border-brand-line bg-white p-4 shadow-sm">
            <h2 className="font-bold text-brand-primaryInk">Auditoría</h2>
            <dl className="mt-3 space-y-2.5">
              <DetailItem label="Registrada por">
                {purchase.creator?.nombre ?? 'Sin registrar'}
              </DetailItem>
              <DetailItem label="Fecha de registro">
                {formatDateTime(purchase.createdAt)}
              </DetailItem>
              <DetailItem label="Última actualización">
                {formatDateTime(purchase.updatedAt)}
              </DetailItem>
              {purchase.voidedAt && (
                <>
                  <DetailItem label="Anulada por">
                    {purchase.voider?.nombre ?? 'Sin registrar'}
                  </DetailItem>
                  <DetailItem label="Fecha de anulación">
                    {formatDateTime(purchase.voidedAt)}
                  </DetailItem>
                </>
              )}
            </dl>
            {purchase.voidReason && (
              <p className="mt-3 rounded-lg bg-brand-coralPale px-3 py-2 text-xs text-brand-coralInk">
                <span className="font-bold">Motivo: </span>
                {purchase.voidReason}
              </p>
            )}
          </section>
        </aside>
      </div>

      {showVoid && (
        <PurchaseVoidModal purchase={purchase} onClose={() => setShowVoid(false)} />
      )}
      {showPayment && (
        <PurchasePaymentModal purchase={purchase} onClose={() => setShowPayment(false)} />
      )}
      {showSupplierForm && supplierQuery.data && (
        <SupplierFormModal
          supplier={supplierQuery.data}
          onClose={() => setShowSupplierForm(false)}
        />
      )}
    </div>
  );
};

export default PurchaseDetailPage;
