import { createWorkOrderSchema } from '@unithor/shared';
import { AlertCircle, ArrowLeft, Car, LoaderCircle, Save, UserRound, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import QuickVehicleSearch from '../../components/common/QuickVehicleSearch';
import WorkOrderItemsEditor, { createEmptyWorkOrderItem } from '../../components/work-orders/WorkOrderItemsEditor';
import { useCreateWorkOrderMutation } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';

import type { EditableWorkOrderItem } from '../../components/work-orders/WorkOrderItemsEditor';
import type { QuickSearchClient, QuickSearchVehicle } from '../../types/entities';

const toLocalDateTime = (date: Date): string => {
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 16);
};

const toIsoDateTime = (value: string): string | null => value ? new Date(value).toISOString() : null;

export const WorkOrderCreatePage = () => {
  const navigate = useNavigate();
  const createMutation = useCreateWorkOrderMutation();
  const [vehicle, setVehicle] = useState<QuickSearchVehicle | null>(null);
  const [client, setClient] = useState<Pick<QuickSearchClient, 'id' | 'nombre' | 'rut'> | null>(null);
  const [kilometrajeIngreso, setKilometrajeIngreso] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fechaIngreso, setFechaIngreso] = useState(toLocalDateTime(new Date()));
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [items, setItems] = useState<EditableWorkOrderItem[]>([createEmptyWorkOrderItem()]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectVehicle = (selectedVehicle: QuickSearchVehicle): void => {
    setVehicle(selectedVehicle);
    setClient(selectedVehicle.client ? {
      id: selectedVehicle.client.id,
      nombre: selectedVehicle.client.nombre,
      rut: selectedVehicle.client.rut,
    } : null);
  };

  const selectClient = (selectedClient: QuickSearchClient): void => {
    setClient(selectedClient);
    setVehicle(null);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    createMutation.reset();

    const result = createWorkOrderSchema.safeParse({
      clientId: client?.id ?? null,
      vehicleId: vehicle?.id ?? null,
      kilometrajeIngreso: kilometrajeIngreso === '' ? null : kilometrajeIngreso,
      descripcion,
      fechaIngreso: toIsoDateTime(fechaIngreso),
      fechaEntrega: toIsoDateTime(fechaEntrega),
      items: items.map((item) => ({
        catalogItemId: item.catalogItemId,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
      })),
    });

    if (!result.success) {
      setErrors(getFieldErrors(result.error.issues));
      return;
    }

    setErrors({});
    createMutation.mutate(result.data, {
      onSuccess: (workOrder) => navigate(`/work-orders/${workOrder.id}`),
    });
  };

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <Link to="/work-orders" className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50" aria-label="Volver a órdenes" title="Volver"><ArrowLeft className="h-4 w-4" aria-hidden="true" /></Link>
        <div><p className="text-sm font-medium text-slate-500">Recepción de taller</p><h1 className="mt-1 text-2xl font-bold text-brand-blue sm:text-3xl">Nueva Orden de Trabajo</h1></div>
      </header>

      <form onSubmit={submit} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <section className="p-5 sm:p-6" aria-labelledby="vehicle-selection-title">
          <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-yellow text-sm font-bold text-brand-dark">1</span><div><h2 id="vehicle-selection-title" className="font-bold text-brand-blue">Vehículo y cliente</h2><p className="text-sm text-slate-500">Localice el ingreso por patente, RUT o nombre.</p></div></div>
          <div className="mt-5 max-w-2xl"><QuickVehicleSearch onSelectVehicle={selectVehicle} onSelectClient={selectClient} /></div>
          {(vehicle || client) && (
            <div className="mt-4 flex flex-col gap-3 border-l-4 border-brand-yellow bg-brand-light px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                {vehicle && <div className="flex items-center gap-2"><Car className="h-5 w-5 text-brand-blue" aria-hidden="true" /><div><p className="font-mono font-bold text-brand-blue">{vehicle.patente}</p><p className="text-xs text-slate-500">{[vehicle.marca, vehicle.modelo, vehicle.ano].filter(Boolean).join(' ') || 'Sin datos técnicos'}</p></div></div>}
                {client && <div className="flex items-center gap-2"><UserRound className="h-5 w-5 text-brand-blue" aria-hidden="true" /><div><p className="font-semibold text-slate-800">{client.nombre}</p><p className="text-xs text-slate-500">{client.rut ?? 'Sin identificación'}</p></div></div>}
              </div>
              <button type="button" className="flex h-9 w-9 items-center justify-center self-end rounded-lg text-slate-500 hover:bg-white sm:self-auto" onClick={() => { setVehicle(null); setClient(null); }} aria-label="Quitar selección" title="Quitar selección"><X className="h-4 w-4" aria-hidden="true" /></button>
            </div>
          )}
        </section>

        <section className="border-t border-slate-200 p-5 sm:p-6" aria-labelledby="entry-data-title">
          <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-yellow text-sm font-bold text-brand-dark">2</span><div><h2 id="entry-data-title" className="font-bold text-brand-blue">Datos de ingreso</h2><p className="text-sm text-slate-500">Registre el diagnóstico inicial y fechas comprometidas.</p></div></div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="text-sm font-semibold text-slate-700">Kilometraje de entrada<input type="number" min="0" step="1" value={kilometrajeIngreso} onChange={(event) => setKilometrajeIngreso(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15" placeholder="0" />{errors.kilometrajeIngreso && <span className="mt-1 block text-xs font-normal text-red-700">{errors.kilometrajeIngreso}</span>}</label>
            <label className="text-sm font-semibold text-slate-700">Fecha de ingreso<input type="datetime-local" value={fechaIngreso} onChange={(event) => setFechaIngreso(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15" />{errors.fechaIngreso && <span className="mt-1 block text-xs font-normal text-red-700">{errors.fechaIngreso}</span>}</label>
            <label className="text-sm font-semibold text-slate-700">Entrega prometida<input type="datetime-local" value={fechaEntrega} onChange={(event) => setFechaEntrega(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15" /></label>
          </div>
          <label className="mt-4 block text-sm font-semibold text-slate-700">Motivo de ingreso / diagnóstico preliminar<textarea value={descripcion} onChange={(event) => setDescripcion(event.target.value)} rows={4} className="mt-2 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15" placeholder="Describa la falla reportada por el cliente" /></label>
        </section>

        <div className="px-5 pb-6 sm:px-6"><WorkOrderItemsEditor items={items} onChange={setItems} errors={errors} /></div>

        {createMutation.isError && <div className="mx-5 mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{getApiErrorMessage(createMutation.error, 'No fue posible crear la orden.')}</div>}

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <Link to="/work-orders" className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</Link>
          <button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-blue px-5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60" disabled={createMutation.isPending}>{createMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}Crear orden</button>
        </footer>
      </form>
    </div>
  );
};

export default WorkOrderCreatePage;
