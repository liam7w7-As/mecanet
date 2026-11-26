import {
  createExpressPurchaseSchema,
  expressMinimumSale,
  expressNetSale,
  getQuotationGrossTotal,
  PAYMENT_METHODS,
} from '@unithor/shared';
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  FileImage,
  History,
  LoaderCircle,
  Package,
  Plus,
  Search,
  ShoppingBag,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import CurrencyInput from '../../components/common/CurrencyInput';
import FormRecoveryBanner from '../../components/common/FormRecoveryBanner';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useFormRecovery } from '../../hooks/useFormRecovery';
import {
  useCreateExpressPurchase,
  useExpressOrders,
  useExpressRequests,
  useScanPurchase,
} from '../../hooks/usePurchasesExpress';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { formatClp } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { expressRecoverySchema } from '../../lib/purchase-express-recovery';
import { PAYMENT_METHOD_LABELS, todayInputValue } from '../../lib/purchase-labels';
import { useAuthStore } from '../../stores/auth.store';

import type { ExpressRecovery } from '../../lib/purchase-express-recovery';
import type { Purchase } from '../../types/entities';
import type { ExpressPurchaseRequest, ExpressScanResult } from '@unithor/shared';
import type { FormEvent } from 'react';

const emptyDraft = (): ExpressRecovery => ({
  operationKey: crypto.randomUUID(),
  order: null,
  requestId: null,
  descripcion: '',
  cantidad: '1',
  costoUnitario: '',
  ventaUnitario: '',
  saleEdited: false,
  conIva: true,
  metodoPago: 'efectivo',
  proveedorNombre: '',
  folio: '',
  fechaEmision: todayInputValue(),
  detalle: '',
  file: null,
  tipoDocumento: 'otro',
});

type ScanSelection = {
  result: ExpressScanResult;
  index: number;
  sequence: number;
  costOnly?: boolean;
};

export default function PurchasesExpressPage({
  initiallyOpen = false,
}: {
  initiallyOpen?: boolean;
}) {
  const [session, setSession] = useState({ key: 0, open: initiallyOpen });
  return (
    <PurchasesExpressWorkspace
      key={session.key}
      initiallyOpen={session.open}
      onRestart={() => setSession((previous) => ({ key: previous.key + 1, open: true }))}
    />
  );
}

function PurchasesExpressWorkspace({
  initiallyOpen,
  onRestart,
}: {
  initiallyOpen: boolean;
  onRestart: () => void;
}) {
  const user = useAuthStore((state) => state.user);
  const canRead = Boolean(user && hasUserPermission(user, 'compras', 'read'));
  const canCreate = Boolean(user && hasUserPermission(user, 'compras', 'create'));
  const [open, setOpen] = useState(initiallyOpen);
  const [draft, setDraft] = useState(emptyDraft);
  const [search, setSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [choosingOrder, setChoosingOrder] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [scanError, setScanError] = useState('');
  const [scanResult, setScanResult] = useState<ExpressScanResult | null>(null);
  const [readReplacement, setReadReplacement] = useState<ScanSelection | null>(null);
  const [success, setSuccess] = useState<Purchase | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [replacement, setReplacement] = useState<{ request?: ExpressPurchaseRequest } | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const requests = useExpressRequests(useDebouncedValue(search.trim(), 250), canRead);
  const orders = useExpressOrders(
    useDebouncedValue(orderSearch.trim(), 250),
    open && canCreate && choosingOrder,
  );
  const scan = useScanPurchase();
  const save = useCreateExpressPurchase();
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const scanSequence = useRef(0);
  const currentDraft = useRef(draft);
  const manualFields = useRef(new Set<string>());
  currentDraft.current = draft;
  const formRef = useRef<HTMLFormElement>(null);
  const readConfirmationRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hasContent = Boolean(
    draft.descripcion ||
    draft.costoUnitario ||
    draft.order ||
    draft.detalle ||
    draft.file ||
    draft.proveedorNombre,
  );
  const recovery = useFormRecovery({
    userId: user?.id,
    form: 'purchase:express',
    schema: expressRecoverySchema,
    value: draft,
    hasContent,
    paused: save.isPending || Boolean(success),
    onRestore: (value) => {
      manualFields.current = new Set(
        [
          'descripcion',
          'cantidad',
          'costoUnitario',
          'proveedorNombre',
          'folio',
          'fechaEmision',
          'conIva',
        ].filter((key) => key === 'conIva' || Boolean(value[key as keyof ExpressRecovery])),
      );
      setDraft(value);
      setOpen(true);
      setSuccess(null);
    },
  });
  const file = useMemo(
    () =>
      draft.file
        ? new File([draft.file.blob], draft.file.name, {
            type: draft.file.blob.type,
            lastModified: draft.file.lastModified,
          })
        : null,
    [draft.file],
  );

  useEffect(() => {
    if (!file) {
      setPhotoUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(
    () => () => {
      controller.current?.abort();
      scanSequence.current += 1;
    },
    [],
  );
  useEffect(() => {
    if (readReplacement) readConfirmationRef.current?.focus();
  }, [readReplacement]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!inFlight.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const update = <K extends keyof ExpressRecovery>(key: K, value: ExpressRecovery[K]) => {
    manualFields.current.add(key);
    setDraft((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
    save.reset();
  };
  const changeCost = (cost: string) => {
    manualFields.current.add('costoUnitario');
    setDraft((previous) => ({
      ...previous,
      costoUnitario: cost,
      ventaUnitario: previous.saleEdited
        ? previous.ventaUnitario
        : cost
          ? String(Math.ceil(expressMinimumSale(Number(cost))))
          : '',
    }));
    setErrors((previous) => {
      const next = { ...previous };
      delete next.costoUnitario;
      return next;
    });
  };
  const start = (request?: ExpressPurchaseRequest, replace = false) => {
    if (success) {
      onRestart();
      return;
    }
    if (hasContent && !replace) {
      setReplacement({ request });
      return;
    }
    setReplacement(null);
    setReadReplacement(null);
    manualFields.current.clear();
    controller.current?.abort();
    scanSequence.current += 1;
    setScanBusy(false);
    setDraft(
      request
        ? {
            ...emptyDraft(),
            order: request.order,
            requestId: request.id,
            descripcion: request.descripcion,
            cantidad: String(request.cantidad),
            detalle: request.detalle,
          }
        : emptyDraft(),
    );
    setChoosingOrder(false);
    setOrderSearch('');
    setOpen(true);
    setSuccess(null);
    setScanResult(null);
    setScanError('');
    setErrors({});
    setConfirmDiscard(false);
    save.reset();
    window.requestAnimationFrame(() => headingRef.current?.focus());
  };
  const applyRead = (selection: ScanSelection, confirmed = false) => {
    const { result, index, sequence, costOnly } = selection;
    if (sequence !== scanSequence.current || controller.current?.signal.aborted) return;
    const item = result.items[index];
    if (!item) return;
    const previous = currentDraft.current;
    const values: Partial<ExpressRecovery> = {};
    const apply = <K extends keyof ExpressRecovery>(
      key: K,
      value: ExpressRecovery[K] | null,
      fallback: ExpressRecovery[K],
    ) => {
      if (value !== null) values[key] = value;
      // A new reading must not retain data detected for the previous product.
      else if (!manualFields.current.has(key)) values[key] = fallback;
    };
    if (!costOnly) {
      if (!previous.requestId) {
        apply('descripcion', item.descripcion, '');
        apply('cantidad', item.cantidad === null ? null : String(item.cantidad), '1');
      }
      apply('proveedorNombre', result.proveedorNombre, '');
      apply('folio', result.folio, '');
      apply('fechaEmision', result.fechaEmision, todayInputValue());
      apply('conIva', result.incluyeIva, true);
      values.tipoDocumento = result.documento === 'recibo' ? 'recibo' : 'otro';
    }
    apply('costoUnitario', item.costoUnitario === null ? null : String(item.costoUnitario), '');
    const keys = Object.keys(values) as (keyof ExpressRecovery)[];
    if (
      !confirmed &&
      keys.some((key) => manualFields.current.has(key) && previous[key] !== values[key])
    ) {
      setReadReplacement(selection);
      return;
    }
    setReadReplacement(null);
    keys.forEach((key) => {
      if (previous[key] !== values[key]) manualFields.current.delete(key);
    });
    setDraft((latest) => {
      const next = { ...latest, ...values };
      if (!latest.saleEdited)
        next.ventaUnitario = next.costoUnitario
          ? String(Math.ceil(expressMinimumSale(Number(next.costoUnitario))))
          : '';
      return next;
    });
    setErrors((previousErrors) => {
      const next = { ...previousErrors };
      keys.forEach((key) => delete next[key]);
      return next;
    });
    setScanResult({ ...result, items: [item] });
    save.reset();
  };
  const runScan = async (image: File) => {
    controller.current?.abort();
    const sequence = ++scanSequence.current;
    const abort = new AbortController();
    controller.current = abort;
    setScanError('');
    setScanResult(null);
    setReadReplacement(null);
    setScanBusy(true);
    try {
      const result = await scan.mutateAsync({ file: image, signal: abort.signal });
      if (sequence !== scanSequence.current || abort.signal.aborted) return;
      setScanResult(result);
      if (result.items.length === 1) applyRead({ result, index: 0, sequence });
    } catch (error) {
      if (sequence === scanSequence.current && !abort.signal.aborted)
        setScanError(
          getApiErrorMessage(
            error,
            'No se pudo leer la foto. Puedes completar los datos manualmente.',
          ),
        );
    } finally {
      if (sequence === scanSequence.current) setScanBusy(false);
    }
  };
  const selectPhoto = (image: File | undefined) => {
    if (!image) return;
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(image.type) ||
      image.size > 8 * 1024 * 1024 ||
      image.size === 0
    ) {
      setScanError('Usa una foto JPG, PNG o WebP de hasta 8 MB.');
      return;
    }
    controller.current?.abort();
    scanSequence.current += 1;
    setScanBusy(false);
    setReadReplacement(null);
    setScanResult(null);
    update('file', { blob: image, name: image.name, lastModified: image.lastModified });
    if (requests.data?.scannerConfigured === false) {
      setScanError(
        'Foto adjunta. Falta configurar la IA en el servidor; puedes completar los campos manualmente.',
      );
    } else void runScan(image);
  };
  const cost = Number(draft.costoUnitario) || 0;
  const quantity = Number(draft.cantidad) || 0;
  const sale = Number(draft.ventaUnitario) || 0;
  const minimum = Math.ceil(expressMinimumSale(cost));
  const invalidSale = cost > 0 && sale < expressMinimumSale(cost);
  const totalCost = cost * quantity;
  const totalSale =
    sale > 0 && quantity > 0
      ? getQuotationGrossTotal(expressNetSale(sale, quantity) * quantity)
      : 0;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreate || inFlight.current || scanBusy || readReplacement || !recovery.ready) return;
    const parsed = createExpressPurchaseSchema.safeParse({
      ...draft,
      workOrderId: draft.order?.id,
    });
    if (!parsed.success) {
      const nextErrors = getFieldErrors(parsed.error.issues);
      setErrors(nextErrors);
      window.requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    inFlight.current = true;
    try {
      const result = await save.mutateAsync({ data: parsed.data, file });
      setSuccess(result);
      setOpen(false);
      // Clear the local draft only after an acknowledged successful registration.
      await recovery.clear();
      setDraft(emptyDraft());
      setScanResult(null);
      setScanError('');
      window.requestAnimationFrame(() => headingRef.current?.focus());
    } catch {
      /* Keep draft, evidence and idempotency key for a safe retry. */
    } finally {
      inFlight.current = false;
    }
  };
  const pending = save.isPending;
  const fieldError = (name: string) =>
    errors[name] && (
      <small className="express-field-error" role="alert">
        {errors[name]}
      </small>
    );
  const available = requests.data?.items ?? [];

  return (
    <div className="workspace-page purchases-express">
      <header className="express-page-heading">
        <div>
          <span className="express-eyebrow">Del taller a la compra, sin vueltas</span>
          <h1 ref={headingRef} tabIndex={-1}>
            Compras express
          </h1>
          <p>Escanea, revisa el precio y vincula el accesorio a su OT.</p>
        </div>
        {canRead && (
          <Link
            className="express-history-link"
            to="/purchases/history"
            onClick={(event) => {
              if (pending) event.preventDefault();
            }}
          >
            <History aria-hidden="true" /> Historial
          </Link>
        )}
      </header>
      <FormRecoveryBanner
        candidateAt={recovery.candidate?.updatedAt ?? null}
        ready={recovery.ready}
        saving={recovery.saving}
        savedAt={recovery.savedAt}
        error={recovery.error}
        onRecover={recovery.recover}
        onDiscard={() => void recovery.discard()}
        onRetry={() => void recovery.retry()}
      />
      {replacement && (
        <div className="express-discard" role="alert">
          <p>Ya tienes una compra en preparación. ¿Quieres reemplazar sus datos y foto?</p>
          <button type="button" onClick={() => start(replacement.request, true)}>
            Descartar borrador y empezar otra
          </button>
          <button
            type="button"
            onClick={() => {
              setReplacement(null);
              setOpen(true);
            }}
          >
            Continuar compra actual
          </button>
        </div>
      )}
      {success && (
        <section className="express-success" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>Compra registrada</h2>
            <p>
              {success.codigo} · Egreso de {formatClp(success.total)} registrado. El accesorio quedó
              vinculado a la OT y su cotización.
            </p>
            {canRead && <Link to={`/purchases/${success.id}`}>Ver compra</Link>}
          </div>
        </section>
      )}
      {!open && (
        <>
          <div className="express-inbox-heading">
            <div>
              <h2>Solicitudes del taller</h2>
              <p>Compra lo que falta; las entregas se confirman en bodega.</p>
            </div>
            {canCreate && (
              <button
                className="express-primary"
                type="button"
                disabled={!recovery.ready}
                onClick={() => start()}
              >
                <Plus aria-hidden="true" /> Nueva compra
              </button>
            )}
          </div>
          {canRead && (
            <label className="express-search">
              <Search aria-hidden="true" />
              <input
                aria-label="Buscar solicitudes por OT o patente"
                placeholder="Buscar OT o patente"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          )}
          {requests.isPending && canRead && (
            <p role="status" className="express-message">
              <LoaderCircle className="animate-spin" aria-hidden="true" /> Cargando solicitudes…
            </p>
          )}
          {requests.isError && (
            <div role="alert" className="express-error">
              No pudimos cargar las solicitudes.{' '}
              <button type="button" onClick={() => void requests.refetch()}>
                Reintentar
              </button>
            </div>
          )}
          {!requests.isPending && !requests.isError && available.length === 0 && canRead && (
            <section className="express-empty">
              <Package aria-hidden="true" />
              <h2>No hay solicitudes pendientes</h2>
              <p>Puedes registrar una compra nueva sin partir de una solicitud.</p>
            </section>
          )}
          <div className="express-request-list">
            {available.map((request) => (
              <article key={request.id} className="express-request">
                <div className="express-request-top">
                  <span className={`express-tag ${request.porComprar ? 'is-needed' : ''}`}>
                    {request.porComprar
                      ? 'Por comprar'
                      : request.estado === 'pendiente'
                        ? 'Por autorizar'
                        : 'Revisar stock'}
                  </span>
                  <span className="express-request-quantity">× {request.cantidad}</span>
                </div>
                <h3>{request.descripcion}</h3>
                <p className="express-request-order">
                  <strong>{request.order.patente}</strong>
                  <span>{request.order.codigo}</span>
                </p>
                <p className="express-request-detail">{request.detalle}</p>
                {request.solicitadoPor && <small>Solicitó {request.solicitadoPor}</small>}
                {canCreate && request.estado === 'aprobada' && (
                  <button
                    type="button"
                    className="express-secondary"
                    disabled={!recovery.ready}
                    onClick={() => start(request)}
                  >
                    <ShoppingBag aria-hidden="true" /> Registrar compra
                  </button>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      {open && (
        <form
          ref={formRef}
          className="express-form"
          onSubmit={(event) => void submit(event)}
          noValidate
        >
          <fieldset disabled={pending || !canCreate || !recovery.ready}>
            <div className="express-form-title">
              <div>
                <span className="express-eyebrow">
                  {draft.requestId ? `Solicitud #${draft.requestId}` : 'Compra nueva'}
                </span>
                <h2>Registra el accesorio</h2>
              </div>
              <button
                type="button"
                className="express-icon-button"
                aria-label="Cerrar formulario de compra"
                onClick={() => {
                  if (hasContent) setConfirmDiscard(true);
                  else setOpen(false);
                }}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            {!canCreate && (
              <p role="status" className="express-error">
                No tienes permiso para registrar compras. Conservamos los datos ingresados.
              </p>
            )}
            {confirmDiscard && (
              <div className="express-discard" role="alert">
                <p>¿Volver a las solicitudes? Conservaremos este borrador y su foto.</p>
                <button
                  type="button"
                  onClick={() => {
                    controller.current?.abort();
                    scanSequence.current += 1;
                    setScanBusy(false);
                    setReadReplacement(null);
                    setScanResult(null);
                    setOpen(false);
                    setConfirmDiscard(false);
                  }}
                >
                  Volver y conservar
                </button>
                <button type="button" onClick={() => setConfirmDiscard(false)}>
                  Seguir editando
                </button>
              </div>
            )}
            <section className="express-order-section">
              <label htmlFor="express-order">
                OT o patente <span className="express-required">Obligatorio</span>
              </label>
              {draft.order && !choosingOrder ? (
                <div className="express-selected-order">
                  <div>
                    <strong>{draft.order.patente}</strong>
                    <span>
                      {draft.order.codigo} · {draft.order.vehiculo}
                    </span>
                    {draft.order.cliente && <small>{draft.order.cliente}</small>}
                  </div>
                  {!draft.requestId && (
                    <button type="button" onClick={() => setChoosingOrder(true)}>
                      Cambiar
                    </button>
                  )}
                </div>
              ) : (
                <div className="express-order-picker">
                  <div className="express-search">
                    <Search aria-hidden="true" />
                    <input
                      id="express-order"
                      aria-label="Buscar OT o patente"
                      aria-invalid={Boolean(errors.workOrderId)}
                      autoComplete="off"
                      placeholder="Ej.: OT-26-7 o RPYS14"
                      value={orderSearch}
                      onFocus={() => setChoosingOrder(true)}
                      onChange={(event) => {
                        setOrderSearch(event.target.value);
                        setChoosingOrder(true);
                      }}
                    />
                  </div>
                  {choosingOrder && (
                    <div
                      className="express-order-results"
                      role="region"
                      aria-label="Órdenes disponibles"
                    >
                      {orders.isFetching && <p role="status">Buscando órdenes…</p>}
                      {orders.isError && (
                        <p role="alert">
                          No se pudo buscar.{' '}
                          <button type="button" onClick={() => void orders.refetch()}>
                            Reintentar
                          </button>
                        </p>
                      )}
                      {orders.data?.map((order) => (
                        <button
                          type="button"
                          key={order.id}
                          onClick={() => {
                            update('order', order);
                            setChoosingOrder(false);
                            setErrors((previous) => {
                              const next = { ...previous };
                              delete next.workOrderId;
                              return next;
                            });
                          }}
                        >
                          <strong>{order.patente}</strong>
                          <span>
                            {order.codigo} · {order.vehiculo}
                          </span>
                          <Check aria-hidden="true" />
                        </button>
                      ))}
                      {!orders.isFetching && !orders.isError && orders.data?.length === 0 && (
                        <p>
                          No hay OTs disponibles. Solo se muestran órdenes abiertas con cotización
                          pendiente de pago.
                        </p>
                      )}
                      {draft.order && (
                        <button type="button" onClick={() => setChoosingOrder(false)}>
                          Conservar OT seleccionada
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {fieldError('workOrderId')}
            </section>
            <section className="express-scan-section">
              <div>
                <h3>Una foto, menos datos por escribir</h3>
                <p>Etiqueta o recibo. Revisa siempre el precio detectado.</p>
              </div>
              <div className="express-camera-actions">
                <label className="express-camera">
                  <Camera aria-hidden="true" />
                  <span>Escanear con cámara</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    aria-label="Escanear con cámara"
                    className="sr-only"
                    onChange={(event) => {
                      selectPhoto(event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                </label>
                <label className="express-gallery">
                  <FileImage aria-hidden="true" />
                  <span>Elegir foto</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    aria-label="Elegir foto del recibo"
                    className="sr-only"
                    onChange={(event) => {
                      selectPhoto(event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                </label>
              </div>
              {photoUrl && (
                <div className="express-photo">
                  <img src={photoUrl} alt="Foto de la etiqueta o recibo" />
                  <div>
                    <strong>{file?.name}</strong>
                    <span>Foto adjunta al registro</span>
                    <button
                      type="button"
                      onClick={() => {
                        controller.current?.abort();
                        scanSequence.current += 1;
                        setScanBusy(false);
                        setReadReplacement(null);
                        update('file', null);
                        setScanResult(null);
                        setScanError('');
                      }}
                    >
                      Quitar foto
                    </button>
                  </div>
                  {!scanBusy && (
                    <button type="button" onClick={() => file && void runScan(file)}>
                      Reintentar lectura
                    </button>
                  )}
                </div>
              )}
              {scanBusy && (
                <div>
                  <p role="status" className="express-scan-status">
                    <LoaderCircle className="animate-spin" aria-hidden="true" /> Luna está leyendo
                    la foto… Puedes seguir completando los datos.
                  </p>
                  <button
                    type="button"
                    className="express-scan-cancel"
                    onClick={() => {
                      controller.current?.abort();
                      scanSequence.current += 1;
                      setScanBusy(false);
                      setScanError(
                        'Lectura cancelada. Conservamos la foto; puedes completar los datos manualmente.',
                      );
                    }}
                  >
                    Continuar manualmente
                  </button>
                </div>
              )}
              {scanError && (
                <p role="alert" className="express-error">
                  {scanError}
                </p>
              )}
              {scanResult && (
                <div className="express-scan-result">
                  <p>
                    <CheckCircle2 aria-hidden="true" />{' '}
                    {scanResult.items.length === 1
                      ? 'Lectura lista. Revisa los datos antes de guardar.'
                      : scanResult.items.length > 1
                        ? 'Hay varios productos. Elige el accesorio de esta compra.'
                        : 'No se encontró un producto legible. Completa los datos manualmente.'}
                  </p>
                  {scanResult.items.length === 1 && (
                    <small>
                      {scanResult.items[0].descripcion} ·{' '}
                      {scanResult.items[0].costoUnitario === null
                        ? 'Precio no legible'
                        : `Compra detectada: ${formatClp(scanResult.items[0].costoUnitario)}`}
                    </small>
                  )}
                  {scanResult.items.length === 1 &&
                    scanResult.items[0].costoUnitario !== null &&
                    Number(draft.costoUnitario) !== scanResult.items[0].costoUnitario && (
                      <button
                        type="button"
                        onClick={() =>
                          applyRead({
                            result: scanResult,
                            index: 0,
                            sequence: scanSequence.current,
                            costOnly: true,
                          })
                        }
                      >
                        Usar precio detectado: {formatClp(scanResult.items[0].costoUnitario)}
                      </button>
                    )}
                  {scanResult.items.length > 1 &&
                    scanResult.items.map((item, index) => (
                      <button
                        type="button"
                        key={index}
                        onClick={() =>
                          applyRead({ result: scanResult, index, sequence: scanSequence.current })
                        }
                      >
                        <span>{item.descripcion}</span>
                        <strong>
                          {item.costoUnitario === null
                            ? 'Precio por confirmar'
                            : formatClp(item.costoUnitario)}
                        </strong>
                      </button>
                    ))}
                  {scanResult.advertencias.map((warning, index) => (
                    <small key={index}>{warning}</small>
                  ))}
                </div>
              )}
              {readReplacement && (
                <div
                  ref={readConfirmationRef}
                  className="express-discard"
                  role="alertdialog"
                  aria-labelledby="express-read-title"
                  aria-describedby="express-read-description"
                  tabIndex={-1}
                >
                  <p id="express-read-title">
                    La lectura reemplazará datos que editaste manualmente.
                  </p>
                  <p id="express-read-description">
                    Revisa el producto y el precio detectados antes de aceptar. Si conservas tus
                    datos, el borrador y la foto seguirán disponibles.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      applyRead(readReplacement, true);
                      formRef.current
                        ?.querySelector<HTMLInputElement>('#express-description')
                        ?.focus();
                    }}
                  >
                    Aceptar nuevos datos
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReadReplacement(null);
                      formRef.current
                        ?.querySelector<HTMLInputElement>('#express-description')
                        ?.focus();
                    }}
                  >
                    Conservar mis datos
                  </button>
                </div>
              )}
            </section>
            <section className="express-product-section">
              <label htmlFor="express-description">Accesorio</label>
              <input
                id="express-description"
                value={draft.descripcion}
                maxLength={255}
                readOnly={Boolean(draft.requestId)}
                aria-invalid={Boolean(errors.descripcion)}
                onChange={(event) => update('descripcion', event.target.value)}
                placeholder="Nombre del accesorio o repuesto"
              />
              {fieldError('descripcion')}
              <div className="express-price-grid">
                <div>
                  <label htmlFor="express-quantity">Cantidad</label>
                  <input
                    id="express-quantity"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={draft.cantidad}
                    readOnly={Boolean(draft.requestId)}
                    aria-invalid={Boolean(errors.cantidad)}
                    onChange={(event) => update('cantidad', event.target.value)}
                  />
                  {fieldError('cantidad')}
                </div>
                <div>
                  <label htmlFor="express-cost">Compra por unidad</label>
                  <CurrencyInput
                    id="express-cost"
                    value={draft.costoUnitario}
                    onChange={changeCost}
                    allowDecimals
                    aria-invalid={Boolean(errors.costoUnitario)}
                    placeholder="0"
                  />
                  {fieldError('costoUnitario')}
                  <small>Importe realmente pagado</small>
                </div>
              </div>
              <div className={`express-sale-field ${invalidSale ? 'is-invalid' : ''}`}>
                <label htmlFor="express-sale">Venta por unidad al cliente</label>
                <CurrencyInput
                  id="express-sale"
                  value={draft.ventaUnitario}
                  onChange={(value) => {
                    update('ventaUnitario', value);
                    setDraft((previous) => ({ ...previous, saleEdited: true }));
                  }}
                  allowDecimals
                  aria-invalid={invalidSale || Boolean(errors.ventaUnitario)}
                  placeholder="0"
                />
                <div>
                  <span>
                    Mínimo +25%: <strong>{formatClp(minimum)}</strong>
                  </span>
                  <button
                    type="button"
                    disabled={cost <= 0}
                    onClick={() =>
                      setDraft((previous) => ({
                        ...previous,
                        ventaUnitario: String(minimum),
                        saleEdited: false,
                      }))
                    }
                  >
                    Usar sugerido
                  </button>
                </div>
                <small>IVA incluido. El mínimo se mantiene también en la cotización.</small>
                {invalidSale && (
                  <small role="alert" className="express-field-error">
                    La venta no puede ser menor al 125% del precio de compra.
                  </small>
                )}
                {fieldError('ventaUnitario')}
              </div>
              <label htmlFor="express-detail">
                Detalle <span>Opcional</span>
              </label>
              <textarea
                id="express-detail"
                rows={2}
                maxLength={1000}
                value={draft.detalle}
                onChange={(event) => update('detalle', event.target.value)}
                placeholder="Marca, medida o indicaciones para el taller"
              />
            </section>
            <details className="express-extra-fields" open={errors.fechaEmision ? true : undefined}>
              <summary>
                Proveedor y datos del recibo <ChevronDown aria-hidden="true" />
              </summary>
              <div>
                <label htmlFor="express-supplier">
                  Proveedor <span>Opcional</span>
                </label>
                <input
                  id="express-supplier"
                  value={draft.proveedorNombre}
                  maxLength={180}
                  onChange={(event) => update('proveedorNombre', event.target.value)}
                  placeholder="Nombre del proveedor"
                />
                <label htmlFor="express-folio">
                  Folio <span>Opcional</span>
                </label>
                <input
                  id="express-folio"
                  value={draft.folio}
                  maxLength={50}
                  onChange={(event) => update('folio', event.target.value)}
                />
                <label htmlFor="express-date">Fecha de compra</label>
                <input
                  id="express-date"
                  type="date"
                  max={todayInputValue()}
                  value={draft.fechaEmision}
                  aria-invalid={Boolean(errors.fechaEmision)}
                  onChange={(event) => update('fechaEmision', event.target.value)}
                />
                {fieldError('fechaEmision')}
                <label className="express-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.conIva}
                    onChange={(event) => update('conIva', event.target.checked)}
                  />
                  El importe de compra ya incluye IVA
                </label>
              </div>
            </details>
            <section className="express-payment-section">
              <label htmlFor="express-payment">¿Cómo pagaste?</label>
              <select
                id="express-payment"
                value={draft.metodoPago}
                onChange={(event) =>
                  update('metodoPago', event.target.value as ExpressRecovery['metodoPago'])
                }
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {PAYMENT_METHOD_LABELS[method]}
                  </option>
                ))}
              </select>
              <p>Se registra el egreso de compra. El accesorio queda por cobrar al cliente.</p>
            </section>
            <section className="express-totals" aria-label="Resumen express">
              <div>
                <span>Egreso de compra</span>
                <strong>{formatClp(totalCost, 2)}</strong>
              </div>
              <div>
                <span>Venta al cliente · IVA incluido</span>
                <strong>{formatClp(totalSale, 2)}</strong>
              </div>
              <small>
                {draft.order
                  ? `${draft.order.codigo} · ${draft.order.patente}`
                  : 'Selecciona una OT para vincular el cobro'}{' '}
                · {quantity || 0} unidad(es)
              </small>
            </section>
            {save.isError && (
              <p role="alert" className="express-error">
                {getApiErrorMessage(
                  save.error,
                  'No pudimos registrar la compra. Tus datos siguen guardados. Reintenta con la misma captura.',
                )}
              </p>
            )}
            <footer className="express-save-bar">
              <button
                className="express-primary"
                type="submit"
                disabled={pending || scanBusy || Boolean(readReplacement) || invalidSale}
              >
                {pending ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : (
                  <Check aria-hidden="true" />
                )}
                {pending ? 'Registrando…' : 'Confirmar compra y egreso'}
              </button>
            </footer>
          </fieldset>
        </form>
      )}
      {!open && hasContent && canCreate && !success && recovery.ready && (
        <section className="express-resume">
          <p>Tienes una compra en preparación.</p>
          <button className="express-secondary" type="button" onClick={() => setOpen(true)}>
            <ArrowLeft aria-hidden="true" /> Continuar compra
          </button>
        </section>
      )}
    </div>
  );
}
