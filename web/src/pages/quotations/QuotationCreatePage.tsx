import { calculateQuotationPricing, createQuotationSchema } from '@unithor/shared';
import { AlertCircle, ArrowLeft, CheckCircle2, LoaderCircle, Plus, ReceiptText, Save } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { AnimateIcon } from '../../components/animate-ui';
import ClientFormModal from '../../components/clients/ClientFormModal';
import ModalHeader from '../../components/common/ModalHeader';
import QuickVehicleSearch from '../../components/common/QuickVehicleSearch';
import SavingOverlay from '../../components/common/SavingOverlay';
import QuotationCommercialFields, { createCommercialDraft } from '../../components/quotations/QuotationCommercialFields';
import QuotationDiscountSummary from '../../components/quotations/QuotationDiscountSummary';
import WorkOrderItemsEditor, { createEmptyWorkOrderItem } from '../../components/work-orders/WorkOrderItemsEditor';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import { useCreateQuotationMutation } from '../../hooks/useQuotations';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { formatClp } from '../../lib/formatters';

import type { CommercialDraft } from '../../components/quotations/QuotationCommercialFields';
import type { EditableWorkOrderItem } from '../../components/work-orders/WorkOrderItemsEditor';
import type { QuickSearchClient } from '../../types/entities';
import type { CreateQuotationInput } from '@unithor/shared';

export const QuotationCreatePage = () => {
  const navigate = useNavigate();
  const createMutation = useCreateQuotationMutation();
  const [client, setClient] = useState<Pick<QuickSearchClient, 'id' | 'nombre' | 'rut'> | null>(null);
  const [showClientModal, setShowClientModal] = useState(false);
  const [notas, setNotas] = useState('');
  const [commercial, setCommercial] = useState(() => createCommercialDraft());
  const [items, setItems] = useState<EditableWorkOrderItem[]>([createEmptyWorkOrderItem()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmData, setConfirmData] = useState<CreateQuotationInput | null>(null);

  const closeConfirm = (): void => {
    if (!createMutation.isPending) setConfirmData(null);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    createMutation.reset();
    if (!client) {
      setErrors({ _form: 'Seleccione un cliente para emitir la cotización.' });
      return;
    }
    const result = createQuotationSchema.safeParse({
      ...commercial,
      clientId: client.id,
      vehicleId: null,
      notas,
      items: items.map((item) => ({
        catalogItemId: item.catalogItemId,
        descripcion: item.descripcion,
        tipoLinea: item.tipoLinea,
        unidadMedida: item.unidadMedida,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        estadoOperativo: item.estadoOperativo,
        notasOperativas: item.notasOperativas,
        descuentoTipo: item.descuentoTipo ?? null,
        descuentoValor: item.descuentoValor ?? 0,
      })),
    });

    if (!result.success) {
      setErrors(getFieldErrors(result.error.issues));
      return;
    }

    setErrors({});
    // No se crea de inmediato: primero un resumen de confirmación.
    setConfirmData(result.data);
  };

  const confirmCreate = (): void => {
    if (!confirmData || createMutation.isPending) return;
    createMutation.mutate(confirmData, {
      onSuccess: (quotation) => {
        setConfirmData(null);
        navigate(`/quotations/${quotation.id}`);
      },
      onError: () => setConfirmData(null),
    });
  };

  return (
    <div className="min-w-0 space-y-5" aria-busy={createMutation.isPending}>
      {createMutation.isPending && <SavingOverlay message="Guardando cotización…" detail="El correo se preparará automáticamente después de guardar." />}
      <header className="flex items-start gap-3">
        <Link to="/quotations" className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-brand-line bg-white text-brand-muted transition-colors hover:bg-brand-pale" aria-label="Volver a cotizaciones">
          <AnimateIcon variant="slide-left" animateOnHover>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </AnimateIcon>
        </Link>
        <div>
          <p className="text-sm font-medium text-brand-muted">Emisión comercial</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-primaryInk sm:text-3xl">Nueva Cotización</h1>
        </div>
      </header>
      <form onSubmit={submit} className="overflow-hidden rounded-lg border border-brand-line bg-white shadow-sm">
        <section className="p-5 sm:p-6">
          <h2 className="font-bold text-brand-primaryInk">Cliente</h2>
          <div className="mt-3 flex max-w-2xl items-start gap-2">
            <div className="min-w-0 flex-1">
              <QuickVehicleSearch
                mode="clients"
                allowCreateClient
                placeholder="Buscar cliente por nombre, RUT o teléfono"
                onSelectClient={(selectedClient) => {
                  setClient(selectedClient);
                  setErrors({});
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => setShowClientModal(true)}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-brand-primaryInk px-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-brand-primaryInkHover active:scale-95"
              title="Crear un cliente nuevo"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="max-sm:sr-only">Nuevo cliente</span>
            </button>
          </div>
          {client ? (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-brand-mint/40 bg-brand-mintPale px-4 py-3" role="status">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-mintInk" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wide text-brand-mintInk">
                  Cliente seleccionado
                </p>
                <p className="break-words font-semibold text-brand-ink">{client.nombre}</p>
                {client.rut && <p className="text-xs text-brand-muted">{client.rut}</p>}
              </div>
              <button
                type="button"
                onClick={() => setClient(null)}
                className="shrink-0 rounded-lg border border-brand-line bg-white px-3 py-1.5 text-xs font-semibold text-brand-muted transition-colors hover:bg-brand-pale hover:text-brand-primaryInk"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-brand-muted">
              Busca un cliente existente o crea uno nuevo sin salir de aquí.
            </p>
          )}
          {errors._form && <p className="mt-3 text-sm text-brand-coralInk" role="alert">{errors._form}</p>}
        </section>
        <section className="space-y-5 border-t border-brand-line p-5 sm:p-6">
          <QuotationCommercialFields value={commercial} onChange={setCommercial} errors={errors} />
          <WorkOrderItemsEditor items={items} onChange={setItems} errors={errors} title="Conceptos cotizados" emptyMessage="La cotización se emitirá sin conceptos y con total cero." showExecution={false} showDiscounts discountToggle showTotal={false} />
          <QuotationDiscountSummary items={items} value={commercial} onChange={setCommercial} />
          {errors.descuentoValor && <p role="alert" className="text-sm text-brand-coralInk">{errors.descuentoValor}</p>}
          <label className="block text-sm font-semibold text-brand-ink">Notas comerciales o garantía<textarea rows={3} value={notas} onChange={(event) => setNotas(event.target.value)} className="mt-2 w-full resize-y rounded-lg border border-brand-line px-3 py-2 font-normal outline-none focus:border-brand-primary" /></label>
        </section>
        {createMutation.isError && <div className="mx-5 mb-5 flex items-center gap-2 rounded-lg border border-brand-coral/30 bg-brand-coralPale px-4 py-3 text-sm text-brand-coralInk" role="alert"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{getApiErrorMessage(createMutation.error)}</div>}
        <footer className="flex flex-col-reverse gap-2 border-t border-brand-line bg-brand-line/40 p-4 sm:flex-row sm:justify-end">
          <Link to="/quotations" className="inline-flex h-10 items-center justify-center rounded-lg border border-brand-line bg-white px-4 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-pale">Cancelar</Link>
          <button type="submit" className="group inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-primaryInk px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-primaryInkHover hover:shadow disabled:opacity-60" disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <AnimateIcon variant="bounce" animateOnHover>
                <Save className="h-4 w-4" aria-hidden="true" />
              </AnimateIcon>
            )}
            Crear cotización
          </button>
        </footer>
      </form>
      {showClientModal && (
        <ClientFormModal
          onClose={() => setShowClientModal(false)}
          onSaved={(saved) => {
            setClient({ id: saved.id, nombre: saved.nombre, rut: saved.rut });
            setErrors({});
            setShowClientModal(false);
          }}
        />
      )}
      {confirmData && client && (
        <QuotationCreateConfirm
          clientName={client.nombre}
          items={items}
          commercial={commercial}
          isPending={createMutation.isPending}
          onClose={closeConfirm}
          onConfirm={confirmCreate}
        />
      )}
    </div>
  );
};

export default QuotationCreatePage;

const QuotationCreateConfirm = ({
  clientName,
  items,
  commercial,
  isPending,
  onClose,
  onConfirm,
}: {
  clientName: string;
  items: EditableWorkOrderItem[];
  commercial: CommercialDraft;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) => {
  const setPanelNode = useModalOverlay({ isOpen: true, onClose, isPending });
  let subtotal = 0;
  let discounts = 0;
  let total = 0;
  try {
    const pricing = calculateQuotationPricing(items, commercial);
    subtotal = pricing.subtotal;
    discounts = pricing.descuentoLineas + pricing.descuentoGeneral;
    total = pricing.total;
  } catch {
    total = items.reduce(
      (sum, item) => sum + Math.max(0, Number(item.cantidad) || 0) * Math.max(0, Number(item.precioUnitario) || 0),
      0,
    );
    subtotal = total;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        className="fixed inset-0 bg-[#18273c55] backdrop-blur-sm transition-opacity"
        aria-label="Volver a la cotización"
        onClick={onClose}
        disabled={isPending}
        tabIndex={-1}
      />
      <motion.section
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-brand-line bg-white shadow-2xl"
        role="dialog"
        ref={setPanelNode}
        aria-modal="true"
        aria-labelledby="confirm-quotation-title"
      >
        <ModalHeader
          id="confirm-quotation-title"
          badge={<ReceiptText className="h-6 w-6" aria-hidden="true" />}
          tone="primary"
          eyebrow="Nueva cotización"
          title="Confirmar emisión"
          description="Revisa el resumen antes de crear la cotización."
          onClose={onClose}
          closeLabel="Volver"
        />
        <dl className="space-y-2.5 px-7 pb-2 text-sm tabular-nums">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-brand-muted">Cliente</dt>
            <dd className="min-w-0 truncate font-semibold text-brand-ink">{clientName}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-brand-muted">Conceptos</dt>
            <dd className="font-semibold text-brand-ink">{items.length}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-brand-muted">Subtotal</dt>
            <dd className="font-semibold text-brand-ink">{formatClp(subtotal)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-brand-muted">Descuentos</dt>
            <dd className="font-semibold text-brand-mintInk">{discounts > 0 ? `- ${formatClp(discounts)}` : '$0'}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 border-t-2 border-brand-primaryInk pt-3 text-base font-bold text-brand-primaryInk">
            <dt>Total</dt>
            <dd>{formatClp(total)}</dd>
          </div>
        </dl>
        <footer className="flex justify-end gap-2 px-5 py-4 sm:px-7">
          <button type="button" className="secondary-button" onClick={onClose} disabled={isPending}>
            Volver
          </button>
          <button type="button" className="primary-button" onClick={onConfirm} disabled={isPending}>
            {isPending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {isPending ? 'Creando...' : 'Confirmar y crear'}
          </button>
        </footer>
      </motion.section>
    </div>
  );
};
