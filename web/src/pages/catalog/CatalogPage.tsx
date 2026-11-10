import { UNIT_MEASURE_LABELS } from '@unithor/shared';
import {
  AlertCircle,
  Boxes,
  FileText,
  ListFilter,
  Package,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  Upload,
  Wrench,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import CatalogItemDetailModal from '../../components/catalog/CatalogItemDetailModal';
import CatalogItemModal from '../../components/catalog/CatalogItemModal';
import StockAdjustmentModal from '../../components/catalog/StockAdjustmentModal';
import ImportModal from '../../components/common/ImportModal';
import ModalHeader from '../../components/common/ModalHeader';
import Pagination from '../../components/common/Pagination';
import { useCatalogItems, useDeleteCatalogItemMutation } from '../../hooks/useCatalog';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useModalOverlay } from '../../hooks/useModalOverlay';
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
    label: 'Servicio estándar',
    icon: Wrench,
    className: 'bg-brand-pale text-brand-primaryInk',
  },
  especifico: {
    label: 'Servicio específico',
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
  <div aria-label="Cargando catálogo">
    {Array.from({ length: 6 }, (_, index) => (
      <div key={index} className="inventory-row-skeleton animate-pulse">
        <span />
        <span />
        <span />
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
  const [importOpen, setImportOpen] = useState(false);
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
  const canImport = Boolean(
    user &&
    (hasUserPermission(user, 'taller', 'import') || hasUserPermission(user, 'admin', 'import')),
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
    <div className="workspace-page workspace-catalog inventory-module min-w-0 space-y-5">
      <header className="inventory-page-heading">
        <h1>Catálogo</h1>
        <p>Servicios, trabajos y repuestos</p>
      </header>
      <div className="inventory-toolbar">
        <label className="inventory-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Buscar en catálogo</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Producto, servicio o código"
          />
        </label>
        {canImport && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => setImportOpen(true)}
          >
            <Upload aria-hidden="true" />
            Importar
          </button>
        )}
        {canCreate && (
          <button type="button" className="inventory-primary" onClick={() => setFormItem(null)}>
            <Plus aria-hidden="true" />
            Nuevo item
          </button>
        )}
      </div>
      <div className="inventory-filter-bar">
        <div className="inventory-filters" role="tablist" aria-label="Filtrar catálogo por tipo">
          {tabs.map((entry) => {
            const Icon = entry.value === 'all' ? ListFilter : typeMeta[entry.value].icon;
            return (
              <button
                key={entry.value}
                type="button"
                role="tab"
                aria-label={entry.label}
                title={entry.label}
                aria-selected={tab === entry.value}
                onClick={() => selectTab(entry.value)}
              >
                <Icon aria-hidden="true" />
                {entry.value === 'estandar'
                  ? 'Servicios'
                  : entry.value === 'especifico'
                    ? 'Trabajos'
                    : entry.value === 'parte'
                      ? 'Repuestos'
                      : entry.label}
              </button>
            );
          })}
        </div>
        {tab === 'parte' && (
          <label className="inventory-stock-filter">
            <input
              type="checkbox"
              checked={onlyInStock}
              onChange={(event) => setOnlyInStock(event.target.checked)}
            />
            Solo con stock disponible
          </label>
        )}
      </div>
      <p className="inventory-result-count" role="status">
        {catalogQuery.isPending ? (
          'Cargando catálogo…'
        ) : (
          <>
            <strong>{catalogQuery.data?.total ?? 0}</strong> items
          </>
        )}
      </p>
      <section
        className="inventory-directory"
        aria-label="Listado de catálogo"
        aria-busy={catalogQuery.isFetching}
      >
        {(catalogQuery.isError || deleteMutation.isError) && (
          <div className="inventory-alert" role="alert">
            <AlertCircle aria-hidden="true" />
            {getApiErrorMessage(catalogQuery.error ?? deleteMutation.error)}
          </div>
        )}
        {catalogQuery.isPending ? (
          <CatalogSkeleton />
        ) : (
          catalogQuery.data?.items.map((item, index) => {
            const meta = typeMeta[item.tipo];
            const TypeIcon = meta.icon;
            return (
              <article
                key={item.id}
                className="inventory-catalog-row"
                onClick={() => setDetailItem(item)}
              >
                <span
                  className="inventory-row-number"
                  aria-label={'Registro ' + ((page - 1) * PAGE_SIZE + index + 1)}
                >
                  {(page - 1) * PAGE_SIZE + index + 1}
                </span>
                <button
                  type="button"
                  className="inventory-record-link"
                  onClick={() => setDetailItem(item)}
                  aria-label={'Ver detalle de ' + item.nombre}
                >
                  <TypeIcon aria-hidden="true" />
                  <span>
                    <strong>{item.nombre}</strong>
                    <small>{item.codigo ?? 'SIN CÓDIGO'}</small>
                  </span>
                </button>
                <div className="inventory-catalog-kind">
                  <span>{meta.label}</span>
                  <small>{UNIT_MEASURE_LABELS[item.unidadMedida]}</small>
                </div>
                <div className="inventory-catalog-numbers">
                  <div>
                    <small>Precio de venta</small>
                    <strong>{formatClp(item.precio)}</strong>
                  </div>
                  <div data-testid={'stock-' + item.id}>
                    <small>{item.tipo === 'parte' ? 'Stock total' : 'Inventario'}</small>
                    <AvailabilityBadge item={item} />
                  </div>
                </div>
                <div className="inventory-row-actions" onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    aria-label={'Abrir ficha de ' + item.nombre}
                    title="Ver ficha"
                    onClick={() => setDetailItem(item)}
                  >
                    <FileText aria-hidden="true" />
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={'Editar ' + item.nombre}
                      title="Editar"
                      onClick={() => setFormItem(item)}
                    >
                      <Pencil aria-hidden="true" />
                    </button>
                  )}
                  {canAdjustStock && item.tipo === 'parte' && (
                    <button
                      type="button"
                      aria-label={'Ajustar stock de ' + item.nombre}
                      title="Registrar movimiento"
                      onClick={() => setStockItem(item)}
                    >
                      <Boxes aria-hidden="true" />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      className="inventory-delete-action"
                      aria-label={'Eliminar ' + item.nombre}
                      title="Eliminar"
                      onClick={() => {
                        deleteMutation.reset();
                        setDeleteItem(item);
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
        {!catalogQuery.isPending && catalogQuery.data?.items.length === 0 && (
          <div className="inventory-empty">
            <PackageOpen aria-hidden="true" />
            <h2>No se encontraron items</h2>
            <p>Cambie los filtros o registre un nuevo elemento.</p>
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
      {importOpen && <ImportModal target="catalog" onClose={() => setImportOpen(false)} />}
      {deleteItem && (
        <CatalogDeleteDialog
          item={deleteItem}
          pending={deleteMutation.isPending}
          error={deleteMutation.error}
          onClose={() => setDeleteItem(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
};

function CatalogDeleteDialog({
  item,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  item: CatalogItem;
  pending: boolean;
  error: unknown;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const setPanelNode = useModalOverlay({ isOpen: true, onClose, isPending: pending });
  return createPortal(
    <div className="reference-modal-overlay inventory-modal-overlay">
      <button
        type="button"
        className="fixed inset-0 bg-[#18273c55] backdrop-blur-sm"
        aria-label="Cancelar eliminación"
        disabled={pending}
        onClick={onClose}
      />
      <section
        ref={setPanelNode}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-busy={pending}
        aria-labelledby="delete-catalog-title"
        className="workspace-dialog reference-dialog inventory-profile-dialog inventory-delete-dialog relative bg-white shadow-2xl"
      >
        <ModalHeader
          id="delete-catalog-title"
          title="Eliminar item"
          onClose={onClose}
          closeDisabled={pending}
        />
        <div className="inventory-profile-body">
          <p className="mb-3 font-semibold text-brand-ink">{item.nombre}</p>
          <p className="text-sm leading-6 text-brand-muted">
            Dejará de estar disponible para nuevas órdenes y cotizaciones. El historial existente se
            conservará.
          </p>
          {Boolean(error) && (
            <p className="inventory-alert mt-3" role="alert">
              {getApiErrorMessage(error)}
            </p>
          )}
        </div>
        <footer className="reference-dialog-footer flex justify-end gap-2">
          <button type="button" className="secondary-button" disabled={pending} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="h-10 rounded-full bg-brand-coralInk px-5 text-sm text-white disabled:opacity-50"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? 'Eliminando…' : 'Eliminar'}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

export default CatalogPage;
