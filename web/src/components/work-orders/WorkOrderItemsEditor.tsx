import { calculateQuotationPricing, ITEM_OPERATIONAL_STATUS, UNIT_MEASURES, UNIT_MEASURE_LABELS } from '@unithor/shared';
import { Check, ChevronLeft, ChevronRight, LoaderCircle, Minus, Plus, Search, Trash2, Undo2 } from 'lucide-react';
import { useId, useState } from 'react';

import { useCatalogItems } from '../../hooks/useWorkOrders';
import { formatClp } from '../../lib/formatters';
import CurrencyInput from '../common/CurrencyInput';

import type { CatalogItem } from '../../types/entities';
import type { DiscountType, ItemOperationalStatus, UnitMeasure } from '@unithor/shared';

let itemSequence = 0;

export interface EditableWorkOrderItem {
  key: string;
  catalogItemId: number | null;
  catalogTipo: CatalogItem['tipo'] | null;
  catalogStock: number | null;
  descripcion: string;
  tipoLinea: CatalogItem['tipo'];
  unidadMedida: UnitMeasure;
  cantidad: string;
  precioUnitario: string;
  estadoOperativo: ItemOperationalStatus;
  notasOperativas: string;
  descuentoTipo?: DiscountType | null;
  descuentoValor?: string;
}

export const createEmptyWorkOrderItem = (): EditableWorkOrderItem => ({
  key: `work-item-${itemSequence += 1}`,
  catalogItemId: null,
  catalogTipo: null,
  catalogStock: null,
  descripcion: '',
  tipoLinea: 'estandar',
  unidadMedida: 'unidad',
  cantidad: '1',
  precioUnitario: '0',
  estadoOperativo: 'pendiente',
  notasOperativas: '',
});

export const getWorkOrderItemSubtotal = (item: EditableWorkOrderItem): number =>
  Math.max(0, Number(item.cantidad) || 0) * Math.max(0, Number(item.precioUnitario) || 0);

export const calculateItemsTotal = (items: EditableWorkOrderItem[]): number =>
  items.reduce((total, item) => total + getWorkOrderItemSubtotal(item), 0);

const STATUS_LABELS: Record<ItemOperationalStatus, string> = {
  pendiente: 'Pendiente', en_proceso: 'En proceso', completado: 'Completado', omitido: 'Omitido',
};
const TYPE_LABELS = { estandar: 'Estándar', especifico: 'Específicos', parte: 'Repuestos' } as const;
const inputClass = 'h-10 w-full min-w-0 rounded-lg border border-brand-line bg-white px-3 text-sm text-brand-ink outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15';

interface WorkOrderItemsEditorProps {
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
  /**
   * Si es true, los descuentos por línea quedan detrás de un check
   * ("Descuento por línea", apagado por defecto) y solo se ve el descuento
   * general. Al apagar se limpian los descuentos por línea ya puestos para
   * que el total coincida con lo visible.
   */
  discountToggle?: boolean;
}

export const WorkOrderItemsEditor = ({
  items, onChange, errors = {}, title = 'Trabajos y repuestos',
  emptyMessage = 'Sin servicios ni repuestos seleccionados.',
  totalLabel = 'Total estimado', totalTestId = 'work-order-total', showExecution = true,
  showDiscounts = false, showTotal = true, discountToggle = false,
}: WorkOrderItemsEditorProps) => {
  const headingId = useId();
  const [activeType, setActiveType] = useState<CatalogItem['tipo']>('estandar');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lineDiscountsOn, setLineDiscountsOn] = useState(false);
  const showLineDiscounts = showDiscounts && (!discountToggle || lineDiscountsOn);

  const toggleLineDiscounts = (enabled: boolean): void => {
    setLineDiscountsOn(enabled);
    if (!enabled) {
      onChange(items.map((item) => ({ ...item, descuentoTipo: null, descuentoValor: '0' })));
    }
  };
  const [removed, setRemoved] = useState<{ item: EditableWorkOrderItem; index: number } | null>(null);
  const catalogQuery = useCatalogItems(search, activeType, page);

  const updateItem = (key: string, patch: Partial<EditableWorkOrderItem>): void => {
    onChange(items.map((item) => item.key === key ? { ...item, ...patch } : item));
  };
  const removeItem = (key: string): void => {
    const index = items.findIndex((item) => item.key === key);
    if (index < 0) return;
    setRemoved({ item: items[index], index });
    onChange(items.filter((item) => item.key !== key));
  };
  const addCatalogItem = (catalogItem: CatalogItem): void => {
    if (items.some((item) => item.catalogItemId === catalogItem.id)) return;
    const row: EditableWorkOrderItem = {
      ...createEmptyWorkOrderItem(), catalogItemId: catalogItem.id, catalogTipo: catalogItem.tipo,
      catalogStock: catalogItem.stock, descripcion: catalogItem.nombre, tipoLinea: catalogItem.tipo,
      unidadMedida: catalogItem.unidadMedida, precioUnitario: String(catalogItem.precio),
    };
    // Only replace an untouched placeholder; a partially edited row is a user draft.
    const emptyIndex = items.findIndex((item) => !item.descripcion && item.catalogItemId === null
      && item.cantidad === '1' && item.precioUnitario === '0' && !item.notasOperativas
      && item.estadoOperativo === 'pendiente' && item.unidadMedida === 'unidad');
    onChange(emptyIndex < 0 ? [...items, row] : items.map((item, index) => index === emptyIndex ? row : item));
    setRemoved(null);
  };
  const undoRemoval = (): void => {
    if (!removed) return;
    if (!items.some((item) => item.key === removed.item.key
      || (removed.item.catalogItemId !== null && item.catalogItemId === removed.item.catalogItemId))) {
      const next = [...items];
      next.splice(removed.index, 0, removed.item);
      onChange(next);
    }
    setRemoved(null);
  };

  return (
    <section className="min-w-0 space-y-4" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-lg font-bold text-brand-primaryInk">{title}</h2>
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
        {/* Columna fija: al hacer scroll por una selección larga el catálogo
            queda visible para seguir agregando sin volver arriba. */}
        <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <h3 className="mb-3 text-sm font-bold text-brand-ink">Catálogo</h3>
          <div className="flex flex-wrap gap-1 border-b border-brand-line" role="group" aria-label="Tipo de catálogo">
            {(['estandar', 'especifico', 'parte'] as const).map((type) => (
              <button key={type} type="button" aria-pressed={activeType === type}
                onClick={() => { setActiveType(type); setSearch(''); setPage(1); }}
                className={`border-b-2 px-3 py-2 text-sm font-semibold ${activeType === type ? 'border-brand-primaryInk text-brand-primaryInk' : 'border-transparent text-brand-muted hover:text-brand-ink'}`}>
                {TYPE_LABELS[type]}
              </button>
            ))}
          </div>
          <div className="relative my-3">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-brand-muted" aria-hidden="true" />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              className={`${inputClass} pl-9 pr-9`} placeholder="Nombre o código"
              aria-label="Buscar en catálogo por nombre o código" autoComplete="off" />
            {catalogQuery.isFetching && <LoaderCircle className="absolute right-3 top-3 h-4 w-4 animate-spin text-brand-primaryInk" aria-hidden="true" />}
          </div>
          <div className="max-h-64 divide-y divide-brand-line overflow-y-auto border-y border-brand-line xl:max-h-[28rem]" aria-label="Resultados del catálogo">
            {catalogQuery.isPending && <p className="py-4 text-sm text-brand-muted" role="status">Cargando catálogo...</p>}
            {catalogQuery.isError && <div className="py-4 text-sm text-brand-coralInk" role="alert">No se pudo cargar el catálogo. <button type="button" className="underline" onClick={() => void catalogQuery.refetch()}>Reintentar</button></div>}
            {catalogQuery.data?.items.length === 0 && <p className="py-4 text-sm text-brand-muted">No se encontraron ítems.</p>}
            {catalogQuery.data?.items.map((catalogItem) => {
              const selected = items.find((item) => item.catalogItemId === catalogItem.id);
              return (
                <button key={catalogItem.id} type="button" aria-pressed={Boolean(selected)}
                  aria-label={`${selected ? 'Quitar' : 'Agregar'} ${catalogItem.nombre}`}
                  onClick={() => selected ? removeItem(selected.key) : addCatalogItem(catalogItem)}
                  className={`flex w-full items-center gap-3 px-2 py-3 text-left transition-colors focus-visible:outline-brand-primary ${selected ? 'bg-brand-mintPale hover:bg-brand-mintPale' : 'hover:bg-brand-pale'}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border ${selected ? 'border-brand-mintInk bg-brand-mintInk text-white' : 'border-brand-line text-brand-primaryInk'}`}>
                    {selected ? <Check className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold text-brand-ink">{catalogItem.nombre}</span>
                    <span className="mt-1 block text-xs text-brand-muted">{catalogItem.codigo}{catalogItem.tipo === 'parte' ? ` · Stock: ${catalogItem.stock}` : ''}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs font-bold text-brand-primaryInk">{formatClp(catalogItem.precio)}{selected && <span className="mt-1 block text-brand-mintInk">Seleccionado</span>}</span>
                </button>
              );
            })}
          </div>
          {(catalogQuery.data?.totalPages ?? 0) > 1 && <div className="mt-2 flex items-center justify-between gap-2 text-xs text-brand-muted">
            <span>{catalogQuery.data?.total} ítems · Página {page} de {catalogQuery.data?.totalPages}</span>
            <div className="flex gap-1">
              <button type="button" title="Página anterior del catálogo" aria-label="Página anterior del catálogo" disabled={page === 1 || catalogQuery.isFetching}
                className="rounded-lg border border-brand-line p-2 text-brand-primaryInk hover:bg-brand-pale disabled:opacity-30" onClick={() => setPage((current) => current - 1)}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
              <button type="button" title="Página siguiente del catálogo" aria-label="Página siguiente del catálogo" disabled={page >= (catalogQuery.data?.totalPages ?? 1) || catalogQuery.isFetching}
                className="rounded-lg border border-brand-line p-2 text-brand-primaryInk hover:bg-brand-pale disabled:opacity-30" onClick={() => setPage((current) => current + 1)}><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
            </div>
          </div>}
        </div>
        <div className="min-w-0 xl:max-h-[calc(100dvh-14rem)] xl:overflow-y-auto xl:pr-1">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-line pb-3">
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
              <button type="button" className="inline-flex h-9 items-center gap-1 rounded-lg border border-brand-primaryInk px-3 text-sm font-semibold text-brand-primaryInk hover:bg-brand-line/40"
                onClick={() => onChange([...items, { ...createEmptyWorkOrderItem(), tipoLinea: activeType }])}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Ítem libre
              </button>
            </div>
          </div>
          {removed && <div className="flex items-center justify-between gap-2 border-b border-brand-line py-2 text-sm" role="status">
            <span className="truncate text-brand-muted">Quitado: {removed.item.descripcion || 'Ítem libre'}</span>
            <button type="button" onClick={undoRemoval} className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-primaryInk"><Undo2 className="h-4 w-4" aria-hidden="true" />Deshacer</button>
          </div>}
          {items.length === 0 && <p className="py-10 text-center text-sm text-brand-muted">{emptyMessage}</p>}
          <div className="divide-y divide-brand-line">
            {items.map((item, index) => (
              <div key={item.key} className="min-w-0 space-y-3 py-4">
                <div className="flex items-start gap-2">
                  <label className="grid min-w-0 flex-1 gap-1 text-xs font-semibold text-brand-muted">
                    <span>{index + 1}. {TYPE_LABELS[item.tipoLinea]}</span>
                    <input className={inputClass} value={item.descripcion} maxLength={255}
                      aria-label={`Descripción ${index + 1}`} placeholder="Descripción del trabajo"
                      onChange={(event) => updateItem(item.key, { descripcion: event.target.value })} />
                  </label>
                  <button type="button" className="mt-5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-brand-muted hover:bg-brand-coralPale hover:text-brand-coralInk"
                    onClick={() => removeItem(item.key)} aria-label={`Eliminar ítem ${index + 1}`} title="Quitar ítem"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                </div>
                {/* Cantidad y unidad van angostos (3 dígitos como máximo en la
                    práctica); el precio unitario es el único campo largo porque
                    los montos en CLP ocupan varios dígitos. */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-[7rem_8.5rem_minmax(0,1fr)]">
                  <div className="grid gap-1 text-xs font-semibold text-brand-muted"><span>Cantidad</span>
                    <div className="flex h-10 min-w-0 rounded-lg border border-brand-line">
                      <button type="button" className="w-7 shrink-0 text-brand-muted hover:bg-brand-pale disabled:opacity-30" disabled={Number(item.cantidad) <= 1}
                        aria-label={`Reducir cantidad ${index + 1}`} title="Reducir cantidad" onClick={() => updateItem(item.key, { cantidad: String(Math.max(1, Number(item.cantidad) - 1)) })}><Minus className="mx-auto h-3 w-3" aria-hidden="true" /></button>
                      <input type="number" min="1" step="1" value={item.cantidad} aria-label={`Cantidad ${index + 1}`}
                        className="w-full min-w-0 bg-transparent text-center text-sm tabular-nums text-brand-ink outline-brand-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        onChange={(event) => updateItem(item.key, { cantidad: event.target.value })} />
                      <button type="button" className="w-7 shrink-0 text-brand-muted hover:bg-brand-pale" aria-label={`Aumentar cantidad ${index + 1}`} title="Aumentar cantidad"
                        onClick={() => updateItem(item.key, { cantidad: String(Math.max(1, Math.floor(Number(item.cantidad) || 0) + 1)) })}><Plus className="mx-auto h-3 w-3" aria-hidden="true" /></button>
                    </div>
                  </div>
                  <label className="grid gap-1 text-xs font-semibold text-brand-muted">Unidad
                    <select value={item.unidadMedida} onChange={(event) => updateItem(item.key, { unidadMedida: event.target.value as UnitMeasure })} className={inputClass} aria-label={`Unidad del ítem ${index + 1}`}>
                      {UNIT_MEASURES.map((unit) => <option key={unit} value={unit}>{UNIT_MEASURE_LABELS[unit]}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-brand-muted max-sm:col-span-2">Precio unitario
                    <CurrencyInput value={item.precioUnitario} onChange={(value) => updateItem(item.key, { precioUnitario: value })} className={`${inputClass} font-semibold tabular-nums`} aria-label={`Precio unitario ${index + 1}`} />
                  </label>
                </div>
                {showLineDiscounts && <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1 text-xs font-semibold text-brand-muted">Descuento
                    <select className={inputClass} aria-label={`Tipo de descuento ${index + 1}`} value={item.descuentoTipo ?? ''} onChange={(event) => updateItem(item.key, { descuentoTipo: event.target.value ? event.target.value as DiscountType : null, descuentoValor: '0' })}>
                      <option value="">Sin descuento</option><option value="porcentaje">Porcentaje (%)</option><option value="fijo">Monto fijo ($)</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-brand-muted">{item.descuentoTipo === 'porcentaje' ? 'Porcentaje' : 'Monto por línea'}
                    {item.descuentoTipo === 'porcentaje' ? <input type="number" min={0} max={100} step="0.01" className={inputClass} aria-label={`Descuento ${index + 1}`} value={item.descuentoValor ?? '0'} onChange={(event) => updateItem(item.key, { descuentoValor: event.target.value })} />
                      : <CurrencyInput className={`${inputClass} disabled:bg-brand-pale`} aria-label={`Descuento ${index + 1}`} disabled={!item.descuentoTipo} value={item.descuentoValor ?? '0'} onChange={(next) => updateItem(item.key, { descuentoValor: next })} />}
                  </label>
                </div>}
                {Object.entries(errors).filter(([path]) => path.startsWith(`items.${index}.`)).map(([path, message]) => <p key={path} className="text-xs text-brand-coralInk" role="alert">{message}</p>)}
                {showExecution && <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold text-brand-muted">Avance
                    <select value={item.estadoOperativo} onChange={(event) => updateItem(item.key, { estadoOperativo: event.target.value as ItemOperationalStatus })} className={inputClass} aria-label={`Avance ${index + 1}`}>
                      {ITEM_OPERATIONAL_STATUS.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-brand-muted">Nota operativa
                    <input value={item.notasOperativas} onChange={(event) => updateItem(item.key, { notasOperativas: event.target.value })} className={inputClass} maxLength={1000} aria-label={`Nota operativa ${index + 1}`} />
                  </label>
                </div>}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-brand-muted">{item.tipoLinea === 'parte' && item.catalogStock !== null ? `Stock disponible: ${item.catalogStock}` : item.catalogItemId ? 'Del catálogo' : 'Ítem libre'}</span>
                  <span className="text-sm font-bold text-brand-primaryInk" data-testid={`item-subtotal-${index}`}>{(() => {
                    try { return formatClp(showDiscounts ? calculateQuotationPricing([item]).total : getWorkOrderItemSubtotal(item)); } catch { return 'Descuento inválido'; }
                  })()}</span>
                </div>
                {showExecution && item.catalogStock !== null && item.tipoLinea === 'parte' && item.estadoOperativo === 'completado' && Number(item.cantidad) > item.catalogStock && <p className="text-xs text-brand-goldInk">La cantidad supera el stock disponible. Se verificará el consumo al guardar.</p>}
              </div>
            ))}
          </div>
          {showTotal && <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-brand-primaryInk bg-brand-line/40 px-3 py-4">
            <p className="text-sm font-semibold text-brand-muted">{totalLabel}</p>
            <p className="text-xl font-bold text-brand-primaryInk" data-testid={totalTestId}>{formatClp(calculateItemsTotal(items))}</p>
          </div>}
        </div>
      </div>
    </section>
  );
};

export default WorkOrderItemsEditor;
