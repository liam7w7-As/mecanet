import {
  createWorkOrderSchema,
  FUEL_LEVELS,
  TIRE_CONDITIONS,
  VEHICLE_INVENTORY_ITEMS,
  WORK_ORDER_INSPECTION_PHOTO_SLOTS,
} from '@unithor/shared';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  LoaderCircle,
  Plus,
  Save,
  Search,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import ClientFormModal from '../../components/clients/ClientFormModal';
import QuickVehicleSearch from '../../components/common/QuickVehicleSearch';
import VehicleFormModal from '../../components/vehicles/VehicleFormModal';
import WorkOrderItemsEditor, { createEmptyWorkOrderItem } from '../../components/work-orders/WorkOrderItemsEditor';
import { useClients } from '../../hooks/useClients';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import {
  useCreateWorkOrderMutation,
  useUploadWorkOrderInspectionPhotosMutation,
} from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';

import type { EditableWorkOrderItem } from '../../components/work-orders/WorkOrderItemsEditor';
import type {
  Client,
  QuickSearchClient,
  QuickSearchVehicle,
  Vehicle,
} from '../../types/entities';
import type {
  FuelLevel,
  TireCondition,
  VehicleInventoryItem,
  WorkOrderInspectionPhotoSlot,
} from '@unithor/shared';

type StepIndex = 0 | 1 | 2 | 3 | 4;
type ClientOption = Pick<Client, 'id' | 'rut' | 'nombre' | 'tipo' | 'telefono' | 'email' | 'direccion'>;
type ClientModalTarget = 'primary' | 'contact' | 'billing';

interface InspectionDraft {
  nivelCombustible: FuelLevel | '';
  llantaDelanteraIzquierda: TireCondition | '';
  llantaDelanteraDerecha: TireCondition | '';
  llantaTraseraIzquierda: TireCondition | '';
  llantaTraseraDerecha: TireCondition | '';
  inventario: VehicleInventoryItem[];
  objetosValor: string;
  observaciones: string;
}

interface InspectionPhotoDraft {
  slot: WorkOrderInspectionPhotoSlot;
  file: File;
  previewUrl: string;
}

const steps: Array<{ id: StepIndex; title: string; shortTitle: string; description: string }> = [
  { id: 0, title: 'Cliente', shortTitle: 'Cliente', description: 'Quién deja el vehículo' },
  { id: 1, title: 'Facturación', shortTitle: 'Facturación', description: 'Contacto y factura' },
  { id: 2, title: 'Vehículo', shortTitle: 'Vehículo', description: 'Auto que ingresa' },
  { id: 3, title: 'Inspección', shortTitle: 'Inspección', description: 'Estado de recepción' },
  { id: 4, title: 'Servicios', shortTitle: 'Servicios', description: 'Trabajos y repuestos' },
];

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

const photoSlotLabels: Record<WorkOrderInspectionPhotoSlot, string> = {
  frontal: 'Frontal',
  trasera: 'Trasera',
  lateral_izquierdo: 'Lateral izquierdo',
  lateral_derecho: 'Lateral derecho',
  frontal_izquierdo: 'Frontal izq.',
  frontal_derecho: 'Frontal der.',
  trasero_izquierdo: 'Trasero izq.',
  trasero_derecho: 'Trasero der.',
  interior: 'Interior',
};

const inputClassName =
  'mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15 aria-[invalid=true]:border-red-500';

const toLocalDateTime = (date: Date): string => {
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 16);
};

const toIsoDateTime = (value: string): string | null => value ? new Date(value).toISOString() : null;

const toClientOption = (client: Client | QuickSearchClient): ClientOption => ({
  id: client.id,
  rut: client.rut,
  nombre: client.nombre,
  tipo: client.tipo,
  telefono: client.telefono,
  email: client.email,
  direccion: 'direccion' in client ? client.direccion : null,
});

const toQuickVehicle = (
  vehicle: Vehicle,
  fallbackClient: ClientOption | null,
): QuickSearchVehicle => ({
  id: vehicle.id,
  patente: vehicle.patente,
  marca: vehicle.marca,
  modelo: vehicle.modelo,
  ano: vehicle.ano,
  client: vehicle.client
    ? { id: vehicle.client.id, nombre: vehicle.client.nombre, rut: vehicle.client.rut }
    : fallbackClient
      ? { id: fallbackClient.id, nombre: fallbackClient.nombre, rut: fallbackClient.rut }
      : null,
});

const clientSubtitle = (client: ClientOption): string =>
  [client.rut ?? 'Sin RUT', client.telefono ?? 'Sin teléfono'].join(' · ');

interface SelectedClientCardProps {
  title: string;
  client: ClientOption | null;
  onClear?: () => void;
}

const SelectedClientCard = ({ title, client, onClear }: SelectedClientCardProps) => (
  <div className="min-h-28 rounded-lg border border-slate-200 bg-white p-4">
    <div className="flex items-start justify-between gap-3">
      <p className="text-xs font-bold uppercase text-slate-500">{title}</p>
      {client && onClear && (
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand-blue"
          onClick={onClear}
          aria-label={`Quitar ${title.toLowerCase()}`}
          title="Quitar"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
    {client ? (
      <div className="mt-3 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand-blue">
          <UserRound className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-bold text-brand-blue">{client.nombre}</p>
          <p className="mt-1 text-sm text-slate-500">{clientSubtitle(client)}</p>
          {client.email && <p className="mt-1 truncate text-xs text-slate-500">{client.email}</p>}
        </div>
      </div>
    ) : (
      <div className="mt-4 flex items-center gap-3 text-sm text-slate-500">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
          <UserRound className="h-5 w-5" aria-hidden="true" />
        </span>
        Sin selección
      </div>
    )}
  </div>
);

interface ClientSearchPickerProps {
  label: string;
  selectedClient: ClientOption | null;
  onSelect: (client: ClientOption) => void;
  onCreate: () => void;
  placeholder?: string;
}

const ClientSearchPicker = ({
  label,
  selectedClient,
  onSelect,
  onCreate,
  placeholder = 'Buscar por nombre, RUT o teléfono',
}: ClientSearchPickerProps) => {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), 250);
  const clientsQuery = useClients({ page: 1, pageSize: 8, search: debouncedSearch || undefined });

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4" aria-label={label}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-bold text-brand-blue">{label}</h3>
          {selectedClient && <p className="mt-1 text-sm text-slate-500">{selectedClient.nombre}</p>}
        </div>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-brand-blue px-3 text-sm font-semibold text-brand-blue hover:bg-brand-blue hover:text-white"
          onClick={onCreate}
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Crear cliente
        </button>
      </div>

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-5 h-4 w-4 text-slate-400" aria-hidden="true" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className={`${inputClassName} pl-9`}
          placeholder={placeholder}
          aria-label={label}
        />
      </div>

      <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-slate-100">
        {clientsQuery.isFetching && <p className="px-3 py-3 text-sm text-slate-500">Buscando clientes...</p>}
        {!clientsQuery.isFetching && clientsQuery.data?.items.length === 0 && (
          <p className="px-3 py-5 text-center text-sm text-slate-500">No se encontraron clientes</p>
        )}
        {clientsQuery.data?.items.map((client) => {
          const selected = selectedClient?.id === client.id;
          return (
            <button
              key={client.id}
              type="button"
              className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-0 hover:bg-slate-50 ${
                selected ? 'bg-brand-light' : ''
              }`}
              onClick={() => onSelect(toClientOption(client))}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-800">{client.nombre}</span>
                <span className="block text-xs text-slate-500">{clientSubtitle(client)}</span>
              </span>
              {selected && <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </section>
  );
};

export const WorkOrderCreatePage = () => {
  const navigate = useNavigate();
  const createMutation = useCreateWorkOrderMutation();
  const uploadPhotosMutation = useUploadWorkOrderInspectionPhotosMutation();
  const [activeStep, setActiveStep] = useState<StepIndex>(0);
  const [client, setClient] = useState<ClientOption | null>(null);
  const [contactClient, setContactClient] = useState<ClientOption | null>(null);
  const [billingClient, setBillingClient] = useState<ClientOption | null>(null);
  const [vehicle, setVehicle] = useState<QuickSearchVehicle | null>(null);
  const [clientModalTarget, setClientModalTarget] = useState<ClientModalTarget | null>(null);
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [kilometrajeIngreso, setKilometrajeIngreso] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fechaIngreso, setFechaIngreso] = useState(toLocalDateTime(new Date()));
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [items, setItems] = useState<EditableWorkOrderItem[]>([createEmptyWorkOrderItem()]);
  const [inspection, setInspection] = useState<InspectionDraft>({
    nivelCombustible: '',
    llantaDelanteraIzquierda: 'no_revisado',
    llantaDelanteraDerecha: 'no_revisado',
    llantaTraseraIzquierda: 'no_revisado',
    llantaTraseraDerecha: 'no_revisado',
    inventario: [],
    objetosValor: '',
    observaciones: '',
  });
  const [photos, setPhotos] = useState<InspectionPhotoDraft[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createdOrderId, setCreatedOrderId] = useState<number | null>(null);

  const isSubmitting = createMutation.isPending || uploadPhotosMutation.isPending;
  const vehicleOwnerMismatch = Boolean(
    client && vehicle?.client && vehicle.client.id !== client.id,
  );

  const setPrimaryClient = (selectedClient: ClientOption): void => {
    setClient((previousClient) => {
      setContactClient((current) => (
        current === null || current.id === previousClient?.id ? selectedClient : current
      ));
      setBillingClient((current) => (
        current === null || current.id === previousClient?.id ? selectedClient : current
      ));
      return selectedClient;
    });
    setErrors((current) => {
      const next = { ...current };
      delete next.clientId;
      return next;
    });
  };

  const handleClientSaved = (savedClient: Client): void => {
    const selectedClient = toClientOption(savedClient);
    if (clientModalTarget === 'primary') {
      setPrimaryClient(selectedClient);
    }
    if (clientModalTarget === 'contact') {
      setContactClient(selectedClient);
    }
    if (clientModalTarget === 'billing') {
      setBillingClient(selectedClient);
    }
  };

  const selectVehicle = (selectedVehicle: QuickSearchVehicle): void => {
    setVehicle(selectedVehicle);
    setErrors((current) => {
      const next = { ...current };
      delete next.vehicleId;
      return next;
    });
  };

  const updateInspection = <K extends keyof InspectionDraft>(key: K, value: InspectionDraft[K]): void => {
    setInspection((current) => ({ ...current, [key]: value }));
  };

  const toggleInventory = (item: VehicleInventoryItem): void => {
    setInspection((current) => ({
      ...current,
      inventario: current.inventario.includes(item)
        ? current.inventario.filter((selected) => selected !== item)
        : [...current.inventario, item],
    }));
  };

  const setInspectionPhoto = (slot: WorkOrderInspectionPhotoSlot, file: File | null): void => {
    setPhotos((current) => {
      const previous = current.find((photo) => photo.slot === slot);
      if (previous) {
        URL.revokeObjectURL(previous.previewUrl);
      }
      const withoutSlot = current.filter((photo) => photo.slot !== slot);
      if (!file) {
        return withoutSlot;
      }
      return [...withoutSlot, { slot, file, previewUrl: URL.createObjectURL(file) }];
    });
  };

  const photoMap = useMemo(
    () => new Map(photos.map((photo) => [photo.slot, photo])),
    [photos],
  );

  const validateStep = (step: StepIndex): boolean => {
    if (step === 0 && !client) {
      setErrors({ clientId: 'Seleccione o cree el cliente que deja el vehículo.' });
      return false;
    }
    if (step === 1 && (!contactClient || !billingClient)) {
      setErrors({ billing: 'Seleccione datos de contacto y facturación.' });
      return false;
    }
    if (step === 2 && !vehicle) {
      setErrors({ vehicleId: 'Seleccione o cree el vehículo que ingresa al taller.' });
      return false;
    }
    if (step === 2 && vehicleOwnerMismatch) {
      setErrors({ vehicleId: 'El vehículo pertenece a otro cliente. Seleccione el cliente dueño o cree un vehículo para este cliente.' });
      return false;
    }
    setErrors({});
    return true;
  };

  const goToStep = (nextStep: StepIndex): void => {
    if (nextStep <= activeStep || validateStep(activeStep)) {
      setActiveStep(nextStep);
    }
  };

  const goNext = (): void => {
    if (activeStep < 4 && validateStep(activeStep)) {
      setActiveStep((activeStep + 1) as StepIndex);
    }
  };

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (createdOrderId) {
      navigate(`/work-orders/${createdOrderId}`);
      return;
    }
    if (!validateStep(activeStep) || !client || !contactClient || !billingClient || !vehicle) {
      return;
    }

    createMutation.reset();
    uploadPhotosMutation.reset();

    const result = createWorkOrderSchema.safeParse({
      clientId: client.id,
      contactClientId: contactClient.id,
      billingClientId: billingClient.id,
      vehicleId: vehicle.id,
      kilometrajeIngreso: kilometrajeIngreso === '' ? null : kilometrajeIngreso,
      descripcion,
      fechaIngreso: toIsoDateTime(fechaIngreso),
      fechaEntrega: toIsoDateTime(fechaEntrega),
      inspection: {
        nivelCombustible: inspection.nivelCombustible || null,
        llantaDelanteraIzquierda: inspection.llantaDelanteraIzquierda || null,
        llantaDelanteraDerecha: inspection.llantaDelanteraDerecha || null,
        llantaTraseraIzquierda: inspection.llantaTraseraIzquierda || null,
        llantaTraseraDerecha: inspection.llantaTraseraDerecha || null,
        inventario: inspection.inventario,
        objetosValor: inspection.objetosValor,
        observaciones: inspection.observaciones,
      },
      items: items
        .filter((item) => item.descripcion.trim().length > 0)
        .map((item) => ({
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
    void (async () => {
      const workOrder = await createMutation.mutateAsync(result.data);
      setCreatedOrderId(workOrder.id);
      if (photos.length > 0) {
        await uploadPhotosMutation.mutateAsync({
          id: workOrder.id,
          photos: photos.map((photo) => ({ slot: photo.slot, file: photo.file })),
        });
      }
      navigate(`/work-orders/${workOrder.id}`);
    })().catch(() => undefined);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <Link
            to="/work-orders"
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Volver a órdenes"
            title="Volver"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <div>
            <p className="text-sm font-medium text-slate-500">Recepción de taller</p>
            <h1 className="mt-1 text-2xl font-bold text-brand-blue sm:text-3xl">Nueva Orden de Trabajo</h1>
          </div>
        </div>
        <div className="rounded-lg border border-brand-yellow/60 bg-brand-yellow/10 px-4 py-3 text-sm text-brand-blue">
          Flujo operativo: cliente, facturación, vehículo, inspección y servicios.
        </div>
      </header>

      <form onSubmit={submit} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <nav className="border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-6" aria-label="Pasos de orden de trabajo">
          <ol className="grid gap-3 md:grid-cols-5">
            {steps.map((step) => {
              const active = step.id === activeStep;
              const complete = step.id < activeStep;
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition ${
                      active
                        ? 'border-brand-blue bg-white shadow-sm'
                        : complete
                          ? 'border-emerald-200 bg-emerald-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                    onClick={() => goToStep(step.id)}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      active || complete ? 'bg-brand-yellow text-brand-dark' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {complete ? <Check className="h-4 w-4" aria-hidden="true" /> : step.id + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-brand-blue">{step.shortTitle}</span>
                      <span className="block truncate text-xs text-slate-500">{step.description}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-h-[560px] p-5 sm:p-6">
          {activeStep === 0 && (
            <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
              <SelectedClientCard title="Cliente seleccionado" client={client} onClear={() => setClient(null)} />
              <ClientSearchPicker
                label="Buscar cliente"
                selectedClient={client}
                onSelect={setPrimaryClient}
                onCreate={() => setClientModalTarget('primary')}
              />
              {errors.clientId && <p className="text-sm text-red-700 lg:col-span-2">{errors.clientId}</p>}
            </div>
          )}

          {activeStep === 1 && (
            <div className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-3">
                <SelectedClientCard title="Cliente de recepción" client={client} />
                <SelectedClientCard title="Contacto en taller" client={contactClient} onClear={() => setContactClient(null)} />
                <SelectedClientCard title="Facturación" client={billingClient} onClear={() => setBillingClient(null)} />
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-3">
                  <button
                    type="button"
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-blue px-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                    onClick={() => client && setContactClient(client)}
                    disabled={!client}
                  >
                    Usar cliente de recepción
                  </button>
                  <ClientSearchPicker
                    label="Datos de contacto"
                    selectedClient={contactClient}
                    onSelect={setContactClient}
                    onCreate={() => setClientModalTarget('contact')}
                  />
                </div>
                <div className="space-y-3">
                  <button
                    type="button"
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-blue px-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                    onClick={() => client && setBillingClient(client)}
                    disabled={!client}
                  >
                    Facturar al cliente de recepción
                  </button>
                  <ClientSearchPicker
                    label="Datos de facturación"
                    selectedClient={billingClient}
                    onSelect={setBillingClient}
                    onCreate={() => setClientModalTarget('billing')}
                  />
                </div>
              </div>
              {errors.billing && <p className="text-sm text-red-700">{errors.billing}</p>}
            </div>
          )}

          {activeStep === 2 && (
            <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold uppercase text-slate-500">Vehículo seleccionado</p>
                {vehicle ? (
                  <div className="mt-4 space-y-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand-blue">
                        <Car className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-mono text-lg font-bold text-brand-blue">{vehicle.patente}</p>
                        <p className="text-sm text-slate-500">
                          {[vehicle.marca, vehicle.modelo, vehicle.ano].filter(Boolean).join(' ') || 'Sin datos técnicos'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {vehicle.client ? `Dueño: ${vehicle.client.nombre}` : 'Sin dueño asignado'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => setVehicle(null)}
                    >
                      <X className="h-4 w-4" aria-hidden="true" /> Quitar
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                    Seleccione o registre el vehículo que ingresa.
                  </div>
                )}
              </div>
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-bold text-brand-blue">Buscar vehículo</h3>
                    <p className="mt-1 text-sm text-slate-500">La patente se asociará al cliente seleccionado cuando registre un vehículo nuevo.</p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-brand-blue px-3 text-sm font-semibold text-brand-blue hover:bg-brand-blue hover:text-white"
                    onClick={() => setVehicleModalOpen(true)}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" /> Crear vehículo
                  </button>
                </div>
                <div className="mt-4">
                  <QuickVehicleSearch
                    onSelectVehicle={selectVehicle}
                    suggestedClient={client}
                    placeholder="Buscar por patente, marca o dueño"
                  />
                </div>
                {vehicleOwnerMismatch && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    El vehículo seleccionado pertenece a otro cliente. Cambie el cliente principal o registre el auto para este ingreso.
                  </div>
                )}
                {errors.vehicleId && <p className="mt-3 text-sm text-red-700">{errors.vehicleId}</p>}
              </section>
            </div>
          )}

          {activeStep === 3 && (
            <div className="space-y-6">
              <section className="grid gap-4 lg:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">
                  Kilometraje de entrada
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={kilometrajeIngreso}
                    onChange={(event) => setKilometrajeIngreso(event.target.value)}
                    className={inputClassName}
                    placeholder="0"
                    aria-invalid={Boolean(errors.kilometrajeIngreso)}
                  />
                  {errors.kilometrajeIngreso && <span className="mt-1 block text-xs font-normal text-red-700">{errors.kilometrajeIngreso}</span>}
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Nivel de combustible
                  <select
                    value={inspection.nivelCombustible}
                    onChange={(event) => updateInspection('nivelCombustible', event.target.value as FuelLevel | '')}
                    className={inputClassName}
                  >
                    <option value="">Sin registrar</option>
                    {FUEL_LEVELS.map((fuelLevel) => (
                      <option key={fuelLevel} value={fuelLevel}>{fuelLabels[fuelLevel]}</option>
                    ))}
                  </select>
                </label>
              </section>

              <section aria-labelledby="tires-title">
                <h3 id="tires-title" className="font-bold text-brand-blue">Llantas</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {([
                    ['llantaDelanteraIzquierda', 'Delantera izquierda'],
                    ['llantaDelanteraDerecha', 'Delantera derecha'],
                    ['llantaTraseraIzquierda', 'Trasera izquierda'],
                    ['llantaTraseraDerecha', 'Trasera derecha'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="text-sm font-semibold text-slate-700">
                      {label}
                      <select
                        value={inspection[key]}
                        onChange={(event) => updateInspection(key, event.target.value as TireCondition)}
                        className={inputClassName}
                      >
                        {TIRE_CONDITIONS.map((condition) => (
                          <option key={condition} value={condition}>{tireLabels[condition]}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </section>

              <section aria-labelledby="photos-title">
                <div className="flex items-center gap-2">
                  <Camera className="h-5 w-5 text-brand-blue" aria-hidden="true" />
                  <h3 id="photos-title" className="font-bold text-brand-blue">Registro fotográfico</h3>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {WORK_ORDER_INSPECTION_PHOTO_SLOTS.map((slot) => {
                    const photo = photoMap.get(slot);
                    return (
                      <div key={slot} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                          <p className="text-sm font-semibold text-slate-700">{photoSlotLabels[slot]}</p>
                          {photo && (
                            <button
                              type="button"
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700"
                              onClick={() => setInspectionPhoto(slot, null)}
                              aria-label={`Eliminar foto ${photoSlotLabels[slot]}`}
                              title="Eliminar foto"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                        {photo ? (
                          <img src={photo.previewUrl} alt={photoSlotLabels[slot]} className="h-36 w-full object-cover" />
                        ) : (
                          <label className="flex h-36 cursor-pointer flex-col items-center justify-center gap-2 bg-slate-50 text-sm font-semibold text-slate-500 hover:bg-brand-light hover:text-brand-blue">
                            <ImagePlus className="h-7 w-7" aria-hidden="true" />
                            Subir foto
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="sr-only"
                              onChange={(event) => setInspectionPhoto(slot, event.target.files?.[0] ?? null)}
                              aria-label={`Subir foto ${photoSlotLabels[slot]}`}
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section aria-labelledby="inventory-title">
                <h3 id="inventory-title" className="font-bold text-brand-blue">Inventario interno</h3>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {VEHICLE_INVENTORY_ITEMS.map((item) => (
                    <label key={item} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={inspection.inventario.includes(item)}
                        onChange={() => toggleInventory(item)}
                        className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-yellow"
                      />
                      {inventoryLabels[item]}
                    </label>
                  ))}
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">
                  Objetos de valor
                  <textarea
                    value={inspection.objetosValor}
                    onChange={(event) => updateInspection('objetosValor', event.target.value)}
                    rows={4}
                    className="mt-2 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
                    placeholder="Documentos, herramientas, accesorios especiales"
                  />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Observaciones de inspección
                  <textarea
                    value={inspection.observaciones}
                    onChange={(event) => updateInspection('observaciones', event.target.value)}
                    rows={4}
                    className="mt-2 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
                    placeholder="Rayones, golpes, testigos encendidos, notas del asesor"
                  />
                </label>
              </section>
            </div>
          )}

          {activeStep === 4 && (
            <div className="space-y-6">
              <section className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">
                  Fecha de ingreso
                  <input
                    type="datetime-local"
                    value={fechaIngreso}
                    onChange={(event) => setFechaIngreso(event.target.value)}
                    className={inputClassName}
                    aria-invalid={Boolean(errors.fechaIngreso)}
                  />
                  {errors.fechaIngreso && <span className="mt-1 block text-xs font-normal text-red-700">{errors.fechaIngreso}</span>}
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Entrega prometida
                  <input
                    type="datetime-local"
                    value={fechaEntrega}
                    onChange={(event) => setFechaEntrega(event.target.value)}
                    className={inputClassName}
                  />
                </label>
              </section>
              <label className="block text-sm font-semibold text-slate-700">
                Motivo de ingreso / diagnóstico preliminar
                <textarea
                  value={descripcion}
                  onChange={(event) => setDescripcion(event.target.value)}
                  rows={4}
                  className="mt-2 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
                  placeholder="Describa la falla reportada por el cliente"
                />
              </label>
              <WorkOrderItemsEditor items={items} onChange={setItems} errors={errors} />
            </div>
          )}
        </div>

        {createMutation.isError && (
          <div className="mx-5 mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {getApiErrorMessage(createMutation.error, 'No fue posible crear la orden.')}
          </div>
        )}

        {uploadPhotosMutation.isError && createdOrderId && (
          <div className="mx-5 mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
            La OT fue creada, pero una o más fotos no se pudieron subir. Puede abrir el detalle de la orden y continuar el seguimiento.
          </div>
        )}

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Link to="/work-orders" className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Cancelar
          </Link>
          <div className="flex flex-col gap-2 sm:flex-row">
            {activeStep > 0 && (
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setActiveStep((activeStep - 1) as StepIndex)}
                disabled={isSubmitting}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Anterior
              </button>
            )}
            {activeStep < 4 ? (
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-blue px-5 text-sm font-semibold text-white hover:bg-brand-dark"
                onClick={goNext}
              >
                Siguiente <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-blue px-5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                disabled={isSubmitting}
              >
                {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                {createdOrderId ? 'Ir al detalle' : uploadPhotosMutation.isPending ? 'Subiendo fotos...' : 'Crear orden'}
              </button>
            )}
          </div>
        </footer>
      </form>

      {clientModalTarget && (
        <ClientFormModal
          onClose={() => setClientModalTarget(null)}
          onSaved={handleClientSaved}
        />
      )}

      {vehicleModalOpen && (
        <VehicleFormModal
          suggestedClient={client}
          onClose={() => setVehicleModalOpen(false)}
          onSaved={(savedVehicle) => {
            setVehicle(toQuickVehicle(savedVehicle, client));
            setVehicleModalOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default WorkOrderCreatePage;
