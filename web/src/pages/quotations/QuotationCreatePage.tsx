import { createQuotationSchema } from '@unithor/shared';
import { AlertCircle, ArrowLeft, Car, LoaderCircle, Save, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { AnimateIcon } from '../../components/animate-ui';
import QuickVehicleSearch from '../../components/common/QuickVehicleSearch';
import WorkOrderItemsEditor, { createEmptyWorkOrderItem } from '../../components/work-orders/WorkOrderItemsEditor';
import { useCreateQuotationMutation } from '../../hooks/useQuotations';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';

import type { EditableWorkOrderItem } from '../../components/work-orders/WorkOrderItemsEditor';
import type { QuickSearchClient, QuickSearchVehicle } from '../../types/entities';

export const QuotationCreatePage = () => {
  const navigate = useNavigate();
  const createMutation = useCreateQuotationMutation();
  const [includeVehicle, setIncludeVehicle] = useState(false);
  const [vehicle, setVehicle] = useState<QuickSearchVehicle | null>(null);
  const [client, setClient] = useState<Pick<QuickSearchClient, 'id' | 'nombre' | 'rut'> | null>(null);
  const [notas, setNotas] = useState('');
  const [items, setItems] = useState<EditableWorkOrderItem[]>([createEmptyWorkOrderItem()]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectVehicle = (selectedVehicle: QuickSearchVehicle): void => {
    setVehicle(selectedVehicle);
    setClient((current) => current ?? selectedVehicle.client);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    createMutation.reset();
    if (!client && !vehicle) {
      setErrors({ _form: 'Seleccione un cliente para emitir la cotización.' });
      return;
    }
    const result = createQuotationSchema.safeParse({
      clientId: client?.id ?? null,
      vehicleId: includeVehicle ? vehicle?.id ?? null : null,
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
      })),
    });

    if (!result.success) {
      setErrors(getFieldErrors(result.error.issues));
      return;
    }

    setErrors({});
    createMutation.mutate(result.data, { onSuccess: (quotation) => navigate(`/quotations/${quotation.id}`) });
  };

  return (
    <div className="min-w-0 space-y-5">
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
          <div className="mt-3 max-w-2xl">
            <QuickVehicleSearch
              mode="clients"
              placeholder="Buscar cliente por nombre, RUT o teléfono"
              onSelectVehicle={selectVehicle}
              onSelectClient={(selectedClient) => {
                setClient(selectedClient);
                setVehicle(null);
                setErrors({});
              }}
            />
          </div>
          {client && (
            <div className="mt-3 flex items-center gap-3 text-sm text-brand-ink">
              <UserRound className="h-4 w-4 shrink-0 text-brand-muted" aria-hidden="true" />
              <div className="min-w-0">
                <p className="break-words font-semibold">{client.nombre}</p>
                {client.rut && <p className="text-xs text-brand-muted">{client.rut}</p>}
              </div>
            </div>
          )}
          <label className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-brand-ink">
            <input
              type="checkbox"
              checked={includeVehicle}
              onChange={(event) => {
                setIncludeVehicle(event.target.checked);
                setVehicle(null);
              }}
              className="h-4 w-4 rounded border-brand-line accent-brand-primaryInk"
            />
            Asociar vehículo (opcional)
          </label>
          {includeVehicle && (
            <div className="mt-3 max-w-2xl">
              <QuickVehicleSearch
                key={client?.id ?? 'no-client'}
                mode="vehicles"
                placeholder="Buscar vehículo por patente"
                suggestedClient={client}
                onSelectVehicle={selectVehicle}
              />
              {vehicle && (
                <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-brand-primaryInk">
                  <Car className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {vehicle.patente} {[vehicle.marca, vehicle.modelo].filter(Boolean).join(' ')}
                </p>
              )}
            </div>
          )}
          {errors._form && <p className="mt-3 text-sm text-brand-coralInk" role="alert">{errors._form}</p>}
        </section>
        <section className="border-t border-brand-line p-5 sm:p-6"><label className="block text-sm font-semibold text-brand-ink">Notas comerciales o garantía<textarea rows={4} value={notas} onChange={(event) => setNotas(event.target.value)} className="mt-2 w-full resize-y rounded-lg border border-brand-line px-3 py-2 font-normal outline-none focus:border-brand-primary" placeholder="Condiciones comerciales del presupuesto" /></label><div className="mt-5"><WorkOrderItemsEditor items={items} onChange={setItems} errors={errors} title="Conceptos cotizados" description="Seleccione catálogo o use una descripción libre." emptyMessage="La cotización se emitirá sin conceptos y con total cero." totalLabel="Total cotización" totalTestId="quotation-total" /></div></section>
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
    </div>
  );
};

export default QuotationCreatePage;
