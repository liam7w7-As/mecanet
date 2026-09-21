import { ITEM_OPERATIONAL_STATUS } from '@unithor/shared';
import { Check, LoaderCircle, Plus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { useCatalogItems } from '../../hooks/useWorkOrders';
import { formatClp } from '../../lib/formatters';

import type { CatalogPickerType } from '../../hooks/useWorkOrders';
import type { CatalogItem } from '../../types/entities';
import type { ItemOperationalStatus } from '@unithor/shared';

let itemSequence = 0;

export interface EditableWorkOrderItem {
  key: string;
  catalogItemId: number | null;
  catalogTipo: CatalogItem['tipo'] | null;
  catalogStock: number | null;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  estadoOperativo: ItemOperationalStatus;
  notasOperativas: string;
}

export const createEmptyWorkOrderItem = (): EditableWorkOrderItem => ({
  key: `work-item-${itemSequence += 1}`,
  catalogItemId: null,
  catalogTipo: null,
  catalogStock: null,
  descripcion: '',
  cantidad: '1',
  precioUnitario: '0',
  estadoOperativo: 'pendiente',
  notasOperativas: '',
});

export const getWorkOrderItemSubtotal = (item: EditableWorkOrderItem): number =>
  Math.max(0, Number(item.cantidad) || 0) * Math.max(0, Number(item.precioUnitario) || 0);

export const calculateItemsTotal = (items: EditableWorkOrderItem[]): number =>
  items.reduce((total, item) => total + getWorkOrderItemSubtotal(item), 0);

const ITEM_OPERATIONAL_STATUS_LABELS: Record<ItemOperationalStatus, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  completado: 'Completado',
  omitido: 'Omitido',
};

const CATALOG_TYPE_FILTERS: Array<{ value: CatalogPickerType; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'parte', label: 'Repuestos' },
  { value: 'estandar', label: 'Estándar' },
  { value: 'especifico', label: 'Específicos' },
];

const CATALOG_TYPE_LABELS: Record<string, string> = {
  parte: 'Repuesto',
  estandar: 'Estándar',
  especifico: 'Específico',
};

const toCatalogRow = (catalogItem: CatalogItem): EditableWorkOrderItem => ({
  key: `work-item-${(itemSequence += 1)}`,
  catalogItemId: catalogItem.id,
  catalogTipo: catalogItem.tipo,
  catalogStock: catalogItem.stock,
  descripcion: catalogItem.nombre,
  cantidad: '1',
  precioUnitario: String(catalogItem.precio),
  estadoOperativo: 'pendiente',
  notasOperativas: '',
});

interface CatalogPickerProps {
  index: number;
  item: EditableWorkOrderItem;
  onChange: (patch: Partial<EditableWorkOrderItem>) => void;
}

const CatalogPicker = ({ index, item, onChange }: CatalogPickerProps) => {
  const [isFocused, setFocused] = useState(false);
  const [tipo, setTipo] = useState<CatalogPickerType>('all');
  const catalogQuery = useCatalogItems(item.descripcion, tipo);

  const selectCatalogItem = (catalogItem: CatalogItem): void => {
    onChange({
      catalogItemId: catalogItem.id,
      catalogTipo: catalogItem.tipo,
      catalogStock: catalogItem.stock,
      descripcion: catalogItem.nombre,
      precioUnitario: String(catalogItem.precio),
    });
    setFocused(false);
  };

  return (
    <div className="relative min-w-52">
      <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
      <input
        value={item.descripcion}
        onChange={(event) => onChange({
          descripcion: event.target.value,
          catalogItemId: null,
          catalogTipo: null,
          catalogStock: null,
        })}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-9 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
        placeholder="Servicio, repuesto o trabajo libre"
        aria-label={`Descripción ${index + 1}`}
        autoComplete="off"
      />
      {catalogQuery.isFetching && <LoaderCircle className="absolute right-3 top-3 h-4 w-4 animate-spin text-brand-blue" aria-hidden="true" />}
      {isFocused && catalogQuery.data && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
          <div className="flex flex-wrap gap-1 px-2 py-2" role="group" aria-label="Filtrar catálogo por tipo">
            {CATALOG_TYPE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setTipo(filter.value)}
                className={`rounded-md px-2 py-1 text-[11px] font-bold ${tipo === filter.value ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          {catalogQuery.data.items.length > 0 ? catalogQuery.data.items.map((catalogItem) => (
            <button
              key={catalogItem.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectCatalogItem(catalogItem)}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-800">{catalogItem.nombre}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                  <span className="rounded bg-brand-light px-1.5 py-0.5 font-bold text-brand-blue">
                    {CATALOG_TYPE_LABELS[catalogItem.tipo] ?? catalogItem.tipo}
                  </span>
                  {catalogItem.codigo && <span className="font-mono">{catalogItem.codigo}</span>}
                  {catalogItem.tipo === 'parte' && (
                    <span className={catalogItem.stock > 0 ? 'text-emerald-700' : 'text-red-600'}>
                      Stock: {catalogItem.stock}
                    </span>
                  )}
                </span>
              </span>
              <span className="whitespace-nowrap text-sm font-semibold text-brand-blue">{formatClp(catalogItem.precio)}</span>
            </button>
          )) : <p className="px-3 py-3 text-sm text-slate-500">Sin coincidencias. Puede usar una descripción libre.</p>}
        </div>
      )}
    </div>
  );
};

interface CatalogQuickAddProps {
  items: EditableWorkOrderItem[];
  onAdd: (catalogItem: CatalogItem) => void;
}

const CatalogQuickAdd = ({ items, onAdd }: CatalogQuickAddProps) => {
  const [search, setSearch] = useState('');
  const [tipo, setTipo] = useState<CatalogPickerType>('all');
  const catalogQuery = useCatalogItems(search, tipo);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3" aria-label="Agregar desde catálogo">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand-blue"
            placeholder="Buscar en catálogo: repuesto, servicio estándar o específico"
            aria-label="Buscar en catálogo por nombre o código"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por tipo de catálogo">
          {CATALOG_TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setTipo(filter.value)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-bold ${tipo === filter.value ? 'bg-brand-blue text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100'}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white">
        {catalogQuery.isPending && <p className="px-3 py-3 text-sm text-slate-500">Buscando en catálogo...</p>}
        {!catalogQuery.isPending && (catalogQuery.data?.items.length ?? 0) === 0 && (
          <p className="px-3 py-3 text-sm text-slate-500">Sin resultados. Ajuste la búsqueda o el tipo.</p>
        )}
        {catalogQuery.data?.items.map((catalogItem) => {
          const alreadyAdded = items.some((item) => item.catalogItemId === catalogItem.id);
          return (
            <div key={catalogItem.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-0">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-800">{catalogItem.nombre}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                  <span className="rounded bg-brand-light px-1.5 py-0.5 font-bold text-brand-blue">
                    {CATALOG_TYPE_LABELS[catalogItem.tipo] ?? catalogItem.tipo}
                  </span>
                  {catalogItem.codigo && <span className="font-mono">{catalogItem.codigo}</span>}
                  {catalogItem.tipo === 'parte' && <span>Stock: {catalogItem.stock}</span>}
                  <span className="font-semibold text-brand-blue">{formatClp(catalogItem.precio)}</span>
                </span>
              </span>
              <button
                type="button"
                disabled={alreadyAdded}
                onClick={() => onAdd(catalogItem)}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-brand-blue px-2.5 text-xs font-bold text-brand-blue hover:bg-brand-blue hover:text-white disabled:opacity-50"
                aria-label={alreadyAdded ? `${catalogItem.nombre} ya agregado` : `Agregar ${catalogItem.nombre}`}
              >
                {alreadyAdded ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                {alreadyAdded ? 'Agregado' : 'Agregar'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface WorkOrderItemsEditorProps {
  items: EditableWorkOrderItem[];
  onChange: (items: EditableWorkOrderItem[]) => void;
  errors?: Record<string, string>;
  title?: string;
  description?: string;
  emptyMessage?: string;
  totalLabel?: string;
  totalTestId?: string;
}

export const WorkOrderItemsEditor = ({
  items,
  onChange,
  errors = {},
  title = 'Trabajos y repuestos',
  description = 'Busque en el catálogo o escriba un trabajo particular.',
  emptyMessage = 'La orden puede guardarse sin ítems para realizar un diagnóstico inicial.',
  totalLabel = 'Total estimado',
  totalTestId = 'work-order-total',
}: WorkOrderItemsEditorProps) => {
  const updateItem = (index: number, patch: Partial<EditableWorkOrderItem>): void => {
    onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const removeItem = (index: number): void => {
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleQuickAdd = (catalogItem: CatalogItem): void => {
    if (items.some((item) => item.catalogItemId === catalogItem.id)) {
      return;
    }
    const emptyIndex = items.findIndex((item) => item.descripcion.trim() === '' && item.catalogItemId === null);
    if (emptyIndex >= 0) {
      onChange(items.map((item, itemIndex) => itemIndex === emptyIndex
        ? {
            ...item,
            catalogItemId: catalogItem.id,
            catalogTipo: catalogItem.tipo,
            catalogStock: catalogItem.stock,
            descripcion: catalogItem.nombre,
            precioUnitario: String(catalogItem.precio),
          }
        : item));
      return;
    }
    onChange([...items, toCatalogRow(catalogItem)]);
  };

  const getStockMessage = (item: EditableWorkOrderItem): string | null => {
    if (item.catalogTipo !== 'parte') {
      return null;
    }

    const stock = item.catalogStock ?? 0;
    const cantidad = Number(item.cantidad) || 0;

    if (item.estadoOperativo === 'completado' && cantidad > stock) {
      return `Stock insuficiente: disponible ${stock}, requerido ${cantidad}`;
    }
    if (item.estadoOperativo === 'completado') {
      return `Se descontarán ${cantidad} unidad(es). Disponible: ${stock}`;
    }

    return `Repuesto pendiente de consumo. Disponible: ${stock}`;
  };

  return (
    <section className="border-t border-slate-200 pt-6" aria-labelledby="work-items-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="work-items-title" className="text-lg font-bold text-brand-blue">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-brand-blue px-4 text-sm font-semibold text-brand-blue hover:bg-brand-blue hover:text-white" onClick={() => onChange([...items, createEmptyWorkOrderItem()])}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Añadir ítem
        </button>
      </div>

      <div className="mt-4">
        <CatalogQuickAdd items={items} onAdd={handleQuickAdd} />
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">{emptyMessage}</div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[1080px] text-left">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-3 py-3 font-semibold">Descripción</th><th className="w-28 px-3 py-3 font-semibold">Cantidad</th><th className="w-44 px-3 py-3 font-semibold">Precio unitario</th><th className="w-40 px-3 py-3 font-semibold">Avance</th><th className="w-56 px-3 py-3 font-semibold">Nota operativa</th><th className="w-36 px-3 py-3 text-right font-semibold">Subtotal</th><th className="w-14 px-3 py-3"><span className="sr-only">Eliminar</span></th></tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const stockMessage = getStockMessage(item);
                return (
                <tr key={item.key} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-3">
                    <CatalogPicker index={index} item={item} onChange={(patch) => updateItem(index, patch)} />
                    {errors[`items.${index}.descripcion`] && <p className="mt-1 text-xs text-red-700">{errors[`items.${index}.descripcion`]}</p>}
                    {stockMessage && (
                      <p className={`mt-1 text-xs font-semibold ${stockMessage.startsWith('Stock insuficiente') ? 'text-red-700' : 'text-slate-500'}`}>
                        {stockMessage}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3"><input type="number" min="0.01" step="0.01" value={item.cantidad} onChange={(event) => updateItem(index, { cantidad: event.target.value })} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue" aria-label={`Cantidad ${index + 1}`} /></td>
                  <td className="px-3 py-3"><div className="relative"><span className="absolute left-3 top-2.5 text-sm text-slate-400">$</span><input type="number" min="0" step="1" value={item.precioUnitario} onChange={(event) => updateItem(index, { precioUnitario: event.target.value })} className="h-10 w-full rounded-lg border border-slate-300 pl-7 pr-3 text-sm outline-none focus:border-brand-blue" aria-label={`Precio unitario ${index + 1}`} /></div></td>
                  <td className="px-3 py-3"><select value={item.estadoOperativo} onChange={(event) => updateItem(index, { estadoOperativo: event.target.value as ItemOperationalStatus })} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue" aria-label={`Avance ${index + 1}`}>{ITEM_OPERATIONAL_STATUS.map((status) => <option key={status} value={status}>{ITEM_OPERATIONAL_STATUS_LABELS[status]}</option>)}</select></td>
                  <td className="px-3 py-3"><input type="text" value={item.notasOperativas} onChange={(event) => updateItem(index, { notasOperativas: event.target.value })} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue" placeholder="Checklist, detalle o repuesto usado" aria-label={`Nota operativa ${index + 1}`} /></td>
                  <td className="px-3 py-5 text-right font-semibold text-brand-blue" data-testid={`item-subtotal-${index}`}>{formatClp(getWorkOrderItemSubtotal(item))}</td>
                  <td className="px-3 py-3"><button type="button" className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700" onClick={() => removeItem(index)} aria-label={`Eliminar ítem ${index + 1}`} title="Eliminar ítem"><Trash2 className="h-4 w-4" aria-hidden="true" /></button></td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <div className="w-full max-w-sm border-t-2 border-brand-blue pt-3 text-right">
          <p className="text-xs font-semibold uppercase text-slate-500">{totalLabel}</p>
          <p className="mt-1 text-2xl font-bold text-brand-blue" data-testid={totalTestId}>{formatClp(calculateItemsTotal(items))}</p>
        </div>
      </div>
    </section>
  );
};

export default WorkOrderItemsEditor;
