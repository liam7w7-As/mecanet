import {
  PAYMENT_METHODS,
  PURCHASE_DOCUMENT_TYPES,
  PURCHASE_DOCUMENT_TYPE_LABELS,
  PURCHASE_PAYMENT_TYPES,
  PURCHASE_PAYMENT_TYPE_LABELS,
  calculatePurchaseTotals,
  createPurchaseSchema,
} from '@unithor/shared';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileUp,
  LoaderCircle,
  ReceiptText,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import CurrencyInput from '../../components/common/CurrencyInput';
import PurchaseItemsEditor, {
  createEmptyPurchaseItem,
} from '../../components/purchases/PurchaseItemsEditor';
import PurchaseVehiclePicker from '../../components/purchases/PurchaseVehiclePicker';
import SupplierCombobox from '../../components/purchases/SupplierCombobox';
import { useCreatePurchaseMutation } from '../../hooks/usePurchases';
import { useWarehouses } from '../../hooks/useWarehouses';
import { getApiErrorMessage, getApiFieldErrors } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { formatClp } from '../../lib/formatters';
import { PAYMENT_METHOD_LABELS, formatFileSize, todayInputValue } from '../../lib/purchase-labels';
import { notifyError, notifySuccess } from '../../stores/toast.store';

import type { PurchaseItemDraft } from '../../components/purchases/PurchaseItemsEditor';
import type { PurchaseVehicleSelection } from '../../components/purchases/PurchaseVehiclePicker';
import type { SupplierSelection } from '../../components/purchases/SupplierCombobox';
import type { FieldErrors } from '../../lib/form-errors';
import type {
  CreatePurchaseInput,
  PaymentMethod,
  PurchaseDocumentType,
  PurchasePaymentType,
} from '@unithor/shared';

interface DocumentDraft {
  tipoDocumento: PurchaseDocumentType;
  folio: string;
  fechaEmision: string;
  montoComprobante: string;
  numeroOperacion: string;
  banco: string;
}

const emptyVehicleSelection: PurchaseVehicleSelection = {
  origenVehiculo: null,
  vehicle: null,
  fleetVehicle: null,
  workOrderId: null,
};

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const fieldClassName =
  'mt-1.5 h-10 w-full rounded-lg border border-brand-line bg-white px-3 text-sm font-normal text-brand-ink outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15';

const SectionHeading = ({ title, detail }: { title: string; detail: string }) => (
  <div>
    <h2 className="font-bold text-brand-primaryInk">{title}</h2>
    <p className="mt-0.5 text-xs text-brand-muted">{detail}</p>
  </div>
);

export const PurchaseCreatePage = () => {
  const navigate = useNavigate();
  const createMutation = useCreatePurchaseMutation();
  const warehousesQuery = useWarehouses({ page: 1, pageSize: 100 });
  const warehouses = (warehousesQuery.data?.items ?? []).filter((warehouse) => warehouse.activo);

  const [supplier, setSupplier] = useState<SupplierSelection>({ supplierId: null, nombre: '' });
  const [vehicleSelection, setVehicleSelection] =
    useState<PurchaseVehicleSelection>(emptyVehicleSelection);
  const [items, setItems] = useState<PurchaseItemDraft[]>([createEmptyPurchaseItem()]);
  const [conIva, setConIva] = useState(true);
  const [formaPago, setFormaPago] = useState<PurchasePaymentType>('contado');
  const [metodoPago, setMetodoPago] = useState<PaymentMethod>('efectivo');
  const [document, setDocument] = useState<DocumentDraft>({
    tipoDocumento: 'factura',
    folio: '',
    fechaEmision: todayInputValue(),
    montoComprobante: '',
    numeroOperacion: '',
    banco: '',
  });
  const [observaciones, setObservaciones] = useState('');
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  const totals = calculatePurchaseTotals(
    items.map((item) => ({
      cantidad: Number(item.cantidad) || 0,
      precioUnitario: Number(item.precioUnitario) || 0,
    })),
    conIva,
  );

  const updateDocument = <K extends keyof DocumentDraft>(
    field: K,
    value: DocumentDraft[K],
  ): void => {
    setDocument((current) => ({ ...current, [field]: value }));
  };

  const selectFile = (file: File | undefined): void => {
    if (!file) return;

    if (!ALLOWED_FILE_TYPES.has(file.type)) {
      setFileError('El comprobante debe ser PDF, JPG, PNG o WebP.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError('El comprobante no puede superar los 8 MB.');
      return;
    }

    setComprobante(file);
    setFileError(null);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    createMutation.reset();
    setErrors({});

    if (!comprobante) {
      setFileError('Debes adjuntar el comprobante de la compra.');
      return;
    }

    const payload = {
      proveedorId: supplier.supplierId,
      proveedorNombre: supplier.supplierId === null ? supplier.nombre.trim() : undefined,
      origenVehiculo: vehicleSelection.origenVehiculo,
      vehicleId: vehicleSelection.vehicle?.id ?? null,
      fleetVehicleId: vehicleSelection.fleetVehicle?.id ?? null,
      workOrderId: vehicleSelection.workOrderId,
      conIva,
      formaPago,
      metodoPago,
      tipoDocumento: document.tipoDocumento,
      folio: document.folio,
      fechaEmision: document.fechaEmision,
      montoComprobante: Number(document.montoComprobante || 0),
      numeroOperacion: document.numeroOperacion,
      banco: document.banco,
      observaciones: observaciones.trim() || null,
      items: items.map((item) => ({
        catalogItemId: item.catalogItemId,
        descripcion: item.descripcion,
        cantidad: Number(item.cantidad) || 0,
        precioUnitario: Number(item.precioUnitario) || 0,
        afectaStock: item.afectaStock,
        warehouseId: item.afectaStock ? item.warehouseId : null,
      })),
    };

    const parsed = createPurchaseSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(getFieldErrors(parsed.error.issues));
      notifyError('Revisa los campos marcados antes de registrar la compra.');
      return;
    }

    createMutation.mutate(
      { data: parsed.data as CreatePurchaseInput, comprobante },
      {
        onSuccess: (purchase) => {
          notifySuccess(`Compra ${purchase.codigo} registrada correctamente.`);
          navigate(`/purchases/${purchase.id}`);
        },
        onError: (error) => {
          setErrors(getApiFieldErrors(error));
          notifyError(getApiErrorMessage(error, 'No fue posible registrar la compra.'));
        },
      },
    );
  };

  const today = todayInputValue();

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex items-start gap-3">
        <Link
          to="/purchases"
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-brand-line bg-white text-brand-muted transition-colors hover:bg-brand-pale"
          aria-label="Volver a compras"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <p className="text-sm font-medium text-brand-muted">Egreso con comprobante</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-primaryInk sm:text-3xl">
            Nueva compra
          </h1>
          <p className="mt-1 text-sm text-brand-muted">
            La fecha de registro se asigna automáticamente. La fecha de emisión pertenece solo al
            comprobante.
          </p>
        </div>
      </header>

      <form
        id="purchase-form"
        onSubmit={submit}
        className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]"
      >
        <div className="min-w-0 space-y-5">
          <section className="rounded-xl border border-brand-line bg-white p-4 shadow-sm sm:p-5">
            <SectionHeading
              title="Proveedor"
              detail="Busca uno existente o escribe el nombre. Si es nuevo, quedará con datos incompletos para que administración lo complete."
            />
            <div className="mt-4 max-w-2xl">
              <SupplierCombobox value={supplier} onChange={setSupplier} error={errors.proveedorNombre} />
            </div>
          </section>

          <section className="rounded-xl border border-brand-line bg-white p-4 shadow-sm sm:p-5">
            <SectionHeading
              title="Comprobante"
              detail="El archivo y sus metadatos son obligatorios. El monto del documento se guarda tal como fue emitido."
            />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-brand-ink">
                Tipo de documento
                <select
                  value={document.tipoDocumento}
                  onChange={(event) =>
                    updateDocument('tipoDocumento', event.target.value as PurchaseDocumentType)
                  }
                  className={fieldClassName}
                  aria-invalid={Boolean(errors.tipoDocumento)}
                >
                  {PURCHASE_DOCUMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {PURCHASE_DOCUMENT_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
                {errors.tipoDocumento && (
                  <span className="mt-1 block text-xs font-normal text-brand-coralInk">
                    {errors.tipoDocumento}
                  </span>
                )}
              </label>

              <label className="block text-sm font-semibold text-brand-ink">
                Folio
                <input
                  value={document.folio}
                  onChange={(event) => updateDocument('folio', event.target.value)}
                  className={fieldClassName}
                  placeholder="N.º del documento"
                  maxLength={50}
                  aria-invalid={Boolean(errors.folio)}
                />
                {errors.folio && (
                  <span className="mt-1 block text-xs font-normal text-brand-coralInk">
                    {errors.folio}
                  </span>
                )}
              </label>

              <label className="block text-sm font-semibold text-brand-ink">
                Fecha de emisión
                <input
                  type="date"
                  value={document.fechaEmision}
                  max={today}
                  onChange={(event) => updateDocument('fechaEmision', event.target.value)}
                  className={fieldClassName}
                  aria-invalid={Boolean(errors.fechaEmision)}
                />
                {errors.fechaEmision && (
                  <span className="mt-1 block text-xs font-normal text-brand-coralInk">
                    {errors.fechaEmision}
                  </span>
                )}
              </label>

              <label className="block text-sm font-semibold text-brand-ink">
                Monto del comprobante
                <CurrencyInput
                  value={document.montoComprobante}
                  onChange={(value) => updateDocument('montoComprobante', value)}
                  className={fieldClassName}
                  placeholder="0"
                  aria-invalid={Boolean(errors.montoComprobante)}
                />
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs font-normal text-brand-muted">
                  <button
                    type="button"
                    className="font-semibold text-brand-primaryInk hover:underline"
                    onClick={() =>
                      updateDocument('montoComprobante', String(Math.round(totals.total)))
                    }
                  >
                    Usar total de la compra
                  </button>
                  <span>· puede diferir del total por impuestos o ajustes</span>
                </span>
                {errors.montoComprobante && (
                  <span className="mt-1 block text-xs font-normal text-brand-coralInk">
                    {errors.montoComprobante}
                  </span>
                )}
              </label>

              <label className="block text-sm font-semibold text-brand-ink">
                N.º de depósito u operación
                <input
                  value={document.numeroOperacion}
                  onChange={(event) => updateDocument('numeroOperacion', event.target.value)}
                  className={fieldClassName}
                  placeholder="Referencia bancaria u operación"
                  maxLength={80}
                  aria-invalid={Boolean(errors.numeroOperacion)}
                />
                {errors.numeroOperacion && (
                  <span className="mt-1 block text-xs font-normal text-brand-coralInk">
                    {errors.numeroOperacion}
                  </span>
                )}
              </label>

              <label className="block text-sm font-semibold text-brand-ink">
                Banco
                <input
                  value={document.banco}
                  onChange={(event) => updateDocument('banco', event.target.value)}
                  className={fieldClassName}
                  placeholder="Banco emisor o de la operación"
                  maxLength={80}
                  aria-invalid={Boolean(errors.banco)}
                />
                {errors.banco && (
                  <span className="mt-1 block text-xs font-normal text-brand-coralInk">
                    {errors.banco}
                  </span>
                )}
              </label>

              <div className="sm:col-span-2">
                <p className="text-sm font-semibold text-brand-ink">Archivo del comprobante</p>
                {comprobante ? (
                  <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-brand-mint/40 bg-brand-mintPale px-4 py-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-mintInk" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-brand-ink">
                        {comprobante.name}
                      </p>
                      <p className="text-xs text-brand-muted">
                        {formatFileSize(comprobante.size)} · listo para adjuntar
                      </p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-line bg-white px-3 text-xs font-semibold text-brand-coralInk hover:bg-brand-coralPale"
                      onClick={() => setComprobante(null)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Quitar
                    </button>
                  </div>
                ) : (
                  <label className="mt-2 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-brand-line bg-brand-pale/30 px-4 py-7 text-center transition-colors hover:border-brand-primary hover:bg-brand-pale/60">
                    <FileUp className="h-7 w-7 text-brand-primaryInk" aria-hidden="true" />
                    <span className="text-sm font-semibold text-brand-primaryInk">
                      Adjuntar PDF o imagen del comprobante
                    </span>
                    <span className="text-xs text-brand-muted">
                      PDF, JPG, PNG o WebP · máximo 8 MB
                    </span>
                    <input
                      type="file"
                      className="sr-only"
                      accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
                      onChange={(event) => {
                        selectFile(event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                  </label>
                )}
                {fileError && (
                  <p className="mt-2 text-sm font-semibold text-brand-coralInk" role="alert">
                    {fileError}
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-brand-line bg-white p-4 shadow-sm sm:p-5">
            <PurchaseVehiclePicker value={vehicleSelection} onChange={setVehicleSelection} />
          </section>

          <PurchaseItemsEditor
            items={items}
            warehouses={warehouses}
            onChange={setItems}
            errors={errors}
          />
        </div>

        <aside className="space-y-4 self-start xl:sticky xl:top-24">
          <section className="rounded-xl border border-brand-line bg-white p-4 shadow-sm">
            <h2 className="font-bold text-brand-primaryInk">Resumen de la compra</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3 text-brand-muted">
                <dt>Ítems</dt>
                <dd className="font-semibold text-brand-ink">{items.length}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 text-brand-muted">
                <dt>Neto</dt>
                <dd className="font-semibold text-brand-ink">{formatClp(totals.neto)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 text-brand-muted">
                <dt>IVA 19%</dt>
                <dd className="font-semibold text-brand-ink">{formatClp(totals.iva)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-brand-line pt-3">
                <dt className="font-bold text-brand-primaryInk">Total</dt>
                <dd className="text-xl font-bold text-brand-primaryInk">{formatClp(totals.total)}</dd>
              </div>
            </dl>

            <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-lg bg-brand-pale/60 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-brand-line"
                checked={conIva}
                onChange={(event) => setConIva(event.target.checked)}
              />
              <span>
                <span className="block font-semibold text-brand-ink">La compra incluye IVA</span>
                <span className="block text-xs text-brand-muted">
                  Los precios se ingresan netos y el IVA se calcula una sola vez sobre el total.
                </span>
              </span>
            </label>

            <fieldset className="mt-4">
              <legend className="text-sm font-semibold text-brand-ink">Forma de pago</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {PURCHASE_PAYMENT_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormaPago(type)}
                    className={`inline-flex h-10 items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                      formaPago === type
                        ? 'bg-brand-primaryInk text-white'
                        : 'bg-brand-pale text-brand-muted hover:bg-brand-line'
                    }`}
                    aria-pressed={formaPago === type}
                  >
                    {PURCHASE_PAYMENT_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-brand-muted">
                {formaPago === 'contado'
                  ? 'Se registra el egreso de caja en el momento de guardar la compra.'
                  : 'El egreso se registra al pagar la compra completa. Queda pendiente hasta entonces.'}
              </p>
            </fieldset>

            <label className="mt-4 block text-sm font-semibold text-brand-ink">
              {formaPago === 'contado' ? 'Método de pago' : 'Método de pago previsto'}
              <select
                value={metodoPago}
                onChange={(event) => setMetodoPago(event.target.value as PaymentMethod)}
                className={fieldClassName}
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {PAYMENT_METHOD_LABELS[method]}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-4 block text-sm font-semibold text-brand-ink">
              Observaciones
              <textarea
                value={observaciones}
                onChange={(event) => setObservaciones(event.target.value)}
                rows={3}
                maxLength={1000}
                className="mt-1.5 w-full resize-y rounded-lg border border-brand-line px-3 py-2 text-sm font-normal text-brand-ink outline-none focus:border-brand-primary"
                placeholder="Detalle interno de la compra (opcional)"
              />
            </label>
          </section>

          {createMutation.isError && (
            <div
              className="flex items-start gap-2 rounded-xl border border-brand-coral/30 bg-brand-coralPale px-4 py-3 text-sm text-brand-coralInk"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{getApiErrorMessage(createMutation.error, 'No fue posible registrar la compra.')}</span>
            </div>
          )}

          <div className="rounded-xl border border-brand-line bg-white p-4 shadow-sm">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="primary-button w-full"
            >
              {createMutation.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              Registrar compra
            </button>
            <Link to="/purchases" className="secondary-button mt-2 w-full">
              Cancelar
            </Link>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-brand-muted">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              La fecha de registro es automática e inmutable. Una compra registrada no se edita: se
              anula y se vuelve a registrar.
            </p>
          </div>

          <p className="flex items-start gap-2 text-xs text-brand-muted">
            <ReceiptText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            El stock solo se recibe en los ítems vinculados a un repuesto de catálogo con almacén
            seleccionado.
          </p>
        </aside>
      </form>
    </div>
  );
};

export default PurchaseCreatePage;
