import { BadgeAlert, BadgeCheck, LoaderCircle, Pencil, Search, Truck } from 'lucide-react';
import { useState } from 'react';

import SupplierFormModal from './SupplierFormModal';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import { useSuppliers } from '../../hooks/usePurchases';
import { useAuthStore } from '../../stores/auth.store';
import ModalHeader from '../common/ModalHeader';
import Pagination from '../common/Pagination';

import type { Supplier } from '../../types/entities';

interface SupplierListModalProps {
  onClose: () => void;
}

export const SupplierListModal = ({ onClose }: SupplierListModalProps) => {
  const user = useAuthStore((state) => state.user);
  const [search, setSearch] = useState('');
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const query = useSuppliers({
    page,
    pageSize: 12,
    search: debouncedSearch || undefined,
    soloIncompletos: onlyIncomplete ? true : undefined,
  });
  const panelRef = useModalOverlay({ isOpen: true, onClose });
  const canEdit = user?.role === 'admin' || user?.role === 'desarrollador';
  const suppliers = query.data?.items ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
      <button
        type="button"
        className="fixed inset-0 bg-brand-scrim/60"
        aria-label="Cerrar proveedores"
        onClick={onClose}
      />
      <section
        ref={panelRef}
        className="relative w-full max-w-4xl rounded-xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="suppliers-modal-title"
      >
        <ModalHeader
          id="suppliers-modal-title"
          title="Proveedores"
          description="Las compras creadas con un nombre nuevo dejan al proveedor con datos incompletos hasta que administración lo complete."
          onClose={onClose}
          badge={<Truck className="h-6 w-6" aria-hidden="true" />}
        />

        <div className="flex flex-col gap-3 border-y border-brand-line bg-brand-pale/40 px-7 py-4 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Buscar proveedor</span>
            <Search
              className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-brand-muted"
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-lg border border-brand-line bg-white pl-9 pr-3 text-sm outline-none focus:border-brand-primary"
              placeholder="Buscar por nombre, RUT, email o teléfono"
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-brand-ink">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-brand-line"
              checked={onlyIncomplete}
              onChange={(event) => {
                setOnlyIncomplete(event.target.checked);
                setPage(1);
              }}
            />
            Solo incompletos
          </label>
        </div>

        <div className="max-h-[58vh] overflow-y-auto">
          {query.isPending ? (
            <p className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-brand-muted">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Cargando proveedores...
            </p>
          ) : suppliers.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-brand-muted">
              <Truck className="mx-auto h-9 w-9 text-brand-muted/40" aria-hidden="true" />
              <p className="mt-2">No hay proveedores que coincidan con el filtro.</p>
            </div>
          ) : (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-brand-line/40 text-xs uppercase text-brand-muted">
                <tr>
                  <th className="px-6 py-3 font-semibold">Proveedor</th>
                  <th className="px-4 py-3 font-semibold">RUT</th>
                  <th className="px-4 py-3 font-semibold">Contacto</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  {canEdit && <th className="px-6 py-3 text-right font-semibold">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr key={supplier.id} className="border-t border-brand-line">
                    <td className="px-6 py-3">
                      <span className="font-semibold text-brand-ink">{supplier.nombre}</span>
                      {supplier.contactoNombre && (
                        <span className="mt-0.5 block text-xs text-brand-muted">
                          {supplier.contactoNombre}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-brand-ink">
                      {supplier.rut ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-brand-muted">
                      <span className="block">{supplier.telefono ?? 'Sin teléfono'}</span>
                      <span className="block">{supplier.email ?? 'Sin email'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {supplier.datosCompletos ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-brand-mintPale px-2 py-1 text-xs font-bold text-brand-mintInk">
                          <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          Completo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-brand-goldPale px-2 py-1 text-xs font-bold text-brand-goldInk">
                          <BadgeAlert className="h-3.5 w-3.5" aria-hidden="true" />
                          Incompleto
                        </span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-6 py-3 text-right">
                        <button
                          type="button"
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-line px-3 text-xs font-semibold text-brand-primaryInk hover:border-brand-primary hover:bg-brand-pale"
                          onClick={() => setEditing(supplier)}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          {supplier.datosCompletos ? 'Editar' : 'Completar'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t border-brand-line px-6 py-2">
          <Pagination
            page={page}
            totalPages={query.data?.totalPages ?? 0}
            total={query.data?.total ?? 0}
            onPageChange={setPage}
          />
        </div>
      </section>

      {editing && (
        <SupplierFormModal supplier={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
};

export default SupplierListModal;
