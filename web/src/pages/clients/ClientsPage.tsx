import {
  AlertCircle,
  Building2,
  FileText,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  UserRound,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { AnimateIcon } from '../../components/animate-ui';
import ClientDetailModal from '../../components/clients/ClientDetailModal';
import ClientFormModal from '../../components/clients/ClientFormModal';
import ListExportButtons from '../../components/common/ListExportButtons';
import Pagination from '../../components/common/Pagination';
import { useClients } from '../../hooks/useClients';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { getApiErrorMessage } from '../../lib/api-error';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

import type { Client } from '../../types/entities';

type ClientTab = 'all' | 'cliente' | 'empresa';

const tabs: Array<{ value: ClientTab; label: string; icon: typeof Users }> = [
  { value: 'all', label: 'Todos', icon: Users },
  { value: 'cliente', label: 'Personas', icon: UserRound },
  { value: 'empresa', label: 'Empresas', icon: Building2 },
];

export const ClientsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [tab, setTab] = useState<ClientTab>('all');
  const [page, setPage] = useState(1);
  const [formClient, setFormClient] = useState<Client | null | undefined>(undefined);
  const requestedClientId = Number(searchParams.get('clientId'));
  const detailClientId =
    Number.isInteger(requestedClientId) && requestedClientId > 0 ? requestedClientId : null;
  const debouncedSearch = useDebouncedValue(search, 350);
  const urlSearch = searchParams.get('search') ?? '';
  const user = useAuthStore((state) => state.user);
  const filters = {
    page,
    pageSize: 20,
    search: debouncedSearch || undefined,
    tipo: tab === 'all' ? undefined : tab,
  } satisfies Parameters<typeof useClients>[0];
  const clientsQuery = useClients(filters);

  const canCreate = Boolean(
    user &&
    (hasUserPermission(user, 'comercial', 'create') || hasUserPermission(user, 'taller', 'create')),
  );
  const canEdit = Boolean(
    user &&
    (hasUserPermission(user, 'comercial', 'update') || hasUserPermission(user, 'taller', 'update')),
  );
  const canDelete = Boolean(user && hasUserPermission(user, 'comercial', 'delete'));

  const openDetail = (id: number): void => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('clientId', String(id));
      return next;
    });
  };
  const closeDetail = useCallback((): void => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('clientId');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  useEffect(() => {
    // Publishing the search changes the router callback too. Do not reset a
    // page selected after that search has already been applied.
    if (debouncedSearch === urlSearch) return;
    setPage(1);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (debouncedSearch) next.set('search', debouncedSearch);
        else next.delete('search');
        return next;
      },
      { replace: true },
    );
  }, [debouncedSearch, urlSearch, setSearchParams]);

  const changeTab = (nextTab: ClientTab): void => {
    setTab(nextTab);
    setPage(1);
  };

  return (
    <div className="workspace-page workspace-clients min-w-0 space-y-5">
      <header className="clients-heading">
        <h1>Clientes</h1>
      </header>

      <div className="clients-toolbar">
        <label className="clients-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Buscar clientes</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre, RUT o email"
          />
        </label>
        <div className="clients-filters" role="tablist" aria-label="Tipo de cliente">
          {tabs.map((item, index) => {
            const isActive = tab === item.value;
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                className="clients-filter"
                onClick={() => changeTab(item.value)}
                onKeyDown={(event) => {
                  let next: number;
                  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
                  else if (event.key === 'ArrowLeft')
                    next = (index + tabs.length - 1) % tabs.length;
                  else if (event.key === 'Home') next = 0;
                  else if (event.key === 'End') next = tabs.length - 1;
                  else return;
                  event.preventDefault();
                  changeTab(tabs[next].value);
                  const tabButtons =
                    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                      '[role="tab"]',
                    );
                  tabButtons?.[next]?.focus();
                }}
              >
                <item.icon aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
        {canCreate && (
          <button
            type="button"
            className="clients-new primary-button"
            onClick={() => setFormClient(null)}
          >
            <AnimateIcon icon={Plus} animation="spin" size={16} /> Nuevo cliente
          </button>
        )}
      </div>
      <div className="clients-results">
        <p role="status" aria-live="polite">
          {clientsQuery.isPending ? 'Cargando clientes…' : clientsQuery.isError ? 'Listado no disponible' : (
            <><strong>{clientsQuery.data?.total ?? 0}</strong> {clientsQuery.data?.total === 1 ? 'cliente' : 'clientes'}</>
          )}
        </p>
        <ListExportButtons
          target="clients"
          filters={filters}
          disabled={clientsQuery.isPending || clientsQuery.isError}
          className="shrink-0"
        />
      </div>

      <section
        className="workspace-directory clients-directory min-w-0 bg-white"
        aria-label="Listado de clientes"
      >
        {clientsQuery.isError && (
          <div
            className="flex items-start gap-2 border-b border-brand-coral/30 bg-brand-coralPale p-4 text-sm text-brand-coralInk"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{' '}
            {getApiErrorMessage(clientsQuery.error, 'No fue posible cargar los clientes')}
          </div>
        )}
        {clientsQuery.isPending ? (
          <div role="status" aria-label="Cargando clientes" className="divide-y divide-brand-line">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex h-[84px] animate-pulse items-center gap-4 px-5">
                <div className="h-9 w-9 rounded-lg bg-brand-pale" />
                <div className="h-4 w-1/2 rounded bg-brand-pale" />
              </div>
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-brand-line">
            {clientsQuery.data?.items.map((client, index) => {
              const Icon = client.tipo === 'empresa' ? Building2 : UserRound;
              const vehiclesCount = client.vehiclesCount ?? client.vehicles?.length;
              return (
                <li
                  key={client.id}
                  className="workspace-directory-row clients-directory-row group relative transition-colors"
                >
                  <button
                    type="button"
                    className="clients-row-open absolute inset-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-primary"
                    onClick={() => openDetail(client.id)}
                    aria-label={`Ver ${client.nombre}`}
                  />
                  <span className="clients-row-number pointer-events-none relative font-mono text-xs tabular-nums text-brand-muted">
                    #{(page - 1) * 20 + index + 1}
                  </span>
                  <div className="clients-identity pointer-events-none relative flex min-w-0 items-center gap-3">
                    <span
                      className="clients-record-icon"
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold leading-5 text-brand-primaryInk">
                        {client.nombre}
                      </p>
                      <p className="mt-1 font-mono text-xs text-brand-muted">
                        {client.rut ?? 'Sin identificación'}
                      </p>
                    </div>
                  </div>
                  <div className="clients-contact pointer-events-none relative min-w-0 space-y-1.5 text-xs text-brand-muted">
                    <p className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-brand-muted" aria-hidden="true" />
                      <span className="truncate">{client.telefono ?? 'Sin teléfono'}</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-brand-muted" aria-hidden="true" />
                      <span className="truncate">{client.email ?? 'Sin email'}</span>
                    </p>
                  </div>
                  <div className="clients-meta pointer-events-none relative">
                    <span className="clients-type">{client.tipo === 'empresa' ? 'Empresa' : 'Persona'}</span>
                    {vehiclesCount !== undefined && (
                      <small>{vehiclesCount} {vehiclesCount === 1 ? 'vehículo' : 'vehículos'}</small>
                    )}
                  </div>
                  <div className="clients-row-actions pointer-events-none relative flex items-center justify-end gap-1">
                    {canEdit && (
                      <button
                        type="button"
                        className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md text-brand-muted transition-colors hover:bg-brand-pale hover:text-brand-primary"
                        onClick={() => setFormClient(client)}
                        aria-label={`Editar ${client.nombre}`}
                        title="Editar cliente"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="pointer-events-auto"
                      onClick={() => openDetail(client.id)}
                      aria-label={`Ver ficha de ${client.nombre}`}
                      title="Ver ficha del cliente"
                    >
                      <FileText className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!clientsQuery.isPending && clientsQuery.data?.items.length === 0 && (
          <div className="flex min-h-52 flex-col items-center justify-center px-4 text-center">
            <Users className="h-9 w-9 text-brand-muted/40" aria-hidden="true" />
            <p className="mt-3 font-semibold text-brand-ink">No se encontraron clientes</p>
            <p className="mt-1 text-sm text-brand-muted">
              Ajuste la búsqueda o el tipo seleccionado.
            </p>
          </div>
        )}
        <Pagination
          page={page}
          totalPages={clientsQuery.data?.totalPages ?? 0}
          total={clientsQuery.data?.total ?? 0}
          onPageChange={setPage}
        />
      </section>
      {formClient !== undefined && (
        <ClientFormModal client={formClient} onClose={() => setFormClient(undefined)} />
      )}
      {detailClientId !== null && (
        <ClientDetailModal
          key={detailClientId}
          clientId={detailClientId}
          canDelete={canDelete}
          canEdit={canEdit}
          onClose={closeDetail}
        />
      )}
    </div>
  );
};

export default ClientsPage;
