import {
  createExpressExpenseSchema,
  createExpressPurchaseBatchSchema,
  EXPRESS_PURCHASE_DESTINATIONS,
  expressMinimumSale,
  PAYMENT_METHODS,
} from '@unithor/shared';
import {
  ArrowLeft,
  Building2,
  Camera,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  FileImage,
  History,
  Layers,
  LoaderCircle,
  Plus,
  Search,
  ShoppingBag,
  Truck,
  Wrench,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import FormRecoveryBanner from '../../components/common/FormRecoveryBanner';
import ExpressInternalPurchaseFields from '../../components/purchases/ExpressInternalPurchaseFields';
import ExpressOrderPicker from '../../components/purchases/ExpressOrderPicker';
import ExpressPurchaseLine, {
  expressLineTotals,
} from '../../components/purchases/ExpressPurchaseLine';
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

import type { ExpressRecovery, ExpressRecoveryLine } from '../../lib/purchase-express-recovery';
import type { Purchase } from '../../types/entities';
import type { CreateExpressExpenseInput, CreateExpressPurchaseSubmission, ExpressPurchaseDestination, ExpressPurchaseRequest, ExpressScanResult } from '@unithor/shared';
import type { FormEvent } from 'react';

const emptyLine = (): ExpressRecoveryLine => ({
  id: crypto.randomUUID(),
  order: null,
  requestId: null,
  descripcion: '',
  cantidad: '1',
  costoUnitario: '',
  ventaUnitario: '',
  saleEdited: false,
  detalle: '',
});
const emptyDraft = (): ExpressRecovery => ({
  operationKey: crypto.randomUUID(),
  destino: null,
  fleet: null,
  concept: '',
  amount: '',
  additionalOrders: [],
  order: null,
  items: [emptyLine()],
  editedFields: [],
  conIva: true,
  metodoPago: 'efectivo',
  proveedorNombre: '',
  folio: '',
  fechaEmision: todayInputValue(),
  detalle: '',
  file: null,
  tipoDocumento: 'otro',
});

const destinations = {
  ot: { label: 'OT', icon: Car },
  flota: { label: 'Flota', icon: Truck },
  multiple: { label: 'Múltiple', icon: Layers },
  oficina: { label: 'Oficina', icon: Building2 },
  taller: { label: 'Taller', icon: Wrench },
};

type ScanSelection = {
  result: ExpressScanResult;
  sequence: number;
  costOnly?: boolean;
};

export default function PurchasesExpressPage({
  initiallyOpen = false,
}: {
  initiallyOpen?: boolean;
}) {
  const [session, setSession] = useState({ key: 0, open: initiallyOpen });
  const userId = useAuthStore((state) => state.user?.id);
  return (
    <PurchasesExpressWorkspace
      key={`${userId ?? 'guest'}:${session.key}`}
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
  const canReadFleet = Boolean(user && hasUserPermission(user, 'flota', 'read'));
  const [open, setOpen] = useState(initiallyOpen);
  const [draft, setDraft] = useState(emptyDraft);
  const [search, setSearch] = useState('');
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [addingOrder, setAddingOrder] = useState(false);
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
  const requestCount = useExpressRequests('', canRead);
  const debouncedSearch = useDebouncedValue(search.trim(), 250);
  const searchedRequests = useExpressRequests(debouncedSearch, canRead && requestsOpen && Boolean(debouncedSearch));
  const requests = requestsOpen && debouncedSearch ? searchedRequests : requestCount;
  const internal = draft.destino === 'flota' || draft.destino === 'oficina' || draft.destino === 'taller';
  const allowedOrders = draft.order ? [draft.order, ...draft.additionalOrders] : draft.additionalOrders;
  const canReviewProducts = Boolean(draft.order && (draft.destino !== 'multiple' || allowedOrders.length > 1));
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
  currentDraft.current = draft;
  const formRef = useRef<HTMLFormElement>(null);
  const readConfirmationRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hasContent = Boolean(
    draft.items.some(
      (item) =>
        item.descripcion ||
        item.costoUnitario ||
        item.ventaUnitario ||
        item.detalle ||
        item.cantidad !== '1' ||
        item.order,
    ) ||
    draft.items.length > 1 ||
    draft.order ||
    draft.fleet || draft.concept || draft.amount ||
    draft.detalle ||
    draft.file ||
    draft.proveedorNombre ||
    draft.folio,
  );
  const recovery = useFormRecovery({
    userId: user?.id,
    form: 'purchase:express',
    schema: expressRecoverySchema,
    value: draft,
    hasContent,
    paused: save.isPending || Boolean(success),
    onRestore: (value) => {
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
    setDraft((previous) => ({
      ...previous,
      [key]: value,
      editedFields: [...new Set([...previous.editedFields, ...(key === 'file' ? [] : [key])])],
    }));
    setErrors((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
    save.reset();
  };
  const changeLine = (id: string, changes: Partial<ExpressRecoveryLine>) => {
    setDraft((previous) => ({
      ...previous,
      items: previous.items.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...changes };
        if ('costoUnitario' in changes && !next.saleEdited) {
          next.ventaUnitario = next.costoUnitario
            ? String(Math.ceil(expressMinimumSale(Number(next.costoUnitario))))
            : '';
        }
        return next;
      }),
      editedFields: [
        ...new Set([
          ...previous.editedFields,
          ...Object.keys(changes)
            .filter((key) => key !== 'saleEdited')
            .map((key) => `${id}.${key}`),
        ]),
      ],
    }));
    setErrors({});
    save.reset();
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
    controller.current?.abort();
    scanSequence.current += 1;
    setScanBusy(false);
    setDraft(
      request
        ? {
            ...emptyDraft(),
            destino: 'ot',
            order: request.order,
            items: [
              {
                ...emptyLine(),
                order: request.order,
                requestId: request.id,
                descripcion: request.descripcion,
                cantidad: String(request.cantidad),
                detalle: request.detalle,
              },
            ],
          }
        : emptyDraft(),
    );
    setAddingOrder(false);
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
    const { result, sequence, costOnly } = selection;
    if (sequence !== scanSequence.current || controller.current?.signal.aborted) return;
    const previous = currentDraft.current;
    const manual = new Set(previous.editedFields);
    const values: Partial<ExpressRecovery> = {};
    const apply = <K extends keyof ExpressRecovery>(
      key: K,
      value: ExpressRecovery[K] | null,
      fallback: ExpressRecovery[K],
    ) => {
      if (value !== null) values[key] = value;
      // A new reading must not retain data detected for the previous product.
      else if (!manual.has(key)) values[key] = fallback;
    };
    if (!costOnly) {
      apply('proveedorNombre', result.proveedorNombre, '');
      apply('folio', result.folio, '');
      apply('fechaEmision', result.fechaEmision, todayInputValue());
      values.tipoDocumento = result.documento === 'recibo' ? 'recibo' : 'otro';
      apply('conIva', result.incluyeIva, true);
      if (internal) {
        const description = result.items.map((item) => item.descripcion).join(', ').slice(0, 255);
        const total = result.documento === 'recibo' ? result.totalComprobante : null;
        apply('concept', description || null, '');
        apply('amount', total == null ? null : String(total), '');
      }
    }
    const sourceItems = internal ? [] : costOnly ? result.items.slice(0, 1) : result.items;
    const readItems = sourceItems.map((item, index) => {
      const old = previous.items[index];
      const next = old ? { ...old } : emptyLine();
      const set = (
        key: 'descripcion' | 'cantidad' | 'costoUnitario',
        value: string | null,
        fallback: string,
      ) => {
        if (value !== null) next[key] = value;
        else if (!manual.has(`${next.id}.${key}`)) next[key] = fallback;
      };
      if (!costOnly && !next.requestId) {
        set('descripcion', item.descripcion, '');
        set('cantidad', item.cantidad === null ? null : String(item.cantidad), '1');
      }
      set('costoUnitario', item.costoUnitario === null ? null : String(item.costoUnitario), '');
      if (!next.saleEdited)
        next.ventaUnitario = next.costoUnitario
          ? String(Math.ceil(expressMinimumSale(Number(next.costoUnitario))))
          : '';
      return next;
    });
    // An unreadable receipt must not erase products. Cost-only recovery also leaves other lines intact.
    if (readItems.length)
      values.items = costOnly
        ? [...readItems, ...previous.items.slice(1)]
        : [
            ...readItems,
            ...previous.items.slice(readItems.length).filter((item) => item.requestId),
          ];
    if ((values.items?.length ?? 0) > 30) {
      setScanError('La lectura y las solicitudes superan 30 productos. Conservamos el borrador.');
      return;
    }
    const keys = Object.keys(values) as (keyof ExpressRecovery)[];
    const changesItems =
      values.items && JSON.stringify(values.items) !== JSON.stringify(previous.items);
    const changesManualLine =
      changesItems &&
      (manual.has('items') ||
        previous.items.some((item, index) => {
          const next = values.items?.[index];
          return Object.keys(item).some(
            (key) =>
              manual.has(`${item.id}.${key}`) &&
              item[key as keyof ExpressRecoveryLine] !== next?.[key as keyof ExpressRecoveryLine],
          );
        }));
    if (
      !confirmed &&
      (changesManualLine ||
        keys.some((key) => key !== 'items' && manual.has(key) && previous[key] !== values[key]))
    ) {
      setReadReplacement(selection);
      return;
    }
    setReadReplacement(null);
    setDraft((latest) => ({
      ...latest,
      ...values,
      editedFields: latest.editedFields.filter((key) => {
        if (key === 'items') return !changesItems;
        if (keys.includes(key as keyof ExpressRecovery) && key !== 'items')
          return previous[key as keyof ExpressRecovery] === values[key as keyof ExpressRecovery];
        const index = previous.items.findIndex((item) => key.startsWith(`${item.id}.`));
        if (index < 0 || !values.items) return true;
        const field = key.slice(previous.items[index].id.length + 1) as keyof ExpressRecoveryLine;
        return previous.items[index][field] === values.items[index]?.[field];
      }),
    }));
    setErrors({});
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
      applyRead({ result, sequence });
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
  const cancelScan = () => {
    controller.current?.abort();
    scanSequence.current += 1;
    setScanBusy(false);
    setReadReplacement(null);
    setScanResult(null);
    setScanError('');
  };
  const selectReceipt = (attachment: File | undefined) => {
    if (!attachment) return;
    const isPdf = attachment.type === 'application/pdf';
    if (
      (!isPdf && !['image/jpeg', 'image/png', 'image/webp'].includes(attachment.type)) ||
      attachment.size > 8 * 1024 * 1024 ||
      attachment.size === 0
    ) {
      setScanError('Usa una imagen JPG, PNG o WebP, o un PDF de hasta 8 MB.');
      return;
    }
    cancelScan();
    update('file', { blob: attachment, name: attachment.name, lastModified: attachment.lastModified });
    if (isPdf) return;
    if (requests.data?.scannerConfigured === false) {
      setScanError(
        'Foto adjunta. Falta configurar la IA en el servidor; puedes completar los campos manualmente.',
      );
    } else void runScan(attachment);
  };
  const invalidSale = draft.items.some(
    (item) =>
      Number(item.costoUnitario) > 0 &&
      Number(item.ventaUnitario) < expressMinimumSale(Number(item.costoUnitario)),
  );
  const totalCost = draft.items.reduce((sum, item) => sum + expressLineTotals(item).cost, 0);
  const totalSale = draft.items.reduce((sum, item) => sum + expressLineTotals(item).sale, 0);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreate || inFlight.current || scanBusy || readReplacement || !recovery.ready) return;
    if (!draft.destino || (!internal && !canReviewProducts)) return;
    const parsed = internal ? createExpressExpenseSchema.safeParse({
      operationKey: draft.operationKey, destino: draft.destino, concepto: draft.concept, monto: draft.amount,
      metodoPago: draft.metodoPago, fechaEmision: draft.fechaEmision || undefined,
      proveedorNombre: draft.proveedorNombre || undefined,
      folio: draft.folio || undefined,
      tipoDocumento: draft.tipoDocumento === 'recibo' ? 'recibo' : undefined,
      ...(draft.destino === 'flota' ? { fleetVehicleId: draft.fleet?.id } : {}),
    }) : createExpressPurchaseBatchSchema.safeParse({
      operationKey: draft.operationKey,
      destino: draft.destino,
      workOrderId: draft.order?.id,
      conIva: draft.conIva,
      metodoPago: draft.metodoPago,
      proveedorNombre: draft.proveedorNombre,
      tipoDocumento: draft.tipoDocumento,
      folio: draft.folio,
      fechaEmision: draft.fechaEmision || undefined,
      detalle: draft.detalle,
      items: draft.items.map((item) => ({
        workOrderId: item.order?.id,
        requestId: item.requestId,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        costoUnitario: item.costoUnitario,
        ventaUnitario: item.ventaUnitario,
        detalle: item.detalle,
      })),
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
      const data: CreateExpressPurchaseSubmission | CreateExpressExpenseInput = parsed.data;
      const result = await save.mutateAsync({ data, file });
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
  const changeDestination = (destino: ExpressPurchaseDestination) => {
    update('destino', destino);
    setChoosingOrder(false);
    setOrderSearch('');
  };

  const receiptCapture = (
    <section className="express-scan-section">
      <div className="express-camera-actions">
        <label className="express-camera">
          <Camera aria-hidden="true" />
            <span>Tomar foto</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
              aria-label="Tomar foto"
            className="sr-only"
            onChange={(event) => {
                selectReceipt(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>
        <label className="express-gallery">
          <FileImage aria-hidden="true" />
            <span>Elegir imagen o PDF</span>
          <input
            type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              aria-label="Elegir imagen o PDF"
            className="sr-only"
            onChange={(event) => {
                selectReceipt(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>
      </div>
        {file && (
        <div className="express-photo">
            {photoUrl && file.type !== 'application/pdf' && <img src={photoUrl} alt="Foto de la etiqueta o recibo" />}
          <div>
              <strong>{file.name}</strong>
            <button
              type="button"
              onClick={() => {
                  cancelScan();
                update('file', null);
              }}
            >
                {file.type === 'application/pdf' ? 'Quitar PDF' : 'Quitar foto'}
            </button>
          </div>
            {!scanBusy && file.type !== 'application/pdf' && requests.data?.scannerConfigured !== false && (
              <button type="button" onClick={() => void runScan(file)}>
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
                cancelScan();
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
              {internal
                ? scanResult.documento === 'recibo' && scanResult.totalComprobante != null
                  ? `Total leído: ${formatClp(scanResult.totalComprobante)}. Revísalo antes de guardar.`
                  : 'Total ilegible. Ingresa el monto del comprobante.'
                : scanResult.items.length === 1
              ? 'Lectura lista. Revisa los datos antes de guardar.'
              : scanResult.items.length > 1
                ? `${scanResult.items.length} productos detectados. Revisa y edita cada uno antes de guardar.`
                : 'No se encontró un producto legible. Completa los datos manualmente.'}
          </p>
            {!internal && scanResult.items.length === 1 && (
            <small>
              {scanResult.items[0].descripcion} ·{' '}
              {scanResult.items[0].costoUnitario === null
                ? 'Precio no legible'
                : `Compra detectada: ${formatClp(scanResult.items[0].costoUnitario)}`}
            </small>
          )}
            {!internal && scanResult.items.length === 1 &&
            scanResult.items[0].costoUnitario !== null &&
            Number(draft.items[0]?.costoUnitario) !== scanResult.items[0].costoUnitario && (
              <button
                type="button"
                onClick={() =>
                  applyRead({
                    result: scanResult,
                    sequence: scanSequence.current,
                    costOnly: true,
                  })
                }
              >
                Usar precio detectado: {formatClp(scanResult.items[0].costoUnitario)}
              </button>
            )}
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
              {internal
                ? 'Revisa el total y los datos detectados antes de aceptar.'
                : 'Revisa los productos y precios detectados antes de aceptar.'}
          </p>
          <button
            type="button"
            onClick={() => {
              applyRead(readReplacement, true);
              formRef.current
                  ?.querySelector<HTMLInputElement>(internal ? '#express-expense-concept' : '#express-description')
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
                  ?.querySelector<HTMLInputElement>(internal ? '#express-expense-concept' : '#express-description')
                ?.focus();
            }}
          >
            Conservar mis datos
          </button>
        </div>
      )}
    </section>
  );

  return (
    <div className="workspace-page purchases-express">
      <header className="express-page-heading">
        <div>
          <h1 ref={headingRef} tabIndex={-1}>
            Compras express
          </h1>
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
            <p>{success.codigo} · {formatClp(success.total)}</p>
            {canRead && <Link to={`/purchases/${success.id}`}>Ver compra</Link>}
          </div>
        </section>
      )}
      {!open && (
        <>
          <div className="express-inbox-heading">
            {canRead && <h2 className="express-requests-title">
              <button type="button" aria-expanded={requestsOpen} aria-controls="express-requests" onClick={() => setRequestsOpen(!requestsOpen)}>
                Solicitudes del taller <span>{requestCount.data ? requestCount.data.total ?? requestCount.data.items.length : '—'}</span>
                <ChevronDown aria-hidden="true" />
              </button>
            </h2>}
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
          {canRead && requestsOpen && <div id="express-requests" className="express-requests-content">
            <label className="express-search">
              <Search aria-hidden="true" />
              <input
                aria-label="Buscar solicitudes por OT o patente"
                placeholder="Buscar OT o patente"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
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
          {!requests.isPending && !requests.isError && available.length === 0 && <p className="express-message">Sin solicitudes</p>}
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
          </div>}
        </>
      )}
      {open && !draft.destino && canCreate && (
        <section className="express-destination-panel" aria-labelledby="express-destination-title">
          <div className="express-form-title">
            <h2 id="express-destination-title">Destino de la compra</h2>
            <button type="button" className="express-icon-button" aria-label="Cerrar selección de destino" onClick={() => setOpen(false)}><X aria-hidden="true" /></button>
          </div>
          <div className="express-destination-grid">
            {EXPRESS_PURCHASE_DESTINATIONS.map((option) => {
              const { label, icon: Icon } = destinations[option];
              return <button type="button" key={option} disabled={!recovery.ready || (option === 'flota' && !canReadFleet)} onClick={() => changeDestination(option)}>
                <Icon aria-hidden="true" />{label}
              </button>;
            })}
          </div>
        </section>
      )}
      {open && draft.destino && (
        <form
          ref={formRef}
          className="express-form"
          onSubmit={(event) => void submit(event)}
          noValidate
        >
          <fieldset disabled={pending || !canCreate || !recovery.ready}>
            <div className="express-form-title">
              <div>
                <h2>{destinations[draft.destino].label}</h2>
              </div>
              <button
                type="button"
                className="express-icon-button"
                aria-label="Cerrar formulario de compra"
                onClick={() => {
                  if (hasContent) setConfirmDiscard(true);
                  else update('destino', null);
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
            {internal ? <>
              {receiptCapture}
              <ExpressInternalPurchaseFields draft={draft} update={update} errors={errors} />
            </> : <>
            <section className="express-order-section">
              <label htmlFor="express-order">
                {draft.destino === 'multiple' ? 'OT principal' : 'Orden de trabajo'}
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
                  {canCreate && !draft.items.some((item) => item.requestId) && (
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
                            if (draft.destino === 'multiple' && draft.order && draft.order.id !== order.id) {
                              update('additionalOrders', [...draft.additionalOrders.filter((entry) => entry.id !== order.id), draft.order]);
                              if (draft.items.some((item) => !item.requestId && item.order?.id === order.id)) {
                                update('items', draft.items.map((item) => !item.requestId && item.order?.id === order.id ? { ...item, order: null } : item));
                              }
                            }
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
                        <p>Sin OT disponibles</p>
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
            {draft.destino === 'multiple' && draft.order && <section className="express-multiple-orders" aria-label="Órdenes adicionales">
              <ul>{draft.additionalOrders.map((order) => {
                const assigned = draft.items.some((item) => item.order?.id === order.id);
                return <li key={order.id}><span>{order.codigo} · {order.patente}</span>
                  <button type="button" className="express-icon-button" title={assigned ? 'Reasigna sus productos antes de quitarla' : 'Quitar orden'}
                    aria-label={`Quitar ${order.codigo}`} disabled={assigned} onClick={() => update('additionalOrders', draft.additionalOrders.filter((entry) => entry.id !== order.id))}><X aria-hidden="true" /></button>
                </li>;
              })}</ul>
              <button type="button" className="express-secondary" onClick={() => setAddingOrder(!addingOrder)}><Plus aria-hidden="true" /> {addingOrder ? 'Cerrar búsqueda' : 'Añadir otra OT'}</button>
              {addingOrder && <ExpressOrderPicker label="Buscar otra OT" exclude={allowedOrders.map((order) => order.id)} onSelect={(order) => {
                update('additionalOrders', [...draft.additionalOrders, order]);
                setAddingOrder(false);
              }} />}
            </section>}
            {receiptCapture}
            {canReviewProducts && <>
            <div className="grid min-w-0 gap-3" aria-label="Productos de la compra">
              {draft.items.map((item, index) => (
                <ExpressPurchaseLine
                  key={item.id}
                  item={item}
                  index={index}
                  headerOrder={draft.order}
                  orderOptions={draft.destino === 'multiple' ? draft.additionalOrders : undefined}
                  errors={errors}
                  canRemove={draft.items.length > 1}
                  onChange={(changes) => changeLine(item.id, changes)}
                  onRemove={() => {
                    update(
                      'items',
                      draft.items.filter((line) => line.id !== item.id),
                    );
                    setErrors({});
                  }}
                />
              ))}
              {fieldError('items')}
              <button
                type="button"
                className="express-secondary"
                disabled={draft.items.length >= 30}
                onClick={() => update('items', [...draft.items, emptyLine()])}
              >
                <Plus aria-hidden="true" /> Agregar producto
              </button>
              <small className="text-xs text-slate-500">{draft.items.length} de 30</small>
            </div>
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
              {draft.destino === 'multiple' && <div className="express-order-totals">
                {allowedOrders.map((order) => {
                  const lines = draft.items.filter((line) => (line.order?.id ?? draft.order?.id) === order.id);
                  return <small key={order.id}>{order.codigo} · {lines.length} {lines.length === 1 ? 'producto' : 'productos'}</small>;
                })}
              </div>}
            </section>
            </>}</>}
            {fieldError('_form')}
            {save.isError && (
              <p role="alert" className="express-error">
                {getApiErrorMessage(
                  save.error,
                  'No pudimos registrar la compra. Tus datos siguen guardados. Reintenta con la misma captura.',
                )}
              </p>
            )}
            {(internal || canReviewProducts) && <footer className="express-save-bar">
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
                {pending ? 'Registrando…' : 'Registrar compra'}
              </button>
            </footer>}
          </fieldset>
        </form>
      )}
      {!open && hasContent && canCreate && !success && recovery.ready && (
        <section className="express-resume">
          <button className="express-secondary" type="button" onClick={() => setOpen(true)}>
            <ArrowLeft aria-hidden="true" /> Continuar compra
          </button>
        </section>
      )}
    </div>
  );
}
