import { AlertCircle, Boxes, PackageOpen, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { motion } from 'motion/react';
import { AnimateIcon, AnimatedBadge, AnimatedTableRow } from '../../components/animate-ui';
import CatalogItemModal from '../../components/catalog/CatalogItemModal';
import StockAdjustmentModal from '../../components/catalog/StockAdjustmentModal';
import Pagination from '../../components/common/Pagination';
import {
  useCatalogItems,
  useDeleteCatalogItemMutation,
} from '../../hooks/useCatalog';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

import type { CatalogItem } from '../../types/entities';
import type { CatalogType } from '@unithor/shared';

type CatalogTab = 'all' | CatalogType;

const tabs: Array<{ value: CatalogTab; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'estandar', label: 'Servicios Estándar' },
  { value: 'parte', label: 'Repuestos / Partes' },
  { value: 'especifico', label: 'Servicios Específicos' },
];

const typeLabels: Record<CatalogType, string> = {
  parte: 'Repuesto',
  estandar: 'Servicio estándar',
  especifico: 'Servicio específico',
};

const typeStyles: Record<CatalogType, string> = {
  parte: 'bg-amber-100 text-amber-800',
  estandar: 'bg-blue-100 text-brand-blue',
  especifico: 'bg-violet-100 text-violet-800',
};

const AvailabilityBadge = ({ item }: { item: CatalogItem }) => {
  if (item.tipo !== 'parte') {
    return <span className="inline-flex rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">Disponible</span>;
  }
  if (item.stock === 0) {
    return <AnimatedBadge variant="red" pulse>Sin stock</AnimatedBadge>;
  }
  if (item.stock <= 5) {
    return <AnimatedBadge variant="amber" pulse>Stock crítico: {item.stock}</AnimatedBadge>;
  }
  return <AnimatedBadge variant="emerald">{item.stock} unidades</AnimatedBadge>;
};

const CatalogSkeleton = () => (
  <>
    {Array.from({ length: 6 }, (_, row) => (
      <tr key={row} className="border-b border-slate-100">
        {Array.from({ length: 7 }, (_, cell) => <td key={cell} className="px-4 py-4"><div className="h-4 animate-pulse rounded bg-slate-100" /></td>)}
      </tr>
    ))}
  </>
);

export const CatalogPage = () => {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<CatalogTab>('all');
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [page, setPage] = useState(1);
  const [formItem, setFormItem] = useState<CatalogItem | null | undefined>(undefined);
  const [stockItem, setStockItem] = useState<CatalogItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<CatalogItem | null>(null);
  const debouncedSearch = useDebouncedValue(search, 350);
  const user = useAuthStore((state) => state.user);
  const catalogQuery = useCatalogItems({
    page,
    pageSize: 20,
    search: debouncedSearch || undefined,
    tipo: tab === 'all' ? undefined : tab,
    soloConStock: tab === 'parte' && onlyInStock ? true : undefined,
  });
  const deleteMutation = useDeleteCatalogItemMutation();
  const canCreate = Boolean(user && (hasUserPermission(user, 'taller', 'create') || hasUserPermission(user, 'admin', 'create')));
  const canEdit = Boolean(user && (hasUserPermission(user, 'taller', 'update') || hasUserPermission(user, 'admin', 'update')));
  const canDelete = Boolean(user && (hasUserPermission(user, 'taller', 'delete') || hasUserPermission(user, 'admin', 'delete')));

  useEffect(() => setPage(1), [debouncedSearch, tab, onlyInStock]);

  const selectTab = (nextTab: CatalogTab): void => {
    setTab(nextTab);
    if (nextTab !== 'parte') setOnlyInStock(false);
  };

  const confirmDelete = (): void => {
    if (!deleteItem) return;
    deleteMutation.mutate(deleteItem.id, { onSuccess: () => setDeleteItem(null) });
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Operación de taller y bodega</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-blue sm:text-3xl">Catálogo y Repuestos</h1>
        </div>
        {canCreate && (
          <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-yellow px-4 text-sm font-bold text-brand-dark shadow-sm transition-all hover:bg-yellow-400 hover:shadow-md" onClick={() => setFormItem(null)}>
            <AnimateIcon variant="spin" animateOnHover>
              <Plus className="h-4 w-4" aria-hidden="true" />
            </AnimateIcon>
            Nuevo item
          </button>
        )}
      </header>

      <section className="overflow-hidden border border-slate-200 bg-white shadow-sm" aria-label="Listado de catálogo">
        <div className="space-y-4 border-b border-slate-200 p-4">
          <label className="relative block max-w-xl">
            <span className="sr-only">Buscar en catálogo</span>
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none transition-shadow focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por código o nombre" aria-label="Buscar en catálogo" />
          </label>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filtrar catálogo por tipo">
              {tabs.map((catalogTab) => {
                const isSelected = tab === catalogTab.value;
                return (
                  <button
                    key={catalogTab.value}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    className={`relative h-9 shrink-0 rounded-lg px-3 text-sm font-semibold transition-colors ${
                      isSelected ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    onClick={() => selectTab(catalogTab.value)}
                  >
                    {isSelected && (
                      <motion.span
                        layoutId="catalogActiveTabPill"
                        className="absolute inset-0 rounded-lg bg-brand-blue"
                        transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                      />
                    )}
                    <span className="relative z-10">{catalogTab.label}</span>
                  </button>
                );
              })}
            </div>
            {tab === 'parte' && (
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-[#0E2B4E]" checked={onlyInStock} onChange={(event) => setOnlyInStock(event.target.checked)} />
                Solo con stock disponible
              </label>
            )}
          </div>
        </div>

        {(catalogQuery.isError || deleteMutation.isError) && <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{getApiErrorMessage(catalogQuery.error ?? deleteMutation.error)}</div>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-brand-blue text-xs uppercase text-white"><tr><th className="px-4 py-3 font-semibold">Código</th><th className="px-4 py-3 font-semibold">Nombre</th><th className="px-4 py-3 font-semibold">Tipo</th><th className="px-4 py-3 text-right font-semibold">Precio</th><th className="px-4 py-3 text-center font-semibold">Stock</th><th className="px-4 py-3 font-semibold">Disponibilidad</th><th className="px-4 py-3 text-right font-semibold">Acciones</th></tr></thead>
            <tbody>
              {catalogQuery.isPending ? <CatalogSkeleton /> : catalogQuery.data?.items.map((item, index) => (
                <AnimatedTableRow key={item.id} delay={index * 0.02} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3"><span className="inline-flex whitespace-nowrap rounded bg-slate-100 px-2 py-1 font-mono text-xs font-bold text-slate-700">{item.codigo ?? 'S/C'}</span></td>
                  <td className="max-w-72 px-4 py-3"><span className="block truncate font-semibold text-slate-900">{item.nombre}</span><span className="block truncate text-xs text-slate-500">{item.descripcion ?? 'Sin descripción'}</span></td>
                  <td className="px-4 py-3"><span className={`inline-flex whitespace-nowrap rounded px-2 py-1 text-xs font-semibold ${typeStyles[item.tipo]}`}>{typeLabels[item.tipo]}</span></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-800">{formatClp(item.precio)}</td>
                  <td className="px-4 py-3 text-center font-bold text-slate-700" data-testid={`stock-${item.id}`}>{item.tipo === 'parte' ? item.stock : '—'}</td>
                  <td className="px-4 py-3"><AvailabilityBadge item={item} /></td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-1">
                    {canEdit && (
                      <button type="button" className="group flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-700" onClick={() => setFormItem(item)} aria-label={`Editar ${item.nombre}`} title="Editar">
                        <AnimateIcon variant="wiggle" animateOnHover>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </AnimateIcon>
                      </button>
                    )}
                    {canEdit && (
                      <button type="button" className="group flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-30" onClick={() => setStockItem(item)} disabled={item.tipo !== 'parte'} aria-label={`Ajustar stock de ${item.nombre}`} title={item.tipo === 'parte' ? 'Ajustar stock' : 'Solo disponible para repuestos'}>
                        <AnimateIcon variant="bounce" animateOnHover>
                          <Boxes className="h-4 w-4" aria-hidden="true" />
                        </AnimateIcon>
                      </button>
                    )}
                    {canDelete && (
                      <button type="button" className="group flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700" onClick={() => { deleteMutation.reset(); setDeleteItem(item); }} aria-label={`Eliminar ${item.nombre}`} title="Eliminar">
                        <AnimateIcon variant="bounce" animateOnHover>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </AnimateIcon>
                      </button>
                    )}
                  </div></td>
                </AnimatedTableRow>
              ))}
            </tbody>
          </table>
        </div>

        {!catalogQuery.isPending && catalogQuery.data?.items.length === 0 && <div className="flex min-h-52 flex-col items-center justify-center px-4 text-center"><PackageOpen className="h-10 w-10 text-slate-300" aria-hidden="true" /><p className="mt-3 font-semibold text-slate-700">No se encontraron items</p><p className="mt-1 text-sm text-slate-500">Cambie la búsqueda o registre el primer elemento del catálogo.</p></div>}
        <Pagination page={page} totalPages={catalogQuery.data?.totalPages ?? 0} total={catalogQuery.data?.total ?? 0} onPageChange={setPage} />
      </section>

      {formItem !== undefined && <CatalogItemModal item={formItem} onClose={() => setFormItem(undefined)} />}
      {stockItem && <StockAdjustmentModal item={stockItem} onClose={() => setStockItem(null)} />}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button type="button" className="absolute inset-0 bg-slate-950/55" aria-label="Cancelar eliminación" onClick={() => setDeleteItem(null)} />
          <section className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="delete-catalog-title">
            <h2 id="delete-catalog-title" className="text-lg font-semibold text-brand-blue">Eliminar {deleteItem.nombre}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">El item dejará de estar disponible para nuevas órdenes y cotizaciones. Su historial se conservará.</p>
            {deleteMutation.error && <p className="mt-3 text-sm text-red-700" role="alert">{getApiErrorMessage(deleteMutation.error)}</p>}
            <div className="mt-5 flex justify-end gap-2"><button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700" onClick={() => setDeleteItem(null)}>Cancelar</button><button type="button" className="h-10 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60" onClick={confirmDelete} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? 'Eliminando...' : 'Eliminar item'}</button></div>
          </section>
        </div>
      )}
    </div>
  );
};

export default CatalogPage;
