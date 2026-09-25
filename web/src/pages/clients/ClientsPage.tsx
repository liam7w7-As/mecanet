import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  UserRound,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { AnimateIcon } from '../../components/animate-ui';
import ClientDetailModal from '../../components/clients/ClientDetailModal';
import ClientFormModal from '../../components/clients/ClientFormModal';
import Pagination from '../../components/common/Pagination';
import { useClients } from '../../hooks/useClients';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { getApiErrorMessage } from '../../lib/api-error';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

import type { Client } from '../../types/entities';

type ClientTab = 'all' | 'cliente' | 'empresa';

const tabs: Array<{ value: ClientTab; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'cliente', label: 'Personas' },
  { value: 'empresa', label: 'Empresas' },
];

const rowClassName =
  'grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 px-4 md:grid-cols-[2rem_minmax(0,1.5fr)_minmax(0,1fr)_5rem_4.5rem] md:gap-5';

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
  const user = useAuthStore((state) => state.user);
  const clientsQuery = useClients({
    page,
    pageSize: 20,
    search: debouncedSearch || undefined,
    tipo: tab === 'all' ? undefined : tab,
  });

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
  }, [debouncedSearch, setSearchParams]);

  const changeTab = (nextTab: ClientTab): void => {
    setTab(nextTab);
    setPage(1);
  };

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Gestión comercial</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-blue sm:text-3xl">Clientes</h1>
        </div>
        {canCreate && (
          <button
            type="button"
            className="group inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-yellow px-4 text-sm font-bold text-brand-dark shadow-sm transition-colors hover:bg-yellow-400"
            onClick={() => setFormClient(null)}
          >
            <AnimateIcon icon={Plus} animation="spin" size={16} /> Nuevo cliente
          </button>
        )}
      </header>

      <div className="flex flex-col gap-3 border-y border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1" role="tablist" aria-label="Tipo de cliente">
          {tabs.map((item, index) => {
            const isActive = tab === item.value;
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                className={`relative h-9 rounded-lg px-3 text-sm font-semibold transition-colors ${isActive ? 'text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                onClick={() => changeTab(item.value)}
                onKeyDown={(event) => {
                  let next: number;
                  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
                  else if (event.key === 'ArrowLeft')
                    next = (index + tabs.length - 1) % tabs.length;
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
                {isActive && (
                  <motion.span
                    layoutId="clientTabIndicator"
                    className="absolute inset-0 rounded-lg bg-brand-blue"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </button>
            );
          })}
        </div>
        <label className="relative block w-full sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
            aria-hidden="true"
          />
          <span className="sr-only">Buscar clientes</span>
          <input
            className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre, RUT o email"
          />
        </label>
      </div>

      <section
        className="min-w-0 border-y border-slate-200 bg-white"
        aria-label="Listado de clientes"
      >
        {clientsQuery.isError && (
          <div
            className="flex items-start gap-2 border-b border-red-200 bg-red-50 p-4 text-sm text-red-700"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{' '}
            {getApiErrorMessage(clientsQuery.error, 'No fue posible cargar los clientes')}
          </div>
        )}
        <div
          className={`${rowClassName} border-b border-slate-200 bg-slate-50 py-3 text-[11px] font-semibold uppercase text-slate-500`}
          aria-hidden="true"
        >
          <span>N°</span>
          <span>Cliente / Identificación</span>
          <span className="hidden md:block">Contacto</span>
          <span className="hidden md:block">Tipo</span>
          <span className="text-right">Acciones</span>
        </div>
        {clientsQuery.isPending ? (
          <div role="status" aria-label="Cargando clientes" className="divide-y divide-slate-100">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex h-[84px] animate-pulse items-center gap-4 px-5">
                <div className="h-9 w-9 rounded-lg bg-slate-100" />
                <div className="h-4 w-1/2 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {clientsQuery.data?.items.map((client, index) => {
              const Icon = client.tipo === 'empresa' ? Building2 : UserRound;
              return (
                <li
                  key={client.id}
                  className={`${rowClassName} group relative min-h-[84px] py-3 transition-colors hover:bg-brand-blue/[0.03] focus-within:bg-brand-blue/[0.03]`}
                >
                  <button
                    type="button"
                    className="absolute inset-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-blue"
                    onClick={() => openDetail(client.id)}
                    aria-label={`Ver ${client.nombre}`}
                  />
                  <span className="pointer-events-none relative font-mono text-xs tabular-nums text-slate-400">
                    #{(page - 1) * 20 + index + 1}
                  </span>
                  <div className="pointer-events-none relative flex min-w-0 items-center gap-3">
                    <span
                      className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:flex ${client.tipo === 'empresa' ? 'bg-amber-50 text-amber-700' : 'bg-brand-blue/5 text-brand-blue'}`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold leading-5 text-brand-blue">
                        {client.nombre}
                      </p>
                      <p className="mt-1 font-mono text-xs text-slate-500">
                        {client.rut ?? 'Sin identificación'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 md:hidden">
                        {client.tipo === 'empresa' ? 'Empresa' : 'Persona'}
                        {client.telefono ? ` · ${client.telefono}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="pointer-events-none relative hidden min-w-0 space-y-1.5 text-xs text-slate-600 md:block">
                    <p className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                      <span className="truncate">{client.telefono ?? 'Sin teléfono'}</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                      <span className="truncate">{client.email ?? 'Sin email'}</span>
                    </p>
                  </div>
                  <span
                    className={`pointer-events-none relative hidden justify-self-start rounded px-2 py-1 text-[11px] font-medium md:inline-flex ${client.tipo === 'empresa' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-brand-blue'}`}
                  >
                    {client.tipo === 'empresa' ? 'Empresa' : 'Persona'}
                  </span>
                  <div className="pointer-events-none relative flex items-center justify-end gap-1">
                    {canEdit && (
                      <button
                        type="button"
                        className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-amber-50 hover:text-amber-700"
                        onClick={() => setFormClient(client)}
                        aria-label={`Editar ${client.nombre}`}
                        title="Editar cliente"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    <span className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors group-hover:bg-brand-blue/5 group-hover:text-brand-blue">
                      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!clientsQuery.isPending && clientsQuery.data?.items.length === 0 && (
          <div className="flex min-h-52 flex-col items-center justify-center px-4 text-center">
            <Users className="h-9 w-9 text-slate-300" aria-hidden="true" />
            <p className="mt-3 font-semibold text-slate-700">No se encontraron clientes</p>
            <p className="mt-1 text-sm text-slate-500">
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
