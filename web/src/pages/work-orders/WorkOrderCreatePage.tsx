import {
  createWorkOrderSchema,
  FUEL_LEVELS,
  TIRE_CONDITIONS,
  UNIT_MEASURE_LABELS,
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
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { AnimateIcon } from '../../components/animate-ui';
import ClientFormModal from '../../components/clients/ClientFormModal';
import QuickVehicleSearch from '../../components/common/QuickVehicleSearch';
import VehicleFormModal from '../../components/vehicles/VehicleFormModal';
import WorkOrderItemsEditor from '../../components/work-orders/WorkOrderItemsEditor';
import { useClient, useClients } from '../../hooks/useClients';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useVehicle } from '../../hooks/useVehicles';
import {
  useCreateWorkOrderMutation,
  useMechanics,
  useUploadWorkOrderInspectionPhotosMutation,
} from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import {
  INSPECTION_PHOTO_ACCEPT,
  MAX_INSPECTION_PHOTO_MB,
  validateInspectionFile,
} from '../../lib/inspection-photos';
import { useAuthStore } from '../../stores/auth.store';
import { notifyError, notifySuccess } from '../../stores/toast.store';

import type { EditableWorkOrderItem } from '../../components/work-orders/WorkOrderItemsEditor';
import type { Client, QuickSearchClient, QuickSearchVehicle, Vehicle } from '../../types/entities';
import type {
  FuelLevel,
  TireCondition,
  VehicleInventoryItem,
  WorkOrderInspectionPhotoSlot,
} from '@unithor/shared';

type StepIndex = 0 | 1 | 2 | 3 | 4;
type ClientOption = Pick<
  Client,
  'id' | 'rut' | 'nombre' | 'tipo' | 'telefono' | 'email' | 'direccion'
>;
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
  {
    id: 0,
    title: 'Responsable',
    shortTitle: 'Responsable',
    description: 'Quién entrega y asume la OT',
  },
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

const toIsoDateTime = (value: string): string | null =>
  value ? new Date(value).toISOString() : null;

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
        <Search
          className="pointer-events-none absolute left-3 top-5 h-4 w-4 text-slate-400"
          aria-hidden="true"
        />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className={`${inputClassName} pl-9`}
          placeholder={placeholder}
          aria-label={label}
        />
      </div>

      <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-slate-100">
        {clientsQuery.isFetching && (
          <p className="px-3 py-3 text-sm text-slate-500">Buscando clientes...</p>
        )}
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
                <span className="block truncate text-sm font-semibold text-slate-800">
                  {client.nombre}
                </span>
                <span className="block text-xs text-slate-500">{clientSubtitle(client)}</span>
              </span>
              {selected && (
                <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
};

export const WorkOrderCreatePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedVehicleId = Number(searchParams.get('vehicleId'));
  const requestedClientId = Number(searchParams.get('clientId'));
  const preselectedClientId =
    Number.isInteger(requestedClientId) && requestedClientId > 0 ? requestedClientId : null;
  const preselectedVehicleId =
    Number.isInteger(requestedVehicleId) && requestedVehicleId > 0 ? requestedVehicleId : null;
  const createMutation = useCreateWorkOrderMutation();
  const uploadPhotosMutation = useUploadWorkOrderInspectionPhotosMutation();
  const user = useAuthStore((state) => state.user);
  const canAssignMechanic = Boolean(user && ['desarrollador', 'admin', 'jefe'].includes(user.role));
  const mechanicsQuery = useMechanics(canAssignMechanic);
  const [assignedMechanicId, setAssignedMechanicId] = useState<number | null>(null);
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
  const [items, setItems] = useState<EditableWorkOrderItem[]>([]);
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
  const [showConfirm, setShowConfirm] = useState(false);
  const prefillApplied = useRef(false);
  const preselectedVehicleQuery = useVehicle(preselectedVehicleId);
  const initialClientId = preselectedClientId ?? preselectedVehicleQuery.data?.clientId ?? null;
  const preselectedClientQuery = useClient(initialClientId);

  const isSubmitting = createMutation.isPending || uploadPhotosMutation.isPending;
  const vehicleOwnerIsDifferent = Boolean(
    client && vehicle?.client && vehicle.client.id !== client.id,
  );

  const setPrimaryClient = (selectedClient: ClientOption): void => {
    setClient((previousClient) => {
      setContactClient((current) =>
        current === null || current.id === previousClient?.id ? selectedClient : current,
      );
      setBillingClient((current) =>
        current === null || current.id === previousClient?.id ? selectedClient : current,
      );
      return selectedClient;
    });
    setErrors((current) => {
      const next = { ...current };
      delete next.clientId;
      return next;
    });
  };

  useEffect(() => {
    if (prefillApplied.current || (preselectedClientId === null && preselectedVehicleId === null))
      return;
    if (preselectedVehicleId !== null && preselectedVehicleQuery.isPending) return;
    if (initialClientId !== null && preselectedClientQuery.isPending) return;
    const selectedVehicle = preselectedVehicleQuery.data;

    const selectedResponsible = preselectedClientQuery.data
      ? toClientOption(preselectedClientQuery.data)
      : null;
    if (selectedResponsible) {
      setClient(selectedResponsible);
      setContactClient(selectedResponsible);
      setBillingClient(selectedResponsible);
    }
    if (selectedVehicle) {
      setVehicle(toQuickVehicle(selectedVehicle, null));
      if (selectedVehicle.kilometraje !== null) {
        setKilometrajeIngreso(String(selectedVehicle.kilometraje));
      }
    }
    prefillApplied.current = true;
  }, [
    initialClientId,
    preselectedClientId,
    preselectedVehicleId,
    preselectedClientQuery.data,
    preselectedClientQuery.isPending,
    preselectedVehicleQuery.data,
    preselectedVehicleQuery.isPending,
  ]);

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

  const updateInspection = <K extends keyof InspectionDraft>(
    key: K,
    value: InspectionDraft[K],
  ): void => {
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
    if (file) {
      const validationError = validateInspectionFile(file);
      if (validationError) {
        notifyError(`${photoSlotLabels[slot]}: ${validationError}`);
        return;
      }
    }
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

  const photoMap = useMemo(() => new Map(photos.map((photo) => [photo.slot, photo])), [photos]);

  const validateStep = (step: StepIndex): boolean => {
    if (step === 0 && !client) {
      setErrors({ clientId: 'Seleccione o cree el responsable que entrega el vehículo.' });
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
    setErrors({});
    return true;
  };

  const goToStep = (nextStep: StepIndex): void => {
    if (nextStep <= activeStep || validateStep(activeStep)) {
      setActiveStep(nextStep);
    }
  };

  const goNext = (): void => {
    // Avance explícito 3 Inspección -> 4 Servicios. validateStep(3) siempre
    // permite avanzar (la inspección es opcional), se usa update funcional
    // para evitar cierre stale.
    if (activeStep >= 4 || !validateStep(activeStep)) {
      return;
    }
    setActiveStep((previous) => (previous < 4 ? ((previous + 1) as StepIndex) : previous));
  };

  const buildPayload = (): ReturnType<typeof createWorkOrderSchema.safeParse> => {
    if (!client || !contactClient || !billingClient || !vehicle) {
      return createWorkOrderSchema.safeParse({});
    }

    return createWorkOrderSchema.safeParse({
      clientId: client.id,
      contactClientId: contactClient.id,
      billingClientId: billingClient.id,
      vehicleId: vehicle.id,
      assignedMechanicId,

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
          tipoLinea: item.tipoLinea,
          unidadMedida: item.unidadMedida,
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
          estadoOperativo: item.estadoOperativo,
          notasOperativas: item.notasOperativas,
        })),
    });
  };

  const handleOpenConfirm = (): void => {
    if (createdOrderId) {
      navigate(`/work-orders/${createdOrderId}`);
      return;
    }
    // Validar pasos base antes de mostrar el resumen
    if (!validateStep(0) || !validateStep(1) || !validateStep(2)) {
      if (!client) setActiveStep(0);
      else if (!contactClient || !billingClient) setActiveStep(1);
      else if (!vehicle) setActiveStep(2);
      return;
    }
    const result = buildPayload();
    if (!result.success) {
      setErrors(getFieldErrors(result.error.issues));
      return;
    }
    setErrors({});
    setShowConfirm(true);
  };

  const handleConfirmCreate = (): void => {
    const result = buildPayload();
    if (!result.success) {
      setErrors(getFieldErrors(result.error.issues));
      setShowConfirm(false);
      return;
    }

    setErrors({});
    createMutation.reset();
    uploadPhotosMutation.reset();
    void (async () => {
      try {
        const workOrder = await createMutation.mutateAsync(result.data);
        setCreatedOrderId(workOrder.id);
        if (photos.length > 0) {
          await uploadPhotosMutation.mutateAsync({
            id: workOrder.id,
            photos: photos.map((photo) => ({ slot: photo.slot, file: photo.file })),
          });
        }
        notifySuccess(`Orden ${workOrder.codigo} creada.`);
        setShowConfirm(false);
        navigate(`/work-orders/${workOrder.id}`);
      } catch (error) {
        notifyError(getApiErrorMessage(error, 'No fue posible crear la orden.'));
      }
    })();
  };

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    // El alta definitiva pasa por el modal de confirmación con resumen
    handleOpenConfirm();
  };

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <Link
            to="/work-orders"
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50"
            aria-label="Volver a órdenes"
            title="Volver"
          >
            <AnimateIcon variant="slide-left" animateOnHover>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </AnimateIcon>
          </Link>
          <div>
            <p className="text-sm font-medium text-slate-500">Recepción de taller</p>
            <h1 className="mt-1 text-2xl font-bold text-brand-blue sm:text-3xl">
              Nueva Orden de Trabajo
            </h1>
          </div>
        </div>
        <div className="rounded-lg border border-brand-yellow/60 bg-brand-yellow/10 px-4 py-3 text-sm text-brand-blue shadow-sm">
          Flujo operativo: cliente, facturación, vehículo, inspección y servicios.
        </div>
      </header>

      <form
        onSubmit={submit}
        className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
      >
        {/* Stepper Línea de Tiempo Continua (Estilo Unithor 1.0) */}
        <nav
          className="border-b border-slate-200 bg-slate-50/80 px-4 py-6 sm:px-8"
          aria-label="Línea de tiempo de orden de trabajo"
        >
          {/* Vista Desktop / Tablet: Línea continua y nodos */}
          <div className="relative hidden md:block">
            {/* Barra base conectora */}
            <div className="absolute left-[10%] right-[10%] top-[18px] h-1 -translate-y-1/2 rounded-full bg-slate-200">
              {/* Barra de progreso azul Unithor */}
              <div
                className="h-full rounded-full bg-brand-blue transition-all duration-500 ease-out"
                style={{
                  width:
                    activeStep === 0
                      ? '0%'
                      : activeStep === 1
                        ? '25%'
                        : activeStep === 2
                          ? '50%'
                          : activeStep === 3
                            ? '75%'
                            : '100%',
                }}
              />
            </div>

            {/* Nodos de la línea de tiempo */}
            <ol className="relative z-10 flex justify-between">
              {steps.map((step) => {
                const active = step.id === activeStep;
                const complete = step.id < activeStep;

                return (
                  <li key={step.id} className="flex flex-col items-center">
                    <button
                      type="button"
                      onClick={() => goToStep(step.id)}
                      className="group flex flex-col items-center text-center transition-all focus:outline-none"
                      title={`${step.shortTitle}: ${step.description}`}
                    >
                      {/* Círculo del nodo */}
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-black transition-all duration-300 ${
                          active
                            ? 'scale-110 bg-brand-yellow text-brand-dark ring-4 ring-brand-yellow/30 shadow-md'
                            : complete
                              ? 'bg-brand-blue text-white shadow-sm ring-2 ring-brand-blue/30 group-hover:scale-105'
                              : 'border-2 border-slate-300 bg-white text-slate-400 group-hover:border-slate-400 group-hover:text-slate-600'
                        }`}
                      >
                        {complete ? (
                          <AnimateIcon variant="bounce" animateOnHover={false} loop={false}>
                            <Check className="h-4 w-4 stroke-[3]" aria-hidden="true" />
                          </AnimateIcon>
                        ) : (
                          `${step.id + 1}.`
                        )}
                      </span>

                      {/* Etiquetas del nodo */}
                      <span className="mt-2.5 flex flex-col items-center">
                        <span
                          className={`text-xs uppercase tracking-wide transition-colors ${
                            active
                              ? 'font-black text-brand-blue'
                              : complete
                                ? 'font-bold text-slate-800 group-hover:text-brand-blue'
                                : 'font-semibold text-slate-400'
                          }`}
                        >
                          {step.shortTitle}
                        </span>
                        <span className="mt-0.5 hidden max-w-[130px] truncate text-[11px] text-slate-500 lg:block">
                          {step.description}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Vista Móvil: Selector compacto con indicador de avance */}
          <div className="space-y-3 md:hidden">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="text-brand-blue">PASO {activeStep + 1} DE 5</span>
              <span>{steps[activeStep].title}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-brand-blue transition-all duration-300"
                style={{ width: `${((activeStep + 1) / 5) * 100}%` }}
              />
            </div>
            <div className="grid grid-cols-5 gap-1.5 pt-1">
              {steps.map((step) => {
                const active = step.id === activeStep;
                const complete = step.id < activeStep;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => goToStep(step.id)}
                    className={`flex h-9 items-center justify-center rounded-lg text-xs font-bold transition ${
                      active
                        ? 'bg-brand-yellow text-brand-dark shadow-sm'
                        : complete
                          ? 'bg-brand-blue text-white'
                          : 'border border-slate-200 bg-white text-slate-400'
                    }`}
                  >
                    {complete ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : step.id + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        <motion.div
          key={activeStep}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="min-h-[560px] p-5 sm:p-6"
        >
          {activeStep === 0 && (
            <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
              <SelectedClientCard
                title="Responsable del ingreso"
                client={client}
                onClear={() => setClient(null)}
              />
              <ClientSearchPicker
                label="Buscar responsable"
                selectedClient={client}
                onSelect={setPrimaryClient}
                onCreate={() => setClientModalTarget('primary')}
              />
              {errors.clientId && (
                <p className="text-sm text-red-700 lg:col-span-2">{errors.clientId}</p>
              )}
            </div>
          )}

          {activeStep === 1 && (
            <div className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-3">
                <SelectedClientCard title="Responsable de recepción" client={client} />
                <SelectedClientCard
                  title="Contacto en taller"
                  client={contactClient}
                  onClear={() => setContactClient(null)}
                />
                <SelectedClientCard
                  title="Facturación"
                  client={billingClient}
                  onClear={() => setBillingClient(null)}
                />
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
                        <p className="font-mono text-lg font-bold text-brand-blue">
                          {vehicle.patente}
                        </p>
                        <p className="text-sm text-slate-500">
                          {[vehicle.marca, vehicle.modelo, vehicle.ano].filter(Boolean).join(' ') ||
                            'Sin datos técnicos'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {vehicle.client
                            ? `Propietario registrado: ${vehicle.client.nombre}`
                            : 'Sin propietario registrado'}
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
                    <p className="mt-1 text-sm text-slate-500">
                      Los vehículos existentes conservan su propietario registrado; la OT puede
                      quedar a nombre de otra persona que los entrega.
                    </p>
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
                {canAssignMechanic && (
                  <label className="mt-4 block rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-700">
                    Mecánico responsable
                    <select
                      value={assignedMechanicId ?? ''}
                      onChange={(event) =>
                        setAssignedMechanicId(
                          event.target.value ? Number(event.target.value) : null,
                        )
                      }
                      className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
                    >
                      <option value="">Sin asignar por ahora</option>
                      {mechanicsQuery.data?.map((mechanic) => (
                        <option key={mechanic.id} value={mechanic.id}>
                          {mechanic.nombre}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-xs font-normal text-slate-500">
                      Podrás cambiarlo lateramente desde el detalle de la OT.
                    </span>
                  </label>
                )}
                {vehicleOwnerIsDifferent && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="font-semibold">
                        El propietario del vehículo es diferente al responsable de la OT.
                      </p>
                      <p className="mt-1 text-xs">
                        Se guardarían ambos datos para mantener la trazabilidad:{' '}
                        {vehicle?.client?.nombre} como propietario y {client?.nombre} como
                        responsable de ingreso.
                      </p>
                    </div>
                  </div>
                )}
                {errors.vehicleId && (
                  <p className="mt-3 text-sm text-red-700">{errors.vehicleId}</p>
                )}
              </section>
            </div>
          )}

          {activeStep === 3 && (
            <div className="space-y-6">
              {/* Fechas y motivo de ingreso */}
              <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-brand-blue">
                  Datos de la orden
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-semibold text-slate-700">
                    Fecha de ingreso
                    <input
                      type="datetime-local"
                      value={fechaIngreso}
                      onChange={(event) => setFechaIngreso(event.target.value)}
                      className={inputClassName}
                      aria-invalid={Boolean(errors.fechaIngreso)}
                    />
                    {errors.fechaIngreso && (
                      <span className="mt-1 block text-xs font-normal text-red-700">
                        {errors.fechaIngreso}
                      </span>
                    )}
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
                </div>
                <label className="mt-3 block text-sm font-semibold text-slate-700">
                  Motivo de ingreso / diagnóstico preliminar
                  <textarea
                    value={descripcion}
                    onChange={(event) => setDescripcion(event.target.value)}
                    rows={3}
                    className="mt-2 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
                    placeholder="Describa la falla reportada por el cliente"
                  />
                </label>
              </section>

              {/* Inspección de recepción */}
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
                  {errors.kilometrajeIngreso && (
                    <span className="mt-1 block text-xs font-normal text-red-700">
                      {errors.kilometrajeIngreso}
                    </span>
                  )}
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Nivel de combustible
                  <select
                    value={inspection.nivelCombustible}
                    onChange={(event) =>
                      updateInspection('nivelCombustible', event.target.value as FuelLevel | '')
                    }
                    className={inputClassName}
                  >
                    <option value="">Sin registrar</option>
                    {FUEL_LEVELS.map((fuelLevel) => (
                      <option key={fuelLevel} value={fuelLevel}>
                        {fuelLabels[fuelLevel]}
                      </option>
                    ))}
                  </select>
                </label>
              </section>

              <section aria-labelledby="tires-title">
                <h3 id="tires-title" className="font-bold text-brand-blue">
                  Llantas
                </h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {(
                    [
                      ['llantaDelanteraIzquierda', 'Delantera izquierda'],
                      ['llantaDelanteraDerecha', 'Delantera derecha'],
                      ['llantaTraseraIzquierda', 'Trasera izquierda'],
                      ['llantaTraseraDerecha', 'Trasera derecha'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="text-sm font-semibold text-slate-700">
                      {label}
                      <select
                        value={inspection[key]}
                        onChange={(event) =>
                          updateInspection(key, event.target.value as TireCondition)
                        }
                        className={inputClassName}
                      >
                        {TIRE_CONDITIONS.map((condition) => (
                          <option key={condition} value={condition}>
                            {tireLabels[condition]}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </section>

              <section aria-labelledby="photos-title">
                <div className="flex items-center gap-2">
                  <Camera className="h-5 w-5 text-brand-blue" aria-hidden="true" />
                  <h3 id="photos-title" className="font-bold text-brand-blue">
                    Registro fotográfico
                  </h3>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {WORK_ORDER_INSPECTION_PHOTO_SLOTS.map((slot) => {
                    const photo = photoMap.get(slot);
                    return (
                      <div
                        key={slot}
                        className="overflow-hidden rounded-lg border border-slate-200 bg-white"
                      >
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                          <p className="text-sm font-semibold text-slate-700">
                            {photoSlotLabels[slot]}
                          </p>
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
                          <img
                            src={photo.previewUrl}
                            alt={photoSlotLabels[slot]}
                            className="h-36 w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-36 flex-col items-center justify-center gap-1.5 bg-slate-50 px-3 text-center">
                            <ImagePlus className="h-7 w-7 text-slate-400" aria-hidden="true" />
                            <span className="text-sm font-semibold text-slate-500">Subir foto</span>
                            <span className="text-[11px] font-normal text-slate-400">
                              JPG, PNG o WebP · máx {MAX_INSPECTION_PHOTO_MB} MB
                            </span>
                            <span className="flex gap-2">
                              <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border border-brand-blue bg-white px-3 text-xs font-bold text-brand-blue hover:bg-brand-light">
                                Elegir archivo
                                <input
                                  type="file"
                                  accept={INSPECTION_PHOTO_ACCEPT}
                                  className="sr-only"
                                  onChange={(event) => {
                                    setInspectionPhoto(slot, event.target.files?.[0] ?? null);
                                    event.target.value = '';
                                  }}
                                  aria-label={`Subir foto ${photoSlotLabels[slot]}`}
                                />
                              </label>
                              <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg bg-brand-blue px-3 text-xs font-bold text-white hover:bg-brand-dark">
                                Cámara
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="sr-only"
                                  onChange={(event) => {
                                    setInspectionPhoto(slot, event.target.files?.[0] ?? null);
                                    event.target.value = '';
                                  }}
                                  aria-label={`Usar cámara ${photoSlotLabels[slot]}`}
                                />
                              </label>
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section aria-labelledby="inventory-title">
                <h3 id="inventory-title" className="font-bold text-brand-blue">
                  Inventario interno
                </h3>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {VEHICLE_INVENTORY_ITEMS.map((item) => (
                    <label
                      key={item}
                      className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
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
            <div className="space-y-4">
              <div className="rounded-lg border border-brand-blue/20 bg-brand-light/40 px-4 py-3">
                <p className="text-sm font-semibold text-brand-blue">
                  Agregue los trabajos a realizar y repuestos necesarios. Puede dejar esta sección
                  vacía si el diagnóstico está pendiente.
                </p>
              </div>
              <WorkOrderItemsEditor
                items={items}
                onChange={setItems}
                errors={errors}
                showExecution={false}
              />
            </div>
          )}
        </motion.div>

        {createMutation.isError && (
          <div
            className="mx-5 mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {getApiErrorMessage(createMutation.error, 'No fue posible crear la orden.')}
          </div>
        )}

        {uploadPhotosMutation.isError && createdOrderId && (
          <div
            className="mx-5 mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            role="alert"
          >
            La OT fue creada, pero una o más fotos no se pudieron subir. Puede abrir el detalle de
            la orden y continuar el seguimiento.
          </div>
        )}

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Link
            to="/work-orders"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </Link>
          <div className="flex flex-col gap-2 sm:flex-row">
            {activeStep > 0 && (
              <button
                type="button"
                className="group inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:shadow"
                onClick={() => setActiveStep((activeStep - 1) as StepIndex)}
                disabled={isSubmitting}
              >
                <AnimateIcon variant="slide-left" animateOnHover>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </AnimateIcon>
                Anterior
              </button>
            )}
            {activeStep < 4 ? (
              <button
                type="button"
                className="group inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-blue px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-dark hover:shadow"
                onClick={goNext}
              >
                Siguiente
                <AnimateIcon variant="slide-right" animateOnHover>
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </AnimateIcon>
              </button>
            ) : (
              <button
                type="button"
                className="group inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 hover:shadow disabled:opacity-60"
                disabled={isSubmitting}
                onClick={handleOpenConfirm}
              >
                {isSubmitting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <AnimateIcon variant="bounce" animateOnHover>
                    <Save className="h-4 w-4" aria-hidden="true" />
                  </AnimateIcon>
                )}
                {createdOrderId ? 'Ir al detalle' : 'Revisar y crear orden'}
              </button>
            )}
          </div>
        </footer>
      </form>

      {clientModalTarget && (
        <ClientFormModal onClose={() => setClientModalTarget(null)} onSaved={handleClientSaved} />
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

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/55"
            aria-label="Cerrar confirmación"
            onClick={() => setShowConfirm(false)}
            disabled={isSubmitting}
          />
          <motion.section
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-ot-title"
          >
            <h2 id="confirm-ot-title" className="text-xl font-bold text-brand-blue">
              Confirmar recepción de OT
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Pequeño resumen de lo que se recepciona antes de crear la orden.
            </p>

            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-bold uppercase text-slate-500">Responsable / Contacto</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {client?.nombre ?? 'Sin responsable'}
                </p>
                <p className="text-xs text-slate-500">
                  {contactClient?.nombre ?? client?.nombre ?? '-'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Facturación: {billingClient?.nombre ?? '-'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-bold uppercase text-slate-500">Vehículo</p>
                <p className="mt-1 font-mono font-bold text-brand-blue">
                  {vehicle?.patente ?? 'Sin vehículo'}
                </p>
                <p className="text-xs text-slate-500">
                  {[vehicle?.marca, vehicle?.modelo, vehicle?.ano].filter(Boolean).join(' ') ||
                    'Sin datos'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Propietario: {vehicle?.client?.nombre ?? 'Sin propietario registrado'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Km:{' '}
                  {kilometrajeIngreso === ''
                    ? 'No registrado'
                    : Number(kilometrajeIngreso).toLocaleString('es-CL')}{' '}
                  · Combustible:{' '}
                  {inspection.nivelCombustible
                    ? fuelLabels[inspection.nivelCombustible]
                    : 'Sin registrar'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-bold uppercase text-slate-500">Inspección</p>
                <p className="mt-1 text-xs text-slate-700">
                  Inventario:{' '}
                  {inspection.inventario.length > 0
                    ? inspection.inventario.map((key) => inventoryLabels[key]).join(', ')
                    : 'Sin elementos marcados'}
                </p>
                <p className="mt-1 text-xs text-slate-700">
                  Fotos:{' '}
                  {photos.length > 0
                    ? photos.map((photo) => photoSlotLabels[photo.slot]).join(', ')
                    : 'Sin fotos'}
                </p>
                <p className="mt-1 text-xs text-slate-700">
                  Objetos:{' '}
                  {inspection.objetosValor.trim() === '' ? 'Ninguno' : inspection.objetosValor}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-bold uppercase text-slate-500">Servicios</p>
                {items.filter((item) => item.descripcion.trim().length > 0).length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Diagnóstico inicial, sin trabajos cargados.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1 text-xs text-slate-700">
                    {items
                      .filter((item) => item.descripcion.trim().length > 0)
                      .map((item, index) => (
                        <li key={index} className="flex justify-between gap-2">
                          <span className="truncate">
                            {item.descripcion} × {item.cantidad}{' '}
                            {UNIT_MEASURE_LABELS[item.unidadMedida]?.toLowerCase() ??
                              item.unidadMedida}
                          </span>
                          <span className="font-semibold">
                            $
                            {(Number(item.cantidad) * Number(item.precioUnitario)).toLocaleString(
                              'es-CL',
                            )}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Motivo: {descripcion.trim() === '' ? 'Sin observaciones' : descripcion}
                </p>
              </div>
            </div>

            {createMutation.isError && (
              <p className="mt-3 text-sm text-red-700" role="alert">
                {getApiErrorMessage(createMutation.error, 'No fue posible crear la orden.')}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700"
                onClick={() => setShowConfirm(false)}
                disabled={isSubmitting}
              >
                Volver a editar
              </button>
              <button
                type="button"
                className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
                onClick={handleConfirmCreate}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creando orden...' : 'Confirmar y crear orden'}
              </button>
            </div>
          </motion.section>
        </div>
      )}
    </div>
  );
};

export default WorkOrderCreatePage;
