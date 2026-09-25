import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Car,
  Check,
  ClipboardList,
  FileText,
  Fuel,
  Gauge,
  Hash,
  Pencil,
  Phone,
  Plus,
  Settings2,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import QuotationStatusBadge from '../../components/quotations/QuotationStatusBadge';
import VehicleFormModal from '../../components/vehicles/VehicleFormModal';
import WorkOrderStatusBadge from '../../components/work-orders/WorkOrderStatusBadge';
import { useQuotations } from '../../hooks/useQuotations';
import { useVehicle } from '../../hooks/useVehicles';
import { useWorkOrders } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDate } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

const terminalStatuses = new Set(['finalizada', 'entregada', 'cancelada']);

const formatKilometres = (value: number | null): string =>
  value === null ? 'Sin registrar' : `${new Intl.NumberFormat('es-CL').format(value)} km`;

interface FactProps {
  icon: typeof Car;
  label: string;
  value: string;
}

const Fact = ({ icon: Icon, label, value }: FactProps) => (
  <div className="min-w-0 border-b border-slate-100 py-3">
    <dt className="flex items-center gap-2 text-xs text-slate-500">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {label}
    </dt>
    <dd className="mt-1.5 break-words text-sm font-medium text-slate-800">{value}</dd>
  </div>
);

const ProfileSkeleton = () => (
  <div className="space-y-5 p-6" role="status" aria-label="Cargando ficha del vehículo">
    <div className="h-16 w-2/3 animate-pulse rounded bg-slate-100" />
    <div className="h-16 animate-pulse rounded bg-slate-100" />
    <div className="h-52 animate-pulse rounded bg-slate-100" />
  </div>
);

type DetailTab = 'details' | 'workshop' | 'quotations';

interface VehicleDetailPageProps {
  vehicleId?: number;
  onClose?: () => void;
}

export const VehicleDetailPage = ({
  vehicleId: suppliedVehicleId,
  onClose,
}: VehicleDetailPageProps) => {
  const { id } = useParams();
  const tabId = useId();
  const vehicleId = suppliedVehicleId ?? Number(id);
  const user = useAuthStore((state) => state.user);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedTab, setSelectedTab] = useState<DetailTab>('details');
  const canReadWorkshop = Boolean(user && hasUserPermission(user, 'taller', 'read'));
  const canReadCommercial = Boolean(user && hasUserPermission(user, 'comercial', 'read'));
  const canCreateWorkOrder = Boolean(user && hasUserPermission(user, 'taller', 'create'));
  const canEdit = Boolean(
    user &&
    (hasUserPermission(user, 'taller', 'update') || hasUserPermission(user, 'comercial', 'update')),
  );
  const vehicleQuery = useVehicle(Number.isInteger(vehicleId) && vehicleId > 0 ? vehicleId : null);
  const workOrdersQuery = useWorkOrders(
    { page: 1, pageSize: 100, vehicleId },
    canReadWorkshop && Number.isInteger(vehicleId) && vehicleId > 0,
  );
  const quotationsQuery = useQuotations(
    { page: 1, pageSize: 100, vehicleId },
    canReadCommercial && Number.isInteger(vehicleId) && vehicleId > 0,
  );

  const workOrders = useMemo(() => workOrdersQuery.data?.items ?? [], [workOrdersQuery.data]);
  const quotations = useMemo(() => quotationsQuery.data?.items ?? [], [quotationsQuery.data]);
  const activeOrders = workOrders.filter((order) => !terminalStatuses.has(order.estado));
  const outstanding = quotations.reduce(
    (total, quotation) => total + Math.max(0, Number(quotation.total) - Number(quotation.pagado)),
    0,
  );
  const historicalKilometres = workOrders
    .map((order) => order.kilometrajeIngreso)
    .filter((value): value is number => value !== null);
  const latestKilometres =
    historicalKilometres.length > 0
      ? Math.max(...historicalKilometres, vehicleQuery.data?.kilometraje ?? 0)
      : (vehicleQuery.data?.kilometraje ?? null);
  const workshopReady = canReadWorkshop && workOrdersQuery.isSuccess;
  const commercialReady = canReadCommercial && quotationsQuery.isSuccess;

  const closeControl = onClose ? (
    <button
      type="button"
      onClick={onClose}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-yellow"
      aria-label="Cerrar ficha"
      title="Cerrar ficha"
    >
      <X className="h-5 w-5" aria-hidden="true" />
    </button>
  ) : (
    <Link
      to="/vehicles"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
      aria-label="Volver a vehículos"
      title="Volver a vehículos"
    >
      <ArrowLeft className="h-5 w-5" aria-hidden="true" />
    </Link>
  );

  if (vehicleQuery.isPending || vehicleQuery.isError || !vehicleQuery.data) {
    return (
      <div className="min-h-0 overflow-y-auto">
        <header className="flex items-center justify-between bg-brand-blue px-5 py-3 text-white">
          <p className="text-sm font-semibold">Ficha del vehículo</p>
          {closeControl}
        </header>
        {vehicleQuery.isPending ? (
          <ProfileSkeleton />
        ) : (
          <div
            className="m-5 flex items-start gap-3 rounded-lg bg-red-50 p-5 text-sm text-red-700"
            role="alert"
          >
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            {getApiErrorMessage(vehicleQuery.error, 'No fue posible cargar la ficha del vehículo.')}
          </div>
        )}
      </div>
    );
  }

  const vehicle = vehicleQuery.data;
  const missingFields = [
    !vehicle.marca && 'marca',
    !vehicle.modelo && 'modelo',
    !vehicle.ano && 'año',
    vehicle.kilometraje === null && 'kilometraje',
    !vehicle.combustible && 'combustible',
    !vehicle.transmision && 'transmisión',
    !vehicle.client && 'propietario',
  ].filter((field): field is string => Boolean(field));
  const displayName = [vehicle.marca, vehicle.modelo, vehicle.ano].filter(Boolean).join(' · ');
  const tabs: { id: DetailTab; label: string; icon: typeof Car; count?: number }[] = [
    { id: 'details', label: 'Ficha', icon: Car },
    ...(canReadWorkshop
      ? [
          {
            id: 'workshop' as const,
            label: 'Taller',
            icon: Wrench,
            count: workOrdersQuery.data?.total,
          },
        ]
      : []),
    ...(canReadCommercial
      ? [
          {
            id: 'quotations' as const,
            label: 'Cotizaciones',
            icon: FileText,
            count: quotationsQuery.data?.total,
          },
        ]
      : []),
  ];
  const activeTab = tabs.some((tab) => tab.id === selectedTab) ? selectedTab : 'details';

  return (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-white">
      <header className="shrink-0 bg-brand-blue text-white">
        <div className="flex items-center justify-between gap-3 px-5 pt-3 sm:px-6">
          <p className="text-xs font-medium text-slate-300">
            Parque vehicular / Ficha del vehículo
          </p>
          {closeControl}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 pb-5 pt-2 sm:px-6">
          <div className="flex min-w-0 max-w-full items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-brand-yellow">
              <Car className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="break-all font-mono text-2xl font-bold leading-8">
                {vehicle.patente}
              </h1>
              <p className="mt-0.5 break-words text-sm text-slate-300">
                {displayName || 'Vehículo sin descripción técnica'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/20 text-slate-200 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-yellow"
                aria-label="Editar ficha"
                title="Editar ficha"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            {canCreateWorkOrder && (
              <Link
                to={`/work-orders/new?vehicleId=${vehicle.id}`}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-yellow px-3 text-xs font-bold text-brand-dark transition-colors hover:bg-yellow-300"
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Nueva OT
              </Link>
            )}
          </div>
        </div>
      </header>

      <section
        className="grid shrink-0 grid-cols-2 border-b border-slate-200 bg-slate-50 sm:grid-cols-4"
        aria-label="Resumen del vehículo"
      >
        <div className="min-w-0 border-b border-r border-slate-200 px-4 py-3 sm:border-b-0 sm:px-6">
          <p className="text-xs text-slate-500">Órdenes históricas</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-brand-blue">
            {workshopReady ? workOrdersQuery.data.total : '—'}
          </p>
        </div>
        <div className="min-w-0 border-b border-slate-200 px-4 py-3 sm:border-b-0 sm:border-r sm:px-6">
          <p className="text-xs text-slate-500">OT activas</p>
          <p
            className={`mt-1 text-xl font-semibold tabular-nums ${activeOrders.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
          >
            {workshopReady ? activeOrders.length : '—'}
          </p>
        </div>
        <div className="min-w-0 border-r border-slate-200 px-4 py-3 sm:px-6">
          <p className="text-xs text-slate-500">Último kilometraje</p>
          <p className="mt-1 break-words text-base font-semibold tabular-nums text-brand-blue">
            {formatKilometres(latestKilometres)}
          </p>
        </div>
        <div className="min-w-0 px-4 py-3 sm:px-6">
          <p className="text-xs text-slate-500">Saldo relacionado</p>
          <p className="mt-1 break-words text-base font-semibold tabular-nums text-brand-blue">
            {commercialReady ? formatClp(outstanding) : '—'}
          </p>
        </div>
      </section>

      <div
        className="flex shrink-0 border-b border-slate-200 px-3 sm:px-6"
        role="tablist"
        aria-label="Información del vehículo"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${tabId}-${tab.id}-tab`}
            aria-controls={`${tabId}-${tab.id}-panel`}
            aria-selected={activeTab === tab.id}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setSelectedTab(tab.id)}
            onKeyDown={(event) => {
              let nextIndex: number;
              if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
              else if (event.key === 'ArrowLeft')
                nextIndex = (index - 1 + tabs.length) % tabs.length;
              else if (event.key === 'Home') nextIndex = 0;
              else if (event.key === 'End') nextIndex = tabs.length - 1;
              else return;
              event.preventDefault();
              setSelectedTab(tabs[nextIndex].id);
              document.getElementById(`${tabId}-${tabs[nextIndex].id}-tab`)?.focus();
            }}
            className={`flex min-w-0 items-center justify-center gap-1.5 border-b-2 px-2 py-3.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-blue sm:gap-2 sm:px-4 sm:text-sm ${activeTab === tab.id ? 'border-brand-yellow text-brand-blue' : 'border-transparent text-slate-500 hover:border-slate-200 hover:text-brand-blue'}`}
          >
            <tab.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {tab.label}
            {tab.count !== undefined && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-500">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div
        id={`${tabId}-${activeTab}-panel`}
        role="tabpanel"
        aria-labelledby={`${tabId}-${activeTab}-tab`}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue"
      >
        {activeTab === 'details' && (
          <div className="grid md:min-h-[300px] md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <section
              className="min-w-0 border-b border-slate-200 bg-slate-50/60 px-5 py-5 sm:px-6 md:border-b-0 md:border-r"
              aria-labelledby={`${tabId}-owner-title`}
            >
              <h2 id={`${tabId}-owner-title`} className="text-xs font-semibold text-slate-500">
                Propietario actual
              </h2>
              <div className="mt-3 flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue/5 text-brand-blue">
                  <UserRound className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  {vehicle.client ? (
                    <>
                      <Link
                        to={`/clients?search=${encodeURIComponent(vehicle.client.rut ?? vehicle.client.nombre)}`}
                        className="break-words text-sm font-semibold text-brand-blue hover:underline"
                      >
                        {vehicle.client.nombre}
                      </Link>
                      <p className="mt-1 break-words text-xs text-slate-500">
                        {vehicle.client.rut ?? 'Sin identificación'}
                      </p>
                      <p className="mt-3 flex items-start gap-1.5 break-all text-xs text-slate-600">
                        <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {vehicle.client.telefono ?? 'Sin teléfono'}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">Sin propietario asignado</p>
                  )}
                </div>
              </div>
              <div className="mt-5 border-t border-slate-200 pt-4">
                <p
                  className={`flex items-center gap-1.5 text-xs font-semibold ${missingFields.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
                >
                  {missingFields.length > 0 ? (
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {missingFields.length > 0
                    ? `${missingFields.length} datos por completar`
                    : 'Ficha completa'}
                </p>
                {missingFields.length > 0 && (
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Faltan {missingFields.join(', ')}.
                  </p>
                )}
              </div>
            </section>
            <section
              className="min-w-0 px-5 py-5 sm:px-6"
              aria-labelledby={`${tabId}-technical-title`}
            >
              <h2
                id={`${tabId}-technical-title`}
                className="flex items-center gap-2 text-sm font-semibold text-brand-blue"
              >
                <Settings2 className="h-4 w-4" aria-hidden="true" />
                Datos técnicos
              </h2>
              <dl className="mt-1 grid grid-cols-2 gap-x-5">
                <Fact
                  icon={Car}
                  label="Marca / modelo"
                  value={
                    [vehicle.marca, vehicle.modelo].filter(Boolean).join(' ') || 'Sin registrar'
                  }
                />
                <Fact
                  icon={CalendarDays}
                  label="Año / color"
                  value={
                    [vehicle.ano, vehicle.color].filter(Boolean).join(' · ') || 'Sin registrar'
                  }
                />
                <Fact
                  icon={Gauge}
                  label="Kilometraje"
                  value={formatKilometres(vehicle.kilometraje)}
                />
                <Fact
                  icon={Fuel}
                  label="Combustible"
                  value={vehicle.combustible ?? 'Sin registrar'}
                />
                <Fact
                  icon={Wrench}
                  label="Transmisión / motor"
                  value={
                    [vehicle.transmision, vehicle.motor].filter(Boolean).join(' · ') ||
                    'Sin registrar'
                  }
                />
                <Fact
                  icon={Hash}
                  label="VIN / chasis"
                  value={vehicle.vinChasis ?? 'Sin registrar'}
                />
              </dl>
            </section>
          </div>
        )}

        {activeTab === 'workshop' && (
          <section className="min-h-[300px]" aria-label="Historial de taller">
            <h2 className="px-5 pb-3 pt-5 text-sm font-semibold text-brand-blue sm:px-6">
              Historial de taller
            </h2>
            {workOrdersQuery.isPending ? (
              <p className="px-6 py-12 text-center text-sm text-slate-500" role="status">
                Cargando historial...
              </p>
            ) : workOrdersQuery.isError ? (
              <p className="mx-6 bg-red-50 p-4 text-sm text-red-700" role="alert">
                No fue posible cargar el historial de taller.
              </p>
            ) : workOrders.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {workOrders.map((order) => (
                  <Link
                    key={order.id}
                    to={`/work-orders/${order.id}`}
                    className="group grid gap-2 px-5 py-3.5 transition-colors hover:bg-slate-50 sm:grid-cols-[8.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:px-6"
                  >
                    <div>
                      <p className="font-mono text-xs font-bold text-brand-blue">{order.codigo}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(order.fechaIngreso ?? order.createdAt)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-slate-800">
                        {order.descripcion || 'Sin diagnóstico registrado'}
                      </p>
                      <p className="mt-1 break-words text-xs text-slate-500">
                        {formatKilometres(order.kilometrajeIngreso)}
                        {order.assignedMechanic ? ` · ${order.assignedMechanic.nombre}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <WorkOrderStatusBadge status={order.estado} />
                      <ArrowUpRight
                        className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-brand-blue"
                        aria-hidden="true"
                      />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <ClipboardList className="h-7 w-7 text-slate-300" aria-hidden="true" />
                <p className="mt-3 text-sm text-slate-500">
                  Este vehículo aún no registra órdenes de trabajo.
                </p>
              </div>
            )}
          </section>
        )}

        {activeTab === 'quotations' && (
          <section className="min-h-[300px]" aria-label="Historial comercial">
            <h2 className="px-5 pb-3 pt-5 text-sm font-semibold text-brand-blue sm:px-6">
              Historial comercial
            </h2>
            {quotationsQuery.isPending ? (
              <p className="px-6 py-12 text-center text-sm text-slate-500" role="status">
                Cargando cotizaciones...
              </p>
            ) : quotationsQuery.isError ? (
              <p className="mx-6 bg-red-50 p-4 text-sm text-red-700" role="alert">
                No fue posible cargar el historial comercial.
              </p>
            ) : quotations.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {quotations.map((quotation) => {
                  const balance = Math.max(0, Number(quotation.total) - Number(quotation.pagado));
                  return (
                    <Link
                      key={quotation.id}
                      to={`/quotations/${quotation.id}`}
                      className="group grid gap-2 px-5 py-3.5 transition-colors hover:bg-slate-50 sm:grid-cols-[8.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:px-6"
                    >
                      <div>
                        <p className="font-mono text-xs font-bold text-brand-blue">
                          {quotation.codigo}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDate(quotation.createdAt)}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold tabular-nums text-slate-800">
                          {formatClp(Number(quotation.total))}
                        </p>
                        <p className="mt-1 break-words text-xs text-slate-500">
                          Pagado {formatClp(Number(quotation.pagado))} · Saldo {formatClp(balance)}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <QuotationStatusBadge status={quotation.estadoPago} />
                        <ArrowUpRight
                          className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-brand-blue"
                          aria-hidden="true"
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <FileText className="h-7 w-7 text-slate-300" aria-hidden="true" />
                <p className="mt-3 text-sm text-slate-500">
                  Este vehículo aún no registra cotizaciones.
                </p>
              </div>
            )}
          </section>
        )}
      </div>

      <footer className="flex shrink-0 flex-wrap justify-between gap-x-4 gap-y-1 border-t border-slate-200 bg-slate-50 px-5 py-3 text-[11px] text-slate-500 sm:px-6">
        <span>Registrado el {formatDate(vehicle.createdAt)}</span>
        <span>Actualizado el {formatDate(vehicle.updatedAt)}</span>
      </footer>

      {isEditing && <VehicleFormModal vehicle={vehicle} onClose={() => setIsEditing(false)} />}
    </div>
  );
};

export default VehicleDetailPage;
