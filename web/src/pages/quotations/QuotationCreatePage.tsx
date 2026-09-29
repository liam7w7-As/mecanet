import { createQuotationSchema } from '@unithor/shared';
import { AlertCircle, ArrowLeft, Car, ClipboardList, LoaderCircle, Save, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';

import { AnimateIcon } from '../../components/animate-ui';

import QuickVehicleSearch from '../../components/common/QuickVehicleSearch';
import WorkOrderItemsEditor, { createEmptyWorkOrderItem } from '../../components/work-orders/WorkOrderItemsEditor';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useCreateQuotationMutation } from '../../hooks/useQuotations';
import { useWorkOrder, useWorkOrders } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';

import type { EditableWorkOrderItem } from '../../components/work-orders/WorkOrderItemsEditor';
import type { QuickSearchClient, QuickSearchVehicle } from '../../types/entities';

type QuotationMode = 'independent' | 'work-order';

export const QuotationCreatePage = () => {
  const navigate = useNavigate();
  const createMutation = useCreateQuotationMutation();
  const [mode, setMode] = useState<QuotationMode>('independent');
  const [workOrderSearch, setWorkOrderSearch] = useState('');
  const [workOrderId, setWorkOrderId] = useState<number | null>(null);
  const [vehicle, setVehicle] = useState<QuickSearchVehicle | null>(null);
  const [client, setClient] = useState<Pick<QuickSearchClient, 'id' | 'nombre' | 'rut'> | null>(null);
  const [notas, setNotas] = useState('');
  const [items, setItems] = useState<EditableWorkOrderItem[]>([createEmptyWorkOrderItem()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const importedWorkOrder = useRef<number | null>(null);
  const debouncedWorkOrderSearch = useDebouncedValue(workOrderSearch, 300);
  const workOrdersQuery = useWorkOrders({ page: 1, pageSize: 10, search: debouncedWorkOrderSearch || undefined });
  const workOrderQuery = useWorkOrder(workOrderId ?? 0);

  useEffect(() => {
    const selected = workOrderQuery.data;
    if (!selected || importedWorkOrder.current === selected.id) return;

    importedWorkOrder.current = selected.id;
    setItems(selected.items?.map((item) => ({
      ...createEmptyWorkOrderItem(),
      catalogItemId: item.catalogItemId,
      descripcion: item.descripcion,
      tipoLinea: item.tipoLinea,
      unidadMedida: item.unidadMedida,
      cantidad: String(item.cantidad),
      precioUnitario: String(item.precioUnitario),
      estadoOperativo: item.estadoOperativo,
      notasOperativas: item.notasOperativas ?? '',
    })) ?? []);
  }, [workOrderQuery.data]);

  const changeMode = (nextMode: QuotationMode): void => {
    setMode(nextMode);
    setWorkOrderId(null);
    setVehicle(null);
    setClient(null);
    importedWorkOrder.current = null;
    setItems([createEmptyWorkOrderItem()]);
  };

  const selectVehicle = (selectedVehicle: QuickSearchVehicle): void => {
    setVehicle(selectedVehicle);
    setClient(selectedVehicle.client ? { id: selectedVehicle.client.id, nombre: selectedVehicle.client.nombre, rut: selectedVehicle.client.rut } : null);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    createMutation.reset();
    const selectedWorkOrder = workOrderQuery.data;
    const result = createQuotationSchema.safeParse({
      workOrderId: mode === 'work-order' ? workOrderId : null,
      clientId: mode === 'work-order' ? selectedWorkOrder?.clientId ?? null : client?.id ?? null,
      vehicleId: mode === 'work-order' ? selectedWorkOrder?.vehicleId ?? null : vehicle?.id ?? null,
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
          <h2 className="font-bold text-brand-primaryInk">Origen de la cotización</h2>
          <div className="mt-4 inline-flex rounded-lg bg-brand-pale p-1" role="tablist" aria-label="Tipo de cotización">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'independent'}
              className={`relative min-h-9 rounded-md px-4 text-sm font-semibold transition-colors ${
                mode === 'independent' ? 'text-brand-primaryInk font-bold' : 'text-brand-muted hover:text-brand-ink'
              }`}
              onClick={() => changeMode('independent')}
            >
              {mode === 'independent' && (
                <motion.span
                  layoutId="quotationModePill"
                  className="absolute inset-0 rounded-md bg-white shadow-sm"
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                />
              )}
              <span className="relative z-10">COT independiente</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'work-order'}
              className={`relative min-h-9 rounded-md px-4 text-sm font-semibold transition-colors ${
                mode === 'work-order' ? 'text-brand-primaryInk font-bold' : 'text-brand-muted hover:text-brand-ink'
              }`}
              onClick={() => changeMode('work-order')}
            >
              {mode === 'work-order' && (
                <motion.span
                  layoutId="quotationModePill"
                  className="absolute inset-0 rounded-md bg-white shadow-sm"
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                />
              )}
              <span className="relative z-10">Vincular a OT</span>
            </button>
          </div>
          {mode === 'independent' ? <div className="mt-5"><p className="mb-2 text-sm font-semibold text-brand-ink">Cliente o vehículo</p><div className="max-w-2xl"><QuickVehicleSearch onSelectVehicle={selectVehicle} onSelectClient={(selectedClient) => { setClient(selectedClient); setVehicle(null); }} /></div>{(vehicle || client) && <div className="mt-3 flex flex-wrap gap-5 border-l-4 border-brand-gold bg-brand-line/40 px-4 py-3">{vehicle && <span className="flex items-center gap-2 text-sm font-semibold text-brand-primaryInk"><Car className="h-4 w-4" aria-hidden="true" />{vehicle.patente} {[vehicle.marca, vehicle.modelo].filter(Boolean).join(' ') || ''}</span>}{client && <span className="flex items-center gap-2 text-sm font-semibold text-brand-ink"><UserRound className="h-4 w-4" aria-hidden="true" />{client.nombre}</span>}</div>}</div> : <div className="mt-5"><label className="block max-w-2xl text-sm font-semibold text-brand-ink">Buscar Orden de Trabajo<input value={workOrderSearch} onChange={(event) => setWorkOrderSearch(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary" placeholder="Código OT o diagnóstico" /></label><div className="mt-3 grid gap-2 md:grid-cols-2">{workOrdersQuery.data?.items.map((order) => <button key={order.id} type="button" className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${workOrderId === order.id ? 'border-brand-primaryInk bg-brand-line/40' : 'border-brand-line hover:bg-brand-pale'}`} onClick={() => { setWorkOrderId(order.id); importedWorkOrder.current = null; }}><ClipboardList className="h-5 w-5 shrink-0 text-brand-primaryInk" aria-hidden="true" /><span><span className="block font-mono text-sm font-bold text-brand-primaryInk">{order.codigo}</span><span className="block text-xs text-brand-muted">{order.vehicle?.patente ?? 'Sin vehículo'} · {order.client?.nombre ?? 'Sin cliente'}</span></span></button>)}</div>{workOrderQuery.isFetching && <p className="mt-3 flex items-center gap-2 text-sm text-brand-muted"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Importando datos de la OT...</p>}</div>}
          {errors._form && <p className="mt-3 text-sm text-brand-coralInk" role="alert">{errors._form}</p>}
        </section>
        <section className="border-t border-brand-line p-5 sm:p-6"><label className="block text-sm font-semibold text-brand-ink">Notas comerciales, garantía o validez<textarea rows={4} value={notas} onChange={(event) => setNotas(event.target.value)} className="mt-2 w-full resize-y rounded-lg border border-brand-line px-3 py-2 font-normal outline-none focus:border-brand-primary" placeholder="Ej. Presupuesto válido por 15 días" /></label><div className="mt-5"><WorkOrderItemsEditor items={items} onChange={setItems} errors={errors} title="Conceptos cotizados" description="Seleccione catálogo o use una descripción libre." emptyMessage="La cotización se emitirá sin conceptos y con total cero." totalLabel="Total cotización" totalTestId="quotation-total" /></div></section>
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
