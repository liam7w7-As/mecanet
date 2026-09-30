import {
  AlertCircle,
  Boxes,
  ChevronRight,
  Package,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import CatalogItemDetailModal from '../../components/catalog/CatalogItemDetailModal';
import CatalogItemModal from '../../components/catalog/CatalogItemModal';
import StockAdjustmentModal from '../../components/catalog/StockAdjustmentModal';
import Pagination from '../../components/common/Pagination';
import { useCatalogItems, useDeleteCatalogItemMutation } from '../../hooks/useCatalog';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

import type { CatalogItem } from '../../types/entities';
import type { CatalogType } from '@unithor/shared';

type CatalogTab = 'all' | CatalogType;

const PAGE_SIZE = 20;

const tabs: Array<{ value: CatalogTab; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'estandar', label: 'Servicios Estándar' },
  { value: 'parte', label: 'Repuestos / Partes' },
  { value: 'especifico', label: 'Servicios Específicos' },
];

const typeMeta: Record<CatalogType, { label: string; icon: typeof Package; className: string }> = {
  parte: {
    label: 'Repuesto',
    icon: Package,
    className: 'bg-brand-goldPale text-brand-goldInk',
  },
  estandar: {
    label: 'Estándar',
    icon: Wrench,
    className: 'bg-brand-pale text-brand-primaryInk',
  },
  especifico: {
    label: 'Específico',
    icon: Settings2,
    className: 'bg-brand-pale text-brand-primaryInk',
  },
};

const AvailabilityBadge = ({ item }: { item: CatalogItem }) => {
  if (item.tipo !== 'parte') {
    return <span className="text-xs font-semibold text-brand-muted">Sin inventario</span>;
  }
  if (item.stock === 0) {
    return (
      <span className="inline-flex rounded-md bg-brand-coralPale px-2 py-1 text-xs font-bold text-brand-coralInk">
        Sin stock
      </span>
    );
  }
  if (item.stock <= item.stockMinimo || item.stock <= 5) {
    return (
      <span className="inline-flex rounded-md bg-brand-goldPale px-2 py-1 text-xs font-bold text-brand-goldInk">
        Crítico · {item.stock}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-md bg-brand-mintPale px-2 py-1 text-xs font-bold text-brand-mintInk">
      {item.stock} unidades
    </span>
  );
};

const CatalogSkeleton = () => (
  <div className="divide-y divide-brand-line">
    {Array.from({ length: 7 }, (_, row) => (
      <div
        key={row}
        className="grid gap-3 px-4 py-4 md:grid-cols-[48px_minmax(0,1.5fr)_130px_130px_130px_110px] md:items-center"
      >
        {Array.from({ length: 6 }, (_, cell) => (
          <div key={cell} className="h-4 animate-pulse rounded bg-brand-pale" />
        ))}
      </div>
    ))}
  </div>
);

export const CatalogPage = () => {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<CatalogTab>('all');
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [page, setPage] = useState(1);
  const [detailItem, setDetailItem] = useState<CatalogItem | null>(null);
  const [formItem, setFormItem] = useState<CatalogItem | null | undefined>(undefined);
  const [stockItem, setStockItem] = useState<CatalogItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<CatalogItem | null>(null);
  const debouncedSearch = useDebouncedValue(search, 350);
  const user = useAuthStore((state) => state.user);
  const catalogQuery = useCatalogItems({
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch || undefined,
    tipo: tab === 'all' ? undefined : tab,
    soloConStock: tab === 'parte' && onlyInStock ? true : undefined,
  });
  const deleteMutation = useDeleteCatalogItemMutation();
  const canCreate = Boolean(
    user &&
    (hasUserPermission(user, 'taller', 'create') || hasUserPermission(user, 'admin', 'create')),
  );
  const canEdit = Boolean(
    user &&
    (hasUserPermission(user, 'taller', 'update') || hasUserPermission(user, 'admin', 'update')),
  );
  const canDelete = Boolean(
    user &&
    (hasUserPermission(user, 'taller', 'delete') || hasUserPermission(user, 'admin', 'delete')),
  );
  const canViewInventory = Boolean(user && hasUserPermission(user, 'almacen', 'read'));
  const canAdjustStock = Boolean(user && hasUserPermission(user, 'almacen', 'create'));

  useEffect(() => setPage(1), [debouncedSearch, tab, onlyInStock]);

  const selectTab = (nextTab: CatalogTab): void => {
    setTab(nextTab);
    if (nextTab !== 'parte') setOnlyInStock(false);
  };

  const confirmDelete = (): void => {
    if (!deleteItem) return;
    deleteMutation.mutate(deleteItem.id, {
      onSuccess: () => {
        if (detailItem?.id === deleteItem.id) setDetailItem(null);
        setDeleteItem(null);
      },
    });
  };

  return (
    <div className="min-w-0 space-y-5">
      <header className="page-banner">
        <div className="min-w-0">
          <p className="text-sm text-brand-muted">Servicios, trabajos y repuestos</p>
          <h1 className="mt-1">Catálogo</h1>
        </div>
        {canCreate && (
          <button
            type="button"
            className="primary-button relative z-[1] ml-auto"
            onClick={() => setFormItem(null)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nuevo item
          </button>
        )}
      </header>

      <section
        className="overflow-hidden rounded-lg border border-brand-line bg-white shadow-sm"
        aria-label="Listado de catálogo"
      >
        <div className="space-y-4 border-b border-brand-line p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="relative block w-full max-w-xl">
              <span className="sr-only">Buscar en catálogo</span>
              <Search
                className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-brand-muted"
                aria-hidden="true"
              />
              <input
                className="h-10 w-full rounded-lg border border-brand-line pl-9 pr-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Código, servicio o repuesto"
                aria-label="Buscar en catálogo"
              />
            </label>
            <p className="text-sm text-brand-muted">
              <strong className="text-brand-ink">{catalogQuery.data?.total ?? 0}</strong> resultados
            </p>
          </div>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div
              className="grid grid-cols-2 gap-1 sm:flex sm:overflow-x-auto sm:border-b sm:border-brand-line"
              role="tablist"
              aria-label="Filtrar catálogo por tipo"
            >
              {tabs.map((catalogTab) => {
                const isSelected = tab === catalogTab.value;
                return (
                  <button
                    key={catalogTab.value}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    className={`min-h-10 rounded-md px-2 text-xs font-semibold transition-colors sm:h-10 sm:shrink-0 sm:rounded-none sm:border-b-2 sm:px-3 sm:text-sm ${
                      isSelected
                        ? 'bg-brand-primaryInk text-white sm:border-brand-primaryInk sm:bg-transparent sm:text-brand-primaryInk'
                        : 'bg-brand-pale text-brand-muted hover:bg-brand-line sm:border-transparent sm:bg-transparent sm:text-brand-muted sm:hover:bg-transparent sm:hover:text-brand-ink'
                    }`}
                    onClick={() => selectTab(catalogTab.value)}
                  >
                    {catalogTab.label}
                  </button>
                );
              })}
            </div>
            {tab === 'parte' && (
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-brand-ink">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-brand-line accent-brand-primary"
                  checked={onlyInStock}
                  onChange={(event) => setOnlyInStock(event.target.checked)}
                />
                Solo con stock disponible
              </label>
            )}
          </div>
        </div>

        {(catalogQuery.isError || deleteMutation.isError) && (
          <div
            className="flex items-start gap-2 border-b border-brand-coral/30 bg-brand-coralPale p-4 text-sm text-brand-coralInk"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {getApiErrorMessage(catalogQuery.error ?? deleteMutation.error)}
          </div>
        )}

        <div className="hidden grid-cols-[48px_minmax(0,1.5fr)_130px_130px_130px_110px] items-center gap-3 bg-brand-primaryInk px-4 py-3 text-xs font-semibold uppercase text-white md:grid">
          <span>Nº</span>
          <span>Item</span>
          <span>Tipo</span>
          <span className="text-right">Precio</span>
          <span>Disponibilidad</span>
          <span className="text-right">Acciones</span>
        </div>

        {catalogQuery.isPending ? (
          <CatalogSkeleton />
        ) : (
          <div className="divide-y divide-brand-line">
            {catalogQuery.data?.items.map((item, index) => {
              const meta = typeMeta[item.tipo];
              const TypeIcon = meta.icon;
              const number = (page - 1) * PAGE_SIZE + index + 1;
              return (
                <article
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  className="group grid cursor-pointer gap-3 px-4 py-4 outline-none transition-colors hover:bg-brand-line/40 focus-visible:bg-brand-pale focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary md:grid-cols-[48px_minmax(0,1.5fr)_130px_130px_130px_110px] md:items-center"
                  onClick={() => setDetailItem(item)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setDetailItem(item);
                    }
                  }}
                  aria-label={`Ver detalle de ${item.nombre}`}
                >
                  <div className="flex items-center justify-between md:block">
                    <span className="flex h-8 min-w-8 items-center justify-center rounded-md bg-brand-primaryInk px-2 text-xs font-bold text-white">
                      {number}
                    </span>
                    <ChevronRight
                      className="h-4 w-4 text-brand-muted transition-transform group-hover:translate-x-0.5 md:hidden"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.className}`}
                    >
                      <TypeIcon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-brand-ink">{item.nombre}</span>
                      <span className="mt-0.5 block truncate text-xs text-brand-muted">
                        <span className="font-mono font-semibold">
                          {item.codigo ?? 'SIN CÓDIGO'}
                        </span>
                        {item.descripcion ? ` · ${item.descripcion}` : ''}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between md:block">
                    <span className="text-xs font-semibold text-brand-muted md:hidden">Tipo</span>
                    <span
                      className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${meta.className}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between md:block md:text-right">
                    <span className="text-xs font-semibold text-brand-muted md:hidden">Precio</span>
                    <span className="font-bold text-brand-primaryInk">{formatClp(item.precio)}</span>
                  </div>
                  <div
                    className="flex items-center justify-between md:block"
                    data-testid={`stock-${item.id}`}
                  >
                    <span className="text-xs font-semibold text-brand-muted md:hidden">
                      Disponibilidad
                    </span>
                    <AvailabilityBadge item={item} />
                  </div>
                  <div
                    className="flex justify-end gap-1 border-t border-brand-line pt-3 md:border-0 md:pt-0"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {canEdit && (
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-muted hover:bg-brand-pale hover:text-brand-primary"
                        onClick={() => setFormItem(item)}
                        aria-label={`Editar ${item.nombre}`}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    {canAdjustStock && item.tipo === 'parte' && (
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-muted hover:bg-brand-pale hover:text-brand-primaryInk"
                        onClick={() => setStockItem(item)}
                        aria-label={`Ajustar stock de ${item.nombre}`}
                        title="Registrar movimiento"
                      >
                        <Boxes className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-muted hover:bg-brand-coralPale hover:text-brand-coralInk"
                        onClick={() => {
                          deleteMutation.reset();
                          setDeleteItem(item);
                        }}
                        aria-label={`Eliminar ${item.nombre}`}
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!catalogQuery.isPending && catalogQuery.data?.items.length === 0 && (
          <div className="flex min-h-52 flex-col items-center justify-center px-4 text-center">
            <PackageOpen className="h-10 w-10 text-brand-muted/40" aria-hidden="true" />
            <p className="mt-3 font-semibold text-brand-ink">No se encontraron items</p>
            <p className="mt-1 text-sm text-brand-muted">
              Cambie los filtros o registre un nuevo elemento.
            </p>
          </div>
        )}
        <Pagination
          page={page}
          totalPages={catalogQuery.data?.totalPages ?? 0}
          total={catalogQuery.data?.total ?? 0}
          onPageChange={setPage}
        />
      </section>

      {detailItem && (
        <CatalogItemDetailModal
          item={detailItem}
          canEdit={canEdit}
          canAdjustStock={canAdjustStock}
          canViewInventory={canViewInventory}
          onClose={() => setDetailItem(null)}
          onEdit={() => {
            setFormItem(detailItem);
            setDetailItem(null);
          }}
          onAdjustStock={() => {
            setStockItem(detailItem);
            setDetailItem(null);
          }}
        />
      )}
      {formItem !== undefined && (
        <CatalogItemModal item={formItem} onClose={() => setFormItem(undefined)} />
      )}
      {stockItem && <StockAdjustmentModal item={stockItem} onClose={() => setStockItem(null)} />}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
          <button
            type="button"
            className="absolute inset-0 bg-brand-scrim/55 backdrop-blur-sm transition-opacity"
            aria-label="Cancelar eliminación"
            onClick={() => setDeleteItem(null)}
          />
          <section
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-brand-line bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-catalog-title"
          >
            <div className="px-6 pt-6 pb-2">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-coralPale text-brand-coralInk">
                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id="delete-catalog-title" className="text-lg font-bold text-brand-ink">
                    Eliminar item
                  </h2>
                  <p className="mt-0.5 truncate font-mono text-xs text-brand-muted">
                    {deleteItem.codigo ?? 'Sin código'} · {deleteItem.nombre}
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 pt-3">
              <p className="text-sm leading-6 text-brand-muted">
                Dejará de estar disponible para nuevas órdenes y cotizaciones. El historial
                existente se conservará.
              </p>
              {deleteMutation.error && (
                <p className="mt-3 text-sm text-brand-coralInk" role="alert">
                  {getApiErrorMessage(deleteMutation.error)}
                </p>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  className="h-10 rounded-lg border border-brand-line px-4 text-sm font-semibold text-brand-ink hover:bg-brand-pale transition-colors"
                  onClick={() => setDeleteItem(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="h-10 rounded-lg bg-brand-coralInk px-4 text-sm font-semibold text-white hover:bg-brand-coralInk/90 transition-colors disabled:opacity-60"
                  onClick={confirmDelete}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default CatalogPage;
