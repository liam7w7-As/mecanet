import { AlertCircle, Eye, Pencil, Plus, Search, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { AnimateIcon, AnimatedTableRow } from '../../components/animate-ui';
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

const TableSkeleton = () => (
  <>
    {Array.from({ length: 5 }, (_, index) => (
      <tr key={index} className="border-b border-slate-100">
        {Array.from({ length: 7 }, (_, cellIndex) => (
          <td key={cellIndex} className="px-4 py-4"><div className="h-4 animate-pulse rounded bg-slate-100" /></td>
        ))}
      </tr>
    ))}
  </>
);

export const ClientsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [tab, setTab] = useState<ClientTab>('all');
  const [page, setPage] = useState(1);
  const [formClient, setFormClient] = useState<Client | null | undefined>(undefined);
  const [detailClientId, setDetailClientId] = useState<number | null>(null);
  const debouncedSearch = useDebouncedValue(search, 350);
  const user = useAuthStore((state) => state.user);
  const clientsQuery = useClients({
    page,
    pageSize: 20,
    search: debouncedSearch || undefined,
    tipo: tab === 'all' ? undefined : tab,
  });

  const canCreate = Boolean(user && (hasUserPermission(user, 'comercial', 'create') || hasUserPermission(user, 'taller', 'create')));
  const canEdit = Boolean(user && (hasUserPermission(user, 'comercial', 'update') || hasUserPermission(user, 'taller', 'update')));
  const canDelete = Boolean(user && hasUserPermission(user, 'comercial', 'delete'));

  useEffect(() => {
    setPage(1);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (debouncedSearch) next.set('search', debouncedSearch);
      else next.delete('search');
      return next;
    }, { replace: true });
  }, [debouncedSearch, setSearchParams]);

  const changeTab = (nextTab: ClientTab): void => {
    setTab(nextTab);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Gestión comercial</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-blue sm:text-3xl">Clientes</h1>
        </div>
        {canCreate && (
          <button
            type="button"
            className="group inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-yellow px-4 text-sm font-bold text-brand-dark shadow-sm transition-all hover:bg-yellow-400 hover:shadow-md active:scale-95"
            onClick={() => setFormClient(null)}
          >
            <AnimateIcon icon={Plus} animation="spin" size={16} /> Nuevo cliente
          </button>
        )}
      </header>

      <div className="flex flex-col gap-3 border-y border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1" role="tablist" aria-label="Tipo de cliente">
          {tabs.map((item) => {
            const isActive = tab === item.value;
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`relative h-9 rounded-lg px-3 text-sm font-semibold transition-colors ${
                  isActive ? 'text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
                onClick={() => changeTab(item.value)}
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
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          <span className="sr-only">Buscar clientes</span>
          <input className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, RUT o email" />
        </label>
      </div>

      <section className="overflow-hidden border border-slate-200 bg-white" aria-label="Listado de clientes">
        {clientsQuery.isError && (
          <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {getApiErrorMessage(clientsQuery.error, 'No fue posible cargar los clientes')}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-brand-blue text-xs uppercase text-white">
              <tr>
                <th className="px-4 py-3 font-semibold">RUT / Identificación</th>
                <th className="px-4 py-3 font-semibold">Nombre / Razón social</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Teléfono</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 text-center font-semibold">Autos</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clientsQuery.isPending ? (
                <TableSkeleton />
              ) : (
                clientsQuery.data?.items.map((client, index) => (
                  <AnimatedTableRow
                    key={client.id}
                    index={index}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-700">{client.rut ?? '—'}</td>
                    <td className="max-w-64 px-4 py-3 font-semibold text-slate-900"><span className="block truncate">{client.nombre}</span></td>
                    <td className="px-4 py-3"><span className={`rounded px-2 py-1 text-xs font-semibold ${client.tipo === 'empresa' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>{client.tipo === 'empresa' ? 'Empresa' : 'Persona'}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{client.telefono ?? '—'}</td>
                    <td className="max-w-56 px-4 py-3 text-slate-600"><span className="block truncate">{client.email ?? '—'}</span></td>
                    <td className="px-4 py-3 text-center font-semibold text-slate-700">{client.vehiclesCount ?? client.vehicles?.length ?? '—'}</td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="group flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-brand-blue transition-colors"
                        onClick={() => setDetailClientId(client.id)}
                        aria-label={`Ver ${client.nombre}`}
                        title="Ver detalle"
                      >
                        <AnimateIcon icon={Eye} animation="hover-lift" size={16} />
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          className="group flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                          onClick={() => setFormClient(client)}
                          aria-label={`Editar ${client.nombre}`}
                          title="Editar"
                        >
                          <AnimateIcon icon={Pencil} animation="wiggle" size={16} />
                        </button>
                      )}
                    </div></td>
                  </AnimatedTableRow>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!clientsQuery.isPending && clientsQuery.data?.items.length === 0 && (
          <div className="flex min-h-52 flex-col items-center justify-center px-4 text-center">
            <AnimateIcon icon={Users} animation="bounce" size={36} className="text-slate-300" />
            <p className="mt-3 font-semibold text-slate-700">No se encontraron clientes</p>
            <p className="mt-1 text-sm text-slate-500">Ajuste la búsqueda o el tipo seleccionado.</p>
          </div>
        )}
        <Pagination page={page} totalPages={clientsQuery.data?.totalPages ?? 0} total={clientsQuery.data?.total ?? 0} onPageChange={setPage} />
      </section>

      {formClient !== undefined && <ClientFormModal client={formClient} onClose={() => setFormClient(undefined)} />}
      {detailClientId !== null && <ClientDetailModal clientId={detailClientId} canDelete={canDelete} canEdit={canEdit} onClose={() => setDetailClientId(null)} onEdit={(client) => { setDetailClientId(null); setFormClient(client); }} />}
    </div>
  );
};

export default ClientsPage;
