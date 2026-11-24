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
  Sparkles,
  Trash2,
  Upload,
  Wrench,
  ShoppingBag,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import CatalogItemDetailModal from '../../components/catalog/CatalogItemDetailModal';
import CatalogItemModal from '../../components/catalog/CatalogItemModal';
import DpCatalogPanel from '../../components/catalog/DpCatalogPanel';
import StockAdjustmentModal from '../../components/catalog/StockAdjustmentModal';
import ImportModal from '../../components/common/ImportModal';
import ListExportButtons from '../../components/common/ListExportButtons';
import Pagination from '../../components/common/Pagination';
import { canReadDpCatalog, canReadDpSettings } from '../../components/settings/dp-configuration-ui';
import DpConfigurationPanel from '../../components/settings/DpConfigurationPanel';
import { useCatalogItems, useDeleteCatalogItemMutation } from '../../hooks/useCatalog';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

import type { CatalogItem } from '../../types/entities';
import type { CatalogDivision, CatalogSubtype, CatalogType } from '@unithor/shared';

type CatalogTab = 'all' | CatalogDivision | CatalogType;

const PAGE_SIZE = 20;

const divisionTabs: Array<{ value: CatalogTab; label: string; icon: typeof Package }> = [
  { value: 'all', label: 'Todos', icon: ListFilter },
  { value: 'DP', label: 'D&P (Carrocería / Pintura)', icon: Sparkles },
  { value: 'ACC', label: 'ACC (Repuestos / Accesorios)', icon: Package },
  { value: 'MEC', label: 'MEC (Mecánica)', icon: Wrench },
];

const AvailabilityBadge = ({ item }: { item: CatalogItem }) => {
  if (item.division === 'DP') {
    return (
      <span className="catalog-availability rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700">
        D&P · {item.horasHombreEstandar ?? 0} hrs
      </span>
    );
  }

  if (item.division === 'ACC' || item.tipo === 'parte') {
    if (item.subtipo === 'a_pedido') {
      return (
        <span className="catalog-availability rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
          A pedido
        </span>
      );
    }
    if (item.stock === 0) {
      return (
        <span className="catalog-availability catalog-availability--empty">
          Sin stock
        </span>
      );
    }
    if (item.stock <= item.stockMinimo || item.stock <= 5) {
      return (
        <span className="catalog-availability catalog-availability--low">
          Crítico · {item.stock}
        </span>
      );
    }
    return (
      <span className="catalog-availability catalog-availability--available">
        {item.stock} unidades
      </span>
    );
  }

  if (item.subtipo === 'especifico' || item.tipo === 'especifico') {
    return (
      <span className="catalog-availability rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
        Diagnóstico ($1 ref)
      </span>
    );
  }

  return (
    <span className="catalog-availability catalog-availability--service">
      {item.horasHombreEstandar ? `${item.horasHombreEstandar} hrs` : 'Servicio'}
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
  const [accSubtype, setAccSubtype] = useState<'all' | 'en_stock' | 'a_pedido'>('all');
  const [mecSubtype, setMecSubtype] = useState<'all' | 'estandar' | 'especifico'>('all');
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [page, setPage] = useState(1);
  const [detailItem, setDetailItem] = useState<CatalogItem | null>(null);
  const [formItem, setFormItem] = useState<CatalogItem | null | undefined>(undefined);
  const [stockItem, setStockItem] = useState<CatalogItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<CatalogItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [dpCatalogOpen, setDpCatalogOpen] = useState(false);
  const [dpSettingsOpen, setDpSettingsOpen] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 350);
  const user = useAuthStore((state) => state.user);

  // Normalizar división y tipo según tab para compatibilidad
  const resolvedDivision: CatalogDivision | undefined =
    tab === 'DP' ? 'DP' : tab === 'ACC' || tab === 'parte' ? 'ACC' : tab === 'MEC' ? 'MEC' : undefined;

  const resolvedTipo: CatalogType | undefined =
    tab === 'estandar'
      ? 'estandar'
      : tab === 'parte'
        ? 'parte'
        : tab === 'especifico'
          ? 'especifico'
          : undefined;

  const resolvedSubtipo: CatalogSubtype | undefined =
    resolvedDivision === 'ACC' && accSubtype !== 'all'
      ? accSubtype
      : resolvedDivision === 'MEC' && mecSubtype !== 'all'
        ? mecSubtype
        : undefined;

  const filters = {
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch || undefined,
    division: resolvedDivision,
    tipo: resolvedTipo,
    subtipo: resolvedSubtipo,
    soloConStock: (resolvedDivision === 'ACC' || resolvedTipo === 'parte') && onlyInStock ? true : undefined,
  } satisfies Parameters<typeof useCatalogItems>[0];

  const catalogQuery = useCatalogItems(filters);
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
  const canAdjustStock =
    canViewInventory && Boolean(user && hasUserPermission(user, 'almacen', 'create'));

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, tab, accSubtype, mecSubtype, onlyInStock]);

  const selectTab = (nextTab: CatalogTab): void => {
    setTab(nextTab);
    if (nextTab !== 'ACC' && nextTab !== 'parte') {
      setOnlyInStock(false);
      setAccSubtype('all');
    }
    if (nextTab !== 'MEC') {
      setMecSubtype('all');
    }
  };

  const confirmDelete = (): void => {
    if (!deleteItem || !canDelete || deleteMutation.isPending) return;
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
        <div className="catalog-page-heading-copy">
          <h1>Catálogo de Taller</h1>
          <p>Servicios D&P, Accesorios y Mecánica general</p>
        </div>
        {canReadDpCatalog(user) && (
          <div className="catalog-heading-actions" aria-label="Herramientas D&P">
            <button type="button" className="inventory-secondary catalog-dp-entry" onClick={() => setDpCatalogOpen(true)}>
              <Sparkles aria-hidden="true" />
              Catálogo D&P
            </button>
            {canReadDpSettings(user) && (
              <button type="button" className="inventory-secondary" onClick={() => setDpSettingsOpen(true)} aria-label="Configurar D&P" title="Configurar D&P">
                <Settings2 aria-hidden="true" />
                <span className="catalog-heading-action-label">Configurar D&P</span>
              </button>
            )}
          </div>
        )}
      </header>

      <div className="inventory-toolbar flex-wrap">
        <label className="inventory-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Buscar en catálogo</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, código o descripción…"
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
          <button
            type="button"
            className="inventory-primary"
            onClick={() => setFormItem(null)}
          >
            <Plus aria-hidden="true" />
            Nuevo item
          </button>
        )}
      </div>

      {/* Tabs principales de división */}
      <div className="inventory-filter-bar flex-col items-start gap-3">
        <div className="inventory-filters flex flex-wrap gap-1" role="tablist" aria-label="Filtrar catálogo por división">
          {divisionTabs.map((entry) => {
            const Icon = entry.icon;
            const isSelected = tab === entry.value;
            return (
              <button
                key={entry.value}
                type="button"
                role="tab"
                aria-label={entry.label}
                title={entry.label}
                aria-selected={isSelected}
                onClick={() => selectTab(entry.value)}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                  isSelected
                    ? 'bg-brand-primaryInk text-white shadow-sm'
                    : 'text-brand-muted hover:bg-brand-pale hover:text-brand-ink'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {entry.label}
              </button>
            );
          })}
        </div>

        {/* Sub-filtros para ACC */}
        {(tab === 'ACC' || tab === 'parte') && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs">
            <span className="font-semibold text-amber-900">Subtipo ACC:</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setAccSubtype('all')}
                className={`rounded px-2.5 py-1 font-medium transition ${
                  accSubtype === 'all'
                    ? 'bg-amber-600 text-white font-semibold'
                    : 'bg-white text-amber-900 hover:bg-amber-100'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setAccSubtype('en_stock')}
                className={`rounded px-2.5 py-1 font-medium transition ${
                  accSubtype === 'en_stock'
                    ? 'bg-amber-600 text-white font-semibold'
                    : 'bg-white text-amber-900 hover:bg-amber-100'
                }`}
              >
                En stock físico
              </button>
              <button
                type="button"
                onClick={() => setAccSubtype('a_pedido')}
                className={`rounded px-2.5 py-1 font-medium transition ${
                  accSubtype === 'a_pedido'
                    ? 'bg-amber-600 text-white font-semibold'
                    : 'bg-white text-amber-900 hover:bg-amber-100'
                }`}
              >
                A pedido (por encargo)
              </button>
            </div>
            {accSubtype !== 'a_pedido' && (
              <label className="inventory-stock-filter ml-auto flex items-center gap-1.5 font-medium text-amber-950">
                <input
                  type="checkbox"
                  checked={onlyInStock}
                  onChange={(event) => setOnlyInStock(event.target.checked)}
                />
                Solo con stock disponible
              </label>
            )}
          </div>
        )}

        {/* Sub-filtros para MEC */}
        {tab === 'MEC' && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand-line/80 bg-brand-pale/60 px-3 py-2 text-xs">
            <span className="font-semibold text-brand-primaryInk">Subtipo MEC:</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setMecSubtype('all')}
                className={`rounded px-2.5 py-1 font-medium transition ${
                  mecSubtype === 'all'
                    ? 'bg-brand-primaryInk text-white font-semibold'
                    : 'bg-white text-brand-ink hover:bg-brand-line/40'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setMecSubtype('estandar')}
                className={`rounded px-2.5 py-1 font-medium transition ${
                  mecSubtype === 'estandar'
                    ? 'bg-brand-primaryInk text-white font-semibold'
                    : 'bg-white text-brand-ink hover:bg-brand-line/40'
                }`}
              >
                Servicios estándar
              </button>
              <button
                type="button"
                onClick={() => setMecSubtype('especifico')}
                className={`rounded px-2.5 py-1 font-medium transition ${
                  mecSubtype === 'especifico'
                    ? 'bg-brand-primaryInk text-white font-semibold'
                    : 'bg-white text-brand-ink hover:bg-brand-line/40'
                }`}
              >
                Específicos / Diagnóstico ($1)
              </button>
            </div>
          </div>
        )}

      </div>

      <div className="catalog-results-bar">
        <p className="inventory-result-count" role="status">
          {catalogQuery.isPending ? (
            'Cargando catálogo…'
          ) : (
            <>
              <strong>{catalogQuery.data?.total ?? 0}</strong> items
            </>
          )}
        </p>
        <ListExportButtons
          target="catalog"
          filters={filters}
          disabled={catalogQuery.isPending || catalogQuery.isError}
        />
      </div>

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
            const isDP = item.division === 'DP';
            const isACC = item.division === 'ACC' || item.tipo === 'parte';
            const isMEC = item.division === 'MEC' || (!isDP && !isACC);

            const divisionBadge = isDP
              ? { text: 'D&P', bg: 'bg-purple-100 text-purple-800 border-purple-200', icon: Sparkles }
              : isACC
                ? { text: 'ACC', bg: 'bg-amber-100 text-amber-900 border-amber-200', icon: Package }
                : { text: 'MEC', bg: 'bg-blue-100 text-blue-900 border-blue-200', icon: Wrench };

            const TypeIcon = divisionBadge.icon;

            const subtipoLabel = isDP
              ? 'Carrocería / Pintura'
              : isACC
                ? item.subtipo === 'a_pedido'
                  ? 'A pedido / Por encargo'
                  : 'En stock físico'
                : item.subtipo === 'especifico' || item.tipo === 'especifico'
                  ? 'Diagnóstico específico'
                  : 'Mecánica estándar';

            return (
              <article
                key={item.id}
                className="inventory-catalog-row"
                data-catalog-type={item.tipo}
                data-catalog-division={item.division ?? (isACC ? 'ACC' : isDP ? 'DP' : 'MEC')}
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
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold ${divisionBadge.bg}`}>
                      {divisionBadge.text}
                    </span>
                    <span className="text-xs text-brand-ink font-medium">{subtipoLabel}</span>
                  </div>
                  <small>{UNIT_MEASURE_LABELS[item.unidadMedida]}</small>
                </div>

                <div className="inventory-catalog-numbers">
                  <div>
                    <small>Precio de venta</small>
                    <strong>
                      {formatClp(item.precio)}
                      {item.subtipo === 'especifico' && ' (Ref)'}
                    </strong>
                  </div>
                  <div data-testid={'stock-' + item.id}>
                    <small>{isACC ? 'Disponibilidad' : 'Horas / Estado'}</small>
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
                  {canAdjustStock && isACC && item.subtipo !== 'a_pedido' && (
                    <button
                      type="button"
                      aria-label={'Ajustar stock de ' + item.nombre}
                      title="Registrar movimiento de stock"
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
            <p>Cambie los filtros o registre un nuevo elemento en esta división.</p>
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
      {dpCatalogOpen && <DpCatalogPanel onClose={() => setDpCatalogOpen(false)} />}
      {dpSettingsOpen && <DpConfigurationPanel onClose={() => setDpSettingsOpen(false)} />}

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

interface CatalogDeleteDialogProps {
  item: CatalogItem;
  pending: boolean;
  error: unknown;
  onClose: () => void;
  onConfirm: () => void;
}

const CatalogDeleteDialog = ({
  item,
  pending,
  error,
  onClose,
  onConfirm,
}: CatalogDeleteDialogProps) => (
  <div
    className="reference-modal-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="delete-dialog-title"
  >
    <div className="reference-dialog max-w-md rounded-xl bg-white p-6 shadow-xl">
      <h2 id="delete-dialog-title" className="text-lg font-bold text-brand-ink">
        ¿Eliminar ítem del catálogo?
      </h2>
      <p className="mt-2 text-sm text-brand-muted">
        Está a punto de eliminar <strong>{item.nombre}</strong> ({item.codigo ?? 'Sin código'}).
        Esta acción es irreversible y no se permitirá si el ítem posee stock o movimientos asociados.
      </p>
      {Boolean(error) && (
        <div className="mt-3 rounded-lg border border-brand-coral/30 bg-brand-coralPale p-3 text-xs text-brand-coralInk">
          {getApiErrorMessage(error)}
        </div>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          className="rounded-lg border border-brand-line px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-pale"
          onClick={onClose}
          disabled={pending}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="rounded-lg bg-brand-coralInk px-4 py-2 text-sm font-semibold text-white hover:bg-brand-coralInk/90 disabled:opacity-50"
          onClick={onConfirm}
          disabled={pending}
        >
          {pending ? 'Eliminando…' : 'Sí, eliminar'}
        </button>
      </div>
    </div>
  </div>
);

export default CatalogPage;
