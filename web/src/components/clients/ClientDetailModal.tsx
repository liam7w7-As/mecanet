import {
  ArrowUpRight,
  Building2,
  Car,
  ClipboardList,
  FileText,
  Hash,
  LoaderCircle,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import ClientFormModal from './ClientFormModal';
import { useClient, useDeleteClientMutation } from '../../hooks/useClients';
import { useQuotations } from '../../hooks/useQuotations';
import { useWorkOrders } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDate } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import Pagination from '../common/Pagination';
import QuotationStatusBadge from '../quotations/QuotationStatusBadge';
import VehicleFormModal from '../vehicles/VehicleFormModal';
import WorkOrderStatusBadge from '../work-orders/WorkOrderStatusBadge';

interface ClientDetailModalProps {
  clientId: number;
  canDelete: boolean;
  canEdit: boolean;
  onClose: () => void;
}

type ClientDetailTab = 'data' | 'vehicles' | 'orders' | 'quotations';

const ClientFact = ({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Phone;
  label: string;
  value: string | null;
}) => (
  <div className="min-w-0 border-b border-slate-100 py-3">
    <dt className="flex items-center gap-2 text-xs text-slate-500">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </dt>
    <dd className="mt-1.5 break-words text-sm font-medium text-slate-800">
      {value || 'Sin registrar'}
    </dd>
  </div>
);

export const ClientDetailModal = ({
  clientId,
  canDelete,
  canEdit,
  onClose,
}: ClientDetailModalProps) => {
  const tabId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const clientQuery = useClient(clientId, true);
  const deleteMutation = useDeleteClientMutation();
  const [isConfirmingDelete, setConfirmingDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isVehicleFormOpen, setVehicleFormOpen] = useState(false);
  const [tab, setTab] = useState<ClientDetailTab>('data');
  const [ordersPage, setOrdersPage] = useState(1);
  const [quotationsPage, setQuotationsPage] = useState(1);
  const user = useAuthStore((state) => state.user);
  const canReadWorkshop = Boolean(user && hasUserPermission(user, 'taller', 'read'));
  const canReadCommercial = Boolean(user && hasUserPermission(user, 'comercial', 'read'));
  const canCreateOrder = Boolean(user && hasUserPermission(user, 'taller', 'create'));
  const canCreateVehicle = Boolean(
    user &&
    (hasUserPermission(user, 'taller', 'create') || hasUserPermission(user, 'comercial', 'create')),
  );
  const ordersQuery = useWorkOrders(
    { clientId, page: ordersPage, pageSize: 5 },
    canReadWorkshop && clientQuery.isSuccess,
  );
  const quotationsQuery = useQuotations(
    { clientId, page: quotationsPage, pageSize: 5 },
    canReadCommercial && clientQuery.isSuccess,
  );
  const client = clientQuery.data;
  const ClientIcon = client?.tipo === 'empresa' ? Building2 : UserRound;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (isEditing || isVehicleFormOpen) return undefined;
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !deleteMutation.isPending) {
        event.preventDefault();
        onClose();
      }
      if (event.key !== 'Tab') return;
      const elements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
      const first = elements[0];
      const last = elements.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, isVehicleFormOpen, deleteMutation.isPending, onClose]);

  const tabs: { id: ClientDetailTab; label: string; icon: typeof Car; count?: number }[] = [
    { id: 'data', label: 'Datos', icon: UserRound },
    { id: 'vehicles', label: 'Vehículos', icon: Car, count: client?.vehicles?.length },
    ...(canReadWorkshop
      ? [
          {
            id: 'orders' as const,
            label: 'Órdenes',
            icon: ClipboardList,
            count: ordersQuery.data?.total,
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
  const activeTab = tabs.some((item) => item.id === tab) ? tab : 'data';

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
        <button
          type="button"
          className="absolute inset-0 bg-slate-950/60 backdrop-blur-[1px]"
          aria-label="Cerrar detalle"
          onClick={onClose}
          disabled={deleteMutation.isPending}
          tabIndex={-1}
        />
        <motion.section
          ref={dialogRef}
          initial={{ opacity: 0, scale: 0.97, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl outline-none sm:max-h-[calc(100dvh-2.5rem)]"
          role="dialog"
          aria-modal="true"
          aria-label="Ficha del cliente"
          tabIndex={-1}
        >
          <header className="shrink-0 bg-brand-blue text-white">
            <div className="flex items-center justify-between gap-3 px-5 pt-3 sm:px-6">
              <p className="text-xs font-medium text-slate-300">Clientes / Ficha del cliente</p>
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
                onClick={onClose}
                disabled={deleteMutation.isPending}
                aria-label="Cerrar ficha"
                title="Cerrar ficha"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex flex-col items-start justify-between gap-4 px-5 pb-5 pt-2 sm:flex-row sm:items-center sm:px-6">
              <div className="flex w-full min-w-0 flex-1 items-start gap-3 sm:w-auto">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-brand-yellow">
                  <ClientIcon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="break-words text-lg font-semibold leading-6">
                    {client?.nombre ?? 'Cargando cliente...'}
                  </h2>
                  {client && (
                    <p className="mt-1 break-words text-xs text-slate-300">
                      {client.tipo === 'empresa' ? 'Empresa' : 'Persona natural'} ·{' '}
                      {client.rut ?? 'Sin identificación'}
                    </p>
                  )}
                </div>
              </div>
              {client && (
                <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                  {canEdit && (
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-white/20 text-slate-200 hover:bg-white/10"
                      onClick={() => setIsEditing(true)}
                      aria-label="Editar cliente"
                      title="Editar cliente"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                  {canCreateOrder && (
                    <Link
                      to={`/work-orders/new?clientId=${clientId}`}
                      className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-yellow px-3 text-xs font-bold text-brand-dark hover:bg-yellow-300"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Nueva OT
                    </Link>
                  )}
                </div>
              )}
            </div>
          </header>

          {clientQuery.isPending && (
            <div className="flex h-80 items-center justify-center text-brand-blue" role="status">
              <LoaderCircle className="h-7 w-7 animate-spin" aria-hidden="true" />
              <span className="sr-only">Cargando cliente</span>
            </div>
          )}
          {clientQuery.isError && (
            <div className="m-5 bg-red-50 p-4 text-sm text-red-700" role="alert">
              {getApiErrorMessage(clientQuery.error, 'No fue posible cargar el cliente')}
            </div>
          )}

          {client && (
            <>
              <div
                className="flex shrink-0 overflow-x-auto border-b border-slate-200 px-2 sm:px-6"
                role="tablist"
                aria-label="Información del cliente"
              >
                {tabs.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    id={`${tabId}-${item.id}-tab`}
                    aria-controls={`${tabId}-${item.id}-panel`}
                    aria-selected={activeTab === item.id}
                    tabIndex={activeTab === item.id ? 0 : -1}
                    onClick={() => setTab(item.id)}
                    onKeyDown={(event) => {
                      let next: number;
                      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
                      else if (event.key === 'ArrowLeft')
                        next = (index + tabs.length - 1) % tabs.length;
                      else if (event.key === 'Home') next = 0;
                      else if (event.key === 'End') next = tabs.length - 1;
                      else return;
                      event.preventDefault();
                      setTab(tabs[next].id);
                      document.getElementById(`${tabId}-${tabs[next].id}-tab`)?.focus();
                    }}
                    className={`flex shrink-0 items-center gap-2 border-b-2 px-2 py-3.5 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${activeTab === item.id ? 'border-brand-yellow text-brand-blue' : 'border-transparent text-slate-500 hover:text-brand-blue'}`}
                  >
                    <item.icon className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
                    {item.label}
                    {item.count !== undefined && (
                      <span className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-500 sm:inline">
                        {item.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div
                role="tabpanel"
                id={`${tabId}-${activeTab}-panel`}
                aria-labelledby={`${tabId}-${activeTab}-tab`}
                tabIndex={0}
                className="min-h-0 overflow-y-auto overscroll-contain focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-blue sm:h-[360px]"
              >
                {activeTab === 'data' && (
                  <div className="grid gap-x-8 px-5 py-3 sm:grid-cols-2 sm:px-6">
                    <dl>
                      <ClientFact
                        icon={Phone}
                        label="Teléfono de contacto"
                        value={client.telefono}
                      />
                      <ClientFact icon={Mail} label="Correo electrónico" value={client.email} />
                      <ClientFact icon={Hash} label="RUT / Identificación" value={client.rut} />
                    </dl>
                    <dl>
                      <ClientFact icon={MapPin} label="Dirección" value={client.direccion} />
                      <ClientFact icon={MapPin} label="Comuna" value={client.comuna} />
                      <ClientFact icon={MapPin} label="Región" value={client.region} />
                    </dl>
                    <section className="py-4 sm:col-span-2" aria-label="Notas del cliente">
                      <h3 className="text-xs font-semibold text-slate-500">Notas</h3>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                        {client.notas || 'Sin notas registradas.'}
                      </p>
                    </section>
                  </div>
                )}

                {activeTab === 'vehicles' && (
                  <section aria-label="Vehículos asociados">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                      <h3 className="text-sm font-semibold text-brand-blue">
                        Vehículos asociados{' '}
                        <span className="ml-1 text-slate-400">
                          ({client.vehicles?.length ?? 0})
                        </span>
                      </h3>
                      {canCreateVehicle && (
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand-blue px-3 text-xs font-semibold text-white hover:bg-brand-dark"
                          onClick={() => setVehicleFormOpen(true)}
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          Nuevo vehículo
                        </button>
                      )}
                    </div>
                    {client.vehicles?.length ? (
                      <ul className="divide-y divide-slate-100">
                        {client.vehicles.map((vehicle) => (
                          <li
                            key={vehicle.id}
                            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6"
                          >
                            <Link
                              to={`/vehicles?vehicleId=${vehicle.id}`}
                              className="group flex min-w-0 flex-1 items-center gap-3"
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue/5 text-brand-blue">
                                <Car className="h-4 w-4" aria-hidden="true" />
                              </span>
                              <div className="min-w-0">
                                <p className="font-mono text-sm font-bold text-brand-blue group-hover:underline">
                                  {vehicle.patente}
                                </p>
                                <p className="mt-1 break-words text-xs text-slate-500">
                                  {[vehicle.marca, vehicle.modelo, vehicle.ano]
                                    .filter(Boolean)
                                    .join(' · ') || 'Sin detalles'}
                                </p>
                              </div>
                              <ArrowUpRight
                                className="h-4 w-4 shrink-0 text-slate-400"
                                aria-hidden="true"
                              />
                            </Link>
                            {canCreateOrder && (
                              <Link
                                to={`/work-orders/new?clientId=${clientId}&vehicleId=${vehicle.id}`}
                                className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-brand-blue hover:bg-slate-50"
                                aria-label={`Nueva OT para ${vehicle.patente}`}
                              >
                                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                Nueva OT
                              </Link>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="px-5 py-12 text-center text-sm text-slate-500">
                        Sin vehículos asociados
                      </p>
                    )}
                  </section>
                )}

                {activeTab === 'orders' && (
                  <section aria-label="Órdenes del cliente">
                    <div className="px-5 pb-3 pt-4 sm:px-6">
                      <h3 className="text-sm font-semibold text-brand-blue">Órdenes de trabajo</h3>
                      <p className="mt-1 text-xs text-slate-500">Como responsable de ingreso</p>
                    </div>
                    {ordersQuery.isPending ? (
                      <p className="p-6 text-sm text-slate-500" role="status">
                        Cargando órdenes...
                      </p>
                    ) : ordersQuery.isError ? (
                      <p className="mx-5 bg-red-50 p-3 text-sm text-red-700" role="alert">
                        No fue posible cargar las órdenes.
                      </p>
                    ) : ordersQuery.data?.items.length ? (
                      <>
                        <div className="divide-y divide-slate-100">
                          {ordersQuery.data.items.map((order) => (
                            <Link
                              key={order.id}
                              to={`/work-orders/${order.id}`}
                              className="block px-5 py-3 transition-colors hover:bg-slate-50 sm:px-6"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-mono text-xs font-bold text-brand-blue">
                                  {order.codigo}
                                </span>
                                <WorkOrderStatusBadge status={order.estado} />
                              </div>
                              <p className="mt-1.5 text-xs text-slate-500">
                                {order.vehicle?.patente ?? 'Sin vehículo'} ·{' '}
                                {formatDate(order.fechaIngreso ?? order.createdAt)}
                              </p>
                              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                                <div>
                                  <dt className="text-slate-500">Responsable de ingreso</dt>
                                  <dd className="mt-1 break-words font-medium text-slate-800">
                                    {order.client?.nombre ?? client.nombre}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-slate-500">Contacto</dt>
                                  <dd className="mt-1 break-words font-medium text-slate-800">
                                    {order.contact?.nombre ??
                                      order.contactClient?.nombre ??
                                      'Sin registrar'}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-slate-500">Facturar a</dt>
                                  <dd className="mt-1 break-words font-medium text-slate-800">
                                    {order.billing?.nombre ??
                                      order.billingClient?.nombre ??
                                      'Sin datos de facturación'}
                                  </dd>
                                </div>
                              </dl>
                            </Link>
                          ))}
                        </div>
                        <Pagination
                          page={ordersPage}
                          totalPages={ordersQuery.data.totalPages}
                          total={ordersQuery.data.total}
                          onPageChange={setOrdersPage}
                        />
                      </>
                    ) : (
                      <p className="px-5 py-12 text-center text-sm text-slate-500">
                        Sin órdenes de trabajo registradas
                      </p>
                    )}
                  </section>
                )}

                {activeTab === 'quotations' && (
                  <section aria-label="Cotizaciones del cliente">
                    <h3 className="px-5 pb-3 pt-4 text-sm font-semibold text-brand-blue sm:px-6">
                      Cotizaciones
                    </h3>
                    {quotationsQuery.isPending ? (
                      <p className="p-6 text-sm text-slate-500" role="status">
                        Cargando cotizaciones...
                      </p>
                    ) : quotationsQuery.isError ? (
                      <p className="mx-5 bg-red-50 p-3 text-sm text-red-700" role="alert">
                        No fue posible cargar las cotizaciones.
                      </p>
                    ) : quotationsQuery.data?.items.length ? (
                      <>
                        <div className="divide-y divide-slate-100">
                          {quotationsQuery.data.items.map((quotation) => (
                            <Link
                              key={quotation.id}
                              to={`/quotations/${quotation.id}`}
                              className="grid gap-2 px-5 py-3 transition-colors hover:bg-slate-50 sm:grid-cols-[1fr_1fr_auto] sm:items-center sm:px-6"
                            >
                              <div>
                                <p className="font-mono text-xs font-bold text-brand-blue">
                                  {quotation.codigo}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {formatDate(quotation.createdAt)} ·{' '}
                                  {quotation.vehicle?.patente ?? 'Sin vehículo'}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm font-semibold tabular-nums text-slate-800">
                                  {formatClp(Number(quotation.total))}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Saldo{' '}
                                  {formatClp(
                                    Math.max(0, Number(quotation.total) - Number(quotation.pagado)),
                                  )}
                                </p>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <QuotationStatusBadge status={quotation.estadoPago} />
                                <ArrowUpRight
                                  className="h-4 w-4 text-slate-400"
                                  aria-hidden="true"
                                />
                              </div>
                            </Link>
                          ))}
                        </div>
                        <Pagination
                          page={quotationsPage}
                          totalPages={quotationsQuery.data.totalPages}
                          total={quotationsQuery.data.total}
                          onPageChange={setQuotationsPage}
                        />
                      </>
                    ) : (
                      <p className="px-5 py-12 text-center text-sm text-slate-500">
                        Sin cotizaciones registradas
                      </p>
                    )}
                  </section>
                )}
              </div>
            </>
          )}

          {client && (
            <footer className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:px-6">
              {deleteMutation.isError && (
                <p className="mb-3 text-sm text-red-700" role="alert">
                  {getApiErrorMessage(deleteMutation.error)}
                </p>
              )}
              {isConfirmingDelete && canDelete ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-red-700">¿Eliminar este cliente?</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Se ocultará del listado y conservará su historial.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={deleteMutation.isPending}
                      onClick={() => setConfirmingDelete(false)}
                      className="h-8 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-600"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(clientId, { onSuccess: onClose })}
                      className="inline-flex h-8 items-center gap-2 rounded-md bg-red-700 px-3 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {deleteMutation.isPending && (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      )}
                      Confirmar eliminación
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] text-slate-500">
                    Registrado el {formatDate(client.createdAt)}
                  </p>
                  {canDelete && (
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-700"
                      aria-label="Eliminar cliente"
                      title="Eliminar cliente"
                      onClick={() => {
                        deleteMutation.reset();
                        setConfirmingDelete(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
            </footer>
          )}
        </motion.section>
      </div>
      {client && isEditing && (
        <ClientFormModal client={client} onClose={() => setIsEditing(false)} />
      )}
      {client && isVehicleFormOpen && (
        <VehicleFormModal
          suggestedClient={client}
          onClose={() => setVehicleFormOpen(false)}
          onSaved={() => setTab('vehicles')}
        />
      )}
    </>
  );
};

export default ClientDetailModal;
