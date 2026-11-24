import {
  calculateQuotationPricing,
  getQuotationGrossTotal,
  ITEM_OPERATIONAL_STATUS,
  UNIT_MEASURES,
  UNIT_MEASURE_LABELS,
  type CatalogDivision,
  type CatalogSubtype,
  type DpQuoteInput,
  type DpWorkQuote,
} from '@unithor/shared';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Minus,
  Plus,
  Search,
  Sparkles,
  Package,
  Wrench,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from 'react';

import DraftItemTeamEditor from './DraftItemTeamEditor';
import { useCatalogItems } from '../../hooks/useWorkOrders';
import { formatClp } from '../../lib/formatters';
import CurrencyInput from '../common/CurrencyInput';

import type { CatalogItem } from '../../types/entities';
import type { DiscountType, ItemOperationalStatus, UnitMeasure } from '@unithor/shared';

// Loaded on demand: D&P brings its own configuration hooks and styles.
const DpCatalogPanel = lazy(() => import('../catalog/DpCatalogPanel'));

let itemSequence = 0;

export interface EditableWorkOrderItem {
  key: string;
  /** Id del ítem existente en la OT; null para ítems nuevos. */
  id?: number | null;
  catalogItemId: number | null;
  catalogTipo: CatalogItem['tipo'] | null;
  catalogStock: number | null;
  division?: CatalogDivision;
  subtipo?: CatalogSubtype;
  esAPedido?: boolean;
  descripcion: string;
  tipoLinea: CatalogItem['tipo'];
  unidadMedida: UnitMeasure;
  cantidad: string;
  precioUnitario: string;
  horasHombreEstimadas: string;
  estadoOperativo: ItemOperationalStatus;
  notasOperativas: string;
  assignedUserId?: number | null;
  teamMembers?: Array<{ userId: number; specialtyId?: number | null; estimatedHours: number | null }>;
  descuentoTipo?: DiscountType | null;
  descuentoValor?: string;
  /** D&P selection sent to the API; the server recalculates and snapshots the tariff. */
  dpPricing?: DpQuoteInput;
  /** Last calculated quote, kept only for the editor preview. */
  dpPricingSnapshot?: DpWorkQuote | null;
}

export const createEmptyWorkOrderItem = (): EditableWorkOrderItem => ({
  key: `work-item-${(itemSequence += 1)}`,
  id: null,
  catalogItemId: null,
  catalogTipo: null,
  catalogStock: null,
  division: 'MEC',
  subtipo: 'estandar',
  esAPedido: false,
  descripcion: '',
  tipoLinea: 'estandar',
  unidadMedida: 'unidad',
  cantidad: '1',
  precioUnitario: '0',
  horasHombreEstimadas: '',
  estadoOperativo: 'pendiente',
  notasOperativas: '',
  assignedUserId: null,
});

/** Neto después del descuento por línea, antes de IVA. */
export const getWorkOrderItemSubtotal = (item: EditableWorkOrderItem): number =>
  calculateQuotationPricing([item]).total;

/** Neto de los ítems; el descuento general y el IVA se aplican fuera de este helper. */
export const calculateItemsTotal = (items: EditableWorkOrderItem[]): number =>
  calculateQuotationPricing(items).total;

const STATUS_LABELS: Record<ItemOperationalStatus, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  completado: 'Completado',
  omitido: 'Omitido',
};

const inputClass =
  'h-10 w-full min-w-0 rounded-lg border border-brand-line bg-white px-3 text-sm text-brand-ink outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15';

interface WorkOrderItemsEditorProps {
  presentation?: 'default' | 'reception';
  items: EditableWorkOrderItem[];
  onChange: (items: EditableWorkOrderItem[]) => void;
  errors?: Record<string, string>;
  title?: string;
  description?: string;
  emptyMessage?: string;
  totalLabel?: string;
  totalTestId?: string;
  showExecution?: boolean;
  showDiscounts?: boolean;
  showTotal?: boolean;
  mechanics?: ReadonlyArray<{ id: number; nombre: string }>;
  isPriceReadOnly?: (item: EditableWorkOrderItem) => boolean;
  discountToggle?: boolean;
}

export const WorkOrderItemsEditor = ({
  presentation = 'default',
  items,
  onChange,
  errors = {},
  title = 'Trabajos y repuestos',
  emptyMessage = 'Sin servicios ni repuestos seleccionados.',
  totalLabel = 'Total estimado',
  totalTestId = 'work-order-total',
  showExecution = true,
  showDiscounts = false,
  showTotal = true,
  discountToggle = false,
  mechanics,
  isPriceReadOnly,
}: WorkOrderItemsEditorProps) => {
  const headingId = useId();

  // División activa para organizar el catálogo en 3 grupos: MEC, ACC, DP
  const [activeDivision, setActiveDivision] = useState<CatalogDivision>('MEC');
  const [mecSubtype, setMecSubtype] = useState<'estandar' | 'especifico'>('estandar');
  const [accSubtype, setAccSubtype] = useState<'all' | 'en_stock' | 'a_pedido'>('all');
  const [dpPickerOpen, setDpPickerOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lineDiscountsOn, setLineDiscountsOn] = useState(false);

  useEffect(() => {
    if (items.some((item) => item.descuentoTipo && Number(item.descuentoValor ?? 0) > 0)) {
      setLineDiscountsOn(true);
    }
  }, [items]);
  const showLineDiscounts = showDiscounts && (!discountToggle || lineDiscountsOn);

  // Flash de entrada: guarda las keys recién agregadas durante 1.2 s
  const [freshKeys, setFreshKeys] = useState<Set<string>>(new Set());
  const freshTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = freshTimers.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const markFresh = useCallback((key: string) => {
    setFreshKeys((prev) => new Set([...prev, key]));
    const existing = freshTimers.current.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      setFreshKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      freshTimers.current.delete(key);
    }, 1200);
    freshTimers.current.set(key, timer);
  }, []);

  const toggleLineDiscounts = (enabled: boolean): void => {
    setLineDiscountsOn(enabled);
    if (!enabled) {
      onChange(items.map((item) => ({ ...item, descuentoTipo: null, descuentoValor: '0' })));
    }
  };

  const [removed, setRemoved] = useState<{ item: EditableWorkOrderItem; index: number } | null>(
    null,
  );

  // Consulta de catálogo según división activa
  const queryDivisionOrType =
    activeDivision === 'DP'
      ? 'DP'
      : activeDivision === 'ACC'
        ? 'ACC'
        : mecSubtype; // En MEC enviamos 'estandar' o 'especifico' para compatibilidad completa

  const querySubtipo =
    activeDivision === 'ACC' && accSubtype !== 'all' ? accSubtype : undefined;

  const catalogQuery = useCatalogItems(
    search,
    queryDivisionOrType,
    page,
    querySubtipo,
    activeDivision !== 'DP',
  );
  const catalogBusy = catalogQuery.isFetching || catalogQuery.isDebouncing;

  const updateItem = (key: string, patch: Partial<EditableWorkOrderItem>): void => {
    onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const removeItem = (key: string): void => {
    const index = items.findIndex((item) => item.key === key);
    if (index < 0) return;
    setRemoved({ item: items[index], index });
    onChange(items.filter((item) => item.key !== key));
    const timer = freshTimers.current.get(key);
    if (timer) {
      clearTimeout(timer);
      freshTimers.current.delete(key);
    }
    setFreshKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const addCatalogItem = (catalogItem: CatalogItem): void => {
    if (items.some((item) => item.catalogItemId === catalogItem.id)) return;

    const isDP = catalogItem.division === 'DP';
    const isACC = catalogItem.division === 'ACC' || catalogItem.tipo === 'parte';
    const division: CatalogDivision =
      catalogItem.division ?? (isACC ? 'ACC' : isDP ? 'DP' : 'MEC');
    const subtipo: CatalogSubtype =
      catalogItem.subtipo ??
      (isACC
        ? 'en_stock'
        : isDP
          ? 'servicio_dp'
          : catalogItem.tipo === 'especifico'
            ? 'especifico'
            : 'estandar');
    const esAPedido = isACC && (subtipo === 'a_pedido' || catalogItem.stock === 0);

    const row: EditableWorkOrderItem = {
      ...createEmptyWorkOrderItem(),
      catalogItemId: catalogItem.id,
      catalogTipo: catalogItem.tipo,
      catalogStock: catalogItem.stock,
      division,
      subtipo,
      esAPedido,
      descripcion: catalogItem.nombre,
      tipoLinea: catalogItem.tipo,
      unidadMedida: catalogItem.unidadMedida,
      precioUnitario: String(catalogItem.precio),
      horasHombreEstimadas:
        catalogItem.horasHombreEstandar === null || catalogItem.horasHombreEstandar === undefined
          ? ''
          : String(catalogItem.horasHombreEstandar),
    };

    const emptyIndex = items.findIndex(
      (item) =>
        !item.descripcion &&
        item.catalogItemId === null &&
        item.cantidad === '1' &&
        item.precioUnitario === '0' &&
        !item.notasOperativas &&
        item.estadoOperativo === 'pendiente' &&
        item.unidadMedida === 'unidad',
    );
    if (emptyIndex >= 0) {
      onChange(items.map((item, index) => (index === emptyIndex ? row : item)));
    } else {
      onChange([row, ...items]);
    }
    markFresh(row.key);
  };

  /** D&P services are priced from the live configuration, never from a catalog row. */
  const addDpService = (quote: DpWorkQuote): void => {
    const target = `${quote.bodyTypeLabel} ${quote.sizeLabel} · ${quote.pieceLabel ?? 'Vehículo completo'}${
      quote.positionLabel ? ` ${quote.positionLabel}` : ''
    }`;
    const operations = quote.lines.map((line) => line.label).join(', ');
    const row: EditableWorkOrderItem = {
      ...createEmptyWorkOrderItem(),
      division: 'DP',
      subtipo: 'servicio_dp',
      tipoLinea: 'estandar',
      descripcion: `${target} — ${operations}`.slice(0, 255),
      unidadMedida: 'unidad',
      precioUnitario: String(quote.precioUnitario),
      dpPricing: quote.selection,
      dpPricingSnapshot: quote,
    };
    const emptyIndex = items.findIndex(
      (item) =>
        !item.descripcion &&
        item.catalogItemId === null &&
        item.cantidad === '1' &&
        item.precioUnitario === '0' &&
        !item.notasOperativas &&
        item.estadoOperativo === 'pendiente' &&
        item.unidadMedida === 'unidad',
    );
    if (emptyIndex >= 0) {
      onChange(items.map((item, index) => (index === emptyIndex ? row : item)));
    } else {
      onChange([row, ...items]);
    }
    markFresh(row.key);
    setDpPickerOpen(false);
  };

  const addFreeItem = (): void => {
    const isACC = activeDivision === 'ACC';
    const isDP = activeDivision === 'DP';
    const tipoLinea = isACC ? 'parte' : activeDivision === 'MEC' && mecSubtype === 'especifico' ? 'especifico' : 'estandar';
    const row: EditableWorkOrderItem = {
      ...createEmptyWorkOrderItem(),
      division: activeDivision,
      subtipo: isACC ? 'en_stock' : isDP ? 'servicio_dp' : mecSubtype,
      tipoLinea,
    };
    onChange([row, ...items]);
    markFresh(row.key);
  };

  const undoRemoval = (): void => {
    if (!removed) return;
    if (
      !items.some(
        (item) =>
          item.key === removed.item.key ||
          (removed.item.catalogItemId !== null && item.catalogItemId === removed.item.catalogItemId),
      )
    ) {
      const next = [...items];
      next.splice(removed.index, 0, removed.item);
      onChange(next);
    }
    setRemoved(null);
  };

  return (
    <section
      className={`${presentation === 'reception' ? 'reception-items ' : ''}min-w-0 space-y-4`}
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="text-lg font-bold text-brand-primaryInk">
        {title}
      </h2>
      <div className="reception-items-layout grid min-w-0 gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)]">
        {/* Columna fija: catálogo */}
        <div className="reception-catalog min-w-0 xl:sticky xl:top-4 xl:self-start">
          <h3 className="mb-3 text-sm font-bold text-brand-ink">Catálogo por División</h3>

          {/* Tabs principales de división */}
          <div
            className="flex flex-wrap gap-1 border-b border-brand-line"
            role="group"
            aria-label="Tipo de catálogo"
          >
            <button
              type="button"
              aria-label="Estándar"
              aria-pressed={activeDivision === 'MEC'}
              onClick={() => {
                setActiveDivision('MEC');
                setSearch('');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
                activeDivision === 'MEC'
                  ? 'border-brand-primaryInk text-brand-primaryInk'
                  : 'border-transparent text-brand-muted hover:text-brand-ink'
              }`}
            >
              <Wrench className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
              MEC · Mecánica
            </button>
            <button
              type="button"
              aria-label="D&P"
              aria-pressed={activeDivision === 'DP'}
              onClick={() => {
                setActiveDivision('DP');
                setSearch('');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
                activeDivision === 'DP'
                  ? 'border-purple-600 text-purple-700'
                  : 'border-transparent text-brand-muted hover:text-brand-ink'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-purple-600" aria-hidden="true" />
              D&P · Carrocería
            </button>
            <button
              type="button"
              aria-label="Repuestos"
              aria-pressed={activeDivision === 'ACC'}
              onClick={() => {
                setActiveDivision('ACC');
                setSearch('');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
                activeDivision === 'ACC'
                  ? 'border-amber-600 text-amber-700'
                  : 'border-transparent text-brand-muted hover:text-brand-ink'
              }`}
            >
              <Package className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
              ACC · Repuestos
            </button>
          </div>

          {/* Subfiltros según la división activa */}
          {activeDivision === 'MEC' && (
            <div className="flex gap-1 border-b border-brand-line/60 bg-brand-pale/40 px-2 py-1.5 text-xs">
              <button
                type="button"
                aria-label="Estándar"
                onClick={() => {
                  setMecSubtype('estandar');
                  setSearch('');
                  setPage(1);
                }}
                className={`rounded px-2.5 py-1 font-semibold transition ${
                  mecSubtype === 'estandar'
                    ? 'bg-brand-primaryInk text-white'
                    : 'text-brand-muted hover:bg-white'
                }`}
              >
                Estándar
              </button>
              <button
                type="button"
                aria-label="Específicos"
                onClick={() => {
                  setMecSubtype('especifico');
                  setSearch('');
                  setPage(1);
                }}
                className={`rounded px-2.5 py-1 font-semibold transition ${
                  mecSubtype === 'especifico'
                    ? 'bg-brand-primaryInk text-white'
                    : 'text-brand-muted hover:bg-white'
                }`}
              >
                Específicos ($1 ref)
              </button>
            </div>
          )}

          {activeDivision === 'ACC' && (
            <div className="flex gap-1 border-b border-brand-line/60 bg-amber-50/50 px-2 py-1.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  setAccSubtype('all');
                  setPage(1);
                }}
                className={`rounded px-2.5 py-1 font-semibold transition ${
                  accSubtype === 'all'
                    ? 'bg-amber-600 text-white'
                    : 'text-amber-900 hover:bg-white'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => {
                  setAccSubtype('en_stock');
                  setPage(1);
                }}
                className={`rounded px-2.5 py-1 font-semibold transition ${
                  accSubtype === 'en_stock'
                    ? 'bg-amber-600 text-white'
                    : 'text-amber-900 hover:bg-white'
                }`}
              >
                En stock
              </button>
              <button
                type="button"
                onClick={() => {
                  setAccSubtype('a_pedido');
                  setPage(1);
                }}
                className={`rounded px-2.5 py-1 font-semibold transition ${
                  accSubtype === 'a_pedido'
                    ? 'bg-amber-600 text-white'
                    : 'text-amber-900 hover:bg-white'
                }`}
              >
                A pedido
              </button>
            </div>
          )}

          {activeDivision === 'DP' ? (
            <div className="mt-3 rounded-2xl border border-purple-200 bg-purple-50/60 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-700 text-white">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-purple-950">Servicio D&P por tarifa</h4>
                  <p className="mt-1 text-xs leading-relaxed text-purple-950/70">
                    Elige carrocería, pieza y operaciones. El precio se calcula con la configuración
                    vigente y el servicio conserva sus cinco etapas.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-purple-700 px-3 text-sm font-semibold text-white transition-colors hover:bg-purple-800"
                onClick={() => setDpPickerOpen(true)}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Agregar servicio D&P
              </button>
              <p className="mt-2 text-center text-[11px] text-purple-950/60">
                Los repuestos de carrocería se agregan desde ACC · Repuestos.
              </p>
            </div>
          ) : <>
          <div className="relative my-3">
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
              className={`${inputClass} pl-9 pr-16`}
              placeholder="Nombre o código"
              aria-label="Buscar en catálogo por nombre o código"
              autoComplete="off"
            />
            {catalogBusy && (
              <LoaderCircle
                className={`absolute top-3 h-4 w-4 animate-spin text-brand-primaryInk ${
                  search ? 'right-10' : 'right-3'
                }`}
                aria-hidden="true"
              />
            )}
            {search && (
              <button
                type="button"
                aria-label="Limpiar búsqueda del catálogo"
                className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded text-brand-muted hover:bg-brand-pale"
                onClick={() => {
                  setSearch('');
                  setPage(1);
                }}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <div
            className="max-h-64 divide-y divide-brand-line overflow-y-auto border-y border-brand-line xl:max-h-[28rem]"
            aria-label="Resultados del catálogo"
            aria-busy={catalogBusy}
          >
            {(catalogQuery.isPending || catalogQuery.isDebouncing) && (
              <p className="py-4 text-sm text-brand-muted" role="status">
                Cargando catálogo...
              </p>
            )}
            {!catalogQuery.isDebouncing && catalogQuery.isError && (
              <div className="py-4 text-sm text-brand-coralInk" role="alert">
                No se pudo cargar el catálogo.{' '}
                <button type="button" className="underline" onClick={() => void catalogQuery.refetch()}>
                  Reintentar
                </button>
              </div>
            )}
            {!catalogBusy && !catalogQuery.isError && catalogQuery.data?.items.length === 0 && (
              <p className="py-4 text-sm text-brand-muted">No se encontraron ítems.</p>
            )}
            {catalogQuery.data?.items.map((catalogItem) => {
              const selected = items.find((item) => item.catalogItemId === catalogItem.id);
              const isDP = catalogItem.division === 'DP';
              const isACC = catalogItem.division === 'ACC' || catalogItem.tipo === 'parte';

              return (
                <button
                  key={catalogItem.id}
                  type="button"
                  aria-pressed={Boolean(selected)}
                  aria-label={`${selected ? 'Quitar' : 'Agregar'} ${catalogItem.nombre}`}
                  onClick={() => (selected ? removeItem(selected.key) : addCatalogItem(catalogItem))}
                  className={`flex w-full items-center gap-3 px-2 py-3 text-left transition-colors focus-visible:outline-brand-primary ${
                    selected ? 'bg-brand-mintPale hover:bg-brand-mintPale' : 'hover:bg-brand-pale'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border transition-colors ${
                      selected
                        ? 'border-brand-mintInk bg-brand-mintInk text-white'
                        : 'border-brand-line text-brand-primaryInk'
                    }`}
                  >
                    {selected ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold text-brand-ink">
                      {catalogItem.nombre}
                    </span>
                    <span className="mt-1 block text-xs text-brand-muted">
                      {catalogItem.codigo ?? 'SIN CÓDIGO'}
                      {isDP && catalogItem.horasHombreEstandar ? ` · ${catalogItem.horasHombreEstandar} HH` : ''}
                      {isACC && (catalogItem.subtipo === 'a_pedido' ? ' · A pedido' : ` · Stock: ${catalogItem.stock}`)}
                      {catalogItem.subtipo === 'especifico' ? ' · Diagnóstico' : ''}
                    </span>
                  </span>
                  <span className="reception-catalog-price shrink-0 text-right text-xs font-bold text-brand-primaryInk">
                    {formatClp(catalogItem.precio)}
                    {selected && <span className="mt-1 block text-brand-mintInk">Agregado</span>}
                  </span>
                </button>
              );
            })}
          </div>

          {(catalogQuery.data?.totalPages ?? 0) > 1 && (
            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-brand-muted">
              <span>
                {catalogQuery.data?.total} ítems · Página {page} de {catalogQuery.data?.totalPages}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  title="Página anterior del catálogo"
                  aria-label="Página anterior del catálogo"
                  disabled={page === 1 || catalogBusy}
                  className="rounded-lg border border-brand-line p-2 text-brand-primaryInk hover:bg-brand-pale disabled:opacity-30"
                  onClick={() => setPage((current) => current - 1)}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  title="Página siguiente del catálogo"
                  aria-label="Página siguiente del catálogo"
                  disabled={page >= (catalogQuery.data?.totalPages ?? 1) || catalogBusy}
                  className="rounded-lg border border-brand-line p-2 text-brand-primaryInk hover:bg-brand-pale disabled:opacity-30"
                  onClick={() => setPage((current) => current + 1)}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
          </>}
        </div>

        {/* Columna derecha: items seleccionados con scroll interno en xl */}
        <div className="reception-selected-items min-w-0 xl:max-h-[calc(100dvh-14rem)] xl:overflow-y-auto xl:pr-1">
          <div className="reception-selection-heading flex flex-wrap items-center justify-between gap-2 border-b border-brand-line pb-3">
            <h3 className="text-sm font-bold text-brand-ink">Selección ({items.length})</h3>
            <div className="flex flex-wrap items-center gap-2">
              {showDiscounts && discountToggle && (
                <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-brand-line px-3 text-xs font-semibold text-brand-muted transition-colors hover:bg-brand-pale has-[:checked]:border-brand-primaryInk has-[:checked]:bg-brand-pale has-[:checked]:text-brand-primaryInk">
                  <input
                    type="checkbox"
                    checked={lineDiscountsOn}
                    onChange={(event) => toggleLineDiscounts(event.target.checked)}
                    className="h-4 w-4 accent-brand-primaryInk"
                  />
                  Descuento por línea
                </label>
              )}
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-brand-primaryInk px-3 text-sm font-semibold text-brand-primaryInk hover:bg-brand-line/40"
                onClick={addFreeItem}
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Ítem libre
              </button>
            </div>
          </div>

          {removed && (
            <div
              className="flex items-center justify-between gap-2 border-b border-brand-line py-2 text-sm"
              role="status"
            >
              <span className="truncate text-brand-muted">
                Quitado: {removed.item.descripcion || 'Ítem libre'}
              </span>
              <button
                type="button"
                onClick={undoRemoval}
                className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-primaryInk"
              >
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                Deshacer
              </button>
            </div>
          )}

          {items.length === 0 && (
            <p className="py-10 text-center text-sm text-brand-muted">{emptyMessage}</p>
          )}

          <AnimatePresence initial={false}>
            {items.map((item, index) => {
              const isFresh = freshKeys.has(item.key);
              const isDP = item.division === 'DP';
              const isACC = item.division === 'ACC' || item.tipoLinea === 'parte';

              return (
                <motion.div
                  key={item.key}
                  layout
                  initial={{ opacity: 0, y: -12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 20, scale: 0.97, transition: { duration: 0.18 } }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className={`reception-item-row min-w-0 space-y-3 border-b border-brand-line py-4 transition-colors duration-700 ${
                    isFresh ? 'bg-brand-mintPale/60' : ''
                  }`}
                  data-item-type={item.tipoLinea}
                  data-item-division={item.division ?? (isACC ? 'ACC' : isDP ? 'DP' : 'MEC')}
                >
                  <div className="flex items-start gap-2">
                    <label className="grid min-w-0 flex-1 gap-1 text-xs font-semibold text-brand-muted">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-brand-line/60 text-[10px] font-black text-brand-muted">
                          {index + 1}
                        </span>
                        {isDP ? (
                          <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-800">
                            D&P
                          </span>
                        ) : isACC ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                            ACC
                          </span>
                        ) : (
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-900">
                            MEC
                          </span>
                        )}
                        <span className="text-xs font-semibold text-brand-ink">
                          {isDP
                            ? 'Carrocería (5 etapas)'
                            : isACC
                              ? item.esAPedido
                                ? 'A pedido / Por encargo'
                                : 'Repuesto en stock'
                              : item.subtipo === 'especifico'
                                ? 'Diagnóstico específico'
                                : 'Mecánica estándar'}
                        </span>
                        {isFresh && (
                          <span className="rounded-full bg-brand-mintInk px-1.5 py-0.5 text-[10px] font-bold text-white">
                            Nuevo
                          </span>
                        )}
                      </span>
                      <input
                        className={inputClass}
                        value={item.descripcion}
                        maxLength={255}
                        aria-label={`Descripción ${index + 1}`}
                        placeholder="Descripción del trabajo o repuesto"
                        onChange={(event) =>
                          updateItem(item.key, { descripcion: event.target.value })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="mt-5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-brand-muted transition-colors hover:bg-brand-coralPale hover:text-brand-coralInk"
                      onClick={() => removeItem(item.key)}
                      aria-label={`Eliminar ítem ${index + 1}`}
                      title="Quitar ítem"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  <div
                    className={`reception-item-values grid grid-cols-2 gap-3 ${
                      isACC
                        ? 'sm:grid-cols-[7rem_8.5rem_minmax(0,1fr)]'
                        : 'sm:grid-cols-[6.5rem_8rem_7rem_minmax(0,1fr)]'
                    }`}
                  >
                    <div className="grid gap-1 text-xs font-semibold text-brand-muted">
                      <span>Cantidad</span>
                      <div className="flex h-10 min-w-0 rounded-lg border border-brand-line">
                        <button
                          type="button"
                          className="w-7 shrink-0 text-brand-muted hover:bg-brand-pale disabled:opacity-30"
                          disabled={Number(item.cantidad) <= 1}
                          aria-label={`Reducir cantidad ${index + 1}`}
                          title="Reducir cantidad"
                          onClick={() =>
                            updateItem(item.key, {
                              cantidad: String(Math.max(1, Number(item.cantidad) - 1)),
                            })
                          }
                        >
                          <Minus className="mx-auto h-3 w-3" aria-hidden="true" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={item.cantidad}
                          aria-label={`Cantidad ${index + 1}`}
                          className="w-full min-w-0 bg-transparent text-center text-sm tabular-nums text-brand-ink outline-brand-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          onChange={(event) =>
                            updateItem(item.key, { cantidad: event.target.value })
                          }
                        />
                        <button
                          type="button"
                          className="w-7 shrink-0 text-brand-muted hover:bg-brand-pale"
                          aria-label={`Aumentar cantidad ${index + 1}`}
                          title="Aumentar cantidad"
                          onClick={() =>
                            updateItem(item.key, {
                              cantidad: String(
                                Math.max(1, Math.floor(Number(item.cantidad) || 0) + 1),
                              ),
                            })
                          }
                        >
                          <Plus className="mx-auto h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <label className="grid gap-1 text-xs font-semibold text-brand-muted">
                      Unidad
                      <select
                        value={item.unidadMedida}
                        onChange={(event) =>
                          updateItem(item.key, { unidadMedida: event.target.value as UnitMeasure })
                        }
                        className={inputClass}
                        aria-label={`Unidad del ítem ${index + 1}`}
                      >
                        {UNIT_MEASURES.map((unit) => (
                          <option key={unit} value={unit}>
                            {UNIT_MEASURE_LABELS[unit]}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!isACC && (
                      <label className="grid gap-1 text-xs font-semibold text-brand-muted">
                        Horas / unidad
                        <input
                          type="number"
                          min="0"
                          step="0.25"
                          value={item.horasHombreEstimadas}
                          className={`${inputClass} tabular-nums`}
                          placeholder="0.5"
                          aria-label={`Horas hombre por unidad del ítem ${index + 1}`}
                          title="Tiempo estimado por unidad (editable)."
                          onChange={(event) =>
                            updateItem(item.key, { horasHombreEstimadas: event.target.value })
                          }
                        />
                      </label>
                    )}
                    <label className="grid gap-1 text-xs font-semibold text-brand-muted max-sm:col-span-2">
                      Precio unitario
                      <CurrencyInput
                        value={item.precioUnitario}
                        disabled={isPriceReadOnly?.(item) || Boolean(item.dpPricing)}
                        onChange={(value) => updateItem(item.key, { precioUnitario: value })}
                        className={`${inputClass} font-semibold tabular-nums`}
                        aria-label={`Precio unitario ${index + 1}`}
                      />
                      {item.dpPricing && (
                        <span className="text-[10px] font-normal text-brand-muted">
                          Calculado con las tarifas D&P vigentes.
                        </span>
                      )}
                    </label>
                  </div>

                  {isDP && item.dpPricingSnapshot && (
                    <p className="rounded-lg border border-purple-100 bg-purple-50/60 px-3 py-2 text-xs text-purple-950/80">
                      <span className="font-semibold">Tarifa aplicada:</span>{' '}
                      {item.dpPricingSnapshot.lines
                        .map((line) => `${line.label} (${formatClp(line.subtotal)})`)
                        .join(' · ')}
                      {' · '}Neto {formatClp(item.dpPricingSnapshot.neto)}
                    </p>
                  )}

                  {showLineDiscounts && (
                    <div className="grid grid-cols-2 gap-3">
                      <label className="grid gap-1 text-xs font-semibold text-brand-muted">
                        Descuento
                        <select
                          className={inputClass}
                          aria-label={`Tipo de descuento ${index + 1}`}
                          value={item.descuentoTipo ?? ''}
                          onChange={(event) =>
                            updateItem(item.key, {
                              descuentoTipo: event.target.value
                                ? (event.target.value as DiscountType)
                                : null,
                              descuentoValor: '0',
                            })
                          }
                        >
                          <option value="">Sin descuento</option>
                          <option value="porcentaje">Porcentaje (%)</option>
                          <option value="fijo">Monto fijo ($)</option>
                        </select>
                      </label>
                      <label className="grid gap-1 text-xs font-semibold text-brand-muted">
                        {item.descuentoTipo === 'porcentaje' ? 'Porcentaje' : 'Monto por línea'}
                        {item.descuentoTipo === 'porcentaje' ? (
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            className={inputClass}
                            aria-label={`Descuento ${index + 1}`}
                            value={item.descuentoValor ?? '0'}
                            onChange={(event) =>
                              updateItem(item.key, { descuentoValor: event.target.value })
                            }
                          />
                        ) : (
                          <CurrencyInput
                            className={`${inputClass} disabled:bg-brand-pale`}
                            aria-label={`Descuento ${index + 1}`}
                            disabled={!item.descuentoTipo}
                            value={item.descuentoValor ?? '0'}
                            onChange={(next) => updateItem(item.key, { descuentoValor: next })}
                          />
                        )}
                      </label>
                    </div>
                  )}

                  {Object.entries(errors)
                    .filter(([path]) => path.startsWith(`items.${index}.`))
                    .map(([path, message]) => (
                      <p key={path} className="text-xs text-brand-coralInk" role="alert">
                        {message}
                      </p>
                    ))}

                  {showExecution && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-xs font-semibold text-brand-muted">
                        Avance
                        <select
                          value={item.estadoOperativo}
                          onChange={(event) =>
                            updateItem(item.key, {
                              estadoOperativo: event.target.value as ItemOperationalStatus,
                            })
                          }
                          className={inputClass}
                          aria-label={`Avance ${index + 1}`}
                        >
                          {ITEM_OPERATIONAL_STATUS.map((status) => (
                            <option key={status} value={status}>
                              {STATUS_LABELS[status]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-xs font-semibold text-brand-muted">
                        Nota operativa
                        <input
                          value={item.notasOperativas}
                          onChange={(event) =>
                            updateItem(item.key, { notasOperativas: event.target.value })
                          }
                          className={inputClass}
                          maxLength={1000}
                          aria-label={`Nota operativa ${index + 1}`}
                        />
                      </label>
                    </div>
                  )}

                  {/* Asignación de mecánico SOLO cuando presentation no es recepción */}
                  {mechanics && presentation !== 'reception' && !isACC && !item.teamMembers && (
                    <label className="grid gap-1 text-xs font-semibold text-brand-muted">
                      Mecánico del servicio
                      <select
                        className={inputClass}
                        aria-label={`Mecánico del servicio ${index + 1}`}
                        value={item.assignedUserId ?? ''}
                        onChange={(event) =>
                          updateItem(item.key, {
                            assignedUserId: event.target.value ? Number(event.target.value) : null,
                          })
                        }
                      >
                        <option value="">Sin asignar por ahora</option>
                        {mechanics.map((mechanic) => (
                          <option key={mechanic.id} value={mechanic.id}>
                            {mechanic.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {mechanics && presentation !== 'reception' && !isACC && (
                    <DraftItemTeamEditor
                      item={item}
                      mechanics={mechanics}
                      onChange={(teamMembers) => updateItem(item.key, { teamMembers })}
                    />
                  )}

                  {/* Subtotal destacado y contexto de división */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-line/30 px-3 py-2">
                    <span className="text-xs text-brand-muted">
                      {isACC ? (
                        item.esAPedido ? (
                          <span className="font-semibold text-blue-700">
                            Repuesto a pedido
                          </span>
                        ) : item.catalogStock !== null ? (
                          `Stock en bodega: ${item.catalogStock}`
                        ) : (
                          'Repuesto libre'
                        )
                      ) : isDP ? (
                        <span className="font-semibold text-purple-700">
                          D&P
                        </span>
                      ) : item.subtipo === 'especifico' ? (
                        <span className="font-semibold text-amber-800">
                          Diagnóstico
                        </span>
                      ) : item.catalogItemId ? (
                        'Servicio de catálogo'
                      ) : (
                        'Ítem libre'
                      )}
                    </span>
                    <span
                      className="text-sm font-bold text-brand-primaryInk"
                      data-testid={`item-subtotal-${index}`}
                    >
                      {(() => {
                        try {
                          return `Subtotal neto: ${formatClp(getWorkOrderItemSubtotal(item))}`;
                        } catch {
                          return 'Importe o descuento inválido';
                        }
                      })()}
                    </span>
                  </div>

                  {showExecution &&
                    item.catalogStock !== null &&
                    isACC &&
                    !item.esAPedido &&
                    item.estadoOperativo === 'completado' &&
                    Number(item.cantidad) > item.catalogStock && (
                      <p className="text-xs text-brand-goldInk">
                        La cantidad supera el stock disponible. Se verificará el consumo al guardar.
                      </p>
                    )}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {showTotal && (
            <div className="reception-items-total flex flex-wrap items-center justify-between gap-2 border-t-2 border-brand-primaryInk bg-brand-line/40 px-3 py-4">
              <p className="text-sm font-semibold text-brand-muted">
                {totalLabel} (IVA incluido)
              </p>
              <p
                className="text-xl font-bold text-brand-primaryInk"
                data-testid={totalTestId}
              >
                {(() => {
                  try {
                    return formatClp(getQuotationGrossTotal(calculateItemsTotal(items)));
                  } catch {
                    return 'Revisa los importes y descuentos';
                  }
                })()}
              </p>
            </div>
          )}
        </div>
      </div>
      {dpPickerOpen && (
        <Suspense fallback={null}>
          <DpCatalogPanel onClose={() => setDpPickerOpen(false)} onAdd={addDpService} />
        </Suspense>
      )}
    </section>
  );
};

export default WorkOrderItemsEditor;
