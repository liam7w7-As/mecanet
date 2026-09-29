import {
  FUEL_LEVELS,
  TIRE_CONDITIONS,
  VEHICLE_INVENTORY_ITEMS,
  updateWorkOrderSchema,
} from '@unithor/shared';
import { AlertCircle, LoaderCircle, Save, Search, X } from 'lucide-react';
import { useState } from 'react';

import { useClients } from '../../hooks/useClients';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import { useUpdateWorkOrderMutation } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import ModalHeader from '../common/ModalHeader';

import type { Client, WorkOrder } from '../../types/entities';
import type { FuelLevel, TireCondition, VehicleInventoryItem } from '@unithor/shared';



interface WorkOrderReceptionInspectionModalProps {
  workOrder: WorkOrder;
  onClose: () => void;
}

interface ClientPickerProps {
  label: string;
  selectedId: string;
  currentName: string;
  onSelect: (id: string, name: string) => void;
}

const inputClassName =
  'mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15';

const textareaClassName =
  'mt-2 w-full resize-y rounded-lg border border-brand-line px-3 py-2 font-normal outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15';

const fuelLabels: Record<FuelLevel, string> = {
  vacio: 'Vacío',
  cuarto: '1/4',
  medio: '1/2',
  tres_cuartos: '3/4',
  lleno: 'Lleno',
};

const tireLabels: Record<TireCondition, string> = {
  no_revisado: 'No revisado',
  bueno: 'Bueno',
  regular: 'Regular',
  desgaste_severo: 'Desgaste severo',
  baja_presion: 'Baja presión',
};

const inventoryLabels: Record<VehicleInventoryItem, string> = {
  botiquin: 'Botiquín',
  chaleco_reflectante: 'Chaleco reflectante',
  extintor: 'Extintor',
  triangulo: 'Triángulo',
  control_remoto: 'Control remoto',
  manual: 'Manual',
  radio: 'Radio',
  usb: 'USB',
  rueda_repuesto: 'Rueda de repuesto',
  llave_ruedas: 'Llave de ruedas',
  gata: 'Gata',
  herramientas: 'Herramientas',
  perno_seguridad: 'Perno de seguridad',
  enganche: 'Enganche',
  antena: 'Antena',
  tapa_combustible: 'Tapa combustible',
  tapas_ruedas: 'Tapas de ruedas',
  limpiaparabrisas: 'Limpiaparabrisas',
};

const toDateTimeLocal = (value: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const toIsoDateTime = (value: string): string | null => (value ? new Date(value).toISOString() : null);

const ClientPicker = ({ label, selectedId, currentName, onSelect }: ClientPickerProps) => {
  const [search, setSearch] = useState('');
  const clientsQuery = useClients({ page: 1, pageSize: 6, search: search || undefined });

  return (
    <div className="rounded-lg border border-brand-line p-4">
      <p className="text-sm font-bold text-brand-primaryInk">{label}</p>
      <p className="mt-1 text-xs text-brand-muted">Seleccionado: {currentName}</p>
      <label className="mt-3 block text-sm font-semibold text-brand-ink">
        Buscar cliente
        <span className="relative mt-2 block">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-brand-muted" aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-10 w-full rounded-lg border border-brand-line pl-9 pr-3 font-normal outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15"
            placeholder="Nombre, RUT o email"
          />
        </span>
      </label>
      <div className="mt-3 grid gap-2">
        {clientsQuery.data?.items.map((client: Client) => (
          <button
            key={client.id}
            type="button"
            className={`rounded-lg border px-3 py-2 text-left text-sm ${selectedId === String(client.id) ? 'border-brand-primaryInk bg-brand-line/40 text-brand-primaryInk' : 'border-brand-line text-brand-ink hover:bg-brand-pale'}`}
            onClick={() => onSelect(String(client.id), client.nombre)}
          >
            <span className="block font-semibold">{client.nombre}</span>
            <span className="block text-xs text-brand-muted">{client.rut ?? 'Sin RUT'} · {client.tipo === 'empresa' ? 'Empresa' : 'Persona'}</span>
          </button>
        ))}
        {clientsQuery.isFetching && <p className="flex items-center gap-2 text-sm text-brand-muted"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Buscando...</p>}
      </div>
    </div>
  );
};

export const WorkOrderReceptionInspectionModal = ({
  workOrder,
  onClose,
}: WorkOrderReceptionInspectionModalProps) => {
  const updateMutation = useUpdateWorkOrderMutation();
  const [contactClientId, setContactClientId] = useState(
    workOrder.contactClientId ? String(workOrder.contactClientId) : '',
  );
  const [contactName, setContactName] = useState(
    workOrder.contact?.nombre ?? workOrder.client?.nombre ?? 'Sin contacto',
  );
  const [billingClientId, setBillingClientId] = useState(
    workOrder.billingClientId ? String(workOrder.billingClientId) : '',
  );
  const [billingName, setBillingName] = useState(
    workOrder.billing?.nombre ?? workOrder.client?.nombre ?? 'Sin facturación',
  );
  const [kilometrajeIngreso, setKilometrajeIngreso] = useState(
    workOrder.kilometrajeIngreso === null ? '' : String(workOrder.kilometrajeIngreso),
  );
  const [fechaIngreso, setFechaIngreso] = useState(toDateTimeLocal(workOrder.fechaIngreso));
  const [fechaEntrega, setFechaEntrega] = useState(toDateTimeLocal(workOrder.fechaEntrega));
  const [descripcion, setDescripcion] = useState(workOrder.descripcion ?? '');
  const [nivelCombustible, setNivelCombustible] = useState<FuelLevel | ''>(
    workOrder.inspection?.nivelCombustible ?? '',
  );
  const [llantaDelanteraIzquierda, setLlantaDelanteraIzquierda] = useState<TireCondition | ''>(
    workOrder.inspection?.llantaDelanteraIzquierda ?? '',
  );
  const [llantaDelanteraDerecha, setLlantaDelanteraDerecha] = useState<TireCondition | ''>(
    workOrder.inspection?.llantaDelanteraDerecha ?? '',
  );
  const [llantaTraseraIzquierda, setLlantaTraseraIzquierda] = useState<TireCondition | ''>(
    workOrder.inspection?.llantaTraseraIzquierda ?? '',
  );
  const [llantaTraseraDerecha, setLlantaTraseraDerecha] = useState<TireCondition | ''>(
    workOrder.inspection?.llantaTraseraDerecha ?? '',
  );
  const [inventario, setInventario] = useState<VehicleInventoryItem[]>(
    workOrder.inspection?.inventario ?? [],
  );
  const [objetosValor, setObjetosValor] = useState(workOrder.inspection?.objetosValor ?? '');
  const [observaciones, setObservaciones] = useState(workOrder.inspection?.observaciones ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const toggleInventory = (item: VehicleInventoryItem): void => {
    setInventario((current) =>
      current.includes(item)
        ? current.filter((inventoryItem) => inventoryItem !== item)
        : [...current, item],
    );
  };

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    updateMutation.reset();

    const result = updateWorkOrderSchema.safeParse({
      contactClientId: contactClientId ? Number(contactClientId) : null,
      billingClientId: billingClientId ? Number(billingClientId) : null,
      kilometrajeIngreso: kilometrajeIngreso === '' ? null : kilometrajeIngreso,
      descripcion,
      fechaIngreso: toIsoDateTime(fechaIngreso),
      fechaEntrega: toIsoDateTime(fechaEntrega),
      inspection: {
        nivelCombustible: nivelCombustible || null,
        llantaDelanteraIzquierda: llantaDelanteraIzquierda || null,
        llantaDelanteraDerecha: llantaDelanteraDerecha || null,
        llantaTraseraIzquierda: llantaTraseraIzquierda || null,
        llantaTraseraDerecha: llantaTraseraDerecha || null,
        inventario,
        objetosValor,
        observaciones,
      },
    });

    if (!result.success) {
      setErrors(getFieldErrors(result.error.issues));
      return;
    }

    setErrors({});
    updateMutation.mutate({ id: workOrder.id, data: result.data }, { onSuccess: onClose });
  };

  const setPanelNode = useModalOverlay({ isOpen: true, onClose });
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-brand-scrim/55 px-4 py-8">
      <section className="relative mx-auto w-full max-w-[720px] rounded-lg bg-white shadow-2xl" role="dialog" ref={setPanelNode} aria-modal="true" aria-labelledby="edit-reception-title">
        <ModalHeader
  id="edit-reception-title"
  title={"Editar recepción e inspección"}
  description={workOrder.codigo}
  onClose={onClose}
/>
        <form onSubmit={submit}>
          <div className="space-y-6 p-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <ClientPicker
                label="Contacto de recepción"
                selectedId={contactClientId}
                currentName={contactName}
                onSelect={(id, name) => {
                  setContactClientId(id);
                  setContactName(name);
                }}
              />
              <ClientPicker
                label="Datos de facturación"
                selectedId={billingClientId}
                currentName={billingName}
                onSelect={(id, name) => {
                  setBillingClientId(id);
                  setBillingName(name);
                }}
              />
            </div>

            <section className="grid gap-4 md:grid-cols-3" aria-label="Datos de ingreso">
              <label className="text-sm font-semibold text-brand-ink">
                Kilometraje ingreso
                <input type="number" min="0" step="1" value={kilometrajeIngreso} onChange={(event) => setKilometrajeIngreso(event.target.value)} className={inputClassName} />
              </label>
              <label className="text-sm font-semibold text-brand-ink">
                Fecha de ingreso
                <input type="datetime-local" value={fechaIngreso} onChange={(event) => setFechaIngreso(event.target.value)} className={inputClassName} />
              </label>
              <label className="text-sm font-semibold text-brand-ink">
                Entrega prometida
                <input type="datetime-local" value={fechaEntrega} onChange={(event) => setFechaEntrega(event.target.value)} className={inputClassName} />
              </label>
            </section>

            <label className="block text-sm font-semibold text-brand-ink">
              Motivo de ingreso / diagnóstico preliminar
              <textarea rows={4} value={descripcion} onChange={(event) => setDescripcion(event.target.value)} className={textareaClassName} />
            </label>

            <section className="grid gap-4 md:grid-cols-2" aria-label="Inspección de llantas y combustible">
              <label className="text-sm font-semibold text-brand-ink">
                Nivel de combustible
                <select value={nivelCombustible} onChange={(event) => setNivelCombustible(event.target.value as FuelLevel | '')} className={inputClassName}>
                  <option value="">Sin registrar</option>
                  {FUEL_LEVELS.map((fuelLevel) => <option key={fuelLevel} value={fuelLevel}>{fuelLabels[fuelLevel]}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  ['Delantera izquierda', llantaDelanteraIzquierda, setLlantaDelanteraIzquierda],
                  ['Delantera derecha', llantaDelanteraDerecha, setLlantaDelanteraDerecha],
                  ['Trasera izquierda', llantaTraseraIzquierda, setLlantaTraseraIzquierda],
                  ['Trasera derecha', llantaTraseraDerecha, setLlantaTraseraDerecha],
                ] as const).map(([label, value, setter]) => (
                  <label key={label} className="text-sm font-semibold text-brand-ink">
                    {label}
                    <select value={value} onChange={(event) => setter(event.target.value as TireCondition | '')} className={inputClassName}>
                      <option value="">Sin revisar</option>
                      {TIRE_CONDITIONS.map((condition) => <option key={condition} value={condition}>{tireLabels[condition]}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </section>

            <section aria-label="Inventario interno">
              <h3 className="font-bold text-brand-primaryInk">Inventario interno</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {VEHICLE_INVENTORY_ITEMS.map((item) => (
                  <label key={item} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-brand-line px-3 py-2 text-sm text-brand-ink hover:bg-brand-pale">
                    <input type="checkbox" checked={inventario.includes(item)} onChange={() => toggleInventory(item)} className="h-4 w-4 rounded border-brand-line text-brand-primaryInk focus:ring-brand-primary" />
                    {inventoryLabels[item]}
                  </label>
                ))}
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2" aria-label="Notas de inspección">
              <label className="text-sm font-semibold text-brand-ink">
                Objetos de valor
                <textarea rows={4} value={objetosValor} onChange={(event) => setObjetosValor(event.target.value)} className={textareaClassName} />
              </label>
              <label className="text-sm font-semibold text-brand-ink">
                Observaciones de inspección
                <textarea rows={4} value={observaciones} onChange={(event) => setObservaciones(event.target.value)} className={textareaClassName} />
              </label>
            </section>

            {(errors._form || updateMutation.isError) && (
              <div className="flex items-center gap-2 rounded-lg border border-brand-coral/30 bg-brand-coralPale px-3 py-2 text-sm text-brand-coralInk" role="alert">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {errors._form ?? getApiErrorMessage(updateMutation.error)}
              </div>
            )}
          </div>
          <footer className="flex justify-end gap-2 border-t border-brand-line bg-brand-line/40 p-4">
            <button type="button" className="h-10 rounded-lg border border-brand-line bg-white px-4 text-sm font-semibold text-brand-ink" onClick={onClose}>Cancelar</button>
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              Guardar cambios
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
};

export default WorkOrderReceptionInspectionModal;
